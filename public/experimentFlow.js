(function(){
  const defaultConfig = {
    experimentId: 'target-slider-study',
    configVersion: '1.0.0',
    instructions: [
      {
        id: 'welcome',
        title: 'Welcome to the timing study',
        body: [
          'In this task you will press the space bar to match the position of a moving slider.',
          'The first block is for practice so you can get comfortable with the controls.'
        ],
        advanceLabel: 'Begin practice (press space)',
        collectParticipantId: true,
      },
      {
        id: 'before-real',
        title: 'Ready for the main block?',
        body: [
          'The next block is the real experiment. Do your best to match the highlighted target.',
          'Each successful match adds to your block total.'
        ],
        advanceLabel: 'Start recorded trials (press space)',
        showBefore: 'experiment'
      }
    ],
    blocks: [
      {
        id: 'practice',
        label: 'Practice block',
        trials: 6,
        upload: false,
        parameters: {
          mode: 'target',
          speed: 1.4,
          sharpness: 2.0,
          pointsMax: 100,
          rewardGamma: 2.0,
          playerSpeed: 1.0,
          targetMin: 0.6,
          targetMax: 0.9,
        }
      },
      {
        id: 'experiment',
        label: 'Main experiment',
        trials: 24,
        upload: true,
        parameters: {
          mode: 'target',
          speed: 1.4,
          sharpness: 2.0,
          pointsMax: 100,
          rewardGamma: 2.0,
          playerSpeed: 1.0,
          targetMin: 0.6,
          targetMax: 0.9,
        }
      }
    ],
    end: {
      title: 'All done!',
      body: [
        'Thank you for completing the study.',
        'Your responses have been recorded. You may now let the researcher know that you have finished.'
      ]
    }
  };

  const dom = {};
  const state = {
    controller: null,
    config: defaultConfig,
    overlayVisible: false,
    pendingInstructions: [],
    instructionCallback: null,
    currentInstruction: null,
    currentInstructionMeta: null,
    blockIndex: -1,
    currentBlock: null,
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
  };

  function $(id){ return document.getElementById(id); }

  function textContent(el, value){ if (el) el.textContent = value; }

  function renderBody(container, instruction){
    if (!container) return;
    if (instruction.html){
      container.innerHTML = instruction.html;
      return;
    }
    const fragments = Array.isArray(instruction.body) ? instruction.body : (instruction.body ? [instruction.body] : []);
    container.innerHTML = fragments.map((p) => `<p>${p}</p>`).join('');
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
  }

  function setResultStatus(status, message){
    if (dom.resultStatus){
      dom.resultStatus.dataset.state = status;
      dom.resultStatus.textContent = message;
    }
    if (dom.retrySubmit){
      dom.retrySubmit.style.display = (status === 'error') ? 'inline-flex' : 'none';
    }
  }

  function updateHud(){
    const block = state.currentBlock;
    if (!block){
      textContent(dom.hudBlockLabel, 'Waiting to begin…');
      textContent(dom.hudTrialDone, '0');
      textContent(dom.hudTrialTotal, '0');
      textContent(dom.hudBlockScore, '0');
    } else {
      textContent(dom.hudBlockLabel, block.config.label);
      textContent(dom.hudTrialDone, String(block.trialsCompleted));
      textContent(dom.hudTrialTotal, String(block.config.trials));
      textContent(dom.hudBlockScore, block.totalScore.toFixed(1));
    }
    textContent(dom.hudOverallScore, state.run.overallScore.toFixed(1));
    if (dom.hudTrialCount){
      dom.hudTrialCount.dataset.state = block ? 'pending' : 'idle';
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
    textContent(dom.overlayTitle, instruction.title || 'Instruction');
    renderBody(dom.overlayBody, instruction);
    const label = instruction.advanceLabel || 'Press space to continue';
    textContent(dom.overlayAdvance, label);
    if (dom.overlayAdvance){
      dom.overlayAdvance.disabled = false;
      dom.overlayAdvance.classList.remove('disabled');
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
    }
    showOverlay();
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
        return;
      }
      state.run.participantId = value;
      if (meta){ meta.data.participantId = value; }
    }
    if (meta){
      meta.completedAt = new Date().toISOString();
      recordInstructionEvent(meta);
    }
    state.currentInstruction = null;
    state.currentInstructionMeta = null;
    dom.participantForm?.setAttribute('data-error', 'false');
    if (state.pendingInstructions.length){
      const next = state.pendingInstructions.shift();
      presentInstruction(next);
      return;
    }
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
    const blockRecord = {
      id: blockConfig.id,
      label: blockConfig.label,
      trialsTarget: blockConfig.trials,
      upload: blockConfig.upload !== false,
      parameters: blockConfig.parameters || {},
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
    };
    state.run.blocks.push(blockRecord);
    if (!state.run.startedAt){ state.run.startedAt = now; }
    const params = { mode: 'target', ...(blockConfig.parameters || {}) };
    controller.applyParameters(params);
    controller.lockUi(true);
    controller.setInputEnabled(true);
    controller.resetScoreboard();
    controller.getTargetMode()?.enterMode();
    updateHud();
  }

  function completeBlock(){
    const block = state.currentBlock;
    if (!block) return;
    block.record.completedAt = new Date().toISOString();
    block.record.totalScore = block.totalScore;
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
      dom.hudTrialCount.dataset.state = (block.trialsCompleted >= block.config.trials) ? 'ok' : 'pending';
    }
    if (block.trialsCompleted >= block.config.trials){
      completeBlock();
    }
    return { upload: false, trial: context.trial };
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
    } catch (err) {
      console.error('Failed to submit experiment results', err);
      setResultStatus('error', 'Save failed – retry?');
      if (dom.overlayAdvance){
        dom.overlayAdvance.disabled = false;
        dom.overlayAdvance.classList.remove('disabled');
        dom.overlayAdvance.textContent = 'Close';
      }
    } finally {
      state.resultSubmitting = false;
    }
  }

  function showEndScreen(){
    const config = state.config;
    state.controller?.setInputEnabled(false);
    const end = config.end || {};
    textContent(dom.overlayTitle, end.title || 'Thank you');
    const summaryHtml = `
      <div class="end-summary">
        <dl>
          <dt>Participant ID</dt><dd>${state.run.participantId ? state.run.participantId : '—'}</dd>
          <dt>Overall score</dt><dd>${state.run.overallScore.toFixed(1)}</dd>
          <dt>Blocks completed</dt><dd>${state.run.blocks.length}</dd>
        </dl>
      </div>
    `;
    const bodyParts = Array.isArray(end.body) ? end.body : (end.body ? [end.body] : []);
    dom.overlayBody.innerHTML = bodyParts.map((p) => `<p>${p}</p>`).join('') + summaryHtml;
    textContent(dom.overlayAdvance, 'Close');
    showOverlay();
    dom.overlayAdvance.disabled = true;
    dom.overlayAdvance.classList.add('disabled');
    submitResults();
  }

  function handleKeydown(event){
    if (event.code === 'Space' && state.overlayVisible){
      event.preventDefault();
      finishInstruction();
    }
  }

  function initialise(){
    dom.overlay = $('experimentOverlay');
    dom.overlayTitle = $('overlayTitle');
    dom.overlayBody = $('overlayBody');
    dom.overlayAdvance = $('overlayAdvance');
    dom.participantForm = $('participantForm');
    dom.participantInput = $('participantIdInput');
    dom.resultStatus = $('resultStatus');
    dom.retrySubmit = $('retrySubmit');
    dom.hudBlockLabel = $('hudBlockLabel');
    dom.hudTrialDone = $('hudTrialDone');
    dom.hudTrialTotal = $('hudTrialTotal');
    dom.hudBlockScore = $('hudBlockScore');
    dom.hudOverallScore = $('hudOverallScore');

    state.config = window.EXPERIMENT_CONFIG || defaultConfig;
    state.run.experimentId = state.config.experimentId || defaultConfig.experimentId;
    state.run.configVersion = state.config.configVersion || defaultConfig.configVersion;

    dom.overlayAdvance?.addEventListener('click', finishInstruction);
    document.addEventListener('keydown', handleKeydown);
    dom.retrySubmit?.addEventListener('click', submitResults);
    setResultStatus('idle', 'Results pending');

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
