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

  normalizeBreak(now = Date.now()) {
    if (this.state.series.status !== "break") {
      return;
    }

    if (typeof this.state.series.breakUntil === "number" && this.state.series.breakUntil > now) {
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
    const now = Date.now();
    this.normalizeBreak(now);

    if (this.state.series.status !== "idle") {
      return false;
    }

    this.state.series = {
      bestOf: this.state.settings.bestOf,
      endedAt: undefined,
      games: [],
      losses: 0,
      lpStart: this.state.ranked,
      startedAt: now,
      status: "active",
      wins: 0
    };
    this.save();
    return true;
  }

  endSeries() {
    this.finishActiveSeries(this.state.series.games);
  }

  clearBreak() {
    const now = Date.now();
    this.normalizeBreak(now);

    if (this.state.series.status !== "idle") {
      return false;
    }

    this.state.series = {
      endedAt: undefined,
      games: [],
      losses: 0,
      status: "idle",
      wins: 0
    };
    this.save();
    return true;
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
    const incomingMatches = uniqueMatches(matches);
    this.state.recentMatches = uniqueMatches([...incomingMatches, ...this.state.recentMatches]).slice(0, 12);
    this.refreshStoredSessionMatches(incomingMatches);

    if (this.state.series.status !== "active" || !this.state.series.startedAt) {
      this.save();
      return;
    }

    const bestOf = this.state.series.bestOf ?? this.state.settings.bestOf;
    const targetWins = Math.ceil(bestOf / 2);
    const startedAt = this.state.series.startedAt ?? 0;
    const seriesMatches = uniqueMatches(
      this.state.series.games
        .filter((match) => isSummonersRiftQueue(match.queueId))
        .concat(
          incomingMatches.filter(
            (match) =>
              match.createdAt >= startedAt - SESSION_MATCH_START_GRACE_MS && isSummonersRiftQueue(match.queueId)
          )
        )
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
        completedSessions: hydrateCompletedSessions(loaded.completedSessions ?? defaultState.completedSessions),
        lpDay: loaded.lpDay,
        ranked: loaded.ranked,
        recentMatches: hydrateMatches(loaded.recentMatches ?? defaultState.recentMatches),
        series: hydrateSeries({
          ...defaultState.series,
          ...loaded.series,
          games: loaded.series?.games ?? defaultState.series.games
        }),
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

    const now = Date.now();
    const startedAt = this.state.series.startedAt ?? now;
    const endedAt = getLatestGameEndedAt(games) ?? now;
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

  private refreshStoredSessionMatches(matches: MatchSummary[]) {
    if (!matches.length) {
      return;
    }

    const incomingById = new Map(matches.map((match) => [match.gameId, match]));

    if (this.state.series.games.length) {
      const games = updateStoredGames(this.state.series.games, incomingById);
      const wins = games.filter((match) => match.result === "win").length;
      const losses = games.filter((match) => match.result === "loss").length;

      this.state.series = {
        ...this.state.series,
        games,
        losses,
        wins
      };
    }

    this.state.completedSessions = this.state.completedSessions.map((session) => {
      const games = updateStoredGames(session.games, incomingById);

      if (games === session.games) {
        return session;
      }

      const wins = games.filter((match) => match.result === "win").length;
      const losses = games.filter((match) => match.result === "loss").length;

      return {
        ...session,
        games,
        losses,
        result: getSessionResult(session.bestOf, wins, losses),
        wins
      };
    });
  }
}

function uniqueMatches(matches: MatchSummary[]) {
  const seen = new Map<number, number>();
  const unique: MatchSummary[] = [];

  for (const match of matches) {
    const existingIndex = seen.get(match.gameId);

    if (typeof existingIndex === "number") {
      unique[existingIndex] = mergeMatchStats(unique[existingIndex], match);
      continue;
    }

    seen.set(match.gameId, unique.length);
    unique.push(hydrateMatch(match));
  }

  return unique.sort((a, b) => b.createdAt - a.createdAt);
}

function updateStoredGames(games: MatchSummary[], incomingById: Map<number, MatchSummary>) {
  let changed = false;
  const updated = games.map((game) => {
    const incoming = incomingById.get(game.gameId);

    if (!incoming) {
      return hydrateMatch(game);
    }

    changed = true;
    return mergeMatchStats(game, incoming);
  });

  return changed ? updated : games;
}

function mergeMatchStats(stored: MatchSummary, incoming: MatchSummary): MatchSummary {
  const storedMatch = hydrateMatch(stored);
  const incomingMatch = hydrateMatch(incoming);
  const incomingHasStats = hasNonZeroStats(incomingMatch);
  const storedHasStats = hasNonZeroStats(storedMatch);
  const merged: MatchSummary = {
    ...storedMatch,
    ...incomingMatch
  };

  if (!incomingHasStats && storedHasStats) {
    merged.assists = storedMatch.assists;
    merged.cs = storedMatch.cs;
    merged.deaths = storedMatch.deaths;
    merged.gold = storedMatch.gold;
    merged.kdaRatio = storedMatch.kdaRatio;
    merged.kills = storedMatch.kills;
  }

  if (typeof incomingMatch.cs !== "number" && typeof storedMatch.cs === "number") {
    merged.cs = storedMatch.cs;
  }

  if (typeof incomingMatch.gold !== "number" && typeof storedMatch.gold === "number") {
    merged.gold = storedMatch.gold;
  }

  if (incomingMatch.result === "unknown" && storedMatch.result !== "unknown") {
    merged.result = storedMatch.result;
  }

  if (isFallbackChampionName(incomingMatch.championName) && !isFallbackChampionName(storedMatch.championName)) {
    merged.championName = storedMatch.championName;
  }

  if (!incomingMatch.queueName && storedMatch.queueName) {
    merged.queueName = storedMatch.queueName;
  }

  if (!incomingMatch.durationSeconds && storedMatch.durationSeconds) {
    merged.durationSeconds = storedMatch.durationSeconds;
  }

  if (!incomingMatch.createdAt && storedMatch.createdAt) {
    merged.createdAt = storedMatch.createdAt;
  }

  return hydrateMatch(merged);
}

function hydrateCompletedSessions(sessions: CompletedSession[]) {
  return sessions.map((session) => {
    const games = hydrateMatches(session.games ?? []);
    const wins = games.filter((match) => match.result === "win").length;
    const losses = games.filter((match) => match.result === "loss").length;

    return {
      ...session,
      games,
      losses,
      result: getSessionResult(session.bestOf, wins, losses),
      wins
    };
  });
}

function hydrateSeries(series: SeriesState): SeriesState {
  const games = hydrateMatches(series.games ?? []);

  return {
    ...series,
    games,
    losses: games.filter((match) => match.result === "loss").length,
    wins: games.filter((match) => match.result === "win").length
  };
}

function hydrateMatches(matches: MatchSummary[]) {
  return matches.map(hydrateMatch);
}

function hydrateMatch(match: MatchSummary): MatchSummary {
  const kills = normalizeStat(match.kills);
  const deaths = normalizeStat(match.deaths);
  const assists = normalizeStat(match.assists);

  return {
    ...match,
    assists,
    cs: normalizeOptionalStat(match.cs),
    deaths,
    durationSeconds: normalizeStat(match.durationSeconds),
    gold: normalizeOptionalStat(match.gold),
    kdaRatio: typeof match.kdaRatio === "number" ? match.kdaRatio : getKdaRatio(kills, deaths, assists),
    kills
  };
}

function hasNonZeroStats(match: MatchSummary) {
  return Boolean(match.kills || match.deaths || match.assists || match.cs || match.gold);
}

function getKdaRatio(kills: number, deaths: number, assists: number) {
  return Number(((kills + assists) / Math.max(1, deaths)).toFixed(2));
}

function normalizeStat(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeOptionalStat(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFallbackChampionName(name: string) {
  return /^Champion \d+$/i.test(name);
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

function getLatestGameEndedAt(games: MatchSummary[]) {
  const latestEndedAt = games.reduce((latest, game) => {
    if (!game.createdAt) {
      return latest;
    }

    const durationMs =
      typeof game.durationSeconds === "number" && Number.isFinite(game.durationSeconds)
        ? game.durationSeconds * 1000
        : 0;

    return Math.max(latest, game.createdAt + durationMs);
  }, 0);

  return latestEndedAt || undefined;
}

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
