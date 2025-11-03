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
  metadata TEXT,
  condition TEXT
);

CREATE TABLE IF NOT EXISTS trials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  trial_index INTEGER,
  score REAL,
  judgement TEXT,
  experiment_id TEXT,
  participant_id TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trials_session ON trials(session_id);

CREATE TABLE IF NOT EXISTS experiment_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  participant_id TEXT,
  experiment_id TEXT,
  config_version TEXT,
  payload TEXT NOT NULL,
  score TEXT,
  timing TEXT,
  confirmation_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_results_session ON experiment_results(session_id);
CREATE INDEX IF NOT EXISTS idx_results_experiment ON experiment_results(experiment_id);
`);

function ensureColumn(table, column, definition){
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = info.some((col) => col.name === column);
  if (!exists){
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

ensureColumn('trials', 'experiment_id', 'experiment_id TEXT');
ensureColumn('trials', 'participant_id', 'participant_id TEXT');
ensureColumn('experiment_results', 'score', 'score TEXT');
ensureColumn('experiment_results', 'timing', 'timing TEXT');
ensureColumn('sessions', 'condition', 'condition TEXT');

const upsertSession = db.prepare(`
  INSERT INTO sessions (id, created_at, last_seen_at, user_agent, metadata, condition)
  VALUES (@id, @created_at, @last_seen_at, @user_agent, @metadata, @condition)
  ON CONFLICT(id) DO UPDATE SET
    last_seen_at = excluded.last_seen_at,
    user_agent = COALESCE(excluded.user_agent, sessions.user_agent),
    metadata = COALESCE(excluded.metadata, sessions.metadata),
    condition = COALESCE(excluded.condition, sessions.condition)
`);

const updateSessionSeen = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?');
const findSession = db.prepare('SELECT id FROM sessions WHERE id = ?');

const insertTrial = db.prepare(`
  INSERT INTO trials (session_id, trial_index, score, judgement, payload, created_at, experiment_id, participant_id)
  VALUES (@session_id, @trial_index, @score, @judgement, @payload, @created_at, @experiment_id, @participant_id)
`);

const insertExperimentResult = db.prepare(`
  INSERT INTO experiment_results (session_id, participant_id, experiment_id, config_version, payload, confirmation_code, score, timing, created_at)
  VALUES (@session_id, @participant_id, @experiment_id, @config_version, @payload, @confirmation_code, @score, @timing, @created_at)
`);

app.use(express.json({ limit: '1mb' }));

app.post('/api/session', (req, res) => {
  const now = new Date().toISOString();
  const { sessionId, userAgent, metadata, condition } = req.body || {};
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

  const conditionMap = new Map([
    ['immediate', 'immediate'],
    ['delay', 'delay'],
    ['a', 'immediate'],
    ['b', 'delay'],
  ]);
  const rawCondition = typeof condition === 'string' ? condition.trim().toLowerCase() : null;
  const normalizedCondition = rawCondition && conditionMap.has(rawCondition)
    ? conditionMap.get(rawCondition)
    : null;

  upsertSession.run({
    id,
    created_at: now,
    last_seen_at: now,
    user_agent: cleanAgent,
    metadata: metadataJson,
    condition: normalizedCondition,
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
  const experimentId = typeof trial.experimentId === 'string' ? trial.experimentId.slice(0, 160) : null;
  const participantId = typeof trial.participantId === 'string' ? trial.participantId.slice(0, 160) : null;

  insertTrial.run({
    session_id: sessionId,
    trial_index: trialIndex,
    score,
    judgement,
    payload,
    created_at: now,
    experiment_id: experimentId,
    participant_id: participantId,
  });

  res.status(201).json({ ok: true });
});

app.post('/api/experiment-results', (req, res) => {
  const { sessionId, result } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!result || typeof result !== 'object') {
    return res.status(400).json({ error: 'result payload is required' });
  }

  const existing = findSession.get(sessionId);
  if (!existing) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let payload;
  try {
    payload = JSON.stringify(result);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid result payload' });
  }
  if (Buffer.byteLength(payload, 'utf8') > 800_000) {
    return res.status(413).json({ error: 'Result payload too large' });
  }

  const now = new Date().toISOString();
  updateSessionSeen.run(now, sessionId);

  const participantId = typeof result.participantId === 'string' ? result.participantId.slice(0, 160) : null;
  const experimentId = typeof result.experimentId === 'string' ? result.experimentId.slice(0, 160) : null;
  const configVersion = typeof result.configVersion === 'string' ? result.configVersion.slice(0, 120) : null;
  const confirmationCode = randomUUID().split('-')[0];

  const blocks = Array.isArray(result.blocks) ? result.blocks : [];
  const scores = [];
  const timings = [];
  for (const block of blocks) {
    if (!block || block.upload === false) continue;
    const trials = Array.isArray(block.trials) ? block.trials : [];
    for (const trial of trials) {
      const numericScore = Number(trial?.score);
      const scoreValue = Number.isFinite(numericScore) ? numericScore : 0;
      scores.push(String(scoreValue));

      const analytics = trial?.analytics || null;
      const feedback = analytics?.feedback || {};
      const configSnapshot = analytics?.configSnapshot || {};

      const travelCandidates = [
        configSnapshot.PLAYER_TRAVEL_SECONDS,
        configSnapshot.playerTravelSeconds,
        trial?.settings?.playerTravelSeconds,
        trial?.settings?.playerSpeed,
      ];
      let travelSeconds = null;
      for (const candidate of travelCandidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) {
          travelSeconds = numeric;
          break;
        }
      }

      const playerCandidates = [
        feedback.playerValue,
        analytics?.freezeEvent?.playerValue,
        analytics?.freezeEvent?.playerValueAtPress,
        trial?.playerValue,
      ];
      let playerValue = null;
      for (const candidate of playerCandidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric)) {
          playerValue = numeric;
          break;
        }
      }

      const targetCandidates = [
        feedback.targetValue,
        trial?.target,
      ];
      let targetValue = null;
      for (const candidate of targetCandidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric)) {
          targetValue = numeric;
          break;
        }
      }

      let timingValue = null;
      if (
        Number.isFinite(playerValue)
        && Number.isFinite(targetValue)
        && Number.isFinite(travelSeconds)
      ) {
        timingValue = Math.round((playerValue - targetValue) * travelSeconds * 1000);
      }

      timings.push(String(Number.isFinite(timingValue) ? timingValue : 0));
    }
  }

  const info = insertExperimentResult.run({
    session_id: sessionId,
    participant_id: participantId,
    experiment_id: experimentId,
    config_version: configVersion,
    payload,
    confirmation_code: confirmationCode,
    score: scores.join(','),
    timing: timings.join(','),
    created_at: now,
  });

  res.status(201).json({ ok: true, id: info.lastInsertRowid, confirmationCode });
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
