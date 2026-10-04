import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../App.jsx";
import { LockMark, Wordmark } from "../components/Logo.jsx";
import { inviteLink } from "../lib/api.js";
import { importRoomKey, safetyCode } from "../lib/crypto.js";
import { initials, loadIdentity, randomColor, randomName, saveIdentity } from "../lib/names.js";
import { useRoom } from "../lib/useRoom.js";

const MAX_LENGTH = 4000;

export default function Room({ roomId, encodedKey }) {
  const [key, setKey] = useState(null);
  const [code, setCode] = useState("");
  const [keyError, setKeyError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([importRoomKey(encodedKey), safetyCode(encodedKey)])
      .then(([imported, fingerprint]) => {
        if (cancelled) return;
        setKey(imported);
        setCode(fingerprint);
      })
      .catch(() => !cancelled && setKeyError(true));
    return () => {
      cancelled = true;
    };
  }, [encodedKey]);

  if (keyError || !encodedKey) {
    return (
      <Notice title="This link is missing its key">
        Sigurt keeps each room's key after the # in the invite link. Ask whoever invited you to send the whole
        link again, exactly as it was copied.
      </Notice>
    );
  }
  if (!key) return <div className="room-loading" aria-busy="true" />;

  return <ConnectedRoom roomId={roomId} cryptoKey={key} encodedKey={encodedKey} code={code} />;
}

function ConnectedRoom({ roomId, cryptoKey, encodedKey, code }) {
  const [identity, setIdentity] = useState(() => loadIdentity(roomId));
  const room = useRoom({ roomId, key: cryptoKey, identity });
  const [showPeople, setShowPeople] = useState(false);
  const [toast, setToast] = useState(null);

  const others = Object.values(room.peers).sort((a, b) => a.name.localeCompare(b.name));
  const now = Date.now();
  const typing = others.filter((p) => p.typingUntil > now);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Re-render periodically so typing indicators expire on time.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink(roomId, encodedKey));
      setToast("Invite link copied");
    } catch {
      setToast("Copy failed. Select the address bar and copy it from there.");
    }
  }

  function newName() {
    const next = { ...identity, name: randomName(), color: randomColor() };
    saveIdentity(roomId, next);
    setIdentity(next);
  }

  // Tell the room about a new name once identity has changed.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    room.announce("hello");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  if (room.status === "missing") {
    return (
      <Notice title="This room no longer exists">
        Rooms are removed after three days without messages. Open a new one and send a fresh invite link.
      </Notice>
    );
  }

  return (
    <div className="room">
      <header className="room-bar">
        <a
          className="room-home"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          aria-label="Sigurt home"
        >
          <Wordmark size={26} sealing />
        </a>

        <ConnectionState status={room.status} />

        <div className="room-bar-actions">
          <button
            className="button button-quiet people-toggle"
            onClick={() => setShowPeople((v) => !v)}
            aria-expanded={showPeople}
            aria-controls="people-panel"
          >
            {others.length + 1} here
          </button>
          <button className="button button-primary" onClick={copyInvite}>
            Copy invite link
          </button>
        </div>
      </header>

      <div className="room-body">
        <aside id="people-panel" className={`people${showPeople ? " is-open" : ""}`} aria-label="People in this room">
          <section className="people-section">
            <h2>You</h2>
            <div className="person is-you">
              <Avatar name={identity.name} color={identity.color} />
              <span className="person-name">{identity.name}</span>
            </div>
            <button className="text-button" onClick={newName}>
              Get a new name
            </button>
          </section>

          <section className="people-section">
            <h2>{others.length ? "Also here" : "Waiting for others"}</h2>
            {others.length ? (
              <ul className="people-list">
                {others.map((p) => (
                  <li key={p.id} className="person">
                    <Avatar name={p.name} color={p.color} />
                    <span className="person-name">{p.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Copy the invite link and send it to someone you trust.</p>
            )}
          </section>

          <section className="people-section safety">
            <h2>Safety code</h2>
            <p className="safety-code" aria-label={`Safety code ${code}`}>
              {code}
            </p>
            <p className="muted">
              Everyone with the same link sees these characters. Compare them over another channel to be sure
              your link wasn't altered.
            </p>
          </section>
        </aside>

        <Conversation
          messages={room.messages}
          selfId={identity.id}
          typing={typing}
          onSend={room.sendMessage}
          onTyping={room.sendTyping}
          canSend={room.status === "open"}
          error={room.error}
          onDismissError={room.dismissError}
        />
      </div>

      <div className={`toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function ConnectionState({ status }) {
  const label = {
    connecting: "Connecting",
    open: "Encrypted",
    reconnecting: "Reconnecting",
  }[status];
  return (
    <span className={`connection connection-${status}`}>
      <span className="connection-dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function Avatar({ name, color }) {
  return (
    <span className="avatar" style={{ "--who": color }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function Conversation({ messages, selfId, typing, onSend, onTyping, canSend, error, onDismissError }) {
  const [draft, setDraft] = useState("");
  const logRef = useRef(null);
  const stickToBottom = useRef(true);

  const groups = useMemo(() => groupMessages(messages), [messages]);

  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [messages, typing.length]);

  function onScroll() {
    const log = logRef.current;
    stickToBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  }

  function submit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !canSend) return;
    stickToBottom.current = true;
    onSend(text.slice(0, MAX_LENGTH));
    setDraft("");
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  }

  return (
    <main className="conversation">
      <div className="log" ref={logRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
        {groups.length === 0 ? (
          <div className="empty">
            <LockMark size={44} />
            <p className="empty-title">This room is empty and sealed.</p>
            <p className="muted">
              Messages you send here are encrypted before they leave this tab and deleted after 24 hours.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <MessageGroup key={group.key} group={group} mine={group.senderId === selfId} />
          ))
        )}
        {typing.length > 0 && (
          <p className="typing">
            {typing.map((p) => p.name).join(", ")} {typing.length === 1 ? "is" : "are"} typing
          </p>
        )}
      </div>

      {error && (
        <div className="room-error" role="alert">
          <span>{error}</span>
          <button className="text-button" onClick={onDismissError}>
            Dismiss
          </button>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="composer-input">
          Message
        </label>
        <textarea
          id="composer-input"
          className="composer-input"
          rows={1}
          placeholder={canSend ? "Write a message" : "Waiting for the connection…"}
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value) onTyping();
          }}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <button className="button button-primary composer-send" type="submit" disabled={!canSend || !draft.trim()}>
          Send
        </button>
      </form>
    </main>
  );
}

function MessageGroup({ group, mine }) {
  if (group.unreadable) {
    return <p className="unreadable">A message here was encrypted with a different key and can't be shown.</p>;
  }
  return (
    <div className={`group${mine ? " is-mine" : ""}`}>
      {!mine && (
        <div className="group-head">
          <Avatar name={group.name} color={group.color} />
          <span className="group-name" style={{ "--who": group.color }}>
            {group.name}
          </span>
        </div>
      )}
      {group.messages.map((m) => (
        <div
          key={m.key}
          className={`bubble${m.pending ? " is-pending" : ""}${m.failed ? " is-failed" : ""}`}
          title={formatTime(m.createdAt || m.sentAt, true)}
        >
          <span className="bubble-text">{m.text}</span>
          <span className="bubble-meta">
            {m.failed ? "Not sent" : m.pending ? "Sending" : formatTime(m.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

function groupMessages(messages) {
  const groups = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const time = new Date(m.createdAt || m.sentAt || Date.now()).getTime();
    if (m.unreadable) {
      groups.push({ key: m.key, unreadable: true });
      continue;
    }
    if (last && !last.unreadable && last.senderId === m.senderId && last.name === m.name && time - last.lastTime < 5 * 60_000) {
      last.messages.push(m);
      last.lastTime = time;
    } else {
      groups.push({ key: m.key, senderId: m.senderId, name: m.name, color: m.color, messages: [m], lastTime: time });
    }
  }
  return groups;
}

function formatTime(iso, long = false) {
  if (!iso) return "";
  const date = new Date(iso);
  return long
    ? date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Notice({ title, children }) {
  return (
    <div className="notice">
      <LockMark size={56} />
      <h1>{title}</h1>
      <p>{children}</p>
      <button className="button button-primary" onClick={() => navigate("/")}>
        Go to Sigurt
      </button>
    </div>
  );
}
