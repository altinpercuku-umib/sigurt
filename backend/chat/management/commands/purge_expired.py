from django.core.management.base import BaseCommand

from chat.models import purge_expired


class Command(BaseCommand):
    help = "Delete encrypted messages and idle rooms that are past their lifetime."

    def handle(self, *args, **options):
        messages, rooms = purge_expired()
        self.stdout.write(f"Deleted {messages} expired message rows and {rooms} idle room rows.")
