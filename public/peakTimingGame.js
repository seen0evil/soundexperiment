function initPeakTimingGame(options = {}){
  const opts = {
    onTrialComplete: typeof options.onTrialComplete === 'function' ? options.onTrialComplete : null,
    autoUpload: options.autoUpload !== false,
    initialMode: options.initialMode || 'ball',
    lockControls: options.lockControls ?? false,
  };

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
    if (ui.speedVal && ui.speed) ui.speedVal.textContent = (+ui.speed.value).toFixed(2);
    if (ui.sharpVal && ui.sharp) ui.sharpVal.textContent = (+ui.sharp.value).toFixed(1) + '×';
    if (ui.ampVal && ui.amp) ui.ampVal.textContent = (+ui.amp.value).toFixed(0);
    if (ui.pointsMaxVal) ui.pointsMaxVal.textContent = (+ui.pointsMax.value).toFixed(0);
    if (ui.rewardGammaVal) ui.rewardGammaVal.textContent = (+ui.rewardGamma.value).toFixed(2);
    if (ui.playerSpeedVal) ui.playerSpeedVal.textContent = (+ui.playerSpeed.value).toFixed(2) + ' s';
    if (ui.targetMinVal) ui.targetMinVal.textContent = (+ui.targetMin.value).toFixed(2);
    if (ui.targetMaxVal) ui.targetMaxVal.textContent = (+ui.targetMax.value).toFixed(2);
  }

  function setSliderValue(el, value){
    if (!el || value == null) return;
    el.value = String(value);
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (err) {
      el.dispatchEvent(new Event('input'));
    }
  }

  function ensureSelectOption(selectEl, value, label){
    if (!selectEl) return;
    const exists = Array.from(selectEl.options || []).some((opt) => opt.value === value);
    if (!exists){
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label ?? value;
      selectEl.appendChild(option);
    }
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
  let gameInputEnabled = true;

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
      if (invokePress && gameInputEnabled){ invokePress(); }
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

  const targetMode = window.createTargetMode({
    ui,
    clamp,
    pushScore,
    refreshLabels,
  });

  ui.modeBall?.addEventListener('click', () => setMode('ball'));
  ui.modeBar?.addEventListener('click', () => setMode('bar'));
  ui.modeTarget?.addEventListener('click', () => setMode('target'));
  function setMode(m){
    const prev = mode;
    mode = m;
    ui.modeBall?.setAttribute('aria-pressed', m==='ball');
    ui.modeBar?.setAttribute('aria-pressed', m==='bar');
    ui.modeTarget?.setAttribute('aria-pressed', m==='target');
    if (mode === 'target' && prev !== 'target'){
      targetMode.enterMode();
    } else if (prev === 'target' && mode !== 'target'){
      targetMode.exitMode();
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
  const sessionListeners = new Set();

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

  function notifySessionReady(){
    if (!sessionReady || !sessionId) return;
    sessionListeners.forEach((listener) => {
      try { listener(sessionId); }
      catch (err) { console.error('session listener failed', err); }
    });
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
      notifySessionReady();
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

  const scores = [];
  function resetScoreboard(){
    scores.length = 0;
    if (ui.log) ui.log.innerHTML = '';
    if (ui.attempts) ui.attempts.textContent = '0';
    if (ui.avg) ui.avg.textContent = '—';
    if (ui.lastScore) ui.lastScore.textContent = '—';
    if (ui.judgement) ui.judgement.textContent = 'Press to start';
  }

  window.addEventListener('online', () => {
    if (!sessionReady) initSession();
  });

  initSession();
  function pushScore(result){
    const score = result.score;
    scores.push(score);
    if (ui.log){
      const li = document.createElement('div');
      li.textContent = score.toFixed(1);
      ui.log.prepend(li);
      if (ui.log.childElementCount>40){ ui.log.removeChild(ui.log.lastChild); }
    }
    if (ui.attempts) ui.attempts.textContent = String(scores.length);
    if (ui.avg){
      const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
      ui.avg.textContent = avg.toFixed(1);
    }
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
      targetPosition: mode === 'target' ? (result.target ?? targetMode.getTargetValue()) : null,
      playerValue: mode === 'target' ? (result.playerValue ?? null) : null,
      pointsMaxPerTrial: ui.pointsMax ? Number(ui.pointsMax.value) : null,
      rewardGamma: ui.rewardGamma ? Number(ui.rewardGamma.value) : null,
      playerTravelSeconds: ui.playerSpeed ? Number(ui.playerSpeed.value) : null,
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
      mode,
      settings,
      timings,
      clientTimestamp: new Date().toISOString(),
    };
    if (typeof result.reward === 'number'){ trialPayload.reward = result.reward; }
    if (result.analytics){ trialPayload.analytics = result.analytics; }
    let payloadForUpload = trialPayload;
    let shouldUpload = opts.autoUpload;
    if (opts.onTrialComplete){
      try {
        const feedback = opts.onTrialComplete({
          mode,
          result,
          trial: payloadForUpload,
          settings,
          timings,
          scores: [...scores],
        });
        if (feedback && typeof feedback === 'object'){
          if (Object.prototype.hasOwnProperty.call(feedback, 'upload')){
            shouldUpload = !!feedback.upload;
          }
          if (feedback.trial && typeof feedback.trial === 'object'){
            payloadForUpload = feedback.trial;
          }
        }
      } catch (err) {
        console.error('onTrialComplete callback failed', err);
      }
    }
    if (shouldUpload){
      enqueueTrial(payloadForUpload);
    }
  }

  ui.reset?.addEventListener('click', resetScoreboard);

  ui.speed?.addEventListener('input', refreshLabels);
  ui.sharp?.addEventListener('input', refreshLabels);
  ui.amp?.addEventListener('input', refreshLabels);
  ui.pointsMax?.addEventListener('input', () => {
    refreshLabels();
    const value = Number(ui.pointsMax.value);
    targetMode.recordConfigChange('POINTS_MAX_PER_TRIAL', value);
  });
  ui.rewardGamma?.addEventListener('input', () => {
    refreshLabels();
    const value = Number(ui.rewardGamma.value);
    targetMode.recordConfigChange('REWARD_GAMMA', value);
  });
  ui.playerSpeed?.addEventListener('input', () => {
    refreshLabels();
    const value = Number(ui.playerSpeed.value);
    targetMode.recordConfigChange('PLAYER_TRAVEL_SECONDS', value);
  });
  ui.targetMin?.addEventListener('input', () => {
    const bounds = targetMode.syncTargetRangeInputs('min');
    targetMode.recordConfigChange('TARGET_MIN_POS', bounds.min);
  });
  ui.targetMax?.addEventListener('input', () => {
    const bounds = targetMode.syncTargetRangeInputs('max');
    targetMode.recordConfigChange('TARGET_MAX_POS', bounds.max);
  });
  refreshLabels();

  function lockUiElements(disabled){
    const elements = [
      ui.speed,
      ui.sharp,
      ui.amp,
      ui.pointsMax,
      ui.rewardGamma,
      ui.playerSpeed,
      ui.targetMin,
      ui.targetMax,
      ui.modeBall,
      ui.modeBar,
      ui.modeTarget,
      ui.reset,
      fpsEl,
      pollEl,
      audioControls.mode,
      audioControls.delay,
      audioControls.dur,
      audioControls.vol,
      audioControls.file,
      audioControls.url,
      audioControls.loadUrlBtn,
    ].filter(Boolean);
    elements.forEach((el) => {
      el.disabled = disabled;
      if (disabled) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    });
  }

  const controller = {
    setMode,
    getMode: () => mode,
    setSpeed(value){ setSliderValue(ui.speed, value); },
    setSharpness(value){ setSliderValue(ui.sharp, value); },
    setAmplitude(value){ setSliderValue(ui.amp, value); },
    setTargetParams(params = {}){
      if (!params || typeof params !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(params, 'pointsMax')){
        setSliderValue(ui.pointsMax, params.pointsMax);
      }
      if (Object.prototype.hasOwnProperty.call(params, 'rewardGamma')){
        setSliderValue(ui.rewardGamma, params.rewardGamma);
      }
      if (Object.prototype.hasOwnProperty.call(params, 'playerSpeed')){
        setSliderValue(ui.playerSpeed, params.playerSpeed);
      }
      let rangeTouched = false;
      if (Object.prototype.hasOwnProperty.call(params, 'targetMin')){
        if (ui.targetMin) ui.targetMin.value = String(params.targetMin);
        rangeTouched = true;
      }
      if (Object.prototype.hasOwnProperty.call(params, 'targetMax')){
        if (ui.targetMax) ui.targetMax.value = String(params.targetMax);
        rangeTouched = true;
      }
      if (rangeTouched){ targetMode.syncTargetRangeInputs(); }
      refreshLabels();
    },
    setAudioParams(params = {}){
      if (!params || typeof params !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(params, 'mode')){
        const modeValue = params.mode ?? 'off';
        if (audioControls.mode){
          const labelMap = {
            off: 'No sound',
            immediate: 'Immediate at keypress',
            delay: 'After delay',
          };
          ensureSelectOption(audioControls.mode, modeValue, labelMap[modeValue] || modeValue);
          audioControls.mode.value = modeValue;
          try {
            audioControls.mode.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (err) {
            audioControls.mode.dispatchEvent(new Event('change'));
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(params, 'delayMs') && params.delayMs != null){
        setSliderValue(audioControls.delay, params.delayMs);
      }
      if (Object.prototype.hasOwnProperty.call(params, 'durationMs') && params.durationMs != null){
        setSliderValue(audioControls.dur, params.durationMs);
      }
    },
    applyParameters(params = {}){
      if (!params || typeof params !== 'object') return;
      if (params.mode) this.setMode(params.mode);
      if (Object.prototype.hasOwnProperty.call(params, 'speed')){ this.setSpeed(params.speed); }
      if (Object.prototype.hasOwnProperty.call(params, 'sharpness')){ this.setSharpness(params.sharpness); }
      if (Object.prototype.hasOwnProperty.call(params, 'amplitude')){ this.setAmplitude(params.amplitude); }
      const targetParams = {};
      ['pointsMax','rewardGamma','playerSpeed','targetMin','targetMax'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(params, key)) targetParams[key] = params[key];
      });
      if (Object.keys(targetParams).length){ this.setTargetParams(targetParams); }
      const audioParams = {};
      if (Object.prototype.hasOwnProperty.call(params, 'audioMode')) audioParams.mode = params.audioMode;
      if (Object.prototype.hasOwnProperty.call(params, 'audioDelayMs')) audioParams.delayMs = params.audioDelayMs;
      if (Object.prototype.hasOwnProperty.call(params, 'audioDurationMs')) audioParams.durationMs = params.audioDurationMs;
      if (Object.keys(audioParams).length){ this.setAudioParams(audioParams); }
    },
    lockUi(flag){ lockUiElements(!!flag); },
    setInputEnabled(flag){ gameInputEnabled = !!flag; },
    resetScoreboard,
    getScores: () => [...scores],
    getSessionId: () => sessionId,
    isSessionReady: () => sessionReady,
    onSessionReady(listener){
      if (typeof listener !== 'function') return () => {};
      sessionListeners.add(listener);
      if (sessionReady && sessionId){
        try { listener(sessionId); }
        catch (err) { console.error('session listener failed', err); }
      }
      return () => { sessionListeners.delete(listener); };
    },
    triggerPress(){ if (gameInputEnabled && typeof invokePress === 'function'){ invokePress(); } },
    getTargetMode: () => targetMode,
    getTrialQueueLength: () => trialQueue.length,
  };

  if (opts.lockControls){ controller.lockUi(true); }

  if (opts.initialMode && opts.initialMode !== mode){
    setMode(opts.initialMode);
  }

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

  // --- Simulation/render state (global to this sketch) ---
  let simTheta = 0;                       // radians
  let renderTheta = 0;                    // radians (what we render this frame)
  let lastSimPerf = performance.now();    // ms timestamp
  let ripple = null;                      // ripple feedback object

  const sketch = (p) => {
    // ---- Responsive sizing ----
    const ASPECT = 3.2;       // width / height (wide slider look). Try 16/9, 21/9, etc.
    const MAX_W  = 1280;      // cap to avoid huge canvases
    const MIN_W  = 560;       // optional floor so it never gets too tiny
    let W = 0, H = 0;

    function getShellWidth() {
      const shell = document.querySelector('.canvas-shell');
      return shell ? shell.clientWidth : window.innerWidth;
    }

    function calcCanvasSize() {
      const avail = getShellWidth();                 // <— use shell width
      const w = Math.max(MIN_W, Math.min(avail, MAX_W));
      const h = Math.round(w / ASPECT);
      return { w, h };
    }

    function applyCanvasSize(p, cnvEl) {
      const { w, h } = calcCanvasSize();
      if (p.width !== w || p.height !== h) p.resizeCanvas(w, h);
      // lock CSS size to the intrinsic size (prevents blurry upscaling)
      if (cnvEl) {
        cnvEl.style.width = w + 'px';
        cnvEl.style.height = h + 'px';
      }
    }

    function observeHolderResize(p, cnvEl) {
  const holder = document.getElementById('sketch-holder');
  if (!holder) return;
  const ro = new ResizeObserver(() => applyCanvasSize(p, cnvEl));
  ro.observe(holder);
}

    p.setup = () => {
      const { w, h } = calcCanvasSize();
      W = w; H = h;
      const cnv = p.createCanvas(W, H);
      cnv.parent('sketch-holder');
      //p.pixelDensity(1);
      p.frameRate(240);

      const el = cnv.elt;
      el.style.width = w + 'px';
      el.style.height = h + 'px';

      observeHolderResize (p,el);

      // safety: if initial layout was late
      setTimeout(() => applyCanvasSize(p, el), 0);
      p.windowResized = () => applyCanvasSize(p, el);

      // --- Input bindings must be INSIDE setup ---
      p.keyPressed = () => {
        const tag = document.activeElement?.tagName;
        if (p.key === ' ' && tag !== 'INPUT' && tag !== 'TEXTAREA'){
          immediatePressed = true; lastEventTime = performance.now(); pendingEventFrame = true;
          ensureAudioContext();
          return false;           // this is legal again because it's inside the function
        }
      };
      p.mousePressed  = () => { immediatePressed = true; lastEventTime = performance.now(); pendingEventFrame = true; ensureAudioContext(); };
      p.touchStarted  = () => { immediatePressed = true; lastEventTime = performance.now(); pendingEventFrame = true; ensureAudioContext(); };
      p.keyReleased   = () => { if (p.key === ' '){ immediatePressed = false; } };
      p.mouseReleased = () => { immediatePressed = false; };
      p.touchEnded    = () => { immediatePressed = false; };


      // ===== scoring callback now schedules score at (keypress + delay) =====
      invokePress = function(){
        const modeSel = audioControls.mode?.value || 'off';
        const delayMs = Number(audioControls.delay?.value ?? 0);
        const durMs   = Number(audioControls.dur?.value ?? 0);

        const tPress = performance.now();
        const tEval  = tPress + delayMs; // score time is ALWAYS keypress + delay
        if (mode === 'target'){
          targetMode.ensureTrial();
          const frozen = targetMode.freezePlayer({ revealDelayMs: delayMs });
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
            targetMode.completeReward();
            return;
          }
          const thetaEval = thetaAtTime(tEval);
          const sharp = +ui.sharp.value;

          let closeness;
          const trialTarget = targetMode.getTargetValue();
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

    // --- Pause/Resume rendering based on overlay visibility ---
    function pauseSketch() {
      if (!p.isLooping()) return;
      p.noLoop();               // stops draw() updates
    }

    function resumeSketch() {
      if (p.isLooping()) return;
      p.loop();                 // resumes draw() updates
    }

        // Watch the experiment overlay element
    const overlay = document.getElementById('experimentOverlay');
    if (overlay) {
      const observer = new MutationObserver(() => {
        const hidden = overlay.classList.contains('hidden');
        if (hidden) resumeSketch();
        else pauseSketch();
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }


    function drawBallScene(){
      const cx = W*0.25;
      const cy = H*0.5;
      const A = +ui.amp.value;

      // Track path
      p.push(); p.noFill(); p.stroke(40, 66, 150); p.strokeWeight(2);
      p.line(cx, cy - A, cx, cy + A); p.pop();

      // Peak ring
      p.push();
      const atPeak = (1 + Math.cos(renderTheta))/2;
      const glow = p.map(Math.pow(atPeak, 6), 0, 1, 10, 110);
      p.noFill(); p.stroke(122, 162, 255, glow); p.strokeWeight(3);
      p.circle(cx, cy - A, 36);
      p.pop();

      // Ball
      const y = cy - A * Math.cos(renderTheta);
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

      const t = (1 - Math.cos(renderTheta))/2; // 0..1, peak at 1
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

    function targetTrackGeometry(){
      const Wc = p.width;
      const Hc = p.height;
      const trackWidth = Math.round(Wc * 0.56);
      const trackHeight = Math.round(Math.min(40, Math.max(32, Hc * 0.1)));
      const bx = Math.round((Wc - trackWidth) / 2);
      const by = Math.round((Hc - trackHeight) / 2);
      const maxPad = Math.floor(trackWidth / 2 - 12);
      const padBase = Math.round(trackWidth * 0.08);
      const pad = Math.max(24, Math.min(32, maxPad, padBase));
      const innerLeft = bx + pad;
      const innerRight = bx + trackWidth - pad;
      const cy = by + trackHeight / 2;
      return { bx, by, bw: trackWidth, bh: trackHeight, pad, innerLeft, innerRight, cy };
    }

    function drawTargetScene(){
      const geom = targetTrackGeometry();
      targetMode.ensureTrial();
      targetMode.draw(p, geom);
    }

    p.draw = () => {
      const nowPerf = performance.now();

      // Simulation from a reference: update render theta AND refresh phase origin
      const dtSim = (nowPerf - lastSimPerf) / 1000;
      lastSimPerf = nowPerf;
      const w = omegaNow();
      simTheta = (simTheta + w * dtSim) % (2*Math.PI);

      // Refresh the phase origin so thetaAtTime() can compute future phase
      phaseAtOrigin = simTheta;
      phaseOriginPerf = nowPerf;

      renderTheta = simTheta;

      if (mode === 'target'){
        targetMode.tick(nowPerf);
      }

      // Render gate (FPS cap)
      const shouldRender = (nowPerf - lastRenderAt) >= targetFrameMs;
      if (!shouldRender){ return; }
      lastRenderAt = nowPerf;

      if (pendingEventFrame){ lastFrameAfterEventTime = nowPerf; ev2frEl.textContent = Math.round(lastFrameAfterEventTime - lastEventTime) + ' ms'; pendingEventFrame = false; }
      if (pendingPollFrame){ lastFrameAfterPollTime = nowPerf; po2frEl.textContent = Math.round(lastFrameAfterPollTime - lastPollTime) + ' ms'; pendingPollFrame = false; }

      p.background(7, 11, 22);
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
            cy = H*0.5 - A*Math.cos(ripple.theta ?? renderTheta);
          } else {
            const geom = targetTrackGeometry();
            cx = (geom.innerLeft + geom.innerRight) / 2;
            cy = geom.cy;
            if (ripple.mode === 'target' && typeof ripple.playerValue === 'number'){
              cx = p.lerp(geom.innerLeft, geom.innerRight, ripple.playerValue);
            } else if (ripple.mode === 'target' && typeof ripple.target === 'number'){
              cx = p.lerp(geom.innerLeft, geom.innerRight, ripple.target);
            }
          }
          p.circle(cx, cy, r*2);
        }
      }
    };
  };

  // Create p5 instance
  const p5Instance = new p5(sketch);
  controller.getP5 = () => p5Instance;
  return controller;
}

window.initPeakTimingGame = initPeakTimingGame;
