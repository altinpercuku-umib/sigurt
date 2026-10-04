from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Room


@csrf_exempt  # No cookies or sessions exist, so there is nothing to forge.
@require_POST
def create_room(request: HttpRequest) -> JsonResponse:
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
