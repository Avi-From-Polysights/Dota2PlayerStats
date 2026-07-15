/** OpenDota lobby_type IDs (Valve / OpenDota constants). */
export const LOBBY_INVALID = 0;
export const LOBBY_PRACTICE = 1;
export const LOBBY_TOURNAMENT = 2;
export const LOBBY_TUTORIAL = 3;
export const LOBBY_COOP_BOTS = 4;
export const LOBBY_RANKED_TEAM = 5;
export const LOBBY_RANKED_SOLO = 6;
export const LOBBY_RANKED = 7;
export const LOBBY_1V1_MID = 8;
export const LOBBY_BATTLE_CUP = 9;

export const LOBBY_LABELS = {
  [LOBBY_INVALID]: "Public / unranked",
  [LOBBY_PRACTICE]: "Practice",
  [LOBBY_TOURNAMENT]: "Tournament",
  [LOBBY_TUTORIAL]: "Tutorial",
  [LOBBY_COOP_BOTS]: "Co-op bots",
  [LOBBY_RANKED_TEAM]: "Ranked team",
  [LOBBY_RANKED_SOLO]: "Ranked solo (legacy)",
  [LOBBY_RANKED]: "Ranked",
  [LOBBY_1V1_MID]: "1v1 Mid",
  [LOBBY_BATTLE_CUP]: "Battle Cup",
};

export function isRankedLobby(lobbyType) {
  return (
    lobbyType === LOBBY_RANKED ||
    lobbyType === LOBBY_RANKED_TEAM ||
    lobbyType === LOBBY_RANKED_SOLO
  );
}

export function isBotLobby(lobbyType) {
  return lobbyType === LOBBY_COOP_BOTS;
}

export function isPracticeOrTutorialLobby(lobbyType) {
  return lobbyType === LOBBY_PRACTICE || lobbyType === LOBBY_TUTORIAL;
}

export function lobbyLabel(lobbyType) {
  if (lobbyType == null) return "Unknown lobby";
  return LOBBY_LABELS[lobbyType] ?? `Lobby ${lobbyType}`;
}

/**
 * Heuristic: co-op bots lobby, or enough opposing players with no real account id.
 * OpenDota lists bots often leave account_id null/0.
 */
export function looksLikeBotMatch(details, accountId) {
  if (isBotLobby(details?.lobby_type)) return true;

  const players = details?.players ?? [];
  if (players.length < 2) return false;

  const me = players.find((p) => p.account_id === accountId);
  if (!me) return false;

  const myRadiant = me.player_slot < 128;
  const opponents = players.filter((p) => (p.player_slot < 128) !== myRadiant);
  if (!opponents.length) return false;

  const botOpponents = opponents.filter((p) => !p.account_id || p.account_id === 0).length;
  // Majority of the enemy team look like bots
  return botOpponents >= Math.ceil(opponents.length / 2);
}
