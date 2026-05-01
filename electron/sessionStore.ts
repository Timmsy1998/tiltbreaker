import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isSummonersRiftQueue } from "./queueRules";
import type {
  AppSnapshot,
  CompletedSession,
  LpDayState,
  MatchSummary,
  RankedSnapshot,
  SeriesState,
  TiltBreakerSettings
} from "./types";

interface PersistedState {
  completedSessions: CompletedSession[];
  lpDay?: LpDayState;
  ranked?: RankedSnapshot;
  recentMatches: MatchSummary[];
  series: SeriesState;
  settings: TiltBreakerSettings;
}

const SESSION_MATCH_START_GRACE_MS = 15 * 60 * 1000;

const defaultState: PersistedState = {
  completedSessions: [],
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

  get completedSessions() {
    return this.state.completedSessions;
  }

  get ranked() {
    return this.state.ranked;
  }

  get lpDay() {
    return this.state.lpDay;
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

  snapshot(
    base: Omit<AppSnapshot, "completedSessions" | "lpDay" | "ranked" | "settings" | "series" | "recentMatches">
  ): AppSnapshot {
    this.normalizeBreak();

    return {
      ...base,
      completedSessions: this.state.completedSessions,
      lpDay: this.state.lpDay,
      ranked: this.state.ranked,
      settings: this.state.settings,
      series: this.state.series,
      recentMatches: this.state.recentMatches
    };
  }

  startSeries() {
    this.state.series = {
      bestOf: this.state.settings.bestOf,
      endedAt: undefined,
      games: [],
      losses: 0,
      lpStart: this.state.ranked,
      startedAt: Date.now(),
      status: "active",
      wins: 0
    };
    this.save();
  }

  endSeries() {
    this.finishActiveSeries(this.state.series.games);
  }

  clearBreak() {
    this.state.series = {
      endedAt: undefined,
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

  updateRanked(ranked: RankedSnapshot | undefined) {
    if (!ranked) {
      return;
    }

    this.state.ranked = ranked;

    const dateKey = getDateKey();
    if (!this.state.lpDay || this.state.lpDay.dateKey !== dateKey) {
      this.state.lpDay = {
        current: ranked,
        dateKey,
        delta: 0,
        start: ranked
      };
    } else {
      this.state.lpDay = {
        ...this.state.lpDay,
        current: ranked,
        delta: getLpDelta(this.state.lpDay.start, ranked)
      };
    }

    if (this.state.series.status === "active") {
      this.state.series = {
        ...this.state.series,
        lpCurrent: ranked,
        lpDelta: getLpDelta(this.state.series.lpStart, ranked)
      };
    }

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
    const startedAt = this.state.series.startedAt ?? 0;
    const seriesMatches = uniqueMatches(
      matches
        .filter(
          (match) => match.createdAt >= startedAt - SESSION_MATCH_START_GRACE_MS && isSummonersRiftQueue(match.queueId)
        )
        .concat(this.state.series.games.filter((match) => isSummonersRiftQueue(match.queueId)))
    )
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, bestOf);

    const wins = seriesMatches.filter((match) => match.result === "win").length;
    const losses = seriesMatches.filter((match) => match.result === "loss").length;
    const decidedGames = wins + losses;

    this.state.series = {
      ...this.state.series,
      games: seriesMatches,
      lpCurrent: this.state.ranked,
      lpDelta: getLpDelta(this.state.series.lpStart, this.state.ranked),
      wins,
      losses
    };

    if (wins >= targetWins || losses >= targetWins || decidedGames >= bestOf) {
      this.finishActiveSeries(seriesMatches);
      return;
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
        completedSessions: loaded.completedSessions ?? defaultState.completedSessions,
        lpDay: loaded.lpDay,
        ranked: loaded.ranked,
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

  private finishActiveSeries(games: MatchSummary[]) {
    if (this.state.series.status !== "active") {
      return;
    }

    const startedAt = this.state.series.startedAt ?? Date.now();
    const endedAt = Date.now();
    const breakUntil = endedAt + this.state.settings.breakMinutes * 60 * 1000;
    const bestOf = this.state.series.bestOf ?? this.state.settings.bestOf;
    const wins = games.filter((match) => match.result === "win").length;
    const losses = games.filter((match) => match.result === "loss").length;
    const lpEnd = this.state.ranked;
    const lpDelta = getLpDelta(this.state.series.lpStart, lpEnd);

    const completedSession: CompletedSession = {
      bestOf,
      breakUntil,
      endedAt,
      games,
      id: `${startedAt}-${endedAt}`,
      losses,
      lpDelta,
      lpEnd,
      lpStart: this.state.series.lpStart,
      result: getSessionResult(bestOf, wins, losses),
      startedAt,
      wins
    };

    this.state.completedSessions = [
      completedSession,
      ...this.state.completedSessions.filter((session) => session.startedAt !== startedAt)
    ].slice(0, 30);

    this.state.series = {
      ...this.state.series,
      breakUntil,
      endedAt,
      games,
      losses,
      lpCurrent: lpEnd,
      lpDelta,
      status: "break",
      wins
    };
    this.save();
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

function getLpDelta(start: RankedSnapshot | undefined, current: RankedSnapshot | undefined) {
  if (typeof start?.totalScore !== "number" || typeof current?.totalScore !== "number") {
    return undefined;
  }

  return current.totalScore - start.totalScore;
}

function getSessionResult(bestOf: number, wins: number, losses: number): CompletedSession["result"] {
  const targetWins = Math.ceil(bestOf / 2);

  if (wins >= targetWins || wins > losses) {
    return "win";
  }

  if (losses >= targetWins || losses > wins) {
    return "loss";
  }

  return "incomplete";
}

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
