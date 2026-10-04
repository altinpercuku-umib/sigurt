from django.urls import include, path, re_path

from chat.views import spa_index

urlpatterns = [
    path("api/", include("chat.urls")),
    # The home page and room pages are handled by the React app.
    re_path(r"^(?:r/[A-Za-z0-9_-]{8,32}/?)?$", spa_index, name="app"),
]
