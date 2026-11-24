import crypto from 'crypto';

export interface MediaMTXStreamConfig {
  streamPath: string;
  streamKey: string;
  rtmpPublishUrl: string;
  hlsPlaybackUrl: string;
  webrtcPlaybackUrl: string;
}

export interface LarixCameraConnectionConfig {
  protocol: 'rtmp' | 'srt';
  streamPath: string;
  streamKey: string;
  streamKeyPrefix: string;
  rtmpServerUrl: string;
  rtmpStreamKeyParam: string;
  rtmpFullUrl: string;
  srtServerUrl: string;
  srtStreamId: string;
  srtFullUrl: string;
  larixDeepLinkUrl: string;
  obsPullUrl: string;
  obsPullProtocol: 'rtmp' | 'srt';
  hlsPreviewUrl: string;
  webrtcPreviewUrl: string;
  usesLocalhostIngest: boolean;
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

const VALID_MEDIA_SOURCE_PROTOCOLS = new Set(['rtmp:', 'srt:', 'rtsp:', 'http:', 'https:']);

export function getMediaMTXEnvConfig() {
  const rtmpBase = (process.env.MEDIAMTX_RTMP_URL?.trim() || 'rtmp://localhost:1935').replace(
    /\/+$/,
    ''
  );
  const srtBase = (process.env.MEDIAMTX_SRT_URL?.trim() || 'srt://localhost:8890').replace(
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
  const obsRtmpBase = (
    process.env.MEDIAMTX_OBS_RTMP_URL?.trim() ||
    deriveLocalObsBase(rtmpBase, 'rtmp://127.0.0.1:1935')
  ).replace(/\/+$/, '');
  const obsSrtBase = (
    process.env.MEDIAMTX_OBS_SRT_URL?.trim() ||
    deriveLocalObsBase(srtBase, 'srt://127.0.0.1:8890')
  ).replace(/\/+$/, '');

  return { rtmpBase, srtBase, hlsBase, webrtcBase, apiBase, obsRtmpBase, obsSrtBase };
}

function deriveLocalObsBase(ingestBase: string, localFallback: string): string {
  try {
    const parsed = new URL(ingestBase);
    const host = parsed.hostname.toLowerCase();
    // If MediaMTX ingest is localhost (local PC deployment), OBS on the same PC pulls via 127.0.0.1 cleanly.
    // Otherwise (VPS/domain deployment), OBS pulls from the same configured MediaMTX host unless overridden by MEDIAMTX_OBS_*_URL.
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      const port = parsed.port ? `:${parsed.port}` : '';
      return `${parsed.protocol}//127.0.0.1${port}`;
    }
    return ingestBase;
  } catch {
    return localFallback;
  }
}

export function isLocalhostMediaHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const h = parsed.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1';
  } catch {
    return false;
  }
}

export function isValidMediaSourceUrl(rawUrl: string): boolean {
  const clean = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!clean || clean.length > 1000) return false;
  if (/[\r\n\t\0"'<>\\`]/.test(clean)) return false;
  try {
    const parsed = new URL(clean);
    return VALID_MEDIA_SOURCE_PROTOCOLS.has(parsed.protocol.toLowerCase()) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function sanitizeMediaMTXStreamPath(rawPath: string): string {
  return String(rawPath || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_/-]/g, '_')
    .replace(/\/{2,}/g, '/')
    .slice(0, 140);
}

export function buildScopedCameraStreamPath(matchId: string, cameraId: string): string {
  const cleanMatch = String(matchId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(-10);
  const cleanCam = String(cameraId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 48);
  return `cam_${cleanMatch || 'match'}_${cleanCam || 'cam01'}`;
}

export function generateMediaMTXStreamKey(): string {
  return `mlk_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateCameraMediaMTXKey(): {
  raw: string;
  prefix: string;
} {
  const raw = `mllrx_${crypto.randomBytes(18).toString('hex')}`;
  return {
    raw,
    prefix: `${raw.slice(0, 14)}...`,
  };
}

export function buildLarixCameraConfig(params: {
  matchId: string;
  cameraId: string;
  cameraName?: string;
  protocol?: 'rtmp' | 'srt' | string;
  streamPath?: string;
  streamKey: string;
  ingestHostOverride?: string;
}): LarixCameraConnectionConfig {
  const env = getMediaMTXEnvConfig();
  const protocol: 'rtmp' | 'srt' = params.protocol === 'srt' ? 'srt' : 'rtmp';
  const streamPath =
    sanitizeMediaMTXStreamPath(params.streamPath || '') ||
    buildScopedCameraStreamPath(params.matchId, params.cameraId);
  const streamKey = String(params.streamKey || '').trim();

  let rtmpBase = env.rtmpBase;
  let srtBase = env.srtBase;
  if (params.ingestHostOverride && /^[a-zA-Z0-9.-]+$/.test(params.ingestHostOverride.trim())) {
    const host = params.ingestHostOverride.trim();
    try {
      const rp = new URL(env.rtmpBase);
      rp.hostname = host;
      rtmpBase = rp.toString().replace(/\/+$/, '');
    } catch {
      rtmpBase = `rtmp://${host}:1935`;
    }
    try {
      const sp = new URL(env.srtBase);
      sp.hostname = host;
      srtBase = sp.toString().replace(/\/+$/, '');
    } catch {
      srtBase = `srt://${host}:8890`;
    }
  }

  const rtmpServerUrl = `${rtmpBase}/${streamPath}`;
  const rtmpStreamKeyParam = streamKey ? `?key=${encodeURIComponent(streamKey)}` : '';
  const rtmpFullUrl = `${rtmpServerUrl}${rtmpStreamKeyParam}`;

  const srtStreamId = streamKey
    ? `publish:${streamPath}:larix:${streamKey}`
    : `publish:${streamPath}`;
  const srtFullUrl = `${srtBase}?streamid=${encodeURIComponent(srtStreamId)}&latency=300000`;

  const obsPullUrl =
    protocol === 'srt'
      ? `${env.obsSrtBase}?streamid=${encodeURIComponent(
          streamKey ? `read:${streamPath}:obs:${streamKey}` : `read:${streamPath}`
        )}&latency=200000`
      : `${env.obsRtmpBase}/${streamPath}${rtmpStreamKeyParam}`;

  const targetLarixUrl = protocol === 'srt' ? srtFullUrl : rtmpFullUrl;
  const connName = (params.cameraName || params.cameraId || 'MaidanLive Cam').slice(0, 48);
  const larixDeepLinkUrl = `larix://set/v1?conn[][url]=${encodeURIComponent(
    targetLarixUrl
  )}&conn[][name]=${encodeURIComponent(connName)}&conn[][mode]=va`;

  return {
    protocol,
    streamPath,
    streamKey,
    streamKeyPrefix: streamKey ? `${streamKey.slice(0, 14)}...` : '',
    rtmpServerUrl,
    rtmpStreamKeyParam,
    rtmpFullUrl,
    srtServerUrl: srtBase,
    srtStreamId,
    srtFullUrl,
    larixDeepLinkUrl,
    obsPullUrl,
    obsPullProtocol: protocol,
    hlsPreviewUrl: `${env.hlsBase}/${streamPath}/index.m3u8`,
    webrtcPreviewUrl: `${env.webrtcBase}/${streamPath}/whep`,
    usesLocalhostIngest: isLocalhostMediaHost(rtmpBase),
  };
}

export function generateMediaMTXYamlConfig(serverBaseUrl: string): string {
  const cleanServer = String(serverBaseUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
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
