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
    modeTarget: document.getElementById('modeTarget'),
    pointsMax: document.getElementById('pointsMax'),
    pointsMaxVal: document.getElementById('pointsMaxVal'),
    rewardGamma: document.getElementById('rewardGamma'),
    rewardGammaVal: document.getElementById('rewardGammaVal'),
    playerSpeed: document.getElementById('playerSpeed'),
    playerSpeedVal: document.getElementById('playerSpeedVal'),
    targetMin: document.getElementById('targetMin'),
    targetMinVal: document.getElementById('targetMinVal'),
    targetMax: document.getElementById('targetMax'),
    targetMaxVal: document.getElementById('targetMaxVal'),
  };

  function refreshLabels(){
    ui.speedVal.textContent = (+ui.speed.value).toFixed(2);
    ui.sharpVal.textContent = (+ui.sharp.value).toFixed(1) + '×';
    ui.ampVal.textContent = (+ui.amp.value).toFixed(0);
    if (ui.pointsMaxVal) ui.pointsMaxVal.textContent = (+ui.pointsMax.value).toFixed(0);
    if (ui.rewardGammaVal) ui.rewardGammaVal.textContent = (+ui.rewardGamma.value).toFixed(2);
    if (ui.playerSpeedVal) ui.playerSpeedVal.textContent = (+ui.playerSpeed.value).toFixed(0);
    if (ui.targetMinVal) ui.targetMinVal.textContent = (+ui.targetMin.value).toFixed(2);
    if (ui.targetMaxVal) ui.targetMaxVal.textContent = (+ui.targetMax.value).toFixed(2);
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

  async function loadAudioFromUrl(url, statusLabel) {
    ensureAudioContext();
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error('Fetch failed');
    const arr = await r.arrayBuffer();
    audioBuffer = await decodeArrayBufferToAudio(arr);
    if (audioControls.status) audioControls.status.textContent = statusLabel ?? `Loaded from URL`;
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

  async function loadDefaultAudio(){
    try {
      await loadAudioFromUrl('audio/200hz-91945.mp3', 'Loaded default audio (200hz-91945.mp3)');
    } catch (err) {
      console.warn('Failed to load default audio', err);
      if (audioControls.status) audioControls.status.textContent = 'Default audio unavailable (using built-in click).';
    }
  }
  loadDefaultAudio();

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

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  // ------- Game state & buttons -------
  let mode = 'ball';
  let targetPos = 1; // 0..1 bottom→top of the power bar

  const TARGET_TRIAL_MS = 4500;
  const TARGET_INTER_TRIAL_MS = 700;
  const FEEDBACK_FX_MS = 1100;

  const targetGame = {
    status: 'idle',
    playerPos: 0.2,
    playerFrozenPos: null,
    direction: 1,
    trialStart: null,
    timeoutAt: null,
    nextTrialAt: null,
    analytics: null,
    feedback: null,
    hasOutcome: false,
    lowerBound: 0,
    upperBound: 1,
  };

  function targetConfigSnapshot(){
    return {
      POINTS_MAX_PER_TRIAL: ui.pointsMax ? Number(ui.pointsMax.value) : null,
      REWARD_GAMMA: ui.rewardGamma ? Number(ui.rewardGamma.value) : null,
      PLAYER_PX_PER_S: ui.playerSpeed ? Number(ui.playerSpeed.value) : null,
      TARGET_MIN_POS: ui.targetMin ? Number(ui.targetMin.value) : null,
      TARGET_MAX_POS: ui.targetMax ? Number(ui.targetMax.value) : null,
    };
  }

  function logTargetConfig(action, payload){
    try {
      console.log(`[target-config] ${action}`, payload);
    } catch (err) {
      /* ignore logging errors */
    }
    if (targetGame.analytics){
      targetGame.analytics.configChanges.push({
        action,
        at: performance.now(),
        payload,
      });
    }
  }

  function randomizeTarget(){
    const cfg = targetConfigSnapshot();
    const min = Number.isFinite(cfg.TARGET_MIN_POS) ? cfg.TARGET_MIN_POS : 0;
    const max = Number.isFinite(cfg.TARGET_MAX_POS) ? cfg.TARGET_MAX_POS : 1;
    const lo = clamp(min, 0, 1);
    const hi = clamp(max, 0, 1);
    const span = Math.max(0, hi - lo);
    targetPos = lo + (span > 0 ? Math.random() * span : 0);
  }

  function resetTargetMode(){
    targetGame.status = 'idle';
    targetGame.playerFrozenPos = null;
    targetGame.trialStart = null;
    targetGame.timeoutAt = null;
    targetGame.nextTrialAt = null;
    targetGame.analytics = null;
    targetGame.feedback = null;
    targetGame.hasOutcome = false;
    targetGame.lowerBound = 0;
    targetGame.upperBound = 1;
  }

  function ensureTargetBounds(){
    if (!ui.targetMin || !ui.targetMax) return;
    let minVal = Number(ui.targetMin.value);
    let maxVal = Number(ui.targetMax.value);
    if (!Number.isFinite(minVal)) minVal = 0;
    if (!Number.isFinite(maxVal)) maxVal = 1;
    if (minVal > maxVal){
      // Adjust the opposing slider to maintain ordering
      maxVal = minVal;
      ui.targetMax.value = String(maxVal);
      if (ui.targetMaxVal) ui.targetMaxVal.textContent = maxVal.toFixed(2);
      logTargetConfig('change', { field: 'TARGET_MAX_POS', value: maxVal });
    }
    if (maxVal < minVal){
      minVal = maxVal;
      ui.targetMin.value = String(minVal);
      if (ui.targetMinVal) ui.targetMinVal.textContent = minVal.toFixed(2);
      logTargetConfig('change', { field: 'TARGET_MIN_POS', value: minVal });
    }
    return { minVal: clamp(minVal, 0, 1), maxVal: clamp(maxVal, 0, 1) };
  }

  function startTargetTrial(){
    const now = performance.now();
    const bounds = ensureTargetBounds();
    randomizeTarget();
    const cfg = targetConfigSnapshot();
    const lower = bounds ? bounds.minVal : clamp(cfg.TARGET_MIN_POS ?? 0, 0, 1);
    const upper = bounds ? bounds.maxVal : clamp(cfg.TARGET_MAX_POS ?? 1, 0, 1);
    targetGame.status = 'running';
    targetGame.trialStart = now;
    targetGame.timeoutAt = now + TARGET_TRIAL_MS;
    targetGame.nextTrialAt = null;
    targetGame.playerFrozenPos = null;
    targetGame.feedback = null;
    targetGame.hasOutcome = false;
    targetGame.direction = 1;
    targetGame.lowerBound = lower;
    targetGame.upperBound = Math.max(lower, upper);
    targetGame.playerPos = clamp(targetGame.lowerBound, 0, 1);
    targetGame.analytics = {
      trialStart: now,
      configSnapshot: cfg,
      configChanges: [],
      target: targetPos,
      freezeEvent: null,
      feedback: null,
    };
    logTargetConfig('trial_start', { ...cfg, TARGET_VALUE: targetPos });
  }

  function maybeStartTargetTrial(){
    if (mode !== 'target') return;
    if (targetGame.status === 'idle'){ startTargetTrial(); }
  }

  function targetColorForProximity(proximity){
    const base = [235, 70, 70];
    const good = [90, 220, 120];
    return [
      Math.round(base[0] + (good[0] - base[0]) * proximity),
      Math.round(base[1] + (good[1] - base[1]) * proximity),
      Math.round(base[2] + (good[2] - base[2]) * proximity),
    ];
  }

  function freezeTargetPlayer(){
    if (mode !== 'target') return false;
    if (targetGame.status !== 'running') return false;
    targetGame.status = 'frozen';
    targetGame.playerFrozenPos = targetGame.playerPos;
    targetGame.timeoutAt = null;
    const now = performance.now();
    if (targetGame.analytics){
      targetGame.analytics.freezeEvent = {
        at: now,
        playerValue: targetGame.playerFrozenPos,
      };
    }
    return true;
  }

  function completeTargetReward(){
    if (mode !== 'target') return;
    if (targetGame.playerFrozenPos == null || targetGame.hasOutcome) return;
    const now = performance.now();
    const cfg = targetConfigSnapshot();
    const playerValue = targetGame.playerFrozenPos;
    const trialTarget = targetPos;
    const distance = Math.abs(playerValue - trialTarget);
    const proximity = clamp(1 - distance, 0, 1);
    const gamma = Number.isFinite(cfg.REWARD_GAMMA) ? cfg.REWARD_GAMMA : 1;
    const pointsMax = Number.isFinite(cfg.POINTS_MAX_PER_TRIAL) ? cfg.POINTS_MAX_PER_TRIAL : 0;
    const proximityGamma = Math.pow(proximity, gamma);
    const reward = Math.round(proximityGamma * pointsMax);
    const colorRGB = targetColorForProximity(proximity);

    targetGame.status = 'feedback';
    targetGame.feedback = {
      startedAt: now,
      reward,
      colorRGB,
      distance,
      proximity,
      proximityGamma,
      playerValue,
      targetValue: trialTarget,
      cause: 'press',
    };
    targetGame.nextTrialAt = now + FEEDBACK_FX_MS + TARGET_INTER_TRIAL_MS;
    targetGame.hasOutcome = true;
    targetGame.playerPos = playerValue;

    const analytics = targetGame.analytics;
    if (analytics){
      analytics.feedback = {
        at: now,
        distance,
        proximity,
        proximityGamma,
        reward,
        colorRGB,
        playerValue,
        targetValue: trialTarget,
        cause: 'press',
      };
    }

    ui.lastScore.textContent = reward.toFixed(0);
    ui.judgement.textContent = reward > 0 ? 'Reward' : 'Miss';

    const analyticsPayload = targetGame.analytics;
    targetGame.analytics = null;
    pushScore({
      score: reward,
      reward,
      judgement: reward > 0 ? 'Reward' : 'Miss',
      target: trialTarget,
      playerValue,
      analytics: analyticsPayload,
    });
  }

  function handleTargetTimeout(){
    if (mode !== 'target') return;
    if (targetGame.status !== 'running' || targetGame.hasOutcome) return;
    const now = performance.now();
    const colorRGB = targetColorForProximity(0);
    targetGame.status = 'timeout';
    targetGame.feedback = {
      startedAt: now,
      reward: 0,
      colorRGB,
      distance: null,
      proximity: 0,
      proximityGamma: 0,
      playerValue: null,
      targetValue: targetPos,
      cause: 'timeout',
    };
    targetGame.nextTrialAt = now + FEEDBACK_FX_MS + TARGET_INTER_TRIAL_MS;
    targetGame.hasOutcome = true;
    const analyticsPayload = targetGame.analytics;
    if (analyticsPayload){
      analyticsPayload.feedback = {
        at: now,
        distance: null,
        proximity: 0,
        proximityGamma: 0,
        reward: 0,
        colorRGB,
        playerValue: null,
        targetValue: targetPos,
        cause: 'timeout',
      };
    }
    ui.lastScore.textContent = '0';
    ui.judgement.textContent = 'Timeout';
    targetGame.analytics = null;
    pushScore({
      score: 0,
      reward: 0,
      judgement: 'Timeout',
      target: targetPos,
      playerValue: null,
      analytics: analyticsPayload,
    });
  }

  function maybeScheduleNextTargetTrial(){
    if (mode !== 'target') return;
    if (targetGame.status === 'feedback' || targetGame.status === 'timeout'){
      const now = performance.now();
      if (targetGame.nextTrialAt != null && now >= targetGame.nextTrialAt){
        resetTargetMode();
        startTargetTrial();
      }
    }
  }

  ui.modeBall.addEventListener('click', () => setMode('ball'));
  ui.modeBar.addEventListener('click', () => setMode('bar'));
  ui.modeTarget?.addEventListener('click', () => setMode('target'));
  function setMode(m){
    const prev = mode;
    mode = m;
    ui.modeBall.setAttribute('aria-pressed', m==='ball');
    ui.modeBar.setAttribute('aria-pressed', m==='bar');
    ui.modeTarget?.setAttribute('aria-pressed', m==='target');
    if (mode === 'target'){
      resetTargetMode();
      startTargetTrial();
    } else if (prev === 'target'){
      resetTargetMode();
    }
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
      targetPosition: mode === 'target' ? (result.target ?? targetPos) : null,
      playerValue: mode === 'target' ? (result.playerValue ?? null) : null,
      pointsMaxPerTrial: ui.pointsMax ? Number(ui.pointsMax.value) : null,
      rewardGamma: ui.rewardGamma ? Number(ui.rewardGamma.value) : null,
      playerPxPerS: ui.playerSpeed ? Number(ui.playerSpeed.value) : null,
      targetMinPos: ui.targetMin ? Number(ui.targetMin.value) : null,
      targetMaxPos: ui.targetMax ? Number(ui.targetMax.value) : null,
    };
    const timings = {
      eventToFrameMs: (lastEventTime != null && lastFrameAfterEventTime != null)
        ? Math.round(lastFrameAfterEventTime - lastEventTime) : null,
      pollToFrameMs: (lastPollTime != null && lastFrameAfterPollTime != null)
        ? Math.round(lastFrameAfterPollTime - lastPollTime) : null,
      eventToPollMs: (lastEventTime != null && lastPollTime != null)
        ? Math.round(lastPollTime - lastEventTime) : null,
    };
    const trialPayload = {
      index: scores.length,
      score,
      judgement: result.judgement,
      settings,
      timings,
      clientTimestamp: new Date().toISOString(),
    };
    if (typeof result.reward === 'number'){ trialPayload.reward = result.reward; }
    if (result.analytics){ trialPayload.analytics = result.analytics; }
    enqueueTrial(trialPayload);
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
  ui.pointsMax?.addEventListener('input', () => {
    refreshLabels();
    const value = Number(ui.pointsMax.value);
    logTargetConfig('change', { field: 'POINTS_MAX_PER_TRIAL', value });
  });
  ui.rewardGamma?.addEventListener('input', () => {
    refreshLabels();
    const value = Number(ui.rewardGamma.value);
    logTargetConfig('change', { field: 'REWARD_GAMMA', value });
  });
  ui.playerSpeed?.addEventListener('input', () => {
    refreshLabels();
    const value = Number(ui.playerSpeed.value);
    logTargetConfig('change', { field: 'PLAYER_PX_PER_S', value });
  });
  ui.targetMin?.addEventListener('input', () => {
    refreshLabels();
    const bounds = ensureTargetBounds();
    const value = Number(ui.targetMin.value);
    logTargetConfig('change', { field: 'TARGET_MIN_POS', value });
    if (bounds){
      targetPos = clamp(targetPos, bounds.minVal, bounds.maxVal);
      targetGame.lowerBound = bounds.minVal;
      targetGame.upperBound = bounds.maxVal;
      if (targetGame.playerPos != null) targetGame.playerPos = clamp(targetGame.playerPos, bounds.minVal, bounds.maxVal);
      if (targetGame.playerFrozenPos != null) targetGame.playerFrozenPos = clamp(targetGame.playerFrozenPos, bounds.minVal, bounds.maxVal);
    }
  });
  ui.targetMax?.addEventListener('input', () => {
    refreshLabels();
    const bounds = ensureTargetBounds();
    const value = Number(ui.targetMax.value);
    logTargetConfig('change', { field: 'TARGET_MAX_POS', value });
    if (bounds){
      targetPos = clamp(targetPos, bounds.minVal, bounds.maxVal);
      targetGame.lowerBound = bounds.minVal;
      targetGame.upperBound = bounds.maxVal;
      if (targetGame.playerPos != null) targetGame.playerPos = clamp(targetGame.playerPos, bounds.minVal, bounds.maxVal);
      if (targetGame.playerFrozenPos != null) targetGame.playerFrozenPos = clamp(targetGame.playerFrozenPos, bounds.minVal, bounds.maxVal);
    }
  });
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

        if (mode === 'target'){
          maybeStartTargetTrial();
          const frozen = freezeTargetPlayer();
          if (!frozen){ return; }
        }

        // Audio: either immediate (at keypress) or aligned to score time
        if (modeSel !== 'off') {
          const nowCtx = audioCtx ? audioCtx.currentTime : 0;
          const audioDelay = (modeSel === 'immediate') ? 0 : delayMs;
          scheduleSoundAt(nowCtx, audioDelay, durMs);
        }

        // Schedule the actual scoring at tEval
        scheduleAtPerf(tEval, () => {
          if (mode === 'target'){
            completeTargetReward();
            return;
          }
          const thetaEval = thetaAtTime(tEval);
          const sharp = +ui.sharp.value;

          let closeness;
          const trialTarget = targetPos;
          let playerValue = null;

          if (mode === 'ball'){
            closeness = (1 + Math.cos(thetaEval)) / 2;   // 1 at peak
          } else {
            const normHeight = (1 - Math.cos(thetaEval)) / 2;   // peak at 1
            if (mode === 'bar'){
              closeness = normHeight;
            } else {
              playerValue = normHeight;
              const distance = Math.abs(normHeight - trialTarget);
              closeness = Math.max(0, 1 - distance);
            }
          }
          const atPeak = Math.pow(closeness, sharp);
          const score = 100 * atPeak;

          ui.lastScore.textContent = score.toFixed(1);
          const judgement = (score>=90? 'Perfect' : score>=75? 'Great' : score>=50? 'Good' : 'Miss');
          ui.judgement.textContent = judgement;
          pushScore({ score, judgement, target: (mode === 'target') ? trialTarget : null, playerValue });
          if (mode !== 'target'){
            ripple = { t0: performance.now(), alive: 380, mode, theta: thetaEval, target: trialTarget, playerValue };
          }
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

    function drawTargetScene(){
      const bx = W*0.25, bw = 36, h = H*0.72, pad = 22;
      const y0 = (H - h)/2;

      p.push(); p.noStroke(); p.fill(20, 30, 70);
      p.rect(bx, y0, bw, h, 10); p.pop();

      const innerTop = y0 + pad, innerBot = y0 + h - pad;

      maybeStartTargetTrial();

      if (targetGame.status === 'running'){
        const track = innerBot - innerTop;
        const speed = Number(ui.playerSpeed?.value ?? 0);
        const lower = clamp(targetGame.lowerBound ?? 0, 0, 1);
        const upper = clamp(targetGame.upperBound ?? 1, lower, 1);
        if (track > 0 && Number.isFinite(speed)){
          const delta = (speed / track) * (p.deltaTime / 1000);
          const proposed = (targetGame.playerPos ?? lower) + targetGame.direction * delta;
          targetGame.playerPos = clamp(proposed, lower, upper);
          if (targetGame.playerPos >= upper && upper > lower){ targetGame.direction = -1; }
          else if (targetGame.playerPos <= lower && upper > lower){ targetGame.direction = 1; }
        }
        if (targetGame.timeoutAt != null && performance.now() >= targetGame.timeoutAt){
          handleTargetTimeout();
        }
      }

      maybeScheduleNextTargetTrial();

      const playerNormRaw = (targetGame.playerFrozenPos != null) ? targetGame.playerFrozenPos : (targetGame.playerPos ?? targetGame.lowerBound ?? 0);
      const lowerClamped = clamp(targetGame.lowerBound ?? 0, 0, 1);
      const upperClamped = clamp(targetGame.upperBound ?? 1, lowerClamped, 1);
      const playerNorm = clamp(playerNormRaw, lowerClamped, upperClamped);
      const playerY = p.lerp(innerBot, innerTop, playerNorm);
      const targetY = p.lerp(innerBot, innerTop, clamp(targetPos, 0, 1));

      p.push(); p.noStroke(); p.fill(122, 162, 255);
      p.rect(bx + 6, playerY, bw - 12, innerBot - playerY, 6); p.pop();

      p.push(); p.noStroke(); p.fill(180, 196, 255);
      p.circle(bx + bw/2, playerY, 18);
      p.pop();

      p.push();
      p.noFill(); p.stroke(255, 214, 116); p.strokeWeight(3);
      p.circle(bx + bw/2, targetY, 26);
      p.pop();

      if (targetGame.feedback && targetGame.feedback.playerValue != null){
        const color = targetGame.feedback.colorRGB || [255, 90, 90];
        p.push();
        p.stroke(color[0], color[1], color[2], 220);
        p.strokeWeight(4);
        p.line(bx + bw/2, playerY, bx + bw/2, targetY);
        p.pop();
      }

      if (targetGame.status === 'frozen' && targetGame.playerFrozenPos != null && !targetGame.feedback){
        const color = targetColorForProximity(Math.max(0, 1 - Math.abs(targetGame.playerFrozenPos - targetPos)));
        p.push();
        p.stroke(color[0], color[1], color[2], 200);
        p.strokeWeight(2.5);
        p.line(bx + bw/2, playerY, bx + bw/2, targetY);
        p.pop();
      }

      if (targetGame.feedback && targetGame.feedback.cause !== 'timeout'){
        const age = performance.now() - targetGame.feedback.startedAt;
        if (age <= FEEDBACK_FX_MS){
          const t = clamp(1 - age / FEEDBACK_FX_MS, 0, 1);
          const color = targetGame.feedback.colorRGB || [255, 255, 255];
          const alpha = Math.round(255 * t);
          p.push();
          p.textAlign(p.CENTER, p.BOTTOM);
          p.textSize(26);
          p.fill(color[0], color[1], color[2], alpha);
          p.noStroke();
          const midY = (playerY + targetY) / 2;
          p.text(`+${targetGame.feedback.reward} pts`, bx + bw/2, midY - 12);
          p.pop();
        }
      }

      if (targetGame.status === 'timeout'){
        const age = targetGame.feedback ? performance.now() - targetGame.feedback.startedAt : 0;
        const t = clamp(1 - age / FEEDBACK_FX_MS, 0, 1);
        p.push();
        p.fill(12, 18, 42, 160);
        p.noStroke();
        p.rect(0, 0, W, H, 10);
        p.pop();

        p.push();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(30);
        p.fill(255, 200, 200, Math.round(255 * t));
        p.text('Timeout', W/2, H/2);
        p.pop();
      }

      p.push(); p.noStroke(); p.fill(200, 210, 255);
      p.textAlign(p.LEFT, p.TOP); p.textSize(14);
      p.text('Match the target circle’s height on the slider', W*0.5, H*0.22);
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
      if (mode === 'ball'){ drawBallScene(); }
      else if (mode === 'bar'){ drawBarScene(); }
      else { drawTargetScene(); }

      if (ripple){
        const age = nowPerf - ripple.t0, life = ripple.alive;
        if (age > life){ ripple = null; }
        else {
          const t = age / life;
          const r = p.lerp(6, 60, t), a = p.lerp(180, 0, t);
          p.noFill(); p.stroke(122,162,255, a); p.strokeWeight(2);
          let cx = W*0.25;
          let cy = H*0.5;
          if (ripple.mode === 'ball'){
            const A = +ui.amp.value;
            cy = H*0.5 - A*Math.cos(ripple.theta ?? theta);
          } else {
            const bx = W*0.25, bw = 36, h = H*0.72, pad = 22;
            const y0 = (H - h)/2;
            const innerTop = y0 + pad, innerBot = y0 + h - pad;
            cx = bx + bw/2;
            if (ripple.mode === 'target' && typeof ripple.playerValue === 'number'){
              cy = p.lerp(innerBot, innerTop, ripple.playerValue);
            } else if (ripple.mode === 'target' && typeof ripple.target === 'number'){
              cy = p.lerp(innerBot, innerTop, ripple.target);
            } else {
              cy = innerTop;
            }
          }
          p.circle(cx, cy, r*2);
        }
      }
    };
  };

  // Create p5 instance
  new p5(sketch);
}

window.initPeakTimingGame = initPeakTimingGame;

