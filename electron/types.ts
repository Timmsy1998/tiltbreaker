export type LcuPhase =
  | "None"
  | "Lobby"
  | "Matchmaking"
  | "ReadyCheck"
  | "ChampSelect"
  | "GameStart"
  | "InProgress"
  | "Reconnect"
  | "WaitingForStats"
  | "PreEndOfGame"
  | "EndOfGame"
  | string;

export type QueueGate = "open" | "closed" | "unavailable";
export type SeriesBestOf = 3 | 5;

export interface SummonerInfo {
  accountId?: number;
  displayName: string;
  gameName?: string;
  internalName?: string;
  profileIconId?: number;
  puuid?: string;
  summonerId?: number;
  tagLine?: string;
}

export interface MatchParticipantStats {
  kills?: number;
  deaths?: number;
  assists?: number;
  champLevel?: number;
  totalMinionsKilled?: number;
  neutralMinionsKilled?: number;
  goldEarned?: number;
  win?: boolean;
}

export interface MatchSummary {
  assists: number;
  championId: number;
  championName: string;
  createdAt: number;
  deaths: number;
  durationSeconds: number;
  gameId: number;
  kdaRatio: number;
  kills: number;
  queueId?: number;
  queueName?: string;
  result: "win" | "loss" | "remake" | "unknown";
  cs?: number;
  gold?: number;
}

export interface RankedPosition {
  division?: string;
  leaguePoints: number;
  queueName: string;
  queueType: string;
  score?: number;
  tier?: string;
}

export interface RankedSnapshot {
  capturedAt: number;
  positions: RankedPosition[];
  totalScore?: number;
}

export interface LpDayState {
  current?: RankedSnapshot;
  dateKey: string;
  delta?: number;
  start?: RankedSnapshot;
}

export interface SeriesState {
  bestOf?: SeriesBestOf;
  breakUntil?: number;
  endedAt?: number;
  games: MatchSummary[];
  losses: number;
  note?: string;
  lpCurrent?: RankedSnapshot;
  lpDelta?: number;
  lpStart?: RankedSnapshot;
  startedAt?: number;
  status: "idle" | "active" | "break";
  wins: number;
}

export interface CompletedSession {
  bestOf: SeriesBestOf;
  breakUntil?: number;
  endedAt: number;
  games: MatchSummary[];
  id: string;
  losses: number;
  note?: string;
  lpDelta?: number;
  lpEnd?: RankedSnapshot;
  lpStart?: RankedSnapshot;
  result: "win" | "loss" | "incomplete";
  startedAt: number;
  wins: number;
}

export interface TiltBreakerSettings {
  autoStartEnabled: boolean;
  bestOf: SeriesBestOf;
  breakMinutes: number;
  lockfilePath?: string;
  notificationsEnabled: boolean;
  queueGuardEnabled: boolean;
}

export interface QueueContext {
  id?: number;
  isSummonersRift: boolean;
  mapId?: number;
  mode?: string;
  name?: string;
}

export interface QueueGuardState {
  currentQueue?: QueueContext;
  enabled: boolean;
  gate: QueueGate;
  lastBlockedAt?: number;
  lastBlockedReason?: string;
}

export interface LcuStatus {
  connected: boolean;
  lockfilePath?: string;
  phase?: LcuPhase;
  summoner?: SummonerInfo;
  lastError?: string;
}

export interface AppSnapshot {
  completedSessions: CompletedSession[];
  lcu: LcuStatus;
  lpDay?: LpDayState;
  now: number;
  queueGuard: QueueGuardState;
  ranked?: RankedSnapshot;
  recentMatches: MatchSummary[];
  series: SeriesState;
  settings: TiltBreakerSettings;
}
