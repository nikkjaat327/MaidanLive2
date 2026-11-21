const $ = (id) => document.getElementById(id);

let currentState = null;
let logs = [];

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

function renderState(state) {
  currentState = state;

  // Topbar status pills
  if (!state.paired) {
    setPill($('badge-server'), 'MaidanLive: Not Paired', 'pill-muted');
  } else if (state.bridgeRevoked) {
    setPill($('badge-server'), 'MaidanLive: Revoked', 'pill-error');
  } else if (state.serverConnected) {
    setPill($('badge-server'), 'MaidanLive: Online', 'pill-ok');
  } else if (state.serverStatus === 'CONNECTING') {
    setPill($('badge-server'), 'MaidanLive: Connecting...', 'pill-warn');
  } else {
    setPill($('badge-server'), 'MaidanLive: Offline', 'pill-error');
  }

  if (state.obsConnected) {
    setPill($('badge-obs'), 'OBS Studio: Connected', 'pill-ok');
  } else if (state.obsAuthRequired) {
    setPill($('badge-obs'), 'OBS Studio: Password Needed', 'pill-warn');
  } else if (state.obsConnecting) {
    setPill($('badge-obs'), 'OBS Studio: Connecting...', 'pill-warn');
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

  if (!state.bridgeRevoked && state.serverError) {
    $('banner-server-error').textContent = state.serverError;
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
    : 'Not Connected';

  if (env.installed && !env.running) {
    $('btn-launch-obs').classList.remove('hidden');
  } else {
    $('btn-launch-obs').classList.add('hidden');
  }

  if (!state.obsConnected) {
    $('obs-setup-guide').classList.remove('hidden');
    $('lbl-obs-subtitle').textContent = state.obsAuthRequired
      ? 'Enter your OBS WebSocket Server password below.'
      : 'Waiting for OBS Studio WebSocket v5 on 127.0.0.1:4455...';
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

  renderScenes(state);
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
