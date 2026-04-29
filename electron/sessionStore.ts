import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isSummonersRiftQueue } from "./queueRules";
import type { AppSnapshot, MatchSummary, SeriesState, TiltBreakerSettings } from "./types";

interface PersistedState {
  recentMatches: MatchSummary[];
  series: SeriesState;
  settings: TiltBreakerSettings;
}

const defaultState: PersistedState = {
  recentMatches: [],
  series: {
    games: [],
    losses: 0,
    status: "idle",
    wins: 0
  },
  settings: {
    bestOf: 3,
    breakMinutes: 60,
    queueGuardEnabled: true
  }
};

export class SessionStore {
  private state: PersistedState;

  constructor(private readonly statePath: string) {
    this.state = this.load();
  }

  get settings() {
    return this.state.settings;
  }

  get series() {
    return this.state.series;
  }

  get recentMatches() {
    return this.state.recentMatches;
  }

  normalizeBreak() {
    if (this.state.series.status !== "break" || !this.state.series.breakUntil) {
      return;
    }

    if (this.state.series.breakUntil > Date.now()) {
      return;
    }

    this.state.series = {
      games: [],
      losses: 0,
      status: "idle",
      wins: 0
    };
    this.save();
  }

  snapshot(base: Omit<AppSnapshot, "settings" | "series" | "recentMatches">): AppSnapshot {
    this.normalizeBreak();

    return {
      ...base,
      settings: this.state.settings,
      series: this.state.series,
      recentMatches: this.state.recentMatches
    };
  }

  startSeries() {
    this.state.series = {
      bestOf: this.state.settings.bestOf,
      games: [],
      losses: 0,
      startedAt: Date.now(),
      status: "active",
      wins: 0
    };
    this.save();
  }

  endSeries() {
    this.state.series = {
      ...this.state.series,
      breakUntil: Date.now() + this.state.settings.breakMinutes * 60 * 1000,
      status: "break"
    };
    this.save();
  }

  clearBreak() {
    this.state.series = {
      games: [],
      losses: 0,
      status: "idle",
      wins: 0
    };
    this.save();
  }

  updateSettings(settings: Partial<TiltBreakerSettings>) {
    this.state.settings = {
      ...this.state.settings,
      ...settings
    };
    this.save();
  }

  mergeMatches(matches: MatchSummary[]) {
    this.state.recentMatches = uniqueMatches([...matches, ...this.state.recentMatches]).slice(0, 12);

    if (this.state.series.status !== "active" || !this.state.series.startedAt) {
      this.save();
      return;
    }

    const bestOf = this.state.series.bestOf ?? this.state.settings.bestOf;
    const targetWins = Math.ceil(bestOf / 2);
    const seriesMatches = uniqueMatches(
      matches
        .filter(
          (match) => match.createdAt >= (this.state.series.startedAt ?? 0) && isSummonersRiftQueue(match.queueId)
        )
        .concat(this.state.series.games.filter((match) => isSummonersRiftQueue(match.queueId)))
    )
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, bestOf);

    const wins = seriesMatches.filter((match) => match.result === "win").length;
    const losses = seriesMatches.filter((match) => match.result === "loss").length;

    this.state.series = {
      ...this.state.series,
      games: seriesMatches,
      wins,
      losses
    };

    if (wins >= targetWins || losses >= targetWins || seriesMatches.length >= bestOf) {
      this.state.series = {
        ...this.state.series,
        breakUntil: Date.now() + this.state.settings.breakMinutes * 60 * 1000,
        status: "break"
      };
    }

    this.save();
  }

  private load(): PersistedState {
    if (!existsSync(this.statePath)) {
      return defaultState;
    }

    try {
      const loaded = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<PersistedState>;

      return {
        recentMatches: loaded.recentMatches ?? defaultState.recentMatches,
        series: loaded.series ?? defaultState.series,
        settings: {
          ...defaultState.settings,
          ...loaded.settings
        }
      };
    } catch {
      return defaultState;
    }
  }

  private save() {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }
}

function uniqueMatches(matches: MatchSummary[]) {
  const seen = new Set<number>();
  const unique: MatchSummary[] = [];

  for (const match of matches) {
    if (seen.has(match.gameId)) {
      continue;
    }

    seen.add(match.gameId);
    unique.push(match);
  }

  return unique.sort((a, b) => b.createdAt - a.createdAt);
}
