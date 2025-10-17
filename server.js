const path = require('path');
const fs = require('fs');
const express = require('express');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'experiments.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  trial_index INTEGER,
  score REAL,
  judgement TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trials_session ON trials(session_id);
`);

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, created_at, last_seen_at, user_agent, metadata)
  VALUES (@id, @created_at, @last_seen_at, @user_agent, @metadata)
  ON CONFLICT(id) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    user_agent = COALESCE(excluded.user_agent, sessions.user_agent),
    metadata = COALESCE(excluded.metadata, sessions.metadata)
`);

const updateSessionSeen = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?');
const findSession = db.prepare('SELECT id FROM sessions WHERE id = ?');

const insertTrial = db.prepare(`
  INSERT INTO trials (session_id, trial_index, score, judgement, payload, created_at)
  VALUES (@session_id, @trial_index, @score, @judgement, @payload, @created_at)
`);

app.use(express.json({ limit: '1mb' }));

app.post('/api/session', (req, res) => {
  const now = new Date().toISOString();
  const { sessionId, userAgent, metadata } = req.body || {};
  const id = (typeof sessionId === 'string' && sessionId.length > 10) ? sessionId : randomUUID();
  const cleanAgent = typeof userAgent === 'string' ? userAgent.slice(0, 512) : null;
  let metadataJson = null;
  if (metadata && typeof metadata === 'object') {
    try {
      metadataJson = JSON.stringify(metadata);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid metadata' });
    }
  }

  upsertSession.run({
    id,
    created_at: now,
    last_seen_at: now,
    user_agent: cleanAgent,
    metadata: metadataJson,
  });

  res.json({ sessionId: id });
});

app.post('/api/trials', (req, res) => {
  const { sessionId, trial } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!trial || typeof trial !== 'object') {
    return res.status(400).json({ error: 'trial payload is required' });
  }

  const existing = findSession.get(sessionId);
  if (!existing) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const payload = JSON.stringify(trial);
  if (Buffer.byteLength(payload, 'utf8') > 200_000) {
    return res.status(413).json({ error: 'Trial payload too large' });
  }

  const now = new Date().toISOString();
  updateSessionSeen.run(now, sessionId);

  const trialIndex = Number.isFinite(Number(trial.index)) ? Number(trial.index) : null;
  const score = Number.isFinite(Number(trial.score)) ? Number(trial.score) : null;
  const judgement = typeof trial.judgement === 'string' ? trial.judgement.slice(0, 128) : null;

  insertTrial.run({
    session_id: sessionId,
    trial_index: trialIndex,
    score,
    judgement,
    payload,
    created_at: now,
  });

  res.status(201).json({ ok: true });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Experiment server listening on port ${PORT}`);
});
