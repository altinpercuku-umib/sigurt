from django.urls import re_path

from .consumers import RoomConsumer

websocket_urlpatterns = [
    re_path(r"^ws/rooms/(?P<room_id>[A-Za-z0-9_-]{8,32})/$", RoomConsumer.as_asgi()),
]
