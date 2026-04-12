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
