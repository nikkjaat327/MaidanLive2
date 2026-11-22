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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import OBSWebSocket from 'obs-websocket-js';

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
  'get_scene_items',
  'set_scene_item_enabled',
  'get_input_list',
  'reconnect_obs',
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

const SERVER_URL = String(
  args.server || process.env.MAIDANLIVE_URL || fileConfig.serverUrl || 'http://127.0.0.1:3000'
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
let bridgeRevoked = false;

const socketAuth = useRegisteredBridgeAuth
  ? {
      bridgeId: BRIDGE_ID,
      bridgeToken: BRIDGE_TOKEN,
      label: AGENT_LABEL,
      platform: process.platform,
    }
  : {
      matchId: MATCH_ID,
      agentToken: AGENT_TOKEN,
      label: AGENT_LABEL,
      platform: process.platform,
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
  reconnectionDelay: 2000,
  reconnectionDelayMax: 15000,
});

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

async function emitObsSnapshot() {
  if (!socket.connected) return;
  if (!obsConnected) {
    socket.emit('agent:obs_state', {
      connectionStatus: obsConnecting ? 'CONNECTING' : lastError ? 'ERROR' : 'DISCONNECTED',
      lastError,
      obsScenes: [],
      obsInputs: [],
      activeObsScene: '',
      obsStreamActive: false,
    });
    return;
  }

  try {
    const [ver, sceneRes, inputRes, streamRes, recordRes, statsRes] = await Promise.all([
      obs.call('GetVersion'),
      obs.call('GetSceneList'),
      obs.call('GetInputList').catch(() => ({ inputs: [] })),
      obs
        .call('GetStreamStatus')
        .catch(() => ({ outputActive: false, outputTimecode: '', outputBytes: null, outputDuration: null })),
      obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
      obs.call('GetStats').catch(() => null),
    ]);

    const obsInputs = Array.isArray(inputRes?.inputs)
      ? inputRes.inputs
          .map((inp) => ({
            inputName: String(inp.inputName || '').trim(),
            inputKind: String(inp.inputKind || '').trim(),
            unversionedInputKind: String(inp.unversionedInputKind || '').trim(),
          }))
          .filter((inp) => Boolean(inp.inputName))
      : [];

    socket.emit('agent:obs_state', {
      connectionStatus: 'CONNECTED',
      lastError: '',
      obsVersion: ver.obsVersion,
      obsWebSocketVersion: ver.obsWebSocketVersion,
      activeObsScene: sceneRes.currentProgramSceneName || '',
      obsScenes: Array.isArray(sceneRes.scenes)
        ? sceneRes.scenes.map((s) => String(s.sceneName || '')).filter(Boolean)
        : [],
      obsInputs,
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
    socket.emit('agent:obs_error', { message: err?.message || 'Failed reading OBS state.' });
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

    if (payload.scoreboardOverlay?.enabled && payload.scoreboardOverlay?.url) {
      const sbItemId = await ensureSceneAndInput(
        sceneName,
        String(payload.scoreboardOverlay.sourceName || 'MaidanLive_Scoreboard_Overlay'),
        'browser_source',
        { url: String(payload.scoreboardOverlay.url), width: 1920, height: 1080, reroute_audio: false }
      );
      if (sbItemId !== null) {
        await obs
          .call('SetSceneItemEnabled', { sceneName, sceneItemId: sbItemId, sceneItemEnabled: true })
          .catch(() => {});
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
    if (sceneName && inputName) {
      await ensureSceneAndInput(
        sceneName,
        inputName,
        String(payload.inputKind || 'browser_source'),
        payload.inputSettings || {}
      ).catch(() => {});
    }
    if (inputName) {
      await obs
        .call('PressInputPropertiesButton', { inputName, propertyName: 'refreshnocache' })
        .catch(() => {});
    }
    await emitObsSnapshot();
    return { reconnected: true, inputName };
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

function scheduleObsReconnect(delayMs = 4000) {
  if (obsReconnectTimer || bridgeRevoked) return;
  obsReconnectTimer = setTimeout(() => {
    obsReconnectTimer = null;
    connectObsLoop();
  }, delayMs);
}

async function connectObsLoop() {
  if (obsConnected || obsConnecting || bridgeRevoked) return;
  obsConnecting = true;
  emitObsSnapshot().catch(() => {});
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD || undefined, { rpcVersion: 1 });
    obsConnected = true;
    obsConnecting = false;
    lastError = '';
    logInfo(`Connected to local OBS Studio WebSocket v5 (${OBS_URL})`);
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
    lastError = formatObsConnectError(err);
    logWarn(`${lastError} — retrying in 5s...`);
    if (socket.connected) {
      socket.emit('agent:obs_error', { message: lastError });
    }
    await emitObsSnapshot();
    scheduleObsReconnect(5000);
  }
}

obs.on('ConnectionClosed', (err) => {
  obsConnected = false;
  obsConnecting = false;
  lastError = formatObsConnectError(err);
  logWarn(`OBS WebSocket disconnected (${lastError}). Reconnecting in 4s...`);
  emitObsSnapshot().catch(() => {});
  scheduleObsReconnect(4000);
});

obs.on('CurrentProgramSceneChanged', (ev) => {
  logInfo(`OBS program scene changed -> "${ev?.sceneName || ''}"`);
  emitObsSnapshot().catch(() => {});
});
obs.on('SceneListChanged', () => {
  logInfo('OBS scene list updated — syncing scenes to MaidanLive...');
  emitObsSnapshot().catch(() => {});
});
obs.on('InputCreated', () => emitObsSnapshot().catch(() => {}));
obs.on('InputRemoved', () => emitObsSnapshot().catch(() => {}));
obs.on('InputNameChanged', () => emitObsSnapshot().catch(() => {}));
obs.on('StreamStateChanged', (ev) => {
  logInfo(`OBS stream output state: ${ev?.outputActive ? 'LIVE STREAMING' : 'STOPPED'}`);
  emitObsSnapshot().catch(() => {});
});
obs.on('RecordStateChanged', () => emitObsSnapshot().catch(() => {}));

socket.on('connect', () => {
  logInfo(
    `Authenticated outbound bridge to ${SERVER_URL}/obs-agent (${useRegisteredBridgeAuth ? `Bridge ${BRIDGE_ID}` : `Match ${MATCH_ID}`})`
  );
  emitObsSnapshot().catch(() => {});
});

socket.on('disconnect', (reason) => {
  logWarn(`Disconnected from MaidanLive backend (${reason}). Auto-reconnecting...`);
});

socket.on('connect_error', (err) => {
  const msg = String(err?.message || err);
  logErr(`Backend handshake failed: ${msg}`);
  if (msg.toLowerCase().includes('revoked')) {
    bridgeRevoked = true;
    socket.io.opts.reconnection = false;
    logErr('Bridge was REVOKED by Administrator. Generate or reactivate your bridge token in MaidanLive before restarting.');
  }
});

socket.on('server:bridge_revoked', (payload) => {
  bridgeRevoked = true;
  socket.io.opts.reconnection = false;
  logErr(`Bridge revoked by Administrator: ${payload?.reason || 'Access revoked'}. Stopping bridge.`);
  obs.disconnect().catch(() => {});
  process.exit(2);
});

socket.on('server:disconnect_bridge', (payload) => {
  logWarn(`Disconnected by operator: ${payload?.reason || 'Control Room disconnect'}.`);
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

setInterval(() => {
  if (obsConnected && socket.connected && !bridgeRevoked) {
    emitObsSnapshot().catch(() => {});
  }
}, 5000);

process.on('SIGINT', async () => {
  logInfo('Shutting down Windows Local OBS Bridge cleanly...');
  try {
    socket.disconnect();
    await obs.disconnect();
  } catch {
    // Ignore close errors
  }
  process.exit(0);
});

connectObsLoop();
