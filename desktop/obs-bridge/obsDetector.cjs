const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');

function getWindowsObsCandidates() {
  const candidates = [];
  if (process.env.ProgramFiles) {
    candidates.push(path.join(process.env.ProgramFiles, 'obs-studio', 'bin', '64bit', 'obs64.exe'));
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(
      path.join(process.env['ProgramFiles(x86)'], 'obs-studio', 'bin', '64bit', 'obs64.exe')
    );
  }
  if (process.env.LOCALAPPDATA) {
    candidates.push(
      path.join(process.env.LOCALAPPDATA, 'Programs', 'obs-studio', 'bin', '64bit', 'obs64.exe')
    );
  }
  candidates.push('C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe');
  return Array.from(new Set(candidates));
}

function findInstalledObsExecutable() {
  if (process.platform === 'win32') {
    for (const candidate of getWindowsObsCandidates()) {
      try {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      } catch {
        // ignore permission error
      }
    }
    return '';
  }
  if (process.platform === 'darwin') {
    const macApp = '/Applications/OBS.app/Contents/MacOS/OBS';
    return fs.existsSync(macApp) ? macApp : '';
  }
  const linuxCandidates = ['/usr/bin/obs', '/usr/local/bin/obs', '/snap/bin/obs-studio'];
  return linuxCandidates.find((p) => fs.existsSync(p)) || '';
}

function checkObsProcessRunning() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile(
        'tasklist',
        ['/FI', 'IMAGENAME eq obs64.exe', '/NH'],
        { windowsHide: true, timeout: 2500 },
        (err, stdout) => {
          if (err) {
            resolve(false);
            return;
          }
          resolve(String(stdout || '').toLowerCase().includes('obs64.exe'));
        }
      );
      return;
    }
    execFile('pgrep', ['-x', 'obs'], { timeout: 2000 }, (err) => {
      resolve(!err);
    });
  });
}

function readObsWebSocketSettingsReadOnly() {
  try {
    const appData =
      process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : path.join(os.homedir(), '.config');

    const wsConfigPath = path.join(appData, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
    if (fs.existsSync(wsConfigPath)) {
      const parsed = JSON.parse(fs.readFileSync(wsConfigPath, 'utf8'));
      return {
        configFound: true,
        serverEnabled:
          typeof parsed.server_enabled === 'boolean' ? parsed.server_enabled : null,
        serverPort: Number(parsed.server_port) || 4455,
        authRequired:
          typeof parsed.auth_required === 'boolean' ? parsed.auth_required : null,
      };
    }

    const globalIniPath = path.join(appData, 'obs-studio', 'global.ini');
    if (fs.existsSync(globalIniPath)) {
      const content = fs.readFileSync(globalIniPath, 'utf8');
      const enabledMatch = content.match(/ServerEnabled=(true|false)/i);
      const portMatch = content.match(/ServerPort=(\d+)/i);
      const authMatch = content.match(/AuthRequired=(true|false)/i);
      if (enabledMatch || portMatch || authMatch) {
        return {
          configFound: true,
          serverEnabled: enabledMatch ? enabledMatch[1].toLowerCase() === 'true' : null,
          serverPort: portMatch ? Number(portMatch[1]) || 4455 : 4455,
          authRequired: authMatch ? authMatch[1].toLowerCase() === 'true' : null,
        };
      }
    }
  } catch {
    // Read-only best effort
  }
  return {
    configFound: false,
    serverEnabled: null,
    serverPort: 4455,
    authRequired: null,
  };
}

function checkTcpPortOpen(host = '127.0.0.1', port = 4455) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, 900);
    sock.on('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(false);
    });
  });
}

async function detectObsEnvironment(obsUrl = 'ws://127.0.0.1:4455') {
  let host = '127.0.0.1';
  let port = 4455;
  try {
    const parsed = new URL(obsUrl);
    host = parsed.hostname || '127.0.0.1';
    port = Number(parsed.port) || 4455;
  } catch {
    // default
  }

  const executablePath = findInstalledObsExecutable();
  const [running, portOpen] = await Promise.all([
    checkObsProcessRunning(),
    checkTcpPortOpen(host, port),
  ]);
  const wsMeta = readObsWebSocketSettingsReadOnly();

  return {
    installed: Boolean(executablePath),
    executablePath,
    running: Boolean(running || portOpen),
    wsPortOpen: Boolean(portOpen),
    obsUrl: `ws://${host}:${port}`,
    wsPort: port,
    wsConfigFound: wsMeta.configFound,
    wsServerEnabled: wsMeta.serverEnabled,
    wsAuthRequired: wsMeta.authRequired,
  };
}

function launchObsStudio() {
  const exe = findInstalledObsExecutable();
  if (!exe || !fs.existsSync(exe)) {
    return {
      ok: false,
      message: 'OBS Studio executable was not found in standard Windows install folders. Please open OBS Studio manually.',
    };
  }
  try {
    const child = spawn(exe, [], {
      cwd: path.dirname(exe),
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
    return { ok: true, executablePath: exe };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || 'Failed to launch OBS Studio.',
    };
  }
}

module.exports = {
  detectObsEnvironment,
  launchObsStudio,
};
