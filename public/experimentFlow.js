(function(){
  const defaultConfig = {
    experimentId: 'target-slider-study',
    configVersion: '1.0.0',
    instructions: [
      {
        id: 'start-experiment',
        title: 'Ready to begin?',
        body: [
        ],
        advanceLabel: 'Start the experiment',
        advanceMode: 'button',
      },
      {
        id: 'welcome',
        title: 'How perfect is your timing? (5 min)',
        body: [
          'Before you begin the experiment, please ensure the following:',
          '(1) Your sound is turned on and you can hear the music that is playing.',
          '(2) You are in a room with no distractions (no other music, people, etc).',
          'Please enter your Prolific ID.'
        ],
        advanceLabel: 'Proceed',
        advanceMode: 'button',
        collectParticipantId: true,
        playBackgroundMusic: true,
      },
      {
        id: 'before-practice',
        title: 'How perfect is your timing? (5 min)',
        body: [
          'On each screen you will see a horizontal bar with a dot on its left side,',
          'and a yellow ring on its right side.',
          'After a short delay, the dot will quickly move rightward toward the yellow ring.',
          'Your job is to press the spacebar',
          'when the dot is *as close as possible* to the center of the ring.',
          'The closer you get, the more points you will score!'
        ],
        advanceLabel: 'Press the spacebar to begin the practice trials.',
        showBefore: 'practice'
      },
      {
        id: 'before-real',
        title: 'You will now begin the real experiment (2 min)',
        body: [
          'On each screen, press the spacebar when the dot is *as close as possible* to the ring’s center.',
          'The closer you get, the more points will be added to your total score!',
          'In order for the experiment to accurately measure your reflexes,',
          'it is very important that you remain engaged all the way until the end,',
          'and try to respond with perfect timing on every screen.'
        ],
        advanceLabel: 'Press the spacebar to begin',
        showBefore: 'experiment'
      }
    ],
    blocks: [
      {
        id: 'practice',
        label: 'Practice block',
        trials: 5,
        upload: false,
        parameters: {
          mode: 'target',
          speed: 1.4,
          sharpness: 2.0,
          pointsMax: 100,
          rewardGamma: 5.0,
          playerSpeed: 0.8,
          targetMin: 0.6,
          targetMax: 0.9,
          audioMode: 'immediate',
          audioDelayMs: 0,
          audioDurationMs: 120,
        }
      },
      {
        id: 'experiment',
        label: 'Main experiment',
        trials: 10,
        upload: true,
        parameters: {
          mode: 'target',
          speed: 1.4,
          sharpness: 2.0,
          pointsMax: 100,
          rewardGamma: 5.0,
          playerSpeed: 0.8,
          targetMin: 0.6,
          targetMax: 0.9,
          audioMode: 'immediate',
          audioDurationMs: 120,
        },
        segments: [
          {
            trials: 5,
            parameters: {
              audioDelayMs: 0,
            }
          },
          {
            trials: 5,
            parameters: {
              audioDelayMs: 60,
            }
          }
        ]
      }
    ],
    end: {
      title: 'All done!',
      body: [
        'Thank you for completing the study.',
        'Your responses have been recorded. You may now proceed to the survey form.'
      ]
    }
  };

  const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfa3kSWdTK9Z5m3ROktDiLnK9fnArW8lB3AOnyLy8n1KQzwMw/viewform';

  const dom = {};
  const FINAL_TRIAL_BUFFER_MS = 1500;
  const state = {
    controller: null,
    config: defaultConfig,
    overlayVisible: false,
    pendingInstructions: [],
    instructionCallback: null,
    currentInstruction: null,
    currentInstructionMeta: null,
    currentInstructionAdvanceMode: 'space',
    instructionMusic: null,
    playingInstructionMusicFor: null,
    advanceClickHandler: null,
    lastAdvanceTrigger: null,
    awaitingSpaceRelease: false,
    awaitingSpaceReleaseCode: null,
    pendingInputEnable: false,
    blockIndex: -1,
    currentBlock: null,
    fullscreenRequested: false,
    cursorHidden: false,
    run: {
      experimentId: null,
      configVersion: null,
      participantId: null,
      startedAt: null,
      completedAt: null,
      overallScore: 0,
      instructions: [],
      blocks: [],
    },
    resultSubmitting: false,
    resultSubmitted: false,
    blockCompletionTimer: null,
  };

  function $(id){ return document.getElementById(id); }

  function textContent(el, value){ if (el) el.textContent = value; }

  function setCursorHidden(hidden){
    state.cursorHidden = hidden;
    if (!document.body) return;
    if (hidden){
      document.body.classList.add('cursor-hidden');
    } else {
      document.body.classList.remove('cursor-hidden');
    }
  }

  function initialiseInstructionMusic(){
    if (state.instructionMusic) return;
    const audio = new Audio('audio/emotional-soft-piano-inspiring-427637.mp3');
    audio.loop = true;
    audio.preload = 'auto';
    state.instructionMusic = audio;
  }

  function stopInstructionMusic(){
    const audio = state.instructionMusic;
    if (!audio) return;
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch (err) {
      // Ignore failures when resetting playback position
    }
    state.playingInstructionMusicFor = null;
  }

  function playInstructionMusic(){
    const audio = state.instructionMusic;
    if (!audio) return;
    try {
      audio.currentTime = 0;
    } catch (err) {
      // Ignore failures when resetting playback position
    }
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function'){
      playPromise.catch(() => {});
    }
    state.playingInstructionMusicFor = state.currentInstruction?.id ?? null;
  }

  function requestExperimentFullscreen(){
    if (state.fullscreenRequested) return;
    const element = document.documentElement;
    if (!element) return;
    const request = element.requestFullscreen
      || element.webkitRequestFullscreen
      || element.msRequestFullscreen;
    state.fullscreenRequested = true;
    if (typeof request === 'function'){
      try {
        const result = request.call(element);
        if (result && typeof result.catch === 'function'){
          result.catch(() => {});
        }
      } catch (err) {
        // Ignore fullscreen request failures
      }
    }
  }

  function exitExperimentFullscreen(){
    state.fullscreenRequested = false;
    const exit = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.msExitFullscreen;
    if (typeof exit === 'function'){
      try {
        const result = exit.call(document);
        if (result && typeof result.catch === 'function'){
          result.catch(() => {});
        }
      } catch (err) {
        // Ignore fullscreen exit failures
      }
    }
  }

  function renderBody(container, instruction){
    if (!container) return;
    if (instruction.html){
      container.innerHTML = instruction.html;
      return;
    }
    const fragments = Array.isArray(instruction.body) ? instruction.body : (instruction.body ? [instruction.body] : []);
    container.innerHTML = fragments.map((p) => `<p>${p}</p>`).join('');
  }

  function detachAdvanceClick(){
    if (!dom.overlayAdvance) return;
    if (state.advanceClickHandler){
      dom.overlayAdvance.removeEventListener('click', state.advanceClickHandler);
      state.advanceClickHandler = null;
    }
  }

  function configureAdvanceControl(mode, label){
    const advance = dom.overlayAdvance;
    if (!advance) return;
    detachAdvanceClick();
    const resolvedMode = mode === 'button' ? 'button' : 'space';
    state.currentInstructionAdvanceMode = resolvedMode;
    advance.disabled = false;
    advance.classList.remove('disabled');
    advance.removeAttribute('hidden');
    advance.textContent = label;
    advance.dataset.mode = resolvedMode;
    if (resolvedMode === 'button'){
      advance.classList.remove('space-advance');
      advance.removeAttribute('tabindex');
      advance.removeAttribute('aria-disabled');
      const handler = () => {
        state.lastAdvanceTrigger = 'button';
        finishInstruction();
      };
      advance.addEventListener('click', handler);
      state.advanceClickHandler = handler;
    } else {
      advance.classList.add('space-advance');
      advance.setAttribute('tabindex', '-1');
      advance.setAttribute('aria-disabled', 'true');
    }
  }

  function showOverlay(){
    const overlay = dom.overlay;
    if (!overlay) return;
    overlay.classList.remove('hidden');
    state.overlayVisible = true;
    state.controller?.setInputEnabled(false);
    dom.participantForm?.setAttribute('data-error', 'false');
  }

  function hideOverlay(){
    const overlay = dom.overlay;
    if (!overlay) return;
    overlay.classList.add('hidden');
    state.overlayVisible = false;
    state.currentInstructionAdvanceMode = 'space';
  }

  function setResultStatus(status, message){
    if (dom.resultStatus){
      dom.resultStatus.dataset.state = status;
      dom.resultStatus.textContent = message;
    }
  }

  function updateHud(){
    const block = state.currentBlock;
    if (!block){
      dom.headerProgress?.classList.add('is-idle');
      textContent(dom.hudBlockLabel, 'Waiting to begin…');
      textContent(dom.hudTrialDone, '0');
      textContent(dom.hudTrialTotal, '0');
    } else {
      dom.headerProgress?.classList.remove('is-idle');
      const configuredTotal = (typeof block.totalTrials === 'number' && block.totalTrials > 0)
        ? block.totalTrials
        : (Number.isFinite(Number(block.config?.trials)) ? Number(block.config.trials) : 0);
      textContent(dom.hudBlockLabel, block.config.label);
      textContent(dom.hudTrialDone, String(block.trialsCompleted));
      textContent(dom.hudTrialTotal, String(configuredTotal));
    }
    const roundedOverall = Math.round(state.run.overallScore);
    textContent(dom.hudOverallScore, roundedOverall.toString());
    state.controller?.setTargetTotalScore?.(state.run.overallScore);
    if (dom.hudTrialCount){
      if (!block){
        dom.hudTrialCount.dataset.state = 'idle';
        dom.hudTrialCount.setAttribute('aria-label', 'Trial progress');
      } else {
        const totalTrials = (typeof block.totalTrials === 'number' && block.totalTrials > 0)
          ? block.totalTrials
          : (Number.isFinite(Number(block.config?.trials)) ? Number(block.config.trials) : 0);
        dom.hudTrialCount.dataset.state = (totalTrials > 0 && block.trialsCompleted >= totalTrials) ? 'ok' : 'pending';
        if (totalTrials > 0){
          dom.hudTrialCount.setAttribute('aria-label', `Trial ${block.trialsCompleted} of ${totalTrials}`);
        } else {
          dom.hudTrialCount.setAttribute('aria-label', 'Trial progress');
        }
      }
    }
  }

  function recordInstructionEvent(meta){
    if (!meta) return;
    state.run.instructions.push(meta);
  }

  function queueInstructions(list, callback){
    state.pendingInstructions = Array.isArray(list) ? [...list] : [];
    state.instructionCallback = typeof callback === 'function' ? callback : null;
    if (state.pendingInstructions.length){
      const next = state.pendingInstructions.shift();
      presentInstruction(next);
    } else if (state.instructionCallback){
      const cb = state.instructionCallback;
      state.instructionCallback = null;
      cb();
    }
  }

  function presentInstruction(instruction){
    if (!instruction) return;
    state.currentInstruction = instruction;
    state.currentInstructionMeta = {
      id: instruction.id ?? null,
      displayedAt: new Date().toISOString(),
      completedAt: null,
      collectParticipantId: !!instruction.collectParticipantId,
      data: {}
    };
    state.lastAdvanceTrigger = null;
    state.awaitingSpaceRelease = false;
    state.awaitingSpaceReleaseCode = null;
    state.pendingInputEnable = false;
    textContent(dom.overlayTitle, instruction.title || 'Instruction');
    renderBody(dom.overlayBody, instruction);
    const label = instruction.advanceLabel || 'Press space to continue';
    configureAdvanceControl(instruction.advanceMode || 'space', label);
    if (dom.overlaySurvey){
      dom.overlaySurvey.setAttribute('hidden', '');
      dom.overlaySurvey.setAttribute('disabled', '');
    }
    if (instruction.collectParticipantId){
      dom.participantForm?.removeAttribute('hidden');
      dom.participantForm?.setAttribute('data-error', 'false');
      if (dom.participantForm) dom.participantForm.style.display = 'flex';
      if (dom.participantInput){
        dom.participantInput.value = state.run.participantId ?? '';
        dom.participantInput.focus();
      }
    } else if (dom.participantForm){
      dom.participantForm.style.display = 'none';
      dom.participantForm.setAttribute('hidden', '');
    }
    showOverlay();
    if (instruction.playBackgroundMusic){
      playInstructionMusic();
    } else if (state.playingInstructionMusicFor){
      stopInstructionMusic();
    }
  }

  function finishInstruction(){
    const current = state.currentInstruction;
    if (!current){
      if (state.overlayVisible && !state.pendingInstructions.length && !state.instructionCallback){
        hideOverlay();
      }
      return;
    }
    const meta = state.currentInstructionMeta;
    if (current.collectParticipantId && dom.participantInput){
      const value = dom.participantInput.value.trim();
      if (!value){
        dom.participantForm?.setAttribute('data-error', 'true');
        dom.participantInput.focus();
        state.lastAdvanceTrigger = null;
        return;
      }
      state.run.participantId = value;
      if (meta){ meta.data.participantId = value; }
    }
    if (current.playBackgroundMusic){
      stopInstructionMusic();
    }
    if (meta){
      meta.completedAt = new Date().toISOString();
      recordInstructionEvent(meta);
    }
    if (current.collectParticipantId && !state.fullscreenRequested){
      requestExperimentFullscreen();
      if (!state.cursorHidden){
        setCursorHidden(true);
      }
    }
    state.currentInstruction = null;
    state.currentInstructionMeta = null;
    dom.participantForm?.setAttribute('data-error', 'false');
    if (state.pendingInstructions.length){
      const next = state.pendingInstructions.shift();
      presentInstruction(next);
      return;
    }
    if (state.lastAdvanceTrigger === 'space'){
      state.awaitingSpaceRelease = true;
      state.awaitingSpaceReleaseCode = 'Space';
    } else {
      state.awaitingSpaceRelease = false;
      state.awaitingSpaceReleaseCode = null;
    }
    state.lastAdvanceTrigger = null;
    detachAdvanceClick();
    hideOverlay();
    const cb = state.instructionCallback;
    state.instructionCallback = null;
    if (cb){ cb(); }
  }

  function instructionsForBlock(config, blockId){
    if (!Array.isArray(config.instructions)) return [];
    return config.instructions.filter((inst) => inst.showBefore === blockId);
  }

  function leadInstructions(config){
    if (!Array.isArray(config.instructions)) return [];
    return config.instructions.filter((inst) => !inst.showBefore);
  }

  function normaliseBlockSegments(blockConfig){
    const baseParameters = { ...(blockConfig?.parameters || {}) };
    if (!baseParameters.mode){
      baseParameters.mode = 'target';
    }
    const rawSegments = Array.isArray(blockConfig?.segments) ? blockConfig.segments : [];
    const segments = rawSegments.map((segment) => {
      const trials = Number(segment?.trials) || 0;
      if (trials <= 0){
        return null;
      }
      const overrides = (segment && typeof segment.parameters === 'object' && segment.parameters) ? segment.parameters : {};
      return {
        trials,
        parameters: { ...baseParameters, ...overrides },
      };
    }).filter(Boolean);
    if (!segments.length){
      const fallbackTrials = Number(blockConfig?.trials) > 0 ? Number(blockConfig.trials) : 0;
      if (fallbackTrials > 0){
        segments.push({ trials: fallbackTrials, parameters: { ...baseParameters } });
      }
    }
    const totalTrials = segments.reduce((sum, seg) => sum + (Number(seg?.trials) || 0), 0);
    return {
      baseParameters,
      segments,
      totalTrials,
    };
  }

  function enterBlockSegment(blockState, index){
    if (!blockState) return;
    if (Array.isArray(blockState.segments) && blockState.segments.length){
      const segment = blockState.segments[index];
      if (!segment) return;
      blockState.segmentIndex = index;
      blockState.segmentTrialsCompleted = 0;
      state.controller?.applyParameters(segment.parameters);
      return;
    }
    if (blockState.baseParameters){
      state.controller?.applyParameters(blockState.baseParameters);
    }
  }

  function startNextBlock(){
    const blocks = Array.isArray(state.config.blocks) ? state.config.blocks : [];
    state.blockIndex += 1;
    if (state.blockIndex >= blocks.length){
      state.run.completedAt = new Date().toISOString();
      showEndScreen();
      return;
    }
    const blockConfig = blocks[state.blockIndex];
    const preBlock = instructionsForBlock(state.config, blockConfig.id);
    if (preBlock.length){
      queueInstructions(preBlock, () => startBlock(blockConfig));
    } else {
      startBlock(blockConfig);
    }
  }

  function startBlock(blockConfig){
    const controller = state.controller;
    if (!controller) return;
    const now = new Date().toISOString();
    const segmentInfo = normaliseBlockSegments(blockConfig);
    const totalTrials = segmentInfo.totalTrials || (Number(blockConfig?.trials) > 0 ? Number(blockConfig.trials) : 0);
    const blockRecord = {
      id: blockConfig.id,
      label: blockConfig.label,
      trialsTarget: totalTrials,
      upload: blockConfig.upload !== false,
      parameters: { ...(segmentInfo.baseParameters || {}) },
      segments: segmentInfo.segments.map((segment) => ({
        trials: segment.trials,
        parameters: { ...segment.parameters },
      })),
      trials: [],
      startedAt: now,
      completedAt: null,
      totalScore: 0,
    };
    state.currentBlock = {
      config: blockConfig,
      record: blockRecord,
      trialsCompleted: 0,
      totalScore: 0,
      totalTrials,
      segments: segmentInfo.segments,
      baseParameters: { ...(segmentInfo.baseParameters || {}) },
      segmentIndex: 0,
      segmentTrialsCompleted: 0,
    };
    state.run.blocks.push(blockRecord);
    if (!state.run.startedAt){ state.run.startedAt = now; }
    controller.lockUi(true);
    const enableInputNow = !state.awaitingSpaceRelease;
    controller.setInputEnabled(enableInputNow);
    state.pendingInputEnable = !enableInputNow;
    if (enableInputNow){
      state.awaitingSpaceRelease = false;
      state.awaitingSpaceReleaseCode = null;
    }
    controller.resetScoreboard();
    enterBlockSegment(state.currentBlock, 0);
    controller.getTargetMode()?.enterMode();
    updateHud();
  }

  function completeBlock(){
    if (state.blockCompletionTimer){
      clearTimeout(state.blockCompletionTimer);
      state.blockCompletionTimer = null;
    }
    const block = state.currentBlock;
    if (!block) return;
    block.record.completedAt = new Date().toISOString();
    block.record.totalScore = block.totalScore;
    if (!block.record.upload){
      state.run.overallScore = 0;
      state.controller?.resetScoreboard();
    }
    state.currentBlock = null;
    state.controller?.setInputEnabled(false);
    updateHud();
    startNextBlock();
  }

  function handleTrialComplete(context){
    const block = state.currentBlock;
    if (!block){
      return { upload: false, trial: context.trial };
    }
    const score = Number(context.trial?.score) || 0;
    block.trialsCompleted += 1;
    block.totalScore += score;
    block.record.totalScore = block.totalScore;
    const totalTrials = (typeof block.totalTrials === 'number' && block.totalTrials > 0)
      ? block.totalTrials
      : (Number.isFinite(Number(block.config?.trials)) ? Number(block.config.trials) : 0);
    if (Array.isArray(block.segments) && block.segments.length){
      block.segmentTrialsCompleted = (block.segmentTrialsCompleted || 0) + 1;
      const currentSegment = block.segments[block.segmentIndex] || null;
      if (currentSegment && block.trialsCompleted < totalTrials && block.segmentTrialsCompleted >= currentSegment.trials){
        const nextIndex = block.segmentIndex + 1;
        if (nextIndex < block.segments.length){
          enterBlockSegment(block, nextIndex);
        }
      }
    }
    const trialCopy = {
      index: context.trial?.index ?? block.trialsCompleted,
      blockTrialIndex: block.trialsCompleted,
      score,
      judgement: context.trial?.judgement ?? context.result?.judgement ?? null,
      mode: context.trial?.mode ?? context.mode,
      timings: context.trial?.timings ?? context.timings ?? null,
      settings: context.trial?.settings ?? context.settings ?? null,
      reward: context.trial?.reward ?? context.result?.reward ?? null,
      analytics: context.trial?.analytics ?? context.result?.analytics ?? null,
      completedAt: new Date().toISOString(),
    };
    block.record.trials.push(trialCopy);
    state.run.overallScore += score;
    updateHud();
    if (dom.hudTrialCount){
      dom.hudTrialCount.dataset.state = (totalTrials > 0 && block.trialsCompleted >= totalTrials) ? 'ok' : 'pending';
    }
    if (totalTrials > 0 && block.trialsCompleted >= totalTrials){
      if (state.blockCompletionTimer){
        clearTimeout(state.blockCompletionTimer);
      }
      state.blockCompletionTimer = setTimeout(() => {
        state.blockCompletionTimer = null;
        completeBlock();
      }, FINAL_TRIAL_BUFFER_MS);
    }
    const trialForUpload = {
      ...(context.trial || {}),
      experimentId: state.run.experimentId ?? null,
      participantId: state.run.participantId ?? null,
      blockId: block.config?.id ?? null,
    };
    return { upload: block.record.upload, trial: trialForUpload };
  }

  async function waitForSession(){
    const controller = state.controller;
    if (!controller) return null;
    if (controller.getSessionId()){ return controller.getSessionId(); }
    return new Promise((resolve) => {
      const unsubscribe = controller.onSessionReady((id) => {
        unsubscribe();
        resolve(id);
      });
    });
  }

  async function submitResults(){
    if (state.resultSubmitting || state.resultSubmitted) return;
    state.resultSubmitting = true;
    setResultStatus('pending', 'Saving results…');
    const sessionId = await waitForSession();
    if (!sessionId){
      throw new Error('Session not available');
    }
    const payload = {
      experimentId: state.run.experimentId,
      configVersion: state.run.configVersion,
      participantId: state.run.participantId,
      startedAt: state.run.startedAt,
      completedAt: state.run.completedAt,
      overallScore: state.run.overallScore,
      instructions: state.run.instructions,
      blocks: state.run.blocks,
      userAgent: navigator.userAgent,
    };
    try {
      const res = await fetch('/api/experiment-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, result: payload }),
      });
      if (!res.ok){
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      state.resultSubmitted = true;
      setResultStatus('ok', data?.confirmationCode ? `Saved (code ${data.confirmationCode})` : 'Results saved');
      if (dom.overlayAdvance){
        dom.overlayAdvance.disabled = false;
        dom.overlayAdvance.classList.remove('disabled');
        dom.overlayAdvance.textContent = 'Close';
      }
      if (dom.overlaySurvey){
        dom.overlaySurvey.removeAttribute('disabled');
      }
    } catch (err) {
      console.error('Failed to submit experiment results', err);
      setResultStatus('error', 'Save failed – retry?');
      if (dom.overlayAdvance){
        dom.overlayAdvance.disabled = false;
        dom.overlayAdvance.classList.remove('disabled');
        dom.overlayAdvance.textContent = 'Close';
      }
      if (dom.overlaySurvey){
        dom.overlaySurvey.removeAttribute('disabled');
      }
    } finally {
      state.resultSubmitting = false;
    }
  }

  function showEndScreen(){
    const config = state.config;
    state.controller?.setInputEnabled(false);
    detachAdvanceClick();
    state.awaitingSpaceRelease = false;
    state.awaitingSpaceReleaseCode = null;
    state.pendingInputEnable = false;
    const end = config.end || {};
    textContent(dom.overlayTitle, end.title || 'Thank you');
    if (dom.participantForm){
      dom.participantForm.style.display = 'none';
      dom.participantForm.setAttribute('hidden', '');
      dom.participantForm.setAttribute('data-error', 'false');
    }
    const summaryHtml = `
      <div class="end-summary">
        <dl>
          <dt>Prolific ID</dt><dd>${state.run.participantId ? state.run.participantId : '—'}</dd>
          <dt>Overall score</dt><dd>${state.run.overallScore.toFixed(1)}</dd>
        </dl>
      </div>
    `;
    const bodyParts = Array.isArray(end.body) ? end.body : (end.body ? [end.body] : []);
    dom.overlayBody.innerHTML = bodyParts.map((p) => `<p>${p}</p>`).join('') + summaryHtml;
    if (dom.overlayAdvance){
      textContent(dom.overlayAdvance, 'Close');
      dom.overlayAdvance.setAttribute('hidden', '');
      dom.overlayAdvance.disabled = true;
      dom.overlayAdvance.classList.add('disabled');
    }
    if (dom.overlaySurvey){
      if (SURVEY_URL){
        dom.overlaySurvey.textContent = 'Open survey';
        dom.overlaySurvey.setAttribute('disabled', 'true');
        dom.overlaySurvey.removeAttribute('hidden');
      } else {
        dom.overlaySurvey.setAttribute('hidden', '');
      }
    }
    setCursorHidden(false);
    showOverlay();
    submitResults();
  }

  function openSurvey(){
    if (!SURVEY_URL) return;
    setCursorHidden(false);
    exitExperimentFullscreen();
    window.location.assign(SURVEY_URL);  // open in same tab only
  }

  function handleKeydown(event){
    if (event.code === 'Space' && state.overlayVisible){
      if (state.currentInstructionAdvanceMode !== 'space'){
        return;
      }
      if (!dom.overlayAdvance || dom.overlayAdvance.hasAttribute('hidden') || dom.overlayAdvance.disabled){
        return;
      }
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === 'function'){ event.stopImmediatePropagation(); }
      else if (typeof event.stopPropagation === 'function'){ event.stopPropagation(); }
      state.lastAdvanceTrigger = 'space';
      finishInstruction();
    }
  }

  function handleKeyup(event){
    if (!state.awaitingSpaceRelease){
      return;
    }
    if (event.code !== state.awaitingSpaceReleaseCode){
      return;
    }
    state.awaitingSpaceRelease = false;
    state.awaitingSpaceReleaseCode = null;
    if (state.pendingInputEnable && state.controller){
      state.controller.setInputEnabled(true);
    }
    state.pendingInputEnable = false;
  }

  function initialise(){
    dom.overlay = $('experimentOverlay');
    dom.overlayTitle = $('overlayTitle');
    dom.overlayBody = $('overlayBody');
    dom.overlayAdvance = $('overlayAdvance');
    dom.overlaySurvey = $('overlaySurvey');
    dom.participantForm = $('participantForm');
    dom.participantInput = $('participantIdInput');
    dom.headerProgress = document.querySelector('.header-progress');
    dom.hudBlockLabel = $('hudBlockLabel');
    dom.hudTrialCount = $('hudTrialCount');
    dom.hudTrialDone = $('hudTrialDone');
    dom.hudTrialTotal = $('hudTrialTotal');
    dom.hudOverallScore = $('hudOverallScore');

    state.config = window.EXPERIMENT_CONFIG || defaultConfig;
    state.run.experimentId = state.config.experimentId || defaultConfig.experimentId;
    state.run.configVersion = state.config.configVersion || defaultConfig.configVersion;

    dom.overlaySurvey?.addEventListener('click', openSurvey);
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('keyup', handleKeyup, true);
    setResultStatus('idle', 'Results pending');

    setCursorHidden(false);
    initialiseInstructionMusic();

    const controller = window.initPeakTimingGame({
      initialMode: 'target',
      lockControls: true,
      autoUpload: false,
      onTrialComplete: handleTrialComplete,
    });
    state.controller = controller;
    controller.setInputEnabled(false);
    updateHud();

    const initialInstructions = leadInstructions(state.config);
    if (initialInstructions.length){
      queueInstructions(initialInstructions, startNextBlock);
    } else {
      startNextBlock();
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initialise);
  } else {
    initialise();
  }
})();
