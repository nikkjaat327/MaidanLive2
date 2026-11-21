const path = require('node:path');
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { BridgeEngine } = require('./bridgeEngine.cjs');
const { startLocalBridgeServer } = require('./localServer.cjs');
const { launchObsStudio } = require('./obsDetector.cjs');
const { loadConfig, saveConfig, hasPairedCredentials } = require('./store.cjs');

let mainWindow = null;
let tray = null;
let localServer = null;
let isQuitting = false;
let pendingProtocolUrl = '';

const engine = new BridgeEngine();

function extractProtocolArg(argv) {
  if (!Array.isArray(argv)) return '';
  return argv.find((a) => typeof a === 'string' && a.startsWith('maidanlive-bridge://')) || '';
}

function parseProtocolUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'maidanlive-bridge:') return null;
    const code = (parsed.searchParams.get('code') || '').trim();
    const server = (parsed.searchParams.get('server') || '').trim();
    const matchId = (parsed.searchParams.get('matchId') || '').trim();
    if (!server) return null;
    const serverParsed = new URL(server);
    if (!['http:', 'https:'].includes(serverParsed.protocol)) return null;
    return {
      code,
      serverUrl: server.replace(/\/+$/, ''),
      matchId,
    };
  } catch {
    return null;
  }
}

async function handleProtocolDeepLink(rawUrl) {
  const parsed = parseProtocolUrl(rawUrl);
  if (!parsed) return;

  showMainWindow();

  if (parsed.code && parsed.serverUrl) {
    try {
      await engine.pairWithCode({ code: parsed.code, serverUrl: parsed.serverUrl });
      return;
    } catch (err) {
      engine.log('warn', `Auto-pairing from link fell back to manual screen: ${err?.message || err}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bridge:protocol-prefill', {
          ...parsed,
          error: err?.message || 'Pairing link expired or already used.',
        });
      }
      return;
    }
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('bridge:protocol-prefill', parsed);
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(false);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  const st = engine.getState();
  const statusLabel = !st.paired
    ? 'Status: Not Paired'
    : st.serverConnected && st.obsConnected
      ? `LIVE Ready · OBS Connected (${st.obsScenes.length} scenes)`
      : st.serverConnected
        ? 'MaidanLive Online · Waiting for OBS'
        : 'Reconnecting to MaidanLive...';

  tray.setToolTip(`MaidanLive OBS Bridge — ${statusLabel}`);
  const menu = Menu.buildFromTemplate([
    { label: 'MaidanLive OBS Bridge', enabled: false },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Open Bridge Window', click: () => showMainWindow() },
    {
      label: 'Reconnect Local OBS',
      enabled: st.paired,
      click: () => engine.reconnectObsNow().catch(() => {}),
    },
    {
      label: 'Reconnect MaidanLive',
      enabled: st.paired,
      click: () => engine.connectServerSocket(),
    },
    { type: 'separator' },
    {
      label: 'Quit MaidanLive Bridge',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const img = nativeImage.createFromPath(iconPath);
  tray = new Tray(img);
  tray.on('double-click', () => showMainWindow());
  updateTrayMenu();
}

function createMainWindow(startHidden = false) {
  const winIcon = path.join(__dirname, 'assets', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 780,
    minHeight: 580,
    show: !startHidden,
    backgroundColor: '#0B0F17',
    icon: winIcon,
    title: 'MaidanLive OBS Bridge',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (ev, targetUrl) => {
    if (!targetUrl.startsWith('file://')) {
      ev.preventDefault();
    }
  });

  mainWindow.on('close', (ev) => {
    const cfg = loadConfig();
    if (!isQuitting && hasPairedCredentials(cfg)) {
      ev.preventDefault();
      mainWindow.hide();
      engine.log('info', 'Minimized MaidanLive OBS Bridge to system tray.');
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingProtocolUrl) {
      const urlToHandle = pendingProtocolUrl;
      pendingProtocolUrl = '';
      handleProtocolDeepLink(urlToHandle).catch(() => {});
    }
  });
}

function applyAutoStartSetting(enabled) {
  try {
    if (process.platform === 'win32' || process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        args: ['--hidden'],
      });
    }
  } catch (err) {
    engine.log('warn', `Auto-start setting could not be updated: ${err?.message || err}`);
  }
}

const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const deepUrl = extractProtocolArg(argv);
    if (deepUrl) {
      handleProtocolDeepLink(deepUrl).catch(() => {});
    } else {
      showMainWindow();
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (app.isReady()) {
      handleProtocolDeepLink(url).catch(() => {});
    } else {
      pendingProtocolUrl = url;
    }
  });

  app.whenReady().then(async () => {
    try {
      if (process.defaultApp && process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('maidanlive-bridge', process.execPath, [
          path.resolve(process.argv[1]),
        ]);
      } else {
        app.setAsDefaultProtocolClient('maidanlive-bridge');
      }
    } catch {
      // Ignore registration fallback errors
    }

    pendingProtocolUrl = extractProtocolArg(process.argv);
    const startHidden = process.argv.includes('--hidden') && hasPairedCredentials(loadConfig());

    createTray();
    createMainWindow(startHidden);

    engine.on('state', (st) => {
      updateTrayMenu();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bridge:state', st);
      }
    });
    engine.on('log', (entry) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bridge:log', entry);
      }
    });
    engine.on('logs-cleared', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bridge:logs-cleared');
      }
    });

    localServer = startLocalBridgeServer({
      engine,
      onActivateFocus: () => showMainWindow(),
    });

    await engine.start();
    updateTrayMenu();
  });
}

app.on('before-quit', async () => {
  isQuitting = true;
  try {
    if (localServer) localServer.close();
  } catch {
    // ignore
  }
  await engine.shutdown();
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
});

// =========================================================================
// IPC HANDLERS
// =========================================================================

ipcMain.handle('bridge:bootstrap', async () => {
  const cfg = loadConfig();
  return {
    state: engine.getState(),
    logs: engine.getLogs(),
    obsUrl: cfg.obsUrl || 'ws://127.0.0.1:4455',
    hasObsPassword: Boolean(cfg.obsPassword),
    autoStart: Boolean(cfg.autoStart),
    defaultServerUrl: cfg.serverUrl || '',
  };
});

ipcMain.handle('bridge:pair-code', async (_ev, payload) => {
  return engine.pairWithCode({
    code: payload?.code || '',
    serverUrl: payload?.serverUrl || '',
  });
});

ipcMain.handle('bridge:pair-account', async (_ev, payload) => {
  return engine.pairWithAccount({
    serverUrl: payload?.serverUrl || '',
    email: payload?.email || '',
    password: payload?.password || '',
    totpCode: payload?.totpCode || '',
  });
});

ipcMain.handle('bridge:unpair', async () => {
  await engine.unpair();
  return engine.getState();
});

ipcMain.handle('bridge:update-obs', async (_ev, payload) => {
  return engine.updateObsSettings({
    obsUrl: payload?.obsUrl,
    obsPassword: payload?.obsPassword,
  });
});

ipcMain.handle('bridge:reconnect-obs', async () => {
  return engine.reconnectObsNow();
});

ipcMain.handle('bridge:reconnect-server', async () => {
  engine.connectServerSocket();
  return engine.getState();
});

ipcMain.handle('bridge:refresh-scenes', async () => {
  await engine.emitObsSnapshot();
  return engine.getState();
});

ipcMain.handle('bridge:switch-scene', async (_ev, sceneName) => {
  return engine.switchSceneLocally(String(sceneName || ''));
});

ipcMain.handle('bridge:scan-obs', async () => {
  await engine.refreshObsEnvironment();
  return engine.getState();
});

ipcMain.handle('bridge:launch-obs', async () => {
  const res = launchObsStudio();
  if (res.ok) {
    engine.log('info', 'Launched OBS Studio. Waiting for WebSocket port 4455...');
    setTimeout(() => {
      engine.refreshObsEnvironment().then(() => engine.connectObsLoop()).catch(() => {});
    }, 3500);
  }
  return res;
});

ipcMain.handle('bridge:set-autostart', async (_ev, enabled) => {
  const nextCfg = saveConfig({ autoStart: Boolean(enabled) });
  applyAutoStartSetting(nextCfg.autoStart);
  engine._syncConfigToState(nextCfg);
  engine.log('info', `Launch on Windows Startup ${nextCfg.autoStart ? 'enabled' : 'disabled'}.`);
  return { autoStart: nextCfg.autoStart };
});

ipcMain.handle('bridge:minimize-tray', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

ipcMain.handle('bridge:clear-logs', async () => {
  engine.clearLogs();
  return { ok: true };
});
