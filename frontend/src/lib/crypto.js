// End-to-end encryption for Sigurt rooms.
//
// Each room has one AES-GCM 256-bit key, generated in the browser of whoever
// opens the room. The key is placed in the URL fragment (/r/<room>#<key>);
// browsers never send the fragment to the server, so only people holding the
// invite link can read the room.
//
// Every payload is encrypted with a fresh 96-bit IV, bound to its room via
// AES-GCM additional data, and padded to a 256-byte bucket so the ciphertext
// size reveals little about the message length.

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PAD_BUCKET = 256;

// --- base64 helpers ---------------------------------------------------------

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const normal = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- keys -------------------------------------------------------------------

/** Create a new room key. Returns { key: CryptoKey, encoded: base64url string }. */
export async function generateRoomKey() {
  const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await subtle.exportKey("raw", key));
  return { key, encoded: bytesToBase64Url(raw) };
}

/** Import a key from the base64url string found in an invite link. Throws if malformed. */
export async function importRoomKey(encoded) {
  const raw = base64ToBytes(encoded);
  if (raw.length !== 32) throw new Error("A room key must be 32 bytes.");
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * A short safety code derived from the key. Everyone in the same room sees the
 * same code; comparing it out loud confirms nobody swapped the link.
 */
export async function safetyCode(encoded) {
  const digest = new Uint8Array(await subtle.digest("SHA-256", base64ToBytes(encoded)));
  const hex = Array.from(digest.subarray(0, 6), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return hex.match(/.{4}/g).join(" ");
}

// --- payloads ---------------------------------------------------------------

function pad(bytes) {
  const size = Math.ceil((bytes.length + 1) / PAD_BUCKET) * PAD_BUCKET;
  const out = new Uint8Array(size); // trailing zero bytes are the padding
  out.set(bytes);
  return out;
}

function unpad(bytes) {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return bytes.subarray(0, end);
}

/** Encrypt a JSON-serialisable object for a room. */
export async function encryptPayload(key, roomId, data) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = pad(encoder.encode(JSON.stringify(data)));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(roomId) },
    key,
    plaintext,
  );
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

/** Decrypt a payload. Returns the object, or null if it was tampered with or uses another key. */
export async function decryptPayload(key, roomId, { iv, ciphertext }) {
  try {
    const plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(iv), additionalData: encoder.encode(roomId) },
      key,
      base64ToBytes(ciphertext),
    );
    return JSON.parse(decoder.decode(unpad(new Uint8Array(plaintext))));
  } catch {
    return null;
  }
}
