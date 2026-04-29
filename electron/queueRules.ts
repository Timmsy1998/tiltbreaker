export const SUMMONERS_RIFT_MAP_ID = 11;

export const SUMMONERS_RIFT_QUEUE_IDS = new Set([
  2,
  4,
  6,
  14,
  31,
  32,
  33,
  41,
  42,
  61,
  400,
  420,
  430,
  440,
  490,
  700,
  830,
  840,
  850,
  900,
  1020,
  1400,
  1900,
  2000,
  2010,
  2020
]);

export function isSummonersRiftQueue(queueId?: number, mapId?: number) {
  return mapId === SUMMONERS_RIFT_MAP_ID || (typeof queueId === "number" && SUMMONERS_RIFT_QUEUE_IDS.has(queueId));
}
