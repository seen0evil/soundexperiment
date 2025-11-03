#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const dbPath = path.join(dataDir, 'experiments.sqlite');
const outputPath = path.join(projectRoot, 'experiment_results_export.csv');
const includePayload = process.argv.includes('--include-payload');

if (!fs.existsSync(dbPath)) {
  console.error(`No experiment database found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

const rows = db
  .prepare(`
    SELECT
      id,
      session_id,
      participant_id,
      experiment_id,
      config_version,
      payload,
      score,
      timing,
      confirmation_code,
      created_at,
      condition
    FROM experiment_results
    ORDER BY created_at ASC
  `)
  .all();

db.close();

const headers = [
  'id',
  'session_id',
  'participant_id',
  'experiment_id',
  'config_version',
  'condition',
  'confirmation_code',
  'created_at',
  'overall_score',
  'uploaded_block_score',
  'block_count',
  'uploaded_trial_count',
  'score_values',
  'score_count',
  'score_mean',
  'score_median',
  'score_stddev',
  'score_min',
  'score_max',
  'timing_values',
  'timing_count',
  'timing_mean',
  'timing_median',
  'timing_stddev',
  'timing_min',
  'timing_max',
  'payload_bytes',
  'payload_excerpt',
];

if (includePayload) {
  headers.push('payload');
}

const lines = [headers.map(escapeCsv).join(',')];

for (const row of rows) {
  const payloadText = typeof row.payload === 'string' ? row.payload : '';
  const scores = parseMetricArray(row.score);
  const timings = parseMetricArray(row.timing);
  const scoreStats = summarise(scores);
  const timingStats = summarise(timings);

  let overallScore = '';
  let uploadedBlockScore = '';
  let blockCount = '';
  let uploadedTrialCount = '';

  if (payloadText) {
    try {
      const payload = JSON.parse(payloadText);
      if (Number.isFinite(Number(payload?.overallScore))) {
        overallScore = formatNumber(Number(payload.overallScore));
      }

      if (Array.isArray(payload?.blocks)) {
        blockCount = payload.blocks.length;
        let uploadedTrials = 0;
        let uploadedScoreSum = 0;

        for (const block of payload.blocks) {
          if (!block || block.upload === false) continue;
          if (Array.isArray(block.trials)) {
            uploadedTrials += block.trials.length;
          }
          const blockScore = Number(block?.totalScore);
          if (Number.isFinite(blockScore)) {
            uploadedScoreSum += blockScore;
          }
        }

        uploadedBlockScore = formatNumber(uploadedScoreSum);
        uploadedTrialCount = uploadedTrials;
      }
    } catch (err) {
      // Leave derived payload fields blank if parsing fails.
    }
  }

  const payloadBytes = Buffer.byteLength(payloadText, 'utf8');
  const payloadExcerpt = payloadText
    ? payloadText
        .replace(/\s+/g, ' ')
        .slice(0, 160)
    : '';

  const record = {
    id: row.id,
    session_id: row.session_id,
    participant_id: row.participant_id ?? '',
    experiment_id: row.experiment_id ?? '',
    config_version: row.config_version ?? '',
    condition: row.condition ?? '',
    confirmation_code: row.confirmation_code ?? '',
    created_at: row.created_at ?? '',
    overall_score: overallScore,
    uploaded_block_score: uploadedBlockScore,
    block_count: blockCount,
    uploaded_trial_count: uploadedTrialCount,
    score_values: JSON.stringify(scores),
    score_count: scoreStats.count,
    score_mean: formatNumber(scoreStats.mean),
    score_median: formatNumber(scoreStats.median),
    score_stddev: formatNumber(scoreStats.stddev),
    score_min: formatNumber(scoreStats.min),
    score_max: formatNumber(scoreStats.max),
    timing_values: JSON.stringify(timings),
    timing_count: timingStats.count,
    timing_mean: formatNumber(timingStats.mean),
    timing_median: formatNumber(timingStats.median),
    timing_stddev: formatNumber(timingStats.stddev),
    timing_min: formatNumber(timingStats.min),
    timing_max: formatNumber(timingStats.max),
    payload_bytes: payloadBytes,
    payload_excerpt: payloadExcerpt,
  };

  if (includePayload) {
    record.payload = payloadText;
  }

  const values = headers.map((key) => escapeCsv(record[key] ?? ''));
  lines.push(values.join(','));
}

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

console.log(
  `Exported ${rows.length} experiment result${rows.length === 1 ? '' : 's'} to ${path.relative(
    projectRoot,
    outputPath
  )}`,
);

function parseMetricArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(toNumber).filter(isFiniteNumber);
  if (typeof raw !== 'string') return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(toNumber).filter(isFiniteNumber);
    }
  } catch (err) {
    // Fall back to comma-separated parsing below.
  }

  return trimmed
    .split(/[\s,]+/)
    .map(toNumber)
    .filter(isFiniteNumber);
}

function summarise(values) {
  if (!values.length) {
    return {
      count: 0,
      mean: '',
      median: '',
      stddev: '',
      min: '',
      max: '',
    };
  }

  const count = values.length;
  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / count;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);

  return {
    count,
    mean,
    median,
    stddev,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
    return value.toString();
  }
  const fixed = value.toFixed(6).replace(/\.0+$/, '.0');
  return fixed.replace(/\.?(?:0)+$/, '');
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function escapeCsv(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
