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

## Front-end behaviour

The client automatically establishes a session, queues trial results while
offline, and retries uploads until the server acknowledges them. A status chip
in the history panel indicates whether results are queued, uploading, or
successfully saved.
