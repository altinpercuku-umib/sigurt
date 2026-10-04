"""
WebSocket consumer for a Sigurt room.

The server is a blind relay. Every payload it handles is AES-GCM ciphertext
produced in the browser; it never sees plaintext, names or keys.

Protocol (JSON frames)
----------------------
client -> server
  {"type": "message", "iv": "...", "ciphertext": "...", "ref": "<client id>"}
      Stored (encrypted) and broadcast to everyone in the room.
  {"type": "signal",  "iv": "...", "ciphertext": "..."}
      Ephemeral (presence, typing). Broadcast to others, never stored.

server -> client
  {"type": "history", "messages": [ {id, iv, ciphertext, created_at}, ... ]}
  {"type": "message", "id", "iv", "ciphertext", "created_at", "ref"}
  {"type": "signal",  "iv", "ciphertext"}
  {"type": "error",   "error": "<reason>"}
"""

import re
import time
from collections import deque

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings

from .models import Message, Room

B64_RE = re.compile(r"^[A-Za-z0-9+/_=-]+$")
REF_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

CLOSE_ROOM_NOT_FOUND = 4404


class RoomConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.group_name = f"room_{self.room_id}"
        self.sent_at: deque[float] = deque()

        room = await self.get_room()
        if room is None:
            # Accept then close with a custom code so the browser can tell
            # "room does not exist" apart from a network failure.
            await self.accept()
            await self.close(code=CLOSE_ROOM_NOT_FOUND)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        history = await self.get_history()
        await self.send_json({"type": "history", "messages": history})

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # --- incoming frames ---------------------------------------------------

    async def receive_json(self, content, **kwargs):
        if not isinstance(content, dict):
            return await self.send_error("invalid_frame")

        kind = content.get("type")
        if kind not in {"message", "signal"}:
            return await self.send_error("unknown_type")

        iv = content.get("iv")
        ciphertext = content.get("ciphertext")
        if not self.valid_blob(iv, 32) or not self.valid_blob(ciphertext, settings.SIGURT_MAX_CIPHERTEXT):
            return await self.send_error("invalid_payload")

        if self.rate_limited():
            return await self.send_error("rate_limited")

        if kind == "signal":
            await self.channel_layer.group_send(
                self.group_name,
                {"type": "room.signal", "iv": iv, "ciphertext": ciphertext, "sender": self.channel_name},
            )
            return

        ref = content.get("ref")
        if not (isinstance(ref, str) and REF_RE.match(ref)):
            ref = None

        message = await self.store_message(iv, ciphertext)
        if message is None:  # room was deleted while we were connected
            await self.close(code=CLOSE_ROOM_NOT_FOUND)
            return
        await self.channel_layer.group_send(
            self.group_name, {"type": "room.message", "message": message, "ref": ref}
        )

    # --- group events --------------------------------------------------------

    async def room_message(self, event):
        await self.send_json({"type": "message", **event["message"], "ref": event.get("ref")})

    async def room_signal(self, event):
        if event.get("sender") == self.channel_name:
            return
        await self.send_json({"type": "signal", "iv": event["iv"], "ciphertext": event["ciphertext"]})

    # --- helpers -------------------------------------------------------------

    async def send_error(self, reason: str):
        await self.send_json({"type": "error", "error": reason})

    @staticmethod
    def valid_blob(value, max_length: int) -> bool:
        return isinstance(value, str) and 0 < len(value) <= max_length and bool(B64_RE.match(value))

    def rate_limited(self) -> bool:
        now = time.monotonic()
        while self.sent_at and now - self.sent_at[0] > 10:
            self.sent_at.popleft()
        if len(self.sent_at) >= settings.SIGURT_RATE_LIMIT:
            return True
        self.sent_at.append(now)
        return False

    @database_sync_to_async
    def get_room(self):
        return Room.objects.filter(pk=self.room_id).first()

    @database_sync_to_async
    def get_history(self):
        limit = settings.SIGURT_HISTORY_LIMIT
        recent = list(Message.objects.filter(room_id=self.room_id).order_by("-created_at", "-id")[:limit])
        return [m.as_payload() for m in reversed(recent)]

    @database_sync_to_async
    def store_message(self, iv: str, ciphertext: str):
        room = Room.objects.filter(pk=self.room_id).first()
        if room is None:
            return None
        message = Message.objects.create(room=room, iv=iv, ciphertext=ciphertext)
        room.touch()
        return message.as_payload()
