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

const QUEUE_NAMES = new Map<number, string>([
  [2, "Blind Pick"],
  [4, "Ranked Solo"],
  [6, "Ranked Premade"],
  [14, "Draft Pick"],
  [31, "Co-op vs AI Intro"],
  [32, "Co-op vs AI Beginner"],
  [33, "Co-op vs AI Intermediate"],
  [41, "Ranked Team 3v3"],
  [42, "Ranked Team 5v5"],
  [61, "Team Builder"],
  [400, "Draft Pick"],
  [420, "Ranked Solo/Duo"],
  [430, "Blind Pick"],
  [440, "Ranked Flex"],
  [450, "ARAM"],
  [490, "Quickplay"],
  [700, "Clash"],
  [830, "Co-op vs AI Intro"],
  [840, "Co-op vs AI Beginner"],
  [850, "Co-op vs AI Intermediate"],
  [900, "ARURF"],
  [1020, "One for All"],
  [1090, "TFT Normal"],
  [1100, "TFT Ranked"],
  [1110, "TFT Hyper Roll"],
  [1130, "TFT Double Up"],
  [1160, "TFT Normal"],
  [1400, "Ultimate Spellbook"],
  [1700, "Arena"],
  [1900, "URF"],
  [2000, "Tutorial 1"],
  [2010, "Tutorial 2"],
  [2020, "Tutorial 3"]
]);

export function isSummonersRiftQueue(queueId?: number, mapId?: number) {
  return mapId === SUMMONERS_RIFT_MAP_ID || (typeof queueId === "number" && SUMMONERS_RIFT_QUEUE_IDS.has(queueId));
}

export function getQueueName(queueId?: number) {
  if (typeof queueId !== "number") {
    return undefined;
  }

  return QUEUE_NAMES.get(queueId) ?? `Queue ${queueId}`;
}
