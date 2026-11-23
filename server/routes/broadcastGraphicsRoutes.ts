import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  authenticate,
  canManageStream,
  hasBroadcastAccess,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { BroadcastAdDesign } from '../models/BroadcastAdDesign.ts';
import { BroadcastGraphicsAsset } from '../models/BroadcastGraphicsAsset.ts';
import { LiveStream } from '../models/LiveStream.ts';
import {
  deleteFromCloudinary,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
} from '../services/cloudinaryService.ts';
import {
  clearLiveGraphics,
  controlGraphicsQueue,
  createOrSaveAdDesign,
  formatAdDesign,
  getGraphicsStateForMatch,
  hideLiveGraphics,
  pauseResumeGraphicsAnimations,
  showRawGraphicLive,
  showSavedDesignLive,
  triggerBroadcastGraphicEvent,
  updateGraphicsQueue,
  updateGraphicsSettings,
} from '../services/broadcastGraphicsService.ts';
import { writeBroadcastAudit } from '../services/obsControllerService.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import type {
  BroadcastGraphicEventTrigger,
  BroadcastGraphicsAssetData,
  GraphicsAssetType,
  GraphicsScope,
} from '../../src/types/broadcastGraphics.ts';

const router = Router();

const MAX_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB max for crisp overlay PNG/WebP/JPG assets
const ALLOWED_ASSET_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const VALID_ASSET_TYPES = new Set<GraphicsAssetType>(['logo', 'banner', 'promo', 'background']);
const VALID_SCOPES = new Set<GraphicsScope>(['global', 'tournament', 'match']);

const graphicsWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many graphics requests. Please slow down briefly.' },
});

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ASSET_BYTES },
});

function handleAssetUpload(req: Request, res: Response, next: NextFunction) {
  uploadMiddleware.single('file')(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ message: 'Image asset exceeds the 5 MB maximum limit.' });
        return;
      }
      res.status(400).json({ message: err?.message || 'Invalid image upload payload.' });
      return;
    }
    next();
  });
}

function sniffImageMagicBytes(buf: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP: RIFF .... WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function formatAsset(doc: any): BroadcastGraphicsAssetData {
  const id = String(doc._id || doc.id);
  const resolvedUrl = doc.cloudinaryUrl || doc.url || `/api/obs/graphics/assets/${id}/file`;
  return {
    id,
    ownerUserId: doc.ownerUserId ? String(doc.ownerUserId) : '',
    scope: doc.scope === 'tournament' || doc.scope === 'match' ? doc.scope : 'global',
    tournamentId: doc.tournamentId ? String(doc.tournamentId) : null,
    matchId: doc.matchId ? String(doc.matchId) : null,
    name: doc.name || doc.fileName || 'Sponsor Asset',
    assetType: VALID_ASSET_TYPES.has(doc.assetType) ? doc.assetType : 'banner',
    fileName: doc.fileName || 'asset.png',
    mimeType: doc.mimeType || 'image/png',
    sizeBytes: Number(doc.sizeBytes) || 0,
    width: Number(doc.width) || 0,
    height: Number(doc.height) || 0,
    url: resolvedUrl,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
  };
}

async function authorizeMatchGraphics(
  req: AuthenticatedRequest,
  res: Response,
  matchId: string
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    res.status(400).json({ message: 'Invalid match ID.' });
    return false;
  }
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  const [hasOverlay, canStream, hasControl] = await Promise.all([
    hasBroadcastAccess(user, matchId, 'broadcast:manage_overlays'),
    canManageStream(user, matchId, 'stream'),
    hasBroadcastAccess(user, matchId, 'broadcast:control'),
  ]);
  if (!hasOverlay && !canStream && !hasControl) {
    res.status(403).json({
      message: 'Forbidden: You do not have Live Graphics Studio permission for this match.',
    });
    return false;
  }
  return true;
}

// =========================================================================
// GRAPHICS ASSET UPLOAD & LIBRARY
// =========================================================================

// Public read-only immutable asset delivery route (for OBS Browser Source <img> tags without admin JWT)
router.get('/assets/:assetId/file', async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(assetId)) {
      res.status(400).send('Invalid asset ID.');
      return;
    }
    const asset: any = await BroadcastGraphicsAsset.findById(assetId).select('+dataBase64').lean();
    if (!asset) {
      res.status(404).send('Asset not found.');
      return;
    }

    if (asset.cloudinaryUrl) {
      res.redirect(302, asset.cloudinaryUrl);
      return;
    }
    if (!asset.dataBase64) {
      res.status(404).send('Asset content unavailable.');
      return;
    }

    const buf = Buffer.from(asset.dataBase64, 'base64');
    const safeMime = ALLOWED_ASSET_MIMES.has(asset.mimeType) ? asset.mimeType : 'image/png';
    res.setHeader('Content-Type', safeMime);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (err) {
    console.error('[BroadcastGraphics] Serve asset error:', err);
    res.status(500).send('Failed to load asset.');
  }
});

// GET /api/obs/graphics/assets
router.get(
  '/assets',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const matchId = typeof req.query.matchId === 'string' ? req.query.matchId.trim() : '';
      const tournamentId =
        typeof req.query.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
      const assetType = typeof req.query.assetType === 'string' ? req.query.assetType.trim() : '';

      const orFilters: Record<string, unknown>[] = [{ scope: 'global' }];
      if (tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)) {
        orFilters.push({ scope: 'tournament', tournamentId });
      }
      if (matchId && mongoose.Types.ObjectId.isValid(matchId)) {
        orFilters.push({ scope: 'match', matchId });
      }

      const query: Record<string, unknown> = { $or: orFilters };
      if (assetType && VALID_ASSET_TYPES.has(assetType as GraphicsAssetType)) {
        query.assetType = assetType;
      }

      const assets = await BroadcastGraphicsAsset.find(query)
        .sort({ updatedAt: -1 })
        .limit(120)
        .lean();

      res.json({ assets: assets.map(formatAsset) });
    } catch (err) {
      console.error('[BroadcastGraphics] List assets error:', err);
      res.status(500).json({ message: 'Failed to load graphics assets.' });
    }
  }
);

// POST /api/obs/graphics/assets
router.post(
  '/assets',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  handleAssetUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.buffer || file.size <= 0) {
        res.status(400).json({ message: 'Please attach a valid PNG, JPG, or WebP image file.' });
        return;
      }

      const detectedMime = sniffImageMagicBytes(file.buffer);
      if (!detectedMime) {
        res.status(400).json({
          message: 'Unsupported or corrupted image file. Only valid PNG, JPG, and WebP images are permitted.',
        });
        return;
      }

      const matchId = typeof req.body?.matchId === 'string' ? req.body.matchId.trim() : '';
      if (matchId && !(await authorizeMatchGraphics(req, res, matchId))) return;

      const scopeRaw = String(req.body?.scope || 'global') as GraphicsScope;
      const scope: GraphicsScope = VALID_SCOPES.has(scopeRaw) ? scopeRaw : 'global';
      const tournamentId =
        typeof req.body?.tournamentId === 'string' &&
        mongoose.Types.ObjectId.isValid(req.body.tournamentId.trim())
          ? req.body.tournamentId.trim()
          : null;
      const assetTypeRaw = String(req.body?.assetType || 'banner') as GraphicsAssetType;
      const assetType: GraphicsAssetType = VALID_ASSET_TYPES.has(assetTypeRaw)
        ? assetTypeRaw
        : 'banner';

      const cleanName = sanitizeText(req.body?.name, 140) || sanitizeText(file.originalname, 140) || 'Sponsor Graphic';
      const cleanFileName = sanitizeText(file.originalname, 240) || 'asset.png';
      const width = Math.max(0, Math.min(8000, Number(req.body?.width) || 0));
      const height = Math.max(0, Math.min(8000, Number(req.body?.height) || 0));

      let cloudinaryUrl = '';
      let cloudinaryPublicId = '';
      let dataBase64 = '';

      if (isCloudinaryConfigured()) {
        const uploaded = await uploadBufferToCloudinary({
          buffer: file.buffer,
          fileName: cleanFileName,
          mimeType: detectedMime,
          folder: 'maidanlive/broadcast_graphics',
        });
        cloudinaryUrl = uploaded.url;
        cloudinaryPublicId = uploaded.publicId;
      } else {
        dataBase64 = file.buffer.toString('base64');
      }

      const created = await BroadcastGraphicsAsset.create({
        ownerUserId: req.user!._id,
        scope,
        tournamentId: scope !== 'global' ? tournamentId : null,
        matchId: scope === 'match' && matchId ? matchId : null,
        name: cleanName,
        assetType,
        fileName: cleanFileName,
        mimeType: detectedMime,
        sizeBytes: file.size,
        width,
        height,
        cloudinaryUrl,
        cloudinaryPublicId,
        url: '',
        dataBase64,
      });

      const stableUrl = cloudinaryUrl || `/api/obs/graphics/assets/${created._id.toString()}/file`;
      created.url = stableUrl;
      await created.save();

      await writeBroadcastAudit({
        matchId: matchId || null,
        actionType: 'GRAPHICS_ASSET_UPLOADED',
        actor: req.user!,
        obsStatus: 'SUCCESS',
        metadata: {
          assetId: created._id.toString(),
          name: cleanName,
          assetType,
          sizeBytes: file.size,
        },
      });

      res.status(201).json({ asset: formatAsset(created) });
    } catch (err: any) {
      console.error('[BroadcastGraphics] Upload asset error:', err);
      res.status(500).json({ message: err?.message || 'Failed to upload image asset.' });
    }
  }
);

// PUT /api/obs/graphics/assets/:assetId/replace - Replace image keeping same asset ID / layout settings
router.put(
  '/assets/:assetId/replace',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  handleAssetUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(assetId)) {
        res.status(400).json({ message: 'Invalid asset ID.' });
        return;
      }

      const asset: any = await BroadcastGraphicsAsset.findById(assetId);
      if (!asset) {
        res.status(404).json({ message: 'Asset not found.' });
        return;
      }

      const isAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
      if (!isAdmin && String(asset.ownerUserId) !== String(req.user!._id)) {
        res.status(403).json({ message: 'Forbidden: You can only replace your own assets.' });
        return;
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file || !file.buffer || file.size <= 0) {
        res.status(400).json({ message: 'Please attach a valid PNG, JPG, or WebP replacement image.' });
        return;
      }

      const detectedMime = sniffImageMagicBytes(file.buffer);
      if (!detectedMime) {
        res.status(400).json({
          message: 'Unsupported image format. Only PNG, JPG, and WebP are allowed.',
        });
        return;
      }

      if (asset.cloudinaryPublicId) {
        await deleteFromCloudinary(asset.cloudinaryPublicId, 'image').catch(() => false);
      }

      let cloudinaryUrl = '';
      let cloudinaryPublicId = '';
      let dataBase64 = '';
      if (isCloudinaryConfigured()) {
        const uploaded = await uploadBufferToCloudinary({
          buffer: file.buffer,
          fileName: sanitizeText(file.originalname, 240) || asset.fileName,
          mimeType: detectedMime,
          folder: 'maidanlive/broadcast_graphics',
        });
        cloudinaryUrl = uploaded.url;
        cloudinaryPublicId = uploaded.publicId;
      } else {
        dataBase64 = file.buffer.toString('base64');
      }

      asset.fileName = sanitizeText(file.originalname, 240) || asset.fileName;
      asset.mimeType = detectedMime;
      asset.sizeBytes = file.size;
      if (req.body?.width) asset.width = Math.max(0, Number(req.body.width) || 0);
      if (req.body?.height) asset.height = Math.max(0, Number(req.body.height) || 0);
      asset.cloudinaryUrl = cloudinaryUrl;
      asset.cloudinaryPublicId = cloudinaryPublicId;
      asset.dataBase64 = dataBase64;
      asset.url = cloudinaryUrl || `/api/obs/graphics/assets/${asset._id.toString()}/file?v=${Date.now()}`;
      await asset.save();

      res.json({ asset: formatAsset(asset) });
    } catch (err: any) {
      console.error('[BroadcastGraphics] Replace asset error:', err);
      res.status(500).json({ message: err?.message || 'Failed to replace image asset.' });
    }
  }
);

// DELETE /api/obs/graphics/assets/:assetId
router.delete(
  '/assets/:assetId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { assetId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(assetId)) {
        res.status(400).json({ message: 'Invalid asset ID.' });
        return;
      }
      const asset: any = await BroadcastGraphicsAsset.findById(assetId);
      if (!asset) {
        res.status(404).json({ message: 'Asset not found.' });
        return;
      }

      const isAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
      if (!isAdmin && String(asset.ownerUserId) !== String(req.user!._id)) {
        res.status(403).json({ message: 'Forbidden: You can only delete your own assets.' });
        return;
      }

      if (asset.cloudinaryPublicId) {
        await deleteFromCloudinary(asset.cloudinaryPublicId, 'image').catch(() => false);
      }
      await BroadcastGraphicsAsset.deleteOne({ _id: assetId });
      res.json({ ok: true, id: assetId });
    } catch (err) {
      console.error('[BroadcastGraphics] Delete asset error:', err);
      res.status(500).json({ message: 'Failed to delete asset.' });
    }
  }
);

// =========================================================================
// SAVED ADVERTISEMENTS LIBRARY & CUSTOM TEMPLATES
// =========================================================================

// GET /api/obs/graphics/designs
router.get(
  '/designs',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const matchId = typeof req.query.matchId === 'string' ? req.query.matchId.trim() : '';
      const tournamentId =
        typeof req.query.tournamentId === 'string' ? req.query.tournamentId.trim() : '';
      const scopeFilter = typeof req.query.scope === 'string' ? req.query.scope.trim() : 'all';
      const isTemplateParam = req.query.isTemplate;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

      const orFilters: Record<string, unknown>[] = [];
      if (scopeFilter === 'global') {
        orFilters.push({ scope: 'global' });
      } else if (scopeFilter === 'tournament' && tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)) {
        orFilters.push({ scope: 'tournament', tournamentId });
      } else if (scopeFilter === 'match' && matchId && mongoose.Types.ObjectId.isValid(matchId)) {
        orFilters.push({ scope: 'match', matchId });
      } else {
        orFilters.push({ scope: 'global' });
        if (tournamentId && mongoose.Types.ObjectId.isValid(tournamentId)) {
          orFilters.push({ scope: 'tournament', tournamentId });
        }
        if (matchId && mongoose.Types.ObjectId.isValid(matchId)) {
          orFilters.push({ scope: 'match', matchId });
        }
      }

      const query: Record<string, unknown> = { $or: orFilters };
      if (isTemplateParam === 'true') query.isTemplate = true;
      else if (isTemplateParam === 'false') query.isTemplate = false;

      const docs = await BroadcastAdDesign.find(query).sort({ updatedAt: -1 }).limit(150).lean();
      let formatted = docs.map(formatAdDesign);
      if (search) {
        formatted = formatted.filter(
          (d) =>
            d.name.toLowerCase().includes(search) ||
            d.designType.toLowerCase().includes(search) ||
            d.layoutPreset.toLowerCase().includes(search)
        );
      }

      res.json({ designs: formatted });
    } catch (err) {
      console.error('[BroadcastGraphics] List designs error:', err);
      res.status(500).json({ message: 'Failed to load saved advertisements.' });
    }
  }
);

// POST /api/obs/graphics/designs - Create new saved advertisement or custom template
router.post(
  '/designs',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const matchId = typeof req.body.matchId === 'string' ? req.body.matchId.trim() : '';
      if (matchId && !(await authorizeMatchGraphics(req, res, matchId))) return;

      let tournamentId =
        typeof req.body.tournamentId === 'string' ? req.body.tournamentId.trim() : null;
      if (!tournamentId && matchId && mongoose.Types.ObjectId.isValid(matchId)) {
        const m = await LiveStream.findById(matchId).select('tournamentId').lean();
        if (m?.tournamentId) tournamentId = String(m.tournamentId);
      }

      const design = await createOrSaveAdDesign({
        name: req.body.name,
        designType: req.body.designType,
        isTemplate: Boolean(req.body.isTemplate),
        scope: req.body.scope,
        tournamentId,
        matchId: matchId || null,
        canvasWidth: req.body.canvasWidth,
        canvasHeight: req.body.canvasHeight,
        layoutPreset: req.body.layoutPreset,
        elements: req.body.elements,
        entryAnimation: req.body.entryAnimation,
        exitAnimation: req.body.exitAnimation,
        defaultDurationSeconds: req.body.defaultDurationSeconds,
        thumbnailDataUrl: req.body.thumbnailDataUrl,
        actor: req.user!,
      });

      res.status(201).json({ design });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ message: err?.message || 'Failed to save advertisement design.' });
    }
  }
);

// PATCH /api/obs/graphics/designs/:designId - Update existing saved advertisement / duration
router.patch(
  '/designs/:designId',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { designId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(designId)) {
        res.status(400).json({ message: 'Invalid design ID.' });
        return;
      }

      const existing = await BroadcastAdDesign.findById(designId);
      if (!existing) {
        res.status(404).json({ message: 'Saved advertisement not found.' });
        return;
      }

      const isAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
      if (!isAdmin && String(existing.ownerUserId) !== String(req.user!._id)) {
        res.status(403).json({ message: 'Forbidden: You can only edit your own saved advertisements.' });
        return;
      }

      // Partial update support (e.g. Set Default Duration from Saved Ads Library)
      const isDurationOrNameOnly =
        req.body.elements === undefined &&
        (req.body.defaultDurationSeconds !== undefined || req.body.name !== undefined);

      if (isDurationOrNameOnly) {
        if (typeof req.body.name === 'string' && req.body.name.trim()) {
          existing.name = sanitizeText(req.body.name, 140);
        }
        if (req.body.defaultDurationSeconds !== undefined) {
          const dur = Number(req.body.defaultDurationSeconds);
          if (Number.isFinite(dur) && dur >= 0 && dur <= 86400) {
            existing.defaultDurationSeconds = Math.round(dur);
          }
        }
        existing.updatedBy = req.user!._id as mongoose.Types.ObjectId;
        await existing.save();
        res.json({ design: formatAdDesign(existing) });
        return;
      }

      const design = await createOrSaveAdDesign({
        designId,
        name: req.body.name ?? existing.name,
        designType: req.body.designType ?? existing.designType,
        isTemplate:
          req.body.isTemplate !== undefined ? Boolean(req.body.isTemplate) : existing.isTemplate,
        scope: req.body.scope ?? existing.scope,
        tournamentId:
          req.body.tournamentId !== undefined
            ? req.body.tournamentId
            : existing.tournamentId
              ? String(existing.tournamentId)
              : null,
        matchId:
          req.body.matchId !== undefined
            ? req.body.matchId
            : existing.matchId
              ? String(existing.matchId)
              : null,
        canvasWidth: req.body.canvasWidth ?? existing.canvasWidth,
        canvasHeight: req.body.canvasHeight ?? existing.canvasHeight,
        layoutPreset: req.body.layoutPreset ?? existing.layoutPreset,
        elements: req.body.elements ?? existing.elements,
        entryAnimation: req.body.entryAnimation ?? existing.entryAnimation,
        exitAnimation: req.body.exitAnimation ?? existing.exitAnimation,
        defaultDurationSeconds:
          req.body.defaultDurationSeconds ?? existing.defaultDurationSeconds,
        thumbnailDataUrl: req.body.thumbnailDataUrl ?? existing.thumbnailDataUrl,
        actor: req.user!,
      });

      res.json({ design });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ message: err?.message || 'Failed to update advertisement design.' });
    }
  }
);

// POST /api/obs/graphics/designs/:designId/duplicate
router.post(
  '/designs/:designId/duplicate',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { designId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(designId)) {
        res.status(400).json({ message: 'Invalid design ID.' });
        return;
      }
      const existing = await BroadcastAdDesign.findById(designId).lean();
      if (!existing) {
        res.status(404).json({ message: 'Saved advertisement not found.' });
        return;
      }

      const duplicate = await createOrSaveAdDesign({
        name: sanitizeText(req.body?.name, 140) || `${existing.name} (Copy)`,
        designType: existing.designType,
        isTemplate: Boolean(req.body?.isTemplate ?? false),
        scope: req.body?.scope || existing.scope,
        tournamentId: existing.tournamentId ? String(existing.tournamentId) : null,
        matchId: existing.matchId ? String(existing.matchId) : null,
        canvasWidth: existing.canvasWidth,
        canvasHeight: existing.canvasHeight,
        layoutPreset: existing.layoutPreset,
        elements: existing.elements,
        entryAnimation: existing.entryAnimation,
        exitAnimation: existing.exitAnimation,
        defaultDurationSeconds: existing.defaultDurationSeconds,
        thumbnailDataUrl: existing.thumbnailDataUrl,
        actor: req.user!,
      });

      res.status(201).json({ design: duplicate });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ message: err?.message || 'Failed to duplicate advertisement.' });
    }
  }
);

// DELETE /api/obs/graphics/designs/:designId
router.delete(
  '/designs/:designId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { designId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(designId)) {
        res.status(400).json({ message: 'Invalid design ID.' });
        return;
      }
      const existing = await BroadcastAdDesign.findById(designId);
      if (!existing) {
        res.status(404).json({ message: 'Saved advertisement not found.' });
        return;
      }

      const isAdmin = req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN';
      if (!isAdmin && String(existing.ownerUserId) !== String(req.user!._id)) {
        res.status(403).json({ message: 'Forbidden: You can only delete your own saved advertisements.' });
        return;
      }

      await BroadcastAdDesign.deleteOne({ _id: designId });
      await writeBroadcastAudit({
        matchId: existing.matchId ? String(existing.matchId) : null,
        actionType: 'GRAPHICS_DELETED',
        actor: req.user!,
        obsStatus: 'SUCCESS',
        metadata: { designId, name: existing.name },
      });

      res.json({ ok: true, id: designId });
    } catch (err) {
      console.error('[BroadcastGraphics] Delete design error:', err);
      res.status(500).json({ message: 'Failed to delete saved advertisement.' });
    }
  }
);

// =========================================================================
// MATCH-SCOPED LIVE GRAPHICS PLAYBACK, QUEUE & EVENT TRIGGERS
// =========================================================================

// GET /api/obs/graphics/matches/:matchId/state
router.get(
  '/matches/:matchId/state',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const graphicsState = await getGraphicsStateForMatch(matchId);
      res.json({ graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Get match state error:', err);
      res.status(500).json({ message: 'Failed to fetch match graphics state.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/apply-live
router.post(
  '/matches/:matchId/apply-live',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;

      const graphicsState = await showRawGraphicLive({
        matchId,
        designId: typeof req.body.designId === 'string' ? req.body.designId : null,
        name: req.body.name || 'Live Canvas Graphic',
        canvasWidth: Number(req.body.canvasWidth) || 1920,
        canvasHeight: Number(req.body.canvasHeight) || 1080,
        elements: req.body.elements || [],
        entryAnimation: req.body.entryAnimation || 'slide-bottom',
        exitAnimation: req.body.exitAnimation || 'fade-out',
        durationSeconds: Number(req.body.durationSeconds ?? 0),
        overlapPolicy: req.body.overlapPolicy,
        actor: req.user!,
        triggerSource: 'live_edit',
      });

      res.json({ ok: true, graphicsState });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ message: err?.message || 'Failed to apply live graphic.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/designs/:designId/show-live (One-Click SHOW LIVE)
router.post(
  '/matches/:matchId/designs/:designId/show-live',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, designId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      if (!mongoose.Types.ObjectId.isValid(designId)) {
        res.status(400).json({ message: 'Invalid advertisement design ID.' });
        return;
      }

      const durationSecondsOverride =
        typeof req.body?.durationSecondsOverride === 'number' &&
        Number.isFinite(req.body.durationSecondsOverride)
          ? req.body.durationSecondsOverride
          : null;

      const { state, design } = await showSavedDesignLive({
        matchId,
        designId,
        durationSecondsOverride,
        overlapPolicyOverride: req.body?.overlapPolicy,
        actor: req.user!,
        triggerSource: 'saved_ad',
      });

      res.json({ ok: true, graphicsState: state, design });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ message: err?.message || 'Failed to show advertisement live.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/hide
router.post(
  '/matches/:matchId/hide',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : undefined;
      const graphicsState = await hideLiveGraphics(matchId, instanceId, req.user!);
      res.json({ ok: true, graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Hide error:', err);
      res.status(500).json({ message: 'Failed to hide live advertisement.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/clear
router.post(
  '/matches/:matchId/clear',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const graphicsState = await clearLiveGraphics(matchId, req.user!);
      res.json({ ok: true, graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Clear error:', err);
      res.status(500).json({ message: 'Failed to clear live graphics.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/pause-animation
router.post(
  '/matches/:matchId/pause-animation',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const paused = Boolean(req.body?.paused);
      const graphicsState = await pauseResumeGraphicsAnimations(matchId, paused, req.user!);
      res.json({ ok: true, graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Pause animation error:', err);
      res.status(500).json({ message: 'Failed to pause/resume animations.' });
    }
  }
);

// PUT /api/obs/graphics/matches/:matchId/settings
router.put(
  '/matches/:matchId/settings',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const graphicsState = await updateGraphicsSettings(
        matchId,
        {
          overlapPolicy: req.body?.overlapPolicy,
          eventRules: req.body?.eventRules,
        },
        req.user!
      );
      res.json({ ok: true, graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Settings error:', err);
      res.status(500).json({ message: 'Failed to save graphics settings.' });
    }
  }
);

// PUT /api/obs/graphics/matches/:matchId/queue
router.put(
  '/matches/:matchId/queue',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const graphicsState = await updateGraphicsQueue(
        matchId,
        {
          queue: req.body?.queue || [],
          queueAutoAdvance: req.body?.queueAutoAdvance,
        },
        req.user!
      );
      res.json({ ok: true, graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Queue update error:', err);
      res.status(500).json({ message: 'Failed to update advertisement queue.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/queue/control
router.post(
  '/matches/:matchId/queue/control',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const action = req.body?.action;
      if (!['start', 'play_next', 'pause', 'stop'].includes(action)) {
        res.status(400).json({ message: 'Invalid queue control action.' });
        return;
      }
      const graphicsState = await controlGraphicsQueue(matchId, action, req.user!);
      res.json({ ok: true, graphicsState });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ message: err?.message || 'Queue control command failed.' });
    }
  }
);

// POST /api/obs/graphics/matches/:matchId/event-rules/test
router.post(
  '/matches/:matchId/event-rules/test',
  authenticate,
  requireAdminPortal,
  graphicsWriteLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeMatchGraphics(req, res, matchId))) return;
      const trigger = req.body?.trigger as BroadcastGraphicEventTrigger;
      const triggered = await triggerBroadcastGraphicEvent(
        matchId,
        trigger,
        `manual_test_${Date.now()}`
      );
      const graphicsState = await getGraphicsStateForMatch(matchId);
      res.json({ ok: true, triggered, graphicsState });
    } catch (err) {
      console.error('[BroadcastGraphics] Event test error:', err);
      res.status(500).json({ message: 'Failed to test event trigger.' });
    }
  }
);

export default router;
