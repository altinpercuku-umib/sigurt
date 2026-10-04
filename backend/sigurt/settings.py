"""
Django settings for Sigurt.

Everything that differs between environments is read from environment
variables, so the same code runs locally, in Docker and in production.
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path) -> None:
    """Tiny .env loader so local development needs no extra package."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key-change-me"
    else:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.")

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")

INSTALLED_APPS = [
    "daphne",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "channels",
    "chat",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "sigurt.urls"
WSGI_APPLICATION = "sigurt.wsgi.application"
ASGI_APPLICATION = "sigurt.asgi.application"

TEMPLATES = []

# --- Database ---------------------------------------------------------------
# PostgreSQL is the default. DATABASE_URL looks like
# postgres://user:password@host:5432/dbname
DATABASES = {
    "default": dj_database_url.config(
        env="DATABASE_URL",
        default="postgres://sigurt:sigurt@localhost:5432/sigurt",
        conn_max_age=60,
    )
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Channels ---------------------------------------------------------------
# With REDIS_URL set, rooms work across several server processes.
# Without it, an in-memory layer is used (fine for a single process / dev).
REDIS_URL = os.environ.get("REDIS_URL")
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}

# --- Sigurt behaviour -------------------------------------------------------
# Encrypted messages are deleted after this many hours.
SIGURT_MESSAGE_TTL_HOURS = int(os.environ.get("SIGURT_MESSAGE_TTL_HOURS", "24"))
# Empty rooms are deleted after this many hours without activity.
SIGURT_ROOM_TTL_HOURS = int(os.environ.get("SIGURT_ROOM_TTL_HOURS", "72"))
# How many past (encrypted) messages a newcomer receives.
SIGURT_HISTORY_LIMIT = int(os.environ.get("SIGURT_HISTORY_LIMIT", "200"))
# Maximum size of one encrypted payload, in characters of base64.
SIGURT_MAX_CIPHERTEXT = int(os.environ.get("SIGURT_MAX_CIPHERTEXT", "16384"))
# Messages a single connection may send per 10 seconds.
SIGURT_RATE_LIMIT = int(os.environ.get("SIGURT_RATE_LIMIT", "20"))

# --- Misc -------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# No IP addresses or request details are written to logs.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "WARNING"},
}

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "no-referrer"
X_FRAME_OPTIONS = "DENY"
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
