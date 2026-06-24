/** OpenDota game_mode id for Turbo (Ability Draft Turbo uses a different id). */
export const GAMEMODE_TURBO = 23;

export const GAMEMODE_LABELS = {
  1: "All Pick",
  2: "Captains Mode",
  22: "All Draft",
  23: "Turbo",
};

export function gameModeLabel(modeId) {
  return GAMEMODE_LABELS[modeId] ?? `Mode ${modeId}`;
}
