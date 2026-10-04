// Random identities. Generated in the browser and only ever sent encrypted,
// so the server never learns who is called what.

const ADJECTIVES = [
  "Quiet", "Amber", "Silver", "Hidden", "Gentle", "Swift", "Misty", "Velvet",
  "Copper", "Lunar", "Wandering", "Distant", "Calm", "Brave", "Hollow", "Golden",
  "Northern", "Restless", "Patient", "Clever", "Faded", "Bright", "Midnight", "Salt",
  "Cedar", "Paper", "Iron", "Glass", "Winter", "Harbor", "Shy", "Wild",
];

const ANIMALS = [
  "Lynx", "Heron", "Otter", "Falcon", "Fox", "Ibex", "Wren", "Marten",
  "Owl", "Hare", "Raven", "Badger", "Stork", "Moth", "Seal", "Viper",
  "Bison", "Crane", "Gecko", "Kestrel", "Mole", "Newt", "Puffin", "Robin",
  "Shrike", "Tapir", "Wolf", "Yak", "Eagle", "Lark", "Pike", "Swift",
];

// Hues for identity dots and names. Chosen to stay readable on both themes.
export const COLORS = ["#2F7D6D", "#B5543C", "#4F63B8", "#9A6B12", "#8A4FA3", "#2F7598", "#A1475E", "#5E7A2C"];

function randomInt(max) {
  const value = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return value % max;
}

export function randomName() {
  let name;
  do {
    name = `${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]}`;
  } while (name === "Swift Swift");
  return name;
}

export function randomColor() {
  return COLORS[randomInt(COLORS.length)];
}

export function randomId(bytes = 9) {
  const raw = globalThis.crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(raw, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, bytes * 2);
}

// One identity per room per browser tab. It survives reloads of that tab but
// is gone as soon as the tab closes.
export function loadIdentity(roomId) {
  const storageKey = `sigurt:identity:${roomId}`;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.id && saved?.name && saved?.color) return saved;
  } catch {
    /* storage unavailable: fall through to a fresh identity */
  }
  const identity = { id: randomId(), name: randomName(), color: randomColor() };
  saveIdentity(roomId, identity);
  return identity;
}

export function saveIdentity(roomId, identity) {
  try {
    sessionStorage.setItem(`sigurt:identity:${roomId}`, JSON.stringify(identity));
  } catch {
    /* ignore */
  }
}

export function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}
