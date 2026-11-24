const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync, spawn } = require('node:child_process');

const MAX_MTX_LOGS = 150;

let managedChild = null;
let managedPid = null;
let activeConfigPath = '';
let lastStartedAt = null;
let lastError = '';
let mtxLogs = [];
let cachedExeVersion = { path: '', mtimeMs: 0, version: '' };

function redactSensitiveText(raw) {
  let text = String(raw || '');
  text = text.replace(/([?&]key=)[^&\s"']+/gi, '$1***');
  text = text.replace(/(:larix:|:obs:)[^\s"'&]+/gi, '$1***');
  text = text.replace(/mllrx_[A-Za-z0-9_-]+/g, 'mllrx_***');
  text = text.replace(/mlbrg_[A-Za-z0-9_-]+/g, 'mlbrg_***');
  return text;
}

function appendMtxLog(level, message, source = 'mediamtx') {
  const clean = redactSensitiveText(String(message || '')).trim();
  if (!clean) return null;
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level: level || 'info',
    source,
    message: clean.slice(0, 500),
  };
  mtxLogs.unshift(entry);
  if (mtxLogs.length > MAX_MTX_LOGS) {
    mtxLogs.length = MAX_MTX_LOGS;
  }
  return entry;
}

function getMediaMTXLogs(limit = 80) {
  const safeLimit = Math.max(1, Math.min(MAX_MTX_LOGS, Number(limit) || 80));
  return mtxLogs.slice(0, safeLimit);
}

function clearMediaMTXLogs() {
  mtxLogs = [];
}

function hasUnsafePathChars(candidate) {
  return /[\r\n\0<>|&;$`]/.test(String(candidate || ''));
}

function isValidMediaMTXBinary(candidate) {
  const clean = typeof candidate === 'string' ? candidate.trim() : '';
  if (!clean || hasUnsafePathChars(clean)) return false;
  try {
    const base = path.basename(clean).toLowerCase();
    if (base !== 'mediamtx.exe' && base !== 'mediamtx') return false;
    const stat = fs.statSync(clean);
    return stat.isFile();
  } catch {
    return false;
  }
}

function isValidMediaMTXConfigPath(candidate, { requireExisting = false } = {}) {
  const clean = typeof candidate === 'string' ? candidate.trim() : '';
  if (!clean || hasUnsafePathChars(clean)) return false;
  try {
    const ext = path.extname(clean).toLowerCase();
    if (ext !== '.yml' && ext !== '.yaml') return false;
    if (!requireExisting) return true;
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

  if (process.platform === 'win32') {
    const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    candidates.push(
      'C:\\MediaMTX\\mediamtx.exe',
      'C:\\mediamtx\\mediamtx.exe',
      path.join(progFiles, 'MediaMTX', 'mediamtx.exe'),
      path.join(progFiles, 'mediamtx', 'mediamtx.exe')
    );
    if (progFilesX86) {
      candidates.push(
        path.join(progFilesX86, 'MediaMTX', 'mediamtx.exe'),
        path.join(progFilesX86, 'mediamtx', 'mediamtx.exe')
      );
    }
    if (localAppData) {
      candidates.push(
        path.join(localAppData, 'Programs', 'MediaMTX', 'mediamtx.exe'),
        path.join(localAppData, 'Programs', 'mediamtx', 'mediamtx.exe')
      );
    }
    if (userDataDir) {
      candidates.push(path.join(userDataDir, 'mediamtx', 'mediamtx.exe'));
    }
    if (userProfile) {
      candidates.push(
        path.join(userProfile, 'MediaMTX', 'mediamtx.exe'),
        path.join(userProfile, 'mediamtx', 'mediamtx.exe'),
        path.join(userProfile, 'Desktop', 'MediaMTX', 'mediamtx.exe'),
        path.join(userProfile, 'Desktop', 'mediamtx', 'mediamtx.exe'),
        path.join(userProfile, 'Downloads', 'MediaMTX', 'mediamtx.exe'),
        path.join(userProfile, 'Downloads', 'mediamtx', 'mediamtx.exe')
      );
    }
  } else {
    if (userDataDir) {
      candidates.push(path.join(userDataDir, 'mediamtx', 'mediamtx'));
    }
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

function resolveMediaMTXConfig({
  executablePath = '',
  configuredConfigPath = '',
  userDataDir = '',
} = {}) {
  if (configuredConfigPath && isValidMediaMTXConfigPath(configuredConfigPath, { requireExisting: true })) {
    return {
      configPath: path.resolve(configuredConfigPath),
      configExists: true,
      configSource: 'custom',
    };
  }

  if (executablePath) {
    const colocated = path.join(path.dirname(executablePath), 'mediamtx.yml');
    if (fs.existsSync(colocated) && isValidMediaMTXConfigPath(colocated, { requireExisting: true })) {
      return {
        configPath: path.resolve(colocated),
        configExists: true,
        configSource: 'colocated',
      };
    }
    const colocatedYaml = path.join(path.dirname(executablePath), 'mediamtx.yaml');
    if (fs.existsSync(colocatedYaml) && isValidMediaMTXConfigPath(colocatedYaml, { requireExisting: true })) {
      return {
        configPath: path.resolve(colocatedYaml),
        configExists: true,
        configSource: 'colocated',
      };
    }
  }

  if (userDataDir) {
    const managedPath = path.join(userDataDir, 'mediamtx', 'mediamtx.yml');
    if (fs.existsSync(managedPath)) {
      return {
        configPath: path.resolve(managedPath),
        configExists: true,
        configSource: 'bridge_managed',
      };
    }
  }

  if (configuredConfigPath && isValidMediaMTXConfigPath(configuredConfigPath)) {
    return {
      configPath: path.resolve(configuredConfigPath),
      configExists: false,
      configSource: 'custom',
    };
  }

  if (executablePath) {
    return {
      configPath: path.resolve(path.join(path.dirname(executablePath), 'mediamtx.yml')),
      configExists: false,
      configSource: 'colocated',
    };
  }

  return {
    configPath: userDataDir ? path.resolve(path.join(userDataDir, 'mediamtx', 'mediamtx.yml')) : '',
    configExists: false,
    configSource: 'none',
  };
}

function parseYamlBool(val, fallback) {
  if (typeof val !== 'string') return fallback;
  const clean = val.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (['yes', 'true', 'on', '1'].includes(clean)) return true;
  if (['no', 'false', 'off', '0'].includes(clean)) return false;
  return fallback;
}

function parseAddressPort(addr, fallbackHost, fallbackPort) {
  const clean = String(addr || '').trim().replace(/^['"]|['"]$/g, '');
  if (!clean) return { host: fallbackHost, port: fallbackPort };
  const lastColon = clean.lastIndexOf(':');
  if (lastColon === -1) {
    return { host: fallbackHost, port: fallbackPort };
  }
  const hostPart = clean.slice(0, lastColon).trim() || fallbackHost;
  const portNum = Number(clean.slice(lastColon + 1).trim());
  return {
    host: hostPart === '0.0.0.0' || hostPart === '::' || hostPart === '[::]' ? '127.0.0.1' : hostPart,
    port: Number.isFinite(portNum) && portNum > 0 && portNum <= 65535 ? portNum : fallbackPort,
  };
}

function inspectMediaMTXYaml(configPath) {
  const defaults = {
    apiEnabled: true,
    apiHost: '127.0.0.1',
    apiPort: 9997,
    apiBase: 'http://127.0.0.1:9997',
    rtmpEnabled: true,
    rtmpPort: 1935,
    srtEnabled: true,
    srtPort: 8890,
    hlsPort: 8888,
    webrtcPort: 8889,
    authMethod: '',
    authHTTPAddress: '',
    authConfigured: false,
  };

  if (!configPath || !fs.existsSync(configPath)) return defaults;

  try {
    const stat = fs.statSync(configPath);
    if (!stat.isFile() || stat.size > 512 * 1024) return defaults;
    const raw = fs.readFileSync(configPath, 'utf8');
    const kv = {};
    for (const rawLine of raw.split(/\r?\n/)) {
      const noComment = rawLine.replace(/#.*$/, '');
      // Parse top-level YAML keys only
      if (!noComment.trim() || /^\s/.test(noComment)) continue;
      const m = noComment.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);
      if (m) {
        kv[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }

    const apiEnabled = kv.api !== undefined ? parseYamlBool(kv.api, false) : false;
    const apiParsed = parseAddressPort(kv.apiAddress, '127.0.0.1', 9997);
    const rtmpEnabled = kv.rtmp !== undefined ? parseYamlBool(kv.rtmp, true) : true;
    const rtmpParsed = parseAddressPort(kv.rtmpAddress, '127.0.0.1', 1935);
    const srtEnabled = kv.srt !== undefined ? parseYamlBool(kv.srt, true) : true;
    const srtParsed = parseAddressPort(kv.srtAddress, '127.0.0.1', 8890);
    const hlsParsed = parseAddressPort(kv.hlsAddress, '127.0.0.1', 8888);
    const webrtcParsed = parseAddressPort(kv.webrtcAddress, '127.0.0.1', 8889);
    const authMethod = String(kv.authMethod || '').toLowerCase();
    const authHTTPAddress = String(kv.authHTTPAddress || '');
    const authConfigured =
      authMethod === 'http' && authHTTPAddress.toLowerCase().includes('/api/v1/mediamtx/auth');

    return {
      apiEnabled,
      apiHost: apiParsed.host,
      apiPort: apiParsed.port,
      apiBase: `http://${apiParsed.host}:${apiParsed.port}`,
      rtmpEnabled,
      rtmpPort: rtmpParsed.port,
      srtEnabled,
      srtPort: srtParsed.port,
      hlsPort: hlsParsed.port,
      webrtcPort: webrtcParsed.port,
      authMethod,
      authHTTPAddress,
      authConfigured,
    };
  } catch {
    return defaults;
  }
}

async function detectMediaMTXBinaryVersion(exePath) {
  if (!exePath || !isValidMediaMTXBinary(exePath)) return '';
  try {
    const stat = fs.statSync(exePath);
    if (cachedExeVersion.path === exePath && cachedExeVersion.mtimeMs === stat.mtimeMs) {
      return cachedExeVersion.version;
    }
    const out = await new Promise((resolve) => {
      execFile(
        exePath,
        ['--version'],
        { timeout: 1200, windowsHide: true },
        (err, stdout, stderr) => {
          if (err && !stdout && !stderr) {
            resolve('');
            return;
          }
          resolve(String(stdout || stderr || '').trim());
        }
      );
    });
    const match = out.match(/v?\d+\.\d+\.\d+(?:[-+._a-zA-Z0-9]+)?/);
    const version = match ? match[0] : out.split(/\r?\n/)[0]?.slice(0, 40) || '';
    cachedExeVersion = { path: exePath, mtimeMs: stat.mtimeMs, version };
    return version;
  } catch {
    return '';
  }
}

function findRunningMediaMTXPids() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile(
        'tasklist',
        ['/FI', 'IMAGENAME eq mediamtx.exe', '/FO', 'CSV', '/NH'],
        { timeout: 2000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            resolve([]);
            return;
          }
          const pids = [];
          for (const line of String(stdout || '').split(/\r?\n/)) {
            const cols = line.split('","').map((c) => c.replace(/^"|"$/g, '').trim());
            if (cols[0]?.toLowerCase() === 'mediamtx.exe') {
              const pid = Number(cols[1]);
              if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) {
                pids.push(pid);
              }
            }
          }
          resolve(Array.from(new Set(pids)));
        }
      );
      return;
    }

    execFile('pgrep', ['-x', 'mediamtx'], { timeout: 1500 }, (err, stdout) => {
      if (err) {
        resolve([]);
        return;
      }
      const pids = String(stdout || '')
        .split(/\r?\n/)
        .map((s) => Number(s.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
      resolve(Array.from(new Set(pids)));
    });
  });
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

function writeManagedConfig(
  serverUrl,
  userDataDir,
  { configuredPath = '', configuredConfigPath = '', createBackup = true } = {}
) {
  const yaml = buildMediaMTXYaml(serverUrl);
  const exePath = findMediaMTXExecutable(configuredPath, userDataDir);

  const candidates = [];
  if (configuredConfigPath && isValidMediaMTXConfigPath(configuredConfigPath)) {
    candidates.push({
      targetPath: path.resolve(configuredConfigPath),
      source: 'custom',
    });
  } else if (exePath) {
    candidates.push({
      targetPath: path.resolve(path.join(path.dirname(exePath), 'mediamtx.yml')),
      source: 'colocated',
    });
  }
  if (userDataDir) {
    candidates.push({
      targetPath: path.resolve(path.join(userDataDir, 'mediamtx', 'mediamtx.yml')),
      source: 'bridge_managed',
    });
  }

  let lastWriteErr = null;
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate.targetPath), { recursive: true });
      if (createBackup && fs.existsSync(candidate.targetPath)) {
        const current = fs.readFileSync(candidate.targetPath, 'utf8');
        const backupPath = `${candidate.targetPath}.maidanlive.bak`;
        if (current !== yaml && !fs.existsSync(backupPath)) {
          fs.writeFileSync(backupPath, current, { encoding: 'utf8', mode: 0o600 });
        }
      }
      fs.writeFileSync(candidate.targetPath, yaml, { encoding: 'utf8', mode: 0o600 });
      appendMtxLog('info', `Synced MediaMTX configuration at ${candidate.targetPath}`, 'bridge');
      return {
        configPath: candidate.targetPath,
        configSource: candidate.source,
        yaml,
      };
    } catch (err) {
      lastWriteErr = err;
    }
  }

  throw lastWriteErr || new Error('Unable to write mediamtx.yml on this PC.');
}

async function getMediaMTXStatus({
  configuredPath = '',
  configuredConfigPath = '',
  userDataDir = '',
  apiBase = '',
} = {}) {
  const executablePath = findMediaMTXExecutable(configuredPath, userDataDir);
  const cfgResolved = resolveMediaMTXConfig({
    executablePath,
    configuredConfigPath,
    userDataDir,
  });
  const effectiveConfigPath =
    activeConfigPath && fs.existsSync(activeConfigPath)
      ? activeConfigPath
      : cfgResolved.configPath;
  const yamlMeta = inspectMediaMTXYaml(effectiveConfigPath);
  const resolvedApiBase = apiBase || yamlMeta.apiBase || 'http://127.0.0.1:9997';

  const [rtmpOpen, srtOpen, apiPortOpen, apiResult, detectedPids, version] = await Promise.all([
    checkTcpPort('127.0.0.1', yamlMeta.rtmpPort),
    checkTcpPort('127.0.0.1', yamlMeta.srtPort),
    checkTcpPort(yamlMeta.apiHost, yamlMeta.apiPort),
    fetchMediaMTXPaths(resolvedApiBase),
    findRunningMediaMTXPids(),
    executablePath ? detectMediaMTXBinaryVersion(executablePath) : Promise.resolve(''),
  ]);

  const managedAlive = Boolean(managedChild && managedChild.exitCode === null && !managedChild.killed);
  const running = Boolean(
    managedAlive || detectedPids.length > 0 || apiResult.reachable || rtmpOpen
  );

  return {
    installed: Boolean(executablePath),
    executablePath,
    version,
    running,
    managedByBridge: managedAlive,
    managedPid,
    detectedPids,
    rtmpPort: yamlMeta.rtmpPort,
    srtPort: yamlMeta.srtPort,
    apiPort: yamlMeta.apiPort,
    rtmpPortOpen: rtmpOpen,
    srtPortOpen: srtOpen,
    apiPortOpen,
    apiReachable: apiResult.reachable,
    apiConfigured: yamlMeta.apiEnabled,
    authConfigured: yamlMeta.authConfigured,
    activePaths: apiResult.paths,
    activePathCount: apiResult.paths.length,
    lanIps: detectLanIps(),
    configPath: cfgResolved.configExists ? cfgResolved.configPath : effectiveConfigPath || '',
    configExists: cfgResolved.configExists,
    configSource: cfgResolved.configSource,
    managedConfigPath:
      userDataDir && fs.existsSync(path.join(userDataDir, 'mediamtx', 'mediamtx.yml'))
        ? path.join(userDataDir, 'mediamtx', 'mediamtx.yml')
        : '',
    lastStartedAt,
    lastError,
    checkedAt: new Date().toISOString(),
    recentLogs: getMediaMTXLogs(35),
  };
}

async function startMediaMTX({
  serverUrl,
  configuredPath = '',
  configuredConfigPath = '',
  userDataDir = '',
  onLog,
} = {}) {
  const log = typeof onLog === 'function' ? onLog : () => {};
  const exePath = findMediaMTXExecutable(configuredPath, userDataDir);
  if (!exePath) {
    const msg =
      'MediaMTX executable (mediamtx.exe) was not found on this PC. Install/place mediamtx.exe in C:\\MediaMTX\\ or set its path in OBS Bridge.';
    lastError = msg;
    appendMtxLog('error', msg, 'bridge');
    throw new Error(msg);
  }

  const existingStatus = await getMediaMTXStatus({
    configuredPath: exePath,
    configuredConfigPath,
    userDataDir,
  });
  if (existingStatus.running) {
    appendMtxLog('info', 'MediaMTX is already running; skipping duplicate start.', 'bridge');
    return existingStatus;
  }

  const cfgResolved = resolveMediaMTXConfig({
    executablePath: exePath,
    configuredConfigPath,
    userDataDir,
  });

  let configPathToUse = cfgResolved.configExists ? cfgResolved.configPath : '';
  if (!configPathToUse) {
    if (!serverUrl) {
      throw new Error('Pair OBS Bridge with MaidanLive Server URL or create mediamtx.yml before starting MediaMTX.');
    }
    const written = writeManagedConfig(serverUrl, userDataDir, {
      configuredPath: exePath,
      configuredConfigPath,
    });
    configPathToUse = written.configPath;
  }

  activeConfigPath = configPathToUse;
  lastError = '';
  appendMtxLog('info', `Starting ${exePath} with config ${configPathToUse}`, 'bridge');
  log('info', `[MediaMTX] Starting ${path.basename(exePath)} using ${configPathToUse}`);

  const child = spawn(exePath, [configPathToUse], {
    cwd: path.dirname(configPathToUse),
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  managedChild = child;
  managedPid = child.pid || null;
  lastStartedAt = new Date().toISOString();

  const handleOutputChunk = (level, chunk) => {
    const raw = String(chunk || '');
    for (const rawLine of raw.split(/\r?\n/)) {
      const clean = redactSensitiveText(rawLine).trim();
      if (!clean) continue;
      const inferredLevel = /\b(ERR|ERROR|FATAL|PANIC)\b/i.test(clean)
        ? 'error'
        : /\b(WRN|WARN)\b/i.test(clean)
          ? 'warn'
          : level;
      appendMtxLog(inferredLevel, clean, 'mediamtx');
      if (inferredLevel === 'error' || inferredLevel === 'warn') {
        lastError = clean.slice(0, 280);
      }
      log(inferredLevel, `[MediaMTX] ${clean.slice(0, 240)}`);
    }
  };

  child.stdout?.on('data', (chunk) => handleOutputChunk('info', chunk));
  child.stderr?.on('data', (chunk) => handleOutputChunk('warn', chunk));
  child.on('exit', (code, signal) => {
    const exitMsg = `Process exited (code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''}).`;
    appendMtxLog(code && code !== 0 ? 'warn' : 'info', exitMsg, 'mediamtx');
    log(code && code !== 0 ? 'warn' : 'info', `[MediaMTX] ${exitMsg}`);
    if (managedChild === child) {
      managedChild = null;
      managedPid = null;
    }
  });
  child.on('error', (err) => {
    lastError = err?.message || 'Failed to spawn MediaMTX';
    appendMtxLog('error', lastError, 'bridge');
    log('error', `[MediaMTX] ${lastError}`);
    if (managedChild === child) {
      managedChild = null;
      managedPid = null;
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 950));
  return await getMediaMTXStatus({
    configuredPath: exePath,
    configuredConfigPath,
    userDataDir,
  });
}

async function stopPidSafely(pid) {
  const safePid = Number(pid);
  if (!Number.isInteger(safePid) || safePid <= 0 || safePid === process.pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      execFile('taskkill', ['/PID', String(safePid), '/T'], { timeout: 2500, windowsHide: true }, () =>
        resolve()
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await new Promise((resolve) => {
      execFile(
        'taskkill',
        ['/PID', String(safePid), '/T', '/F'],
        { timeout: 2500, windowsHide: true },
        () => resolve()
      );
    });
    return;
  }

  try {
    process.kill(safePid, 'SIGTERM');
  } catch {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
  try {
    process.kill(safePid, 0);
    process.kill(safePid, 'SIGKILL');
  } catch {
    // Process already stopped
  }
}

async function stopMediaMTX({
  configuredPath = '',
  configuredConfigPath = '',
  userDataDir = '',
  onlyManaged = false,
  onLog,
} = {}) {
  const log = typeof onLog === 'function' ? onLog : () => {};
  const hadManaged = Boolean(managedChild && managedChild.exitCode === null && !managedChild.killed);

  if (hadManaged) {
    appendMtxLog('info', `Stopping bridge-managed MediaMTX (PID ${managedPid || 'unknown'})...`, 'bridge');
    log('info', `[MediaMTX] Stopping MediaMTX process...`);
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
      if (managedPid) {
        await stopPidSafely(managedPid);
      }
    }
  }
  managedChild = null;
  managedPid = null;

  if (!onlyManaged) {
    const externalPids = await findRunningMediaMTXPids();
    if (externalPids.length > 0) {
      appendMtxLog(
        'info',
        `Stopping running MediaMTX process(es): PID ${externalPids.join(', ')}`,
        'bridge'
      );
      log('info', `[MediaMTX] Stopping running MediaMTX process(es): ${externalPids.join(', ')}`);
      for (const pid of externalPids) {
        await stopPidSafely(pid);
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  return await getMediaMTXStatus({
    configuredPath,
    configuredConfigPath,
    userDataDir,
  });
}

async function restartMediaMTX({
  serverUrl,
  configuredPath = '',
  configuredConfigPath = '',
  userDataDir = '',
  onLog,
} = {}) {
  const log = typeof onLog === 'function' ? onLog : () => {};
  appendMtxLog('info', 'Restarting MediaMTX...', 'bridge');
  log('info', '[MediaMTX] Restarting MediaMTX receiver...');
  await stopMediaMTX({
    configuredPath,
    configuredConfigPath,
    userDataDir,
    onlyManaged: false,
    onLog: log,
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  return await startMediaMTX({
    serverUrl,
    configuredPath,
    configuredConfigPath,
    userDataDir,
    onLog: log,
  });
}

module.exports = {
  isValidMediaMTXBinary,
  isValidMediaMTXConfigPath,
  detectLanIps,
  findMediaMTXExecutable,
  resolveMediaMTXConfig,
  inspectMediaMTXYaml,
  buildMediaMTXYaml,
  writeManagedConfig,
  getMediaMTXStatus,
  startMediaMTX,
  stopMediaMTX,
  restartMediaMTX,
  getMediaMTXLogs,
  clearMediaMTXLogs,
};
