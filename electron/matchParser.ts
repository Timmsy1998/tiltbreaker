import { getQueueName } from "./queueRules";
import type { MatchSummary, SummonerInfo } from "./types";

interface LcuMatchHistoryResponse {
  games?: {
    games?: unknown[];
  };
}

interface LcuGame {
  gameCreation?: number;
  gameCreationDate?: string;
  gameDuration?: number;
  gameId?: number;
  participants?: LcuParticipant[];
  participantIdentities?: LcuIdentity[];
  queueId?: number;
}

type LcuNumericStat = number | string;

interface LcuParticipant {
  accountId?: number;
  championId?: number;
  championName?: string;
  participantId?: number;
  puuid?: string;
  summonerId?: number;
  summonerName?: string;
  stats?: {
    assists?: LcuNumericStat;
    championsKilled?: LcuNumericStat;
    deaths?: LcuNumericStat;
    goldEarned?: LcuNumericStat;
    kills?: LcuNumericStat;
    neutralMinionsKilled?: LcuNumericStat;
    numDeaths?: LcuNumericStat;
    totalMinionsKilled?: LcuNumericStat;
    win?: boolean | string | number;
  };
}

interface LcuIdentity {
  participantId?: number;
  player?: {
    accountId?: number;
    currentAccountId?: number;
    currentPlatformId?: string;
    matchHistoryUri?: string;
    platformId?: string;
    profileIcon?: number;
    puuid?: string;
    summonerId?: number;
    summonerName?: string;
  };
}

export function parseMatches(
  response: unknown,
  summoner: SummonerInfo | undefined,
  championNames = new Map<number, string>()
) {
  const history = response as LcuMatchHistoryResponse | undefined;
  const games = history?.games?.games;

  if (!Array.isArray(games) || !summoner) {
    return [];
  }

  return games
    .map((game) => parseGame(game as LcuGame, summoner, championNames))
    .filter((match): match is MatchSummary => Boolean(match));
}

function parseGame(
  game: LcuGame,
  summoner: SummonerInfo,
  championNames: Map<number, string>
): MatchSummary | undefined {
  if (!game.gameId) {
    return undefined;
  }

  const participantId = findParticipantId(game, summoner);
  const participant = game.participants?.find((entry) => entry.participantId === participantId);

  if (!participant) {
    return undefined;
  }

  const stats = participant.stats ?? {};
  const createdAt = parseCreatedAt(game);
  const championId = participant.championId ?? 0;
  const kills = normalizeNumber(stats.kills ?? stats.championsKilled);
  const deaths = normalizeNumber(stats.deaths ?? stats.numDeaths);
  const assists = normalizeNumber(stats.assists);
  const queueId = game.queueId;

  return {
    assists,
    championId,
    championName: participant.championName ?? championNames.get(championId) ?? `Champion ${championId}`,
    createdAt,
    deaths,
    durationSeconds: normalizeDuration(game.gameDuration),
    gameId: game.gameId,
    gold: normalizeOptionalNumber(stats.goldEarned),
    kdaRatio: getKdaRatio(kills, deaths, assists),
    kills,
    queueId,
    queueName: getQueueName(queueId),
    result: parseResult(stats.win),
    cs: normalizeNumber(stats.totalMinionsKilled) + normalizeNumber(stats.neutralMinionsKilled)
  };
}

function findParticipantId(game: LcuGame, summoner: SummonerInfo) {
  const identity = game.participantIdentities?.find(({ player }) => {
    if (!player) {
      return false;
    }

    return (
      Number(player.summonerId) === Number(summoner.summonerId) ||
      Number(player.accountId) === Number(summoner.accountId) ||
      Number(player.currentAccountId) === Number(summoner.accountId) ||
      player.puuid === summoner.puuid ||
      normalizeName(player.summonerName) === normalizeName(summoner.displayName) ||
      normalizeName(player.summonerName) === normalizeName(summoner.gameName)
    );
  });

  if (identity?.participantId) {
    return identity.participantId;
  }

  const participant = game.participants?.find(
    (entry) =>
      entry.puuid === summoner.puuid ||
      Number(entry.summonerId) === Number(summoner.summonerId) ||
      Number(entry.accountId) === Number(summoner.accountId) ||
      normalizeName(entry.summonerName) === normalizeName(summoner.displayName) ||
      normalizeName(entry.summonerName) === normalizeName(summoner.gameName)
  );

  return participant?.participantId;
}

function parseCreatedAt(game: LcuGame) {
  if (typeof game.gameCreation === "number" && game.gameCreation > 0) {
    return normalizeTimestamp(game.gameCreation);
  }

  if (game.gameCreationDate) {
    const parsed = Date.parse(game.gameCreationDate);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeTimestamp(timestamp: number) {
  return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function normalizeDuration(duration: number | undefined) {
  const normalized = normalizeNumber(duration);
  return normalized > 100_000 ? Math.floor(normalized / 1000) : normalized;
}

function parseResult(value: boolean | string | number | undefined): MatchSummary["result"] {
  if (typeof value === "boolean") {
    return value ? "win" : "loss";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? (value > 0 ? "win" : "loss") : "unknown";
  }

  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "win" ||
    normalized === "won" ||
    normalized === "victory" ||
    normalized === "true" ||
    normalized === "1"
  ) {
    return "win";
  }

  if (
    normalized === "fail" ||
    normalized === "loss" ||
    normalized === "lost" ||
    normalized === "defeat" ||
    normalized === "false" ||
    normalized === "0"
  ) {
    return "loss";
  }

  return "unknown";
}

function getKdaRatio(kills: number, deaths: number, assists: number) {
  return Number(((kills + assists) / Math.max(1, deaths)).toFixed(2));
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeName(name?: string) {
  return name?.toLowerCase().replace(/\s+/g, "") ?? "";
}
