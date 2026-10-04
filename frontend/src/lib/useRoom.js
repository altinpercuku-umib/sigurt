import { useCallback, useEffect, useRef, useState } from "react";
import { roomSocketUrl } from "./api.js";
import { decryptPayload, encryptPayload } from "./crypto.js";
import { randomId } from "./names.js";

const HEARTBEAT_MS = 20_000;
const PEER_TIMEOUT_MS = 50_000;
const TYPING_TIMEOUT_MS = 4_000;
const CLOSE_ROOM_NOT_FOUND = 4404;

/**
 * Connects to a room and handles all encryption.
 *
 * status: "connecting" | "open" | "reconnecting" | "missing"
 */
export function useRoom({ roomId, key, identity }) {
  const [status, setStatus] = useState("connecting");
  const [messages, setMessages] = useState([]);
  const [peers, setPeers] = useState({});
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const identityRef = useRef(identity);
  const queueRef = useRef(Promise.resolve()); // keeps decryption in arrival order

  identityRef.current = identity;

  // --- sending -------------------------------------------------------------

  const sendFrame = useCallback(
    async (type, data, extra = {}) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      const sealed = await encryptPayload(key, roomId, data);
      socket.send(JSON.stringify({ type, ...sealed, ...extra }));
      return true;
    },
    [key, roomId],
  );

  const announce = useCallback(
    (kind) => {
      const { id, name, color } = identityRef.current;
      return sendFrame("signal", { kind, id, name, color });
    },
    [sendFrame],
  );

  const sendMessage = useCallback(
    async (text) => {
      const { id, name, color } = identityRef.current;
      const ref = randomId(8);
      const sentAt = new Date().toISOString();
      setMessages((list) => [...list, { key: ref, ref, pending: true, senderId: id, name, color, text, sentAt }]);
      const ok = await sendFrame("message", { kind: "msg", id, name, color, text, sentAt }, { ref });
      if (!ok) {
        setMessages((list) => list.map((m) => (m.ref === ref ? { ...m, pending: false, failed: true } : m)));
      }
    },
    [sendFrame],
  );

  const lastTypingRef = useRef(0);
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current < 2_500) return;
    lastTypingRef.current = now;
    sendFrame("signal", { kind: "typing", id: identityRef.current.id });
  }, [sendFrame]);

  // --- receiving -------------------------------------------------------------

  const toMessage = useCallback(
    async (frame) => {
      const data = await decryptPayload(key, roomId, frame);
      const base = { key: `m${frame.id}`, id: frame.id, createdAt: frame.created_at, ref: frame.ref ?? null };
      if (!data || data.kind !== "msg" || typeof data.text !== "string") return { ...base, unreadable: true };
      return {
        ...base,
        senderId: String(data.id ?? ""),
        name: String(data.name ?? "Someone").slice(0, 40),
        color: typeof data.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(data.color) ? data.color : "#6B7785",
        text: data.text.slice(0, 4000),
      };
    },
    [key, roomId],
  );

  const handleSignal = useCallback(
    async (frame) => {
      const data = await decryptPayload(key, roomId, frame);
      if (!data || typeof data.id !== "string" || data.id === identityRef.current.id) return;
      const now = Date.now();
      setPeers((current) => {
        const next = { ...current };
        if (data.kind === "bye") {
          delete next[data.id];
        } else if (data.kind === "typing") {
          if (next[data.id]) next[data.id] = { ...next[data.id], seen: now, typingUntil: now + TYPING_TIMEOUT_MS };
        } else if (data.kind === "hello" || data.kind === "here") {
          next[data.id] = {
            id: data.id,
            name: String(data.name ?? "Someone").slice(0, 40),
            color: typeof data.color === "string" ? data.color : "#6B7785",
            seen: now,
            typingUntil: 0,
          };
        }
        return next;
      });
      // Let newcomers know who is already here.
      if (data.kind === "hello") announce("here");
    },
    [key, roomId, announce],
  );

  const handleFrame = useCallback(
    (frame) => {
      queueRef.current = queueRef.current.then(async () => {
        if (frame.type === "history") {
          const decrypted = await Promise.all(frame.messages.map(toMessage));
          setMessages((list) => [...decrypted, ...list.filter((m) => m.pending || m.failed)]);
        } else if (frame.type === "message") {
          const message = await toMessage(frame);
          setMessages((list) => {
            if (list.some((m) => m.id === message.id)) return list;
            const withoutPending = message.ref ? list.filter((m) => m.ref !== message.ref || !m.pending) : list;
            return [...withoutPending, message];
          });
          if (message.senderId) {
            setPeers((current) =>
              current[message.senderId]?.typingUntil
                ? { ...current, [message.senderId]: { ...current[message.senderId], typingUntil: 0 } }
                : current,
            );
          }
        } else if (frame.type === "signal") {
          await handleSignal(frame);
        } else if (frame.type === "error") {
          setError(
            frame.error === "rate_limited"
              ? "You're sending too fast. Wait a few seconds and try again."
              : "The server rejected a message.",
          );
        }
      });
    },
    [toMessage, handleSignal],
  );

  // --- connection lifecycle ------------------------------------------------

  useEffect(() => {
    let stopped = false;
    let retry = 0;
    let retryTimer;

    function connect() {
      const socket = new WebSocket(roomSocketUrl(roomId));
      socketRef.current = socket;

      socket.onopen = () => {
        retry = 0;
        setStatus("open");
        setError(null);
        announce("hello");
      };
      socket.onmessage = (event) => {
        try {
          handleFrame(JSON.parse(event.data));
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = (event) => {
        if (stopped) return;
        if (event.code === CLOSE_ROOM_NOT_FOUND) {
          setStatus("missing");
          return;
        }
        setStatus("reconnecting");
        retry += 1;
        retryTimer = setTimeout(connect, Math.min(15_000, 500 * 2 ** retry));
      };
    }

    connect();

    const heartbeat = setInterval(() => announce("here"), HEARTBEAT_MS);
    const sweep = setInterval(() => {
      const cutoff = Date.now() - PEER_TIMEOUT_MS;
      setPeers((current) => {
        const stale = Object.values(current).filter((p) => p.seen < cutoff);
        if (!stale.length) return current;
        const next = { ...current };
        stale.forEach((p) => delete next[p.id]);
        return next;
      });
    }, 5_000);

    const sayBye = () => announce("bye");
    window.addEventListener("pagehide", sayBye);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(heartbeat);
      clearInterval(sweep);
      window.removeEventListener("pagehide", sayBye);
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        announce("bye").finally(() => socket.close());
      } else {
        socket?.close();
      }
    };
  }, [roomId, announce, handleFrame]);

  return { status, messages, peers, error, sendMessage, sendTyping, announce, dismissError: () => setError(null) };
}
