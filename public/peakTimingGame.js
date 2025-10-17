function initPeakTimingGame(){
  // ------- UI state & helpers -------
  const ui = {
    lastScore: document.getElementById('lastScore'),
    judgement: document.getElementById('judgement'),
    speed: document.getElementById('speed'),
    speedVal: document.getElementById('speedVal'),
    sharp: document.getElementById('sharp'),
    sharpVal: document.getElementById('sharpVal'),
    amp: document.getElementById('amp'),
    ampVal: document.getElementById('ampVal'),
    log: document.getElementById('log'),
    attempts: document.getElementById('attempts'),
    avg: document.getElementById('avg'),
    reset: document.getElementById('reset'),
    modeBall: document.getElementById('modeBall'),
    modeBar: document.getElementById('modeBar'),
  };

  function refreshLabels(){
    ui.speedVal.textContent = (+ui.speed.value).toFixed(2);
    ui.sharpVal.textContent = (+ui.sharp.value).toFixed(1) + '×';
    ui.ampVal.textContent = (+ui.amp.value).toFixed(0);
  }

  // ---- Input polling & FPS cap ----
  const fpsEl = document.getElementById('fps');
  const fpsVal = document.getElementById('fpsVal');
  const pollEl = document.getElementById('poll');
  const pollVal = document.getElementById('pollVal');
  const clockEl = document.getElementById('clock');
  const ev2frEl = document.getElementById('ev2fr');
  const po2frEl = document.getElementById('po2fr');
  const ev2poEl = document.getElementById('ev2po');
  const pollLogEl = document.getElementById('pollLog');

  let immediatePressed = false;
  let prevPressed = false;
  let pollIntervalMs = 1000/250;
  let pollTimer = null;

  let lastEventTime = null;
  let lastPollTime = null;
  let lastFrameAfterEventTime = null;
  let lastFrameAfterPollTime = null;
  let pendingEventFrame = false;
  let pendingPollFrame = false;
  let appStart = performance.now();
  let lastRenderAt = performance.now();
  let targetFrameMs = 1000/60;

  let invokePress = null; // assigned inside sketch

  function updateClock(){
    const now = performance.now();
    clockEl.textContent = Math.round(now - appStart) + ' ms';
  }

  function logLine(text){
    const div = document.createElement('div');
    div.textContent = text;
    pollLogEl.prepend(div);
    while (pollLogEl.childElementCount > 26){ pollLogEl.removeChild(pollLogEl.lastChild); }
  }

  function pollOnce(){
    const t = performance.now();
    if (immediatePressed && !prevPressed){
      lastPollTime = t;
      pendingPollFrame = true;
      if (lastEventTime != null){ ev2poEl.textContent = Math.round(lastPollTime - lastEventTime) + ' ms'; }
      logLine('event '+Math.round((lastEventTime??t)-appStart)+' → poll '+Math.round(lastPollTime-appStart));
      if (invokePress){ invokePress(); }
    }
    prevPressed = immediatePressed;
    updateClock();
  }

  function restartPoller(){
    if (pollTimer) clearInterval(pollTimer);
    const hz = Number(pollEl.value);
    pollVal.textContent = hz + ' Hz';
    pollIntervalMs = 1000 / Math.max(1, hz);
    pollTimer = setInterval(pollOnce, pollIntervalMs);
  }
  pollEl.addEventListener('input', restartPoller);
  restartPoller();

  function setFpsFromSlider(){
    const fps = Number(fpsEl.value);
    fpsVal.textContent = fps;
    targetFrameMs = 1000 / Math.max(1, fps);
  }
  fpsEl.addEventListener('input', setFpsFromSlider);
  setFpsFromSlider();

  // ------- Audio: UI & Web Audio state -------
  const audioControls = {
    mode: document.getElementById('audioMode'),
    delay: document.getElementById('audioDelay'),
    delayVal: document.getElementById('audioDelayVal'),
    dur: document.getElementById('audioDur'),
    durVal: document.getElementById('audioDurVal'),
    vol: document.getElementById('audioVol'),
    volVal: document.getElementById('audioVolVal'),
    file: document.getElementById('audioFile'),
    url: document.getElementById('audioUrl'),
    loadUrlBtn: document.getElementById('audioLoadUrl'),
    status: document.getElementById('audioStatus'),
  };

  if (audioControls.delay) {
    audioControls.delay.addEventListener('input', () => {
      audioControls.delayVal.textContent = audioControls.delay.value;
    });
    audioControls.delay.dispatchEvent(new Event('input'));
  }
  if (audioControls.dur) {
    audioControls.dur.addEventListener('input', () => {
      audioControls.durVal.textContent = audioControls.dur.value;
    });
    audioControls.dur.dispatchEvent(new Event('input'));
  }
  if (audioControls.vol) {
    audioControls.vol.addEventListener('input', () => {
      audioControls.volVal.textContent = (+audioControls.vol.value).toFixed(2);
      if (window.masterGain) masterGain.gain.value = +audioControls.vol.value;
    });
    audioControls.vol.dispatchEvent(new Event('input'));
  }

  let audioCtx = null;
  let masterGain = null;
  let audioBuffer = null;   // user-provided buffer
  let builtInClick = null;  // fallback buffer

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = +audioControls.vol.value || 1.0;
      masterGain.connect(audioCtx.destination);
      builtInClick = makeClickBuffer(audioCtx);
    }
    if (masterGain && audioControls.vol) {
      masterGain.gain.value = +audioControls.vol.value;
    }
  }

  // fallback tone generator (short, click-free)
  function makeClickBuffer(ctx, dur=0.02, freq=2200) {
    const sr = ctx.sampleRate;
    const len = Math.floor(dur * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.sin(Math.min(Math.PI, Math.PI * t / 0.005)); // 5ms Hann
      data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.25;
    }
    return buf;
  }

  async function decodeArrayBufferToAudio(ab) {
    return new Promise((resolve, reject) => {
      audioCtx.decodeAudioData(ab.slice(0), resolve, reject);
    });
  }

  async function loadAudioFromFile(file) {
    ensureAudioContext();
    const arr = await file.arrayBuffer();
    audioBuffer = await decodeArrayBufferToAudio(arr);
    if (audioControls.status) audioControls.status.textContent = `Loaded: ${file.name}`;
  }

  async function loadAudioFromUrl(url) {
    ensureAudioContext();
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error('Fetch failed');
    const arr = await r.arrayBuffer();
    audioBuffer = await decodeArrayBufferToAudio(arr);
    if (audioControls.status) audioControls.status.textContent = `Loaded from URL`;
  }

  if (audioControls.file) {
    audioControls.file.addEventListener('change', async () => {
      const f = audioControls.file.files?.[0];
      if (!f) return;
      try { await loadAudioFromFile(f); }
      catch (err) { console.error(err); if (audioControls.status) audioControls.status.textContent = 'Failed to load file'; }
    });
  }
  if (audioControls.loadUrlBtn) {
    audioControls.loadUrlBtn.addEventListener('click', async () => {
      const url = audioControls.url.value.trim();
      if (!url) return;
      try { await loadAudioFromUrl(url); }
      catch (err) { console.error(err); if (audioControls.status) audioControls.status.textContent = 'Failed to load URL (check CORS)'; }
    });
  }

  // Duration-aware, anti-click scheduling
  function scheduleSoundAt(nowCtxTime, delayMs, durMs) {
    ensureAudioContext();
    if (audioCtx.state === 'suspended') { audioCtx.resume(); }

    const buf = audioBuffer || builtInClick;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;

    const g = audioCtx.createGain();
    src.connect(g).connect(masterGain);

    const when = nowCtxTime + (delayMs / 1000);

    const bufDur = buf.duration;
    const rawDurSec = durMs ? Math.max(0.005, durMs / 1000) : bufDur;
    const durationSec = Math.min(rawDurSec, bufDur);

    const fade = Math.min(0.01, durationSec / 4);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + fade);
    const holdEnd = Math.max(when + fade, when + durationSec - fade);
    g.gain.setValueAtTime(1, holdEnd);
    g.gain.linearRampToValueAtTime(0, when + durationSec);

    try { src.start(when, 0, durationSec); }
    catch (e) { src.start(audioCtx.currentTime, 0, durationSec); }
    return when;
  }

  // ===== Precise scheduler for scoring at a target performance.now() =====
  function scheduleAtPerf(targetMs, fn){
    const slack = 8; // ms to hand off from setTimeout to rAF spin
    const dt = targetMs - performance.now();
    if (dt <= 0) { fn(); return; }
    setTimeout(() => {
      function spin(){
        if (performance.now() >= targetMs) fn();
        else requestAnimationFrame(spin);
      }
      requestAnimationFrame(spin);
    }, Math.max(0, dt - slack));
  }

  // ------- Game state & buttons -------
  let mode = 'ball';
  ui.modeBall.addEventListener('click', () => setMode('ball'));
  ui.modeBar.addEventListener('click', () => setMode('bar'));
  function setMode(m){
    mode = m;
    ui.modeBall.setAttribute('aria-pressed', m==='ball');
    ui.modeBar.setAttribute('aria-pressed', m==='bar');
    refreshLabels();
  }

  const syncStatusEl = document.getElementById('syncStatus');
  const storageKey = 'peakTimingSessionId';
  let sessionId = null;
  let sessionReady = false;
  let reconnectTimer = null;
  let uploadInFlight = false;
  const trialQueue = [];

  try {
    const stored = window.localStorage?.getItem(storageKey);
    if (stored) sessionId = stored;
  } catch (err) {
    console.warn('Local storage unavailable', err);
  }

  function setSyncStatus(state, text){
    if (!syncStatusEl) return;
    syncStatusEl.dataset.state = state;
    syncStatusEl.textContent = text;
  }

  function scheduleReconnect(delayMs = 10000){
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      initSession();
    }, delayMs);
  }

  function clientMetadata(){
    let tz = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch (err) { tz = null; }
    return {
      timezone: tz,
      language: navigator.language,
      platform: navigator.platform,
    };
  }

  async function initSession(){
    if (uploadInFlight) return;
    setSyncStatus('pending', 'Connecting…');
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userAgent: navigator.userAgent,
          metadata: clientMetadata(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      sessionId = data.sessionId;
      sessionReady = true;
      try { window.localStorage?.setItem(storageKey, sessionId); }
      catch (err) { /* ignore */ }
      setSyncStatus('ok', trialQueue.length ? 'Saving…' : 'Connected');
      flushTrialQueue();
    } catch (err) {
      console.error('Failed to initialise session', err);
      sessionReady = false;
      setSyncStatus('error', 'Offline (retrying in 10s)');
      scheduleReconnect();
    }
  }

  async function flushTrialQueue(){
    if (!sessionReady || uploadInFlight) return;
    if (!trialQueue.length){
      setSyncStatus('ok', 'All data saved');
      return;
    }
    const trial = trialQueue[0];
    uploadInFlight = true;
    setSyncStatus('pending', 'Saving…');
    try {
      const res = await fetch('/api/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, trial }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      trialQueue.shift();
      setSyncStatus('ok', trialQueue.length ? 'Saving…' : 'All data saved');
    } catch (err) {
      console.error('Failed to upload trial', err);
      sessionReady = false;
      setSyncStatus('error', 'Offline (retrying in 10s)');
      scheduleReconnect();
    } finally {
      uploadInFlight = false;
    }
    if (sessionReady && trialQueue.length){
      flushTrialQueue();
    }
  }

  function enqueueTrial(trial){
    trialQueue.push(trial);
    if (sessionReady) flushTrialQueue();
    else if (syncStatusEl?.dataset.state !== 'pending') setSyncStatus('error', 'Offline (queued)');
  }

  window.addEventListener('online', () => {
    if (!sessionReady) initSession();
  });

  initSession();

  const scores = [];
  function pushScore(result){
    const score = result.score;
    scores.push(score);
    const li = document.createElement('div');
    li.textContent = score.toFixed(1);
    ui.log.prepend(li);
    ui.attempts.textContent = String(scores.length);
    const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
    ui.avg.textContent = avg.toFixed(1);
    if (ui.log.childElementCount>40){ ui.log.removeChild(ui.log.lastChild); }
    const settings = {
      mode,
      speed: Number(ui.speed.value),
      sharpness: Number(ui.sharp.value),
      amplitude: Number(ui.amp.value),
      fpsCap: Number(fpsEl.value),
      pollRateHz: Number(pollEl.value),
      audio: audioControls ? {
        mode: audioControls.mode?.value ?? null,
        delayMs: audioControls.delay ? Number(audioControls.delay.value) : null,
        durationMs: audioControls.dur ? Number(audioControls.dur.value) : null,
        volume: audioControls.vol ? Number(audioControls.vol.value) : null,
      } : null,
    };
    const timings = {
      eventToFrameMs: (lastEventTime != null && lastFrameAfterEventTime != null)
        ? Math.round(lastFrameAfterEventTime - lastEventTime) : null,
      pollToFrameMs: (lastPollTime != null && lastFrameAfterPollTime != null)
        ? Math.round(lastFrameAfterPollTime - lastPollTime) : null,
      eventToPollMs: (lastEventTime != null && lastPollTime != null)
        ? Math.round(lastPollTime - lastEventTime) : null,
    };
    enqueueTrial({
      index: scores.length,
      score,
      judgement: result.judgement,
      settings,
      timings,
      clientTimestamp: new Date().toISOString(),
    });
  }

  ui.reset.addEventListener('click', ()=>{
    scores.length = 0;
    ui.log.innerHTML = '';
    ui.attempts.textContent = '0';
    ui.avg.textContent = '—';
    ui.lastScore.textContent = '—';
    ui.judgement.textContent = 'Press to start';
  });

  ui.speed.addEventListener('input', refreshLabels);
  ui.sharp.addEventListener('input', refreshLabels);
  ui.amp.addEventListener('input', refreshLabels);
  refreshLabels();

  // Prevent page scroll on Space
  document.addEventListener('keydown', (e)=>{
    const tag = document.activeElement?.tagName;
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA'){ e.preventDefault(); }
  }, { passive:false });

  // ===== Phase model (allows evaluating theta at an arbitrary future time) =====
  // We maintain a reference phase and timestamp, then compute theta(t) on demand.
  let phaseAtOrigin = 0;           // radians
  let phaseOriginPerf = performance.now(); // ms
  function omegaNow(){ return 2*Math.PI*Number(ui.speed.value); } // rad/s
  function thetaAtTime(perfMs){
    const dt = (perfMs - phaseOriginPerf) / 1000;
    const theta = (phaseAtOrigin + omegaNow() * dt) % (2*Math.PI);
    return (theta < 0) ? theta + 2*Math.PI : theta;
  }

  // ------- p5 sketch -------
  const sketch = (p) => {
    const W = 640, H = 420;
    let theta = 0;                 // phase (for rendering)
    let ripple = null;             // visual feedback
    let lastSimPerf = performance.now(); // last sim timestamp

    p.setup = () => {
      const cnv = p.createCanvas(W, H);
      cnv.parent('sketch-holder');
      p.pixelDensity(1);
      p.frameRate(240); // render cap handled manually

      // Input bindings (event layer only toggles state)
      p.keyPressed = () => {
        const tag = document.activeElement?.tagName;
        if (p.key === ' ' && tag !== 'INPUT' && tag !== 'TEXTAREA'){
          immediatePressed = true; lastEventTime = performance.now(); pendingEventFrame = true;
          ensureAudioContext(); // prime audio
          return false;
        }
      };
      p.mousePressed = () => { immediatePressed = true; lastEventTime = performance.now(); pendingEventFrame = true; ensureAudioContext(); };
      p.touchStarted = () => { immediatePressed = true; lastEventTime = performance.now(); pendingEventFrame = true; ensureAudioContext(); };

      // Release handlers
      p.keyReleased = () => { if (p.key === ' '){ immediatePressed = false; } };
      p.mouseReleased = () => { immediatePressed = false; };
      p.touchEnded = () => { immediatePressed = false; };

      // ===== scoring callback now schedules score at (keypress + delay) =====
      invokePress = function(){
        const modeSel = audioControls.mode?.value || 'off';
        const delayMs = Number(audioControls.delay?.value ?? 0);
        const durMs   = Number(audioControls.dur?.value ?? 0);

        const tPress = performance.now();
        const tEval  = tPress + delayMs; // score time is ALWAYS keypress + delay

        // Audio: either immediate (at keypress) or aligned to score time
        if (modeSel !== 'off') {
          const nowCtx = audioCtx ? audioCtx.currentTime : 0;
          const audioDelay = (modeSel === 'immediate') ? 0 : delayMs;
          scheduleSoundAt(nowCtx, audioDelay, durMs);
        }

        // Schedule the actual scoring at tEval
        scheduleAtPerf(tEval, () => {
          const thetaEval = thetaAtTime(tEval);
          const sharp = +ui.sharp.value;

          let closeness;
          if (mode === 'ball'){
            closeness = (1 + Math.cos(thetaEval)) / 2;   // 1 at peak
          } else {
            closeness = (1 - Math.cos(thetaEval)) / 2;   // peak at π
          }
          const atPeak = Math.pow(closeness, sharp);
          const score = 100 * atPeak;

          ui.lastScore.textContent = score.toFixed(1);
          const judgement = (score>=90? 'Perfect' : score>=75? 'Great' : score>=50? 'Good' : 'Miss');
          ui.judgement.textContent = judgement;
          pushScore({ score, judgement });
          ripple = { t0: performance.now(), alive: 380 };
        });
      };
    };

    function drawBallScene(){
      const cx = W*0.25;
      const cy = H*0.5;
      const A = +ui.amp.value;

      // Track path
      p.push(); p.noFill(); p.stroke(40, 66, 150); p.strokeWeight(2);
      p.line(cx, cy - A, cx, cy + A); p.pop();

      // Peak ring
      p.push();
      const atPeak = (1 + Math.cos(theta))/2;
      const glow = p.map(Math.pow(atPeak, 6), 0, 1, 10, 110);
      p.noFill(); p.stroke(122, 162, 255, glow); p.strokeWeight(3);
      p.circle(cx, cy - A, 36);
      p.pop();

      // Ball
      const y = cy - A * Math.cos(theta);
      p.noStroke(); p.fill(180, 196, 255); p.circle(cx, y, 26);

      // HUD line
      p.push(); p.stroke(64, 92, 180); p.strokeWeight(2);
      p.line(W*0.5, H*0.2, W*0.88, H*0.2); p.pop();

      p.push(); p.noStroke(); p.fill(200, 210, 255);
      p.textAlign(p.LEFT, p.TOP); p.textSize(14);
      p.text('Time your press at the ball’s highest point', W*0.5, H*0.22);
      p.pop();
    }

    function drawBarScene(){
      const bx = W*0.25, bw = 36, h = H*0.72, pad = 22;
      const y0 = (H - h)/2;

      p.push(); p.noStroke(); p.fill(20, 30, 70);
      p.rect(bx, y0, bw, h, 10); p.pop();

      const t = (1 - Math.cos(theta))/2; // 0..1, peak at 1
      const innerTop = y0 + pad, innerBot = y0 + h - pad;
      const y = p.lerp(innerBot, innerTop, t);

      p.push(); p.noStroke(); p.fill(122, 162, 255);
      p.rect(bx + 6, y, bw - 12, innerBot - y, 6); p.pop();

      const atPeak = t;
      const glow = p.map(Math.pow(atPeak, 6), 0, 1, 10, 110);
      p.push(); p.noFill(); p.stroke(122, 162, 255, glow); p.strokeWeight(3);
      p.rect(bx+3, innerTop-6, bw-6, 12, 6); p.pop();

      p.push(); p.noStroke(); p.fill(200, 210, 255);
      p.textAlign(p.LEFT, p.TOP); p.textSize(14);
      p.text('Time your press at the bar’s maximum height', W*0.5, H*0.22);
      p.pop();
    }

    p.draw = () => {
      const nowPerf = performance.now();

      // Simulation from a reference: update render theta AND refresh phase origin
      const dtSim = (nowPerf - lastSimPerf) / 1000;
      lastSimPerf = nowPerf;
      const w = omegaNow();
      theta = (theta + w * dtSim) % (2*Math.PI);

      // Refresh the phase origin so thetaAtTime() can compute future phase
      phaseAtOrigin = theta;
      phaseOriginPerf = nowPerf;

      // Render gate (FPS cap)
      const shouldRender = (nowPerf - lastRenderAt) >= targetFrameMs;
      if (!shouldRender){ return; }
      lastRenderAt = nowPerf;

      if (pendingEventFrame){ lastFrameAfterEventTime = nowPerf; ev2frEl.textContent = Math.round(lastFrameAfterEventTime - lastEventTime) + ' ms'; pendingEventFrame = false; }
      if (pendingPollFrame){ lastFrameAfterPollTime = nowPerf; po2frEl.textContent = Math.round(lastFrameAfterPollTime - lastPollTime) + ' ms'; pendingPollFrame = false; }

      p.background(12, 18, 42);
      if (mode === 'ball'){ drawBallScene(); } else { drawBarScene(); }

      if (ripple){
        const age = nowPerf - ripple.t0, life = ripple.alive;
        if (age > life){ ripple = null; }
        else {
          const t = age / life;
          const r = p.lerp(6, 60, t), a = p.lerp(180, 0, t);
          p.noFill(); p.stroke(122,162,255, a); p.strokeWeight(2);
          const cx=W*0.25, cy=H*0.5, A=+ui.amp.value;
          const y = (mode==='ball') ? cy - A*Math.cos(theta) : (H*0.5 - (H*0.72)/2 + 22);
          p.circle(W*0.25 + (mode==='ball' ? 0 : 18), y, r*2);
        }
      }
    };
  };

  // Create p5 instance
  new p5(sketch);
}

window.initPeakTimingGame = initPeakTimingGame;

