from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("rooms/", views.create_room, name="create-room"),
    path("rooms/<str:room_id>/", views.room_detail, name="room-detail"),
]
