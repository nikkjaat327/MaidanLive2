import type { GraphicsElement } from '../../types/broadcastGraphics.ts';
import { isSafeGraphicsUrl } from './graphicsStyleUtils.ts';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadImageQuick(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!isSafeGraphicsUrl(src)) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 1200);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

/**
 * Generates a compact PNG/WebP thumbnail data URL (<90KB to satisfy backend sanitizer)
 * depicting the exact composition of elements for Saved Ads Library cards.
 */
export async function generateDesignThumbnailDataUrl(
  elements: GraphicsElement[],
  canvasWidth = 1920,
  canvasHeight = 1080
): Promise<string> {
  try {
    const thumbW = canvasWidth >= canvasHeight ? 320 : 180;
    const thumbH = canvasWidth >= canvasHeight ? 180 : 320;
    const scaleX = thumbW / Math.max(1, canvasWidth);
    const scaleY = thumbH / Math.max(1, canvasHeight);

    const canvas = document.createElement('canvas');
    canvas.width = thumbW;
    canvas.height = thumbH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Dark broadcast slate backdrop with faint turf accent
    const bgGrad = ctx.createLinearGradient(0, 0, thumbW, thumbH);
    bgGrad.addColorStop(0, '#090d16');
    bgGrad.addColorStop(1, '#111c2d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, thumbW, thumbH);

    // Subtle pitch grid guideline
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, thumbW - 20, thumbH - 20);

    const sorted = [...elements]
      .filter((el) => el.visible !== false)
      .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    // Preload safe images briefly
    const imageMap = new Map<string, HTMLImageElement>();
    await Promise.all(
      sorted
        .filter((el) => (el.type === 'image' || el.type === 'logo') && el.src)
        .slice(0, 6)
        .map(async (el) => {
          const loaded = await loadImageQuick(el.src || '');
          if (loaded) imageMap.set(el.id, loaded);
        })
    );

    for (const el of sorted) {
      const x = el.x * scaleX;
      const y = el.y * scaleY;
      const w = Math.max(4, el.width * scaleX);
      const h = Math.max(2, el.height * scaleY);
      const r =
        el.type === 'shape' && el.shapeKind === 'circle'
          ? Math.min(w, h) / 2
          : (el.borderRadius || 0) * scaleX;

      ctx.save();
      ctx.globalAlpha = typeof el.opacity === 'number' ? el.opacity : 1;

      // Fill / Gradient
      if (el.gradient?.enabled) {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, el.gradient.from || '#0f172a');
        g.addColorStop(1, el.gradient.to || '#1e293b');
        ctx.fillStyle = g;
        drawRoundedRect(ctx, x, y, w, h, r);
        ctx.fill();
      } else if (el.backgroundColor && el.backgroundColor !== 'transparent') {
        ctx.fillStyle = el.backgroundColor;
        drawRoundedRect(ctx, x, y, w, h, r);
        ctx.fill();
      }

      if (el.borderWidth && el.borderWidth > 0) {
        ctx.strokeStyle = el.borderColor || '#ea580c';
        ctx.lineWidth = Math.max(1, el.borderWidth * scaleX);
        drawRoundedRect(ctx, x, y, w, h, r);
        ctx.stroke();
      }

      if ((el.type === 'image' || el.type === 'logo') && imageMap.has(el.id)) {
        const img = imageMap.get(el.id)!;
        try {
          ctx.drawImage(img, x, y, w, h);
        } catch {
          // Cross-origin tainted fallback
          ctx.fillStyle = 'rgba(234, 88, 12, 0.28)';
          drawRoundedRect(ctx, x, y, w, h, r);
          ctx.fill();
        }
      } else if (el.type === 'qr') {
        ctx.fillStyle = el.qrBgColor || '#ffffff';
        drawRoundedRect(ctx, x + 2, y + 2, Math.max(4, w - 4), Math.max(4, h - 4), 2);
        ctx.fill();
        ctx.fillStyle = el.qrFgColor || '#0f172a';
        const cell = Math.max(2, Math.min(w, h) * 0.18);
        ctx.fillRect(x + 4, y + 4, cell, cell);
        ctx.fillRect(x + w - cell - 4, y + 4, cell, cell);
        ctx.fillRect(x + 4, y + h - cell - 4, cell, cell);
      } else if (el.type === 'text' && el.text) {
        const fontPx = Math.max(6, Math.round((el.fontSize || 24) * scaleY));
        ctx.fillStyle = el.fontColor || '#ffffff';
        ctx.font = `700 ${fontPx}px sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign =
          el.textAlign === 'left' ? 'left' : el.textAlign === 'right' ? 'right' : 'center';
        const tx =
          el.textAlign === 'left' ? x + 4 : el.textAlign === 'right' ? x + w - 4 : x + w / 2;
        ctx.fillText(el.text.slice(0, 34), tx, y + h / 2, Math.max(8, w - 8));
      }

      ctx.restore();
    }

    const webp = canvas.toDataURL('image/webp', 0.72);
    if (webp.startsWith('data:image/webp') && webp.length <= 85_000) {
      return webp;
    }
    const png = canvas.toDataURL('image/png');
    return png.length <= 85_000 ? png : '';
  } catch {
    return '';
  }
}
