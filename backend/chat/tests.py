from datetime import timedelta

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from .models import Message, Room, purge_expired
from .routing import websocket_urlpatterns

IN_MEMORY_LAYER = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


class RoomApiTests(TestCase):
    def test_create_room_returns_unguessable_id(self):
        response = self.client.post("/api/rooms/")
        self.assertEqual(response.status_code, 201)
        room_id = response.json()["id"]
        self.assertGreaterEqual(len(room_id), 16)
        self.assertTrue(Room.objects.filter(pk=room_id).exists())

    def test_create_room_requires_post(self):
        self.assertEqual(self.client.get("/api/rooms/").status_code, 405)

    def test_room_detail(self):
        room = Room.objects.create()
        self.assertEqual(self.client.get(f"/api/rooms/{room.id}/").status_code, 200)
        self.assertEqual(self.client.get("/api/rooms/doesnotexist123/").status_code, 404)


class FrontendServingTests(TestCase):
    def test_serves_index_for_app_routes(self):
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as dist:
            Path(dist, "index.html").write_text("<!doctype html><title>Sigurt</title>")
            with override_settings(FRONTEND_DIST=Path(dist)):
                for path in ("/", "/r/abcdefgh12345678"):
                    response = self.client.get(path)
                    self.assertEqual(response.status_code, 200, path)
                    self.assertIn("Content-Security-Policy", response)
                    self.assertIn(b"Sigurt", b"".join(response.streaming_content))

    def test_missing_build_is_404(self):
        from pathlib import Path

        with override_settings(FRONTEND_DIST=Path("/nonexistent")):
            self.assertEqual(self.client.get("/").status_code, 404)


class PurgeTests(TestCase):
    def test_purge_removes_old_messages_and_idle_rooms(self):
        old_room = Room.objects.create()
        Room.objects.filter(pk=old_room.pk).update(last_activity=timezone.now() - timedelta(days=30))
        live_room = Room.objects.create()
        old_msg = Message.objects.create(room=live_room, iv="aXY=", ciphertext="Y3Q=")
        Message.objects.filter(pk=old_msg.pk).update(created_at=timezone.now() - timedelta(days=2))
        fresh = Message.objects.create(room=live_room, iv="aXY=", ciphertext="Y3Q=")

        purge_expired()

        self.assertFalse(Room.objects.filter(pk=old_room.pk).exists())
        self.assertTrue(Room.objects.filter(pk=live_room.pk).exists())
        self.assertEqual(list(Message.objects.values_list("pk", flat=True)), [fresh.pk])


@override_settings(CHANNEL_LAYERS=IN_MEMORY_LAYER, SIGURT_RATE_LIMIT=5)
class RoomConsumerTests(TransactionTestCase):
    def setUp(self):
        self.app = URLRouter(websocket_urlpatterns)

    async def connect(self, room_id):
        communicator = WebsocketCommunicator(self.app, f"/ws/rooms/{room_id}/")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        return communicator

    async def test_unknown_room_is_closed(self):
        communicator = await self.connect("missingroom0000")
        output = await communicator.receive_output()
        self.assertEqual(output["type"], "websocket.close")
        self.assertEqual(output["code"], 4404)

    async def test_history_and_broadcast_of_ciphertext(self):
        room = await Room.objects.acreate()
        alice = await self.connect(room.id)
        bob = await self.connect(room.id)
        self.assertEqual(await alice.receive_json_from(), {"type": "history", "messages": []})
        self.assertEqual(await bob.receive_json_from(), {"type": "history", "messages": []})

        await alice.send_json_to({"type": "message", "iv": "aXZpdml2aXZp", "ciphertext": "c2VjcmV0", "ref": "r1"})
        for client in (alice, bob):
            event = await client.receive_json_from()
            self.assertEqual(event["type"], "message")
            self.assertEqual(event["ciphertext"], "c2VjcmV0")
            self.assertEqual(event["ref"], "r1")

        self.assertEqual(await Message.objects.filter(room=room).acount(), 1)

        # A newcomer receives the stored ciphertext as history.
        carol = await self.connect(room.id)
        history = await carol.receive_json_from()
        self.assertEqual(len(history["messages"]), 1)
        self.assertEqual(history["messages"][0]["ciphertext"], "c2VjcmV0")

        for client in (alice, bob, carol):
            await client.disconnect()

    async def test_signals_are_relayed_to_others_and_not_stored(self):
        room = await Room.objects.acreate()
        alice = await self.connect(room.id)
        bob = await self.connect(room.id)
        await alice.receive_json_from()
        await bob.receive_json_from()

        await alice.send_json_to({"type": "signal", "iv": "aXZpdml2aXZp", "ciphertext": "cHJlc2VuY2U="})
        event = await bob.receive_json_from()
        self.assertEqual(event, {"type": "signal", "iv": "aXZpdml2aXZp", "ciphertext": "cHJlc2VuY2U="})
        self.assertTrue(await alice.receive_nothing())
        self.assertEqual(await Message.objects.acount(), 0)

        await alice.disconnect()
        await bob.disconnect()

    async def test_rejects_invalid_payloads(self):
        room = await Room.objects.acreate()
        client = await self.connect(room.id)
        await client.receive_json_from()

        await client.send_json_to({"type": "message", "iv": "aXY=", "ciphertext": "<script>"})
        self.assertEqual(await client.receive_json_from(), {"type": "error", "error": "invalid_payload"})
        await client.send_json_to({"type": "shout"})
        self.assertEqual(await client.receive_json_from(), {"type": "error", "error": "unknown_type"})
        await client.disconnect()

    async def test_rate_limit(self):
        room = await Room.objects.acreate()
        client = await self.connect(room.id)
        await client.receive_json_from()
        for _ in range(5):
            await client.send_json_to({"type": "signal", "iv": "aXY=", "ciphertext": "eA=="})
        await client.send_json_to({"type": "signal", "iv": "aXY=", "ciphertext": "eA=="})
        self.assertEqual(await client.receive_json_from(), {"type": "error", "error": "rate_limited"})
        await client.disconnect()
