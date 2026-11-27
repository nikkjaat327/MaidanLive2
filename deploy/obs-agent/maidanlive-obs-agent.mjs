#!/usr/bin/env node
/**
 * MaidanLive Windows Local OBS Bridge / Agent
 * Runs locally on the broadcaster's Windows/macOS/Linux PC alongside OBS Studio 28+.
 * - Connects locally ONLY to OBS WebSocket v5 (default ws://127.0.0.1:4455)
 * - Initiates an authenticated outbound Socket.IO connection to MaidanLive (/obs-agent)
 * - Strictly allowlists OBS commands; zero shell execution or unrestricted OS access.
 * - Never exposes OBS passwords or bridge tokens to logs or the frontend.
 */

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';

const OBS_EVENT_SUBSCRIPTIONS =
  ((EventSubscription && EventSubscription.All) || 4095) |
  ((EventSubscription && EventSubscription.InputVolumeMeters) || 65536);

const AGENT_PKG = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  } catch {
    return { version: '1.0.0' };
  }
})();
const BRIDGE_VERSION = String(AGENT_PKG?.version || '1.0.0');
const BRIDGE_CAPABILITIES = [
  'obs_control',
  'obs_scene_switching',
  'obs_scene_transition',
  'obs_audio_meter',
  'obs_layout_control',
  'mediamtx_control',
  'mediamtx_detect',
  'mediamtx_start',
  'mediamtx_stop',
  'mediamtx_sync_config',
];

const APPROVED_COMMANDS = new Set([
  'get_snapshot',
  'switch_scene',
  'trigger_transition',
  'set_studio_mode',
  'set_preview_scene',
  'set_primary_audio_input',
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
  'disconnect_obs',
  'mediamtx_status',
  'mediamtx_start',
  'mediamtx_stop',
  'mediamtx_sync_config',
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

async function applySceneItemTransformSafe(sceneName, sceneItemId, box) {
  const transform = buildCenterBoxTransform(box);
  try {
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: transform,
    });
    return transform;
  } catch {
    const { cropToBounds: _omit, ...fallbackTransform } = transform;
    await obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: fallbackTransform,
    });
    return fallbackTransform;
  }
}

function nowIso() {
  return new Date().toISOString();
}
function logInfo(msg) {
  console.log(`[${nowIso()}] [MaidanLive Bridge] ${msg}`);
}
function logWarn(msg) {
  console.warn(`[${nowIso()}] [MaidanLive Bridge] WARN: ${msg}`);
}
function logErr(msg) {
  console.error(`[${nowIso()}] [MaidanLive Bridge] ERROR: ${msg}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const name = key.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[name] = next;
        i += 1;
      } else {
        out[name] = 'true';
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
let fileConfig = {};
const configPath = args.config
  ? path.resolve(process.cwd(), String(args.config))
  : path.join(scriptDir, 'config.json');

if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      fileConfig = parsed;
      logInfo(`Loaded bridge configuration from ${path.basename(configPath)}.`);
    }
  } catch (err) {
    logWarn(`Could not parse ${path.basename(configPath)}: ${err?.message || err}`);
  }
}

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = String(
  args.server ||
    process.env.MAIDANLIVE_SERVER_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.MAIDANLIVE_URL ||
    fileConfig.serverUrl ||
    `http://127.0.0.1:${DEFAULT_PORT}`
)
  .trim()
  .replace(/\/+$/, '');

const BRIDGE_ID = String(
  args.bridge || process.env.MAIDANLIVE_BRIDGE_ID || fileConfig.bridgeId || ''
)
  .trim()
  .toUpperCase();

const BRIDGE_TOKEN = String(
  args['bridge-token'] ||
    args.token ||
    process.env.MAIDANLIVE_BRIDGE_TOKEN ||
    fileConfig.bridgeToken ||
    ''
).trim();

const MATCH_ID = String(
  args.match || process.env.MAIDANLIVE_MATCH_ID || fileConfig.matchId || ''
).trim();

const AGENT_TOKEN = String(
  args.token ||
    process.env.MAIDANLIVE_AGENT_TOKEN ||
    fileConfig.agentToken ||
    BRIDGE_TOKEN ||
    ''
).trim();

const OBS_URL = String(
  args['obs-url'] || process.env.OBS_WS_URL || fileConfig.obsUrl || 'ws://127.0.0.1:4455'
).trim();

const OBS_PASSWORD = String(
  args['obs-password'] || process.env.OBS_WS_PASSWORD || fileConfig.obsPassword || ''
);

const AGENT_LABEL = String(
  args.label ||
    process.env.OBS_AGENT_LABEL ||
    fileConfig.label ||
    `${os.hostname()} (${process.platform})`
).trim();

const useRegisteredBridgeAuth = Boolean(BRIDGE_ID && BRIDGE_TOKEN);
const useLegacyMatchAuth = Boolean(MATCH_ID && AGENT_TOKEN);

if (!useRegisteredBridgeAuth && !useLegacyMatchAuth) {
  logErr(
    'Missing bridge credentials.\n' +
      'Provide either:\n' +
      '  1) Registered Bridge: --server <url> --bridge <ML-BRG-XXXXXX> --token <bridgeToken>\n' +
      '  2) Match Agent:       --server <url> --match <matchId> --token <agentToken>\n' +
      'Or store them in deploy/obs-agent/config.json.'
  );
  process.exit(1);
}

try {
  const parsedObs = new URL(OBS_URL);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsedObs.hostname)) {
    logWarn(
      `OBS URL host "${parsedObs.hostname}" is not loopback. Recommended OBS address is ws://127.0.0.1:4455.`
    );
  }
} catch {
  logErr(`Invalid OBS WebSocket URL: ${OBS_URL}`);
  process.exit(1);
}

const obs = new OBSWebSocket();
let obsConnected = false;
let obsConnecting = false;
let lastError = '';
let obsReconnectTimer = null;
let serverReconnectTimer = null;
let bridgeRevoked = false;
let adminDisconnected = false;
let obsManuallyDisconnected = false;
let isHeartbeatRunning = false;
let isSnapshotRunning = false;
let obsSnapshotFailures = 0;
let obsStreamActiveCache = false;
let lastObsScenesCache = [];
let lastActiveObsSceneCache = '';
let lastPreviewObsSceneCache = '';
let studioModeEnabledCache = false;
let currentTransitionNameCache = '';
let currentTransitionDurationMsCache = 300;
let obsTransitionsCache = [];
let obsInputsCache = [];
let specialInputsCache = {};
let primaryAudioInputPref = String(
  args['primary-audio'] || process.env.OBS_PRIMARY_AUDIO_INPUT || fileConfig.primaryAudioInput || ''
).trim();
const audioMuteMap = new Map();
const audioPeakHoldMap = new Map();
let latestMeterInputs = [];
let lastSocketAudioEmitAt = 0;
let obsReconnectAttempts = 0;
let serverReconnectAttempts = 0;
let missedHeartbeats = 0;
let serverDisconnectedAt = 0;
let obsDisconnectedAt = 0;

const AUDIO_MIN_DB = -60;
const AUDIO_PEAK_HOLD_MS = 1400;
const AUDIO_SOCKET_EMIT_INTERVAL_MS = 200;

function linearMulToDb(mul) {
  const num = Number(mul);
  if (!Number.isFinite(num) || num <= 0.0001) return AUDIO_MIN_DB;
  const db = 20 * Math.log10(num);
  if (!Number.isFinite(db)) return AUDIO_MIN_DB;
  return Math.max(AUDIO_MIN_DB, Math.min(0, Math.round(db * 10) / 10));
}

function isLikelyAudioInput(input, specialInputs = {}) {
  const name = String(input?.inputName || '').trim();
  if (!name) return false;
  if (Object.values(specialInputs || {}).some((v) => typeof v === 'string' && v.trim() === name)) {
    return true;
  }
  const kind = `${String(input?.inputKind || '')} ${String(input?.unversionedInputKind || '')}`.toLowerCase();
  return (
    kind.includes('wasapi_') ||
    kind.includes('coreaudio_') ||
    kind.includes('pulse_') ||
    kind.includes('alsa_') ||
    kind.includes('jack_') ||
    kind.includes('audio') ||
    kind.includes('ffmpeg_source') ||
    kind.includes('vlc_source') ||
    kind.includes('browser_source') ||
    kind.includes('dshow_input') ||
    kind.includes('ndi_source')
  );
}

function selectPrimaryAudioInput(meterInputs = [], obsInputs = []) {
  const names = new Set();
  for (const m of meterInputs || []) {
    if (m?.inputName && String(m.inputName).trim()) names.add(String(m.inputName).trim());
  }
  for (const v of Object.values(specialInputsCache || {})) {
    if (typeof v === 'string' && v.trim()) names.add(v.trim());
  }
  for (const inp of obsInputs || []) {
    if (isLikelyAudioInput(inp, specialInputsCache)) names.add(String(inp.inputName).trim());
  }
  const availableAudioInputs = Array.from(names);
  if (primaryAudioInputPref && availableAudioInputs.includes(primaryAudioInputPref)) {
    return { primaryInputName: primaryAudioInputPref, availableAudioInputs };
  }
  const mics = [specialInputsCache?.mic1, specialInputsCache?.mic2, specialInputsCache?.mic3];
  for (const mic of mics) {
    const clean = typeof mic === 'string' ? mic.trim() : '';
    if (clean && availableAudioInputs.includes(clean)) {
      return { primaryInputName: clean, availableAudioInputs };
    }
  }
  return {
    primaryInputName: availableAudioInputs[0] || primaryAudioInputPref || '',
    availableAudioInputs,
  };
}

function evaluateAudioReadiness({ connected, inputName, muted, peakDb, clipping }) {
  if (!connected) return { status: 'OFFLINE', label: 'OBS Offline', readyForLive: false };
  if (!inputName) return { status: 'OFFLINE', label: 'No Audio Input Detected', readyForLive: false };
  if (muted) return { status: 'MUTED', label: 'Muted in OBS — Unmute Before Live', readyForLive: false };
  if (clipping || peakDb >= -1.5) return { status: 'CLIPPING', label: 'Clipping! Lower Gain Below -3 dB', readyForLive: false };
  if (peakDb >= -20) return { status: 'OPTIMAL', label: 'Broadcast Audio Ready (-20 to -3 dB)', readyForLive: true };
  if (peakDb >= -45) return { status: 'LOW', label: 'Low Level — Aim for -18 to -6 dB', readyForLive: true };
  return { status: 'SILENT', label: 'No Audio Signal Detected', readyForLive: false };
}

function buildAudioMeterState(meterInputs = [], obsInputs = obsInputsCache, nowMs = Date.now()) {
  const { primaryInputName, availableAudioInputs } = selectPrimaryAudioInput(meterInputs, obsInputs);
  if (!obsConnected) {
    const readiness = evaluateAudioReadiness({
      connected: false,
      inputName: primaryInputName,
      muted: false,
      peakDb: AUDIO_MIN_DB,
      clipping: false,
    });
    return {
      obsConnected: false,
      primaryInputName,
      availableAudioInputs,
      channelsDb: [AUDIO_MIN_DB, AUDIO_MIN_DB],
      magnitudeDb: AUDIO_MIN_DB,
      peakDb: AUDIO_MIN_DB,
      peakHoldDb: AUDIO_MIN_DB,
      muted: false,
      clipping: false,
      ...readiness,
      updatedAtMs: nowMs,
    };
  }
  const matched = (meterInputs || []).find((m) => String(m?.inputName || '').trim() === primaryInputName);
  const rawLevels = Array.isArray(matched?.inputLevelsMul) ? matched.inputLevelsMul : [];
  const left = Array.isArray(rawLevels[0]) ? rawLevels[0] : [0, 0, 0];
  const right = Array.isArray(rawLevels[1]) ? rawLevels[1] : left;
  const chDb = [linearMulToDb(left[1] ?? left[0] ?? 0), linearMulToDb(right[1] ?? right[0] ?? 0)];
  const magDb = Math.max(linearMulToDb(left[0] ?? 0), linearMulToDb(right[0] ?? 0));
  const peakLinear = Math.max(Number(left[1] ?? 0), Number(right[1] ?? 0), Number(left[2] ?? 0), Number(right[2] ?? 0));
  const peakDb = Math.max(chDb[0], chDb[1]);

  const prevHold = audioPeakHoldMap.get(primaryInputName) || { db: AUDIO_MIN_DB, ts: nowMs };
  let nextHoldDb = prevHold.db;
  let nextHoldTs = prevHold.ts;
  if (peakDb >= prevHold.db) {
    nextHoldDb = peakDb;
    nextHoldTs = nowMs;
  } else if (nowMs - prevHold.ts > AUDIO_PEAK_HOLD_MS) {
    const elapsedSec = (nowMs - prevHold.ts - AUDIO_PEAK_HOLD_MS) / 1000;
    nextHoldDb = Math.max(peakDb, Math.round((prevHold.db - elapsedSec * 14) * 10) / 10);
  }
  audioPeakHoldMap.set(primaryInputName, { db: nextHoldDb, ts: nextHoldTs });

  const muted = Boolean(audioMuteMap.get(primaryInputName));
  const clipping = !muted && (peakDb >= -1.5 || peakLinear >= 0.985);
  const readiness = evaluateAudioReadiness({ connected: true, inputName: primaryInputName, muted, peakDb, clipping });
  return {
    obsConnected: true,
    primaryInputName,
    availableAudioInputs,
    channelsDb: chDb,
    magnitudeDb: magDb,
    peakDb,
    peakHoldDb: Math.max(AUDIO_MIN_DB, Math.min(0, nextHoldDb)),
    muted,
    clipping,
    ...readiness,
    updatedAtMs: nowMs,
  };
}

const HEARTBEAT_INTERVAL_MS = Math.max(2000, Number(process.env.OBS_BRIDGE_HEARTBEAT_INTERVAL_MS) || 5000);
const HEARTBEAT_ACK_TIMEOUT_MS = Math.max(3000, Number(process.env.OBS_BRIDGE_HEARTBEAT_ACK_TIMEOUT_MS) || 10000);
const HEARTBEAT_LOST_MS = Math.max(10000, Number(process.env.OBS_BRIDGE_HEARTBEAT_LOST_MS) || 20000);
const HEARTBEAT_OFFLINE_MS = Math.max(20000, Number(process.env.OBS_BRIDGE_HEARTBEAT_OFFLINE_MS) || 45000);

function computeBackoffMs(attempt, baseMs = 1500, maxMs = 30000, jitterRatio = 0.25) {
  const exp = Math.min(maxMs, Math.round(baseMs * Math.pow(1.8, Math.max(0, attempt))));
  const delta = exp * jitterRatio;
  return Math.max(500, Math.round(exp + (Math.random() * 2 - 1) * delta));
}

function withTimeout(promise, timeoutMs, label = 'OBS call') {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Single-instance PID lockfile guard to prevent duplicate CLI Bridge processes
const lockKey = (BRIDGE_ID || MATCH_ID || 'default').replace(/[^A-Za-z0-9_-]/g, '_');
const lockFilePath = path.join(os.tmpdir(), `maidanlive-obs-agent-${lockKey}.lock`);
try {
  if (fs.existsSync(lockFilePath)) {
    const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8').trim());
    if (Number.isFinite(existingPid) && existingPid > 0 && existingPid !== process.pid) {
      let alive = false;
      try {
        process.kill(existingPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
      if (alive) {
        logErr(`Another MaidanLive OBS Bridge instance (PID ${existingPid}) is already running for ${lockKey}. Exiting duplicate instance.`);
        process.exit(0);
      }
    }
  }
  fs.writeFileSync(lockFilePath, String(process.pid), { encoding: 'utf8', mode: 0o600 });
} catch {
  // Non-fatal if temp lock cannot be written
}
function cleanupLockFile() {
  try {
    if (fs.existsSync(lockFilePath) && fs.readFileSync(lockFilePath, 'utf8').trim() === String(process.pid)) {
      fs.unlinkSync(lockFilePath);
    }
  } catch {
    // Ignore cleanup error
  }
}

const socketAuth = useRegisteredBridgeAuth
  ? {
      bridgeId: BRIDGE_ID,
      bridgeToken: BRIDGE_TOKEN,
      label: AGENT_LABEL,
      platform: process.platform,
      bridgeVersion: BRIDGE_VERSION,
      capabilities: BRIDGE_CAPABILITIES,
      manualResume: true,
    }
  : {
      matchId: MATCH_ID,
      agentToken: AGENT_TOKEN,
      label: AGENT_LABEL,
      platform: process.platform,
      bridgeVersion: BRIDGE_VERSION,
      capabilities: BRIDGE_CAPABILITIES,
      manualResume: true,
    };

logInfo(
  `Starting MaidanLive OBS Bridge (${useRegisteredBridgeAuth ? `Bridge ${BRIDGE_ID}` : `Match ${MATCH_ID}`}) -> Server: ${SERVER_URL} | Local OBS: ${OBS_URL}`
);

const socket = io(`${SERVER_URL}/obs-agent`, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: socketAuth,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
  reconnectionDelayMax: 30000,
  randomizationFactor: 0.25,
  timeout: 20000,
});

function emitDiagnostic(level, category, message, reason = '') {
  const payload = {
    timestamp: nowIso(),
    level,
    category,
    message,
    reason,
    reconnectAttempts: serverReconnectAttempts + obsReconnectAttempts,
  };
  if (level === 'error') logErr(`[${category}] ${message}`);
  else if (level === 'warn') logWarn(`[${category}] ${message}`);
  else logInfo(`[${category}] ${message}`);
  if (socket.connected && !bridgeRevoked) {
    try {
      socket.emit('agent:diagnostic', payload);
    } catch {
      // Ignore while socket dropping
    }
  }
}

function formatObsConnectError(err) {
  const code = Number(err?.code);
  const raw = String(err?.message || err || '');
  if (code === 4009 || raw.toLowerCase().includes('authentication failed')) {
    return 'OBS WebSocket authentication failed. Check obsPassword in config.json (must match OBS -> Tools -> WebSocket Server Settings).';
  }
  if (raw.includes('ECONNREFUSED')) {
    return `OBS Studio WebSocket is not listening at ${OBS_URL}. Ensure OBS Studio 28+ is open and WebSocket server is enabled on port 4455.`;
  }
  return raw || `Unable to reach OBS at ${OBS_URL}`;
}

let managedMtxChild = null;
let managedMtxPid = null;
let lastMtxError = '';
let lastMtxStartedAt = null;
const MANAGED_MTX_CONFIG_PATH = path.join(scriptDir, 'mediamtx.yml');

function isValidMediaMTXBinary(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const base = path.basename(trimmed).toLowerCase();
  if (base !== 'mediamtx' && base !== 'mediamtx.exe') return false;
  try {
    return fs.existsSync(trimmed) && fs.statSync(trimmed).isFile();
  } catch {
    return false;
  }
}

let cachedPathLookup = { ts: 0, binName: '', result: '' };

function findMediaMTXExecutable(configuredPath = '') {
  const candidates = [];
  if (configuredPath) candidates.push(configuredPath);
  if (process.env.MEDIAMTX_BIN) candidates.push(process.env.MEDIAMTX_BIN);
  if (fileConfig.mediamtxPath) candidates.push(String(fileConfig.mediamtxPath));

  const binName = process.platform === 'win32' ? 'mediamtx.exe' : 'mediamtx';
  candidates.push(path.join(scriptDir, binName));
  candidates.push(path.join(scriptDir, 'mediamtx', binName));
  candidates.push(path.resolve(scriptDir, '..', 'mediamtx', binName));
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'mediamtx', 'mediamtx.exe'));
      candidates.push(path.join(localAppData, 'mediamtx', 'mediamtx.exe'));
    }
    if (userProfile) {
      candidates.push(path.join(userProfile, 'Downloads', 'mediamtx.exe'));
      candidates.push(path.join(userProfile, 'mediamtx', 'mediamtx.exe'));
    }
    candidates.push('C:\\MediaMTX\\mediamtx.exe');
    candidates.push('C:\\mediamtx\\mediamtx.exe');
    candidates.push(path.join(programFiles, 'MediaMTX', 'mediamtx.exe'));
    candidates.push(path.join(programFiles, 'mediamtx', 'mediamtx.exe'));
    candidates.push('C:\\MaidanLive\\mediamtx\\mediamtx.exe');
  } else {
    candidates.push('/usr/local/bin/mediamtx', '/usr/bin/mediamtx', '/opt/homebrew/bin/mediamtx');
  }

  for (const c of candidates) {
    if (isValidMediaMTXBinary(c)) return path.resolve(c);
  }

  const now = Date.now();
  if (cachedPathLookup.binName === binName && now - cachedPathLookup.ts < 60_000) {
    if (cachedPathLookup.result && isValidMediaMTXBinary(cachedPathLookup.result)) {
      return cachedPathLookup.result;
    }
    if (!cachedPathLookup.result) return '';
  }

  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const out = execFileSync(cmd, [binName], { encoding: 'utf8', timeout: 1500, windowsHide: true });
    const first = String(out || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    const resolved = first && isValidMediaMTXBinary(first) ? path.resolve(first) : '';
    cachedPathLookup = { ts: now, binName, result: resolved };
    if (resolved) return resolved;
  } catch {
    cachedPathLookup = { ts: now, binName, result: '' };
  }
  return '';
}

function checkLocalTcpPort(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

function buildMediaMTXYamlText(targetServerUrl) {
  const cleanServer = String(targetServerUrl || SERVER_URL || 'http://127.0.0.1:3000')
    .trim()
    .replace(/\/+$/, '');
  const parsed = new URL(cleanServer);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Server URL must start with http:// or https://');
  }
  return `# Auto-generated MaidanLive Local MediaMTX Configuration
logLevel: info
logDestinations: [stdout]

api: yes
apiAddress: 127.0.0.1:9997

authMethod: http
authHTTPAddress: ${cleanServer}/api/v1/mediamtx/auth
authHTTPExclude:
  - action: api
  - action: metrics

rtmp: yes
rtmpAddress: :1935
rtmpEncryption: "no"

srt: yes
srtAddress: :8890

hls: yes
hlsAddress: :8888
hlsVariant: lowLatency
hlsSegmentCount: 7
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
hlsAllowOrigin: '*'

webrtc: yes
webrtcAddress: :8889
webrtcAllowOrigin: '*'

paths:
  all_others:
    source: publisher
    sourceOnDemand: no
    readTimeout: 15s
    writeTimeout: 15s
    record: no
`;
}

function writeManagedMediaMTXConfig(targetServerUrl) {
  const yaml = buildMediaMTXYamlText(targetServerUrl);
  fs.writeFileSync(MANAGED_MTX_CONFIG_PATH, yaml, { encoding: 'utf8', mode: 0o600 });
  return { configPath: MANAGED_MTX_CONFIG_PATH, yaml };
}

async function probeLocalMediaMTX(configuredPath = '') {
  const apiBase = (process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997').trim().replace(/\/+$/, '');
  const lanIps = [];
  try {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const info of entries || []) {
        if (info.family === 'IPv4' && !info.internal && info.address) lanIps.push(info.address);
      }
    }
  } catch {
    // ignore
  }
  const executablePath = findMediaMTXExecutable(configuredPath);
  const [rtmpPortOpen, srtPortOpen, apiPortOpen, apiResult] = await Promise.all([
    checkLocalTcpPort('127.0.0.1', 1935),
    checkLocalTcpPort('127.0.0.1', 8890),
    checkLocalTcpPort('127.0.0.1', 9997),
    (async () => {
      try {
        const res = await fetch(`${apiBase}/v3/paths/list`, {
          method: 'GET',
          signal: AbortSignal.timeout(1000),
        });
        if (!res.ok) return { reachable: false, paths: [] };
        const json = await res.json().catch(() => ({}));
        const activePaths = Array.isArray(json?.items)
          ? json.items
              .map((item) => ({
                name: String(item?.name || '').trim(),
                ready: Boolean(item?.ready),
                sourceType: String(item?.source?.type || '').trim(),
                bytesReceived: Number(item?.bytesReceived || 0),
                readersCount: Array.isArray(item?.readers) ? item.readers.length : 0,
              }))
              .filter((p) => Boolean(p.name))
          : [];
        return { reachable: true, paths: activePaths };
      } catch {
        return { reachable: false, paths: [] };
      }
    })(),
  ]);

  const managedRunning = Boolean(
    managedMtxChild && managedMtxChild.exitCode === null && !managedMtxChild.killed
  );
  const running = Boolean(managedRunning || apiResult.reachable || rtmpPortOpen);

  return {
    installed: Boolean(executablePath),
    executablePath,
    running,
    managedByBridge: managedRunning,
    managedPid: managedMtxPid,
    rtmpPortOpen,
    srtPortOpen,
    apiPortOpen,
    apiReachable: apiResult.reachable,
    activePaths: apiResult.paths,
    activePathCount: apiResult.paths.length,
    lanIps: Array.from(new Set(lanIps)),
    configPath: fs.existsSync(MANAGED_MTX_CONFIG_PATH) ? MANAGED_MTX_CONFIG_PATH : '',
    lastStartedAt: lastMtxStartedAt,
    lastError: lastMtxError,
  };
}

async function startLocalMediaMTX(targetServerUrl, configuredPath = '') {
  const exePath = findMediaMTXExecutable(configuredPath);
  if (!exePath) {
    const msg =
      'MediaMTX executable (mediamtx.exe) was not found on this PC. Place mediamtx.exe in C:\\mediamtx\\ or deploy/obs-agent/, OR download mediamtx.yml from MaidanLive and run mediamtx.exe manually.';
    lastMtxError = msg;
    throw new Error(msg);
  }
  const current = await probeLocalMediaMTX(exePath);
  if (current.running) {
    return current;
  }
  const { configPath } = writeManagedMediaMTXConfig(targetServerUrl || SERVER_URL);
  lastMtxError = '';
  const child = spawn(exePath, [configPath], {
    cwd: path.dirname(configPath),
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  managedMtxChild = child;
  managedMtxPid = child.pid || null;
  lastMtxStartedAt = new Date().toISOString();

  child.stdout?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) logInfo(`[MediaMTX] ${line.slice(0, 240)}`);
  });
  child.stderr?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) {
      lastMtxError = line.slice(0, 240);
      logWarn(`[MediaMTX] ${lastMtxError}`);
    }
  });
  child.on('exit', (code) => {
    logInfo(`[MediaMTX] Process exited (code ${code ?? 'null'}).`);
    if (managedMtxChild === child) {
      managedMtxChild = null;
      managedMtxPid = null;
    }
  });
  child.on('error', (err) => {
    lastMtxError = err?.message || 'Failed to launch MediaMTX.';
    logErr(`[MediaMTX] ${lastMtxError}`);
    if (managedMtxChild === child) {
      managedMtxChild = null;
      managedMtxPid = null;
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 900));
  return await probeLocalMediaMTX(exePath);
}

async function stopLocalMediaMTX() {
  if (managedMtxChild && managedMtxChild.exitCode === null && !managedMtxChild.killed) {
    try {
      managedMtxChild.kill('SIGTERM');
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (managedMtxChild && managedMtxChild.exitCode === null && !managedMtxChild.killed) {
      try {
        managedMtxChild.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }
  managedMtxChild = null;
  managedMtxPid = null;
  return await probeLocalMediaMTX();
}

async function emitObsSnapshot() {
  if (!socket.connected || isSnapshotRunning) return;
  isSnapshotRunning = true;
  try {
    const mtxStatus = await probeLocalMediaMTX();
    if (!obsConnected) {
      const obsLostMs = obsDisconnectedAt ? Date.now() - obsDisconnectedAt : 0;
      const nonManualState =
        obsLostMs >= HEARTBEAT_LOST_MS || obsReconnectAttempts >= 3
          ? 'CONNECTION_LOST'
          : 'RECONNECTING';
      const obsState = obsManuallyDisconnected ? 'DISCONNECTED' : nonManualState;
      socket.emit('agent:obs_state', {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        manualDisconnect: obsManuallyDisconnected,
        connectionStatus: obsState,
        obsConnectionState: obsManuallyDisconnected ? 'OFFLINE' : nonManualState,
        reconnectAttempts: serverReconnectAttempts + obsReconnectAttempts,
        lastError,
        obsScenes: lastObsScenesCache,
        obsInputs: [],
        obsMediaStates: {},
        activeObsScene: lastActiveObsSceneCache,
        previewObsScene: lastPreviewObsSceneCache,
        studioModeEnabled: studioModeEnabledCache,
        currentTransitionName: currentTransitionNameCache,
        currentTransitionDurationMs: currentTransitionDurationMsCache,
        obsTransitions: obsTransitionsCache,
        primaryAudioInput: primaryAudioInputPref,
        audioMeter: buildAudioMeterState([], []),
        obsStreamActive: obsManuallyDisconnected ? false : obsStreamActiveCache,
        mediamtx: mtxStatus,
      });
      return;
    }

    try {
      const [
        ver,
        sceneRes,
        inputRes,
        streamRes,
        recordRes,
        statsRes,
        studioRes,
        transitionListRes,
        currentTransitionRes,
        specialInputsRes,
      ] = await Promise.all([
        withTimeout(obs.call('GetVersion'), 6000, 'GetVersion'),
        withTimeout(obs.call('GetSceneList'), 6000, 'GetSceneList'),
        withTimeout(obs.call('GetInputList'), 6000, 'GetInputList').catch(() => ({ inputs: [] })),
        withTimeout(obs.call('GetStreamStatus'), 6000, 'GetStreamStatus')
          .catch(() => ({ outputActive: false, outputTimecode: '', outputBytes: null, outputDuration: null })),
        withTimeout(obs.call('GetRecordStatus'), 6000, 'GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
        withTimeout(obs.call('GetStats'), 6000, 'GetStats').catch(() => null),
        withTimeout(obs.call('GetStudioModeEnabled'), 6000, 'GetStudioModeEnabled').catch(() => ({
          studioModeEnabled: studioModeEnabledCache,
        })),
        withTimeout(obs.call('GetSceneTransitionList'), 6000, 'GetSceneTransitionList').catch(() => ({
          currentSceneTransitionName: '',
          transitions: [],
        })),
        withTimeout(obs.call('GetCurrentSceneTransition'), 6000, 'GetCurrentSceneTransition').catch(() => ({
          transitionName: '',
          transitionDuration: 300,
        })),
        withTimeout(obs.call('GetSpecialInputs'), 6000, 'GetSpecialInputs').catch(() => ({})),
      ]);

      studioModeEnabledCache = Boolean(studioRes?.studioModeEnabled);
      if (studioModeEnabledCache) {
        const prevRes = await withTimeout(obs.call('GetCurrentPreviewScene'), 6000, 'GetCurrentPreviewScene').catch(
          () => ({ currentPreviewSceneName: '' })
        );
        lastPreviewObsSceneCache = String(prevRes?.currentPreviewSceneName || prevRes?.sceneName || '');
      } else {
        lastPreviewObsSceneCache = '';
      }

      specialInputsCache =
        specialInputsRes && typeof specialInputsRes === 'object' ? specialInputsRes : {};

      obsSnapshotFailures = 0;
      obsStreamActiveCache = Boolean(streamRes.outputActive);
      lastActiveObsSceneCache = sceneRes.currentProgramSceneName || '';
      lastObsScenesCache = Array.isArray(sceneRes.scenes)
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
      obsInputsCache = obsInputs;

      obsTransitionsCache = Array.isArray(transitionListRes?.transitions)
        ? transitionListRes.transitions
            .map((t) => ({
              transitionName: String(t?.transitionName || '').trim(),
              transitionKind: String(t?.transitionKind || '').trim(),
              transitionFixed: Boolean(t?.transitionFixed),
            }))
            .filter((t) => Boolean(t.transitionName))
        : [];
      currentTransitionNameCache = String(
        currentTransitionRes?.transitionName || transitionListRes?.currentSceneTransitionName || ''
      );
      currentTransitionDurationMsCache = Number.isFinite(Number(currentTransitionRes?.transitionDuration))
        ? Number(currentTransitionRes.transitionDuration)
        : 300;

      const obsMediaStates = {};
      for (const inp of obsInputs) {
        if (inp.inputKind === 'ffmpeg_source' || inp.unversionedInputKind === 'ffmpeg_source') {
          try {
            const st = await obs.call('GetMediaInputStatus', { inputName: inp.inputName });
            if (st?.mediaState) obsMediaStates[inp.inputName] = String(st.mediaState);
          } catch {
            // ignore
          }
        }
      }

      const audioSel = selectPrimaryAudioInput(latestMeterInputs, obsInputs);
      await Promise.all(
        audioSel.availableAudioInputs.slice(0, 12).map(async (inputName) => {
          try {
            const mRes = await obs.call('GetInputMute', { inputName });
            audioMuteMap.set(inputName, Boolean(mRes?.inputMuted));
          } catch {
            // ignore
          }
        })
      );
      const audioMeter = buildAudioMeterState(latestMeterInputs, obsInputs);
      if (audioMeter.primaryInputName && !primaryAudioInputPref) {
        primaryAudioInputPref = audioMeter.primaryInputName;
      }

      socket.emit('agent:obs_state', {
        bridgeVersion: BRIDGE_VERSION,
        capabilities: BRIDGE_CAPABILITIES,
        connectionStatus: 'CONNECTED',
        obsConnectionState: 'CONNECTED',
        lastError: '',
        obsVersion: ver.obsVersion,
        obsWebSocketVersion: ver.obsWebSocketVersion,
        activeObsScene: sceneRes.currentProgramSceneName || '',
        previewObsScene: lastPreviewObsSceneCache,
        studioModeEnabled: studioModeEnabledCache,
        currentTransitionName: currentTransitionNameCache,
        currentTransitionDurationMs: currentTransitionDurationMsCache,
        obsTransitions: obsTransitionsCache,
        obsScenes: Array.isArray(sceneRes.scenes)
          ? sceneRes.scenes.map((s) => String(s.sceneName || '')).filter(Boolean)
          : [],
        obsInputs,
        obsMediaStates,
        primaryAudioInput: audioMeter.primaryInputName,
        audioMeter,
        mediamtx: mtxStatus,
        obsStreamActive: Boolean(streamRes.outputActive),
        obsStreamTimecode: String(streamRes.outputTimecode || ''),
        obsStreamBytes: typeof streamRes.outputBytes === 'number' ? streamRes.outputBytes : null,
        obsStreamDurationMs: typeof streamRes.outputDuration === 'number' ? streamRes.outputDuration : null,
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
    } catch (err) {
      obsSnapshotFailures += 1;
      const errMsg = String(err?.message || 'Failed reading OBS state.');
      socket.emit('agent:obs_error', { message: errMsg });
      const looksClosed =
        !obs.identified ||
        /not connected|closed|socket|timed out/i.test(errMsg);
      if (looksClosed && obsSnapshotFailures >= 2 && !obsManuallyDisconnected) {
        obsSnapshotFailures = 0;
        emitDiagnostic(
          'warn',
          'ws_error',
          `OBS WebSocket unresponsive (${errMsg}); recycling OBS connection cleanly.`,
          'obs_rpc_unresponsive'
        );
        obsConnected = false;
        obsConnecting = false;
        await obs.disconnect().catch(() => {});
        connectObsLoop().catch(() => {});
      }
    }
  } finally {
    isSnapshotRunning = false;
  }
}

async function ensureSceneAndInput(sceneName, inputName, inputKind, inputSettings) {
  const sceneList = await obs.call('GetSceneList');
  const exists = Array.isArray(sceneList?.scenes)
    ? sceneList.scenes.some((s) => s.sceneName === sceneName)
    : false;
  if (!exists) {
    await obs.call('CreateScene', { sceneName });
  }
  if (!inputName) return null;

  const itemsRes = await obs.call('GetSceneItemList', { sceneName });
  const existingItem = Array.isArray(itemsRes?.sceneItems)
    ? itemsRes.sceneItems.find((item) => item.sourceName === inputName)
    : null;
  if (existingItem) {
    if (inputSettings && Object.keys(inputSettings).length > 0 && existingItem.inputKind) {
      await obs.call('SetInputSettings', { inputName, inputSettings, overlay: true }).catch(() => {});
    }
    return Number(existingItem.sceneItemId);
  }

  const inputsRes = await obs.call('GetInputList').catch(() => ({ inputs: [] }));
  const globalInput = Array.isArray(inputsRes?.inputs)
    ? inputsRes.inputs.find((inp) => inp.inputName === inputName)
    : null;

  if (globalInput) {
    if (inputSettings && Object.keys(inputSettings).length > 0) {
      await obs.call('SetInputSettings', { inputName, inputSettings, overlay: true }).catch(() => {});
    }
    const createdItem = await obs.call('CreateSceneItem', {
      sceneName,
      sourceName: inputName,
      sceneItemEnabled: true,
    });
    return Number(createdItem.sceneItemId);
  }

  const created = await obs.call('CreateInput', {
    sceneName,
    inputName,
    inputKind: inputKind || 'browser_source',
    inputSettings: inputSettings || {},
    sceneItemEnabled: true,
  });
  return Number(created.sceneItemId);
}

async function handleCommand(command, payload) {
  if (!APPROVED_COMMANDS.has(String(command || ''))) {
    throw new Error(`Rejected unauthorized bridge command: "${String(command || '')}"`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Command payload must be a JSON object.');
  }
  if (command === 'reconnect_obs') {
    logInfo('Operator requested OBS WebSocket reconnect...');
    obsManuallyDisconnected = false;
    obsReconnectAttempts = 0;
    obsDisconnectedAt = 0;
    if (obsReconnectTimer) {
      clearTimeout(obsReconnectTimer);
      obsReconnectTimer = null;
    }
    try {
      await obs.disconnect().catch(() => {});
    } catch {
      // ignore disconnect error
    }
    obsConnected = false;
    obsConnecting = false;
    await connectObsLoop();
    return {
      reconnected: obsConnected,
      obsUrl: OBS_URL,
      lastError: obsConnected ? '' : lastError,
    };
  }

  if (command === 'disconnect_obs') {
    const reason = String(payload.reason || 'Disconnected by Administrator from Control Room.');
    logWarn(reason);
    obsManuallyDisconnected = true;
    if (obsReconnectTimer) {
      clearTimeout(obsReconnectTimer);
      obsReconnectTimer = null;
    }
    obsConnected = false;
    obsConnecting = false;
    obsStreamActiveCache = false;
    lastError = reason;
    await obs.disconnect().catch(() => {});
    await emitObsSnapshot().catch(() => {});
    return { disconnected: true, manualDisconnect: true };
  }

  if (command === 'mediamtx_status') {
    const mtx = await probeLocalMediaMTX(
      typeof payload.executablePath === 'string' ? payload.executablePath : ''
    );
    await emitObsSnapshot().catch(() => {});
    return { mediamtx: mtx };
  }

  if (command === 'mediamtx_sync_config') {
    const targetServer = String(payload.serverUrl || SERVER_URL || '').trim();
    const written = writeManagedMediaMTXConfig(targetServer);
    logInfo(`Generated local MediaMTX config at ${written.configPath}`);
    const mtx = await probeLocalMediaMTX(
      typeof payload.executablePath === 'string' ? payload.executablePath : ''
    );
    await emitObsSnapshot().catch(() => {});
    return { configPath: written.configPath, mediamtx: mtx };
  }

  if (command === 'mediamtx_start') {
    const targetServer = String(payload.serverUrl || SERVER_URL || '').trim();
    const customExe =
      typeof payload.executablePath === 'string' ? payload.executablePath.trim() : '';
    const mtx = await startLocalMediaMTX(targetServer, customExe);
    await emitObsSnapshot().catch(() => {});
    return { mediamtx: mtx };
  }

  if (command === 'mediamtx_stop') {
    const mtx = await stopLocalMediaMTX();
    await emitObsSnapshot().catch(() => {});
    return { mediamtx: mtx };
  }

  if (!obsConnected) {
    throw new Error(`OBS Studio is offline on ${OBS_URL}. Open OBS Studio and enable WebSocket v5 on port 4455.`);
  }

  if (command === 'get_snapshot') {
    await emitObsSnapshot();
    const [ver, sceneRes, streamRes, recordRes] = await Promise.all([
      obs.call('GetVersion'),
      obs.call('GetSceneList'),
      obs.call('GetStreamStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
      obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
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
      const ensuredItemId = await ensureSceneAndInput(
        sceneName,
        String(payload.ensureInput.inputName),
        String(payload.ensureInput.inputKind || 'browser_source'),
        payload.ensureInput.inputSettings || {}
      );
      if (ensuredItemId !== null && payload.ensureTransform) {
        await applySceneItemTransformSafe(sceneName, ensuredItemId, payload.ensureTransform);
      }
    }

    if (payload.scoreboardOverlay) {
      const sbName = String(payload.scoreboardOverlay.sourceName || 'MaidanLive_Scoreboard_Overlay');
      if (payload.scoreboardOverlay.enabled && payload.scoreboardOverlay.url) {
        const sbItemId = await ensureSceneAndInput(
          sceneName,
          sbName,
          'browser_source',
          { url: String(payload.scoreboardOverlay.url), width: 1920, height: 1080, reroute_audio: false }
        );
        if (sbItemId !== null) {
          await obs
            .call('SetSceneItemEnabled', { sceneName, sceneItemId: sbItemId, sceneItemEnabled: true })
            .catch(() => {});
        }
      } else if (payload.scoreboardOverlay.enabled === false) {
        const curList = await obs.call('GetSceneItemList', { sceneName }).catch(() => ({ sceneItems: [] }));
        const sbExisting = Array.isArray(curList?.sceneItems)
          ? curList.sceneItems.find((i) => i.sourceName === sbName)
          : null;
        if (sbExisting) {
          await obs
            .call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: Number(sbExisting.sceneItemId),
              sceneItemEnabled: false,
            })
            .catch(() => {});
        }
      }
    }

    logInfo(`Switching OBS program scene -> "${sceneName}"`);
    await obs.call('SetCurrentProgramScene', { sceneName });
    const verified = await obs.call('GetCurrentProgramScene');
    if (verified.currentProgramSceneName !== sceneName) {
      throw new Error(
        `OBS scene mismatch: expected "${sceneName}", reported "${verified.currentProgramSceneName}".`
      );
    }
    await emitObsSnapshot();
    const listRes = await obs.call('GetSceneList');
    logInfo(`Verified OBS scene switch -> "${verified.currentProgramSceneName}"`);
    return {
      verifiedScene: verified.currentProgramSceneName,
      obsScenes: (listRes.scenes || []).map((s) => String(s.sceneName || '')).filter(Boolean),
    };
  }

  if (command === 'trigger_transition') {
    const transitionName =
      typeof payload.transitionName === 'string' ? payload.transitionName.trim() : '';
    if (transitionName) {
      await obs.call('SetCurrentSceneTransition', { transitionName });
    }
    if (Number.isFinite(Number(payload.transitionDurationMs))) {
      const dur = Math.max(0, Math.min(5000, Math.round(Number(payload.transitionDurationMs))));
      await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: dur }).catch(() => {});
    }
    const studioStatus = await obs.call('GetStudioModeEnabled').catch(() => ({
      studioModeEnabled: studioModeEnabledCache,
    }));
    let studioModeEnabled = Boolean(studioStatus?.studioModeEnabled);
    if (!studioModeEnabled) {
      if (payload.ensureStudioMode === false) {
        throw new Error('OBS Studio Mode is disabled.');
      }
      await obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
      studioModeEnabled = true;
    }
    const targetPreview = String(payload.previewSceneName || payload.sceneName || '').trim();
    if (targetPreview) {
      await obs.call('SetCurrentPreviewScene', { sceneName: targetPreview });
    }
    await obs.call('TriggerStudioModeTransition');
    await emitObsSnapshot();
    return {
      triggered: true,
      studioModeEnabled,
      activeObsScene: lastActiveObsSceneCache,
      previewObsScene: lastPreviewObsSceneCache,
      currentTransitionName: currentTransitionNameCache,
      currentTransitionDurationMs: currentTransitionDurationMsCache,
    };
  }

  if (command === 'set_studio_mode') {
    const studioModeEnabled = Boolean(payload.studioModeEnabled);
    await obs.call('SetStudioModeEnabled', { studioModeEnabled });
    await emitObsSnapshot();
    return {
      studioModeEnabled: studioModeEnabledCache,
      activeObsScene: lastActiveObsSceneCache,
      previewObsScene: lastPreviewObsSceneCache,
    };
  }

  if (command === 'set_preview_scene') {
    const sceneName = String(payload.sceneName || '').trim();
    if (!sceneName) throw new Error('sceneName is required.');
    const studioStatus = await obs.call('GetStudioModeEnabled').catch(() => ({
      studioModeEnabled: studioModeEnabledCache,
    }));
    if (!studioStatus?.studioModeEnabled) {
      await obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
    }
    await obs.call('SetCurrentPreviewScene', { sceneName });
    await emitObsSnapshot();
    return {
      studioModeEnabled: true,
      previewObsScene: lastPreviewObsSceneCache || sceneName,
      activeObsScene: lastActiveObsSceneCache,
    };
  }

  if (command === 'set_primary_audio_input') {
    primaryAudioInputPref = String(payload.inputName || '').trim();
    const audioMeter = buildAudioMeterState(latestMeterInputs, obsInputsCache);
    await emitObsSnapshot();
    return { primaryAudioInput: audioMeter.primaryInputName, audioMeter };
  }

  if (command === 'apply_layout') {
    const sceneName = String(payload.sceneName || '').trim();
    if (!sceneName) throw new Error('Target layout sceneName is required.');
    const boxes = Array.isArray(payload.boxes) ? payload.boxes : [];
    const allInputs = Array.isArray(payload.allCameraInputs) ? payload.allCameraInputs : [];

    const sceneList = await obs.call('GetSceneList');
    const sceneExists = (sceneList.scenes || []).some((s) => s.sceneName === sceneName);
    if (!sceneExists) {
      await obs.call('CreateScene', { sceneName });
    }

    const selectedSet = new Set(boxes.map((b) => b.inputName));
    const currentItemsRes = await obs.call('GetSceneItemList', { sceneName });
    const currentItems = currentItemsRes.sceneItems || [];

    for (const item of currentItems) {
      if (allInputs.includes(item.sourceName) && !selectedSet.has(item.sourceName)) {
        await obs
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
      const itemId = await ensureSceneAndInput(
        sceneName,
        String(box.inputName),
        String(box.inputKind || 'browser_source'),
        box.inputSettings || {}
      );
      if (itemId !== null) {
        await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: itemId, sceneItemEnabled: true });
        await applySceneItemTransformSafe(sceneName, itemId, box);
        appliedBoxItems.push({ itemId, slotIndex: Number(box.slotIndex) || 0 });
      }
    }

    appliedBoxItems.sort((a, b) => a.slotIndex - b.slotIndex);
    for (let idx = 0; idx < appliedBoxItems.length; idx += 1) {
      await obs
        .call('SetSceneItemIndex', {
          sceneName,
          sceneItemId: appliedBoxItems[idx].itemId,
          sceneItemIndex: idx,
        })
        .catch(() => {});
    }

    if (payload.scoreboardOverlay?.sourceName) {
      const sbName = String(payload.scoreboardOverlay.sourceName);
      if (payload.scoreboardOverlay.enabled && payload.scoreboardOverlay.url) {
        const sbId = await ensureSceneAndInput(sceneName, sbName, 'browser_source', {
          url: String(payload.scoreboardOverlay.url),
          width: 1920,
          height: 1080,
          reroute_audio: false,
        });
        if (sbId !== null) {
          await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: sbId, sceneItemEnabled: true });
          await obs
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
          const updatedList = await obs.call('GetSceneItemList', { sceneName });
          await obs
            .call('SetSceneItemIndex', {
              sceneName,
              sceneItemId: sbId,
              sceneItemIndex: Math.max(0, (updatedList.sceneItems?.length || 1) - 1),
            })
            .catch(() => {});
        }
      } else {
        const sbExisting = currentItems.find((i) => i.sourceName === sbName);
        if (sbExisting) {
          await obs
            .call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: Number(sbExisting.sceneItemId),
              sceneItemEnabled: false,
            })
            .catch(() => {});
        }
      }
    }

    logInfo(`Applying multi-camera layout scene -> "${sceneName}" (${boxes.length} sources)`);
    await obs.call('SetCurrentProgramScene', { sceneName });
    const verified = await obs.call('GetCurrentProgramScene');
    if (verified.currentProgramSceneName !== sceneName) {
      throw new Error(`Layout switch verification failed on "${sceneName}".`);
    }
    await emitObsSnapshot();
    const listRes = await obs.call('GetSceneList');
    return {
      verifiedScene: verified.currentProgramSceneName,
      obsScenes: (listRes.scenes || []).map((s) => String(s.sceneName || '')).filter(Boolean),
    };
  }

  if (command === 'get_input_list') {
    const inputsRes = await obs.call('GetInputList').catch(() => ({ inputs: [] }));
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
        const res = await obs.call('GetSourceScreenshot', {
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
    logInfo('Starting OBS stream output...');
    await obs.call('StartStream');
    await emitObsSnapshot();
    return { obsStreamActive: true };
  }

  if (command === 'stop_stream') {
    logInfo('Stopping OBS stream output...');
    await obs.call('StopStream');
    await emitObsSnapshot();
    return { obsStreamActive: false };
  }

  if (command === 'start_record') {
    logInfo('Starting OBS local recording...');
    await obs.call('StartRecord');
    await emitObsSnapshot();
    return { obsRecordActive: true };
  }

  if (command === 'stop_record') {
    logInfo('Stopping OBS local recording...');
    const res = await obs.call('StopRecord');
    await emitObsSnapshot();
    return { obsRecordActive: false, outputPath: res?.outputPath || '' };
  }

  if (command === 'set_input_mute') {
    const inputName = String(payload.inputName || '').trim();
    const inputMuted = Boolean(payload.inputMuted);
    if (!inputName) throw new Error('inputName is required.');
    await obs.call('SetInputMute', { inputName, inputMuted });
    const verify = await obs.call('GetInputMute', { inputName }).catch(() => ({ inputMuted }));
    return { inputName, inputMuted: Boolean(verify.inputMuted) };
  }

  if (command === 'get_input_mute') {
    const inputName = String(payload.inputName || '').trim();
    if (!inputName) throw new Error('inputName is required.');
    const res = await obs.call('GetInputMute', { inputName });
    return { inputName, inputMuted: Boolean(res.inputMuted) };
  }

  if (command === 'reconnect_input') {
    const sceneName = String(payload.sceneName || '').trim();
    const inputName = String(payload.inputName || '').trim();
    const inputKind = String(payload.inputKind || 'browser_source');
    if (sceneName && inputName) {
      await ensureSceneAndInput(
        sceneName,
        inputName,
        inputKind,
        payload.inputSettings || {}
      ).catch(() => {});
    }
    if (inputName) {
      if (inputKind === 'ffmpeg_source') {
        await obs
          .call('TriggerMediaInputAction', {
            inputName,
            mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
          })
          .catch(() => {});
      } else {
        await obs
          .call('PressInputPropertiesButton', { inputName, propertyName: 'refreshnocache' })
          .catch(() => {});
      }
    }
    await emitObsSnapshot();
    return { reconnected: true, inputName };
  }

  if (command === 'remove_input') {
    const inputName = String(payload.inputName || '').trim();
    if (!inputName) throw new Error('inputName is required.');
    await obs.call('RemoveInput', { inputName });
    await emitObsSnapshot();
    return { removed: true, inputName };
  }

  if (command === 'get_scene_items') {
    let targetScene = String(payload.sceneName || '').trim();
    if (!targetScene) {
      const cur = await obs.call('GetCurrentProgramScene');
      targetScene = String(cur?.currentProgramSceneName || '');
    }
    if (!targetScene) throw new Error('No active OBS scene selected.');
    const itemsRes = await obs.call('GetSceneItemList', { sceneName: targetScene });
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
    await obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId,
      sceneItemEnabled: enabled,
    });
    const verify = await obs
      .call('GetSceneItemEnabled', { sceneName, sceneItemId })
      .catch(() => ({ sceneItemEnabled: enabled }));
    await emitObsSnapshot();
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
      const cur = await obs.call('GetCurrentProgramScene');
      sceneName = String(cur?.currentProgramSceneName || '');
    }
    if (!sceneName) throw new Error('No target OBS scene found.');

    const itemsRes = await obs.call('GetSceneItemList', { sceneName });
    const items = Array.isArray(itemsRes?.sceneItems) ? itemsRes.sceneItems : [];
    const found = items.find((it) => it.sourceName === inputName);
    let sceneItemId = found ? Number(found.sceneItemId) : null;
    if (sceneItemId === null && payload.ensureInput) {
      sceneItemId = await ensureSceneAndInput(
        sceneName,
        inputName,
        String(payload.ensureInput.inputKind || 'browser_source'),
        payload.ensureInput.inputSettings || {}
      );
    }
    if (sceneItemId === null) {
      throw new Error(`Source "${inputName}" is not inside OBS scene "${sceneName}".`);
    }

    const appliedTransform = await applySceneItemTransformSafe(sceneName, sceneItemId, {
      x: Number(payload.x ?? 0),
      y: Number(payload.y ?? 0),
      width: Number(payload.width ?? 1920),
      height: Number(payload.height ?? 1080),
      rotation: Number(payload.rotation ?? 0),
      previewFit: String(payload.previewFit || 'contain'),
    });
    await emitObsSnapshot();
    return { sceneName, sceneItemId, inputName, transform: appliedTransform };
  }

  if (command === 'get_scene_transforms') {
    let targetScene = String(payload.sceneName || '').trim();
    if (!targetScene) {
      const cur = await obs.call('GetCurrentProgramScene');
      targetScene = String(cur?.currentProgramSceneName || '');
    }
    if (!targetScene) throw new Error('No active OBS scene selected.');
    const itemsRes = await obs.call('GetSceneItemList', { sceneName: targetScene });
    const items = Array.isArray(itemsRes?.sceneItems) ? itemsRes.sceneItems : [];
    const transforms = [];
    for (const it of items) {
      try {
        const tRes = await obs.call('GetSceneItemTransform', {
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
        // Ignore items without transform
      }
    }
    return { sceneName: targetScene, transforms };
  }

  throw new Error(`Unsupported command: ${command}`);
}

function scheduleObsReconnect(delayMs = 3000) {
  if (obsReconnectTimer || bridgeRevoked || obsManuallyDisconnected) return;
  obsReconnectTimer = setTimeout(() => {
    obsReconnectTimer = null;
    connectObsLoop();
  }, delayMs);
}

function scheduleServerReconnect(delayMs) {
  if (serverReconnectTimer || bridgeRevoked || adminDisconnected) return;
  const waitMs =
    typeof delayMs === 'number' && delayMs > 0
      ? delayMs
      : computeBackoffMs(serverReconnectAttempts, 1500, 30000, 0.25);
  serverReconnectAttempts += 1;
  serverReconnectTimer = setTimeout(() => {
    serverReconnectTimer = null;
    if (bridgeRevoked || adminDisconnected) return;
    try {
      socket.io.opts.reconnection = true;
      if (!socket.connected) socket.connect();
    } catch {
      // ignore
    }
  }, waitMs);
}

async function connectObsLoop() {
  if (obsConnected || obsConnecting || bridgeRevoked || obsManuallyDisconnected) return;
  obsConnecting = true;
  emitObsSnapshot().catch(() => {});
  try {
    await withTimeout(
      obs.connect(OBS_URL, OBS_PASSWORD || undefined, {
        rpcVersion: 1,
        eventSubscriptions: OBS_EVENT_SUBSCRIPTIONS,
      }),
      8000,
      'OBS WebSocket connect'
    );
    const wasRetry = obsReconnectAttempts > 0 || Boolean(obsDisconnectedAt);
    obsManuallyDisconnected = false;
    obsConnected = true;
    obsConnecting = false;
    obsReconnectAttempts = 0;
    obsDisconnectedAt = 0;
    obsSnapshotFailures = 0;
    lastError = '';
    if (wasRetry) {
      emitDiagnostic(
        'info',
        'reconnect_success',
        `Reconnected cleanly to local OBS Studio (${OBS_URL}) without interrupting broadcast.`,
        'obs_reconnected'
      );
    } else {
      logInfo(`Connected to local OBS Studio WebSocket v5 (${OBS_URL})`);
    }
    const sceneList = await obs.call('GetSceneList').catch(() => null);
    if (sceneList) {
      const count = Array.isArray(sceneList.scenes) ? sceneList.scenes.length : 0;
      logInfo(
        `Discovered ${count} OBS scenes. Active program scene: "${sceneList.currentProgramSceneName || 'None'}"`
      );
    }
    await emitObsSnapshot();
  } catch (err) {
    obsConnected = false;
    obsConnecting = false;
    obsReconnectAttempts += 1;
    if (!obsDisconnectedAt) obsDisconnectedAt = Date.now();
    lastError = formatObsConnectError(err);
    const nextDelay = computeBackoffMs(obsReconnectAttempts, 1500, 30000, 0.25);
    emitDiagnostic(
      'warn',
      'reconnect_attempt',
      `OBS connect attempt #${obsReconnectAttempts} failed: ${lastError} — retrying in ${Math.round(nextDelay / 1000)}s`,
      lastError
    );
    if (socket.connected) {
      socket.emit('agent:obs_error', { message: lastError });
    }
    await emitObsSnapshot();
    if (!obsManuallyDisconnected) {
      scheduleObsReconnect(nextDelay);
    }
  }
}

obs.on('error', (err) => {
  const msg = String(err?.message || err || 'OBS WebSocket error');
  lastError = msg;
  emitDiagnostic('warn', 'ws_error', `OBS WebSocket error event: ${msg}`, 'obs_ws_error');
});

obs.on('ConnectionClosed', (err) => {
  obsConnected = false;
  obsConnecting = false;
  if (!obsDisconnectedAt) obsDisconnectedAt = Date.now();
  lastError = formatObsConnectError(err);
  const willAutoRetry = !obsManuallyDisconnected && !bridgeRevoked;
  if (!willAutoRetry) {
    obsStreamActiveCache = false;
  }
  const nextDelay = computeBackoffMs(obsReconnectAttempts, 1500, 30000, 0.25);
  emitDiagnostic(
    'warn',
    'disconnect_reason',
    obsManuallyDisconnected
      ? `OBS WebSocket disconnected by Administrator: ${lastError}`
      : `OBS WebSocket disconnected (${lastError}). Reconnecting in ${Math.round(nextDelay / 1000)}s while keeping OBS running...`,
    lastError
  );
  emitObsSnapshot().catch(() => {});
  if (willAutoRetry) {
    scheduleObsReconnect(nextDelay);
  }
});

obs.on('CurrentProgramSceneChanged', (ev) => {
  logInfo(`OBS program scene changed -> "${ev?.sceneName || ''}"`);
  emitObsSnapshot().catch(() => {});
});
obs.on('CurrentPreviewSceneChanged', (ev) => {
  lastPreviewObsSceneCache = String(ev?.sceneName || '');
  emitObsSnapshot().catch(() => {});
});
obs.on('StudioModeStateChanged', (ev) => {
  studioModeEnabledCache = Boolean(ev?.studioModeEnabled);
  emitObsSnapshot().catch(() => {});
});
obs.on('CurrentSceneTransitionChanged', (ev) => {
  currentTransitionNameCache = String(ev?.transitionName || '');
  emitObsSnapshot().catch(() => {});
});
obs.on('CurrentSceneTransitionDurationChanged', (ev) => {
  if (Number.isFinite(Number(ev?.transitionDuration))) {
    currentTransitionDurationMsCache = Number(ev.transitionDuration);
  }
});
obs.on('SceneTransitionEnded', () => emitObsSnapshot().catch(() => {}));
obs.on('SceneListChanged', () => {
  logInfo('OBS scene list updated — syncing scenes to MaidanLive...');
  emitObsSnapshot().catch(() => {});
});
obs.on('InputCreated', () => emitObsSnapshot().catch(() => {}));
obs.on('InputRemoved', () => emitObsSnapshot().catch(() => {}));
obs.on('InputNameChanged', () => emitObsSnapshot().catch(() => {}));
obs.on('InputMuteStateChanged', (ev) => {
  const inputName = String(ev?.inputName || '').trim();
  if (!inputName) return;
  audioMuteMap.set(inputName, Boolean(ev?.inputMuted));
  const nowMs = Date.now();
  const audioMeter = buildAudioMeterState(latestMeterInputs, obsInputsCache, nowMs);
  if (socket.connected && !bridgeRevoked) {
    lastSocketAudioEmitAt = nowMs;
    socket.emit('agent:audio_levels', {
      bridgeId: BRIDGE_ID || undefined,
      primaryAudioInput: audioMeter.primaryInputName,
      audioMeter,
    });
  }
});
obs.on('InputVolumeMeters', (ev) => {
  if (!Array.isArray(ev?.inputs)) return;
  latestMeterInputs = ev.inputs;
  const nowMs = Date.now();
  if (nowMs - lastSocketAudioEmitAt < AUDIO_SOCKET_EMIT_INTERVAL_MS) return;
  lastSocketAudioEmitAt = nowMs;
  const audioMeter = buildAudioMeterState(latestMeterInputs, obsInputsCache, nowMs);
  if (socket.connected && !bridgeRevoked) {
    socket.emit('agent:audio_levels', {
      bridgeId: BRIDGE_ID || undefined,
      primaryAudioInput: audioMeter.primaryInputName,
      audioMeter,
    });
  }
});
obs.on('StreamStateChanged', (ev) => {
  obsStreamActiveCache = Boolean(ev?.outputActive);
  logInfo(`OBS stream output state: ${ev?.outputActive ? 'LIVE STREAMING' : 'STOPPED'}`);
  emitObsSnapshot().catch(() => {});
});
obs.on('RecordStateChanged', () => emitObsSnapshot().catch(() => {}));

socket.on('connect', () => {
  if (socket.auth) socket.auth.manualResume = false;
  if (serverReconnectTimer) {
    clearTimeout(serverReconnectTimer);
    serverReconnectTimer = null;
  }
  adminDisconnected = false;
  const wasReconnect = serverReconnectAttempts > 0 || Boolean(serverDisconnectedAt);
  serverReconnectAttempts = 0;
  missedHeartbeats = 0;
  serverDisconnectedAt = 0;
  if (wasReconnect) {
    emitDiagnostic(
      'info',
      'reconnect_success',
      `Reconnected outbound bridge to ${SERVER_URL}/obs-agent without disrupting OBS.`,
      'reconnected'
    );
  } else {
    logInfo(
      `Authenticated outbound bridge to ${SERVER_URL}/obs-agent (${useRegisteredBridgeAuth ? `Bridge ${BRIDGE_ID}` : `Match ${MATCH_ID}`})`
    );
  }
  emitObsSnapshot().catch(() => {});
});

socket.io.on('reconnect_attempt', (attempt) => {
  if (socket.auth) socket.auth.manualResume = false;
  serverReconnectAttempts = Number(attempt) || (serverReconnectAttempts + 1);
  logInfo(`Reconnecting to MaidanLive backend (attempt #${serverReconnectAttempts})...`);
});

socket.on('disconnect', (reason) => {
  if (!serverDisconnectedAt) serverDisconnectedAt = Date.now();
  const cleanReason = String(reason || 'transport closed');
  if (bridgeRevoked || adminDisconnected) {
    logWarn(`Bridge connection stopped (${cleanReason}).`);
    return;
  }
  emitDiagnostic(
    'warn',
    'disconnect_reason',
    `Disconnected from MaidanLive backend (${cleanReason}). Auto-reconnecting without interrupting OBS...`,
    cleanReason
  );
  if (cleanReason === 'io server disconnect' || !socket.active) {
    scheduleServerReconnect();
  }
});

socket.on('connect_error', (err) => {
  const msg = String(err?.message || err);
  const lower = msg.toLowerCase();
  logErr(`Backend handshake failed: ${msg}`);
  if (lower.includes('revoked')) {
    bridgeRevoked = true;
    socket.io.opts.reconnection = false;
    logErr('Bridge was REVOKED by Administrator. Generate or reactivate your bridge token in MaidanLive before restarting.');
    return;
  }
  if (lower.includes('disconnected by administrator') || lower.includes('click reconnect in obs bridge')) {
    adminDisconnected = true;
    socket.io.opts.reconnection = false;
    if (serverReconnectTimer) {
      clearTimeout(serverReconnectTimer);
      serverReconnectTimer = null;
    }
    logWarn('Bridge paused by Administrator disconnect. Restart the bridge agent to resume.');
    return;
  }
  if (!socket.active) {
    scheduleServerReconnect();
  }
});

socket.on('server:bridge_revoked', (payload) => {
  bridgeRevoked = true;
  socket.io.opts.reconnection = false;
  if (serverReconnectTimer) {
    clearTimeout(serverReconnectTimer);
    serverReconnectTimer = null;
  }
  logErr(`Bridge revoked by Administrator: ${payload?.reason || 'Access revoked'}. Stopping bridge.`);
  cleanupLockFile();
  obs.disconnect().catch(() => {});
  process.exit(2);
});

socket.on('server:disconnect_bridge', (payload) => {
  const reason = payload?.reason || 'Control Room disconnect';
  const isAdminDisconnect = payload?.adminDisconnected !== false;
  logWarn(`Disconnected by operator: ${reason}.`);
  if (isAdminDisconnect) {
    adminDisconnected = true;
    socket.io.opts.reconnection = false;
    if (serverReconnectTimer) {
      clearTimeout(serverReconnectTimer);
      serverReconnectTimer = null;
    }
  }
  socket.disconnect();
});

socket.on('server:obs_command', async (req, ack) => {
  const cmd = req?.command;
  try {
    const data = await handleCommand(cmd, req?.payload || {});
    if (typeof ack === 'function') ack({ ok: true, data });
  } catch (err) {
    const msg = err?.message || 'OBS command failed.';
    logErr(`Command "${String(cmd || '')}" failed: ${msg}`);
    if (typeof ack === 'function') ack({ ok: false, error: msg });
  }
});

async function runHeartbeatTick() {
  if (isHeartbeatRunning || bridgeRevoked || adminDisconnected) return;
  isHeartbeatRunning = true;
  try {
    if (!socket.connected) {
      missedHeartbeats += 1;
      if (!socket.active) {
        scheduleServerReconnect();
      }
      return;
    }
    let acked = false;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (acked) return;
        missedHeartbeats += 1;
        emitDiagnostic(
          'warn',
          'heartbeat_timeout',
          `Server heartbeat ack timed out after ${HEARTBEAT_ACK_TIMEOUT_MS}ms (missed=${missedHeartbeats}).`,
          'heartbeat_timeout'
        );
        if (missedHeartbeats >= 6 && !adminDisconnected && !bridgeRevoked) {
          emitDiagnostic(
            'warn',
            'network_interruption',
            'Half-open Socket.IO transport detected after 6 missed heartbeats; refreshing server socket cleanly.',
            'half_open_socket'
          );
          missedHeartbeats = 0;
          try {
            socket.disconnect();
            socket.connect();
          } catch {
            // ignore
          }
        }
        resolve();
      }, HEARTBEAT_ACK_TIMEOUT_MS);

      socket.emit(
        'agent:heartbeat',
        {
          bridgeId: BRIDGE_ID || undefined,
          matchId: MATCH_ID || undefined,
          obsConnected,
          obsConnectionState: obsManuallyDisconnected
            ? 'OFFLINE'
            : obsConnected
              ? 'CONNECTED'
              : 'RECONNECTING',
          obsStreamActive: obsStreamActiveCache,
          reconnectAttempts: serverReconnectAttempts + obsReconnectAttempts,
          sentAtMs: Date.now(),
        },
        () => {
          acked = true;
          clearTimeout(timer);
          missedHeartbeats = 0;
          serverDisconnectedAt = 0;
          resolve();
        }
      );
    });

    if (socket.connected) {
      await emitObsSnapshot().catch(() => {});
    }
  } finally {
    isHeartbeatRunning = false;
  }
}

setInterval(() => {
  runHeartbeatTick().catch(() => {});
}, HEARTBEAT_INTERVAL_MS);

let lastSleepCheckMs = Date.now();
setInterval(() => {
  const now = Date.now();
  const drift = now - lastSleepCheckMs;
  lastSleepCheckMs = now;
  if (drift > 12000 && !bridgeRevoked) {
    emitDiagnostic(
      'info',
      'network_interruption',
      `System wake detected (${Math.round(drift / 1000)}s clock jump); verifying server & OBS sockets without touching stream.`,
      'system_resume'
    );
    if (!adminDisconnected) {
      if (!socket.connected && !socket.active) {
        socket.connect();
      } else if (socket.connected) {
        runHeartbeatTick().catch(() => {});
      }
    }
    if (!obsConnected && !obsConnecting && !obsManuallyDisconnected) {
      connectObsLoop();
    }
  }
}, 2000);

async function shutdownCleanly() {
  logInfo('Shutting down Windows Local OBS Bridge cleanly...');
  cleanupLockFile();
  try {
    await stopLocalMediaMTX().catch(() => {});
    socket.disconnect();
    await obs.disconnect();
  } catch {
    // Ignore close errors
  }
  process.exit(0);
}

process.on('SIGINT', shutdownCleanly);
process.on('SIGTERM', shutdownCleanly);
process.on('exit', cleanupLockFile);

connectObsLoop();
