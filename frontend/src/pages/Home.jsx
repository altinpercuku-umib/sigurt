import { useState } from "react";
import { navigate } from "../App.jsx";
import { Wordmark } from "../components/Logo.jsx";
import { createRoom, parseInvite } from "../lib/api.js";
import { generateRoomKey } from "../lib/crypto.js";

const SAMPLE = [
  { name: "Quiet Lynx", color: "#2F7D6D", text: "Are we still meeting at 8?", sealed: "q7Rk2v+9XbLmA0…Jw3pYt" },
  { name: "Amber Heron", color: "#B5543C", text: "Yes. Bring the notes.", sealed: "Hc4Q8nZs1TfE…vO6mDa==" },
];

export default function Home() {
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState("");
  const [error, setError] = useState(null);

  async function openRoom() {
    setBusy(true);
    setError(null);
    try {
      const [{ id }, { encoded }] = await Promise.all([createRoom(), generateRoomKey()]);
      navigate(`/r/${id}#${encoded}`);
    } catch (err) {
      setError(err.message || "Could not open a room. Check your connection and try again.");
      setBusy(false);
    }
  }

  function joinRoom(event) {
    event.preventDefault();
    const parsed = parseInvite(invite);
    if (!parsed) {
      setError("That doesn't look like a Sigurt invite link. It should end with /r/…#… and include the key.");
      return;
    }
    navigate(`/r/${parsed.roomId}#${parsed.key}`);
  }

  return (
    <div className="home">
      <header className="home-header">
        <Wordmark size={30} />
      </header>

      <main className="home-main">
        <section className="hero">
          <div className="hero-copy">
            <h1>Private rooms for saying things once.</h1>
            <p className="lede">
              Open a room, send the link, talk. Every message is locked in your browser before it leaves, and
              the key stays in the link. You get a made-up name. Nobody signs up.
            </p>

            <div className="hero-actions">
              <button className="button button-primary" onClick={openRoom} disabled={busy}>
                {busy ? "Opening room…" : "Open a new room"}
              </button>
            </div>

            <form className="join" onSubmit={joinRoom}>
              <label htmlFor="invite">Have an invite link?</label>
              <div className="join-row">
                <input
                  id="invite"
                  className="input"
                  placeholder="Paste it here"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button className="button button-quiet" type="submit" disabled={!invite.trim()}>
                  Join room
                </button>
              </div>
            </form>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <figure className="two-views" aria-label="What you see compared with what the server stores">
            <div className="view view-clear">
              <figcaption>What your room sees</figcaption>
              {SAMPLE.map((m) => (
                <div className="sample-line" key={m.name}>
                  <span className="sample-name" style={{ color: m.color }}>
                    {m.name}
                  </span>
                  <span className="sample-text">{m.text}</span>
                </div>
              ))}
            </div>
            <div className="view view-sealed">
              <figcaption>What our server stores</figcaption>
              {SAMPLE.map((m) => (
                <div className="sample-line" key={m.name}>
                  <code>{m.sealed}</code>
                </div>
              ))}
            </div>
          </figure>
        </section>

        <section className="facts" aria-label="How Sigurt protects you">
          <div className="fact">
            <h2>The key lives in the link</h2>
            <p>It sits after the # in the address, a part browsers never send to a server. Lose the link and the room is unreadable, even to us.</p>
          </div>
          <div className="fact">
            <h2>Names are invented</h2>
            <p>Each tab gets a random name like Quiet Lynx. It's encrypted too, so the server can't tell who said what.</p>
          </div>
          <div className="fact">
            <h2>Messages don't stay</h2>
            <p>Encrypted messages are deleted after 24 hours, and rooms nobody uses are removed after three days.</p>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <p>No accounts, cookies or trackers. Encryption: AES-GCM 256 via your browser's Web Crypto.</p>
      </footer>
    </div>
  );
}
