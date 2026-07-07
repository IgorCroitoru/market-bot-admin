import { EventEmitter } from "node:events";
import SteamCommunity from "steamcommunity";
import SteamTotp from "steam-totp";
import TradeOfferManager, { SteamID } from "steam-tradeoffer-manager";
import type TradeOffer from "steam-tradeoffer-manager/lib/classes/TradeOffer";
import {
  EAuthSessionGuardType,
  EAuthTokenPlatformType,
  ESessionPersistence,
  LoginSession,
} from "steam-session";
import type { AppLogger } from "@market-bot-admin/logging";
import type { BotOptions, SteamTokenPlatform } from "./IOptions";
import type { BotStorage } from "./Persistence";
import type { PollData } from "./PollData";
import {
  getSteamLoginSecureJwt,
  getJwtExpirationDate,
  isJwtExpiringWithin,
  isJwtUsable,
} from "./jwt";
import { isRetriableError, withRetries, delay } from "./retry";
import { logger as defaultLogger } from "./logger";
import { createBotStorageFromEnv } from "./storage";
import { TokenCache } from "./storage/AzureBotStorage";
import CEconItem from "steamcommunity/classes/CEconItem";
import type {
  TradeItem,
  TradeRequest as SendTradeOfferRequest,
} from "@market-bot-admin/shared";

export type {
  TradeItem,
  TradeRequest as SendTradeOfferRequest,
} from "@market-bot-admin/shared";

export type BotStatus =
  | "idle"
  | "authenticating"
  | "ready"
  | "refreshing"
  | "stopped"
  | "error";

export interface BotHealthError {
  name: string;
  message: string;
  context: string;
  at: number;
  code?: string;
  cause?: string;
  stack?: string;
}

export interface BotHealthSnapshot {
  status: BotStatus;
  ready: boolean;
  queueSize: number;
  processingQueue: boolean;
  lastError: BotHealthError | null;
  lastErrors: BotHealthError[];
  updatedAt: number;
}

export interface SentTradeOffer {
  offer: TradeOffer;
  status: "pending" | "sent";
}

export interface BotInventorySnapshot {
  fetchedAt: number;
  inventory: CEconItem[];
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
  "maximum number of items allowed in inventory",
];

const permanentTradeOfferCauses = new Set([
  "TradeBan",
  "NewDevice",
  "TargetCannotTrade",
  "OfferLimitExceeded",
]);

const retriableTradeOfferCauses = new Set(["ItemServerUnavailable"]);
const inventoryRefreshCheckIntervalMs = 10 * 60_000;

export interface BotHealthError {
  name: string;
  message: string;
  context: string;
  at: number;
  code?: string;
  cause?: string;
  stack?: string;
}

export interface BotHealthSnapshot {
  status: BotStatus;
  ready: boolean;
  queueSize: number;
  processingQueue: boolean;
  lastError: BotHealthError | null;
  lastErrors: BotHealthError[];
  updatedAt: number;
}

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
      | "inventoryPollIntervalMs"
      | "tokenPlatform"
      | "steamGuardTokenSubmitAttempts"
      | "steamGuardTokenSubmitDelayMs"
    >
  > &
    BotOptions;

  private status: BotStatus = "idle";
  private ready = false;
  private healthUpdatedAt = Date.now();
  private lastErrors: BotHealthError[] = [];
  private readonly maxHealthErrors = 5;
  private steamId64: string | null = null;
  private inventoryCache: BotInventorySnapshot | null = null;
  private _tokenCache: TokenCache = {
    refreshToken: null,
    accessToken: null,
    sessionCookies: null,
    updatedAt: 0,
  };
  // private refreshToken: string | null = null;
  // private accessToken: string | null = null;
  // private cookies: string[] | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private inventoryRefreshTimer: NodeJS.Timeout | null = null;
  private inventoryRefreshInFlight: Promise<void> | null = null;
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
      inventoryPollIntervalMs: 10 * 60_000,
      steamGuardTokenSubmitAttempts: 3,
      steamGuardTokenSubmitDelayMs: 1500,
      tokenPlatform: "mobile",
      ...options,
    };

    this.log = options.logger ?? defaultLogger;
    this.storage =
      options.storage ??
      createBotStorageFromEnv({
        accountName: options.accountName,
      });

    this.community = new SteamCommunity();
    this.tradeManager = new TradeOfferManager({
      community: this.community,
      domain: this.options.domain,
      language: this.options.language,
      pollInterval: -1,
      cancelTime: this.options.cancelTimeMs,
      useAccessToken: true,
      savePollData: false,
    });
  }

  get isReady(): boolean {
    return this.ready;
  }

  get currentStatus(): BotStatus {
    return this.status;
  }

  getInventoryCache(): BotInventorySnapshot | null {
    return this.inventoryCache;
  }

  private async updateInventoryCache(
    inventory: BotInventorySnapshot,
  ): Promise<void> {
    this.inventoryCache = inventory;
    await this.storage.saveInventorySnapshot(inventory).catch((error) => {
      this.log.warn(
        { err: error },
        "Failed to save inventory snapshot to storage",
      );
    });
  }
  private async updateTokenCache(patch: Partial<TokenCache>): Promise<void> {
    this._tokenCache = {
      ...this._tokenCache,
      ...patch,
    };
    await this.storage.saveTokenCache(this._tokenCache).catch((error) => {
      this.log.warn({ err: error }, "Failed to save token cache to storage");
    });
  }
  getHealth(): BotHealthSnapshot {
    return {
      status: this.status,
      ready: this.ready,
      queueSize: this.tradeOfferQueue.length,
      processingQueue: this.processingTradeOfferQueue,
      lastError: this.lastErrors[0] ?? null,
      lastErrors: [...this.lastErrors],
      updatedAt: this.healthUpdatedAt,
    };
  }

  async start(): Promise<void> {
    if (this.ready || this.status === "authenticating") {
      this.log.warn("Steam bot is already starting or ready");
      return;
    }

    this.bindEventHandlers();
    this.setStatus("authenticating");

    try {
      await this.restoreState();
      await this.login();

      this.tradeManager.pollInterval = this.options.pollIntervalMs;
      this.tradeManager.doPoll();
      this.startTokenRefreshLoop();
      this.startInventoryRefreshLoop();
      this.ready = true;
      this.setStatus("ready");
      this.emit("ready", true);
      this.log.info(
        {
          accountName: this.options.accountName,
          pollIntervalMs: this.options.pollIntervalMs,
        },
        "Steam bot is ready",
      );
      void this.refreshInventoryCache("startup");
      // Resume processing any queued trade offers now that the bot is ready.
      this.processTradeOfferQueue();
    } catch (error) {
      this.recordHealthError(error, "start");
      this.setStatus("error");
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }

    if (this.inventoryRefreshTimer) {
      clearInterval(this.inventoryRefreshTimer);
      this.inventoryRefreshTimer = null;
    }

    this.tradeManager.pollInterval = -1;
    this.tradeManager.shutdown();
    this.rejectQueuedTradeOffers(new Error("Steam bot stopped"));
    this.ready = false;
    this.setStatus("stopped");
    this.emit("ready", false);
    this.log.info(
      { accountName: this.options.accountName },
      "Steam bot stopped",
    );
  }

  async ensureFreshSession(reason = "scheduled token check"): Promise<void> {
    this.sessionRefreshInFlight ??= this.refreshSession(reason).finally(() => {
      this.sessionRefreshInFlight = null;
    });

    return this.sessionRefreshInFlight;
  }

  async refreshInventoryCache(
    reason = "scheduled inventory check",
  ): Promise<void> {
    this.inventoryRefreshInFlight ??= this.doRefreshInventoryCache(
      reason,
    ).finally(() => {
      this.inventoryRefreshInFlight = null;
    });

    return this.inventoryRefreshInFlight;
  }

  async sendTradeOffer(
    request: SendTradeOfferRequest,
  ): Promise<SentTradeOffer> {
    // Always accept trade offer requests and enqueue them.
    // Processing will only run when the bot is ready.

    const createdAtMs = normalizeRequestTimestamp(
      request.createdAt ?? request.timestamp ?? Date.now(),
    );
    const deadlineMs =
      request.deadlineAt !== undefined
        ? normalizeRequestTimestamp(request.deadlineAt)
        : createdAtMs + this.options.offerRequestTtlMs;

    if (Date.now() > deadlineMs) {
      throw this.createTradeOfferDeadlineError(createdAtMs, deadlineMs, 0);
    }

    return new Promise<SentTradeOffer>((resolve, reject) => {
      this.tradeOfferQueue.push({
        request,
        createdAtMs,
        deadlineMs,
        enqueuedAtMs: Date.now(),
        attempts: 0,
        resolve,
        reject,
      });

      this.log.info(
        {
          partner: request.partner,
          queueLength: this.tradeOfferQueue.length,
          deadlineAt: new Date(deadlineMs).toISOString(),
        },
        "Trade offer queued",
      );

      if (this.ready) {
        this.processTradeOfferQueue();
      } else {
        this.log.debug(
          { queueLength: this.tradeOfferQueue.length },
          "Bot not ready; trade offer queued for later processing",
        );
      }
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
      await this.waitForProcessingReady();

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
    item: TradeOfferQueueItem,
  ): Promise<SentTradeOffer> {
    while (true) {
      this.assertTradeOfferWithinDeadline(item);
      item.attempts++;

      try {
        const result = await this.sendTradeOfferOnce(item.request);
        this.log.info(
          {
            offerId: result.offer.id,
            attempts: item.attempts,
          },
          "Queued trade offer sent",
        );
        return result;
      } catch (error) {
        const tradeError = error as TradeOfferSendError;
        const decision = this.getTradeOfferRetryDecision(tradeError, item);

        if (!decision.retry) {
          this.recordHealthError(tradeError, "trade offer send failed");
          this.log.warn(
            {
              err: tradeError,
              partner: item.request.partner,
              attempts: item.attempts,
              reason: decision.reason,
            },
            "Trade offer failed without retry",
          );
          throw error;
        }

        this.log.warn(
          {
            err: tradeError,
            partner: item.request.partner,
            attempts: item.attempts,
            nextAttempt: item.attempts + 1,
            delayMs: decision.delayMs,
            deadlineAt: new Date(item.deadlineMs).toISOString(),
            reason: decision.reason,
          },
          "Retrying trade offer send",
        );

        if (decision.delayMs > 0) {
          await delay(decision.delayMs);
        }
      }
    }
  }

  private sendTradeOfferOnce(
    request: SendTradeOfferRequest,
  ): Promise<SentTradeOffer> {
    return new Promise<SentTradeOffer>((resolve, reject) => {
      try {
        if (!request.itemsToGive || request.itemsToGive.length === 0) {
          throw new Error(
            "Broken trade request: At least one item to give is required to send a trade offer",
          );
        }

        if (!this.inventoryCache) {
          throw new Error("Inventory cache is not initialized");
        }

        const inventory = this.inventoryCache.inventory;

        const itemsToGive = request.itemsToGive.map(
          (requestedItem: TradeItem) => {
            const inventoryItem = inventory.find(
              (item) => item.assetid === requestedItem.assetid,
            );

            if (!inventoryItem) {
              throw new Error(
                `Inventory item not found: assetid=${requestedItem.assetid}`,
              );
            }

            if (inventoryItem.amount < requestedItem.amount) {
              throw new Error(
                `Not enough amount for assetid=${requestedItem.assetid}. Requested ${requestedItem.amount}, available ${inventoryItem.amount}`,
              );
            }

            const reconstructedItem = new CEconItem(
              inventoryItem,
              inventoryItem.descriptions,
              inventoryItem.contextid,
            );
            reconstructedItem.amount = requestedItem.amount; // Override amount with requested amount for the trade offer.
            return reconstructedItem;
          },
        );

        const sid = SteamID.fromIndividualAccountID(request.partner);

        const offer = this.tradeManager.createOffer(sid, request.token);

        offer.addMyItems(itemsToGive);

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

          if (status === "pending") {
            this.log.info(
              {
                offerId: offer.id,
                partner: request.partner,
                status,
              },
              "Trade offer sent but requires confirmation",
            );

            if (this.options.identitySecret) {
              this.community.acceptConfirmationForObject(
                this.options.identitySecret,
                offer.id,
                (cb) => {
                  if (cb) {
                    this.log.error(
                      {
                        offerId: offer.id,
                        cause: cb.cause,
                        message: cb.message,
                        name: cb.name,
                        stack: cb.stack,
                      },
                      "Error confirming offer",
                    );
                    offer.cancel((err) => {
                      if (err) {
                        this.log.error({offerId: offer.id}, "Error cancelling offer after unsuccessful confirmation")
                        reject(err);
                        return;
                      }
                    });
                    reject(
                      cb ||
                        new Error(
                          `Steam confirmation failed for offer ${offer.id}`,
                        ),
                    );
                    return;
                  } else {
                    this.log.info({ offerId: offer.id }, "Confirmed offer");
                    resolve({ offer, status });
                    return;
                  }
                },
              );
            }
          } else {
            this.log.info(
              {
                offerId: offer.id,
                partner: request.partner,
                status,
              },
              "Trade offer sent successfully",
            );
            resolve({ offer, status });
            return;
          }
          return;
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private getTradeOfferRetryDecision(
    error: TradeOfferSendError,
    item: TradeOfferQueueItem,
  ): { retry: boolean; reason: string; delayMs: number } {
    if (Date.now() >= item.deadlineMs) {
      return {
        retry: false,
        reason: "offer request deadline expired",
        delayMs: 0,
      };
    }

    if (this.isPermanentTradeOfferError(error)) {
      return {
        retry: false,
        reason: "permanent trade offer error",
        delayMs: 0,
      };
    }

    if (item.attempts > this.options.offerMaxRetries) {
      return { retry: false, reason: "max offer retries exceeded", delayMs: 0 };
    }

    if (!this.isRetriableTradeOfferError(error)) {
      return {
        retry: false,
        reason: "non-retriable trade offer error",
        delayMs: 0,
      };
    }

    const remainingMs = item.deadlineMs - Date.now();
    const backoffMs = Math.min(
      this.options.offerRetryMaxDelayMs,
      this.options.offerRetryBaseDelayMs * 2 ** Math.max(0, item.attempts - 1),
    );
    const delayMs = Math.min(backoffMs, Math.max(0, remainingMs - 1_000));

    return {
      retry: remainingMs > 0,
      reason: "retriable trade offer error",
      delayMs,
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
    return permanentTradeOfferMessageParts.some((part) =>
      message.includes(part),
    );
  }

  private assertTradeOfferWithinDeadline(item: TradeOfferQueueItem): void {
    if (Date.now() > item.deadlineMs) {
      throw this.createTradeOfferDeadlineError(
        item.createdAtMs,
        item.deadlineMs,
        item.attempts,
      );
    }
  }

  private createTradeOfferDeadlineError(
    createdAtMs: number,
    deadlineMs: number,
    attempts: number,
  ): Error {
    const error = new Error(
      "Trade offer request expired before it could be sent",
    ) as Error & {
      code?: string;
      attempts?: number;
      createdAtMs?: number;
      deadlineMs?: number;
    };

    error.code = "TRADE_OFFER_REQUEST_EXPIRED";
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

  private startInventoryRefreshLoop(): void {
    if (this.inventoryRefreshTimer) {
      clearInterval(this.inventoryRefreshTimer);
    }

    this.inventoryRefreshTimer = setInterval(() => {
      void this.refreshInventoryCache("scheduled inventory check");
    }, inventoryRefreshCheckIntervalMs);

    this.inventoryRefreshTimer.unref?.();
  }

  private async doRefreshInventoryCache(reason: string): Promise<void> {
    if (!this.ready || this.status === "stopped") {
      return;
    }

    // Refresh only when elapsed time since the last successful update reaches the configured threshold.
    const cachedInventory = this.inventoryCache;
    const elapsedSinceLastUpdateMs = cachedInventory?.fetchedAt
      ? Date.now() - cachedInventory.fetchedAt
      : null;

    if (
      cachedInventory !== null &&
      elapsedSinceLastUpdateMs !== null &&
      elapsedSinceLastUpdateMs < this.options.inventoryPollIntervalMs
    ) {
      return;
    }

    const snapshot = await this.fetchInventorySnapshot();
    await this.updateInventoryCache(snapshot);

    this.log.info(
      {
        reason,
        inventoryCount: snapshot.inventory.length,
      },
      "Steam inventory cache refreshed",
    );

    this.emit("inventoryUpdated", snapshot);
  }

  private async fetchInventorySnapshot(): Promise<BotInventorySnapshot> {
    const [inventory] = await new Promise<[CEconItem[]]>((resolve, reject) => {
      this.tradeManager.getInventoryContents(730, 2, false, (error, items) => {
        if (error) {
          reject(error);
          return;
        }
        resolve([items]);
      });
    });

    return {
      fetchedAt: Date.now(),
      inventory,
    };
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
    const [loginAttempts, pollData, tokenCache, inventorySnapshot] =
      await Promise.all([
        this.storage.loadLoginAttempts(),
        this.storage.loadPollData(),
        this.storage.loadTokenCache(),
        this.storage.loadInventorySnapshot(),
      ]);

    this.loginAttempts = this.normalizeLoginAttempts(loginAttempts ?? []);

    if (tokenCache) {
      this._tokenCache = tokenCache;
      if (
        isJwtUsable(
          tokenCache.accessToken,
          this.options.accessTokenRefreshSkewMs,
        )
      ) {
        this.log.info(
          {
            accessTokenExpiresAt: getJwtExpirationDate(
              tokenCache.accessToken,
            )?.toISOString(),
          },
          "Restored valid Steam access token from storage",
        );
      }

      if (this.areCookiesUsable(tokenCache.sessionCookies)) {
        await this.setCookies(tokenCache.sessionCookies);
        this.log.info("Restored valid Steam cookies from storage");
      }
    } else {
      // await this.storage.deleteAccessToken();
      this.log.info("Token cache in storage is empty; ignoring");
    }

    if (pollData) {
      this.tradeManager.pollData = pollData;
      this.log.info("Restored trade poll data");
    }

    if (inventorySnapshot) {
      this.log.info(
        {
          inventoryCount: inventorySnapshot.inventory.length,
          fetchedAt: new Date(inventorySnapshot.fetchedAt).toISOString(),
        },
        "Restored inventory snapshot",
      );
    }
  }

  private recordHealthError(error: unknown, context: string): void {
    const snapshot = this.toHealthError(error, context);
    this.lastErrors = [snapshot, ...this.lastErrors].slice(
      0,
      this.maxHealthErrors,
    );
    this.healthUpdatedAt = snapshot.at;
  }

  private toHealthError(error: unknown, context: string): BotHealthError {
    const errorLike = error as Error & { code?: unknown; cause?: unknown };
    const cause = errorLike?.cause;

    return {
      name: errorLike?.name ?? "Error",
      message: errorLike?.message ?? String(error),
      context,
      at: Date.now(),
      code: typeof errorLike?.code === "string" ? errorLike.code : undefined,
      cause:
        typeof cause === "string"
          ? cause
          : cause instanceof Error
            ? cause.message
            : cause !== undefined
              ? String(cause)
              : undefined,
      stack: errorLike?.stack,
    };
  }

  private async login(): Promise<void> {
    await withRetries(
      async () => {
        await this.waitForLoginSlot();

        if (
          isJwtUsable(
            this._tokenCache.refreshToken,
            this.options.tokenRefreshSkewMs,
          )
        ) {
          try {
            await this.loginWithRefreshToken(this._tokenCache.refreshToken);
            return;
          } catch (error) {
            this.log.warn({ err: error }, "Refresh-token login failed");

            if (!isRetriableError(error)) {
              await this.updateTokenCache({ refreshToken: null });
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
        shouldRetry: isRetriableError,
      },
    );
  }

  private async loginWithRefreshToken(refreshToken: string): Promise<void> {
    this.recordLoginAttempt();
    this.log.info(
      {
        accountName: this.options.accountName,
        refreshTokenExpiresAt:
          getJwtExpirationDate(refreshToken)?.toISOString(),
      },
      "Logging into Steam with stored refresh token",
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
        "No valid refresh token is available and STEAM_PASSWORD was not provided",
      );
    }

    this.recordLoginAttempt();
    this.log.info(
      { accountName: this.options.accountName },
      "Logging into Steam with credentials",
    );

    const session = this.createLoginSession();
    const authenticated = this.waitForAuthenticated(session);

    const startResult = (await session.startWithCredentials({
      accountName: this.options.accountName,
      password: this.options.password,
      persistence: ESessionPersistence.Persistent,
    })) as StartSessionResponse;

    if (startResult.actionRequired) {
      await withRetries(() => this.handleSteamGuard(session, startResult), {
        attempts: this.options.steamGuardTokenSubmitAttempts,
        delayMs: this.options.steamGuardTokenSubmitDelayMs,
        logger: this.log,
        shouldRetry: isRetriableError,
      });
    }

    await authenticated;
    const cookies = await session.getWebCookies();
    await this.captureSession(session, cookies);
  }

  private async refreshSession(reason: string): Promise<void> {
    if (this.status === "stopped") {
      return;
    }

    const refreshToken =
      this._tokenCache.refreshToken ??
      (await this.storage.loadTokenCache())?.refreshToken;

    if (!isJwtUsable(refreshToken, this.options.tokenRefreshSkewMs)) {
      this.log.warn(
        { reason },
        "Refresh token is missing or expiring; performing full login",
      );
      await this.login();
      return;
    }

    if (
      this.areCookiesUsable(this._tokenCache.sessionCookies) &&
      isJwtUsable(
        this._tokenCache.accessToken,
        this.options.accessTokenRefreshSkewMs,
      ) &&
      !isJwtExpiringWithin(
        refreshToken,
        this.options.refreshTokenRenewalWindowMs,
      )
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
    refreshToken: string,
  ): Promise<void> {
    if (this.options.tokenPlatform !== "mobile") {
      return;
    }

    if (
      isJwtExpiringWithin(
        refreshToken,
        this.options.refreshTokenRenewalWindowMs,
      )
    ) {
      const renewed = await session.renewRefreshToken();

      if (renewed && session.refreshToken) {
        await this.updateTokenCache({ refreshToken: session.refreshToken });
        this.log.info(
          {
            refreshTokenExpiresAt: getJwtExpirationDate(
              session.refreshToken,
            )?.toISOString(),
          },
          "Steam refresh token renewed",
        );
      }

      await this.updateTokenCache({ accessToken: session.accessToken });
      return;
    }

    if (
      !isJwtUsable(
        this._tokenCache.accessToken,
        this.options.accessTokenRefreshSkewMs,
      )
    ) {
      await session.refreshAccessToken();
      await this.updateTokenCache({ accessToken: session.accessToken });
      this.log.debug(
        {
          accessTokenExpiresAt: getJwtExpirationDate(
            session.accessToken,
          )?.toISOString(),
        },
        "Steam access token refreshed",
      );
    }
  }

  private setStoredAccessToken(session: LoginSession): void {
    if (
      !isJwtUsable(
        this._tokenCache.accessToken,
        this.options.accessTokenRefreshSkewMs,
      )
    ) {
      return;
    }

    try {
      session.accessToken = this._tokenCache.accessToken;
    } catch (error) {
      this.log.warn({ err: error }, "Stored Steam access token was rejected");
      this.updateTokenCache({ accessToken: null });
    }
  }

  private async captureSession(
    session: LoginSession,
    cookies: string[],
  ): Promise<void> {
    this.steamId64 = session.steamID?.getSteamID64?.() ?? this.steamId64;
    const tokenCacheUpdate = {
      refreshToken: session.refreshToken,
      accessToken: session.accessToken,
      sessionCookies: cookies,
      updatedAt: Date.now(),
    };

    await this.updateTokenCache(tokenCacheUpdate);
    await this.setCookies(cookies);

    this.log.info(
      {
        accountName: session.accountName || this.options.accountName,
        steamId: session.steamID?.getSteamID64?.(),
        refreshTokenExpiresAt: getJwtExpirationDate(
          session.refreshToken,
        )?.toISOString(),
        accessTokenExpiresAt: getJwtExpirationDate(
          session.accessToken,
        )?.toISOString(),
      },
      "Steam session established",
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
    startResult: StartSessionResponse,
  ): Promise<void> {
    const actions = startResult.validActions ?? [];
    const deviceCodeAction = actions.find(
      (action) => action.type === EAuthSessionGuardType.DeviceCode,
    );
    const emailCodeAction = actions.find(
      (action) => action.type === EAuthSessionGuardType.EmailCode,
    );
    const confirmationAction = actions.find(
      (action) =>
        action.type === EAuthSessionGuardType.DeviceConfirmation ||
        action.type === EAuthSessionGuardType.EmailConfirmation,
    );

    if (deviceCodeAction && this.options.sharedSecret) {
      const code = SteamTotp.generateAuthCode(this.options.sharedSecret);
      this.log.info("Submitting Steam Guard TOTP code");
      await session.submitSteamGuardCode(code);
      return;
    }

    if ((deviceCodeAction || emailCodeAction) && this.options.steamGuardCode) {
      this.log.info(
        {
          guardType: deviceCodeAction ? "device" : "email",
          detail: emailCodeAction?.detail,
        },
        "Submitting provided Steam Guard code",
      );
      await session.submitSteamGuardCode(this.options.steamGuardCode);
      return;
    }

    if (confirmationAction) {
      this.log.info(
        { guardType: EAuthSessionGuardType[confirmationAction.type] },
        "Waiting for Steam Guard confirmation",
      );
      return;
    }

    throw new Error(
      `Steam Guard action required but cannot be handled: ${actions
        .map((action) => EAuthSessionGuardType[action.type])
        .join(", ")}`,
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
    const session = new LoginSession(
      resolvePlatform(this.options.tokenPlatform),
    );
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
        this.recordHealthError(err, "trade manager session expired");
        this.setStatus("error");
        this.log.error(
          { err },
          "Failed to refresh expired Steam trade session",
        );
      });
    });

    this.tradeManager.on("newOffer", (offer) => {
      this.log.info(
        { offerId: offer.id, partner: offer.partner.getSteamID64() },
        "New trade offer received",
      );
      this.emit("newOffer", offer);
    });

    this.tradeManager.on("sentOfferChanged", (offer, oldState) => {
      this.log.info(
        {
          offerId: offer.id,
          oldState,
          newState: offer.state,
        },
        "Sent trade offer changed state",
      );
      this.emit("sentOfferChanged", offer, oldState);
    });
  }

  private startTokenRefreshLoop(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
    }

    this.tokenRefreshTimer = setInterval(() => {
      this.ensureFreshSession("scheduled token refresh").catch((error) => {
        this.recordHealthError(error, "scheduled token refresh");
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
      oldest + this.options.loginAttemptPeriodMs - Date.now() + 500,
    );

    if (waitMs > 0) {
      this.log.warn(
        { waitMs },
        "Login attempt limit reached; waiting before retry",
      );
      await delay(waitMs);
    }
  }

  private recordLoginAttempt(): void {
    this.loginAttempts = [...this.recentLoginAttempts(), Date.now()];
    this.storage
      .saveLoginAttempts(
        this.loginAttempts.map((attempt) => Math.floor(attempt / 1000)),
      )
      .catch((error) => {
        this.log.warn({ err: error }, "Failed to save login attempts");
      });
  }

  private recentLoginAttempts(): number[] {
    const now = Date.now();
    return this.loginAttempts.filter(
      (attempt) => now - attempt < this.options.loginAttemptPeriodMs,
    );
  }

  private normalizeLoginAttempts(attempts: number[]): number[] {
    return attempts
      .filter((attempt) => Number.isFinite(attempt))
      .map((attempt) => (attempt > 10_000_000_000 ? attempt : attempt * 1000))
      .filter(
        (attempt) => Date.now() - attempt < this.options.loginAttemptPeriodMs,
      );
  }

  private areCookiesUsable(
    cookies: string[] | null | undefined,
  ): cookies is string[] {
    const token = getSteamLoginSecureJwt(cookies);
    return isJwtUsable(token, this.options.tokenRefreshSkewMs);
  }

  private assertReady(): void {
    if (!this.ready) {
      throw new Error("Steam bot is not ready");
    }
  }

  private async waitForProcessingReady(): Promise<void> {
    if (this.ready) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        this.removeListener("ready", onReady);
      };

      const onReady = (isReady: boolean): void => {
        if (isReady) {
          cleanup();
          resolve();
        }
      };
      this.on("ready", onReady);
    });
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
        setTimeout(
          () => reject(new Error("Timeout waiting for bot to be ready")),
          timeoutMs,
        );
      }),
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
