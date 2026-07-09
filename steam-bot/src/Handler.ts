import type { PollData } from "./PollData";
import type { BotStorageItems } from "@market-bot-admin/shared";
import type { KeyValueStore } from "@market-bot-admin/storage";

export interface PauseState {
  paused: boolean;
  reason?: string;
  pauseEndTime?: number;
  timestamp: number;
}

export type PauseType = "bot" | "trades" | "inventory";

export type PauseStates = Partial<Record<PauseType, PauseState>>;

export interface OnRun {
  loginAttempts?: number[];
  pollData?: PollData;
  pauseStates?: PauseStates;
}

export class Handler {
  constructor(private readonly storage: KeyValueStore<BotStorageItems>) {}

  async onRun(): Promise<OnRun> {
    const [loginAttempts, pollData, pauseStates] = await Promise.all([
      this.storage.get("login-attempts"),
      this.storage.get("poll-data"),
      this.storage.getUnknown<PauseStates>("pause-states")
    ]);

    return {
      loginAttempts: loginAttempts ?? [],
      pollData: pollData ?? undefined,
      pauseStates: pauseStates ?? {
        bot: {
          paused: false,
          timestamp: Date.now()
        }
      }
    };
  }

  onPollData(pollData: PollData): Promise<void> {
    return this.storage.set("poll-data", pollData);
  }

  // onRefreshToken(token: string): Promise<void> {
  //   return this.storage.saveRefreshToken(token);
  // }

  // onAccessToken(token: string): Promise<void> {
  //   return this.storage.saveAccessToken(token);
  // }

  // onCookies(cookies: string[]): Promise<void> {
  //   return this.storage.saveCookies(cookies);
  // }

  onLoginAttempts(attempts: number[]): Promise<void> {
    return this.storage.set("login-attempts", attempts);
  }

  async setPauseState(type: PauseType, state: PauseState): Promise<void> {
    const states = (await this.storage.getUnknown<PauseStates>("pause-states")) ?? {};
    states[type] = state;
    await this.storage.setUnknown("pause-states", states);
  }

  async getPauseState(type: PauseType): Promise<PauseState> {
    const states = (await this.storage.getUnknown<PauseStates>("pause-states")) ?? {};

    return (
      states[type] ?? {
        paused: false,
        timestamp: Date.now()
      }
    );
  }
}
