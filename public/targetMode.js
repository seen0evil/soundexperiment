(function(global){
  const TARGET_MOVE_DELAY_MS = 500;
  const TARGET_INTER_TRIAL_MS = 700;
  const FEEDBACK_FX_MS = 1100;
  const BLANK_ITI_MS = 1000;
  const PREP_STATIONARY_MS = 300;
  const TIMEOUT_LINGER_MS = 2200;
  const MIN_TARGET_POS = 0.6;
  const MAX_TARGET_POS = 0.9;

  function createTargetMode({ ui, clamp, pushScore, refreshLabels }){
    const state = {
      status: 'idle',
      progress: 0,
      progressStartAt: null,
      progressDurationMs: 1000,
      timeoutAt: null,
      nextTrialAt: null,
      playerCapturedProgress: null,
      playerFrozenProgress: null,
      playerPressSnapshot: null,
      pendingRevealAt: null,
      feedback: null,
      hasOutcome: false,
      analytics: null,
      targetPos: MIN_TARGET_POS,
      range: { min: MIN_TARGET_POS, max: MAX_TARGET_POS },
      sliderVisibleAt: null,
      prepEndAt: null,
      trialStart: null,
      totalScore: 0,
    };

    function logTargetConfig(action, payload){
      try {
        console.log(`[target-config] ${action}`, payload);
      } catch (err) {
        /* noop */
      }
      if (state.analytics){
        state.analytics.configChanges.push({
          action,
          at: performance.now(),
          payload,
        });
      }
    }

    function sanitizeTargetRange(preferChanged){
      if (!ui.targetMin || !ui.targetMax){
        return { ...state.range };
      }
      let minVal = Number(ui.targetMin.value);
      let maxVal = Number(ui.targetMax.value);
      if (!Number.isFinite(minVal)) minVal = state.range.min;
      if (!Number.isFinite(maxVal)) maxVal = state.range.max;
      minVal = clamp(minVal, MIN_TARGET_POS, MAX_TARGET_POS);
      maxVal = clamp(maxVal, MIN_TARGET_POS, MAX_TARGET_POS);
      if (preferChanged === 'min'){
        if (minVal > maxVal) maxVal = minVal;
      } else if (preferChanged === 'max'){
        if (maxVal < minVal) minVal = maxVal;
      } else if (minVal > maxVal){
        const mid = (minVal + maxVal) / 2;
        minVal = mid;
        maxVal = mid;
      }
      ui.targetMin.value = minVal.toFixed(2);
      ui.targetMax.value = maxVal.toFixed(2);
      if (ui.targetMinVal) ui.targetMinVal.textContent = minVal.toFixed(2);
      if (ui.targetMaxVal) ui.targetMaxVal.textContent = maxVal.toFixed(2);
      refreshLabels?.();
      state.range = { min: minVal, max: maxVal };
      state.targetPos = clamp(state.targetPos, state.range.min, state.range.max);
      return { ...state.range };
    }

    function targetConfigSnapshot(){
      const range = sanitizeTargetRange();
      const travelSeconds = Number(ui.playerSpeed?.value);
      return {
        POINTS_MAX_PER_TRIAL: ui.pointsMax ? Number(ui.pointsMax.value) : null,
        REWARD_GAMMA: ui.rewardGamma ? Number(ui.rewardGamma.value) : null,
        PLAYER_TRAVEL_SECONDS: Number.isFinite(travelSeconds) ? travelSeconds : null,
        TARGET_MIN_POS: range.min,
        TARGET_MAX_POS: range.max,
      };
    }

    function reset(){
      state.status = 'idle';
      state.progress = 0;
      state.progressStartAt = null;
      state.progressDurationMs = 1000;
      state.timeoutAt = null;
      state.nextTrialAt = null;
      state.playerCapturedProgress = null;
      state.playerFrozenProgress = null;
      state.playerPressSnapshot = null;
      state.pendingRevealAt = null;
      state.feedback = null;
      state.hasOutcome = false;
      state.analytics = null;
      state.sliderVisibleAt = null;
      state.prepEndAt = null;
      state.trialStart = null;
      state.totalScore = 0;
    }

    function randomizeTarget(){
      const span = Math.max(0, state.range.max - state.range.min);
      const offset = span > 0 ? Math.random() * span : 0;
      state.targetPos = state.range.min + offset;
    }

    function startTrial(){
      const now = performance.now();
      sanitizeTargetRange();
      randomizeTarget();
      const travelSecondsRaw = Number(ui.playerSpeed?.value);
      const travelSeconds = (Number.isFinite(travelSecondsRaw) && travelSecondsRaw > 0)
        ? travelSecondsRaw
        : 1;
      const durationMs = travelSeconds * 1000;
      state.status = 'iti';
      state.trialStart = now;
      state.progress = 0;
      state.sliderVisibleAt = now + BLANK_ITI_MS;
      state.prepEndAt = state.sliderVisibleAt + TARGET_MOVE_DELAY_MS + PREP_STATIONARY_MS;
      state.progressStartAt = state.prepEndAt;
      state.progressDurationMs = durationMs;
      state.timeoutAt = state.progressStartAt + durationMs;
      state.nextTrialAt = null;
      state.playerCapturedProgress = null;
      state.playerFrozenProgress = null;
      state.playerPressSnapshot = null;
      state.pendingRevealAt = null;
      state.feedback = null;
      state.hasOutcome = false;
      state.analytics = {
        trialStart: now,
        configSnapshot: targetConfigSnapshot(),
        configChanges: [],
        target: state.targetPos,
        freezeEvent: null,
        feedback: null,
      };
      logTargetConfig('trial_start', {
        ...targetConfigSnapshot(),
        TARGET_VALUE: state.targetPos,
      });
    }

    function ensureTrial(){
      if (state.status === 'idle'){
        startTrial();
      }
    }

    function progressAt(timeMs){
      if (state.progressStartAt == null){
        return state.progress;
      }
      if (timeMs <= state.progressStartAt){
        return 0;
      }
      const elapsed = timeMs - state.progressStartAt;
      const duration = state.progressDurationMs > 0 ? state.progressDurationMs : 1;
      return clamp(elapsed / duration, 0, 1);
    }

    function finalizePendingReveal(now){
      if (state.pendingRevealAt == null) return false;
      if (now < state.pendingRevealAt) return false;
      const captureAt = state.pendingRevealAt;
      const captureValue = progressAt(captureAt);
      state.playerCapturedProgress = captureValue;
      state.playerFrozenProgress = captureValue;
      state.progress = captureValue;
      state.pendingRevealAt = null;
      return true;
    }

    function freezePlayer(options = {}){
      if (state.status !== 'running') return false;
      const now = performance.now();
      const revealDelayMsRaw = options?.revealDelayMs;
      const revealDelayMs = Number.isFinite(revealDelayMsRaw) ? Math.max(0, revealDelayMsRaw) : 0;
      const pressValue = progressAt(now);
      state.status = 'awaiting';
      state.playerPressSnapshot = pressValue;
      state.playerCapturedProgress = null;
      state.playerFrozenProgress = null;
      state.timeoutAt = null;
      state.pendingRevealAt = now + revealDelayMs;
      state.progress = pressValue;
      if (state.analytics){
        state.analytics.freezeEvent = {
          at: now,
          playerValueAtPress: pressValue,
          revealAt: state.pendingRevealAt,
        };
      }
      if (revealDelayMs === 0){
        finalizePendingReveal(now);
      }
      return true;
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

    function setTotalScore(value){
      const numeric = Number(value);
      state.totalScore = Number.isFinite(numeric) ? numeric : 0;
    }

    function completeReward(){
      const now = performance.now();
      finalizePendingReveal(now);
      let playerValue = null;
      if (state.playerCapturedProgress != null){
        playerValue = state.playerCapturedProgress;
      } else if (state.playerFrozenProgress != null){
        playerValue = state.playerFrozenProgress;
      } else {
        playerValue = progressAt(now);
      }
      if (playerValue == null || state.hasOutcome) return;
      const cfg = targetConfigSnapshot();
      const trialTarget = state.targetPos;
      const distance = Math.abs(playerValue - trialTarget);
      const proximity = clamp(1 - distance, 0, 1);
      const gamma = Number.isFinite(cfg.REWARD_GAMMA) ? cfg.REWARD_GAMMA : 1;
      const rawPointsMax = Number.isFinite(cfg.POINTS_MAX_PER_TRIAL) ? cfg.POINTS_MAX_PER_TRIAL : 0;
      const pointsMax = Math.min(100, rawPointsMax);
      const proximityGamma = Math.pow(proximity, gamma);
      const reward = Math.round(proximityGamma * pointsMax);
      const colorRGB = targetColorForProximity(proximity);

      const pressSnapshot = state.playerPressSnapshot;
      state.status = 'feedback';
      state.playerFrozenProgress = playerValue;
      state.playerCapturedProgress = null;
      state.pendingRevealAt = null;
      state.feedback = {
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
      state.nextTrialAt = now + FEEDBACK_FX_MS + TARGET_INTER_TRIAL_MS;
      state.hasOutcome = true;

      if (state.analytics){
        if (state.analytics.freezeEvent){
          state.analytics.freezeEvent.playerValue = playerValue;
          if (typeof state.analytics.freezeEvent.playerValueAtPress === 'undefined' && pressSnapshot != null){
            state.analytics.freezeEvent.playerValueAtPress = pressSnapshot;
          }
        }
        state.analytics.feedback = {
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

      if (ui.lastScore) ui.lastScore.textContent = reward.toFixed(0);
      if (ui.judgement) ui.judgement.textContent = reward > 0 ? 'Reward' : 'Miss';

      const analyticsPayload = state.analytics;
      state.analytics = null;
      pushScore({
        score: reward,
        reward,
        judgement: reward > 0 ? 'Reward' : 'Miss',
        target: trialTarget,
        playerValue,
        analytics: analyticsPayload,
      });
    }

    function handleTimeout(now){
      if (state.status !== 'running' || state.hasOutcome) return;
      const colorRGB = targetColorForProximity(0);
      state.status = 'timeout';
      state.feedback = {
        startedAt: now,
        reward: 0,
        colorRGB,
        distance: null,
        proximity: 0,
        proximityGamma: 0,
        playerValue: null,
        targetValue: state.targetPos,
        cause: 'timeout',
      };
      state.nextTrialAt = now + TIMEOUT_LINGER_MS;
      state.hasOutcome = true;
      state.progress = 0;
      state.timeoutAt = null;
      state.playerCapturedProgress = null;
      state.playerFrozenProgress = null;
      state.pendingRevealAt = null;

      if (state.analytics){
        state.analytics.feedback = {
          at: now,
          distance: null,
          proximity: 0,
          proximityGamma: 0,
          reward: 0,
          colorRGB,
          playerValue: null,
          targetValue: state.targetPos,
          cause: 'timeout',
        };
      }

      if (ui.lastScore) ui.lastScore.textContent = '0';
      if (ui.judgement) ui.judgement.textContent = 'Timeout';

      const analyticsPayload = state.analytics;
      state.analytics = null;
      pushScore({
        score: 0,
        reward: 0,
        judgement: 'Timeout',
        target: state.targetPos,
        playerValue: null,
        analytics: analyticsPayload,
      });
    }

    function tick(now){
      if (state.status === 'iti'){
        if (state.sliderVisibleAt != null && now >= state.sliderVisibleAt){
          state.status = 'prep';
        }
      }
      if (state.status === 'prep'){
        state.progress = 0;
        if (state.prepEndAt != null && now >= state.prepEndAt){
          state.status = 'running';
        }
      }
      if (state.status === 'running' || state.status === 'awaiting'){
        state.progress = progressAt(now);
        if (state.status === 'running' && state.timeoutAt != null && now >= state.timeoutAt){
          handleTimeout(now);
        }
        if (state.status === 'awaiting'){
          finalizePendingReveal(now);
        }
      }
      if ((state.status === 'feedback' || state.status === 'timeout') && state.nextTrialAt != null && now >= state.nextTrialAt){
        startTrial();
      }
    }

    function draw(p, geom){
      const now = performance.now();
      const sliderVisible = state.status === 'prep'
        || state.status === 'running'
        || state.status === 'awaiting'
        || state.status === 'feedback';
      const showingTimeout = state.status === 'timeout';
      const showingIti = state.status === 'iti';

      const range = state.range;
      const progressValue = (state.playerFrozenProgress != null)
        ? state.playerFrozenProgress
        : state.progress;
      const playerNorm = clamp(progressValue, 0, 1);
      const playerX = p.lerp(geom.innerLeft, geom.innerRight, playerNorm);
      const targetX = p.lerp(geom.innerLeft, geom.innerRight, clamp(state.targetPos, range.min, range.max));
      const cy = geom.cy;
      const sliderLeft = geom.innerLeft;
      const sliderRight = geom.innerRight;
      const sliderCenterX = (sliderLeft + sliderRight) / 2;
      const trackWidth = sliderRight - sliderLeft;
      const trackThickness = Math.max(14, Math.min(geom.bh - 10, Math.round(trackWidth * 0.08)));

      if (showingIti){
        p.push();
        p.stroke(180);
        p.strokeWeight(4);
        p.line(sliderCenterX - 24, cy, sliderCenterX + 24, cy);
        p.line(sliderCenterX, cy - 24, sliderCenterX, cy + 24);
        p.pop();

        p.push();
        p.noFill();
        p.stroke(210);
        p.strokeWeight(2);
        p.circle(sliderCenterX, cy, 36);
        p.pop();

        p.push();
        p.noStroke();
        p.fill(235);
        p.circle(sliderCenterX, cy, 6);
        p.pop();
        return;
      }

      if (showingTimeout){
        p.push();
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(32);
        p.fill(255, 186, 186);
        p.noStroke();
        p.text('Timeout! Make sure to press spacebar in time!', p.width / 2, p.height / 2);
        p.pop();
        return;
      }

      if (!sliderVisible){
        return;
      }

      const trackTop = cy - trackThickness / 2;

      p.push();
      p.noStroke();
      p.fill(28);
      p.rect(sliderLeft, trackTop, trackWidth, trackThickness, trackThickness / 2);
      p.pop();

      p.push();
      p.noFill();
      p.stroke(128);
      p.strokeWeight(3);
      p.rect(sliderLeft, trackTop, trackWidth, trackThickness, trackThickness / 2);
      p.pop();

      p.push();
      p.noStroke();
      p.fill(235);
      p.circle(playerX, cy, 20);
      p.pop();

      p.push();
      p.noFill();
      p.stroke(210);
      p.strokeWeight(3);
      p.circle(targetX, cy, 28);
      p.pop();

      if (state.feedback && state.feedback.playerValue != null){
        const color = state.feedback.colorRGB || [255, 90, 90];
        p.push();
        p.stroke(color[0], color[1], color[2], 220);
        p.strokeWeight(4);
        p.line(playerX, cy, targetX, cy);
        p.pop();
      }

      if (state.feedback && state.feedback.cause !== 'timeout'){
        const age = now - state.feedback.startedAt;
        if (age <= FEEDBACK_FX_MS){
          const t = clamp(1 - age / FEEDBACK_FX_MS, 0, 1);
          const color = state.feedback.colorRGB || [255, 255, 255];
          const alpha = Math.round(255 * t);
          p.push();
          p.textAlign(p.CENTER, p.BOTTOM);
          p.textSize(26);
          p.fill(color[0], color[1], color[2], alpha);
          p.noStroke();
          const midX = (playerX + targetX) / 2;
          p.text(`+${state.feedback.reward} pts`, midX, trackTop - 12);
          p.pop();
        }
      }
    }

    function recordConfigChange(field, value){
      logTargetConfig('change', { field, value });
    }

    sanitizeTargetRange();

    return {
      enterMode(){
        reset();
        startTrial();
      },
      exitMode(){
        reset();
      },
      ensureTrial,
      freezePlayer,
      completeReward,
      tick,
      draw,
      setTotalScore,
      recordConfigChange,
      syncTargetRangeInputs: sanitizeTargetRange,
      getTargetValue(){ return state.targetPos; },
      getPlayerValue(){
        if (state.playerFrozenProgress != null) return state.playerFrozenProgress;
        if (state.playerCapturedProgress != null) return state.playerCapturedProgress;
        return state.progress;
      },
    };
  }

  global.createTargetMode = createTargetMode;
})(window);
