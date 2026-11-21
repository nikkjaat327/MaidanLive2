const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 800;

function getExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode this image file. Please select a valid JPG, PNG, or WebP photo.'));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export async function compressPlayerPhoto(file: File): Promise<{
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}> {
  const mime = (file.type || '').toLowerCase().trim();
  const ext = getExt(file.name || '');

  if ((!mime || !ALLOWED_IMAGE_MIME.has(mime)) && !ALLOWED_IMAGE_EXT.includes(ext)) {
    throw new Error('Player photo must be a JPG, PNG, or WebP image.');
  }
  if (file.size <= 0) {
    throw new Error('Selected image file is empty.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Selected image is too large (max 15 MB before compression).');
  }

  let width = 0;
  let height = 0;
  let drawSource: CanvasImageSource | null = null;
  let bitmap: ImageBitmap | null = null;

  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
      drawSource = bitmap;
    } else {
      const img = await loadHtmlImage(file);
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
      drawSource = img;
    }
  } catch {
    const img = await loadHtmlImage(file);
    width = img.naturalWidth || img.width;
    height = img.naturalHeight || img.height;
    drawSource = img;
  }

  if (!drawSource || width <= 0 || height <= 0) {
    if (bitmap) bitmap.close();
    throw new Error('Invalid image dimensions.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (bitmap) bitmap.close();
    throw new Error('Image compression is unavailable in this browser.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);
  if (bitmap) bitmap.close();

  let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
  let outMime = 'image/webp';
  let outExt = 'webp';

  if (!blob || blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
    outMime = 'image/jpeg';
    outExt = 'jpg';
  }

  if (!blob) {
    throw new Error('Failed to encode compressed player photo.');
  }

  const baseName = (file.name || 'player')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 48) || 'player';

  const compressedFile = new File([blob], `${baseName}.${outExt}`, {
    type: outMime,
    lastModified: Date.now(),
  });

  const previewUrl = URL.createObjectURL(compressedFile);

  return {
    file: compressedFile,
    previewUrl,
    width: targetWidth,
    height: targetHeight,
  };
}
