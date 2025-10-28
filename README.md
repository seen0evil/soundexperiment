# Peak Timing Experiment Server

This project hosts the Peak Timing Game as a multi-user web experiment with
server-side data logging.

## Getting started

```bash
npm install
npm start
```

The server listens on `http://localhost:3000` by default and serves the client
from the `public/` directory. All experiment events are stored in a local
SQLite database under `data/experiments.sqlite`.

## Data model

- **sessions** – Created when a participant opens the page. Tracks the browser
  metadata and last activity time.
- **trials** – One row per attempt. Stores the raw payload emitted by the
  client along with summary fields (`score`, `judgement`, `trial_index`).
- **experiment_results** – One row per participant for structured experiment
  runs. Each row captures the aggregated block and trial data, participant
  metadata, and a generated confirmation code returned to the browser.

## Front-end behaviour

The client automatically establishes a session, queues trial results while
offline, and retries uploads until the server acknowledges them. A status chip
in the history panel indicates whether results are queued, uploading, or
successfully saved.

### Structured experiment flow

The free-play interface continues to live at `public/index.html`. A
configuration-driven, structured flow is available at
`public/experiment.html`. It presents a sequence of instruction screens, runs a
practice block followed by a recorded block, and submits a single aggregated
payload to `POST /api/experiment-results` once all blocks have finished.

You can override the default configuration by defining a `window.EXPERIMENT_CONFIG`
object before `experimentFlow.js` executes. The object accepts:

- `instructions` – An array of instruction pages. Each entry can include
  `title`, `body` (string or array of strings), `advanceLabel`, optional
  `collectParticipantId` to request an ID, and an optional `showBefore` field
  targeting a block `id`.
- `blocks` – Ordered block definitions with `id`, `label`, `trials`,
  `upload` (whether the block counts toward the final dataset), and
  `parameters` applied to the Target Slider game (speed, sharpness, target
  range, etc.). Parameters may also include `audioMode` (`off`, `immediate`,
  or `delay`) and `audioDelayMs` to control feedback timing per block.
- `end` – Copy for the final summary panel.

Each block accumulates per-trial payloads plus the total score, and the client
produces a confirmation code returned by the server once the aggregate upload
succeeds.
