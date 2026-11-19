import crypto from 'crypto';

export interface MediaMTXStreamConfig {
  streamPath: string;
  streamKey: string;
  rtmpPublishUrl: string;
  hlsPlaybackUrl: string;
  webrtcPlaybackUrl: string;
}

export interface MediaMTXHealthResult {
  ok: boolean;
  publishStatus: 'PUBLISHING' | 'OFFLINE' | 'ERROR';
  playable: boolean;
  hlsAvailable: boolean;
  webrtcAvailable: boolean;
  latencyMs: number;
  checkedAt: string;
  message: string;
  details?: Record<string, any>;
}

export function getMediaMTXEnvConfig() {
  const rtmpBase = (process.env.MEDIAMTX_RTMP_URL?.trim() || 'rtmp://localhost:1935').replace(
    /\/+$/,
    ''
  );
  const hlsBase = (process.env.MEDIAMTX_HLS_URL?.trim() || 'http://localhost:8888').replace(
    /\/+$/,
    ''
  );
  const webrtcBase = (process.env.MEDIAMTX_WEBRTC_URL?.trim() || 'http://localhost:8889').replace(
    /\/+$/,
    ''
  );
  const apiBase = (process.env.MEDIAMTX_API_URL?.trim() || 'http://127.0.0.1:9997').replace(
    /\/+$/,
    ''
  );
  return { rtmpBase, hlsBase, webrtcBase, apiBase };
}

export function generateMediaMTXStreamKey(): string {
  return `mlk_${crypto.randomBytes(16).toString('hex')}`;
}

export function buildMediaMTXConfig(
  matchOrStreamId: string,
  existingPath?: string,
  existingKey?: string
): MediaMTXStreamConfig {
  const cleanId = matchOrStreamId.replace(/[^a-zA-Z0-9_-]/g, '');
  const streamPath = (existingPath?.trim() || `match_${cleanId}`).replace(/^\/+/, '');
  const streamKey = existingKey?.trim() || generateMediaMTXStreamKey();
  const { rtmpBase, hlsBase, webrtcBase } = getMediaMTXEnvConfig();

  return {
    streamPath,
    streamKey,
    rtmpPublishUrl: `${rtmpBase}/${streamPath}?key=${streamKey}`,
    hlsPlaybackUrl: `${hlsBase}/${streamPath}/index.m3u8`,
    webrtcPlaybackUrl: `${webrtcBase}/${streamPath}/whep`,
  };
}

export function stripPrivateMediaMTXFields<T extends Record<string, any>>(streamObj: T): T {
  const copy = { ...streamObj };
  delete copy.mediamtxStreamKey;
  delete copy.mediamtxRtmpPublishUrl;
  return copy;
}

export async function verifyMediaMTXStreamHealth(params: {
  streamPath?: string;
  hlsPlaybackUrl?: string;
  webrtcPlaybackUrl?: string;
}): Promise<MediaMTXHealthResult> {
  const started = Date.now();
  const checkedAt = new Date().toISOString();
  const { apiBase, hlsBase } = getMediaMTXEnvConfig();
  const cleanPath = (params.streamPath || '').replace(/^\/+/, '');
  const hlsUrl =
    params.hlsPlaybackUrl?.trim() || (cleanPath ? `${hlsBase}/${cleanPath}/index.m3u8` : '');

  if (!cleanPath && !hlsUrl) {
    return {
      ok: false,
      publishStatus: 'OFFLINE',
      playable: false,
      hlsAvailable: false,
      webrtcAvailable: false,
      latencyMs: Date.now() - started,
      checkedAt,
      message: 'MediaMTX stream path or playback URL is not configured.',
    };
  }

  // 1. Check MediaMTX v3 Control API if reachable
  let apiReady = false;
  let apiTracks: string[] = [];
  if (cleanPath) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const apiRes = await fetch(`${apiBase}/v3/paths/get/${encodeURIComponent(cleanPath)}`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (apiRes.ok) {
        const json = (await apiRes.json()) as {
          ready?: boolean;
          tracks?: string[];
          source?: { type?: string };
        };
        apiReady = Boolean(json.ready);
        apiTracks = Array.isArray(json.tracks) ? json.tracks : [];
      }
    } catch {
      // Control API may not be exposed directly if MediaMTX is remote; fall back to HLS manifest check
    }
  }

  // 2. Check HLS playback manifest (#EXTM3U)
  let hlsAvailable = false;
  if (hlsUrl && /^https?:\/\//i.test(hlsUrl)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const hlsRes = await fetch(hlsUrl, {
        method: 'GET',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (hlsRes.ok) {
        const text = await hlsRes.text();
        if (text.includes('#EXTM3U')) {
          hlsAvailable = true;
        }
      }
    } catch {
      hlsAvailable = false;
    }
  }

  const playable = apiReady || hlsAvailable;
  const latencyMs = Date.now() - started;

  if (playable) {
    return {
      ok: true,
      publishStatus: 'PUBLISHING',
      playable: true,
      hlsAvailable,
      webrtcAvailable: Boolean(params.webrtcPlaybackUrl),
      latencyMs,
      checkedAt,
      message: hlsAvailable
        ? 'MediaMTX HLS feed is live and verified playable.'
        : 'MediaMTX publisher is connected and active.',
      details: { apiReady, apiTracks, hlsUrl },
    };
  }

  return {
    ok: false,
    publishStatus: 'OFFLINE',
    playable: false,
    hlsAvailable: false,
    webrtcAvailable: false,
    latencyMs,
    checkedAt,
    message:
      'MediaMTX stream is offline or unreachable. Start your encoder (OBS/Larix) to publish before switching.',
    details: { apiReady, hlsUrl },
  };
}

export function extractKeyFromQueryString(rawQuery: string): string {
  if (!rawQuery) return '';
  try {
    const params = new URLSearchParams(rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery);
    return (params.get('key') || params.get('token') || '').trim();
  } catch {
    return '';
  }
}
