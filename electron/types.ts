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
  kills: number;
  queueId?: number;
  result: "win" | "loss" | "unknown";
  cs?: number;
  gold?: number;
}

export interface SeriesState {
  bestOf?: SeriesBestOf;
  breakUntil?: number;
  games: MatchSummary[];
  losses: number;
  startedAt?: number;
  status: "idle" | "active" | "break";
  wins: number;
}

export interface TiltBreakerSettings {
  bestOf: SeriesBestOf;
  breakMinutes: number;
  lockfilePath?: string;
  queueGuardEnabled: boolean;
}

export interface QueueContext {
  id?: number;
  isSummonersRift: boolean;
  mapId?: number;
  mode?: string;
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
  lcu: LcuStatus;
  now: number;
  queueGuard: QueueGuardState;
  recentMatches: MatchSummary[];
  series: SeriesState;
  settings: TiltBreakerSettings;
}
