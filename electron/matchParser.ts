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

interface LcuParticipant {
  championId?: number;
  championName?: string;
  participantId?: number;
  stats?: {
    assists?: number;
    deaths?: number;
    goldEarned?: number;
    kills?: number;
    neutralMinionsKilled?: number;
    totalMinionsKilled?: number;
    win?: boolean;
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
  const queueId = game.queueId;

  return {
    assists: stats.assists ?? 0,
    championId,
    championName: participant.championName ?? championNames.get(championId) ?? `Champion ${championId}`,
    createdAt,
    deaths: stats.deaths ?? 0,
    durationSeconds: game.gameDuration ?? 0,
    gameId: game.gameId,
    gold: stats.goldEarned,
    kills: stats.kills ?? 0,
    queueId,
    queueName: getQueueName(queueId),
    result: typeof stats.win === "boolean" ? (stats.win ? "win" : "loss") : "unknown",
    cs: (stats.totalMinionsKilled ?? 0) + (stats.neutralMinionsKilled ?? 0)
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

  return identity?.participantId;
}

function parseCreatedAt(game: LcuGame) {
  if (typeof game.gameCreation === "number" && game.gameCreation > 0) {
    return game.gameCreation;
  }

  if (game.gameCreationDate) {
    const parsed = Date.parse(game.gameCreationDate);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeName(name?: string) {
  return name?.toLowerCase().replace(/\s+/g, "") ?? "";
}
