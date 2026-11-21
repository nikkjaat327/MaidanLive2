#!/usr/bin/env node
/**
 * MaidanLive Local OBS Controller Agent
 * Runs on the same Windows / macOS / Linux PC (or LAN) as OBS Studio.
 * Connects outbound to MaidanLive over Socket.IO (/obs-agent) and bridges
 * OBS WebSocket v5 commands & events cleanly without exposing OBS to the internet.
 */

import { io } from 'socket.io-client';
import OBSWebSocket from 'obs-websocket-js';

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
const SERVER_URL = (args.server || process.env.MAIDANLIVE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const MATCH_ID = args.match || process.env.MAIDANLIVE_MATCH_ID || '';
const AGENT_TOKEN = args.token || process.env.MAIDANLIVE_AGENT_TOKEN || '';
const OBS_URL = args['obs-url'] || process.env.OBS_WS_URL || 'ws://127.0.0.1:4455';
const OBS_PASSWORD = args['obs-password'] || process.env.OBS_WS_PASSWORD || '';
const AGENT_LABEL = args.label || process.env.OBS_AGENT_LABEL || `OBS-PC (${process.platform})`;

if (!MATCH_ID || !AGENT_TOKEN) {
  console.error(
    'Usage: node maidanlive-obs-agent.mjs --server <url> --match <matchId> --token <agentToken> [--obs-url ws://127.0.0.1:4455] [--obs-password <pwd>]'
  );
  process.exit(1);
}

const obs = new OBSWebSocket();
let obsConnected = false;
let obsConnecting = false;
let lastError = '';

const socket = io(`${SERVER_URL}/obs-agent`, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  auth: {
    matchId: MATCH_ID,
    agentToken: AGENT_TOKEN,
    label: AGENT_LABEL,
  },
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
});

async function emitObsSnapshot() {
  if (!socket.connected) return;
  if (!obsConnected) {
    socket.emit('agent:obs_state', {
      connectionStatus: obsConnecting ? 'CONNECTING' : lastError ? 'ERROR' : 'DISCONNECTED',
      lastError,
      obsScenes: [],
      activeObsScene: '',
      obsStreamActive: false,
    });
    return;
  }

  try {
    const [ver, sceneRes, streamRes, recordRes, statsRes] = await Promise.all([
      obs.call('GetVersion'),
      obs.call('GetSceneList'),
      obs.call('GetStreamStatus').catch(() => ({ outputActive: false, outputTimecode: '', outputBytes: null, outputDuration: null })),
      obs.call('GetRecordStatus').catch(() => ({ outputActive: false, outputTimecode: '' })),
      obs.call('GetStats').catch(() => null),
    ]);

    socket.emit('agent:obs_state', {
      connectionStatus: 'CONNECTED',
      lastError: '',
      obsVersion: ver.obsVersion,
      obsWebSocketVersion: ver.obsWebSocketVersion,
      activeObsScene: sceneRes.currentProgramSceneName || '',
      obsScenes: Array.isArray(sceneRes.scenes)
        ? sceneRes.scenes.map((s) => String(s.sceneName || '')).filter(Boolean)
        : [],
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
  if (!obsConnected) {
    throw new Error(`OBS Studio is not connected on ${OBS_URL}.`);
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
    const sceneName = String(payload.sceneName || '');
    if (!sceneName) throw new Error('sceneName is required.');

    if (payload.ensureInput) {
      await ensureSceneAndInput(
        sceneName,
        payload.ensureInput.inputName,
        payload.ensureInput.inputKind || 'browser_source',
        payload.ensureInput.inputSettings || {}
      );
    }

    if (payload.scoreboardOverlay?.enabled && payload.scoreboardOverlay?.url) {
      const sbItemId = await ensureSceneAndInput(
        sceneName,
        payload.scoreboardOverlay.sourceName || 'MaidanLive_Scoreboard_Overlay',
        'browser_source',
        { url: payload.scoreboardOverlay.url, width: 1920, height: 1080, reroute_audio: false }
      );
      if (sbItemId !== null) {
        await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: sbItemId, sceneItemEnabled: true }).catch(() => {});
      }
    }

    await obs.call('SetCurrentProgramScene', { sceneName });
    const verified = await obs.call('GetCurrentProgramScene');
    if (verified.currentProgramSceneName !== sceneName) {
      throw new Error(`Expected scene "${sceneName}", OBS reported "${verified.currentProgramSceneName}".`);
    }
    await emitObsSnapshot();
    const listRes = await obs.call('GetSceneList');
    return {
      verifiedScene: verified.currentProgramSceneName,
      obsScenes: (listRes.scenes || []).map((s) => String(s.sceneName || '')).filter(Boolean),
    };
  }

  if (command === 'apply_layout') {
    const sceneName = String(payload.sceneName || '');
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
          .call('SetSceneItemEnabled', { sceneName, sceneItemId: Number(item.sceneItemId), sceneItemEnabled: false })
          .catch(() => {});
      }
    }

    for (const box of boxes) {
      if (!box.inputName) continue;
      const itemId = await ensureSceneAndInput(
        sceneName,
        box.inputName,
        box.inputKind || 'browser_source',
        box.inputSettings || {}
      );
      if (itemId !== null) {
        await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: itemId, sceneItemEnabled: true });
        await obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: itemId,
          sceneItemTransform: {
            positionX: Number(box.x) || 0,
            positionY: Number(box.y) || 0,
            alignment: 5,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsAlignment: 0,
            boundsWidth: Math.max(64, Number(box.width) || 640),
            boundsHeight: Math.max(64, Number(box.height) || 360),
          },
        });
      }
    }

    if (payload.scoreboardOverlay?.sourceName) {
      const sbName = String(payload.scoreboardOverlay.sourceName);
      if (payload.scoreboardOverlay.enabled && payload.scoreboardOverlay.url) {
        const sbId = await ensureSceneAndInput(sceneName, sbName, 'browser_source', {
          url: payload.scoreboardOverlay.url,
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

  if (command === 'screenshot') {
    const res = await obs.call('GetSourceScreenshot', {
      sourceName: String(payload.sourceName || ''),
      imageFormat: 'jpeg',
      imageWidth: 640,
      imageHeight: 360,
      imageCompressionQuality: 70,
    });
    return { imageData: res.imageData };
  }

  if (command === 'start_stream') {
    await obs.call('StartStream');
    await emitObsSnapshot();
    return { obsStreamActive: true };
  }

  if (command === 'stop_stream') {
    await obs.call('StopStream');
    await emitObsSnapshot();
    return { obsStreamActive: false };
  }

  if (command === 'start_record') {
    await obs.call('StartRecord');
    await emitObsSnapshot();
    return { obsRecordActive: true };
  }

  if (command === 'stop_record') {
    const res = await obs.call('StopRecord');
    await emitObsSnapshot();
    return { obsRecordActive: false, outputPath: res?.outputPath || '' };
  }

  if (command === 'set_input_mute') {
    const inputName = String(payload.inputName || '');
    const inputMuted = Boolean(payload.inputMuted);
    if (!inputName) throw new Error('inputName is required.');
    await obs.call('SetInputMute', { inputName, inputMuted });
    const verify = await obs.call('GetInputMute', { inputName }).catch(() => ({ inputMuted }));
    return { inputName, inputMuted: Boolean(verify.inputMuted) };
  }

  if (command === 'get_input_mute') {
    const inputName = String(payload.inputName || '');
    if (!inputName) throw new Error('inputName is required.');
    const res = await obs.call('GetInputMute', { inputName });
    return { inputName, inputMuted: Boolean(res.inputMuted) };
  }

  throw new Error(`Unsupported command: ${command}`);
}

async function connectObsLoop() {
  if (obsConnected || obsConnecting) return;
  obsConnecting = true;
  emitObsSnapshot().catch(() => {});
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD || undefined, { rpcVersion: 1 });
    obsConnected = true;
    obsConnecting = false;
    lastError = '';
    console.log(`[MaidanLive Agent] Connected to OBS WebSocket at ${OBS_URL}`);
    await emitObsSnapshot();
  } catch (err) {
    obsConnected = false;
    obsConnecting = false;
    lastError = err?.message || `Unable to reach OBS at ${OBS_URL}`;
    console.warn(`[MaidanLive Agent] OBS connect failed: ${lastError}. Retrying in 5s...`);
    await emitObsSnapshot();
    setTimeout(connectObsLoop, 5000);
  }
}

obs.on('ConnectionClosed', (err) => {
  obsConnected = false;
  obsConnecting = false;
  lastError = err?.message || 'OBS WebSocket closed';
  console.warn(`[MaidanLive Agent] OBS closed (${lastError}). Reconnecting in 4s...`);
  emitObsSnapshot().catch(() => {});
  setTimeout(connectObsLoop, 4000);
});

obs.on('CurrentProgramSceneChanged', () => emitObsSnapshot().catch(() => {}));
obs.on('SceneListChanged', () => emitObsSnapshot().catch(() => {}));
obs.on('StreamStateChanged', () => emitObsSnapshot().catch(() => {}));
obs.on('RecordStateChanged', () => emitObsSnapshot().catch(() => {}));

socket.on('connect', () => {
  console.log(`[MaidanLive Agent] Authenticated to ${SERVER_URL}/obs-agent for match ${MATCH_ID}`);
  emitObsSnapshot().catch(() => {});
});

socket.on('connect_error', (err) => {
  console.error(`[MaidanLive Agent] Server connection error: ${err?.message || err}`);
});

socket.on('server:obs_command', async (req, ack) => {
  try {
    const data = await handleCommand(req?.command, req?.payload || {});
    if (typeof ack === 'function') ack({ ok: true, data });
  } catch (err) {
    if (typeof ack === 'function') ack({ ok: false, error: err?.message || 'OBS command failed.' });
  }
});

setInterval(() => {
  if (obsConnected && socket.connected) {
    emitObsSnapshot().catch(() => {});
  }
}, 5000);

connectObsLoop();
