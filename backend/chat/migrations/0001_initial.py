import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

import chat.models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Room",
            fields=[
                (
                    "id",
                    models.CharField(
                        default=chat.models.generate_room_id,
                        editable=False,
                        max_length=32,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_activity", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
            ],
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("iv", models.CharField(max_length=32)),
                ("ciphertext", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                (
                    "room",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="chat.room",
                    ),
                ),
            ],
            options={"ordering": ["created_at", "id"]},
        ),
    ]
