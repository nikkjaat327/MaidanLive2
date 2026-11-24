const { EventEmitter } = require('node:events');
const os = require('node:os');
const { io } = require('socket.io-client');
const { default: OBSWebSocket } = require('obs-websocket-js');
const {
  getUserDataDir,
  loadConfig,
  saveConfig,
  clearPairing,
  hasPairedCredentials,
} = require('./store.cjs');
const { detectObsEnvironment } = require('./obsDetector.cjs');
const pkg = require('./package.json');
const {
  writeManagedConfig: writeMediaMTXConfig,
  getMediaMTXStatus,
  startMediaMTX,
  stopMediaMTX,
  restartMediaMTX,
  getMediaMTXLogs,
} = require('./mediamtxManager.cjs');

const BRIDGE_VERSION = String(pkg.version || '1.1.0');
const BRIDGE_CAPABILITIES = [
  'obs_control',
  'obs_scene_switching',
  'obs_layout_control',
  'mediamtx_control',
  'mediamtx_detect',
  'mediamtx_start',
  'mediamtx_stop',
  'mediamtx_restart',
  'mediamtx_sync_config',
  'mediamtx_logs',
];

const APPROVED_COMMANDS = new Set([
  'get_snapshot',
  'switch_scene',
  'apply_layout',
  'update_camera_transform',
  'get_scene_transforms',
  'screenshot',
  'start_stream',
  'stop_stream',
  'start_record',
  'stop_record',
  'set_input_mute',
  'get_input_mute',
  'reconnect_input',
  'remove_input',
  'get_scene_items',
  'set_scene_item_enabled',
  'get_input_list',
  'reconnect_obs',
  'mediamtx_status',
  'mediamtx_start',
  'mediamtx_stop',
  'mediamtx_restart',
  'mediamtx_sync_config',
  'mediamtx_logs',
]);

function buildCenterBoxTransform(box) {
  const x = Number.isFinite(Number(box.x)) ? Number(box.x) : 0;
  const y = Number.isFinite(Number(box.y)) ? Number(box.y) : 0;
  const width = Math.max(64, Math.round(Number(box.width) || 1920));
  const height = Math.max(64, Math.round(Number(box.height) || 1080));
  const rawDeg = Number(box.rotation) || 0;
  const rotation = (((Math.round(rawDeg / 90) * 90) % 360) + 360) % 360;
  const isQuarter = rotation === 90 || rotation === 270;
  const fit = String(box.previewFit || 'contain');
  const boundsType =
    fit === 'cover'
      ? 'OBS_BOUNDS_SCALE_OUTER'
      : fit === 'fill'
        ? 'OBS_BOUNDS_STRETCH'
        : 'OBS_BOUNDS_SCALE_INNER';

  return {
    positionX: Math.round(x + width / 2),
    positionY: Math.round(y + height / 2),
    alignment: 0,
    rotation,
    boundsType,
    boundsAlignment: 0,
    boundsWidth: isQuarter ? height : width,
    boundsHeight: isQuarter ? width : height,
    cropToBounds: fit === 'cover',
  };
}

class BridgeEngine extends EventEmitter {
  constructor() {
    super();
    this.obs = new OBSWebSocket();
    this.socket = null;
    this.logs = [];
    this.obsReconnectTimer = null;
    this.heartbeatTimer = null;
    this.envPollTimer = null;

    this.state = {
      bridgeVersion: BRIDGE_VERSION,
      capabilities: [...BRIDGE_CAPABILITIES],
      paired: false,
      bridgeId: '',
      serverUrl: '',
      label: '',
      activeMatch: null,
      bridgeRevoked: false,
      serverConnected: false,
      serverStatus: 'OFFLINE', // OFFLINE | CONNECTING | ONLINE | REVOKED | ERROR
      serverError: '',
      obsUrl: 'ws://127.0.0.1:4455',
      obsConnected: false,
      obsConnecting: false,
      obsStatus: 'DISCONNECTED', // DISCONNECTED | CONNECTING | CONNECTED | AUTH_REQUIRED | ERROR
      obsAuthRequired: false,
      obsError: '',
      obsVersion: '',
      obsWebSocketVersion: '',
      activeObsScene: '',
      obsScenes: [],
      obsInputs: [],
      obsStreamActive: false,
      obsRecordActive: false,
      hasObsPassword: false,
      autoStart: false,
      mediamtxPath: '',
      mediamtxConfigPath: '',
      mediamtx: {
        installed: false,
        executablePath: '',
        version: '',
        running: false,
        managedByBridge: false,
        managedPid: null,
        detectedPids: [],
        rtmpPortOpen: false,
        srtPortOpen: false,
        apiPortOpen: false,
        apiReachable: false,
        apiConfigured: false,
        authConfigured: false,
        activePaths: [],
        activePathCount: 0,
        lanIps: [],
        configPath: '',
        configExists: false,
        configSource: 'none',
        lastError: '',
        recentLogs: [],
      },
      obsEnv: {
        installed: false,
        running: false,
        wsPortOpen: false,
        wsServerEnabled: null,
        wsAuthRequired: null,
      },
    };

    this._bindObsListeners();
  }

  _redact(msg) {
    let text = String(msg || '');
    const cfg = loadConfig();
    if (cfg.bridgeToken) text = text.split(cfg.bridgeToken).join('***');
    if (cfg.obsPassword) text = text.split(cfg.obsPassword).join('***');
    text = text.replace(/mlbrg_[A-Za-z0-9_-]+/g, 'mlbrg_***');
    return text;
  }

  log(level, message) {
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      level,
      message: this._redact(message),
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.length = 200;
    this.emit('log', entry);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    this.emit('logs-cleared');
  }

  getState() {
    return { ...this.state };
  }

  _setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', this.getState());
  }

  _syncConfigToState(cfg) {
    this._setState({
      bridgeVersion: BRIDGE_VERSION,
      capabilities: [...BRIDGE_CAPABILITIES],
      paired: hasPairedCredentials(cfg),
      bridgeId: cfg.bridgeId || '',
      serverUrl: cfg.serverUrl || '',
      label: cfg.label || '',
      activeMatch: cfg.activeMatch || null,
      obsUrl: cfg.obsUrl || 'ws://127.0.0.1:4455',
      hasObsPassword: Boolean(cfg.obsPassword),
      autoStart: Boolean(cfg.autoStart),
      mediamtxPath: cfg.mediamtxPath || '',
      mediamtxConfigPath: cfg.mediamtxConfigPath || '',
    });
  }

  async refreshMediaMTXStatus() {
    const cfg = loadConfig();
    const mtx = await getMediaMTXStatus({
      configuredPath: cfg.mediamtxPath || '',
      configuredConfigPath: cfg.mediamtxConfigPath || '',
      userDataDir: getUserDataDir(),
    }).catch(() => this.state.mediamtx);
    this._setState({ mediamtx: mtx });
    return mtx;
  }

  async updateMediaMTXPath(executablePath, configPath) {
    const patch = { mediamtxPath: String(executablePath || '').trim() };
    if (configPath !== undefined) {
      patch.mediamtxConfigPath = String(configPath || '').trim();
    }
    const cfg = saveConfig(patch);
    this._syncConfigToState(cfg);
    await this.refreshMediaMTXStatus();
    return this.getState();
  }

  async refreshObsEnvironment() {
    const cfg = loadConfig();
    const [env, mtx] = await Promise.all([
      detectObsEnvironment(cfg.obsUrl || 'ws://127.0.0.1:4455'),
      getMediaMTXStatus({
        configuredPath: cfg.mediamtxPath || '',
        configuredConfigPath: cfg.mediamtxConfigPath || '',
        userDataDir: getUserDataDir(),
      }).catch(() => this.state.mediamtx),
    ]);
    this._setState({ obsEnv: env, mediamtx: mtx });
    return env;
  }

  async verifySavedCredentials() {
    const cfg = loadConfig();
    if (!hasPairedCredentials(cfg)) return { ok: false, reason: 'NOT_PAIRED' };
    try {
      const resp = await fetch(`${cfg.serverUrl}/api/obs/bridges/me`, {
        method: 'GET',
        headers: {
          'x-bridge-id': cfg.bridgeId,
          'x-bridge-token': cfg.bridgeToken,
        },
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401 || resp.status === 403 || resp.status === 404) {
        const msg = data?.message || 'Bridge registration was revoked or rotated.';
        if (resp.status === 403 && String(msg).toLowerCase().includes('revoked')) {
          this._setState({
            bridgeRevoked: true,
            serverConnected: false,
            serverStatus: 'REVOKED',
            serverError: msg,
          });
          this.log('error', msg);
          return { ok: false, revoked: true, reason: msg };
        }
        return { ok: false, reason: msg };
      }
      if (resp.ok && data?.bridge) {
        const nextCfg = saveConfig({
          activeMatch: data.match || null,
          label: data.bridge.label || cfg.label,
        });
        this._syncConfigToState(nextCfg);
        return { ok: true, bridge: data.bridge, match: data.match || null };
      }
      return { ok: true };
    } catch {
      // Transient offline state; allow Socket.IO retry loop to handle reconnect cleanly
      return { ok: true, offline: true };
    }
  }

  async start() {
    const cfg = loadConfig();
    this._syncConfigToState(cfg);
    await this.refreshObsEnvironment();

    if (!this.envPollTimer) {
      this.envPollTimer = setInterval(() => {
        this.refreshObsEnvironment().catch(() => {});
      }, 6000);
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        if (this.state.obsConnected && this.socket && this.socket.connected && !this.state.bridgeRevoked) {
          this.emitObsSnapshot().catch(() => {});
        }
      }, 5000);
    }

    if (!hasPairedCredentials(cfg)) {
      this.log('info', 'Ready to pair with MaidanLive. Use a Pairing Code or sign in with your broadcaster account.');
      return;
    }

    this.log('info', `Loaded saved bridge ${cfg.bridgeId} for ${cfg.serverUrl}`);
    const check = await this.verifySavedCredentials();
    if (check.revoked) {
      return;
    }
    this.connectServerSocket();
    this.connectObsLoop();
  }

  async pairWithCode({ code, serverUrl }) {
    const cleanServer = String(serverUrl || '').trim().replace(/\/+$/, '');
    const parsedUrl = new URL(cleanServer);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Server URL must start with http:// or https://');
    }

    this.log('info', `Exchanging pairing code with ${cleanServer}...`);
    const resp = await fetch(`${cleanServer}/api/obs/bridges/pairing/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: String(code || '').trim(),
        deviceName: `${os.hostname()} OBS Bridge`,
        deviceLabel: `${os.hostname()} (${process.platform === 'win32' ? 'Windows' : process.platform})`,
        platform: process.platform,
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.message || `Pairing failed (${resp.status}).`);
    }

    return this._completePairing(data, cleanServer);
  }

  async pairWithAccount({ serverUrl, email, password, totpCode }) {
    const cleanServer = String(serverUrl || '').trim().replace(/\/+$/, '');
    const parsedUrl = new URL(cleanServer);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Server URL must start with http:// or https://');
    }

    this.log('info', `Signing in to ${cleanServer} to pair this Windows PC...`);
    const resp = await fetch(`${cleanServer}/api/obs/bridges/pairing/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(email || '').trim(),
        password: String(password || ''),
        totpCode: String(totpCode || '').trim(),
        deviceName: `${os.hostname()} OBS Bridge`,
        deviceLabel: `${os.hostname()} (${process.platform === 'win32' ? 'Windows' : process.platform})`,
        platform: process.platform,
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (data?.requires2FA && !data?.bridgeToken) {
      return { requires2FA: true, message: data?.message || 'Enter 6-digit 2FA code.' };
    }
    if (!resp.ok) {
      throw new Error(data?.message || `Account pairing failed (${resp.status}).`);
    }

    return this._completePairing(data, cleanServer);
  }

  async _completePairing(data, fallbackServerUrl) {
    if (!data?.bridgeId || !data?.bridgeToken) {
      throw new Error('Server did not return valid bridge pairing credentials.');
    }

    this.disconnectServerSocket();
    const cfg = saveConfig({
      serverUrl: (data.serverUrl || fallbackServerUrl || '').replace(/\/+$/, ''),
      bridgeId: data.bridgeId,
      bridgeToken: data.bridgeToken,
      label: data.bridge?.label || `${os.hostname()} (Windows PC)`,
      activeMatch: data.match || null,
      pairedAt: new Date().toISOString(),
    });
    this._setState({
      bridgeRevoked: false,
      serverError: '',
    });
    this._syncConfigToState(cfg);
    this.log('info', `Paired successfully as ${cfg.bridgeId}!`);

    this.connectServerSocket();
    await this.refreshObsEnvironment();
    this.connectObsLoop();
    return { ok: true, bridgeId: cfg.bridgeId, match: cfg.activeMatch };
  }

  async unpair() {
    this.disconnectServerSocket();
    await this.obs.disconnect().catch(() => {});
    if (this.obsReconnectTimer) {
      clearTimeout(this.obsReconnectTimer);
      this.obsReconnectTimer = null;
    }
    const cfg = clearPairing();
    this._setState({
      bridgeRevoked: false,
      serverConnected: false,
      serverStatus: 'OFFLINE',
      serverError: '',
      obsConnected: false,
      obsConnecting: false,
      obsStatus: 'DISCONNECTED',
      obsAuthRequired: false,
      obsScenes: [],
      activeObsScene: '',
      obsVersion: '',
      obsWebSocketVersion: '',
      obsStreamActive: false,
      obsRecordActive: false,
    });
    this._syncConfigToState(cfg);
    this.log('info', 'Unpaired this desktop bridge from MaidanLive.');
  }

  async updateObsSettings({ obsUrl, obsPassword }) {
    const patch = {};
    if (typeof obsUrl === 'string' && obsUrl.trim()) {
      const parsed = new URL(obsUrl.trim());
      if (!['ws:', 'wss:'].includes(parsed.protocol)) {
        throw new Error('OBS WebSocket URL must start with ws:// or wss://');
      }
      patch.obsUrl = obsUrl.trim();
    }
    if (typeof obsPassword === 'string') {
      patch.obsPassword = obsPassword;
    }
    const cfg = saveConfig(patch);
    this._syncConfigToState(cfg);
    this._setState({ obsAuthRequired: false, obsError: '' });
    this.log('info', `Updated local OBS connection settings (${cfg.obsUrl}). Reconnecting to OBS...`);
    await this.reconnectObsNow();
    return this.getState();
  }

  disconnectServerSocket() {
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch {
        // ignore
      }
      this.socket = null;
    }
  }

  connectServerSocket() {
    const cfg = loadConfig();
    if (!hasPairedCredentials(cfg) || this.state.bridgeRevoked) return;
    this.disconnectServerSocket();

    this._setState({ serverStatus: 'CONNECTING', serverError: '' });
    this.log('info', `Connecting outbound bridge to ${cfg.serverUrl}/obs-agent...`);

    const socket = io(`${cfg.serverUrl}/obs-agent`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: {
        bridgeId: cfg.bridgeId,
        bridgeToken: cfg.bridgeToken,
        label: cfg.label,
        platform: process.platform,
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      this._setState({ serverConnected: true, serverStatus: 'ONLINE', serverError: '' });
      this.log('info', `Connected to MaidanLive Control Room (${cfg.bridgeId}).`);
      this.emitObsSnapshot().catch(() => {});
    });

    socket.on('disconnect', (reason) => {
      this._setState({
        serverConnected: false,
        serverStatus: this.state.bridgeRevoked ? 'REVOKED' : 'OFFLINE',
      });
      this.log('warn', `MaidanLive connection dropped (${reason}). Auto-reconnecting...`);
    });

    socket.on('connect_error', (err) => {
      const msg = String(err?.message || err || 'Connection failed');
      const lower = msg.toLowerCase();
      if (lower.includes('revoked')) {
        this._setState({
          bridgeRevoked: true,
          serverConnected: false,
          serverStatus: 'REVOKED',
          serverError: msg,
        });
        socket.io.opts.reconnection = false;
        this.log('error', msg);
        return;
      }
      this._setState({ serverConnected: false, serverStatus: 'ERROR', serverError: msg });
      this.log('warn', `MaidanLive handshake error: ${msg}`);
    });

    socket.on('server:bridge_revoked', (payload) => {
      const reason = payload?.reason || 'Bridge was revoked by Administrator.';
      this._setState({
        bridgeRevoked: true,
        serverConnected: false,
        serverStatus: 'REVOKED',
        serverError: reason,
      });
      socket.io.opts.reconnection = false;
      this.log('error', reason);
      socket.disconnect();
    });

    socket.on('server:disconnect_bridge', (payload) => {
      const reason = payload?.reason || 'Disconnected by operator from Control Room.';
      this.log('warn', reason);
      socket.disconnect();
    });

    socket.on('server:obs_command', async (req, ack) => {
      const cmd = req?.command;
      try {
        const data = await this.handleCommand(cmd, req?.payload || {});
        if (typeof ack === 'function') ack({ ok: true, data });
      } catch (err) {
        const msg = err?.message || 'OBS command failed.';
        this.log('error', `Command "${String(cmd || '')}" failed: ${msg}`);
        if (typeof ack === 'function') ack({ ok: false, error: msg });
      }
    });
  }

  _bindObsListeners() {
    this.obs.on('ConnectionClosed', (err) => {
      const formatted = this._formatObsConnectError(err);
      this._setState({
        obsConnected: false,
        obsConnecting: false,
        obsStatus: formatted.authFailed ? 'AUTH_REQUIRED' : 'DISCONNECTED',
        obsAuthRequired: formatted.authFailed,
        obsError: formatted.message,
        obsStreamActive: false,
        obsRecordActive: false,
      });
      this.emitObsSnapshot().catch(() => {});
      if (!this.state.bridgeRevoked && this.state.paired) {
        this._scheduleObsReconnect(formatted.authFailed ? 18000 : 4000);
      }
    });

    this.obs.on('CurrentProgramSceneChanged', (ev) => {
      const nextScene = String(ev?.sceneName || '');
      this._setState({ activeObsScene: nextScene });
      this.log('info', `OBS active scene -> "${nextScene}"`);
      this.emitObsSnapshot().catch(() => {});
    });

    this.obs.on('SceneListChanged', () => {
      this.log('info', 'OBS scene list updated — syncing to MaidanLive...');
      this.emitObsSnapshot().catch(() => {});
    });

    this.obs.on('InputCreated', () => {
      this.emitObsSnapshot().catch(() => {});
    });
    this.obs.on('InputRemoved', () => {
      this.emitObsSnapshot().catch(() => {});
    });
    this.obs.on('InputNameChanged', () => {
      this.emitObsSnapshot().catch(() => {});
    });

    this.obs.on('StreamStateChanged', (ev) => {
      const active = Boolean(ev?.outputActive);
      this._setState({ obsStreamActive: active });
      this.log('info', `OBS stream output: ${active ? 'LIVE STREAMING' : 'STOPPED'}`);
      this.emitObsSnapshot().catch(() => {});
    });

    this.obs.on('RecordStateChanged', (ev) => {
      this._setState({ obsRecordActive: Boolean(ev?.outputActive) });
      this.emitObsSnapshot().catch(() => {});
    });
  }

  _formatObsConnectError(err) {
    const code = Number(err?.code);
    const raw = String(err?.message || err || '');
    const cfg = loadConfig();
    if (code === 4009 || raw.toLowerCase().includes('authentication failed')) {
      return {
        authFailed: true,
        message: 'OBS WebSocket password is required or incorrect. Check OBS -> Tools -> WebSocket Server Settings.',
      };
    }
    if (raw.includes('ECONNREFUSED')) {
      return {
        authFailed: false,
        message: `OBS WebSocket is not listening on ${cfg.obsUrl}. Open OBS Studio and enable WebSocket Server (port 4455).`,
      };
    }
    return {
      authFailed: false,
      message: raw || `Unable to reach OBS Studio at ${cfg.obsUrl}.`,
    };
  }

  _scheduleObsReconnect(delayMs = 4000) {
    if (this.obsReconnectTimer || this.state.bridgeRevoked || !this.state.paired) return;
    this.obsReconnectTimer = setTimeout(() => {
      this.obsReconnectTimer = null;
      this.connectObsLoop();
    }, delayMs);
  }

  async reconnectObsNow() {
    if (this.obsReconnectTimer) {
      clearTimeout(this.obsReconnectTimer);
      this.obsReconnectTimer = null;
    }
    await this.obs.disconnect().catch(() => {});
    this._setState({
      obsConnected: false,
      obsConnecting: false,
      obsAuthRequired: false,
    });
    await this.refreshObsEnvironment();
    await this.connectObsLoop();
    return this.getState();
  }

  async connectObsLoop() {
    const cfg = loadConfig();
    if (
      this.state.obsConnected ||
      this.state.obsConnecting ||
      this.state.bridgeRevoked ||
      !hasPairedCredentials(cfg)
    ) {
      return;
    }

    this._setState({ obsConnecting: true, obsStatus: 'CONNECTING' });
    this.emitObsSnapshot().catch(() => {});

    try {
      await this.obs.connect(cfg.obsUrl, cfg.obsPassword || undefined, { rpcVersion: 1 });
      this._setState({
        obsConnected: true,
        obsConnecting: false,
        obsStatus: 'CONNECTED',
        obsAuthRequired: false,
        obsError: '',
      });
      this.log('info', `Connected to local OBS Studio WebSocket v5 (${cfg.obsUrl}).`);
      await this.emitObsSnapshot();
    } catch (err) {
      const formatted = this._formatObsConnectError(err);
      this._setState({
        obsConnected: false,
        obsConnecting: false,
        obsStatus: formatted.authFailed ? 'AUTH_REQUIRED' : 'ERROR',
        obsAuthRequired: formatted.authFailed,
        obsError: formatted.message,
      });
      this.log('warn', formatted.message);
      if (this.socket && this.socket.connected) {
        this.socket.emit('agent:obs_error', { message: formatted.message });
      }
      await this.emitObsSnapshot();
      this._scheduleObsReconnect(formatted.authFailed ? 18000 : 5000);
    }
  }

  async emitObsSnapshot() {
    const mtxStatus = await this.refreshMediaMTXStatus().catch(() => this.state.mediamtx);
    if (!this.state.obsConnected) {
      if (this.socket && this.socket.connected) {
        this.socket.emit('agent:obs_state', {
          bridgeVersion: BRIDGE_VERSION,
          capabilities: BRIDGE_CAPABILITIES,
          connectionStatus: this.state.obsConnecting
            ? 'CONNECTING'
            : this.state.obsError
              ? 'ERROR'
              : 'DISCONNECTED',
          lastError: this.state.obsError || '',
          obsScenes: [],
          obsInputs: [],
          obsMediaStates: {},
          activeObsScene: '',
          obsStreamActive: false,
          mediamtx: mtxStatus,
        });
      }
      return;
    }

    try {
      const [ver, sceneRes, inputRes, streamRes, recordRes, statsRes] = await Promise.all([
        this.obs.call('GetVersion'),
        this.obs.call('GetSceneList'),
        this.obs.call('GetInputList').catch(() => ({ inputs: [] })),
        this.obs
          .call('GetStreamStatus')
          .catch(() => ({ outputActive: false, outputTimecode: '', outputBytes: null, outputDuration: null })),
        this.obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
        this.obs.call('GetStats').catch(() => null),
      ]);

      const scenes = Array.isArray(sceneRes.scenes)
        ? sceneRes.scenes.map((s) => String(s.sceneName || '')).filter(Boolean)
        : [];
      const obsInputs = Array.isArray(inputRes?.inputs)
        ? inputRes.inputs
            .map((inp) => ({
              inputName: String(inp.inputName || '').trim(),
              inputKind: String(inp.inputKind || '').trim(),
              unversionedInputKind: String(inp.unversionedInputKind || '').trim(),
            }))
            .filter((inp) => Boolean(inp.inputName))
        : [];

      const obsMediaStates = {};
      const mediaInputs = obsInputs.filter(
        (inp) =>
          inp.inputKind === 'ffmpeg_source' ||
          inp.unversionedInputKind === 'ffmpeg_source'
      );
      await Promise.all(
        mediaInputs.map(async (inp) => {
          try {
            const st = await this.obs.call('GetMediaInputStatus', { inputName: inp.inputName });
            if (st && st.mediaState) {
              obsMediaStates[inp.inputName] = String(st.mediaState);
            }
          } catch {
            // ignore inputs that do not report media status
          }
        })
      );

      const activeScene = String(sceneRes.currentProgramSceneName || '');

      this._setState({
        obsVersion: String(ver.obsVersion || ''),
        obsWebSocketVersion: String(ver.obsWebSocketVersion || ''),
        activeObsScene: activeScene,
        obsScenes: scenes,
        obsInputs,
        obsStreamActive: Boolean(streamRes.outputActive),
        obsRecordActive: Boolean(recordRes.outputActive),
        obsError: '',
      });

      if (this.socket && this.socket.connected) {
        this.socket.emit('agent:obs_state', {
          bridgeVersion: BRIDGE_VERSION,
          capabilities: BRIDGE_CAPABILITIES,
          connectionStatus: 'CONNECTED',
          lastError: '',
          obsVersion: ver.obsVersion,
          obsWebSocketVersion: ver.obsWebSocketVersion,
          activeObsScene: activeScene,
          obsScenes: scenes,
          obsInputs,
          obsMediaStates,
          mediamtx: mtxStatus,
          obsStreamActive: Boolean(streamRes.outputActive),
          obsStreamTimecode: String(streamRes.outputTimecode || ''),
          obsStreamBytes: typeof streamRes.outputBytes === 'number' ? streamRes.outputBytes : null,
          obsStreamDurationMs:
            typeof streamRes.outputDuration === 'number' ? streamRes.outputDuration : null,
          obsRecordActive: Boolean(recordRes.outputActive),
          obsRecordTimecode: String(recordRes.outputTimecode || ''),
          obsStats: statsRes
            ? {
                cpuUsage: Number(statsRes.cpuUsage || 0),
                activeFps: Number(statsRes.activeFps || 0),
                outputSkippedFrames: Number(statsRes.outputSkippedFrames || 0),
                outputTotalFrames: Number(statsRes.outputTotalFrames || 0),
                averageFrameRenderTime: Number(statsRes.averageFrameRenderTime || 0),
                memoryUsageMb: Number(statsRes.memoryUsage || 0),
              }
            : null,
        });
      }
    } catch (err) {
      if (this.socket && this.socket.connected) {
        this.socket.emit('agent:obs_error', { message: err?.message || 'Failed reading OBS state.' });
      }
    }
  }

  async switchSceneLocally(sceneName) {
    return this.handleCommand('switch_scene', { sceneName });
  }

  async _ensureSceneAndInput(sceneName, inputName, inputKind, inputSettings) {
    const sceneList = await this.obs.call('GetSceneList');
    const exists = Array.isArray(sceneList?.scenes)
      ? sceneList.scenes.some((s) => s.sceneName === sceneName)
      : false;
    if (!exists) {
      await this.obs.call('CreateScene', { sceneName });
    }
    if (!inputName) return null;

    const itemsRes = await this.obs.call('GetSceneItemList', { sceneName });
    const existingItem = Array.isArray(itemsRes?.sceneItems)
      ? itemsRes.sceneItems.find((item) => item.sourceName === inputName)
      : null;
    if (existingItem) {
      if (inputSettings && Object.keys(inputSettings).length > 0 && existingItem.inputKind) {
        await this.obs.call('SetInputSettings', { inputName, inputSettings, overlay: true }).catch(() => {});
      }
      return Number(existingItem.sceneItemId);
    }

    const inputsRes = await this.obs.call('GetInputList').catch(() => ({ inputs: [] }));
    const globalInput = Array.isArray(inputsRes?.inputs)
      ? inputsRes.inputs.find((inp) => inp.inputName === inputName)
      : null;

    if (globalInput) {
      if (inputSettings && Object.keys(inputSettings).length > 0) {
        await this.obs.call('SetInputSettings', { inputName, inputSettings, overlay: true }).catch(() => {});
      }
      const createdItem = await this.obs.call('CreateSceneItem', {
        sceneName,
        sourceName: inputName,
        sceneItemEnabled: true,
      });
      return Number(createdItem.sceneItemId);
    }

    const created = await this.obs.call('CreateInput', {
      sceneName,
      inputName,
      inputKind: inputKind || 'browser_source',
      inputSettings: inputSettings || {},
      sceneItemEnabled: true,
    });
    return Number(created.sceneItemId);
  }

  async handleCommand(command, payload) {
    if (!APPROVED_COMMANDS.has(String(command || ''))) {
      throw new Error(`Rejected unauthorized bridge command: "${String(command || '')}"`);
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Command payload must be a JSON object.');
    }

    if (command === 'reconnect_obs') {
      this.log('info', 'Reconnecting local OBS WebSocket as requested...');
      const next = await this.reconnectObsNow();
      return {
        reconnected: next.obsConnected,
        obsUrl: next.obsUrl,
        lastError: next.obsConnected ? '' : next.obsError,
      };
    }

    if (command === 'mediamtx_status') {
      const mtx = await this.refreshMediaMTXStatus();
      await this.emitObsSnapshot().catch(() => {});
      return {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        mediamtx: mtx,
        logs: getMediaMTXLogs(Number(payload.limit) || 80),
      };
    }

    if (command === 'mediamtx_logs') {
      const mtx = await this.refreshMediaMTXStatus();
      return {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        mediamtx: mtx,
        logs: getMediaMTXLogs(Number(payload.limit) || 120),
      };
    }

    if (command === 'mediamtx_sync_config') {
      const cfg = loadConfig();
      const targetServer = String(payload.serverUrl || cfg.serverUrl || '').trim();
      if (!targetServer) {
        throw new Error('MaidanLive Server URL is not configured on this OBS Bridge.');
      }
      const nextExe = payload.executablePath ? String(payload.executablePath).trim() : cfg.mediamtxPath;
      const nextCfgPath = payload.configPath ? String(payload.configPath).trim() : cfg.mediamtxConfigPath;
      if (payload.executablePath || payload.configPath) {
        const updated = saveConfig({
          ...(payload.executablePath ? { mediamtxPath: nextExe } : {}),
          ...(payload.configPath ? { mediamtxConfigPath: nextCfgPath } : {}),
        });
        this._syncConfigToState(updated);
      }
      const written = writeMediaMTXConfig(targetServer, getUserDataDir(), {
        configuredPath: nextExe,
        configuredConfigPath: nextCfgPath,
      });
      this.log('info', `Synced MediaMTX config (${written.configSource}) at ${written.configPath}`);
      const mtx = await this.refreshMediaMTXStatus();
      await this.emitObsSnapshot().catch(() => {});
      return {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        configPath: written.configPath,
        configSource: written.configSource,
        mediamtx: mtx,
        logs: getMediaMTXLogs(60),
      };
    }

    if (command === 'mediamtx_start') {
      const cfg = loadConfig();
      const targetServer = String(payload.serverUrl || cfg.serverUrl || '').trim();
      const customExe = payload.executablePath ? String(payload.executablePath).trim() : cfg.mediamtxPath;
      const customCfgPath = payload.configPath ? String(payload.configPath).trim() : cfg.mediamtxConfigPath;
      if (payload.executablePath || payload.configPath) {
        const updated = saveConfig({
          ...(payload.executablePath ? { mediamtxPath: customExe } : {}),
          ...(payload.configPath ? { mediamtxConfigPath: customCfgPath } : {}),
        });
        this._syncConfigToState(updated);
      }
      const mtx = await startMediaMTX({
        serverUrl: targetServer,
        configuredPath: customExe,
        configuredConfigPath: customCfgPath,
        userDataDir: getUserDataDir(),
        onLog: (lvl, msg) => this.log(lvl, msg),
      });
      this._setState({ mediamtx: mtx });
      await this.emitObsSnapshot().catch(() => {});
      return {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        mediamtx: mtx,
        logs: getMediaMTXLogs(60),
      };
    }

    if (command === 'mediamtx_stop') {
      const cfg = loadConfig();
      const mtx = await stopMediaMTX({
        configuredPath: cfg.mediamtxPath || '',
        configuredConfigPath: cfg.mediamtxConfigPath || '',
        userDataDir: getUserDataDir(),
        onLog: (lvl, msg) => this.log(lvl, msg),
      });
      this._setState({ mediamtx: mtx });
      await this.emitObsSnapshot().catch(() => {});
      return {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        mediamtx: mtx,
        logs: getMediaMTXLogs(60),
      };
    }

    if (command === 'mediamtx_restart') {
      const cfg = loadConfig();
      const targetServer = String(payload.serverUrl || cfg.serverUrl || '').trim();
      const customExe = payload.executablePath ? String(payload.executablePath).trim() : cfg.mediamtxPath;
      const customCfgPath = payload.configPath ? String(payload.configPath).trim() : cfg.mediamtxConfigPath;
      const mtx = await restartMediaMTX({
        serverUrl: targetServer,
        configuredPath: customExe,
        configuredConfigPath: customCfgPath,
        userDataDir: getUserDataDir(),
        onLog: (lvl, msg) => this.log(lvl, msg),
      });
      this._setState({ mediamtx: mtx });
      await this.emitObsSnapshot().catch(() => {});
      return {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        restarted: true,
        mediamtx: mtx,
        logs: getMediaMTXLogs(60),
      };
    }

    if (!this.state.obsConnected) {
      throw new Error(`OBS Studio is offline at ${this.state.obsUrl}. Open OBS Studio and enable WebSocket v5 (port 4455).`);
    }

    if (command === 'get_snapshot') {
      await this.emitObsSnapshot();
      const [ver, sceneRes, streamRes, recordRes] = await Promise.all([
        this.obs.call('GetVersion'),
        this.obs.call('GetSceneList'),
        this.obs.call('GetStreamStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
        this.obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
      ]);
      return {
        obsVersion: ver.obsVersion,
        obsWebSocketVersion: ver.obsWebSocketVersion,
        activeObsScene: sceneRes.currentProgramSceneName || '',
        obsScenes: Array.isArray(sceneRes.scenes)
          ? sceneRes.scenes.map((s) => String(s.sceneName || '')).filter(Boolean)
          : [],
        obsStreamActive: Boolean(streamRes.outputActive),
        obsRecordActive: Boolean(recordRes.outputActive),
      };
    }

    if (command === 'switch_scene') {
      const sceneName = String(payload.sceneName || '').trim();
      if (!sceneName) throw new Error('sceneName is required.');

      if (payload.ensureInput && payload.ensureInput.inputName) {
        const ensuredItemId = await this._ensureSceneAndInput(
          sceneName,
          String(payload.ensureInput.inputName),
          String(payload.ensureInput.inputKind || 'browser_source'),
          payload.ensureInput.inputSettings || {}
        );
        if (ensuredItemId !== null && payload.ensureTransform) {
          await this._applySceneItemTransformSafe(sceneName, ensuredItemId, payload.ensureTransform);
        }
      }

      if (payload.scoreboardOverlay?.enabled && payload.scoreboardOverlay?.url) {
        const sbItemId = await this._ensureSceneAndInput(
          sceneName,
          String(payload.scoreboardOverlay.sourceName || 'MaidanLive_Scoreboard_Overlay'),
          'browser_source',
          { url: String(payload.scoreboardOverlay.url), width: 1920, height: 1080, reroute_audio: false }
        );
        if (sbItemId !== null) {
          await this.obs
            .call('SetSceneItemEnabled', { sceneName, sceneItemId: sbItemId, sceneItemEnabled: true })
            .catch(() => {});
        }
      }

      if (Number.isFinite(Number(payload.transitionDurationMs))) {
        const dur = Math.max(0, Math.min(5000, Math.round(Number(payload.transitionDurationMs))));
        await this.obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: dur }).catch(() => {});
      }

      this.log('info', `Switching OBS program scene -> "${sceneName}"`);
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      const verified = await this.obs.call('GetCurrentProgramScene');
      if (verified.currentProgramSceneName !== sceneName) {
        throw new Error(
          `OBS scene mismatch: expected "${sceneName}", reported "${verified.currentProgramSceneName}".`
        );
      }
      await this.emitObsSnapshot();
      const listRes = await this.obs.call('GetSceneList');
      return {
        verifiedScene: verified.currentProgramSceneName,
        obsScenes: (listRes.scenes || []).map((s) => String(s.sceneName || '')).filter(Boolean),
      };
    }

    if (command === 'apply_layout') {
      const sceneName = String(payload.sceneName || '').trim();
      if (!sceneName) throw new Error('Target layout sceneName is required.');
      const boxes = Array.isArray(payload.boxes) ? payload.boxes : [];
      const allInputs = Array.isArray(payload.allCameraInputs) ? payload.allCameraInputs : [];

      const sceneList = await this.obs.call('GetSceneList');
      const sceneExists = (sceneList.scenes || []).some((s) => s.sceneName === sceneName);
      if (!sceneExists) {
        await this.obs.call('CreateScene', { sceneName });
      }

      const selectedSet = new Set(boxes.map((b) => b.inputName));
      const currentItemsRes = await this.obs.call('GetSceneItemList', { sceneName });
      const currentItems = currentItemsRes.sceneItems || [];

      for (const item of currentItems) {
        if (allInputs.includes(item.sourceName) && !selectedSet.has(item.sourceName)) {
          await this.obs
            .call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: Number(item.sceneItemId),
              sceneItemEnabled: false,
            })
            .catch(() => {});
        }
      }

      const appliedBoxItems = [];
      for (const box of boxes) {
        if (!box.inputName) continue;
        const itemId = await this._ensureSceneAndInput(
          sceneName,
          String(box.inputName),
          String(box.inputKind || 'browser_source'),
          box.inputSettings || {}
        );
        if (itemId !== null) {
          await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: itemId, sceneItemEnabled: true });
          await this._applySceneItemTransformSafe(sceneName, itemId, box);
          appliedBoxItems.push({ itemId, slotIndex: Number(box.slotIndex) || 0 });
        }
      }

      // Enforce ascending layer order by slotIndex so PIP inset sits above Main feed
      appliedBoxItems.sort((a, b) => a.slotIndex - b.slotIndex);
      for (let idx = 0; idx < appliedBoxItems.length; idx += 1) {
        await this.obs
          .call('SetSceneItemIndex', {
            sceneName,
            sceneItemId: appliedBoxItems[idx].itemId,
            sceneItemIndex: idx,
          })
          .catch(() => {});
      }

      if (payload.scoreboardOverlay?.sourceName && payload.scoreboardOverlay.enabled && payload.scoreboardOverlay.url) {
        const sbName = String(payload.scoreboardOverlay.sourceName);
        const sbId = await this._ensureSceneAndInput(sceneName, sbName, 'browser_source', {
          url: String(payload.scoreboardOverlay.url),
          width: 1920,
          height: 1080,
          reroute_audio: false,
        });
        if (sbId !== null) {
          await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: sbId, sceneItemEnabled: true });
          await this.obs
            .call('SetSceneItemTransform', {
              sceneName,
              sceneItemId: sbId,
              sceneItemTransform: {
                positionX: 0,
                positionY: 0,
                alignment: 5,
                boundsType: 'OBS_BOUNDS_SCALE_INNER',
                boundsAlignment: 0,
                boundsWidth: 1920,
                boundsHeight: 1080,
              },
            })
            .catch(() => {});
          const updatedList = await this.obs.call('GetSceneItemList', { sceneName });
          await this.obs
            .call('SetSceneItemIndex', {
              sceneName,
              sceneItemId: sbId,
              sceneItemIndex: Math.max(0, (updatedList.sceneItems?.length || 1) - 1),
            })
            .catch(() => {});
        }
      }

      if (Number.isFinite(Number(payload.transitionDurationMs))) {
        const dur = Math.max(0, Math.min(5000, Math.round(Number(payload.transitionDurationMs))));
        await this.obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: dur }).catch(() => {});
      }

      this.log('info', `Applying multi-camera layout -> "${sceneName}" (${boxes.length} sources)`);
      await this.obs.call('SetCurrentProgramScene', { sceneName });
      const verified = await this.obs.call('GetCurrentProgramScene');
      if (verified.currentProgramSceneName !== sceneName) {
        throw new Error(`Layout switch verification failed on "${sceneName}".`);
      }
      await this.emitObsSnapshot();
      const listRes = await this.obs.call('GetSceneList');
      return {
        verifiedScene: verified.currentProgramSceneName,
        obsScenes: (listRes.scenes || []).map((s) => String(s.sceneName || '')).filter(Boolean),
      };
    }

    if (command === 'get_input_list') {
      const inputsRes = await this.obs.call('GetInputList').catch(() => ({ inputs: [] }));
      const inputs = Array.isArray(inputsRes?.inputs)
        ? inputsRes.inputs
            .map((inp) => ({
              inputName: String(inp.inputName || '').trim(),
              inputKind: String(inp.inputKind || '').trim(),
              unversionedInputKind: String(inp.unversionedInputKind || '').trim(),
            }))
            .filter((inp) => Boolean(inp.inputName))
        : [];
      return { inputs };
    }

    if (command === 'screenshot') {
      const sourceName = String(payload.sourceName || '').trim();
      if (!sourceName) throw new Error('sourceName is required.');
      const fallbacks = Array.isArray(payload.fallbackSourceNames)
        ? payload.fallbackSourceNames.map((n) => String(n || '').trim()).filter(Boolean)
        : [];
      const candidates = Array.from(new Set([sourceName, ...fallbacks]));
      let lastErr = null;
      for (const candidate of candidates) {
        try {
          const res = await this.obs.call('GetSourceScreenshot', {
            sourceName: candidate,
            imageFormat: 'jpeg',
            imageWidth: 640,
            imageHeight: 360,
            imageCompressionQuality: 70,
          });
          return { imageData: res.imageData };
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error(`Unable to capture screenshot for "${sourceName}".`);
    }

    if (command === 'start_stream') {
      this.log('info', 'Starting OBS stream output...');
      await this.obs.call('StartStream');
      await this.emitObsSnapshot();
      return { obsStreamActive: true };
    }

    if (command === 'stop_stream') {
      this.log('info', 'Stopping OBS stream output...');
      await this.obs.call('StopStream');
      await this.emitObsSnapshot();
      return { obsStreamActive: false };
    }

    if (command === 'start_record') {
      this.log('info', 'Starting OBS local recording...');
      await this.obs.call('StartRecord');
      await this.emitObsSnapshot();
      return { obsRecordActive: true };
    }

    if (command === 'stop_record') {
      this.log('info', 'Stopping OBS local recording...');
      const res = await this.obs.call('StopRecord');
      await this.emitObsSnapshot();
      return { obsRecordActive: false, outputPath: res?.outputPath || '' };
    }

    if (command === 'set_input_mute') {
      const inputName = String(payload.inputName || '').trim();
      const inputMuted = Boolean(payload.inputMuted);
      if (!inputName) throw new Error('inputName is required.');
      await this.obs.call('SetInputMute', { inputName, inputMuted });
      const verify = await this.obs.call('GetInputMute', { inputName }).catch(() => ({ inputMuted }));
      return { inputName, inputMuted: Boolean(verify.inputMuted) };
    }

    if (command === 'get_input_mute') {
      const inputName = String(payload.inputName || '').trim();
      if (!inputName) throw new Error('inputName is required.');
      const res = await this.obs.call('GetInputMute', { inputName });
      return { inputName, inputMuted: Boolean(res.inputMuted) };
    }

    if (command === 'reconnect_input') {
      const sceneName = String(payload.sceneName || '').trim();
      const inputName = String(payload.inputName || '').trim();
      const inputKind = String(payload.inputKind || 'browser_source');
      if (sceneName && inputName) {
        await this._ensureSceneAndInput(
          sceneName,
          inputName,
          inputKind,
          payload.inputSettings || {}
        ).catch(() => {});
      }
      if (inputName) {
        if (inputKind === 'ffmpeg_source') {
          await this.obs
            .call('TriggerMediaInputAction', {
              inputName,
              mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
            })
            .catch(() => {});
        } else {
          await this.obs
            .call('PressInputPropertiesButton', { inputName, propertyName: 'refreshnocache' })
            .catch(() => {});
        }
      }
      await this.emitObsSnapshot();
      return { reconnected: true, inputName };
    }

    if (command === 'remove_input') {
      const inputName = String(payload.inputName || '').trim();
      if (!inputName) throw new Error('inputName is required.');
      await this.obs.call('RemoveInput', { inputName });
      await this.emitObsSnapshot();
      return { removed: true, inputName };
    }

    if (command === 'get_scene_items') {
      let targetScene = String(payload.sceneName || '').trim();
      if (!targetScene) {
        const cur = await this.obs.call('GetCurrentProgramScene');
        targetScene = String(cur?.currentProgramSceneName || '');
      }
      if (!targetScene) throw new Error('No active OBS scene selected.');
      const itemsRes = await this.obs.call('GetSceneItemList', { sceneName: targetScene });
      const items = Array.isArray(itemsRes?.sceneItems)
        ? itemsRes.sceneItems.map((it) => ({
            sceneItemId: Number(it.sceneItemId),
            sourceName: String(it.sourceName || ''),
            sourceType: String(it.sourceType || ''),
            inputKind: String(it.inputKind || ''),
            sceneItemEnabled: Boolean(it.sceneItemEnabled),
            sceneItemLocked: Boolean(it.sceneItemLocked),
          }))
        : [];
      return { sceneName: targetScene, items };
    }

    if (command === 'set_scene_item_enabled') {
      const sceneName = String(payload.sceneName || '').trim();
      const sceneItemId = Number(payload.sceneItemId);
      const enabled = Boolean(payload.enabled);
      if (!sceneName || !Number.isFinite(sceneItemId)) {
        throw new Error('sceneName and valid sceneItemId are required.');
      }
      await this.obs.call('SetSceneItemEnabled', {
        sceneName,
        sceneItemId,
        sceneItemEnabled: enabled,
      });
      const verify = await this.obs
        .call('GetSceneItemEnabled', { sceneName, sceneItemId })
        .catch(() => ({ sceneItemEnabled: enabled }));
      await this.emitObsSnapshot();
      return {
        sceneName,
        sceneItemId,
        sceneItemEnabled: Boolean(verify.sceneItemEnabled),
      };
    }

    if (command === 'update_camera_transform') {
      const inputName = String(payload.inputName || '').trim();
      let sceneName = String(payload.sceneName || '').trim();
      if (!inputName) throw new Error('inputName is required.');
      if (!sceneName) {
        const cur = await this.obs.call('GetCurrentProgramScene');
        sceneName = String(cur?.currentProgramSceneName || '');
      }
      if (!sceneName) throw new Error('No target OBS scene found.');

      const itemsRes = await this.obs.call('GetSceneItemList', { sceneName });
      const items = Array.isArray(itemsRes?.sceneItems) ? itemsRes.sceneItems : [];
      const found = items.find((it) => it.sourceName === inputName);
      let sceneItemId = found ? Number(found.sceneItemId) : null;
      if (sceneItemId === null && payload.ensureInput) {
        sceneItemId = await this._ensureSceneAndInput(
          sceneName,
          inputName,
          String(payload.ensureInput.inputKind || 'browser_source'),
          payload.ensureInput.inputSettings || {}
        );
      }
      if (sceneItemId === null) {
        throw new Error(`Source "${inputName}" is not inside OBS scene "${sceneName}".`);
      }

      const appliedTransform = await this._applySceneItemTransformSafe(sceneName, sceneItemId, {
        x: Number(payload.x ?? 0),
        y: Number(payload.y ?? 0),
        width: Number(payload.width ?? 1920),
        height: Number(payload.height ?? 1080),
        rotation: Number(payload.rotation ?? 0),
        previewFit: String(payload.previewFit || 'contain'),
      });
      await this.emitObsSnapshot();
      return { sceneName, sceneItemId, inputName, transform: appliedTransform };
    }

    if (command === 'get_scene_transforms') {
      let targetScene = String(payload.sceneName || '').trim();
      if (!targetScene) {
        const cur = await this.obs.call('GetCurrentProgramScene');
        targetScene = String(cur?.currentProgramSceneName || '');
      }
      if (!targetScene) throw new Error('No active OBS scene selected.');
      const itemsRes = await this.obs.call('GetSceneItemList', { sceneName: targetScene });
      const items = Array.isArray(itemsRes?.sceneItems) ? itemsRes.sceneItems : [];
      const transforms = [];
      for (const it of items) {
        try {
          const tRes = await this.obs.call('GetSceneItemTransform', {
            sceneName: targetScene,
            sceneItemId: Number(it.sceneItemId),
          });
          const t = tRes?.sceneItemTransform || {};
          transforms.push({
            sceneItemId: Number(it.sceneItemId),
            sourceName: String(it.sourceName || ''),
            sourceWidth: Number(t.sourceWidth || 0),
            sourceHeight: Number(t.sourceHeight || 0),
            width: Number(t.width || 0),
            height: Number(t.height || 0),
            rotation: Number(t.rotation || 0),
            boundsType: String(t.boundsType || ''),
            boundsWidth: Number(t.boundsWidth || 0),
            boundsHeight: Number(t.boundsHeight || 0),
            positionX: Number(t.positionX || 0),
            positionY: Number(t.positionY || 0),
          });
        } catch {
          // Skip non-transformable audio/filter items cleanly
        }
      }
      return { sceneName: targetScene, transforms };
    }

    throw new Error(`Unsupported command: ${command}`);
  }

  async _applySceneItemTransformSafe(sceneName, sceneItemId, box) {
    const transform = buildCenterBoxTransform(box);
    try {
      await this.obs.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId,
        sceneItemTransform: transform,
      });
      return transform;
    } catch {
      const { cropToBounds: _omit, ...fallbackTransform } = transform;
      await this.obs.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId,
        sceneItemTransform: fallbackTransform,
      });
      return fallbackTransform;
    }
  }

  async shutdown() {
    if (this.obsReconnectTimer) clearTimeout(this.obsReconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.envPollTimer) clearInterval(this.envPollTimer);
    this.disconnectServerSocket();
    await stopMediaMTX({ onlyManaged: true }).catch(() => {});
    await this.obs.disconnect().catch(() => {});
  }
}

module.exports = {
  BridgeEngine,
  BRIDGE_VERSION,
  BRIDGE_CAPABILITIES,
  APPROVED_COMMANDS,
};
