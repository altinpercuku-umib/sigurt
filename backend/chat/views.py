import time

from django.conf import settings
from django.http import FileResponse, Http404, HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Room, purge_expired

PURGE_INTERVAL_SECONDS = 3600
_last_purge = 0.0


def purge_if_due() -> None:
    """Delete expired data at most once an hour, piggybacking on normal traffic.

    Hosts like Render's free tier have no cron jobs, so cleanup also runs here.
    """
    global _last_purge
    now = time.monotonic()
    if now - _last_purge >= PURGE_INTERVAL_SECONDS:
        _last_purge = now
        purge_expired()


@csrf_exempt  # No cookies or sessions exist, so there is nothing to forge.
@require_POST
def create_room(request: HttpRequest) -> JsonResponse:
    purge_if_due()
    room = Room.objects.create()
    return JsonResponse({"id": room.id, "created_at": room.created_at.isoformat()}, status=201)


@require_GET
def room_detail(request: HttpRequest, room_id: str) -> JsonResponse:
    room = Room.objects.filter(pk=room_id).first()
    if room is None:
        return JsonResponse({"error": "Room not found"}, status=404)
    return JsonResponse({"id": room.id, "created_at": room.created_at.isoformat()})


@require_GET
def health(request: HttpRequest) -> JsonResponse:
    return JsonResponse({"status": "ok"})


@require_GET
def spa_index(request: HttpRequest) -> FileResponse:
    """Serve the React app's index.html for page routes such as / and /r/<room>."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.is_file():
        raise Http404("Frontend build not found. In development, open the Vite dev server instead.")
    response = FileResponse(index.open("rb"), content_type="text/html; charset=utf-8")
    response["Content-Security-Policy"] = settings.CONTENT_SECURITY_POLICY
    response["Cache-Control"] = "no-cache"
    response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response
