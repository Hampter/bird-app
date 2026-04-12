# ---------------------------------------------------------------------------
# Multi-stage build: Angular frontend served by nginx
# ---------------------------------------------------------------------------

# -- Build stage ------------------------------------------------------------
FROM node:22-slim AS build

WORKDIR /app

# Keep npm version aligned with local/project toolchain to avoid lockfile
# compatibility issues during `npm ci`.
RUN npm install -g npm@11.5.2

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx ng build --configuration production

# -- Serve stage ------------------------------------------------------------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/bird-app/browser /usr/share/nginx/html

EXPOSE 7000
