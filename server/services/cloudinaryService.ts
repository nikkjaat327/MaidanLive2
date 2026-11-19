import { v2 as cloudinary } from 'cloudinary';

function parseCloudinaryUrl(rawUrl: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'cloudinary:') return null;
    const cloudName = parsed.hostname.trim();
    const apiKey = decodeURIComponent(parsed.username || '').trim();
    const apiSecret = decodeURIComponent(parsed.password || '').trim();
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret };
  } catch {
    return null;
  }
}

function getCloudinaryCredentials(): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  uploadPrefix?: string;
} | null {
  const uploadPrefix = process.env.CLOUDINARY_UPLOAD_PREFIX?.trim() || undefined;
  const directCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
  const directApiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const directApiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';

  if (directCloudName && directApiKey && directApiSecret) {
    return {
      cloudName: directCloudName,
      apiKey: directApiKey,
      apiSecret: directApiSecret,
      uploadPrefix,
    };
  }

  const rawUrl = process.env.CLOUDINARY_URL?.trim() || '';
  if (rawUrl) {
    const parsed = parseCloudinaryUrl(rawUrl);
    if (parsed) {
      return { ...parsed, uploadPrefix };
    }
  }

  return null;
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryCredentials() !== null;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  bytes: number;
  format: string;
  resourceType: string;
}

export async function uploadBufferToCloudinary(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folder: string;
}): Promise<CloudinaryUploadResult> {
  const creds = getCloudinaryCredentials();
  if (!creds) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL).'
    );
  }

  cloudinary.config({
    cloud_name: creds.cloudName,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    secure: true,
    ...(creds.uploadPrefix ? { upload_prefix: creds.uploadPrefix } : {}),
  });

  const isImage = params.mimeType.toLowerCase().startsWith('image/');
  const resourceType: 'image' | 'auto' = isImage ? 'image' : 'auto';
  const baseName = params.fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 60) || 'upload';

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: params.folder,
        resource_type: resourceType,
        public_id: `${baseName}_${Date.now()}`,
        use_filename: false,
        unique_filename: true,
        overwrite: false,
      },
      (err, result) => {
        if (err || !result) {
          reject(err || new Error('Cloudinary upload failed without a result.'));
          return;
        }
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          bytes: Number(result.bytes) || params.buffer.length,
          format: result.format || '',
          resourceType: result.resource_type || resourceType,
        });
      }
    );

    stream.end(params.buffer);
  });
}
