import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requireAdminPortal } from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { ADMIN_PORTAL_ROLES } from '../models/User.ts';
import { UploadedAsset } from '../models/UploadedAsset.ts';
import {
  isCloudinaryConfigured,
  normalizeUploadFolder,
  uploadBufferToCloudinary,
} from '../utils/cloudinary.ts';
import { recordActivity } from '../utils/audit.ts';
import { sanitizeText } from '../utils/sanitize.ts';

const router = Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

function handleMulterUpload(req: Request, res: Response, next: NextFunction): void {
  uploadMiddleware.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ message: 'File exceeds the 10 MB upload limit.' });
        return;
      }
      res.status(400).json({ message: err.message || 'Invalid file upload request.' });
      return;
    }
    res.status(400).json({
      message: err instanceof Error ? err.message : 'Unable to process uploaded file.',
    });
  });
}

// Check Cloudinary configuration status
router.get('/status', (_req: Request, res: Response) => {
  res.json({ configured: isCloudinaryConfigured() });
});

// List uploaded assets in DB (Admin portal only)
router.get(
  '/',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const assets = await UploadedAsset.find().sort({ createdAt: -1 }).limit(100).lean();
      res.json({
        assets: assets.map((a) => ({
          ...a,
          id: a._id.toString(),
        })),
      });
    } catch (err) {
      console.error('[Uploads] List assets error:', err);
      res.status(500).json({ message: 'Failed to load uploaded assets.' });
    }
  }
);

// Upload any user file to Cloudinary and persist its link in MongoDB
router.post(
  '/',
  authenticate,
  handleMulterUpload,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!isCloudinaryConfigured()) {
        res.status(503).json({
          message:
            'Cloudinary upload service is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment variables.',
        });
        return;
      }

      const file = req.file;
      if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ message: 'Please select a file to upload.' });
        return;
      }

      const rawFolder = typeof req.body?.folder === 'string' ? req.body.folder : 'general';
      const folder = normalizeUploadFolder(rawFolder);

      const result = await uploadBufferToCloudinary(file.buffer, {
        folder: rawFolder,
        originalFilename: file.originalname,
        resourceType: 'auto',
      });

      const savedAsset = await UploadedAsset.create({
        url: result.url,
        publicId: result.publicId,
        originalName: sanitizeText(file.originalname, 260),
        mimeType: sanitizeText(file.mimetype, 120),
        format: result.format,
        resourceType: result.resourceType,
        folder,
        bytes: result.bytes,
        width: result.width ?? null,
        height: result.height ?? null,
        uploadedBy: req.user!._id,
      });

      if (ADMIN_PORTAL_ROLES.includes(req.user!.role)) {
        await recordActivity(
          req.user!,
          'UPLOAD_ASSET',
          'UploadedAsset',
          savedAsset._id.toString(),
          `${savedAsset.originalName || savedAsset.publicId} -> ${folder}`,
          { newValue: { url: savedAsset.url, publicId: savedAsset.publicId } }
        );
      }

      res.status(201).json({
        url: savedAsset.url,
        publicId: savedAsset.publicId,
        asset: {
          ...savedAsset.toObject(),
          id: savedAsset._id.toString(),
        },
      });
    } catch (err) {
      console.error('[Uploads] Cloudinary upload error:', err);
      res.status(500).json({
        message:
          err instanceof Error && err.message
            ? `Cloudinary upload failed: ${err.message}`
            : 'Failed to upload file to Cloudinary.',
      });
    }
  }
);

export default router;
