# --- Stage 1: build del frontend (React + Vite) ---
FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm run build:frontend

# --- Stage 2: imagen final (servidor Express) ---
FROM node:20-alpine

# Herramientas para compilar better-sqlite3 (módulo nativo)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY --from=build /app/frontend/dist ./frontend/dist

EXPOSE 3000

CMD ["npm", "start"]
