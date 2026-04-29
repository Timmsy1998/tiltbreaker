import { getQueueName } from "./queueRules";
import type { RankedPosition, RankedSnapshot } from "./types";

const RANKED_SR_QUEUE_TYPES = new Set(["RANKED_SOLO_5x5", "RANKED_FLEX_SR"]);
const TIER_SCORE = new Map([
  ["IRON", 0],
  ["BRONZE", 400],
  ["SILVER", 800],
  ["GOLD", 1200],
  ["PLATINUM", 1600],
  ["EMERALD", 2000],
  ["DIAMOND", 2400],
  ["MASTER", 2800],
  ["GRANDMASTER", 3200],
  ["CHALLENGER", 3600]
]);
const DIVISION_SCORE = new Map([
  ["IV", 0],
  ["III", 100],
  ["II", 200],
  ["I", 300]
]);

interface LcuRankedStats {
  queueMap?: Record<string, unknown>;
  queues?: Record<string, unknown>;
}

interface LcuRankedQueue {
  division?: string;
  isProvisional?: boolean;
  leaguePoints?: number;
  queueType?: string;
  ratedRating?: number;
  tier?: string;
}

export function parseRankedSnapshot(response: unknown): RankedSnapshot | undefined {
  const rankedStats = response as LcuRankedStats | undefined;
  const queueMap = rankedStats?.queueMap ?? rankedStats?.queues;

  if (!queueMap || typeof queueMap !== "object") {
    return undefined;
  }

  const positions = Object.entries(queueMap)
    .map(([queueType, value]) => parsePosition(queueType, value))
    .filter((position): position is RankedPosition => Boolean(position));
  const scores = positions.map((position) => position.score).filter((score): score is number => typeof score === "number");

  return {
    capturedAt: Date.now(),
    positions,
    totalScore: scores.length ? scores.reduce((total, score) => total + score, 0) : undefined
  };
}

function parsePosition(queueType: string, value: unknown): RankedPosition | undefined {
  if (!RANKED_SR_QUEUE_TYPES.has(queueType) || !value || typeof value !== "object") {
    return undefined;
  }

  const queue = value as LcuRankedQueue;
  const tier = normalizeRank(queue.tier);
  const division = normalizeRank(queue.division);
  const leaguePoints = typeof queue.leaguePoints === "number" ? queue.leaguePoints : 0;
  const score = getRankScore(tier, division, leaguePoints);

  if (!tier && !score) {
    return undefined;
  }

  return {
    division,
    leaguePoints,
    queueName: getRankedQueueName(queueType),
    queueType,
    score,
    tier
  };
}

function getRankScore(tier?: string, division?: string, leaguePoints = 0) {
  if (!tier) {
    return undefined;
  }

  const tierBase = TIER_SCORE.get(tier);

  if (typeof tierBase !== "number") {
    return undefined;
  }

  return tierBase + (DIVISION_SCORE.get(division ?? "") ?? 0) + leaguePoints;
}

function getRankedQueueName(queueType: string) {
  if (queueType === "RANKED_SOLO_5x5") {
    return getQueueName(420) ?? "Ranked Solo/Duo";
  }

  if (queueType === "RANKED_FLEX_SR") {
    return getQueueName(440) ?? "Ranked Flex";
  }

  return queueType;
}

function normalizeRank(value?: string) {
  const normalized = value?.toUpperCase();
  return normalized && normalized !== "NONE" && normalized !== "NA" ? normalized : undefined;
}
