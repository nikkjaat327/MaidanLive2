const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bridgeApi', {
  getBootstrap: () => ipcRenderer.invoke('bridge:bootstrap'),
  pairWithCode: (payload) => ipcRenderer.invoke('bridge:pair-code', payload),
  pairWithAccount: (payload) => ipcRenderer.invoke('bridge:pair-account', payload),
  unpair: () => ipcRenderer.invoke('bridge:unpair'),
  updateObsSettings: (payload) => ipcRenderer.invoke('bridge:update-obs', payload),
  reconnectObs: () => ipcRenderer.invoke('bridge:reconnect-obs'),
  reconnectServer: () => ipcRenderer.invoke('bridge:reconnect-server'),
  refreshScenes: () => ipcRenderer.invoke('bridge:refresh-scenes'),
  switchSceneLocally: (sceneName) => ipcRenderer.invoke('bridge:switch-scene', sceneName),
  scanObs: () => ipcRenderer.invoke('bridge:scan-obs'),
  launchObs: () => ipcRenderer.invoke('bridge:launch-obs'),
  setAutoStart: (enabled) => ipcRenderer.invoke('bridge:set-autostart', Boolean(enabled)),
  minimizeToTray: () => ipcRenderer.invoke('bridge:minimize-tray'),
  clearLogs: () => ipcRenderer.invoke('bridge:clear-logs'),
  updateMediaMTXPath: (executablePath) => ipcRenderer.invoke('bridge:mediamtx-path', executablePath),
  refreshMediaMTX: () => ipcRenderer.invoke('bridge:mediamtx-refresh'),
  syncMediaMTXConfig: () => ipcRenderer.invoke('bridge:mediamtx-sync'),
  startMediaMTX: () => ipcRenderer.invoke('bridge:mediamtx-start'),
  stopMediaMTX: () => ipcRenderer.invoke('bridge:mediamtx-stop'),
  onState: (cb) => {
    const handler = (_ev, data) => cb(data);
    ipcRenderer.on('bridge:state', handler);
    return () => ipcRenderer.removeListener('bridge:state', handler);
  },
  onLog: (cb) => {
    const handler = (_ev, data) => cb(data);
    ipcRenderer.on('bridge:log', handler);
    return () => ipcRenderer.removeListener('bridge:log', handler);
  },
  onLogsCleared: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('bridge:logs-cleared', handler);
    return () => ipcRenderer.removeListener('bridge:logs-cleared', handler);
  },
  onProtocolPrefill: (cb) => {
    const handler = (_ev, data) => cb(data);
    ipcRenderer.on('bridge:protocol-prefill', handler);
    return () => ipcRenderer.removeListener('bridge:protocol-prefill', handler);
  },
});
