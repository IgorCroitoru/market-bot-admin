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
  requestId?: string;
  createdAt?: number | string | Date;
  timestamp?: number | string | Date;
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

type TradeOfferSendError = Error & {
  cause?:
    | "TradeBan"
    | "NewDevice"
    | "TargetCannotTrade"
    | "OfferLimitExceeded"
    | "ItemServerUnavailable";
  code?: string;
  eresult?: number;
};

type TradeOfferQueueItem = {
  request: SendTradeOfferRequest;
  createdAtMs: number;
  deadlineMs: number;
  enqueuedAtMs: number;
  attempts: number;
  resolve: (result: SentTradeOffer) => void;
  reject: (error: unknown) => void;
};

const permanentTradeOfferMessageParts = [
  "can only be sent to friends",
  "is not available to trade",
  "maximum number of items allowed in inventory"
];

const permanentTradeOfferCauses = new Set([
  "TradeBan",
  "NewDevice",
  "TargetCannotTrade",
  "OfferLimitExceeded"
]);

const retriableTradeOfferCauses = new Set(["ItemServerUnavailable"]);

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
      | "offerRequestTtlMs"
      | "offerMaxRetries"
      | "offerRetryBaseDelayMs"
      | "offerRetryMaxDelayMs"
      | "tokenRefreshIntervalMs"
      | "tokenRefreshSkewMs"
      | "accessTokenRefreshSkewMs"
      | "refreshTokenRenewalWindowMs"
      | "tokenPlatform"
      | "steamGuardTokenSubmitAttempts"
      | "steamGuardTokenSubmitDelayMs"
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
  private tradeOfferQueue: TradeOfferQueueItem[] = [];
  private processingTradeOfferQueue = false;
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
      loginRetryDelayMs: 30_000,
      maxLoginAttemptsWithinPeriod: 3,
      loginAttemptPeriodMs: 60_000,
      offerRequestTtlMs: 5 * 60_000,
      offerMaxRetries: 3,
      offerRetryBaseDelayMs: 1_000,
      offerRetryMaxDelayMs: 30_000,
      tokenRefreshIntervalMs: 5 * 60_000,
      tokenRefreshSkewMs: 2 * 60_000,
      accessTokenRefreshSkewMs: 4 * 60 * 60_000,
      refreshTokenRenewalWindowMs: 7 * 24 * 60 * 60_000,
      steamGuardTokenSubmitAttempts: 3,
      steamGuardTokenSubmitDelayMs: 1500,
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
    this.rejectQueuedTradeOffers(new Error("Steam bot stopped"));
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

    const createdAtMs = normalizeRequestTimestamp(
      request.createdAt ?? request.timestamp ?? Date.now()
    );
    const deadlineMs = createdAtMs + this.options.offerRequestTtlMs;

    if (Date.now() > deadlineMs) {
      throw this.createTradeOfferDeadlineError(request, createdAtMs, deadlineMs, 0);
    }

    return new Promise<SentTradeOffer>((resolve, reject) => {
      this.tradeOfferQueue.push({
        request,
        createdAtMs,
        deadlineMs,
        enqueuedAtMs: Date.now(),
        attempts: 0,
        resolve,
        reject
      });

      this.log.info(
        {
          requestId: request.requestId,
          partner: request.partner,
          queueLength: this.tradeOfferQueue.length,
          deadlineAt: new Date(deadlineMs).toISOString()
        },
        "Trade offer queued"
      );

      this.processTradeOfferQueue();
    });
  }

  private processTradeOfferQueue(): void {
    if (this.processingTradeOfferQueue) {
      return;
    }

    this.processingTradeOfferQueue = true;

    void this.drainTradeOfferQueue().finally(() => {
      this.processingTradeOfferQueue = false;

      if (this.tradeOfferQueue.length > 0) {
        this.processTradeOfferQueue();
      }
    });
  }

  private async drainTradeOfferQueue(): Promise<void> {
    while (this.tradeOfferQueue.length > 0) {
      const item = this.tradeOfferQueue.shift();

      if (!item) {
        continue;
      }

      try {
        item.resolve(await this.processTradeOfferQueueItem(item));
      } catch (error) {
        item.reject(error);
      }
    }
  }

  private async processTradeOfferQueueItem(
    item: TradeOfferQueueItem
  ): Promise<SentTradeOffer> {
    while (true) {
      this.assertTradeOfferWithinDeadline(item);
      item.attempts++;

      try {
        const result = await this.sendTradeOfferOnce(item.request);
        this.log.info(
          {
            requestId: item.request.requestId,
            offerId: result.offerId,
            attempts: item.attempts
          },
          "Queued trade offer sent"
        );
        return result;
      } catch (error) {
        const tradeError = error as TradeOfferSendError;
        const decision = this.getTradeOfferRetryDecision(tradeError, item);

        if (!decision.retry) {
          this.log.warn(
            {
              err: tradeError,
              requestId: item.request.requestId,
              partner: item.request.partner,
              attempts: item.attempts,
              reason: decision.reason
            },
            "Trade offer failed without retry"
          );
          throw error;
        }

        this.log.warn(
          {
            err: tradeError,
            requestId: item.request.requestId,
            partner: item.request.partner,
            attempts: item.attempts,
            nextAttempt: item.attempts + 1,
            delayMs: decision.delayMs,
            deadlineAt: new Date(item.deadlineMs).toISOString(),
            reason: decision.reason
          },
          "Retrying trade offer send"
        );

        if (decision.delayMs > 0) {
          await delay(decision.delayMs);
        }
      }
    }
  }

  private sendTradeOfferOnce(request: SendTradeOfferRequest): Promise<SentTradeOffer> {
    return new Promise<SentTradeOffer>((resolve, reject) => {
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
            requestId: request.requestId,
            offerId: offer.id,
            partner: request.partner,
            status
          },
          "Trade offer sent"
        );
        resolve({ offer, offerId: offer.id, status });
      });
    });
  }

  private getTradeOfferRetryDecision(
    error: TradeOfferSendError,
    item: TradeOfferQueueItem
  ): { retry: boolean; reason: string; delayMs: number } {
    if (Date.now() >= item.deadlineMs) {
      return { retry: false, reason: "offer request deadline expired", delayMs: 0 };
    }

    if (this.isPermanentTradeOfferError(error)) {
      return { retry: false, reason: "permanent trade offer error", delayMs: 0 };
    }

    if (item.attempts > this.options.offerMaxRetries) {
      return { retry: false, reason: "max offer retries exceeded", delayMs: 0 };
    }

    if (!this.isRetriableTradeOfferError(error)) {
      return { retry: false, reason: "non-retriable trade offer error", delayMs: 0 };
    }

    const remainingMs = item.deadlineMs - Date.now();
    const backoffMs = Math.min(
      this.options.offerRetryMaxDelayMs,
      this.options.offerRetryBaseDelayMs * 2 ** Math.max(0, item.attempts - 1)
    );
    const delayMs = Math.min(backoffMs, Math.max(0, remainingMs - 1_000));

    return {
      retry: remainingMs > 0,
      reason: "retriable trade offer error",
      delayMs
    };
  }

  private isRetriableTradeOfferError(error: TradeOfferSendError): boolean {
    return (
      Boolean(error.cause && retriableTradeOfferCauses.has(error.cause)) ||
      isRetriableError(error)
    );
  }

  private isPermanentTradeOfferError(error: TradeOfferSendError): boolean {
    if (error.cause && permanentTradeOfferCauses.has(error.cause)) {
      return true;
    }

    const message = error.message.toLowerCase();
    return permanentTradeOfferMessageParts.some((part) => message.includes(part));
  }

  private assertTradeOfferWithinDeadline(item: TradeOfferQueueItem): void {
    if (Date.now() > item.deadlineMs) {
      throw this.createTradeOfferDeadlineError(
        item.request,
        item.createdAtMs,
        item.deadlineMs,
        item.attempts
      );
    }
  }

  private createTradeOfferDeadlineError(
    request: SendTradeOfferRequest,
    createdAtMs: number,
    deadlineMs: number,
    attempts: number
  ): Error {
    const error = new Error("Trade offer request expired before it could be sent") as Error & {
      code?: string;
      requestId?: string;
      attempts?: number;
      createdAtMs?: number;
      deadlineMs?: number;
    };

    error.code = "TRADE_OFFER_REQUEST_EXPIRED";
    error.requestId = request.requestId;
    error.attempts = attempts;
    error.createdAtMs = createdAtMs;
    error.deadlineMs = deadlineMs;

    return error;
  }

  private rejectQueuedTradeOffers(error: Error): void {
    for (const item of this.tradeOfferQueue.splice(0)) {
      item.reject(error);
    }
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
    const [loginAttempts, pollData, cookies, accessToken] = await Promise.all([
      this.storage.loadLoginAttempts(),
      this.storage.loadPollData(),
      this.storage.loadCookies(),
      this.storage.loadAccessToken()
    ]);

    this.loginAttempts = this.normalizeLoginAttempts(loginAttempts ?? []);

    if (isJwtUsable(accessToken, this.options.accessTokenRefreshSkewMs)) {
      this.accessToken = accessToken;
      this.log.info(
        {
          accessTokenExpiresAt: getJwtExpirationDate(accessToken)?.toISOString()
        },
        "Restored valid Steam access token from storage"
      );
    } else if (accessToken) {
      // await this.storage.deleteAccessToken();
      this.log.info("Access token in storage is expired or expiring soon; ignoring");
    }

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
              // await this.storage.deleteRefreshToken();
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
    this.setStoredAccessToken(session);

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
      await withRetries(
        () => this.handleSteamGuard(session, startResult),
        {
          attempts: this.options.steamGuardTokenSubmitAttempts,
          delayMs: this.options.steamGuardTokenSubmitDelayMs,
          logger: this.log,
          shouldRetry: isRetriableError
        }
      );
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
      isJwtUsable(this.accessToken, this.options.accessTokenRefreshSkewMs) &&
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
      if (session.accessToken) {
        await this.storage.saveAccessToken(session.accessToken);
      }
      return;
    }

    if (!isJwtUsable(this.accessToken, this.options.accessTokenRefreshSkewMs)) {
      await session.refreshAccessToken();
      this.accessToken = session.accessToken;
      if (session.accessToken) {
        await this.storage.saveAccessToken(session.accessToken);
      }
      this.log.debug(
        {
          accessTokenExpiresAt: getJwtExpirationDate(session.accessToken)?.toISOString()
        },
        "Steam access token refreshed"
      );
    }
  }

  private setStoredAccessToken(session: LoginSession): void {
    if (!isJwtUsable(this.accessToken, this.options.accessTokenRefreshSkewMs)) {
      return;
    }

    try {
      session.accessToken = this.accessToken;
    } catch (error) {
      this.accessToken = null;
      this.log.warn({ err: error }, "Stored Steam access token was rejected");
      // this.storage.deleteAccessToken().catch((deleteError) => {
      //   this.log.warn({ err: deleteError }, "Failed to delete rejected Steam access token");
      // });
    }
  }

  private async captureSession(session: LoginSession, cookies: string[]): Promise<void> {
    this.refreshToken = session.refreshToken;
    this.accessToken = session.accessToken;
    this.cookies = cookies;

    if (session.refreshToken) {
      await this.storage.saveRefreshToken(session.refreshToken);
    }

    if (session.accessToken) {
      await this.storage.saveAccessToken(session.accessToken);
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
  async waitUntilReady(timeoutMs = 60_000): Promise<void> {
    if (this.ready) {
      return;
    }
    return Promise.race([
      new Promise<void>((resolve) => {
        const handler = (isReady: boolean) => {
          if (isReady) {
            this.removeListener("ready", handler);
            resolve();
          }
        };
        this.on("ready", handler);
      }),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout waiting for bot to be ready")), timeoutMs);
      })
    ]);
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

function normalizeRequestTimestamp(value: number | string | Date): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return normalizeRequestTimestamp(numericValue);
  }

  const parsedValue = Date.parse(value);
  if (Number.isFinite(parsedValue)) {
    return parsedValue;
  }

  throw new Error(`Invalid trade offer request timestamp: ${value}`);
}
