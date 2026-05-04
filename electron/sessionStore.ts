import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isSummonersRiftQueue } from "./queueRules";
import type {
  AppSnapshot,
  CompletedSession,
  LpDayState,
  MatchRole,
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
const REMAKE_MAX_DURATION_SECONDS = 5 * 60;
const MAX_NOTE_LENGTH = 2000;

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
    autoStartEnabled: false,
    bestOf: 3,
    breakMinutes: 60,
    notificationsEnabled: true,
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
    const completedBreak = getActiveCompletedSessionBreak(this.state.completedSessions, now);

    if (completedBreak && shouldRestoreCompletedBreak(this.state.series, completedBreak)) {
      this.state.series = getSeriesFromCompletedBreak(completedBreak);
      this.save();
      return;
    }

    if (
      this.state.series.status !== "break" ||
      (typeof this.state.series.breakUntil === "number" && this.state.series.breakUntil > now)
    ) {
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
      note: "",
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

  updateSeriesNote(note: string) {
    if (!this.state.series.startedAt) {
      return false;
    }

    const normalizedNote = normalizeNote(note);
    this.state.series = {
      ...this.state.series,
      note: normalizedNote
    };

    this.state.completedSessions = this.state.completedSessions.map((session) =>
      session.startedAt === this.state.series.startedAt ? { ...session, note: normalizedNote } : session
    );

    this.save();
    return true;
  }

  updateCompletedSessionNote(sessionId: string, note: string) {
    const normalizedNote = normalizeNote(note);
    let updatedSession: CompletedSession | undefined;

    this.state.completedSessions = this.state.completedSessions.map((session) => {
      if (session.id !== sessionId) {
        return session;
      }

      updatedSession = {
        ...session,
        note: normalizedNote
      };
      return updatedSession;
    });

    if (!updatedSession) {
      return false;
    }

    if (
      this.state.series.startedAt === updatedSession.startedAt &&
      this.state.series.endedAt === updatedSession.endedAt
    ) {
      this.state.series = {
        ...this.state.series,
        note: normalizedNote
      };
    }

    this.save();
    return true;
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
    const seriesMatches = getSeriesMatches(
      uniqueMatches(
        this.state.series.games
          .filter((match) => isSummonersRiftQueue(match.queueId))
          .concat(
            incomingMatches.filter(
              (match) =>
                match.createdAt >= startedAt - SESSION_MATCH_START_GRACE_MS && isSummonersRiftQueue(match.queueId)
            )
          )
      ),
      bestOf
    );

    const wins = countWins(seriesMatches);
    const losses = countLosses(seriesMatches);
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
    const wins = countWins(games);
    const losses = countLosses(games);
    const lpEnd = this.state.ranked;
    const lpDelta = getLpDelta(this.state.series.lpStart, lpEnd);

    const completedSession: CompletedSession = {
      bestOf,
      breakUntil,
      endedAt,
      games,
      id: `${startedAt}-${endedAt}`,
      losses,
      note: normalizeNote(this.state.series.note),
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
      const wins = countWins(games);
      const losses = countLosses(games);

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

      const wins = countWins(games);
      const losses = countLosses(games);

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

function getSeriesMatches(matches: MatchSummary[], bestOf: number) {
  const targetWins = Math.ceil(bestOf / 2);
  const seriesMatches: MatchSummary[] = [];
  let wins = 0;
  let losses = 0;

  for (const match of matches.sort((a, b) => a.createdAt - b.createdAt)) {
    seriesMatches.push(match);

    if (match.result === "win") {
      wins += 1;
    }

    if (match.result === "loss") {
      losses += 1;
    }

    if (wins >= targetWins || losses >= targetWins || wins + losses >= bestOf) {
      break;
    }
  }

  return seriesMatches;
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

  if (incomingMatch.role === "unknown" && storedMatch.role !== "unknown") {
    merged.role = storedMatch.role;
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
    const wins = countWins(games);
    const losses = countLosses(games);

    return {
      ...session,
      games,
      losses,
      note: normalizeNote(session.note),
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
    losses: countLosses(games),
    note: normalizeNote(series.note),
    wins: countWins(games)
  };
}

function normalizeNote(note: unknown) {
  return typeof note === "string" ? note.slice(0, MAX_NOTE_LENGTH) : "";
}

function hydrateMatches(matches: MatchSummary[]) {
  return matches.map(hydrateMatch);
}

function hydrateMatch(match: MatchSummary): MatchSummary {
  const kills = normalizeStat(match.kills);
  const deaths = normalizeStat(match.deaths);
  const assists = normalizeStat(match.assists);
  const durationSeconds = normalizeStat(match.durationSeconds);

  return {
    ...match,
    assists,
    cs: normalizeOptionalStat(match.cs),
    deaths,
    durationSeconds,
    gold: normalizeOptionalStat(match.gold),
    kdaRatio: typeof match.kdaRatio === "number" ? match.kdaRatio : getKdaRatio(kills, deaths, assists),
    kills,
    result: getHydratedResult(match.result, durationSeconds),
    role: normalizeRole(match.role)
  };
}

function normalizeRole(role: unknown): MatchRole {
  return role === "top" ||
    role === "jungle" ||
    role === "middle" ||
    role === "bottom" ||
    role === "support" ||
    role === "unknown"
    ? role
    : "unknown";
}

function getHydratedResult(result: unknown, durationSeconds: number): MatchSummary["result"] {
  if (isRemakeDuration(durationSeconds)) {
    return "remake";
  }

  return result === "win" || result === "loss" || result === "remake" || result === "unknown" ? result : "unknown";
}

function isRemakeDuration(durationSeconds: unknown) {
  return (
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    durationSeconds < REMAKE_MAX_DURATION_SECONDS
  );
}

function countWins(games: MatchSummary[]) {
  return games.filter((match) => match.result === "win").length;
}

function countLosses(games: MatchSummary[]) {
  return games.filter((match) => match.result === "loss").length;
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

function getActiveCompletedSessionBreak(sessions: CompletedSession[], now: number) {
  return sessions
    .filter(
      (session) =>
        session.result !== "incomplete" && typeof session.breakUntil === "number" && session.breakUntil > now
    )
    .sort((a, b) => b.endedAt - a.endedAt)[0];
}

function shouldRestoreCompletedBreak(series: SeriesState, session: CompletedSession) {
  return (
    series.status !== "break" ||
    series.breakUntil !== session.breakUntil ||
    series.startedAt !== session.startedAt ||
    series.endedAt !== session.endedAt ||
    series.games.length !== session.games.length
  );
}

function getSeriesFromCompletedBreak(session: CompletedSession): SeriesState {
  return {
    bestOf: session.bestOf,
    breakUntil: session.breakUntil,
    endedAt: session.endedAt,
    games: session.games,
    losses: session.losses,
    note: session.note ?? "",
    lpCurrent: session.lpEnd,
    lpDelta: session.lpDelta,
    lpStart: session.lpStart,
    startedAt: session.startedAt,
    status: "break",
    wins: session.wins
  };
}

function getDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
