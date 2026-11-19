import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function ensureCloudinaryConfigured(): boolean {
  const cloudinaryUrl = process.env.CLOUDINARY_URL?.trim();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (cloudinaryUrl) {
    if (!configured) {
      cloudinary.config({ secure: true });
      configured = true;
    }
    return true;
  }

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    configured = true;
    return true;
  }

  return false;
}

export function isCloudinaryConfigured(): boolean {
  return ensureCloudinaryConfigured();
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  format: string;
  resourceType: string;
  bytes: number;
  width?: number;
  height?: number;
}

const ALLOWED_FOLDERS = new Set([
  'teams',
  'players',
  'tournaments',
  'sponsors',
  'streams',
  'avatars',
  'general',
]);

export function normalizeUploadFolder(folder?: string): string {
  const cleaned = typeof folder === 'string' ? folder.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
  const safeSubfolder = ALLOWED_FOLDERS.has(cleaned) ? cleaned : 'general';
  return `maidanlive/${safeSubfolder}`;
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  options: {
    folder?: string;
    originalFilename?: string;
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
  } = {}
): Promise<CloudinaryUploadResult> {
  if (!ensureCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  const folder = normalizeUploadFolder(options.folder);
  const resourceType = options.resourceType || 'auto';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        use_filename: Boolean(options.originalFilename),
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Cloudinary upload failed without a result.'));
          return;
        }
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          format: result.format || '',
          resourceType: result.resource_type || 'image',
          bytes: result.bytes || buffer.length,
          width: result.width,
          height: result.height,
        });
      }
    );

    uploadStream.end(buffer);
  });
}
