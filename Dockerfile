# --- Stage 1: build del frontend (React + Vite) ---
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm run build:frontend

# --- Stage 2: imagen final (servidor Express) ---
FROM node:20-alpine

# python3/make/g++: compilan better-sqlite3 (módulo nativo).
# chromium + fuentes/libs: Puppeteer usa el Chromium del sistema para generar
# los PDF (en Alpine el Chromium que descarga Puppeteer no funciona).
RUN apk add --no-cache \
    python3 make g++ \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Evita que Puppeteer descargue su propio Chromium y lo apunta al del sistema.
# src/informes.js ya respeta PUPPETEER_EXECUTABLE_PATH.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 3000

CMD ["npm", "start"]
