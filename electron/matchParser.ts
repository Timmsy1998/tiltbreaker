import { getQueueName } from "./queueRules";
import type { MatchRole, MatchSummary, SummonerInfo } from "./types";

const REMAKE_MAX_DURATION_SECONDS = 5 * 60;
const SMITE_SUMMONER_SPELL_IDS = new Set([11]);
const KNOWN_SUPPORT_ITEM_IDS = new Set([
  3301,
  3302,
  3303,
  3850,
  3851,
  3853,
  3854,
  3855,
  3857,
  3858,
  3859,
  3860,
  3862,
  3863,
  3864,
  3865,
  3866,
  3867,
  3869,
  3870,
  3871,
  3876,
  3877
]);

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
  individualPosition?: string;
  lane?: string;
  participantId?: number;
  puuid?: string;
  role?: string;
  spell1Id?: LcuNumericStat;
  spell2Id?: LcuNumericStat;
  summoner1Id?: LcuNumericStat;
  summoner2Id?: LcuNumericStat;
  summonerSpell1Id?: LcuNumericStat;
  summonerSpell2Id?: LcuNumericStat;
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
    spell1Id?: LcuNumericStat;
    spell2Id?: LcuNumericStat;
    summoner1Id?: LcuNumericStat;
    summoner2Id?: LcuNumericStat;
    summonerSpell1Id?: LcuNumericStat;
    summonerSpell2Id?: LcuNumericStat;
    totalMinionsKilled?: LcuNumericStat;
    win?: boolean | string | number;
  };
  teamPosition?: string;
  timeline?: {
    lane?: string;
    role?: string;
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
  championNames = new Map<number, string>(),
  supportItemIds = new Set<number>()
) {
  const history = response as LcuMatchHistoryResponse | undefined;
  const games = history?.games?.games;

  if (!Array.isArray(games) || !summoner) {
    return [];
  }

  return games
    .map((game) => parseGame(game as LcuGame, summoner, championNames, supportItemIds))
    .filter((match): match is MatchSummary => Boolean(match));
}

function parseGame(
  game: LcuGame,
  summoner: SummonerInfo,
  championNames: Map<number, string>,
  supportItemIds: Set<number>
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
  const durationSeconds = normalizeDuration(game.gameDuration);

  return {
    assists,
    championId,
    championName: participant.championName ?? championNames.get(championId) ?? `Champion ${championId}`,
    createdAt,
    deaths,
    durationSeconds,
    gameId: game.gameId,
    gold: normalizeOptionalNumber(stats.goldEarned),
    kdaRatio: getKdaRatio(kills, deaths, assists),
    kills,
    queueId,
    queueName: getQueueName(queueId),
    result: parseResult(stats.win, durationSeconds),
    role: parseRole(participant, supportItemIds),
    cs: normalizeNumber(stats.totalMinionsKilled) + normalizeNumber(stats.neutralMinionsKilled)
  };
}

function parseRole(participant: LcuParticipant, supportItemIds: Set<number>): MatchRole {
  if (hasSmite(participant)) {
    return "jungle";
  }

  if (hasSupportItem(participant, supportItemIds)) {
    return "support";
  }

  const roleCandidates = [
    participant.teamPosition,
    participant.individualPosition,
    getTimelineRole(participant.timeline?.lane, participant.timeline?.role),
    getTimelineRole(participant.lane, participant.role),
    participant.lane,
    participant.role
  ];

  for (const candidate of roleCandidates) {
    const role = normalizeRole(candidate);

    if (role === "top" || role === "middle" || role === "bottom") {
      return role;
    }
  }

  return "unknown";
}

function hasSmite(participant: LcuParticipant) {
  return getSummonerSpellIds(participant).some((spellId) => SMITE_SUMMONER_SPELL_IDS.has(spellId));
}

function hasSupportItem(participant: LcuParticipant, supportItemIds: Set<number>) {
  const knownSupportItemIds = new Set([...KNOWN_SUPPORT_ITEM_IDS, ...supportItemIds]);
  return getParticipantItemIds(participant).some((itemId) => knownSupportItemIds.has(itemId));
}

function getSummonerSpellIds(participant: LcuParticipant) {
  return getNumericFields(participant, [
    "spell1Id",
    "spell2Id",
    "summoner1Id",
    "summoner2Id",
    "summonerSpell1Id",
    "summonerSpell2Id"
  ]).concat(
    getNumericFields(participant.stats, [
      "spell1Id",
      "spell2Id",
      "summoner1Id",
      "summoner2Id",
      "summonerSpell1Id",
      "summonerSpell2Id"
    ])
  );
}

function getParticipantItemIds(participant: LcuParticipant) {
  const itemKeys = ["item0", "item1", "item2", "item3", "item4", "item5", "item6"];
  return getNumericFields(participant, itemKeys).concat(getNumericFields(participant.stats, itemKeys));
}

function getNumericFields(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return [];
  }

  const record = source as Record<string, unknown>;
  return keys.map((key) => normalizeNumber(record[key])).filter((value) => value > 0);
}

function getTimelineRole(lane?: string, role?: string) {
  const normalizedLane = lane?.trim().toUpperCase();
  const normalizedRole = role?.trim().toUpperCase();

  if (normalizedLane === "BOTTOM" && normalizedRole === "DUO_SUPPORT") {
    return "SUPPORT";
  }

  if (normalizedLane === "BOTTOM" && (normalizedRole === "DUO_CARRY" || normalizedRole === "DUO")) {
    return "BOTTOM";
  }

  return normalizedLane;
}

function normalizeRole(value?: string): MatchRole {
  const normalized = value?.trim().toUpperCase();

  if (!normalized || normalized === "NONE" || normalized === "INVALID" || normalized === "UNSELECTED") {
    return "unknown";
  }

  if (normalized === "TOP") {
    return "top";
  }

  if (normalized === "JUNGLE") {
    return "jungle";
  }

  if (normalized === "MID" || normalized === "MIDDLE") {
    return "middle";
  }

  if (normalized === "BOT" || normalized === "BOTTOM" || normalized === "ADC" || normalized === "DUO_CARRY") {
    return "bottom";
  }

  if (normalized === "UTILITY" || normalized === "SUPPORT" || normalized === "DUO_SUPPORT") {
    return "support";
  }

  return "unknown";
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

function parseResult(value: boolean | string | number | undefined, durationSeconds: number): MatchSummary["result"] {
  if (isRemakeDuration(durationSeconds)) {
    return "remake";
  }

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

function isRemakeDuration(durationSeconds: number) {
  return durationSeconds > 0 && durationSeconds < REMAKE_MAX_DURATION_SECONDS;
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
