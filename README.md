# BirdLog

BirdLog is a self-hosted bird sighting app with:

- Angular frontend
- MapLibre map for viewing/adding sightings
- Node/Express API
- SQLite database + image uploads
- Docker Compose deployment

The SQLite DB and uploaded photos are stored in a local `data/` folder so it can be synced with Dropbox.

## Features

- Log sightings with species, notes, location, and photo
- Tap/click map to set location
- Use device GPS to fill coordinates on mobile
- Search sightings directly on the map
- Backlog support with **unknown date** entries
- List and detail views for saved sightings

## Tech Stack

- Frontend: Angular 21, MapLibre GL
- Backend: Express, better-sqlite3, multer
- Database: SQLite
- Hosting: Docker + Docker Compose

## Project Structure

- `src/` – Angular app
- `server/` – Express API server
- `data/` – SQLite DB + uploaded images (runtime volume)
- `docker-compose.yml` – local self-host setup

## Run with Docker (recommended)

1. Build and start:

   ```bash
   docker compose up --build
   ```

2. Open the app at:
   - Frontend: `http://localhost:7000`

Notes:

- API runs on port `3000` inside Docker and is accessed by the frontend via reverse proxy (`/api`).
- If you need a clean rebuild:

  ```bash
  docker compose build --no-cache
  docker compose up
  ```

## Dropbox Sync Setup

BirdLog persists data in `./data` through Docker volume mapping.

Options:

1. Move this project inside your Dropbox folder, or
2. Symlink `data/` to a Dropbox location.

Example:

```bash
ln -s ~/Dropbox/BirdLogData ./data
```

Keep only one process writing the same SQLite file at a time.

## Run in Development (without Docker)

### Frontend

```bash
npm install
npm start
```

### API

```bash
cd server
npm install
npm run dev
```

Frontend dev server uses proxy config so `/api` points to `http://localhost:3000`.

## GPS on Mobile

GPS requires secure context in browsers:

- ✅ `http://localhost` (local)
- ✅ `https://your-domain`
- ❌ plain `http://<ip-or-domain>` on most phones

For phone access on LAN/public internet, serve BirdLog over HTTPS.

## Scripts

From project root:

- `npm start` – Angular dev server
- `npm run build` – production frontend build
- `npm test` – unit tests

From `server/`:

- `npm run dev` – API with watch mode
- `npm start` – API production start
