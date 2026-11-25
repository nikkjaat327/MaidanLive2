const http = require('node:http');
const { loadConfig } = require('./store.cjs');

const LOCAL_BRIDGE_PORT = 44691;

function isTrustedOrigin(originHeader, savedServerUrl, candidateServerUrl = '') {
  if (!originHeader) return false;
  try {
    const originUrl = new URL(originHeader);
    if (!['http:', 'https:'].includes(originUrl.protocol)) return false;
    if (['localhost', '127.0.0.1'].includes(originUrl.hostname)) return true;

    if (savedServerUrl) {
      const savedOrigin = new URL(savedServerUrl).origin;
      if (originUrl.origin === savedOrigin) return true;
    }

    if (candidateServerUrl) {
      const candidateOrigin = new URL(candidateServerUrl).origin;
      if (originUrl.origin === candidateOrigin) return true;
    }

    // Verified MaidanLive Cloud Run / AI Studio / custom hosting origins during initial pairing probe
    if (
      originUrl.protocol === 'https:' &&
      (originUrl.hostname.endsWith('.asia-east1.run.app') ||
        originUrl.hostname.endsWith('.ai.studio') ||
        originUrl.hostname.endsWith('.maidanlive.com') ||
        originUrl.hostname === 'maidanlive.com')
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function writeCorsHeaders(req, res, trustedOrigin) {
  if (trustedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', trustedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
}

function readJsonBody(req, maxBytes = 16384) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload.'));
      }
    });
    req.on('error', reject);
  });
}

function startLocalBridgeServer({ engine, onActivateFocus }) {
  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${LOCAL_BRIDGE_PORT}`);
    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    const cfg = loadConfig();

    if (req.method === 'OPTIONS') {
      const trusted = isTrustedOrigin(originHeader, cfg.serverUrl);
      if (originHeader && !trusted) {
        res.statusCode = 403;
        res.end();
        return;
      }
      writeCorsHeaders(req, res, originHeader || undefined);
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === 'GET' && reqUrl.pathname === '/status') {
      const trusted = !originHeader || isTrustedOrigin(originHeader, cfg.serverUrl);
      if (!trusted) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Forbidden origin.' }));
        return;
      }

      writeCorsHeaders(req, res, originHeader || undefined);
      res.setHeader('Content-Type', 'application/json');
      const st = engine.getState();
      // Never expose bridgeToken or obsPassword on loopback HTTP
      res.end(
        JSON.stringify({
          running: true,
          app: 'MaidanLive OBS Bridge',
          version: st.bridgeVersion || null,
          bridgeVersion: st.bridgeVersion || null,
          capabilities: Array.isArray(st.capabilities) ? st.capabilities : [],
          paired: st.paired,
          bridgeId: st.bridgeId || null,
          serverUrl: st.serverUrl || null,
          serverConnected: st.serverConnected,
          serverStatus: st.serverStatus,
          adminDisconnected: Boolean(st.adminDisconnected),
          obsConnected: st.obsConnected,
          obsStatus: st.obsStatus,
          obsManuallyDisconnected: Boolean(st.obsManuallyDisconnected),
          obsVersion: st.obsVersion || '',
          activeObsScene: st.activeObsScene || '',
          sceneCount: Array.isArray(st.obsScenes) ? st.obsScenes.length : 0,
          obsDetected: Boolean(st.obsEnv?.installed),
          obsRunning: Boolean(st.obsEnv?.running),
          mediamtx: st.mediamtx || null,
        })
      );
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/activate') {
      try {
        const body = await readJsonBody(req);
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        const serverUrl = typeof body.serverUrl === 'string' ? body.serverUrl.trim() : '';
        const trusted = isTrustedOrigin(originHeader, cfg.serverUrl, serverUrl);
        if (originHeader && !trusted) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: 'Forbidden origin for bridge activation.' }));
          return;
        }
        writeCorsHeaders(req, res, originHeader || undefined);
        res.setHeader('Content-Type', 'application/json');

        if (!code || !serverUrl) {
          res.statusCode = 400;
          res.end(JSON.stringify({ message: 'Pairing code and serverUrl are required.' }));
          return;
        }

        const result = await engine.pairWithCode({ code, serverUrl });
        if (typeof onActivateFocus === 'function') onActivateFocus();
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            ok: true,
            bridgeId: result.bridgeId,
            match: result.match || null,
          })
        );
      } catch (err) {
        writeCorsHeaders(req, res, originHeader || undefined);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, message: err?.message || 'Bridge activation failed.' }));
      }
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/mediamtx/control') {
      try {
        const body = await readJsonBody(req);
        const action = typeof body.action === 'string' ? body.action.trim() : '';
        const serverUrl = typeof body.serverUrl === 'string' ? body.serverUrl.trim() : '';
        const executablePath =
          typeof body.executablePath === 'string' ? body.executablePath.trim() : '';
        const configPath =
          typeof body.configPath === 'string' ? body.configPath.trim() : '';
        const trusted = isTrustedOrigin(originHeader, cfg.serverUrl, serverUrl);
        if (originHeader && !trusted) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: 'Forbidden origin for MediaMTX control.' }));
          return;
        }
        writeCorsHeaders(req, res, originHeader || undefined);
        res.setHeader('Content-Type', 'application/json');

        const cmdMap = {
          status: 'mediamtx_status',
          sync_config: 'mediamtx_sync_config',
          start: 'mediamtx_start',
          stop: 'mediamtx_stop',
          restart: 'mediamtx_restart',
          logs: 'mediamtx_logs',
        };
        const command = cmdMap[action];
        if (!command) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, message: 'Invalid MediaMTX action.' }));
          return;
        }

        const result = await engine.handleCommand(command, {
          ...(serverUrl ? { serverUrl } : {}),
          ...(executablePath ? { executablePath } : {}),
          ...(configPath ? { configPath } : {}),
        });
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err) {
        writeCorsHeaders(req, res, originHeader || undefined);
        res.statusCode = 422;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, message: err?.message || 'MediaMTX command failed.' }));
      }
      return;
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Not found.' }));
  });

  server.on('error', (err) => {
    engine.log('warn', `Local helper listener on 127.0.0.1:${LOCAL_BRIDGE_PORT} skipped: ${err.message}`);
  });

  server.listen(LOCAL_BRIDGE_PORT, '127.0.0.1', () => {
    engine.log('info', `Loopback bridge status service listening on 127.0.0.1:${LOCAL_BRIDGE_PORT}`);
  });

  return server;
}

module.exports = {
  LOCAL_BRIDGE_PORT,
  startLocalBridgeServer,
};
