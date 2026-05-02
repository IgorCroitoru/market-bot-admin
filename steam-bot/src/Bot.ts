import { EventEmitter } from "node:events";
import SteamCommunity from "steamcommunity";
import SteamTotp from "steam-totp";
import TradeOfferManager from "steam-tradeoffer-manager";
import type TradeOffer from "steam-tradeoffer-manager/lib/classes/TradeOffer";
import {
  EAuthSessionGuardType,
  EAuthTokenPlatformType,
  ESessionPersistence,
  LoginSession
} from "steam-session";
import type { AppLogger } from "@market-bot-admin/logging";
import type { BotOptions, SteamTokenPlatform } from "./IOptions";
import type { BotStorage } from "./Persistence";
import type { PollData } from "./PollData";
import { getSteamLoginSecureJwt, getJwtExpirationDate, isJwtExpiringWithin, isJwtUsable } from "./jwt";
import { isRetriableError, withRetries, delay } from "./retry";
import { logger as defaultLogger } from "./logger";
import { createBotStorageFromEnv } from "./storage";

export type BotStatus =
  | "idle"
  | "authenticating"
  | "ready"
  | "refreshing"
  | "stopped"
  | "error";

export interface TradeItem {
  appid: number;
  contextid: string | number;
  assetid?: string;
  id?: string;
  amount?: number;
  [key: string]: unknown;
}

export interface SendTradeOfferRequest {
  partner: string;
  token?: string;
  message?: string;
  itemsToGive?: TradeItem[];
  itemsToReceive?: TradeItem[];
  data?: Record<string, unknown>;
}

export interface SentTradeOffer {
  offer: TradeOffer;
  offerId: string | undefined;
  status: "pending" | "sent";
}

type GuardAction = {
  type: EAuthSessionGuardType;
  detail?: string;
};

type StartSessionResponse = {
  actionRequired: boolean;
  validActions?: GuardAction[];
};

export class Bot extends EventEmitter {
  public readonly community: SteamCommunity;
  public readonly tradeManager: TradeOfferManager;
  public readonly storage: BotStorage;

  private readonly log: AppLogger;
  private readonly options: Required<
    Pick<
      BotOptions,
      | "domain"
      | "language"
      | "pollIntervalMs"
      | "cancelTimeMs"
      | "loginTimeoutMs"
      | "maxLoginRetries"
      | "loginRetryDelayMs"
      | "maxLoginAttemptsWithinPeriod"
      | "loginAttemptPeriodMs"
      | "tokenRefreshIntervalMs"
      | "tokenRefreshSkewMs"
      | "refreshTokenRenewalWindowMs"
      | "tokenPlatform"
    >
  > &
    BotOptions;

  private status: BotStatus = "idle";
  private ready = false;
  private refreshToken: string | null = null;
  private accessToken: string | null = null;
  private cookies: string[] | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private loginAttempts: number[] = [];
  private sessionRefreshInFlight: Promise<void> | null = null;
  private eventsBound = false;

  constructor(options: BotOptions) {
    super();

    this.options = {
      domain: "localhost",
      language: "en",
      pollIntervalMs: 30_000,
      cancelTimeMs: 10 * 60_000,
      loginTimeoutMs: 90_000,
      maxLoginRetries: 3,
      loginRetryDelayMs: 5_000,
      maxLoginAttemptsWithinPeriod: 3,
      loginAttemptPeriodMs: 60_000,
      tokenRefreshIntervalMs: 5 * 60_000,
      tokenRefreshSkewMs: 2 * 60_000,
      refreshTokenRenewalWindowMs: 7 * 24 * 60 * 60_000,
      tokenPlatform: "mobile",
      ...options
    };

    this.log = options.logger ?? defaultLogger;
    this.storage =
      options.storage ??
      createBotStorageFromEnv({
        accountName: options.accountName
      });

    this.community = new SteamCommunity();
    this.tradeManager = new TradeOfferManager({
      community: this.community,
      domain: this.options.domain,
      language: this.options.language,
      pollInterval: -1,
      cancelTime: this.options.cancelTimeMs,
      useAccessToken: true,
      savePollData: false
    });
  }

  get isReady(): boolean {
    return this.ready;
  }

  get currentStatus(): BotStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.ready || this.status === "authenticating") {
      this.log.warn("Steam bot is already starting or ready");
      return;
    }

    this.bindEventHandlers();
    this.setStatus("authenticating");

    await this.restoreState();
    await this.login();

    this.tradeManager.pollInterval = this.options.pollIntervalMs;
    this.tradeManager.doPoll();
    this.startTokenRefreshLoop();
    this.ready = true;
    this.setStatus("ready");
    this.emit("ready", true);
    this.log.info(
      {
        accountName: this.options.accountName,
        pollIntervalMs: this.options.pollIntervalMs
      },
      "Steam bot is ready"
    );
  }

  async stop(): Promise<void> {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }

    this.tradeManager.pollInterval = -1;
    this.tradeManager.shutdown();
    this.ready = false;
    this.setStatus("stopped");
    this.emit("ready", false);
    this.log.info({ accountName: this.options.accountName }, "Steam bot stopped");
  }

  async ensureFreshSession(reason = "scheduled token check"): Promise<void> {
    this.sessionRefreshInFlight ??= this.refreshSession(reason).finally(() => {
      this.sessionRefreshInFlight = null;
    });

    return this.sessionRefreshInFlight;
  }

  async sendTradeOffer(request: SendTradeOfferRequest): Promise<SentTradeOffer> {
    this.assertReady();

    return withRetries(
      () =>
        new Promise<SentTradeOffer>((resolve, reject) => {
          const offer = this.tradeManager.createOffer(request.partner, request.token);

          if (request.itemsToGive?.length) {
            offer.addMyItems(request.itemsToGive as never[]);
          }

        //   if (request.itemsToReceive?.length) {
        //     offer.addTheirItems(request.itemsToReceive as never[]);
        //   }

          if (request.message !== undefined) {
            offer.setMessage(request.message);
          }

          for (const [key, value] of Object.entries(request.data ?? {})) {
            offer.data(key, value);
          }

          offer.send((error, status) => {
            if (error) {
              reject(error);
              return;
            }

            this.log.info(
              {
                offerId: offer.id,
                partner: request.partner,
                status
              },
              "Trade offer sent"
            );
            resolve({ offer, offerId: offer.id, status });
          });
        }),
      {
        attempts: this.options.maxLoginRetries,
        delayMs: this.options.loginRetryDelayMs,
        logger: this.log,
        shouldRetry: isRetriableError
      }
    );
  }

//   async acceptOffer(offerId: string, skipStateUpdate = false): Promise<"pending" | "accepted" | "escrow"> {
//     this.assertReady();
//     const offer = await this.getOffer(offerId);

//     return withRetries(
//       () =>
//         new Promise<"pending" | "accepted" | "escrow">((resolve, reject) => {
//           offer.accept(skipStateUpdate, (error, status) => {
//             if (error) {
//               reject(error);
//               return;
//             }

//             this.log.info({ offerId, status }, "Trade offer accepted");
//             resolve(status);
//           });
//         }),
//       {
//         attempts: this.options.maxLoginRetries,
//         delayMs: this.options.loginRetryDelayMs,
//         logger: this.log,
//         shouldRetry: isRetriableError
//       }
//     );
//   }

//   async declineOffer(offerId: string): Promise<void> {
//     this.assertReady();
//     const offer = await this.getOffer(offerId);

//     await withRetries(
//       () =>
//         new Promise<void>((resolve, reject) => {
//           offer.decline((error) => {
//             if (error) {
//               reject(error);
//               return;
//             }

//             this.log.info({ offerId }, "Trade offer declined");
//             resolve();
//           });
//         }),
//       {
//         attempts: this.options.maxLoginRetries,
//         delayMs: this.options.loginRetryDelayMs,
//         logger: this.log,
//         shouldRetry: isRetriableError
//       }
//     );
//   }

  private async getOffer(offerId: string): Promise<TradeOffer> {
    return new Promise((resolve, reject) => {
      this.tradeManager.getOffer(offerId, (error, offer) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(offer);
      });
    });
  }

  private async restoreState(): Promise<void> {
    const [loginAttempts, pollData, cookies] = await Promise.all([
      this.storage.loadLoginAttempts(),
      this.storage.loadPollData(),
      this.storage.loadCookies()
    ]);

    this.loginAttempts = this.normalizeLoginAttempts(loginAttempts ?? []);

    if (pollData) {
      this.tradeManager.pollData = pollData;
      this.log.info("Restored trade poll data");
    }

    if (this.areCookiesUsable(cookies)) {
      this.cookies = cookies;
      await this.setCookies(cookies);
      this.log.info("Restored valid Steam cookies from storage");
    }
  }

  private async login(): Promise<void> {
    await withRetries(
      async () => {
        await this.waitForLoginSlot();

        const storedRefreshToken = await this.storage.loadRefreshToken();

        if (isJwtUsable(storedRefreshToken, this.options.tokenRefreshSkewMs)) {
          try {
            await this.loginWithRefreshToken(storedRefreshToken);
            return;
          } catch (error) {
            this.log.warn({ err: error }, "Refresh-token login failed");

            if (!isRetriableError(error)) {
              await this.storage.deleteRefreshToken();
              this.refreshToken = null;
            } else {
              throw error;
            }
          }
        }

        await this.loginWithCredentials();
      },
      {
        attempts: this.options.maxLoginRetries,
        delayMs: this.options.loginRetryDelayMs,
        logger: this.log,
        shouldRetry: isRetriableError
      }
    );
  }

  private async loginWithRefreshToken(refreshToken: string): Promise<void> {
    this.recordLoginAttempt();
    this.log.info(
      {
        accountName: this.options.accountName,
        refreshTokenExpiresAt: getJwtExpirationDate(refreshToken)?.toISOString()
      },
      "Logging into Steam with stored refresh token"
    );

    const session = this.createLoginSession();
    session.refreshToken = refreshToken;

    await this.refreshAccessTokenIfNeeded(session, refreshToken);
    const cookies = await session.getWebCookies();
    await this.captureSession(session, cookies);
  }

  private async loginWithCredentials(): Promise<void> {
    if (!this.options.password) {
      throw new Error(
        "No valid refresh token is available and STEAM_PASSWORD was not provided"
      );
    }

    this.recordLoginAttempt();
    this.log.info({ accountName: this.options.accountName }, "Logging into Steam with credentials");

    const session = this.createLoginSession();
    const authenticated = this.waitForAuthenticated(session);

    const startResult = (await session.startWithCredentials({
      accountName: this.options.accountName,
      password: this.options.password,
      persistence: ESessionPersistence.Persistent
    })) as StartSessionResponse;

    if (startResult.actionRequired) {
      await this.handleSteamGuard(session, startResult);
    }

    await authenticated;
    const cookies = await session.getWebCookies();
    await this.captureSession(session, cookies);
  }

  private async refreshSession(reason: string): Promise<void> {
    if (this.status === "stopped") {
      return;
    }

    const refreshToken = this.refreshToken ?? (await this.storage.loadRefreshToken());

    if (!isJwtUsable(refreshToken, this.options.tokenRefreshSkewMs)) {
      this.log.warn({ reason }, "Refresh token is missing or expiring; performing full login");
      await this.login();
      return;
    }

    if (
      this.areCookiesUsable(this.cookies) &&
      isJwtUsable(this.accessToken, this.options.tokenRefreshSkewMs) &&
      !isJwtExpiringWithin(refreshToken, this.options.refreshTokenRenewalWindowMs)
    ) {
      return;
    }

    this.setStatus("refreshing");
    this.log.info({ reason }, "Refreshing Steam web session");

    await this.loginWithRefreshToken(refreshToken);

    if (this.ready) {
      this.setStatus("ready");
    }
  }

  private async refreshAccessTokenIfNeeded(
    session: LoginSession,
    refreshToken: string
  ): Promise<void> {
    if (this.options.tokenPlatform !== "mobile") {
      return;
    }

    if (isJwtExpiringWithin(refreshToken, this.options.refreshTokenRenewalWindowMs)) {
      const renewed = await session.renewRefreshToken();

      if (renewed && session.refreshToken) {
        await this.storage.saveRefreshToken(session.refreshToken);
        this.refreshToken = session.refreshToken;
        this.log.info(
          {
            refreshTokenExpiresAt: getJwtExpirationDate(session.refreshToken)?.toISOString()
          },
          "Steam refresh token renewed"
        );
      }

      this.accessToken = session.accessToken;
      return;
    }

    if (!isJwtUsable(this.accessToken, this.options.tokenRefreshSkewMs)) {
      await session.refreshAccessToken();
      this.accessToken = session.accessToken;
      this.log.debug(
        {
          accessTokenExpiresAt: getJwtExpirationDate(session.accessToken)?.toISOString()
        },
        "Steam access token refreshed"
      );
    }
  }

  private async captureSession(session: LoginSession, cookies: string[]): Promise<void> {
    this.refreshToken = session.refreshToken;
    this.accessToken = session.accessToken;
    this.cookies = cookies;

    if (session.refreshToken) {
      await this.storage.saveRefreshToken(session.refreshToken);
    }

    await this.storage.saveCookies(cookies);
    await this.setCookies(cookies);

    this.log.info(
      {
        accountName: session.accountName || this.options.accountName,
        steamId: session.steamID?.getSteamID64?.(),
        refreshTokenExpiresAt: getJwtExpirationDate(session.refreshToken)?.toISOString(),
        accessTokenExpiresAt: getJwtExpirationDate(session.accessToken)?.toISOString()
      },
      "Steam session established"
    );
  }

  private async setCookies(cookies: string[]): Promise<void> {
    this.community.setCookies(cookies);

    await new Promise<void>((resolve, reject) => {
      this.tradeManager.setCookies(cookies, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async handleSteamGuard(
    session: LoginSession,
    startResult: StartSessionResponse
  ): Promise<void> {
    const actions = startResult.validActions ?? [];
    const deviceCodeAction = actions.find(
      (action) => action.type === EAuthSessionGuardType.DeviceCode
    );
    const emailCodeAction = actions.find(
      (action) => action.type === EAuthSessionGuardType.EmailCode
    );
    const confirmationAction = actions.find(
      (action) =>
        action.type === EAuthSessionGuardType.DeviceConfirmation ||
        action.type === EAuthSessionGuardType.EmailConfirmation
    );

    if (deviceCodeAction && this.options.sharedSecret) {
      const code = SteamTotp.generateAuthCode(this.options.sharedSecret);
      this.log.info("Submitting Steam Guard TOTP code");
      await session.submitSteamGuardCode(code);
      return;
    }

    if ((deviceCodeAction || emailCodeAction) && this.options.steamGuardCode) {
      this.log.info(
        { guardType: deviceCodeAction ? "device" : "email", detail: emailCodeAction?.detail },
        "Submitting provided Steam Guard code"
      );
      await session.submitSteamGuardCode(this.options.steamGuardCode);
      return;
    }

    if (confirmationAction) {
      this.log.info(
        { guardType: EAuthSessionGuardType[confirmationAction.type] },
        "Waiting for Steam Guard confirmation"
      );
      return;
    }

    throw new Error(
      `Steam Guard action required but cannot be handled: ${actions
        .map((action) => EAuthSessionGuardType[action.type])
        .join(", ")}`
    );
  }

  private waitForAuthenticated(session: LoginSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        session.removeListener("authenticated", onAuthenticated);
        session.removeListener("timeout", onTimeout);
        session.removeListener("error", onError);
      };

      const onAuthenticated = (): void => {
        cleanup();
        resolve();
      };

      const onTimeout = (): void => {
        cleanup();
        reject(new Error("Steam login timed out"));
      };

      const onError = (error: unknown): void => {
        cleanup();
        reject(error);
      };

      session.once("authenticated", onAuthenticated);
      session.once("timeout", onTimeout);
      session.once("error", onError);
    });
  }

  private createLoginSession(): LoginSession {
    const session = new LoginSession(resolvePlatform(this.options.tokenPlatform));
    session.loginTimeout = this.options.loginTimeoutMs;

    session.on("polling", () => {
      this.log.debug("Steam login polling started");
    });
    session.on("remoteInteraction", () => {
      this.log.info("Steam login confirmation opened in mobile app");
    });
    session.on("steamGuardMachineToken", () => {
      this.log.debug("Steam Guard machine token received");
    });

    return session;
  }

  private bindEventHandlers(): void {
    if (this.eventsBound) {
      return;
    }

    this.eventsBound = true;

    this.tradeManager.on("pollData", (pollData: PollData) => {
      this.storage.savePollData(pollData).catch((error) => {
        this.log.warn({ err: error }, "Failed to save Steam poll data");
      });
      this.emit("pollData", pollData);
    });

    this.tradeManager.on("pollFailure", (error) => {
      this.log.warn({ err: error }, "Steam trade poll failed");
    });

    this.tradeManager.on("pollSuccess", () => {
      this.log.debug("Steam trade poll succeeded");
    });

    this.tradeManager.on("sessionExpired", (error) => {
      this.log.warn({ err: error }, "Steam trade session expired");
      this.ensureFreshSession("trade manager session expired").catch((err) => {
        this.setStatus("error");
        this.log.error({ err }, "Failed to refresh expired Steam trade session");
      });
    });

    this.tradeManager.on("newOffer", (offer) => {
      this.log.info({ offerId: offer.id, partner: offer.partner.getSteamID64() }, "New trade offer received");
      this.emit("newOffer", offer);
    });

    this.tradeManager.on("sentOfferChanged", (offer, oldState) => {
      this.log.info(
        {
          offerId: offer.id,
          oldState,
          newState: offer.state
        },
        "Sent trade offer changed state"
      );
    });
  }

  private startTokenRefreshLoop(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
    }

    this.tokenRefreshTimer = setInterval(() => {
      this.ensureFreshSession("scheduled token refresh").catch((error) => {
        this.setStatus("error");
        this.log.error({ err: error }, "Scheduled Steam token refresh failed");
      });
    }, this.options.tokenRefreshIntervalMs);

    this.tokenRefreshTimer.unref?.();
  }

  private async waitForLoginSlot(): Promise<void> {
    this.loginAttempts = this.recentLoginAttempts();

    if (this.loginAttempts.length < this.options.maxLoginAttemptsWithinPeriod) {
      return;
    }

    const oldest = Math.min(...this.loginAttempts);
    const waitMs = Math.max(
      0,
      oldest + this.options.loginAttemptPeriodMs - Date.now() + 500
    );

    if (waitMs > 0) {
      this.log.warn({ waitMs }, "Login attempt limit reached; waiting before retry");
      await delay(waitMs);
    }
  }

  private recordLoginAttempt(): void {
    this.loginAttempts = [...this.recentLoginAttempts(), Date.now()];
    this.storage
      .saveLoginAttempts(this.loginAttempts.map((attempt) => Math.floor(attempt / 1000)))
      .catch((error) => {
        this.log.warn({ err: error }, "Failed to save login attempts");
      });
  }

  private recentLoginAttempts(): number[] {
    const now = Date.now();
    return this.loginAttempts.filter(
      (attempt) => now - attempt < this.options.loginAttemptPeriodMs
    );
  }

  private normalizeLoginAttempts(attempts: number[]): number[] {
    return attempts
      .filter((attempt) => Number.isFinite(attempt))
      .map((attempt) => (attempt > 10_000_000_000 ? attempt : attempt * 1000))
      .filter((attempt) => Date.now() - attempt < this.options.loginAttemptPeriodMs);
  }

  private areCookiesUsable(cookies: string[] | null | undefined): cookies is string[] {
    const token = getSteamLoginSecureJwt(cookies);
    return isJwtUsable(token, this.options.tokenRefreshSkewMs);
  }

  private assertReady(): void {
    if (!this.ready) {
      throw new Error("Steam bot is not ready");
    }
  }

  private setStatus(status: BotStatus): void {
    this.status = status;
    this.emit("status", status);
  }
}

function resolvePlatform(platform: SteamTokenPlatform): EAuthTokenPlatformType {
  switch (platform) {
    case "client":
      return EAuthTokenPlatformType.SteamClient;
    case "web":
      return EAuthTokenPlatformType.WebBrowser;
    case "mobile":
    default:
      return EAuthTokenPlatformType.MobileApp;
  }
}

export default Bot;
