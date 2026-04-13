const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories exist
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Database setup – SQLite stores everything in a single file which makes it
// ideal for syncing via Dropbox.  All data lives under DATA_DIR so you can
// point that directory at your Dropbox folder (or symlink it).
// ---------------------------------------------------------------------------
const db = new Database(path.join(DATA_DIR, 'bird-sightings.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sightings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species TEXT NOT NULL,
    description TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    image_filename TEXT,
    sighting_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migration: allow nullable `sighting_date` for backlog entries with unknown date.
const sightingDateInfo = db
  .prepare("PRAGMA table_info('sightings')")
  .all()
  .find((column) => column.name === 'sighting_date');

if (sightingDateInfo && sightingDateInfo.notnull === 1) {
  db.exec(`
    BEGIN TRANSACTION;
    CREATE TABLE sightings_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      species TEXT NOT NULL,
      description TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      image_filename TEXT,
      sighting_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO sightings_new (id, species, description, latitude, longitude, image_filename, sighting_date, created_at)
    SELECT id, species, description, latitude, longitude, image_filename, NULLIF(sighting_date, ''), created_at
    FROM sightings;
    DROP TABLE sightings;
    ALTER TABLE sightings_new RENAME TO sightings;
    COMMIT;
  `);
}

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded images
app.use('/api/uploads', express.static(UPLOAD_DIR));

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `sighting-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ---- API Routes -----------------------------------------------------------

// GET /api/sightings – list all sightings
app.get('/api/sightings', (_req, res) => {
  const sightings = db
    .prepare('SELECT * FROM sightings ORDER BY COALESCE(sighting_date, created_at) DESC')
    .all();
  res.json(sightings);
});

// GET /api/sightings/:id – single sighting
app.get('/api/sightings/:id', (req, res) => {
  const sighting = db
    .prepare('SELECT * FROM sightings WHERE id = ?')
    .get(req.params.id);
  if (!sighting) return res.status(404).json({ error: 'Sighting not found' });
  res.json(sighting);
});

// POST /api/sightings – create a new sighting (multipart form)
app.post('/api/sightings', upload.single('image'), (req, res) => {
  const { species, description, latitude, longitude, sighting_date, unknown_date } = req.body;

  if (!species || !latitude || !longitude) {
    return res
      .status(400)
      .json({ error: 'Missing required fields: species, latitude, longitude' });
  }

  const isUnknownDate = unknown_date === true || unknown_date === 'true';
  const normalizedSightingDate = isUnknownDate ? null : sighting_date || null;

  if (!isUnknownDate && !normalizedSightingDate) {
    return res.status(400).json({ error: 'Provide sighting_date or set unknown_date=true' });
  }

  const image_filename = req.file ? req.file.filename : null;

  const stmt = db.prepare(`
    INSERT INTO sightings (species, description, latitude, longitude, image_filename, sighting_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    species,
    description || null,
    parseFloat(latitude),
    parseFloat(longitude),
    image_filename,
    normalizedSightingDate,
  );

  const newSighting = db
    .prepare('SELECT * FROM sightings WHERE id = ?')
    .get(result.lastInsertRowid);

  res.status(201).json(newSighting);
});

// PUT /api/sightings/:id – update a sighting
app.put('/api/sightings/:id', upload.single('image'), (req, res) => {
  const existing = db
    .prepare('SELECT * FROM sightings WHERE id = ?')
    .get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Sighting not found' });

  const { species, description, latitude, longitude, sighting_date, unknown_date } = req.body;
  let image_filename = existing.image_filename;
  const isUnknownDate = unknown_date === true || unknown_date === 'true';
  const normalizedSightingDate = isUnknownDate
    ? null
    : sighting_date !== undefined
      ? sighting_date || null
      : existing.sighting_date;

  if (req.file) {
    // Remove old image when a new one is uploaded
    if (existing.image_filename) {
      const oldPath = path.join(UPLOAD_DIR, existing.image_filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    image_filename = req.file.filename;
  }

  db.prepare(`
    UPDATE sightings
       SET species = ?, description = ?, latitude = ?, longitude = ?,
           image_filename = ?, sighting_date = ?
     WHERE id = ?
  `).run(
    species || existing.species,
    description !== undefined ? description : existing.description,
    latitude ? parseFloat(latitude) : existing.latitude,
    longitude ? parseFloat(longitude) : existing.longitude,
    image_filename,
    normalizedSightingDate,
    req.params.id,
  );

  const updated = db
    .prepare('SELECT * FROM sightings WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

// GET /api/ebird/nearby – proxy recent nearby observations from the eBird API.
// Set the EBIRD_API_KEY environment variable to enable this endpoint.
// See https://ebird.org/api/keygen to get a free key.
app.get('/api/ebird/nearby', async (req, res) => {
  const apiKey = process.env.EBIRD_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'EBIRD_API_KEY environment variable not configured' });
  }

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const dist = Math.min(Math.max(parseInt(req.query.dist ?? '50', 10), 1), 50);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Invalid lat parameter' });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid lng parameter' });
  }

  try {
    const url =
      `https://api.ebird.org/v2/data/obs/geo/recent` +
      `?lat=${lat}&lng=${lng}&dist=${dist}&maxResults=200&fmt=json`;

    const response = await fetch(url, {
      headers: { 'x-ebirdapitoken': apiKey },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'eBird API returned an error' });
    }

    const data = await response.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Failed to reach eBird API' });
  }
});

// GET /api/birds/info – fetch basic bird information by species/common name.
app.get('/api/birds/info', async (req, res) => {
  const species = (req.query.species || '').toString().trim();
  if (!species) {
    return res.status(400).json({ error: 'Missing species parameter' });
  }

  const fetchSummary = async (query) => {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  };

  const fetchWikidataItemId = async (title) => {
    const url =
      'https://en.wikipedia.org/w/api.php' +
      `?action=query&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(title)}&format=json`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const pages = data?.query?.pages;
    if (!pages) {
      return null;
    }

    const firstPage = Object.values(pages)[0];
    return firstPage?.pageprops?.wikibase_item ?? null;
  };

  const fetchRangeMap = async (wikidataItemId) => {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataItemId}.json`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { url: null, fileName: null };
    }

    const data = await response.json();
    const claims = data?.entities?.[wikidataItemId]?.claims;
    const rangeClaim = claims?.P181?.[0];
    const fileName = rangeClaim?.mainsnak?.datavalue?.value ?? null;

    if (!fileName) {
      return { url: null, fileName: null };
    }

    return {
      url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`,
      fileName,
    };
  };

  try {
    // Try exact species/common name first, then the common disambiguation fallback.
    const summary = (await fetchSummary(species)) || (await fetchSummary(`${species} (bird)`));

    if (!summary || summary.type === 'disambiguation') {
      return res.status(404).json({ error: 'No bird information found for this species' });
    }

    const wikidataItemId = await fetchWikidataItemId(summary.title);
    const rangeMap = wikidataItemId
      ? await fetchRangeMap(wikidataItemId)
      : { url: null, fileName: null };

    res.json({
      title: summary.title,
      summary: summary.extract,
      description: summary.description,
      thumbnail: summary.thumbnail?.source ?? null,
      sourceUrl: summary.content_urls?.desktop?.page ?? null,
      rangeMapUrl: rangeMap.url,
      rangeMapFileName: rangeMap.fileName,
    });
  } catch {
    res.status(502).json({ error: 'Failed to fetch bird information' });
  }
});

// DELETE /api/sightings/:id
app.delete('/api/sightings/:id', (req, res) => {
  const sighting = db
    .prepare('SELECT * FROM sightings WHERE id = ?')
    .get(req.params.id);
  if (!sighting) return res.status(404).json({ error: 'Sighting not found' });

  if (sighting.image_filename) {
    const imagePath = path.join(UPLOAD_DIR, sighting.image_filename);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  }

  db.prepare('DELETE FROM sightings WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

// Start server
app.listen(PORT, () => {
  console.log(`Bird sightings API running on http://localhost:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
