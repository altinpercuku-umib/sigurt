import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptPayload,
  encryptPayload,
  generateRoomKey,
  importRoomKey,
  safetyCode,
} from "./crypto.js";

test("round-trips a message through the encoded key", async () => {
  const { encoded } = await generateRoomKey();
  const key = await importRoomKey(encoded);
  const message = { kind: "msg", text: "Përshëndetje 👋 — line one\nline two", name: "Quiet Lynx" };
  const sealed = await encryptPayload(key, "room-abc", message);
  assert.deepEqual(await decryptPayload(key, "room-abc", sealed), message);
});

test("ciphertext reveals nothing readable and is padded to a bucket", async () => {
  const { key } = await generateRoomKey();
  const sealed = await encryptPayload(key, "r", { text: "secret plans" });
  assert.ok(!atob(sealed.ciphertext).includes("secret"));
  // 256 bytes of padded plaintext + 16 byte GCM tag
  assert.equal(atob(sealed.ciphertext).length, 272);
});

test("rejects a payload moved to another room", async () => {
  const { key } = await generateRoomKey();
  const sealed = await encryptPayload(key, "room-one", { text: "hi" });
  assert.equal(await decryptPayload(key, "room-two", sealed), null);
});

test("rejects a payload under the wrong key", async () => {
  const a = await generateRoomKey();
  const b = await generateRoomKey();
  const sealed = await encryptPayload(a.key, "r", { text: "hi" });
  assert.equal(await decryptPayload(b.key, "r", sealed), null);
});

test("rejects tampered ciphertext", async () => {
  const { key } = await generateRoomKey();
  const sealed = await encryptPayload(key, "r", { text: "hi" });
  const bytes = Uint8Array.from(atob(sealed.ciphertext), (c) => c.charCodeAt(0));
  bytes[5] ^= 0xff;
  const tampered = { ...sealed, ciphertext: btoa(String.fromCharCode(...bytes)) };
  assert.equal(await decryptPayload(key, "r", tampered), null);
});

test("uses a fresh IV every time", async () => {
  const { key } = await generateRoomKey();
  const one = await encryptPayload(key, "r", { text: "same" });
  const two = await encryptPayload(key, "r", { text: "same" });
  assert.notEqual(one.iv, two.iv);
  assert.notEqual(one.ciphertext, two.ciphertext);
});

test("refuses malformed keys", async () => {
  await assert.rejects(importRoomKey("tooshort"));
});

test("safety code is stable for a key", async () => {
  const { encoded } = await generateRoomKey();
  const code = await safetyCode(encoded);
  assert.match(code, /^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$/);
  assert.equal(await safetyCode(encoded), code);
});
