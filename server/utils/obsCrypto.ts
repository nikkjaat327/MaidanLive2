import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let cachedMasterKey: Buffer | null = null;

function getLocalMasterKeyFile(): string {
  const candidates = ['/data/.obs_master.key', path.resolve(process.cwd(), '.data', '.obs_master.key')];
  for (const candidate of candidates) {
    try {
      const dir = path.dirname(candidate);
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return candidate;
    } catch {
      // Try next directory
    }
  }
  return path.resolve(process.cwd(), '.data', '.obs_master.key');
}

function getEncryptionKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const envSeed = (process.env.OBS_SECRET_KEY || process.env.JWT_SECRET || '').trim();
  if (envSeed) {
    cachedMasterKey = crypto.createHash('sha256').update(`maidanlive:obs:${envSeed}`).digest();
    return cachedMasterKey;
  }

  const keyFile = getLocalMasterKeyFile();
  try {
    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        cachedMasterKey = Buffer.from(hex, 'hex');
        return cachedMasterKey;
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, generated.toString('hex'), { mode: 0o600 });
    cachedMasterKey = generated;
    return cachedMasterKey;
  } catch {
    cachedMasterKey = crypto.randomBytes(32);
    return cachedMasterKey;
  }
}

export function encryptObsSecret(plainText: string): string {
  const clean = typeof plainText === 'string' ? plainText : '';
  if (!clean) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptObsSecret(cipherText: string): string {
  if (!cipherText || typeof cipherText !== 'string') return '';
  if (!cipherText.startsWith('v1:')) return '';
  const parts = cipherText.split(':');
  if (parts.length !== 4) return '';
  try {
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const payload = Buffer.from(parts[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function hashScopedToken(rawToken: string): string {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

export function generateScopedToken(prefix: string): { raw: string; hash: string; displayPrefix: string } {
  const secretPart = crypto.randomBytes(24).toString('base64url');
  const raw = `${prefix}_${secretPart}`;
  return {
    raw,
    hash: hashScopedToken(raw),
    displayPrefix: `${raw.slice(0, 14)}...`,
  };
}

export function verifyScopedToken(rawToken: string, expectedHash: string): boolean {
  if (!rawToken || !expectedHash) return false;
  const candidateHash = hashScopedToken(rawToken);
  const a = Buffer.from(candidateHash, 'utf8');
  const b = Buffer.from(expectedHash, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface VdoNinjaLinksInput {
  roomName: string;
  streamId: string;
  password?: string;
  label?: string;
  resolution?: string;
  fps?: number;
  bitrateKbps?: number;
  lowBandwidthMode?: boolean;
  facingMode?: 'environment' | 'user';
  cover?: boolean;
  rotationDeg?: number;
}

export function parseResolutionDimensions(resolution?: string): { width: number; height: number } {
  switch (resolution) {
    case '1920x1080':
      return { width: 1920, height: 1080 };
    case '854x480':
      return { width: 854, height: 480 };
    case '640x360':
      return { width: 640, height: 360 };
    case '1280x720':
    default:
      return { width: 1280, height: 720 };
  }
}

export function buildVdoNinjaLinks(input: VdoNinjaLinksInput): {
  pushUrl: string;
  obsViewUrl: string;
  directorUrl: string;
} {
  const baseUrl = (process.env.VDONINJA_BASE_URL || 'https://vdo.ninja').replace(/\/+$/, '');
  const room = encodeURIComponent(input.roomName || 'maidanlive');
  const stream = encodeURIComponent(input.streamId || 'maidanlive_cam_01');
  const pwd = input.password ? `&password=${encodeURIComponent(input.password)}` : '';
  const label = input.label ? `&label=${encodeURIComponent(input.label)}` : '';
  const { width, height } = parseResolutionDimensions(input.resolution);
  const fps = Math.max(15, Math.min(60, Number(input.fps) || 30));
  const maxBitrate = input.lowBandwidthMode
    ? Math.min(Number(input.bitrateKbps) || 900, 1000)
    : Math.max(400, Math.min(8000, Number(input.bitrateKbps) || 2000));

  const pushParams = [
    `push=${stream}`,
    `room=${room}`,
    input.password ? `password=${encodeURIComponent(input.password)}` : '',
    input.label ? `label=${encodeURIComponent(input.label)}` : '',
    `width=${width}`,
    `height=${height}`,
    `fps=${fps}`,
    `maxbitrate=${maxBitrate}`,
    `facingmode=${input.facingMode === 'user' ? 'user' : 'environment'}`,
    input.lowBandwidthMode ? 'codec=vp8&quality=2' : 'quality=1',
    'webcam',
    'autostart',
    'noaudio=0',
  ]
    .filter(Boolean)
    .join('&');

  const viewExtras = [
    input.cover ? '&cover' : '',
    input.rotationDeg && [90, 180, 270].includes(Number(input.rotationDeg))
      ? `&rotate=${Number(input.rotationDeg)}`
      : '',
  ].join('');

  const obsViewUrl = `${baseUrl}/?view=${stream}&room=${room}${pwd}&scene&cleanoutput&noheader&nofooter&transparent${viewExtras}`;
  const directorUrl = `${baseUrl}/?director=${room}${pwd}${label}`;

  return {
    pushUrl: `${baseUrl}/?${pushParams}`,
    obsViewUrl,
    directorUrl,
  };
}
