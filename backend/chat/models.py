import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


def generate_room_id() -> str:
    # 12 random bytes -> 16 URL-safe characters (96 bits, unguessable).
    return secrets.token_urlsafe(12)


class Room(models.Model):
    """
    A chat room. The server knows only that it exists.

    The room's encryption key is created in the browser and travels only in
    the URL fragment (#...), which browsers never send to the server.
    """

    id = models.CharField(primary_key=True, max_length=32, default=generate_room_id, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(default=timezone.now, db_index=True)

    def __str__(self) -> str:
        return self.id

    def touch(self) -> None:
        Room.objects.filter(pk=self.pk).update(last_activity=timezone.now())


class Message(models.Model):
    """
    One encrypted message. The server stores only opaque ciphertext: it cannot
    read the text, the sender's random name, or anything else inside.
    """

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="messages")
    iv = models.CharField(max_length=32)
    ciphertext = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]

    def as_payload(self) -> dict:
        return {
            "id": self.id,
            "iv": self.iv,
            "ciphertext": self.ciphertext,
            "created_at": self.created_at.isoformat(),
        }


def purge_expired() -> tuple[int, int]:
    """Delete messages and idle rooms past their lifetime. Returns (messages, rooms)."""
    now = timezone.now()
    message_cutoff = now - timedelta(hours=settings.SIGURT_MESSAGE_TTL_HOURS)
    room_cutoff = now - timedelta(hours=settings.SIGURT_ROOM_TTL_HOURS)
    messages_deleted, _ = Message.objects.filter(created_at__lt=message_cutoff).delete()
    rooms_deleted, _ = Room.objects.filter(last_activity__lt=room_cutoff).delete()
    return messages_deleted, rooms_deleted
