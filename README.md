<p align="center">
  <img src="docs/logo.svg" width="72" alt="Sigurt logo" />
</p>

<h1 align="center">Sigurt</h1>

<p align="center">
  Anonymous, end-to-end encrypted chat rooms. No sign-up, no login, no real names.
</p>

<p align="center">
  <strong><a href="https://sigurt.onrender.com">Try it live at sigurt.onrender.com</a></strong><br />
  <sub>Hosted on a free server: if nobody has used it for a while, the first visit takes about a minute to wake up.</sub>
</p>

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/altinpercuku-umib/sigurt">
    <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" />
  </a>
</p>

<p align="center">
  <img src="docs/room-light.png" alt="A Sigurt room with two people chatting" width="820" />
</p>

*Sigurt* is Albanian for "safe". Open a room, share the invite link, and talk. Messages are encrypted in the
browser before they are sent, so the server stores and relays only ciphertext it cannot read. Everyone gets a
randomly generated name such as *Quiet Lynx*, and that name is encrypted too.

## Features

- **End-to-end encryption** with AES-GCM 256 through the browser's Web Crypto API
- **The key lives in the link.** It is placed after the `#` in the invite URL, which browsers never send to a server
- **Random identities** per room and tab, with a one-click "Get a new name"
- **No accounts, cookies or trackers**, and no third-party requests (fonts are self-hosted)
- **Live presence and typing indicators**, also encrypted
- **Safety code**: a short fingerprint of the room key that members can compare to detect a tampered link
- **Messages expire** after 24 hours; idle rooms are removed after 3 days
- **Padding**: every message is padded to 256-byte blocks so its size reveals little about its length
- Light and dark themes, responsive down to phone screens

<p align="center">
  <img src="docs/home.png" alt="Sigurt home page" width="49%" />
  <img src="docs/room-dark.png" alt="A room in dark mode" width="49%" />
</p>

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, Web Crypto API |
| Backend | Django 5, Django Channels (WebSockets), Daphne (ASGI) |
| Database | PostgreSQL 16 |
| Realtime fan-out | Redis channel layer (optional; in-memory for a single process) |
| Deployment | Docker Compose, nginx |

## How the encryption works

```
 Browser A                          Server                          Browser B
 ─────────                          ──────                          ─────────
 generate AES-256 key
 POST /api/rooms/  ───────────────▶ creates room id
 invite = /r/<room>#<key>
            ── invite link shared out of band (the server never sees #<key>) ──▶
 encrypt({name, text}) ──────────▶ stores {iv, ciphertext} ──────▶ decrypt with key
```

1. Opening a room creates a random 256-bit key in the browser and a random room id on the server.
2. The invite link is `https://host/r/<room-id>#<key>`. The fragment after `#` is never part of an HTTP
   request, so the server cannot learn it.
3. Every message and presence signal is serialised to JSON, padded, and encrypted with a fresh 96-bit IV.
   The room id is bound in as AES-GCM additional data, so ciphertext can't be replayed into another room.
4. The server validates only the shape and size of `{iv, ciphertext}`, stores messages in PostgreSQL, and
   broadcasts them over WebSockets.
5. The safety code is the first 6 bytes of `SHA-256(key)`. Matching codes mean matching keys.

### What the server can still see

Being honest about limits matters for a privacy tool:

- That a room exists, when messages are sent, and roughly how large they are (to the nearest 256 bytes)
- IP addresses at the network level (Sigurt doesn't log them, but your host or proxy might; use Tor or a VPN if that matters)
- Anyone who has the full invite link can read the room. Share it only with people you trust
- There is no forward secrecy: one key per room. A leaked link exposes that room's messages until they expire

## Project structure

```
sigurt/
├── backend/                 Django project
│   ├── sigurt/              settings, ASGI routing, URLs
│   └── chat/                models, REST views, WebSocket consumer, tests
├── frontend/                React app (Vite)
│   └── src/
│       ├── lib/crypto.js    all encryption code (+ tests)
│       ├── lib/useRoom.js   WebSocket connection and message handling
│       ├── lib/names.js     random name generator
│       └── pages/           Home and Room screens
├── Dockerfile               single-image build (used for Render)
├── render.yaml              one-click Render deployment
├── docker-compose.yml
└── docs/                    logo and screenshots
```

## Put it online (free, on Render)

The repo includes a [Render Blueprint](render.yaml) that creates everything in one go: a web service built
from the root `Dockerfile` (Django serving the compiled React app) and a PostgreSQL database, both in
Frankfurt.

1. Click **Deploy to Render** at the top of this page and sign in to Render with GitHub.
2. Review the two resources (`sigurt` and `sigurt-db`) and click **Deploy Blueprint**.
3. Wait for the first build (a few minutes). Your public link is shown on the `sigurt` service page,
   e.g. `https://sigurt.onrender.com` (Render adds a suffix if the name is taken).

Things to know about Render's free plan:

- The service goes to sleep after 15 minutes without visitors; the next visit takes about a minute to wake it.
- **Free databases are deleted 30 days after creation** (with a 14-day grace period). Before then, either upgrade
  `sigurt-db` or point `DATABASE_URL` at a free PostgreSQL that doesn't expire (for example
  [Neon](https://neon.tech)). Sigurt stores only short-lived ciphertext, so moving databases loses nothing important.
- Expired messages are cleaned up on startup and at most hourly while people create rooms.

## Run it with Docker (easiest)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/altinpercuku-umib/sigurt.git
cd sigurt
docker compose up --build
```

Open http://localhost:8080.

For a real deployment, set `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD` and `DJANGO_ALLOWED_HOSTS` (your domain)
in a `.env` file next to `docker-compose.yml`, and put the app behind HTTPS. Web Crypto only works on
`https://` pages and `localhost`.

## Run it for development

You need Python 3.11+, Node 20+ and PostgreSQL.

**1. Database**

```sql
CREATE USER sigurt WITH PASSWORD 'sigurt';
CREATE DATABASE sigurt OWNER sigurt;
```

**2. Backend** (in `backend/`)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
python manage.py migrate
python manage.py runserver    # Daphne serves HTTP and WebSockets on :8000
```

**3. Frontend** (in `frontend/`, second terminal)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Vite forwards `/api` and `/ws` to the backend.

## Tests

```bash
cd backend && python manage.py test    # REST API, WebSocket relay, validation, rate limit, expiry
cd frontend && npm test                # encryption round-trips, tamper detection, padding, safety codes
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://sigurt:sigurt@localhost:5432/sigurt` | PostgreSQL connection |
| `REDIS_URL` | unset | Enables the Redis channel layer for multiple processes |
| `DJANGO_SECRET_KEY` | required unless `DJANGO_DEBUG=true` | Django secret |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Hostnames the app is served from |
| `SIGURT_MESSAGE_TTL_HOURS` | `24` | Hours before encrypted messages are deleted |
| `SIGURT_ROOM_TTL_HOURS` | `72` | Hours of inactivity before a room is deleted |
| `SIGURT_HISTORY_LIMIT` | `200` | Past messages sent to someone joining |
| `SIGURT_RATE_LIMIT` | `20` | Frames one connection may send per 10 seconds |

Expired data is removed by `python manage.py purge_expired` (the Docker setup runs it hourly).

## License

MIT
