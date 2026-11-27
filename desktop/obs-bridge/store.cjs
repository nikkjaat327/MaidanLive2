const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let app = null;
let safeStorage = null;
try {
  ({ app, safeStorage } = require('electron'));
} catch {
  // Running outside Electron runtime (e.g., Node test runner)
}

function getUserDataDir() {
  if (app && typeof app.getPath === 'function') {
    return app.getPath('userData');
  }
  return path.join(os.tmpdir(), 'maidanlive-obs-bridge');
}

function getConfigFilePath() {
  return path.join(getUserDataDir(), 'bridge-config.json');
}

function defaultConfig() {
  return {
    serverUrl: '',
    bridgeId: '',
    bridgeToken: '',
    label: `${os.hostname()} (${process.platform === 'win32' ? 'Windows PC' : process.platform})`,
    obsUrl: 'ws://127.0.0.1:4455',
    obsPassword: '',
    mediamtxPath: '',
    mediamtxConfigPath: '',
    autoStart: false,
    adminDisconnected: false,
    obsManuallyDisconnected: false,
    primaryAudioInput: '',
    activeMatch: null,
    pairedAt: null,
  };
}

function encryptValue(plain) {
  const raw = String(plain || '');
  if (!raw) return { mode: 'empty', value: '' };
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      const buf = safeStorage.encryptString(raw);
      return { mode: 'dpapi', value: buf.toString('base64') };
    }
  } catch {
    // Fallback below if OS keyring/DPAPI is unavailable
  }
  return { mode: 'plain', value: raw };
}

function decryptValue(record) {
  if (!record || typeof record !== 'object') return '';
  const value = String(record.value || '');
  if (!value) return '';
  if (record.mode === 'dpapi') {
    try {
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
      }
    } catch {
      return '';
    }
  }
  if (record.mode === 'plain') {
    return value;
  }
  return '';
}

function loadConfig() {
  const filePath = getConfigFilePath();
  const base = defaultConfig();
  if (!fs.existsSync(filePath)) {
    return base;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;

    const bridgeToken = parsed.bridgeTokenEnc
      ? decryptValue(parsed.bridgeTokenEnc)
      : String(parsed.bridgeToken || '');

    const obsPassword = parsed.obsPasswordEnc
      ? decryptValue(parsed.obsPasswordEnc)
      : String(parsed.obsPassword || '');

    return {
      ...base,
      serverUrl: String(parsed.serverUrl || '').trim().replace(/\/+$/, ''),
      bridgeId: String(parsed.bridgeId || '').trim().toUpperCase(),
      bridgeToken: String(bridgeToken || '').trim(),
      label: String(parsed.label || base.label).trim(),
      obsUrl: String(parsed.obsUrl || base.obsUrl).trim() || 'ws://127.0.0.1:4455',
      obsPassword: String(obsPassword || ''),
      mediamtxPath: String(parsed.mediamtxPath || '').trim(),
      mediamtxConfigPath: String(parsed.mediamtxConfigPath || '').trim(),
      autoStart: Boolean(parsed.autoStart),
      adminDisconnected: Boolean(parsed.adminDisconnected),
      obsManuallyDisconnected: Boolean(parsed.obsManuallyDisconnected),
      primaryAudioInput: String(parsed.primaryAudioInput || '').trim(),
      activeMatch: parsed.activeMatch || null,
      pairedAt: parsed.pairedAt || null,
    };
  } catch {
    return base;
  }
}

function saveConfig(patch) {
  const current = loadConfig();
  const next = {
    ...current,
    ...patch,
  };
  next.serverUrl = String(next.serverUrl || '').trim().replace(/\/+$/, '');
  next.bridgeId = String(next.bridgeId || '').trim().toUpperCase();
  next.bridgeToken = String(next.bridgeToken || '').trim();
  next.obsUrl = String(next.obsUrl || 'ws://127.0.0.1:4455').trim() || 'ws://127.0.0.1:4455';
  next.mediamtxPath = String(next.mediamtxPath || '').trim();
  next.mediamtxConfigPath = String(next.mediamtxConfigPath || '').trim();
  next.label = String(next.label || defaultConfig().label).trim();
  next.autoStart = Boolean(next.autoStart);
  next.adminDisconnected = Boolean(next.adminDisconnected);
  next.obsManuallyDisconnected = Boolean(next.obsManuallyDisconnected);
  next.primaryAudioInput = String(next.primaryAudioInput || '').trim();

  const persisted = {
    version: 2,
    serverUrl: next.serverUrl,
    bridgeId: next.bridgeId,
    bridgeTokenEnc: encryptValue(next.bridgeToken),
    label: next.label,
    obsUrl: next.obsUrl,
    obsPasswordEnc: encryptValue(next.obsPassword),
    mediamtxPath: next.mediamtxPath,
    mediamtxConfigPath: next.mediamtxConfigPath,
    autoStart: next.autoStart,
    adminDisconnected: next.adminDisconnected,
    obsManuallyDisconnected: next.obsManuallyDisconnected,
    primaryAudioInput: next.primaryAudioInput,
    activeMatch: next.activeMatch || null,
    pairedAt: next.pairedAt || null,
    updatedAt: new Date().toISOString(),
  };

  const filePath = getConfigFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(persisted, null, 2), { encoding: 'utf8', mode: 0o600 });
  return next;
}

function clearPairing() {
  return saveConfig({
    bridgeId: '',
    bridgeToken: '',
    adminDisconnected: false,
    obsManuallyDisconnected: false,
    activeMatch: null,
    pairedAt: null,
  });
}

function hasPairedCredentials(cfg) {
  return Boolean(cfg && cfg.serverUrl && cfg.bridgeId && cfg.bridgeToken);
}

module.exports = {
  getUserDataDir,
  loadConfig,
  saveConfig,
  clearPairing,
  hasPairedCredentials,
};
