const $ = (id) => document.getElementById(id);

let currentState = null;
let currentAudioMeter = null;
let logs = [];

function dbToNormalized(db) {
  const clamped = Math.max(-60, Math.min(0, Number.isFinite(Number(db)) ? Number(db) : -60));
  return (clamped + 60) / 60;
}

function drawAudioMeterCanvas(meter) {
  const canvas = $('audio-peak-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const targetWidth = Math.max(320, Math.round((rect.width || 900) * dpr));
  const targetHeight = Math.max(72, Math.round(72 * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  const width = Math.max(320, rect.width || 900);
  const height = 72;
  ctx.clearRect(0, 0, width, height);

  const labelPadLeft = 22;
  const barWidth = Math.max(120, width - labelPadLeft - 8);
  const channels = Array.isArray(meter?.channelsDb) && meter.channelsDb.length >= 2
    ? meter.channelsDb
    : [meter?.peakDb ?? -60, meter?.peakDb ?? -60];
  const holdNorm = dbToNormalized(meter?.peakHoldDb ?? -60);
  const offline = !meter?.obsConnected;
  const muted = Boolean(meter?.muted);

  const greenEnd = dbToNormalized(-20);
  const optimalEnd = dbToNormalized(-6);
  const warnEnd = dbToNormalized(-1.5);

  const barRows = [
    { label: 'L', y: 8, h: 16, db: channels[0] },
    { label: 'R', y: 30, h: 16, db: channels[1] },
  ];

  for (const row of barRows) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(row.label, 2, row.y + row.h / 2);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(labelPadLeft, row.y, barWidth, row.h);

    // Subtle zone guides behind meter track
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fillRect(labelPadLeft + barWidth * greenEnd, row.y, barWidth * (optimalEnd - greenEnd), row.h);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
    ctx.fillRect(labelPadLeft + barWidth * optimalEnd, row.y, barWidth * (warnEnd - optimalEnd), row.h);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
    ctx.fillRect(labelPadLeft + barWidth * warnEnd, row.y, barWidth * (1 - warnEnd), row.h);

    const levelNorm = offline || muted ? 0 : dbToNormalized(row.db);
    const activeW = Math.max(0, barWidth * levelNorm);

    if (activeW > 0) {
      const lowW = Math.min(activeW, barWidth * optimalEnd);
      if (lowW > 0) {
        ctx.fillStyle = levelNorm >= greenEnd ? '#10b981' : '#059669';
        ctx.fillRect(labelPadLeft, row.y + 2, lowW, row.h - 4);
      }
      if (activeW > barWidth * optimalEnd) {
        const amberStart = barWidth * optimalEnd;
        const amberW = Math.min(activeW - amberStart, barWidth * (warnEnd - optimalEnd));
        if (amberW > 0) {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(labelPadLeft + amberStart, row.y + 2, amberW, row.h - 4);
        }
      }
      if (activeW > barWidth * warnEnd) {
        const redStart = barWidth * warnEnd;
        const redW = activeW - redStart;
        if (redW > 0) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(labelPadLeft + redStart, row.y + 2, redW, row.h - 4);
        }
      }
    }

    if (!offline && !muted && holdNorm > 0.01) {
      const hx = labelPadLeft + Math.min(barWidth - 2, barWidth * holdNorm);
      ctx.fillStyle = meter?.clipping ? '#ef4444' : '#f8fafc';
      ctx.fillRect(hx, row.y + 1, 2.5, row.h - 2);
    }
  }

  // dBFS ruler ticks
  const ticks = [-60, -40, -20, -12, -6, -3, 0];
  ctx.fillStyle = '#64748b';
  ctx.font = '10px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  for (const t of ticks) {
    const x = labelPadLeft + barWidth * dbToNormalized(t);
    ctx.fillRect(x, 50, 1, 5);
    ctx.textAlign = t === -60 ? 'left' : t === 0 ? 'right' : 'center';
    ctx.fillText(t === 0 ? '0 dB' : `${t}`, x, 57);
  }
  ctx.restore();
}

function renderAudioMeter(meter) {
  currentAudioMeter = meter || currentAudioMeter;
  const data = currentAudioMeter || {
    obsConnected: Boolean(currentState?.obsConnected),
    primaryInputName: currentState?.primaryAudioInput || '',
    availableAudioInputs: [],
    channelsDb: [-60, -60],
    peakDb: -60,
    peakHoldDb: -60,
    muted: false,
    clipping: false,
    status: currentState?.obsConnected ? 'SILENT' : 'OFFLINE',
    label: currentState?.obsConnected ? 'No Audio Signal Detected' : 'OBS Offline',
  };

  const badge = $('badge-audio-status');
  if (badge) {
    const pillKind =
      data.status === 'OPTIMAL'
        ? 'pill-ok'
        : data.status === 'CLIPPING' || data.status === 'MUTED'
          ? 'pill-error'
          : data.status === 'LOW' || data.status === 'SILENT'
            ? 'pill-warn'
            : 'pill-muted';
    setPill(badge, data.label || data.status || 'OBS Offline', pillKind);
  }

  if ($('lbl-audio-peak-db')) {
    $('lbl-audio-peak-db').textContent = data.obsConnected ? `${Number(data.peakDb ?? -60).toFixed(1)} dB` : 'Offline';
  }
  if ($('lbl-audio-peak-hold')) {
    $('lbl-audio-peak-hold').textContent = data.obsConnected
      ? `${Number(data.peakHoldDb ?? -60).toFixed(1)} dB`
      : '—';
  }

  const muteBtn = $('btn-toggle-audio-mute');
  if (muteBtn) {
    muteBtn.disabled = !data.obsConnected || !data.primaryInputName;
    muteBtn.textContent = data.muted ? 'Unmute Input' : 'Mute Input';
  }

  const select = $('select-primary-audio');
  if (select && document.activeElement !== select) {
    const inputs = Array.isArray(data.availableAudioInputs) ? data.availableAudioInputs : [];
    const targetVal = data.primaryInputName || '';
    const existingOptions = Array.from(select.options).map((o) => o.value);
    const desired = inputs.length ? inputs : targetVal ? [targetVal] : [];
    if (
      existingOptions.length !== desired.length ||
      existingOptions.some((val, idx) => val !== desired[idx])
    ) {
      select.textContent = '';
      if (!desired.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = data.obsConnected ? 'No audio input detected' : 'Connect OBS Studio';
        select.appendChild(opt);
      } else {
        for (const name of desired) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        }
      }
    }
    if (targetVal && select.value !== targetVal) {
      select.value = targetVal;
    }
    select.disabled = !data.obsConnected || desired.length === 0;
  }

  if ($('lbl-audio-guidance')) {
    $('lbl-audio-guidance').textContent = !data.obsConnected
      ? 'Connect OBS Studio to inspect live input dBFS peaks before starting your stream.'
      : data.muted
        ? `Input "${data.primaryInputName}" is currently muted in OBS.`
        : data.clipping
          ? `Warning: "${data.primaryInputName}" is peaking near 0 dBFS. Lower OBS gain slightly.`
          : `Monitoring "${data.primaryInputName}" (${data.label}).`;
  }

  drawAudioMeterCanvas(data);
}

function showPairingError(msg) {
  const el = $('pairing-error');
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
  } else {
    el.textContent = msg;
    el.classList.remove('hidden');
  }
}

function setPill(el, text, kind) {
  el.textContent = text;
  el.className = `status-pill ${kind}`;
}

function renderLogs() {
  const container = $('log-container');
  container.textContent = '';
  if (!logs.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Waiting for bridge activity...';
    container.appendChild(empty);
    return;
  }
  for (const item of logs.slice(0, 120)) {
    const row = document.createElement('div');
    row.className = `log-line log-${item.level || 'info'}`;
    const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
    row.textContent = `[${time}] ${item.message}`;
    container.appendChild(row);
  }
}

function renderScenes(state) {
  const grid = $('scene-grid');
  const scenes = Array.isArray(state.obsScenes) ? state.obsScenes : [];
  $('lbl-scene-count').textContent = String(scenes.length);
  $('lbl-active-scene').textContent = state.activeObsScene || (state.obsConnected ? 'None' : 'OBS Offline');
  if ($('lbl-preview-scene')) {
    $('lbl-preview-scene').textContent = state.studioModeEnabled
      ? state.previewObsScene || state.activeObsScene || 'None'
      : 'Disabled';
  }
  const studioBtn = $('btn-toggle-studio-mode');
  if (studioBtn) {
    studioBtn.disabled = !state.obsConnected;
    studioBtn.textContent = state.studioModeEnabled ? 'Studio Mode: On' : 'Studio Mode: Off';
    studioBtn.className = `btn btn-sm ${state.studioModeEnabled ? 'btn-accent' : 'btn-secondary'}`;
  }

  const previewSelect = $('select-preview-scene');
  if (previewSelect && document.activeElement !== previewSelect) {
    const existing = Array.from(previewSelect.options).map((o) => o.value);
    if (existing.length !== scenes.length || existing.some((v, idx) => v !== scenes[idx])) {
      previewSelect.textContent = '';
      if (!scenes.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = state.obsConnected ? 'No OBS scenes' : 'OBS Offline';
        previewSelect.appendChild(opt);
      } else {
        for (const sc of scenes) {
          const opt = document.createElement('option');
          opt.value = sc;
          opt.textContent = sc;
          previewSelect.appendChild(opt);
        }
      }
    }
    const desiredPreview = state.previewObsScene || state.activeObsScene || scenes[0] || '';
    if (desiredPreview && scenes.includes(desiredPreview)) {
      previewSelect.value = desiredPreview;
    }
    previewSelect.disabled = !state.obsConnected || scenes.length === 0;
  }

  const transitionSelect = $('select-transition-kind');
  const transitions = Array.isArray(state.obsTransitions) ? state.obsTransitions : [];
  const transitionNames = transitions.map((t) => t.transitionName).filter(Boolean);
  if (transitionSelect && document.activeElement !== transitionSelect) {
    const existingT = Array.from(transitionSelect.options).map((o) => o.value);
    if (
      existingT.length !== transitionNames.length ||
      existingT.some((v, idx) => v !== transitionNames[idx])
    ) {
      transitionSelect.textContent = '';
      if (!transitionNames.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = state.currentTransitionName || 'Active OBS Transition';
        transitionSelect.appendChild(opt);
      } else {
        for (const name of transitionNames) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          transitionSelect.appendChild(opt);
        }
      }
    }
    if (state.currentTransitionName && transitionNames.includes(state.currentTransitionName)) {
      transitionSelect.value = state.currentTransitionName;
    }
    transitionSelect.disabled = !state.obsConnected || transitionNames.length === 0;
  }

  if ($('btn-trigger-transition')) {
    $('btn-trigger-transition').disabled = !state.obsConnected || scenes.length === 0;
  }
  if ($('lbl-transition-meta')) {
    const trName = state.currentTransitionName || 'Default';
    const durMs = Number.isFinite(Number(state.currentTransitionDurationMs))
      ? Number(state.currentTransitionDurationMs)
      : 300;
    $('lbl-transition-meta').textContent = state.obsConnected
      ? `${trName} · ${durMs}ms${state.studioModeEnabled ? ' · Studio Mode' : ' · Auto Studio Mode'}`
      : 'OBS WebSocket v5 Offline';
  }

  grid.textContent = '';

  if (!state.obsConnected || scenes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-scenes';
    empty.textContent = state.obsConnected
      ? 'No scenes found in your active OBS Studio collection.'
      : 'Connect OBS Studio to load your scenes dynamically.';
    grid.appendChild(empty);
    return;
  }

  for (const sceneName of scenes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `scene-btn ${sceneName === state.activeObsScene ? 'active' : ''}`;
    btn.textContent = sceneName;
    btn.title = `Switch OBS Program Scene to "${sceneName}"`;
    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        await window.bridgeApi.switchSceneLocally(sceneName);
      } catch (err) {
        $('obs-error-alert').textContent = err?.message || 'Scene switch failed.';
        $('obs-error-alert').classList.remove('hidden');
      } finally {
        btn.disabled = false;
      }
    });
    grid.appendChild(btn);
  }
}

function renderMtxLogs(entries) {
  const container = $('mtx-log-container');
  if (!container) return;
  container.textContent = '';
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No MediaMTX output captured yet.';
    container.appendChild(empty);
    return;
  }
  for (const item of list.slice(0, 60)) {
    const row = document.createElement('div');
    row.className = `log-line log-${item.level || 'info'}`;
    const time = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
    row.textContent = `[${time}] ${item.message}`;
    container.appendChild(row);
  }
}

function renderState(state) {
  currentState = state;
  if ($('lbl-bridge-version') && state.bridgeVersion) {
    $('lbl-bridge-version').textContent = `v${state.bridgeVersion}`;
  }

  // Topbar status pills
  if (!state.paired) {
    setPill($('badge-server'), 'MaidanLive: Not Paired', 'pill-muted');
  } else if (state.bridgeRevoked) {
    setPill($('badge-server'), 'MaidanLive: Revoked', 'pill-error');
  } else if (state.adminDisconnected) {
    setPill($('badge-server'), 'MaidanLive: Paused (Admin)', 'pill-muted');
  } else if (state.serverConnected) {
    setPill($('badge-server'), 'MaidanLive: Online', 'pill-ok');
  } else if (state.serverStatus === 'CONNECTING' || state.serverStatus === 'RECONNECTING') {
    setPill($('badge-server'), 'MaidanLive: Reconnecting...', 'pill-warn');
  } else if (state.serverStatus === 'CONNECTION_LOST') {
    setPill($('badge-server'), 'MaidanLive: Retrying...', 'pill-warn');
  } else {
    setPill($('badge-server'), 'MaidanLive: Offline', 'pill-error');
  }

  if (state.obsConnected) {
    setPill($('badge-obs'), 'OBS Studio: Connected', 'pill-ok');
  } else if (state.obsManuallyDisconnected) {
    setPill($('badge-obs'), 'OBS Studio: Paused (Admin)', 'pill-muted');
  } else if (state.obsAuthRequired) {
    setPill($('badge-obs'), 'OBS Studio: Password Needed', 'pill-warn');
  } else if (state.obsConnecting || state.obsStatus === 'RECONNECTING' || state.obsStatus === 'CONNECTION_LOST') {
    setPill($('badge-obs'), 'OBS Studio: Reconnecting...', 'pill-warn');
  } else {
    setPill($('badge-obs'), 'OBS Studio: Disconnected', 'pill-error');
  }

  // Precheck on pairing screen
  const env = state.obsEnv || {};
  $('precheck-installed').textContent = env.installed ? 'Detected' : 'Not Detected';
  $('precheck-running').textContent = env.running ? 'Running' : 'Not Running';
  $('precheck-port').textContent = env.wsPortOpen ? 'Listening (4455)' : 'Closed / Offline';

  if (!state.paired) {
    $('view-pairing').classList.remove('hidden');
    $('view-connected').classList.add('hidden');
    return;
  }

  $('view-pairing').classList.add('hidden');
  $('view-connected').classList.remove('hidden');

  $('lbl-bridge-id').textContent = state.bridgeId || '—';
  $('lbl-server-url').textContent = state.serverUrl || '—';
  $('lbl-match-title').textContent = state.activeMatch?.matchTitle
    ? `Assigned Match: ${state.activeMatch.matchTitle} (${state.activeMatch.status})`
    : 'Ready — Assign a match in MaidanLive Broadcast Control Room';

  if (state.bridgeRevoked) {
    $('banner-revoked').textContent =
      state.serverError || 'This Bridge was revoked in MaidanLive. Unpair and pair a fresh bridge.';
    $('banner-revoked').classList.remove('hidden');
  } else {
    $('banner-revoked').classList.add('hidden');
  }

  if (!state.bridgeRevoked && (state.serverError || state.adminDisconnected)) {
    $('banner-server-error').textContent = state.adminDisconnected
      ? 'Paused by Administrator from Control Room. Click "Reconnect MaidanLive" above when ready.'
      : state.serverError;
    $('banner-server-error').classList.remove('hidden');
  } else {
    $('banner-server-error').classList.add('hidden');
  }

  $('obs-installed').textContent = env.installed ? 'Installed' : 'Open Manually';
  $('obs-running').textContent = env.running ? 'Running' : 'Not Running';
  $('obs-port').textContent = env.wsPortOpen
    ? `Open (${env.wsPort || 4455})`
    : env.wsServerEnabled === false
      ? 'Disabled in OBS'
      : 'Waiting on 4455';
  $('obs-version').textContent = state.obsConnected
    ? `${state.obsVersion || 'OBS'} · ${state.obsStreamActive ? 'LIVE STREAMING' : 'Idle'}`
    : state.obsManuallyDisconnected
      ? 'Paused by Admin'
      : 'Auto-reconnecting...';

  if (env.installed && !env.running) {
    $('btn-launch-obs').classList.remove('hidden');
  } else {
    $('btn-launch-obs').classList.add('hidden');
  }

  if (!state.obsConnected) {
    $('obs-setup-guide').classList.remove('hidden');
    $('lbl-obs-subtitle').textContent = state.obsManuallyDisconnected
      ? 'OBS connection paused by Administrator. Click "Reconnect OBS" when ready.'
      : state.obsAuthRequired
        ? 'Enter your OBS WebSocket Server password below.'
        : 'Waiting for OBS Studio WebSocket v5 on 127.0.0.1:4455 (auto-reconnecting)...';
  } else {
    $('obs-setup-guide').classList.add('hidden');
    $('lbl-obs-subtitle').textContent = `Connected to local OBS (${state.obsUrl}) — Ready for live switching`;
  }

  if (state.obsError && !state.obsConnected) {
    $('obs-error-alert').textContent = state.obsError;
    $('obs-error-alert').classList.remove('hidden');
  } else {
    $('obs-error-alert').classList.add('hidden');
  }

  $('lbl-obs-pw-saved').textContent = state.hasObsPassword ? '(Encrypted Locally)' : '';
  $('chk-autostart').checked = Boolean(state.autoStart);

  renderMediaMTX(state);
  renderScenes(state);
  renderAudioMeter(state.audioMeter || currentAudioMeter);
}

function renderMediaMTX(state) {
  const mtx = state.mediamtx || {};
  const verLabel = mtx.version ? ` (${mtx.version})` : '';
  if (mtx.running) {
    setPill($('badge-mtx'), `MediaMTX${verLabel}: Running`, 'pill-ok');
  } else if (mtx.installed) {
    setPill($('badge-mtx'), `MediaMTX${verLabel}: Installed (Stopped)`, 'pill-warn');
  } else {
    setPill($('badge-mtx'), 'MediaMTX: Not Detected', 'pill-muted');
  }

  $('mtx-installed').textContent = mtx.installed
    ? `${mtx.executablePath || 'Detected'}${mtx.version ? ` (${mtx.version})` : ''}`
    : 'Not Installed (Optional)';
  $('mtx-config-path').textContent = mtx.configPath
    ? `${mtx.configPath} (${mtx.configSource || 'detected'})`
    : 'Not Found (Click Sync to create)';
  $('mtx-ports').textContent = `${mtx.rtmpPortOpen ? 'RTMP OK' : 'RTMP Off'} / ${
    mtx.srtPortOpen ? 'SRT OK' : 'SRT Off'
  } / ${mtx.apiReachable ? 'API OK' : mtx.apiPortOpen ? 'API Open' : 'API Off'}`;
  const activeCount = Array.isArray(mtx.activePaths)
    ? mtx.activePaths.filter((p) => p.ready).length
    : 0;
  $('mtx-paths').textContent = `${activeCount} streaming`;
  $('mtx-lan-ips').textContent =
    Array.isArray(mtx.lanIps) && mtx.lanIps.length > 0 ? mtx.lanIps.join(', ') : '127.0.0.1';

  const input = $('mtx-path-input');
  if (input && document.activeElement !== input && state.mediamtxPath && !input.value) {
    input.value = state.mediamtxPath;
  }
  const cfgInput = $('mtx-config-input');
  if (cfgInput && document.activeElement !== cfgInput && state.mediamtxConfigPath && !cfgInput.value) {
    cfgInput.value = state.mediamtxConfigPath;
  }

  $('btn-mtx-start').disabled = Boolean(mtx.running);
  $('btn-mtx-stop').disabled = !mtx.running;
  $('btn-mtx-restart').disabled = !mtx.installed;

  if (Array.isArray(mtx.recentLogs)) {
    renderMtxLogs(mtx.recentLogs);
  }

  if (mtx.lastError && !mtx.running) {
    $('mtx-alert').textContent = mtx.lastError;
    $('mtx-alert').classList.remove('hidden');
  } else {
    $('mtx-alert').classList.add('hidden');
  }
}

// Tab switching on pairing view
$('tab-code-btn').addEventListener('click', () => {
  $('tab-code-btn').classList.add('active');
  $('tab-login-btn').classList.remove('active');
  $('form-pair-code').classList.remove('hidden');
  $('form-pair-login').classList.add('hidden');
  showPairingError('');
});

$('tab-login-btn').addEventListener('click', () => {
  $('tab-login-btn').classList.add('active');
  $('tab-code-btn').classList.remove('active');
  $('form-pair-login').classList.remove('hidden');
  $('form-pair-code').classList.add('hidden');
  showPairingError('');
});

$('pairing-code-input').addEventListener('input', (e) => {
  const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  e.target.value = clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
});

$('form-pair-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  showPairingError('');
  const btn = $('btn-pair-code');
  btn.disabled = true;
  btn.textContent = 'Pairing...';
  try {
    await window.bridgeApi.pairWithCode({
      serverUrl: $('code-server-url').value.trim(),
      code: $('pairing-code-input').value.trim(),
    });
  } catch (err) {
    showPairingError(err?.message || 'Pairing failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pair & Connect OBS Bridge';
  }
});

$('form-pair-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  showPairingError('');
  const btn = $('btn-pair-login');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const res = await window.bridgeApi.pairWithAccount({
      serverUrl: $('login-server-url').value.trim(),
      email: $('login-email').value.trim(),
      password: $('login-password').value,
      totpCode: $('login-totp').value.trim(),
    });
    if (res?.requires2FA) {
      $('login-totp-row').classList.remove('hidden');
      showPairingError(res.message || 'Enter your 6-digit 2FA authenticator code.');
    }
  } catch (err) {
    showPairingError(err?.message || 'Sign in failed.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In & Pair This PC';
  }
});

$('btn-reconnect-server').addEventListener('click', () => window.bridgeApi.reconnectServer());
$('btn-minimize-tray').addEventListener('click', () => window.bridgeApi.minimizeToTray());
$('btn-unpair').addEventListener('click', () => window.bridgeApi.unpair());
$('btn-scan-obs').addEventListener('click', () => window.bridgeApi.scanObs());
$('btn-launch-obs').addEventListener('click', async () => {
  const res = await window.bridgeApi.launchObs();
  if (!res?.ok && res?.message) {
    $('obs-error-alert').textContent = res.message;
    $('obs-error-alert').classList.remove('hidden');
  }
});
$('btn-reconnect-obs').addEventListener('click', () => window.bridgeApi.reconnectObs());
$('btn-refresh-scenes').addEventListener('click', () => window.bridgeApi.refreshScenes());
$('btn-clear-logs').addEventListener('click', () => window.bridgeApi.clearLogs());

$('btn-toggle-studio-mode').addEventListener('click', async () => {
  const feedback = $('transition-feedback');
  feedback.classList.add('hidden');
  try {
    await window.bridgeApi.setStudioMode(!currentState?.studioModeEnabled);
  } catch (err) {
    feedback.textContent = err?.message || 'Failed toggling OBS Studio Mode.';
    feedback.classList.remove('hidden');
  }
});

$('select-preview-scene').addEventListener('change', async (e) => {
  const sceneName = String(e.target.value || '').trim();
  if (!sceneName) return;
  const feedback = $('transition-feedback');
  feedback.classList.add('hidden');
  try {
    await window.bridgeApi.setPreviewScene(sceneName);
  } catch (err) {
    feedback.textContent = err?.message || 'Failed updating preview scene.';
    feedback.classList.remove('hidden');
  }
});

$('btn-trigger-transition').addEventListener('click', async () => {
  const btn = $('btn-trigger-transition');
  const feedback = $('transition-feedback');
  feedback.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Transitioning...';
  try {
    const previewSceneName = String($('select-preview-scene').value || '').trim();
    const transitionName = String($('select-transition-kind').value || '').trim();
    await window.bridgeApi.triggerSceneTransition({
      ...(previewSceneName ? { previewSceneName } : {}),
      ...(transitionName ? { transitionName } : {}),
      ensureStudioMode: true,
    });
  } catch (err) {
    feedback.textContent = err?.message || 'Scene Transition failed.';
    feedback.classList.remove('hidden');
  } finally {
    btn.disabled = !currentState?.obsConnected;
    btn.textContent = 'Trigger Scene Transition';
  }
});

$('select-primary-audio').addEventListener('change', async (e) => {
  const inputName = String(e.target.value || '').trim();
  try {
    const res = await window.bridgeApi.setPrimaryAudioInput(inputName);
    if (res?.audioMeter) renderAudioMeter(res.audioMeter);
  } catch (err) {
    $('obs-error-alert').textContent = err?.message || 'Failed selecting audio input.';
    $('obs-error-alert').classList.remove('hidden');
  }
});

$('btn-toggle-audio-mute').addEventListener('click', async () => {
  const inputName = currentAudioMeter?.primaryInputName || currentState?.primaryAudioInput || '';
  if (!inputName) return;
  try {
    await window.bridgeApi.togglePrimaryAudioMute({
      inputName,
      inputMuted: !currentAudioMeter?.muted,
    });
  } catch (err) {
    $('obs-error-alert').textContent = err?.message || 'Failed toggling audio mute.';
    $('obs-error-alert').classList.remove('hidden');
  }
});

$('btn-mtx-start').addEventListener('click', async () => {
  $('mtx-alert').classList.add('hidden');
  try {
    const customPath = $('mtx-path-input').value.trim();
    const customCfg = $('mtx-config-input').value.trim();
    if (customPath || customCfg) {
      await window.bridgeApi.updateMediaMTXPath(customPath, customCfg || undefined);
    }
    const res = await window.bridgeApi.startMediaMTX();
    if (Array.isArray(res?.logs)) renderMtxLogs(res.logs);
  } catch (err) {
    $('mtx-alert').textContent = err?.message || 'Failed to start MediaMTX.';
    $('mtx-alert').classList.remove('hidden');
  }
});

$('btn-mtx-restart').addEventListener('click', async () => {
  $('mtx-alert').classList.add('hidden');
  try {
    const customPath = $('mtx-path-input').value.trim();
    const customCfg = $('mtx-config-input').value.trim();
    if (customPath || customCfg) {
      await window.bridgeApi.updateMediaMTXPath(customPath, customCfg || undefined);
    }
    const res = await window.bridgeApi.restartMediaMTX();
    if (Array.isArray(res?.logs)) renderMtxLogs(res.logs);
  } catch (err) {
    $('mtx-alert').textContent = err?.message || 'Failed to restart MediaMTX.';
    $('mtx-alert').classList.remove('hidden');
  }
});

$('btn-mtx-stop').addEventListener('click', async () => {
  try {
    const res = await window.bridgeApi.stopMediaMTX();
    if (Array.isArray(res?.logs)) renderMtxLogs(res.logs);
  } catch (err) {
    $('mtx-alert').textContent = err?.message || 'Failed to stop MediaMTX.';
    $('mtx-alert').classList.remove('hidden');
  }
});

$('btn-mtx-sync').addEventListener('click', async () => {
  $('mtx-alert').classList.add('hidden');
  try {
    await window.bridgeApi.updateMediaMTXPath(
      $('mtx-path-input').value.trim(),
      $('mtx-config-input').value.trim()
    );
    const res = await window.bridgeApi.syncMediaMTXConfig();
    if (Array.isArray(res?.logs)) renderMtxLogs(res.logs);
  } catch (err) {
    $('mtx-alert').textContent = err?.message || 'Failed to sync MediaMTX configuration.';
    $('mtx-alert').classList.remove('hidden');
  }
});

$('btn-mtx-refresh').addEventListener('click', () => window.bridgeApi.refreshMediaMTX());
$('btn-mtx-logs').addEventListener('click', async () => {
  try {
    const res = await window.bridgeApi.getMediaMTXLogs();
    if (Array.isArray(res?.logs)) renderMtxLogs(res.logs);
  } catch (err) {
    $('mtx-alert').textContent = err?.message || 'Failed to load MediaMTX logs.';
    $('mtx-alert').classList.remove('hidden');
  }
});

$('chk-autostart').addEventListener('change', (e) => {
  window.bridgeApi.setAutoStart(Boolean(e.target.checked));
});

$('form-obs-settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('obs-password-input').value;
  await window.bridgeApi.updateObsSettings({
    obsUrl: $('obs-url-input').value.trim(),
    ...(pw ? { obsPassword: pw } : {}),
  });
  $('obs-password-input').value = '';
});

window.bridgeApi.onState((st) => renderState(st));
window.bridgeApi.onAudioLevels((meter) => renderAudioMeter(meter));
window.bridgeApi.onLog((entry) => {
  logs.unshift(entry);
  if (logs.length > 200) logs.length = 200;
  renderLogs();
});
window.bridgeApi.onLogsCleared(() => {
  logs = [];
  renderLogs();
});
window.bridgeApi.onProtocolPrefill((data) => {
  if (data?.serverUrl) {
    $('code-server-url').value = data.serverUrl;
    $('login-server-url').value = data.serverUrl;
  }
  if (data?.code) {
    $('pairing-code-input').value = data.code;
  }
  if (data?.error) {
    showPairingError(data.error);
  }
});

window.addEventListener('resize', () => {
  if (currentAudioMeter) drawAudioMeterCanvas(currentAudioMeter);
});

(async function init() {
  const boot = await window.bridgeApi.getBootstrap();
  logs = Array.isArray(boot.logs) ? boot.logs : [];
  $('obs-url-input').value = boot.obsUrl || 'ws://127.0.0.1:4455';
  if (boot.defaultServerUrl) {
    $('code-server-url').value = boot.defaultServerUrl;
    $('login-server-url').value = boot.defaultServerUrl;
  }
  renderLogs();
  renderState(boot.state);
})();
