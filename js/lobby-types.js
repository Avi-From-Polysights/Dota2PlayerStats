/** OpenDota lobby_type: ranked matchmaking (standard ranked). */
export const LOBBY_RANKED = 7;

export function isRankedLobby(lobbyType) {
  return lobbyType === LOBBY_RANKED;
}

export function lobbyLabel(lobbyType) {
  if (lobbyType === LOBBY_RANKED) return "Ranked";
  if (lobbyType == null) return "Unknown lobby";
  return `Lobby ${lobbyType}`;
}
