# Single-container build: the React app is compiled and served by Django.
# Used by the Render Blueprint (render.yaml) and any host that runs one Docker image.
# (docker-compose.yml uses the separate backend/ and frontend/ images instead.)

FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /frontend/dist ./frontend_dist

RUN useradd --create-home sigurt
USER sigurt

EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py purge_expired && exec daphne -b 0.0.0.0 -p ${PORT} --proxy-headers sigurt.asgi:application"]
