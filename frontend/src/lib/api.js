export async function createRoom() {
  const response = await fetch("/api/rooms/", { method: "POST" });
  if (!response.ok) throw new Error(`The server could not open a room (${response.status}).`);
  return response.json();
}

export function roomSocketUrl(roomId) {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws/rooms/${roomId}/`;
}

/** Parse an invite link (or a bare "/r/<id>#<key>") into { roomId, key }. */
export function parseInvite(text) {
  const match = text.trim().match(/\/r\/([A-Za-z0-9_-]{8,32})\/?#([A-Za-z0-9_-]{43})$/);
  return match ? { roomId: match[1], key: match[2] } : null;
}

export function inviteLink(roomId, key) {
  return `${window.location.origin}/r/${roomId}#${key}`;
}
