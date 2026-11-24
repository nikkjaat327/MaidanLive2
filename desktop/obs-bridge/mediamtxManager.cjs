const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

let managedChild = null;
let managedPid = null;
let lastStartedAt = null;
let lastError = '';

function isValidMediaMTXBinary(candidate) {
  const clean = typeof candidate === 'string' ? candidate.trim() : '';
  if (!clean || /[\r\n\0<>|&;$`]/.test(clean)) return false;
  try {
    const base = path.basename(clean).toLowerCase();
    if (base !== 'mediamtx.exe' && base !== 'mediamtx') return false;
    const stat = fs.statSync(clean);
    return stat.isFile();
  } catch {
    return false;
  }
}

function detectLanIps() {
  try {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const entries of Object.values(nets)) {
      for (const netInfo of entries || []) {
        if (netInfo.family === 'IPv4' && !netInfo.internal && netInfo.address) {
          if (!ips.includes(netInfo.address)) {
            ips.push(netInfo.address);
          }
        }
      }
    }
    return ips;
  } catch {
    return [];
  }
}

function findMediaMTXExecutable(configuredPath, userDataDir) {
  const candidates = [];
  if (configuredPath) candidates.push(String(configuredPath).trim());

  if (process.env.MEDIAMTX_PATH) candidates.push(process.env.MEDIAMTX_PATH.trim());

  if (userDataDir) {
    candidates.push(
      path.join(userDataDir, 'mediamtx', process.platform === 'win32' ? 'mediamtx.exe' : 'mediamtx')
    );
  }

  if (process.platform === 'win32') {
    const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    candidates.push(
      path.join(progFiles, 'mediamtx', 'mediamtx.exe'),
      path.join(progFiles, 'MediaMTX', 'mediamtx.exe'),
      'C:\\mediamtx\\mediamtx.exe',
      'C:\\MediaMTX\\mediamtx.exe'
    );
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'mediamtx', 'mediamtx.exe'));
    }
    if (userProfile) {
      candidates.push(
        path.join(userProfile, 'mediamtx', 'mediamtx.exe'),
        path.join(userProfile, 'Desktop', 'mediamtx', 'mediamtx.exe'),
        path.join(userProfile, 'Downloads', 'mediamtx', 'mediamtx.exe')
      );
    }
  } else {
    candidates.push(
      '/usr/local/bin/mediamtx',
      '/usr/bin/mediamtx',
      '/opt/homebrew/bin/mediamtx',
      '/opt/mediamtx/mediamtx'
    );
  }

  for (const candidate of candidates) {
    if (isValidMediaMTXBinary(candidate)) {
      return path.resolve(candidate);
    }
  }

  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const arg = process.platform === 'win32' ? 'mediamtx.exe' : 'mediamtx';
    const out = execFileSync(cmd, [arg], { encoding: 'utf8', timeout: 1500, windowsHide: true });
    const firstLine = String(out || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (firstLine && isValidMediaMTXBinary(firstLine)) {
      return path.resolve(firstLine);
    }
  } catch {
    // Not in PATH; ignore cleanly
  }

  return '';
}

function checkTcpPort(host, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function fetchMediaMTXPaths(apiBase = 'http://127.0.0.1:9997') {
  try {
    const cleanBase = String(apiBase || 'http://127.0.0.1:9997').replace(/\/+$/, '');
    const res = await fetch(`${cleanBase}/v3/paths/list`, {
      method: 'GET',
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return { reachable: false, paths: [] };
    const json = await res.json().catch(() => ({}));
    const items = Array.isArray(json?.items) ? json.items : [];
    const paths = items
      .map((item) => ({
        name: String(item?.name || '').trim(),
        ready: Boolean(item?.ready),
        sourceType: String(item?.source?.type || '').trim(),
        bytesReceived: Number(item?.bytesReceived || 0),
        readersCount: Array.isArray(item?.readers) ? item.readers.length : 0,
      }))
      .filter((p) => Boolean(p.name));
    return { reachable: true, paths };
  } catch {
    return { reachable: false, paths: [] };
  }
}

function buildMediaMTXYaml(serverUrl) {
  const cleanServer = String(serverUrl || 'http://127.0.0.1:3000').trim().replace(/\/+$/, '');
  const parsed = new URL(cleanServer);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('MaidanLive server URL must start with http:// or https://');
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

function writeManagedConfig(serverUrl, userDataDir) {
  const dir = path.join(userDataDir, 'mediamtx');
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, 'mediamtx.yml');
  const yaml = buildMediaMTXYaml(serverUrl);
  fs.writeFileSync(configPath, yaml, { encoding: 'utf8', mode: 0o600 });
  return { configPath, yaml };
}

async function getMediaMTXStatus({ configuredPath = '', userDataDir = '', apiBase = 'http://127.0.0.1:9997' } = {}) {
  const executablePath = findMediaMTXExecutable(configuredPath, userDataDir);
  const [rtmpOpen, srtOpen, apiPortOpen, apiResult] = await Promise.all([
    checkTcpPort('127.0.0.1', 1935),
    checkTcpPort('127.0.0.1', 8890),
    checkTcpPort('127.0.0.1', 9997),
    fetchMediaMTXPaths(apiBase),
  ]);

  const running = Boolean(
    (managedChild && managedChild.exitCode === null && !managedChild.killed) ||
      apiResult.reachable ||
      rtmpOpen
  );

  const configPath = userDataDir ? path.join(userDataDir, 'mediamtx', 'mediamtx.yml') : '';
  return {
    installed: Boolean(executablePath),
    executablePath,
    running,
    managedByBridge: Boolean(managedChild && managedChild.exitCode === null && !managedChild.killed),
    managedPid,
    rtmpPortOpen: rtmpOpen,
    srtPortOpen: srtOpen,
    apiPortOpen,
    apiReachable: apiResult.reachable,
    activePaths: apiResult.paths,
    lanIps: detectLanIps(),
    configPath: configPath && fs.existsSync(configPath) ? configPath : '',
    lastStartedAt,
    lastError,
  };
}

async function startMediaMTX({
  serverUrl,
  configuredPath = '',
  userDataDir,
  onLog,
}) {
  const log = typeof onLog === 'function' ? onLog : () => {};
  const exePath = findMediaMTXExecutable(configuredPath, userDataDir);
  if (!exePath) {
    const msg =
      'MediaMTX executable was not found on this PC. Install MediaMTX or set its path in OBS Bridge.';
    lastError = msg;
    throw new Error(msg);
  }
  if (!serverUrl) {
    throw new Error('Pair OBS Bridge with MaidanLive Server URL before starting MediaMTX.');
  }

  const existingStatus = await getMediaMTXStatus({ configuredPath: exePath, userDataDir });
  if (existingStatus.running) {
    return existingStatus;
  }

  const { configPath } = writeManagedConfig(serverUrl, userDataDir);
  lastError = '';

  const child = spawn(exePath, [configPath], {
    cwd: path.dirname(configPath),
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  managedChild = child;
  managedPid = child.pid || null;
  lastStartedAt = new Date().toISOString();

  child.stdout?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) log('info', `[MediaMTX] ${line.slice(0, 240)}`);
  });
  child.stderr?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) {
      lastError = line.slice(0, 240);
      log('warn', `[MediaMTX] ${lastError}`);
    }
  });
  child.on('exit', (code) => {
    log('info', `[MediaMTX] Process exited (code ${code ?? 'null'}).`);
    if (managedChild === child) {
      managedChild = null;
      managedPid = null;
    }
  });
  child.on('error', (err) => {
    lastError = err?.message || 'Failed to spawn MediaMTX';
    log('error', `[MediaMTX] ${lastError}`);
    if (managedChild === child) {
      managedChild = null;
      managedPid = null;
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 900));
  return await getMediaMTXStatus({ configuredPath: exePath, userDataDir });
}

async function stopMediaMTX({ configuredPath = '', userDataDir = '' } = {}) {
  if (managedChild && managedChild.exitCode === null && !managedChild.killed) {
    try {
      managedChild.kill('SIGTERM');
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
    if (managedChild && managedChild.exitCode === null && !managedChild.killed) {
      try {
        managedChild.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  }
  managedChild = null;
  managedPid = null;
  return await getMediaMTXStatus({ configuredPath, userDataDir });
}

module.exports = {
  isValidMediaMTXBinary,
  detectLanIps,
  findMediaMTXExecutable,
  buildMediaMTXYaml,
  writeManagedConfig,
  getMediaMTXStatus,
  startMediaMTX,
  stopMediaMTX,
};
