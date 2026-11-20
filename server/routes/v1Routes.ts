import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import liveStreamRoutes from './liveStreamRoutes.ts';
import scoreRoutes from './scoreRoutes.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Tournament } from '../models/Tournament.ts';
import { Team } from '../models/Team.ts';
import { Player } from '../models/Player.ts';
import { Sponsor } from '../models/Sponsor.ts';
import { StoredFile } from '../models/StoredFile.ts';
import type { StoredFilePurpose, StoredFileSource } from '../models/StoredFile.ts';
import { TournamentRegistration } from '../models/TournamentRegistration.ts';
import type {
  DepositRefundStatus,
  IRosterPlayerEntry,
  IStoredDocMeta,
  PaymentVerificationStatus,
} from '../models/TournamentRegistration.ts';
import { extractKeyFromQueryString, getMediaMTXEnvConfig } from '../services/mediamtxService.ts';
import { getDatabaseDiagnostics, retryMongoConnection } from '../config/db.ts';
import {
  authenticate,
  canManageTournament,
  hasGranularPermission,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { notifyTournamentAdminsAndOrganizers, notifyUser } from '../utils/notifications.ts';
import { emitStreamEvent } from '../socket/index.ts';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '../services/cloudinaryService.ts';
import { buildIdMatchFilter } from '../utils/mongoNormalize.ts';

function dedupeRosterEntries(entries: IRosterPlayerEntry[] = []): IRosterPlayerEntry[] {
  const seen = new Set<string>();
  const out: IRosterPlayerEntry[] = [];
  for (const entry of entries) {
    const cleanName = (entry?.name || '').trim().toLowerCase();
    if (!cleanName) continue;
    const jerseyKey =
      entry?.jerseyNumber !== null && entry?.jerseyNumber !== undefined
        ? String(entry.jerseyNumber)
        : '';
    const key = `${cleanName}::${jerseyKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

const router = Router();

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_VERIFICATION_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_VERIFICATION_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx'];

const ALLOWED_PAYMENT_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const ALLOWED_PAYMENT_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function handleSingleUpload(req: Request, res: Response, next: NextFunction) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('multipart/form-data')) {
    next();
    return;
  }
  memoryUpload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ message: 'File size exceeds the 10 MB maximum limit.' });
        return;
      }
      res.status(400).json({ message: err.message || 'Invalid file upload payload.' });
      return;
    }
    next();
  });
}

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function validateFileSpec(params: {
  purpose: StoredFilePurpose;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  const cleanName = params.fileName.trim();
  const mime = params.mimeType.toLowerCase().trim();
  const ext = getFileExtension(cleanName);
  if (!cleanName) return 'File name is required.';
  if (params.sizeBytes <= 0) return 'Uploaded file cannot be empty.';
  if (params.sizeBytes > MAX_UPLOAD_BYTES) return 'File size exceeds the 10 MB maximum limit.';

  if (params.purpose === 'PAYMENT_PROOF') {
    if (!ALLOWED_PAYMENT_MIMES.has(mime) && !ALLOWED_PAYMENT_EXTS.includes(ext)) {
      return 'Payment proof must be JPG, JPEG, PNG, WebP, or PDF.';
    }
  } else {
    if (!ALLOWED_VERIFICATION_MIMES.has(mime) && !ALLOWED_VERIFICATION_EXTS.includes(ext)) {
      return 'Verification document must be PDF, JPG, JPEG, PNG, WebP, DOC, or DOCX.';
    }
  }
  return null;
}

function resolveMimeType(fileName: string, rawMime: string): string {
  const m = rawMime.toLowerCase().trim();
  if (m && m !== 'application/octet-stream') return m;
  const ext = getFileExtension(fileName);
  switch (ext) {
    case '.pdf':
      return 'application/pdf';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return m || 'application/octet-stream';
  }
}

async function createStoredFileFromRequest(params: {
  req: AuthenticatedRequest;
  purpose: StoredFilePurpose;
  tournamentId?: string | null;
  registrationId?: string | null;
}): Promise<{ doc: any; meta: IStoredDocMeta } | { error: string; status: number }> {
  const { req, purpose, tournamentId, registrationId } = params;
  const uploadedFile = (req as any).file as Express.Multer.File | undefined;

  let fileName = '';
  let mimeType = '';
  let fileBuffer: Buffer | null = null;
  let sizeBytes = 0;
  let source: StoredFileSource = 'DEVICE';
  let driveFileId = '';
  let driveWebViewLink = '';

  if (uploadedFile) {
    fileName = sanitizeText(uploadedFile.originalname, 240) || 'document';
    mimeType = resolveMimeType(fileName, uploadedFile.mimetype || '');
    fileBuffer = uploadedFile.buffer;
    sizeBytes = uploadedFile.size;
    source = req.body?.source === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'DEVICE';
    driveFileId = sanitizeText(req.body?.driveFileId, 200);
    driveWebViewLink = sanitizeText(req.body?.driveWebViewLink, 400);
  } else if (typeof req.body?.dataBase64 === 'string' && req.body.dataBase64.trim()) {
    const rawB64 = req.body.dataBase64.includes(',')
      ? req.body.dataBase64.split(',').pop() || ''
      : req.body.dataBase64;
    fileBuffer = Buffer.from(rawB64.trim(), 'base64');
    fileName = sanitizeText(req.body.fileName, 240) || 'document';
    mimeType = resolveMimeType(fileName, sanitizeText(req.body.mimeType, 120));
    sizeBytes = fileBuffer.length;
    source = req.body.source === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'DEVICE';
    driveFileId = sanitizeText(req.body.driveFileId, 200);
    driveWebViewLink = sanitizeText(req.body.driveWebViewLink, 400);
  } else {
    return { error: 'No file content provided.', status: 400 };
  }

  const validationError = validateFileSpec({ purpose, fileName, mimeType, sizeBytes });
  if (validationError) {
    return { error: validationError, status: 400 };
  }

  if (!isCloudinaryConfigured()) {
    return {
      error:
        'Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) in Secrets.',
      status: 503,
    };
  }

  let cloudinaryUrl = '';
  let cloudinaryPublicId = '';
  try {
    const uploaded = await uploadBufferToCloudinary({
      buffer: fileBuffer,
      fileName,
      mimeType,
      folder: `maidanlive/${purpose.toLowerCase()}`,
    });
    cloudinaryUrl = uploaded.url;
    cloudinaryPublicId = uploaded.publicId;
  } catch (err: any) {
    console.error('[Cloudinary] Upload failed:', err);
    return {
      error: err?.message || 'Failed to upload file to Cloudinary.',
      status: 502,
    };
  }

  const stored = await StoredFile.create({
    ownerUserId: req.user!._id,
    tournamentId:
      tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)
        ? new mongoose.Types.ObjectId(tournamentId)
        : null,
    registrationId:
      registrationId && mongoose.Types.ObjectId.isValid(registrationId)
        ? new mongoose.Types.ObjectId(registrationId)
        : null,
    purpose,
    source,
    fileName,
    mimeType,
    sizeBytes,
    driveFileId,
    driveWebViewLink,
    cloudinaryUrl,
    cloudinaryPublicId,
    dataBase64: '',
  });

  const meta: IStoredDocMeta = {
    fileId: stored._id.toString(),
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    source: stored.source,
    driveFileId: stored.driveFileId || '',
    url: stored.cloudinaryUrl || '',
    cloudinaryPublicId: stored.cloudinaryPublicId || '',
    uploadedAt: stored.createdAt || new Date(),
  };

  return { doc: stored, meta };
}

async function sendStoredFileResponse(
  res: Response,
  file: {
    fileName?: string;
    mimeType?: string;
    cloudinaryUrl?: string;
    dataBase64?: string;
  },
  isDownload: boolean
): Promise<void> {
  const disposition = isDownload ? 'attachment' : 'inline';
  const safeName = (file.fileName || 'document').replace(/["\r\n]/g, '_');

  let buffer: Buffer;
  if (file.cloudinaryUrl) {
    const upstream = await fetch(file.cloudinaryUrl);
    if (!upstream.ok) {
      res.status(502).json({ message: 'Failed to retrieve file from Cloudinary.' });
      return;
    }
    buffer = Buffer.from(await upstream.arrayBuffer());
  } else if (file.dataBase64) {
    buffer = Buffer.from(file.dataBase64, 'base64');
  } else {
    res.status(404).json({ message: 'File content is unavailable.' });
    return;
  }

  res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}

function resolveTournamentPaymentConfig(tournament: any): {
  paymentType: 'NONE' | 'ENTRY_FEE' | 'SECURITY_DEPOSIT';
  amount: number;
} {
  const mode = tournament?.paymentMode;
  if (mode === 'SECURITY_DEPOSIT') {
    const amt = Math.max(0, Number(tournament?.securityDepositAmount) || 0);
    return amt > 0 ? { paymentType: 'SECURITY_DEPOSIT', amount: amt } : { paymentType: 'NONE', amount: 0 };
  }
  if (mode === 'ENTRY_FEE') {
    const amt = Math.max(0, Number(tournament?.registrationFee) || 0);
    return amt > 0 ? { paymentType: 'ENTRY_FEE', amount: amt } : { paymentType: 'NONE', amount: 0 };
  }
  if (mode === 'NONE') {
    return { paymentType: 'NONE', amount: 0 };
  }
  const legacyFee = Math.max(0, Number(tournament?.registrationFee) || 0);
  return legacyFee > 0
    ? { paymentType: 'ENTRY_FEE', amount: legacyFee }
    : { paymentType: 'NONE', amount: 0 };
}

function computeIsMinorFromDob(dob: string): boolean {
  if (!dob) return false;
  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return false;
  const ageYears = (Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18;
}

function normalizeAndValidateRoster(
  rawRoster: unknown
): { roster: IRosterPlayerEntry[] } | { error: string } {
  const list = Array.isArray(rawRoster) ? rawRoster : [];
  const roster: IRosterPlayerEntry[] = [];
  const seenNames = new Set<string>();
  const seenJerseys = new Set<number>();

  for (const item of list) {
    const pName = sanitizeText((item as any)?.name, 120);
    if (!pName) continue;
    const normalizedName = pName.toLowerCase();
    if (seenNames.has(normalizedName)) {
      return { error: `Duplicate player name "${pName}" is not allowed in the same roster.` };
    }
    seenNames.add(normalizedName);

    const rawJersey = (item as any)?.jerseyNumber;
    const jerseyNumber =
      rawJersey !== undefined && rawJersey !== null && rawJersey !== '' && Number.isFinite(Number(rawJersey))
        ? Math.max(0, Math.min(999, Number(rawJersey)))
        : null;
    if (jerseyNumber !== null) {
      if (seenJerseys.has(jerseyNumber)) {
        return { error: `Duplicate jersey number #${jerseyNumber} is not allowed in the same roster.` };
      }
      seenJerseys.add(jerseyNumber);
    }

    const dob = sanitizeText((item as any)?.dateOfBirth, 30);
    const isMinor =
      typeof (item as any)?.isMinor === 'boolean'
        ? (item as any).isMinor
        : computeIsMinorFromDob(dob);
    const guardianName = sanitizeText((item as any)?.guardianName, 120);
    const guardianPhone = sanitizeText((item as any)?.guardianPhone, 30);
    const guardianConsent = Boolean((item as any)?.guardianConsent);

    if (isMinor && (!guardianName || !guardianPhone || !guardianConsent)) {
      return {
        error: `Player "${pName}" is a minor (under 18). Guardian name, phone, and consent are required.`,
      };
    }

    roster.push({
      name: pName,
      role: sanitizeText((item as any)?.role, 80),
      jerseyNumber,
      dateOfBirth: dob,
      isMinor,
      guardianName,
      guardianPhone,
      guardianConsent,
    });
  }

  return { roster };
}

function stripPrivateRegistrationFields(reg: any) {
  const copy = { ...reg };
  delete copy.verificationDocUrl;
  delete copy.verificationDocId;
  delete copy.verificationDocMeta;
  delete copy.verificationNotes;
  delete copy.paymentProofFileId;
  delete copy.paymentProofMeta;
  delete copy.previousApprovalSnapshot;
  delete copy.captainPhone;
  delete copy.captainEmail;
  return copy;
}

// ==================== V1 LIVE STREAMS & MATCHES ====================
router.use('/live-streams', liveStreamRoutes);
router.use('/live-streams', scoreRoutes);

// Tournament Matches alias routes + score + provider switching
router.use('/matches', liveStreamRoutes);
router.use('/matches', scoreRoutes);

// ==================== MEDIAMTX PUBLISH AUTH WEBHOOK ====================
// Supports MediaMTX `externalAuthenticationURL` POST payload: { user, password, ip, action, path, protocol, id, query }
router.post('/mediamtx/auth', async (req: Request, res: Response) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    const rawPath = String(req.body?.path || '').replace(/^\/+/, '').trim();
    const rawQuery = String(req.body?.query || '');

    // Allow read/playback requests publicly unless explicitly restricted
    if (action === 'read' || action === 'playback' || action === 'api' || action === 'metrics') {
      res.status(200).json({ ok: true });
      return;
    }

    if (!rawPath) {
      res.status(401).json({ ok: false, message: 'Missing MediaMTX stream path.' });
      return;
    }

    const suppliedKey =
      extractKeyFromQueryString(rawQuery) || String(req.body?.password || '').trim();
    if (!suppliedKey) {
      res.status(401).json({ ok: false, message: 'Missing MediaMTX stream key.' });
      return;
    }

    const stream = await LiveStream.findOne({ mediamtxStreamPath: rawPath }).select(
      '+mediamtxStreamKey'
    );
    if (!stream || !stream.mediamtxStreamKey || stream.mediamtxStreamKey !== suppliedKey) {
      res.status(403).json({ ok: false, message: 'Invalid MediaMTX stream key or path.' });
      return;
    }

    if (action === 'publish') {
      stream.mediamtxPublishStatus = 'PUBLISHING';
      stream.streamHealth = {
        ok: true,
        status: 'PUBLISHING',
        checkedAt: new Date(),
        latencyMs: 0,
        detail: 'RTMP encoder authenticated and publishing to MediaMTX.',
      };
      await stream.save();

      const healthPayload = {
        streamId: stream._id.toString(),
        provider: 'mediamtx',
        mediamtxPublishStatus: stream.mediamtxPublishStatus,
        streamHealth: stream.streamHealth,
      };
      emitStreamEvent(stream._id.toString(), 'mediamtx:status_changed', healthPayload);
      emitStreamEvent(stream._id.toString(), 'stream:health_updated', healthPayload);
    }

    res.status(200).json({ ok: true, streamId: stream._id.toString() });
  } catch (err) {
    console.error('[MediaMTX Auth] Error:', err);
    res.status(500).json({ ok: false, message: 'MediaMTX auth validation error.' });
  }
});

// ==================== MEDIAMTX STATUS & HEALTH WEBHOOK ====================
// Receives MediaMTX lifecycle events (ready / not_ready / publish / unpublish / error)
router.post('/mediamtx/webhook', async (req: Request, res: Response) => {
  try {
    const rawPath = String(req.body?.path || req.body?.streamPath || '').replace(/^\/+/, '').trim();
    const rawStreamId = String(req.body?.streamId || '').trim();
    const rawEvent = String(req.body?.event || req.body?.action || '').toLowerCase().trim();
    const rawQuery = String(req.body?.query || '');
    const suppliedKey =
      extractKeyFromQueryString(rawQuery) ||
      String(req.body?.streamKey || req.body?.key || req.body?.password || '').trim();
    const configuredSecret = process.env.MEDIAMTX_WEBHOOK_SECRET?.trim() || '';
    const suppliedSecret = String(req.headers['x-mediamtx-secret'] || '').trim();

    if (!rawPath && !rawStreamId) {
      res.status(400).json({ ok: false, message: 'MediaMTX stream path or streamId is required.' });
      return;
    }

    const queryFilter = rawStreamId && mongoose.Types.ObjectId.isValid(rawStreamId)
      ? { _id: rawStreamId }
      : { mediamtxStreamPath: rawPath };
    const stream = await LiveStream.findOne(queryFilter).select('+mediamtxStreamKey');
    if (!stream) {
      res.status(404).json({ ok: false, message: 'Matching live stream not found.' });
      return;
    }

    const secretMatches = Boolean(configuredSecret && suppliedSecret && configuredSecret === suppliedSecret);
    const keyMatches = Boolean(stream.mediamtxStreamKey && suppliedKey && stream.mediamtxStreamKey === suppliedKey);
    if (!secretMatches && !keyMatches) {
      res.status(403).json({ ok: false, message: 'Invalid MediaMTX webhook credentials.' });
      return;
    }

    let publishStatus: 'PUBLISHING' | 'OFFLINE' | 'ERROR' = 'OFFLINE';
    let ok = false;
    let detail = sanitizeText(req.body?.detail || req.body?.message, 300);

    if (rawEvent === 'publish' || rawEvent === 'ready' || rawEvent === 'publishing') {
      publishStatus = 'PUBLISHING';
      ok = true;
      if (!detail) detail = 'MediaMTX ingest active and stream ready for playback.';
    } else if (rawEvent === 'error' || rawEvent === 'failed') {
      publishStatus = 'ERROR';
      ok = false;
      if (!detail) detail = 'MediaMTX ingest reported a stream error.';
    } else {
      publishStatus = 'OFFLINE';
      ok = false;
      if (!detail) detail = 'MediaMTX publisher disconnected.';
    }

    const latencyMs = Number.isFinite(Number(req.body?.latencyMs))
      ? Math.max(0, Number(req.body.latencyMs))
      : stream.streamHealth?.latencyMs || 0;

    stream.mediamtxPublishStatus = publishStatus;
    stream.streamHealth = {
      ok,
      status: publishStatus,
      checkedAt: new Date(),
      latencyMs,
      detail,
    };
    await stream.save();

    const healthPayload = {
      streamId: stream._id.toString(),
      provider: 'mediamtx',
      mediamtxPublishStatus: stream.mediamtxPublishStatus,
      streamHealth: stream.streamHealth,
      latencyMs,
      checkedAt: stream.streamHealth.checkedAt,
    };
    emitStreamEvent(stream._id.toString(), 'mediamtx:status_changed', healthPayload);
    emitStreamEvent(stream._id.toString(), 'stream:health_updated', healthPayload);

    res.status(200).json({ ok: true, ...healthPayload });
  } catch (err) {
    console.error('[MediaMTX Webhook] Error:', err);
    res.status(500).json({ ok: false, message: 'Failed to process MediaMTX status event.' });
  }
});

// ==================== ADMIN DIAGNOSTICS & RETRY MONGODB ====================
router.get(
  '/admin/diagnostics',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const diagnostics = await getDatabaseDiagnostics();
      const mtxEnv = getMediaMTXEnvConfig();
      res.json({
        database: diagnostics,
        mediamtx: {
          rtmpBase: mtxEnv.rtmpBase,
          hlsBase: mtxEnv.hlsBase,
          webrtcBase: mtxEnv.webrtcBase,
          apiConfigured: Boolean(process.env.MEDIAMTX_API_URL),
        },
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
      });
    } catch (err) {
      console.error('[Diagnostics] Error:', err);
      res.status(500).json({ message: 'Failed to read system diagnostics.' });
    }
  }
);

router.post(
  '/admin/diagnostics/retry-mongo',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await retryMongoConnection();
      await recordActivity(
        req.user!,
        'RETRY_MONGODB_CONNECTION',
        'Database',
        'engine',
        `Retry MongoDB -> ${result.engine} (${result.ok ? 'connected' : 'fallback'})`
      );
      res.json(result);
    } catch (err) {
      console.error('[Diagnostics] Retry Mongo error:', err);
      res.status(500).json({ message: 'Failed to retry MongoDB connection.' });
    }
  }
);

// ==================== SECURE DOCUMENT UPLOAD & RBAC DOWNLOAD ====================
router.post(
  '/documents/upload',
  authenticate,
  handleSingleUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const purpose: StoredFilePurpose =
        req.body?.purpose === 'PAYMENT_PROOF' ? 'PAYMENT_PROOF' : 'VERIFICATION_DOC';
      const tournamentId =
        typeof req.body?.tournamentId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.body.tournamentId)
          ? req.body.tournamentId
          : null;
      const registrationId =
        typeof req.body?.registrationId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.body.registrationId)
          ? req.body.registrationId
          : null;

      const result = await createStoredFileFromRequest({
        req,
        purpose,
        tournamentId,
        registrationId,
      });
      if ('error' in result) {
        res.status(result.status).json({ message: result.error });
        return;
      }

      res.status(201).json({
        file: {
          id: result.doc._id.toString(),
          ...result.meta,
        },
      });
    } catch (err) {
      console.error('[Documents] Upload error:', err);
      res.status(500).json({ message: 'Failed to upload document.' });
    }
  }
);

router.get(
  '/documents/:fileId',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(fileId)) {
        res.status(400).json({ message: 'Invalid document ID.' });
        return;
      }

      const file = await StoredFile.findById(fileId).select('+dataBase64').lean();
      if (!file || (!file.cloudinaryUrl && !file.dataBase64)) {
        res.status(404).json({ message: 'Document not found.' });
        return;
      }

      const isOwner = file.ownerUserId?.toString() === req.user!._id.toString();
      let isAuthorizedAdmin = false;
      if (['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER'].includes(req.user!.role)) {
        if (file.tournamentId) {
          isAuthorizedAdmin = await canManageTournament(req.user!, file.tournamentId.toString());
        } else {
          isAuthorizedAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
        }
      }

      if (!isOwner && !isAuthorizedAdmin) {
        res.status(403).json({ message: 'Forbidden: You are not authorized to access this document.' });
        return;
      }

      await sendStoredFileResponse(res, file, req.query.download === '1');
    } catch (err) {
      console.error('[Documents] Fetch error:', err);
      res.status(500).json({ message: 'Failed to retrieve document.' });
    }
  }
);

// ==================== CAPTAIN TOURNAMENT REGISTRATION WORKFLOW ====================
router.post(
  '/tournaments/:id/register',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }

      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      const existing = await TournamentRegistration.findOne({
        tournamentId: id,
        captainUserId: req.user!._id,
        status: { $in: ['PENDING', 'PENDING_REAPPROVAL', 'APPROVED'] },
      });
      if (existing) {
        res.status(409).json({
          message: 'You already have an active registration for this tournament.',
          registration: { ...existing.toObject(), id: existing._id.toString() },
        });
        return;
      }

      const teamName = sanitizeText(req.body.teamName, 120);
      const captainName = sanitizeText(req.body.captainName, 120) || req.user!.name;
      if (!teamName || !captainName) {
        res.status(400).json({ message: 'Team name and captain name are required.' });
        return;
      }

      const rosterCheck = normalizeAndValidateRoster(req.body.roster);
      if ('error' in rosterCheck) {
        res.status(400).json({ message: rosterCheck.error });
        return;
      }
      const roster = rosterCheck.roster;

      if (roster.length === 0) {
        res.status(400).json({ message: 'Please add at least one player to your team roster.' });
        return;
      }

      let verificationDocId: mongoose.Types.ObjectId | null = null;
      let verificationDocMeta: IStoredDocMeta | null = null;
      let resolvedVerificationDocUrl = sanitizeImageUrl(req.body.verificationDocUrl);
      if (req.body.verificationDocId && mongoose.Types.ObjectId.isValid(req.body.verificationDocId)) {
        const stored = await StoredFile.findById(req.body.verificationDocId);
        if (stored && stored.ownerUserId.toString() === req.user!._id.toString()) {
          verificationDocId = stored._id as mongoose.Types.ObjectId;
          verificationDocMeta = {
            fileId: stored._id.toString(),
            fileName: stored.fileName,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            source: stored.source,
            driveFileId: stored.driveFileId || '',
            url: stored.cloudinaryUrl || '',
            cloudinaryPublicId: stored.cloudinaryPublicId || '',
            uploadedAt: stored.createdAt || new Date(),
          };
          if (stored.cloudinaryUrl) {
            resolvedVerificationDocUrl = stored.cloudinaryUrl;
          }
          stored.tournamentId = tournament._id as mongoose.Types.ObjectId;
          await stored.save();
        }
      }

      // Auto-upgrade SPECTATOR account to CAPTAIN on first tournament registration
      if (req.user!.role === 'SPECTATOR') {
        req.user!.role = 'CAPTAIN';
        await req.user!.save();
      }

      const payCfg = resolveTournamentPaymentConfig(tournament);
      const paymentStatus: PaymentVerificationStatus =
        payCfg.paymentType !== 'NONE' && payCfg.amount > 0 ? 'PAYMENT_PENDING' : 'NOT_REQUIRED';
      const refundStatus: DepositRefundStatus =
        payCfg.paymentType === 'SECURITY_DEPOSIT' && payCfg.amount > 0 ? 'HELD' : 'NOT_APPLICABLE';

      const reg = await TournamentRegistration.create({
        tournamentId: tournament._id,
        captainUserId: req.user!._id,
        teamName,
        teamShortName: sanitizeText(req.body.teamShortName, 12).toUpperCase() || teamName.slice(0, 3).toUpperCase(),
        teamLogoUrl: sanitizeImageUrl(req.body.teamLogoUrl),
        city: sanitizeText(req.body.city, 100),
        captainName,
        captainPhone: sanitizeText(req.body.captainPhone, 30) || req.user!.phone || '',
        captainEmail: sanitizeText(req.body.captainEmail, 160) || req.user!.email,
        verificationDocUrl: resolvedVerificationDocUrl,
        verificationDocId,
        verificationDocMeta,
        verificationNotes: sanitizeText(req.body.verificationNotes, 500),
        roster,
        feeAmount: payCfg.amount,
        feeStatus: payCfg.amount > 0 ? 'PENDING' : 'WAIVED',
        paymentType: payCfg.paymentType,
        paymentStatus,
        refundStatus,
        paymentHistory: [],
        editCount: 0,
        maxEditsAfterApproval: 2,
        editHistory: [],
        status: 'PENDING',
      });

      if (verificationDocId) {
        await StoredFile.updateOne({ _id: verificationDocId }, { $set: { registrationId: reg._id } });
      }

      await recordActivity(
        req.user!,
        'SUBMIT_TOURNAMENT_REGISTRATION',
        'TournamentRegistration',
        reg._id.toString(),
        `${teamName} -> ${tournament.name}`
      );

      await notifyTournamentAdminsAndOrganizers({
        tournamentId: tournament._id,
        type: 'REGISTRATION_SUBMITTED',
        title: `New Team Registration · ${tournament.name}`,
        message: `Captain ${captainName} registered team "${teamName}" (${roster.length} players).`,
        entityType: 'TournamentRegistration',
        entityId: reg._id.toString(),
        link: `/admin/registrations?highlight=${reg._id.toString()}`,
        dedupeKeyPrefix: `reg-sub-${reg._id.toString()}`,
        metadata: {
          tournamentId: tournament._id.toString(),
          registrationId: reg._id.toString(),
        },
      });

      res.status(201).json({
        registration: { ...reg.toObject(), id: reg._id.toString() },
        message: 'Team registration submitted for organizer approval.',
      });
    } catch (err) {
      console.error('[Registrations] Submit error:', err);
      res.status(500).json({ message: 'Failed to submit tournament registration.' });
    }
  }
);

router.get(
  '/tournaments/:id/my-registration',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const reg = await TournamentRegistration.findOne({
        tournamentId: id,
        captainUserId: req.user!._id,
      })
        .select(
          '+verificationDocUrl +verificationDocId +verificationDocMeta +verificationNotes +paymentProofFileId +paymentProofMeta +previousApprovalSnapshot'
        )
        .sort({ createdAt: -1 })
        .lean();

      res.json({ registration: reg ? { ...reg, id: reg._id.toString() } : null });
    } catch (err) {
      console.error('[Registrations] My registration error:', err);
      res.status(500).json({ message: 'Failed to load your registration.' });
    }
  }
);

// Public approved tournament registrations (STRICTLY omits private verification docs, payment proof & phone/email)
router.get('/tournaments/:id/registrations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid tournament ID.' });
      return;
    }
    const regs = await TournamentRegistration.find({
      tournamentId: id,
      status: 'APPROVED',
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      registrations: regs.map((r) => ({
        ...stripPrivateRegistrationFields(r),
        id: r._id.toString(),
      })),
    });
  } catch (err) {
    console.error('[Registrations] Public list error:', err);
    res.status(500).json({ message: 'Failed to load approved registrations.' });
  }
});

router.patch(
  '/registrations/:id',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }
      const reg = await TournamentRegistration.findById(id).select(
        '+verificationDocUrl +verificationDocId +verificationDocMeta +verificationNotes +paymentProofFileId +paymentProofMeta +previousApprovalSnapshot'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }
      if (reg.captainUserId.toString() !== req.user!._id.toString()) {
        res.status(403).json({ message: 'Forbidden: Only the submitting captain can edit this registration.' });
        return;
      }
      if (reg.status === 'WITHDRAWN') {
        res.status(409).json({ message: 'Withdrawn registrations cannot be edited.' });
        return;
      }

      const isPostApprovalEdit = reg.status === 'APPROVED' || reg.status === 'PENDING_REAPPROVAL';
      const maxEdits = reg.maxEditsAfterApproval || 2;
      if (isPostApprovalEdit && (reg.editCount || 0) >= maxEdits) {
        res.status(403).json({
          message: `Maximum ${maxEdits} post-approval team edits reached. Further editing is disabled.`,
        });
        return;
      }

      let parsedRoster: IRosterPlayerEntry[] | null = null;
      if (Array.isArray(req.body.roster)) {
        const rosterCheck = normalizeAndValidateRoster(req.body.roster);
        if ('error' in rosterCheck) {
          res.status(400).json({ message: rosterCheck.error });
          return;
        }
        if (rosterCheck.roster.length === 0) {
          res.status(400).json({ message: 'Please keep at least one player in your team roster.' });
          return;
        }
        parsedRoster = rosterCheck.roster;
      }

      const previousSnapshot = {
        teamName: reg.teamName,
        teamShortName: reg.teamShortName,
        teamLogoUrl: reg.teamLogoUrl,
        city: reg.city,
        captainName: reg.captainName,
        captainPhone: reg.captainPhone,
        roster: Array.isArray(reg.roster) ? reg.roster.map((p: any) => ({ ...p })) : [],
        verificationNotes: reg.verificationNotes || '',
      };

      const changedFields: string[] = [];
      if (req.body.teamName !== undefined) {
        const clean = sanitizeText(req.body.teamName, 120);
        if (clean && clean !== reg.teamName) {
          changedFields.push('Team Name');
          reg.teamName = clean;
        }
      }
      if (req.body.teamShortName !== undefined) {
        const nextShort = sanitizeText(req.body.teamShortName, 12).toUpperCase();
        if (nextShort !== reg.teamShortName) {
          changedFields.push('Short Name');
          reg.teamShortName = nextShort;
        }
      }
      if (req.body.teamLogoUrl !== undefined) {
        const nextLogo = sanitizeImageUrl(req.body.teamLogoUrl);
        if (nextLogo !== reg.teamLogoUrl) {
          changedFields.push('Team Logo');
          reg.teamLogoUrl = nextLogo;
        }
      }
      if (req.body.city !== undefined) {
        const nextCity = sanitizeText(req.body.city, 100);
        if (nextCity !== reg.city) {
          changedFields.push('City');
          reg.city = nextCity;
        }
      }
      if (req.body.captainName !== undefined) {
        const nextCap = sanitizeText(req.body.captainName, 120);
        if (nextCap && nextCap !== reg.captainName) {
          changedFields.push('Captain Name');
          reg.captainName = nextCap;
        }
      }
      if (req.body.captainPhone !== undefined) {
        const nextPhone = sanitizeText(req.body.captainPhone, 30);
        if (nextPhone !== reg.captainPhone) {
          changedFields.push('Captain Phone');
          reg.captainPhone = nextPhone;
        }
      }
      if (req.body.verificationDocUrl !== undefined) {
        reg.verificationDocUrl = sanitizeImageUrl(req.body.verificationDocUrl);
      }
      if (req.body.verificationDocId !== undefined) {
        if (req.body.verificationDocId && mongoose.Types.ObjectId.isValid(req.body.verificationDocId)) {
          const stored = await StoredFile.findById(req.body.verificationDocId);
          if (stored && stored.ownerUserId.toString() === req.user!._id.toString()) {
            reg.verificationDocId = stored._id as mongoose.Types.ObjectId;
            reg.verificationDocMeta = {
              fileId: stored._id.toString(),
              fileName: stored.fileName,
              mimeType: stored.mimeType,
              sizeBytes: stored.sizeBytes,
              source: stored.source,
              driveFileId: stored.driveFileId || '',
              url: stored.cloudinaryUrl || '',
              cloudinaryPublicId: stored.cloudinaryPublicId || '',
              uploadedAt: stored.createdAt || new Date(),
            };
            if (stored.cloudinaryUrl) {
              reg.verificationDocUrl = stored.cloudinaryUrl;
            }
            stored.tournamentId = reg.tournamentId;
            stored.registrationId = reg._id as mongoose.Types.ObjectId;
            await stored.save();
            changedFields.push('Verification Document');
          }
        }
      }
      if (req.body.verificationNotes !== undefined) {
        const nextNotes = sanitizeText(req.body.verificationNotes, 500);
        if (nextNotes !== reg.verificationNotes) {
          changedFields.push('Notes');
          reg.verificationNotes = nextNotes;
        }
      }
      if (parsedRoster) {
        changedFields.push(`Roster (${parsedRoster.length} players)`);
        reg.roster = parsedRoster;
      }

      if (isPostApprovalEdit) {
        const prevStatus = reg.status;
        if (!reg.previousApprovalSnapshot) {
          reg.previousApprovalSnapshot = previousSnapshot;
        }
        const nextEditNumber = (reg.editCount || 0) + 1;
        reg.editCount = nextEditNumber;
        reg.status = 'PENDING_REAPPROVAL';

        const summary =
          changedFields.length > 0
            ? `Updated: ${Array.from(new Set(changedFields)).join(', ')}`
            : 'Updated team registration details';

        const historyList = Array.isArray(reg.editHistory) ? reg.editHistory : [];
        historyList.push({
          editNumber: nextEditNumber,
          editedBy: req.user!._id as mongoose.Types.ObjectId,
          editedByName: req.user!.name || reg.captainName,
          editedAt: new Date(),
          previousStatus: prevStatus,
          changesSummary: summary,
          previousData: previousSnapshot,
          reviewStatus: 'PENDING_REAPPROVAL',
        });
        reg.editHistory = historyList;

        // Suspend active approved participation in tournament until reapproval
        if (reg.teamId) {
          const tournament = await Tournament.findById(reg.tournamentId);
          if (tournament && Array.isArray(tournament.teamIds)) {
            const teamIdStr = reg.teamId.toString();
            const filtered = tournament.teamIds.filter((tid: any) => tid.toString() !== teamIdStr);
            if (filtered.length !== tournament.teamIds.length) {
              tournament.teamIds = filtered;
              await tournament.save();
            }
          }
        }

        await reg.save();

        await recordActivity(
          req.user!,
          'EDIT_APPROVED_TEAM_REGISTRATION',
          'TournamentRegistration',
          id,
          `${reg.teamName} edit #${nextEditNumber}/2 -> PENDING_REAPPROVAL`
        );

        await notifyTournamentAdminsAndOrganizers({
          tournamentId: reg.tournamentId,
          type: 'TEAM_EDITED',
          title: `Approved Team Edited · ${reg.teamName}`,
          message: `Captain ${reg.captainName} updated "${reg.teamName}" (Edit ${nextEditNumber}/${maxEdits}). Status is now Pending Reapproval.`,
          entityType: 'TournamentRegistration',
          entityId: reg._id.toString(),
          link: `/admin/registrations?status=PENDING_REAPPROVAL&highlight=${reg._id.toString()}`,
          dedupeKeyPrefix: `team-edit-${reg._id.toString()}-${nextEditNumber}-${Date.now()}`,
          metadata: {
            tournamentId: reg.tournamentId.toString(),
            registrationId: reg._id.toString(),
            status: 'PENDING_REAPPROVAL',
          },
        });

        res.json({
          registration: { ...reg.toObject(), id: reg._id.toString() },
          message: 'Your team details have been updated and are awaiting Admin/Organizer approval.',
        });
        return;
      }

      if (reg.status === 'REJECTED') reg.status = 'PENDING';
      await reg.save();

      await recordActivity(
        req.user!,
        'EDIT_TOURNAMENT_REGISTRATION',
        'TournamentRegistration',
        id,
        `${reg.teamName} updated`
      );

      res.json({
        registration: { ...reg.toObject(), id: reg._id.toString() },
        message: 'Registration details updated.',
      });
    } catch (err) {
      console.error('[Registrations] Edit error:', err);
      res.status(500).json({ message: 'Failed to update registration.' });
    }
  }
);

router.post(
  '/registrations/:id/withdraw',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }
      const reg = await TournamentRegistration.findById(id);
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }
      if (reg.captainUserId.toString() !== req.user!._id.toString()) {
        res.status(403).json({ message: 'Forbidden: Only the submitting captain can withdraw.' });
        return;
      }
      reg.status = 'WITHDRAWN';
      await reg.save();
      res.json({ registration: { ...reg.toObject(), id: reg._id.toString() } });
    } catch (err) {
      console.error('[Registrations] Withdraw error:', err);
      res.status(500).json({ message: 'Failed to withdraw registration.' });
    }
  }
);

// ==================== PAYMENT PROOF UPLOAD & VERIFICATION WORKFLOW ====================
router.post(
  '/registrations/:id/payment-proof',
  authenticate,
  handleSingleUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }

      const reg = await TournamentRegistration.findById(id).select(
        '+verificationDocUrl +verificationDocId +verificationDocMeta +verificationNotes +paymentProofFileId +paymentProofMeta'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }
      if (reg.captainUserId.toString() !== req.user!._id.toString()) {
        res.status(403).json({ message: 'Forbidden: Only the submitting captain can upload payment proof.' });
        return;
      }

      const tournament = await Tournament.findById(reg.tournamentId);
      if (!tournament) {
        res.status(404).json({ message: 'Parent tournament not found.' });
        return;
      }

      const payCfg = resolveTournamentPaymentConfig(tournament);
      if (payCfg.paymentType === 'NONE' || payCfg.amount <= 0) {
        res.status(400).json({ message: 'No entry fee or security deposit is required for this tournament.' });
        return;
      }
      if (reg.paymentStatus === 'PAYMENT_APPROVED') {
        res.status(409).json({ message: 'Payment has already been verified and approved.' });
        return;
      }

      let fileIdStr = '';
      let fileMeta: IStoredDocMeta | null = null;

      if (req.body?.storedFileId && mongoose.Types.ObjectId.isValid(req.body.storedFileId)) {
        const existingStored = await StoredFile.findById(req.body.storedFileId);
        if (!existingStored || existingStored.ownerUserId.toString() !== req.user!._id.toString()) {
          res.status(404).json({ message: 'Referenced payment proof file not found.' });
          return;
        }
        const errMsg = validateFileSpec({
          purpose: 'PAYMENT_PROOF',
          fileName: existingStored.fileName,
          mimeType: existingStored.mimeType,
          sizeBytes: existingStored.sizeBytes,
        });
        if (errMsg) {
          res.status(400).json({ message: errMsg });
          return;
        }
        existingStored.purpose = 'PAYMENT_PROOF';
        existingStored.tournamentId = tournament._id as mongoose.Types.ObjectId;
        existingStored.registrationId = reg._id as mongoose.Types.ObjectId;
        await existingStored.save();
        fileIdStr = existingStored._id.toString();
        fileMeta = {
          fileId: fileIdStr,
          fileName: existingStored.fileName,
          mimeType: existingStored.mimeType,
          sizeBytes: existingStored.sizeBytes,
          source: existingStored.source,
          driveFileId: existingStored.driveFileId || '',
          url: existingStored.cloudinaryUrl || '',
          cloudinaryPublicId: existingStored.cloudinaryPublicId || '',
          uploadedAt: existingStored.createdAt || new Date(),
        };
      } else {
        const storedRes = await createStoredFileFromRequest({
          req,
          purpose: 'PAYMENT_PROOF',
          tournamentId: tournament._id.toString(),
          registrationId: reg._id.toString(),
        });
        if ('error' in storedRes) {
          res.status(storedRes.status).json({ message: storedRes.error });
          return;
        }
        fileIdStr = storedRes.doc._id.toString();
        fileMeta = storedRes.meta;
      }

      const refNote = sanitizeText(req.body?.referenceNote, 300);
      reg.paymentType = payCfg.paymentType;
      reg.feeAmount = payCfg.amount;
      reg.paymentProofFileId = new mongoose.Types.ObjectId(fileIdStr);
      reg.paymentProofMeta = fileMeta;
      reg.paymentStatus = 'PROOF_SUBMITTED';
      reg.paymentSubmittedAt = new Date();
      reg.paymentRejectionReason = '';
      if (refNote) reg.paymentReferenceNote = refNote;
      if (payCfg.paymentType === 'SECURITY_DEPOSIT' && (!reg.refundStatus || reg.refundStatus === 'NOT_APPLICABLE')) {
        reg.refundStatus = 'HELD';
      }

      const history = Array.isArray(reg.paymentHistory) ? reg.paymentHistory : [];
      history.push({
        action: 'PROOF_SUBMITTED',
        status: 'PROOF_SUBMITTED',
        actorId: req.user!._id as mongoose.Types.ObjectId,
        actorName: req.user!.name || reg.captainName,
        timestamp: new Date(),
        notes: refNote || `Uploaded ${fileMeta.fileName}`,
        fileId: fileIdStr,
        fileName: fileMeta.fileName,
        fileUrl: fileMeta.url || '',
      });
      reg.paymentHistory = history;
      await reg.save();

      await recordActivity(
        req.user!,
        'SUBMIT_PAYMENT_PROOF',
        'TournamentRegistration',
        id,
        `${reg.teamName} (${payCfg.paymentType} ${payCfg.amount})`
      );

      await notifyTournamentAdminsAndOrganizers({
        tournamentId: tournament._id,
        type: 'PAYMENT_SUBMITTED',
        title: `Payment Proof Submitted · ${reg.teamName}`,
        message: `${reg.teamName} submitted ${payCfg.paymentType === 'SECURITY_DEPOSIT' ? 'refundable security deposit' : 'entry fee'} proof (${payCfg.amount}) for ${tournament.name}.`,
        entityType: 'TournamentRegistration',
        entityId: reg._id.toString(),
        link: `/admin/payments?registrationId=${reg._id.toString()}`,
        dedupeKeyPrefix: `pay-sub-${reg._id.toString()}-${Date.now()}`,
        metadata: {
          tournamentId: tournament._id.toString(),
          registrationId: reg._id.toString(),
        },
      });

      res.status(201).json({
        registration: { ...reg.toObject(), id: reg._id.toString() },
        message: 'Payment proof uploaded and submitted for verification.',
      });
    } catch (err) {
      console.error('[Payments] Proof upload error:', err);
      res.status(500).json({ message: 'Failed to submit payment proof.' });
    }
  }
);

router.get(
  '/payments/:registrationId/proof',
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { registrationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(registrationId)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }

      const reg = await TournamentRegistration.findById(registrationId)
        .select('+paymentProofFileId +paymentProofMeta')
        .lean();
      if (!reg || !reg.paymentProofFileId) {
        res.status(404).json({ message: 'Payment proof not found.' });
        return;
      }

      const isOwner = reg.captainUserId?.toString() === req.user!._id.toString();
      let isAuthorizedAdmin = false;
      if (['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER'].includes(req.user!.role)) {
        const hasPerm = await hasGranularPermission(req.user!, 'registrations:review');
        const canTournament = await canManageTournament(req.user!, reg.tournamentId.toString());
        isAuthorizedAdmin = hasPerm && canTournament;
      }

      if (!isOwner && !isAuthorizedAdmin) {
        res.status(403).json({ message: 'Forbidden: You are not authorized to view this payment proof.' });
        return;
      }

      const file = await StoredFile.findById(reg.paymentProofFileId).select('+dataBase64').lean();
      if (!file || (!file.cloudinaryUrl && !file.dataBase64)) {
        res.status(404).json({ message: 'Payment proof file missing from storage.' });
        return;
      }

      await sendStoredFileResponse(res, file, req.query.download === '1');
    } catch (err) {
      console.error('[Payments] Fetch proof error:', err);
      res.status(500).json({ message: 'Failed to retrieve payment proof.' });
    }
  }
);

router.get(
  '/admin/payments',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Payment & registration verification permission required.' });
        return;
      }

      const query: Record<string, unknown> = {
        $or: [{ paymentType: { $in: ['ENTRY_FEE', 'SECURITY_DEPOSIT'] } }, { feeAmount: { $gt: 0 } }],
      };
      if (
        typeof req.query.paymentStatus === 'string' &&
        [
          'PAYMENT_PENDING',
          'PROOF_SUBMITTED',
          'UNDER_VERIFICATION',
          'PAYMENT_APPROVED',
          'PAYMENT_REJECTED',
        ].includes(req.query.paymentStatus)
      ) {
        query.paymentStatus = req.query.paymentStatus;
      }
      if (
        typeof req.query.tournamentId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.query.tournamentId)
      ) {
        query.tournamentId = req.query.tournamentId;
      }

      const regs = await TournamentRegistration.find(query)
        .select('+paymentProofFileId +paymentProofMeta +verificationNotes')
        .populate('tournamentId', 'name sportType paymentMode registrationFee securityDepositAmount refundPolicy')
        .sort({ paymentSubmittedAt: -1, createdAt: -1 })
        .lean();

      const filtered = [];
      for (const r of regs as any[]) {
        const tid = r.tournamentId?._id?.toString() || r.tournamentId?.toString() || '';
        if (req.user!.role === 'TOURNAMENT_ORGANIZER' && tid) {
          const allowed = await canManageTournament(req.user!, tid);
          if (!allowed) continue;
        }
        filtered.push({
          ...r,
          id: r._id.toString(),
          tournament: r.tournamentId
            ? { ...r.tournamentId, id: r.tournamentId._id?.toString() || '' }
            : null,
        });
      }

      res.json({ payments: filtered });
    } catch (err) {
      console.error('[AdminPayments] List error:', err);
      res.status(500).json({ message: 'Failed to load payment verification queue.' });
    }
  }
);

router.post(
  '/admin/payments/:registrationId/verify',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Payment verification permission required.' });
        return;
      }

      const { registrationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(registrationId)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }

      const reg = await TournamentRegistration.findById(registrationId).select(
        '+paymentProofFileId +paymentProofMeta'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }

      const allowed = await canManageTournament(req.user!, reg.tournamentId.toString());
      if (!allowed) {
        res.status(403).json({ message: 'Forbidden: Not authorized for this tournament.' });
        return;
      }

      const decision = String(req.body?.decision || '').toUpperCase();
      if (!['UNDER_VERIFICATION', 'APPROVE', 'REJECT'].includes(decision)) {
        res.status(400).json({ message: 'Decision must be UNDER_VERIFICATION, APPROVE, or REJECT.' });
        return;
      }

      if (decision === 'APPROVE' && reg.paymentStatus === 'PAYMENT_APPROVED') {
        res.status(409).json({ message: 'This payment has already been approved.' });
        return;
      }

      if (decision === 'APPROVE' && !reg.paymentProofFileId) {
        res.status(400).json({ message: 'Cannot approve payment without an uploaded payment proof.' });
        return;
      }

      const reason = sanitizeText(req.body?.rejectionReason || req.body?.notes, 500);
      if (decision === 'REJECT' && !reason) {
        res.status(400).json({ message: 'Rejection reason is required when rejecting payment.' });
        return;
      }

      const tournament = await Tournament.findById(reg.tournamentId).select('name paymentMode').lean();
      const history = Array.isArray(reg.paymentHistory) ? reg.paymentHistory : [];

      if (decision === 'UNDER_VERIFICATION') {
        reg.paymentStatus = 'UNDER_VERIFICATION';
        history.push({
          action: 'MARKED_UNDER_VERIFICATION',
          status: 'UNDER_VERIFICATION',
          actorId: req.user!._id as mongoose.Types.ObjectId,
          actorName: req.user!.name,
          timestamp: new Date(),
          notes: reason || 'Payment proof moved to verification review.',
        });
      } else if (decision === 'APPROVE') {
        reg.paymentStatus = 'PAYMENT_APPROVED';
        reg.feeStatus = 'PAID';
        reg.paymentVerifiedBy = req.user!._id as mongoose.Types.ObjectId;
        reg.paymentVerifiedByName = req.user!.name;
        reg.paymentVerifiedAt = new Date();
        reg.paymentRejectionReason = '';
        if (reg.paymentType === 'SECURITY_DEPOSIT') {
          reg.refundStatus = 'HELD';
        }
        history.push({
          action: 'PAYMENT_APPROVED',
          status: 'PAYMENT_APPROVED',
          actorId: req.user!._id as mongoose.Types.ObjectId,
          actorName: req.user!.name,
          timestamp: new Date(),
          notes: reason || 'Payment verified and approved.',
        });
      } else {
        reg.paymentStatus = 'PAYMENT_REJECTED';
        reg.feeStatus = 'PENDING';
        reg.paymentVerifiedBy = req.user!._id as mongoose.Types.ObjectId;
        reg.paymentVerifiedByName = req.user!.name;
        reg.paymentVerifiedAt = new Date();
        reg.paymentRejectionReason = reason;
        history.push({
          action: 'PAYMENT_REJECTED',
          status: 'PAYMENT_REJECTED',
          actorId: req.user!._id as mongoose.Types.ObjectId,
          actorName: req.user!.name,
          timestamp: new Date(),
          notes: reason,
        });
      }

      reg.paymentHistory = history;
      await reg.save();

      await recordActivity(
        req.user!,
        `PAYMENT_${decision}`,
        'TournamentRegistration',
        registrationId,
        `${reg.teamName} -> ${reg.paymentStatus}`
      );

      if (decision === 'APPROVE' || decision === 'REJECT') {
        await notifyUser({
          userId: reg.captainUserId,
          type: decision === 'APPROVE' ? 'PAYMENT_APPROVED' : 'PAYMENT_REJECTED',
          title:
            decision === 'APPROVE'
              ? `Payment Approved · ${reg.teamName}`
              : `Payment Rejected · ${reg.teamName}`,
          message:
            decision === 'APPROVE'
              ? `Your payment for "${reg.teamName}" in ${tournament?.name || 'Tournament'} has been verified and approved.`
              : `Your payment proof for "${reg.teamName}" was rejected: ${reason}`,
          entityType: 'TournamentRegistration',
          entityId: reg._id.toString(),
          link: `/tournaments/${reg.tournamentId.toString()}?tab=register`,
          dedupeKey: `pay-${decision}-${registrationId}-${Date.now()}`,
          metadata: {
            tournamentId: reg.tournamentId.toString(),
            registrationId: reg._id.toString(),
            tab: 'register',
          },
        });
      }

      res.json({
        registration: { ...reg.toObject(), id: reg._id.toString() },
        message:
          decision === 'APPROVE'
            ? 'Payment approved successfully.'
            : decision === 'REJECT'
              ? 'Payment rejected and captain notified.'
              : 'Payment marked as Under Verification.',
      });
    } catch (err) {
      console.error('[AdminPayments] Verify error:', err);
      res.status(500).json({ message: 'Failed to update payment verification.' });
    }
  }
);

router.patch(
  '/admin/payments/:registrationId/refund',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Registration & deposit management permission required.' });
        return;
      }

      const { registrationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(registrationId)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }

      const reg = await TournamentRegistration.findById(registrationId).select(
        '+paymentProofFileId +paymentProofMeta'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }
      const allowed = await canManageTournament(req.user!, reg.tournamentId.toString());
      if (!allowed) {
        res.status(403).json({ message: 'Forbidden: Not authorized for this tournament.' });
        return;
      }
      if (reg.paymentType !== 'SECURITY_DEPOSIT') {
        res.status(400).json({ message: 'Refund tracking applies only to Refundable Security Deposits.' });
        return;
      }

      const nextStatus = String(req.body?.refundStatus || '').toUpperCase() as DepositRefundStatus;
      if (!['HELD', 'REFUND_INITIATED', 'REFUNDED', 'FORFEITED'].includes(nextStatus)) {
        res.status(400).json({ message: 'Invalid deposit refund status.' });
        return;
      }

      const note = sanitizeText(req.body?.notes, 300);
      reg.refundStatus = nextStatus;
      const history = Array.isArray(reg.paymentHistory) ? reg.paymentHistory : [];
      history.push({
        action: `DEPOSIT_${nextStatus}`,
        status: nextStatus,
        actorId: req.user!._id as mongoose.Types.ObjectId,
        actorName: req.user!.name,
        timestamp: new Date(),
        notes: note || `Security deposit status changed to ${nextStatus}`,
      });
      reg.paymentHistory = history;
      await reg.save();

      await notifyUser({
        userId: reg.captainUserId,
        type: 'REGISTRATION_REVIEWED',
        title: `Security Deposit Update · ${reg.teamName}`,
        message: `Your refundable security deposit status is now ${nextStatus.replace(/_/g, ' ')}.${note ? ` ${note}` : ''}`,
        entityType: 'TournamentRegistration',
        entityId: reg._id.toString(),
        link: `/tournaments/${reg.tournamentId.toString()}?tab=register`,
        dedupeKey: `dep-ref-${registrationId}-${nextStatus}-${Date.now()}`,
        metadata: {
          tournamentId: reg.tournamentId.toString(),
          registrationId: reg._id.toString(),
          tab: 'register',
        },
      });

      res.json({ registration: { ...reg.toObject(), id: reg._id.toString() } });
    } catch (err) {
      console.error('[AdminPayments] Refund error:', err);
      res.status(500).json({ message: 'Failed to update security deposit status.' });
    }
  }
);

router.get(
  '/admin/registrations',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Registration review permission required.' });
        return;
      }

      const query: Record<string, unknown> = {};
      if (
        typeof req.query.status === 'string' &&
        ['PENDING', 'PENDING_REAPPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'].includes(req.query.status)
      ) {
        query.status = req.query.status;
      }
      if (
        typeof req.query.tournamentId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.query.tournamentId)
      ) {
        query.tournamentId = req.query.tournamentId;
      }

      const regs = await TournamentRegistration.find(query)
        .select(
          '+verificationDocUrl +verificationDocId +verificationDocMeta +verificationNotes +paymentProofFileId +paymentProofMeta +previousApprovalSnapshot'
        )
        .populate('tournamentId', 'name sportType paymentMode registrationFee securityDepositAmount')
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        registrations: regs.map((r: any) => ({
          ...r,
          id: r._id.toString(),
          tournament: r.tournamentId
            ? { ...r.tournamentId, id: r.tournamentId._id?.toString() || '' }
            : null,
        })),
      });
    } catch (err) {
      console.error('[AdminRegistrations] List error:', err);
      res.status(500).json({ message: 'Failed to load tournament registrations.' });
    }
  }
);

router.post(
  '/admin/registrations/:id/review',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ok = await hasGranularPermission(req.user!, 'registrations:review');
      if (!ok) {
        res.status(403).json({ message: 'Forbidden: Registration review permission required.' });
        return;
      }

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid registration ID.' });
        return;
      }

      const decision =
        req.body.decision === 'APPROVED'
          ? 'APPROVED'
          : req.body.decision === 'REJECTED'
            ? 'REJECTED'
            : null;
      if (!decision) {
        res.status(400).json({ message: 'Decision must be APPROVED or REJECTED.' });
        return;
      }

      const reg = await TournamentRegistration.findById(id).select(
        '+verificationDocUrl +verificationDocId +verificationDocMeta +verificationNotes +paymentProofFileId +paymentProofMeta +previousApprovalSnapshot'
      );
      if (!reg) {
        res.status(404).json({ message: 'Registration not found.' });
        return;
      }

      const tournament = await Tournament.findById(reg.tournamentId);
      if (!tournament) {
        res.status(404).json({ message: 'Parent tournament not found.' });
        return;
      }

      const allowed = await canManageTournament(req.user!, tournament._id.toString());
      if (!allowed) {
        res.status(403).json({ message: 'Forbidden: You are not authorized to review teams for this tournament.' });
        return;
      }

      const payCfg = resolveTournamentPaymentConfig(tournament);
      if (
        decision === 'APPROVED' &&
        payCfg.paymentType !== 'NONE' &&
        payCfg.amount > 0 &&
        reg.paymentStatus !== 'PAYMENT_APPROVED'
      ) {
        res.status(400).json({
          message: `Cannot approve team until ${
            payCfg.paymentType === 'SECURITY_DEPOSIT' ? 'refundable security deposit' : 'entry fee'
          } payment is verified and approved.`,
        });
        return;
      }

      const wasPendingReapproval = reg.status === 'PENDING_REAPPROVAL';
      reg.status = decision;
      reg.reviewNotes = sanitizeText(req.body.reviewNotes, 400);
      reg.reviewedBy = req.user!._id as mongoose.Types.ObjectId;
      reg.reviewedAt = new Date();

      if (Array.isArray(reg.editHistory) && reg.editHistory.length > 0) {
        const lastIdx = reg.editHistory.length - 1;
        if (reg.editHistory[lastIdx].reviewStatus === 'PENDING_REAPPROVAL') {
          reg.editHistory[lastIdx].reviewStatus = decision;
          reg.editHistory[lastIdx].reviewedByName = req.user!.name;
          reg.editHistory[lastIdx].reviewedAt = new Date();
          reg.editHistory[lastIdx].reviewNotes = reg.reviewNotes;
        }
      }

      if (decision === 'APPROVED') {
        if (!reg.teamId) {
          const team = await Team.create({
            name: reg.teamName,
            shortName: reg.teamShortName || reg.teamName.slice(0, 3).toUpperCase(),
            logoUrl: reg.teamLogoUrl || '',
            sportType: tournament.sportType,
            city: reg.city || '',
            captainName: reg.captainName,
            tournamentId: tournament._id,
            createdBy: req.user!._id,
            updatedBy: req.user!._id,
          });
          reg.teamId = team._id as mongoose.Types.ObjectId;

          const uniqueRoster = dedupeRosterEntries(reg.roster || []);
          for (const entry of uniqueRoster) {
            await Player.create({
              name: entry.name,
              teamId: team._id,
              sportType: tournament.sportType,
              role: entry.role || '',
              jerseyNumber: entry.jerseyNumber ?? null,
              dateOfBirth: entry.dateOfBirth || '',
              isMinor: Boolean(entry.isMinor),
              isVerified: true,
              verifiedBy: req.user!._id,
              createdBy: req.user!._id,
              updatedBy: req.user!._id,
            });
          }
        } else {
          // Re-approval: sync updated Team profile & roster into official Team/Player records
          await Team.updateOne(
            { _id: reg.teamId },
            {
              $set: {
                name: reg.teamName,
                shortName: reg.teamShortName || reg.teamName.slice(0, 3).toUpperCase(),
                logoUrl: reg.teamLogoUrl || '',
                city: reg.city || '',
                captainName: reg.captainName,
                updatedBy: req.user!._id,
              },
            }
          );
          await Player.deleteMany({ teamId: buildIdMatchFilter(String(reg.teamId)) });
          const uniqueRoster = dedupeRosterEntries(reg.roster || []);
          for (const entry of uniqueRoster) {
            await Player.create({
              name: entry.name,
              teamId: reg.teamId,
              sportType: tournament.sportType,
              role: entry.role || '',
              jerseyNumber: entry.jerseyNumber ?? null,
              dateOfBirth: entry.dateOfBirth || '',
              isMinor: Boolean(entry.isMinor),
              isVerified: true,
              verifiedBy: req.user!._id,
              createdBy: req.user!._id,
              updatedBy: req.user!._id,
            });
          }
        }

        const currentTeamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : [];
        if (!currentTeamIds.some((tid: any) => tid.toString() === reg.teamId!.toString())) {
          tournament.teamIds = [...currentTeamIds, reg.teamId as mongoose.Types.ObjectId];
          await tournament.save();
        }
      } else if (decision === 'REJECTED' && reg.teamId) {
        const currentTeamIds = Array.isArray(tournament.teamIds) ? tournament.teamIds : [];
        const filtered = currentTeamIds.filter((tid: any) => tid.toString() !== reg.teamId!.toString());
        if (filtered.length !== currentTeamIds.length) {
          tournament.teamIds = filtered;
          await tournament.save();
        }
      }

      await reg.save();

      await recordActivity(
        req.user!,
        decision === 'APPROVED'
          ? wasPendingReapproval
            ? 'REAPPROVE_REGISTRATION'
            : 'APPROVE_REGISTRATION'
          : 'REJECT_REGISTRATION',
        'TournamentRegistration',
        id,
        `${reg.teamName} -> ${decision}`
      );

      await notifyUser({
        userId: reg.captainUserId,
        type: 'REGISTRATION_REVIEWED',
        title:
          decision === 'APPROVED'
            ? wasPendingReapproval
              ? `Updated Team Reapproved: ${reg.teamName}`
              : `Team Approved: ${reg.teamName}`
            : `Registration Update: ${reg.teamName}`,
        message:
          decision === 'APPROVED'
            ? wasPendingReapproval
              ? `Your edited team details for "${reg.teamName}" have been reapproved for ${tournament.name}!`
              : `Your team "${reg.teamName}" was approved for ${tournament.name}!`
            : `Your registration for "${reg.teamName}" in ${tournament.name} was declined. ${reg.reviewNotes || ''}`.trim(),
        entityType: 'TournamentRegistration',
        entityId: reg._id.toString(),
        link: `/tournaments/${tournament._id.toString()}?tab=register`,
        dedupeKey: `reg-review-${id}-${decision}-${Date.now()}`,
        metadata: {
          tournamentId: tournament._id.toString(),
          registrationId: reg._id.toString(),
          tab: 'register',
        },
      });

      res.json({ registration: { ...reg.toObject(), id: reg._id.toString() } });
    } catch (err) {
      console.error('[AdminRegistrations] Review error:', err);
      res.status(500).json({ message: 'Failed to review tournament registration.' });
    }
  }
);

// ==================== SPONSORS PUBLIC & IMPRESSION/CLICK TRACKING ====================
router.get('/sponsors/public', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = { isPublished: true, isActive: true };
    if (
      typeof req.query.placement === 'string' &&
      ['live_match', 'home_feed', 'tournament_banner'].includes(req.query.placement)
    ) {
      query.placement = req.query.placement;
    }
    if (
      typeof req.query.tournamentId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.tournamentId)
    ) {
      query.$or = [{ tournamentId: req.query.tournamentId }, { tournamentId: null }];
    }
    if (
      typeof req.query.liveStreamId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.liveStreamId)
    ) {
      query.$or = [{ liveStreamId: req.query.liveStreamId }, { liveStreamId: null }];
    }

    const sponsors = await Sponsor.find(query).sort({ createdAt: -1 }).lean();
    res.json({ sponsors: sponsors.map((s) => ({ ...s, id: s._id.toString() })) });
  } catch (err) {
    console.error('[SponsorsV1] Public error:', err);
    res.status(500).json({ message: 'Failed to load public sponsors.' });
  }
});

router.post('/sponsors/:id/impression', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid sponsor ID.' });
      return;
    }
    await Sponsor.updateOne({ _id: id }, { $inc: { impressionsCount: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

router.post('/sponsors/:id/click', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid sponsor ID.' });
      return;
    }
    await Sponsor.updateOne({ _id: id }, { $inc: { clicksCount: 1 } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

export default router;
