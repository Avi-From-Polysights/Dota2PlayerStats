/** OpenDota game_mode id for Turbo (Ability Draft Turbo uses a different id). */
export const GAMEMODE_NONE = 0;
export const GAMEMODE_ALL_PICK = 1;
export const GAMEMODE_CAPTAINS_MODE = 2;
export const GAMEMODE_RANDOM_DRAFT = 3;
export const GAMEMODE_SINGLE_DRAFT = 4;
export const GAMEMODE_ALL_RANDOM = 5;
export const GAMEMODE_ABILITY_DRAFT = 18;
export const GAMEMODE_ARDM = 20;
export const GAMEMODE_1V1_MID = 21;
export const GAMEMODE_ALL_DRAFT = 22;
export const GAMEMODE_TURBO = 23;

/** Common public matchmaking modes that most ranked/unranked ladders use. */
export const STANDARD_GAME_MODES = new Set([
  GAMEMODE_ALL_PICK,
  GAMEMODE_CAPTAINS_MODE,
  GAMEMODE_RANDOM_DRAFT,
  GAMEMODE_SINGLE_DRAFT,
  GAMEMODE_ALL_RANDOM,
  GAMEMODE_ALL_DRAFT,
]);

export const GAMEMODE_LABELS = {
  [GAMEMODE_ALL_PICK]: "All Pick",
  [GAMEMODE_CAPTAINS_MODE]: "Captains Mode",
  [GAMEMODE_RANDOM_DRAFT]: "Random Draft",
  [GAMEMODE_SINGLE_DRAFT]: "Single Draft",
  [GAMEMODE_ALL_RANDOM]: "All Random",
  [GAMEMODE_ABILITY_DRAFT]: "Ability Draft",
  [GAMEMODE_ARDM]: "ARDM",
  [GAMEMODE_1V1_MID]: "1v1 Mid",
  [GAMEMODE_ALL_DRAFT]: "All Draft",
  [GAMEMODE_TURBO]: "Turbo",
};

export function gameModeLabel(modeId) {
  return GAMEMODE_LABELS[modeId] ?? `Mode ${modeId}`;
}

export function isStandardGameMode(modeId) {
  return STANDARD_GAME_MODES.has(modeId);
}
