import type { BotStorage } from "./Persistence";
import type { PollData } from "./PollData";

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
  constructor(private readonly storage: BotStorage) {}

  async onRun(): Promise<OnRun> {
    const [loginAttempts, pollData, pauseStates] = await Promise.all([
      this.storage.loadLoginAttempts(),
      this.storage.loadPollData(),
      this.storage.loadData<PauseStates>("pause-states")
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
    return this.storage.savePollData(pollData);
  }

  onRefreshToken(token: string): Promise<void> {
    return this.storage.saveRefreshToken(token);
  }

  onAccessToken(token: string): Promise<void> {
    return this.storage.saveAccessToken(token);
  }

  onCookies(cookies: string[]): Promise<void> {
    return this.storage.saveCookies(cookies);
  }

  onLoginAttempts(attempts: number[]): Promise<void> {
    return this.storage.saveLoginAttempts(attempts);
  }

  async setPauseState(type: PauseType, state: PauseState): Promise<void> {
    const states = (await this.storage.loadData<PauseStates>("pause-states")) ?? {};
    states[type] = state;
    await this.storage.saveData("pause-states", states);
  }

  async getPauseState(type: PauseType): Promise<PauseState> {
    const states = (await this.storage.loadData<PauseStates>("pause-states")) ?? {};

    return (
      states[type] ?? {
        paused: false,
        timestamp: Date.now()
      }
    );
  }
}
