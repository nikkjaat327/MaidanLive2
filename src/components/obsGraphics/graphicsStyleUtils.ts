import type { CSSProperties } from 'react';
import type {
  GraphicsAnimationDirection,
  GraphicsAnimationSpeed,
  GraphicsAnimationStyle,
  GraphicsElement,
  GraphicsElementAnimation,
  GraphicsGradientConfig,
  GraphicsImageMask,
} from '../../types/broadcastGraphics.ts';

const ANIMATION_KEYFRAME_MAP: Record<GraphicsAnimationStyle, string> = {
  none: '',
  'fade-in': 'mlGfxFadeIn',
  'fade-out': 'mlGfxFadeOut',
  'slide-left': 'mlGfxSlideLeft',
  'slide-right': 'mlGfxSlideRight',
  'slide-top': 'mlGfxSlideTop',
  'slide-bottom': 'mlGfxSlideBottom',
  'slide-out-left': 'mlGfxSlideOutLeft',
  'slide-out-right': 'mlGfxSlideOutRight',
  'slide-out-top': 'mlGfxSlideOutTop',
  'slide-out-bottom': 'mlGfxSlideOutBottom',
  'zoom-in': 'mlGfxZoomIn',
  'zoom-out': 'mlGfxZoomOut',
  'pop-in': 'mlGfxPopIn',
  'pop-out': 'mlGfxPopOut',
  bounce: 'mlGfxBounce',
  'bounce-in': 'mlGfxBounceIn',
  'rotate-in': 'mlGfxRotateIn',
  'rotate-out': 'mlGfxRotateOut',
  'flip-in': 'mlGfxFlipIn',
  'blur-in': 'mlGfxBlurIn',
  'blur-out': 'mlGfxBlurOut',
  pulse: 'mlGfxPulse',
  float: 'mlGfxFloat',
  glow: 'mlGfxGlow',
  blink: 'mlGfxBlink',
  shake: 'mlGfxShake',
  'rotate-loop': 'mlGfxRotateLoop',
  marquee: 'mlGfxMarquee',
};

const CONTINUOUS_ONLY_STYLES = new Set<GraphicsAnimationStyle>([
  'pulse',
  'bounce',
  'float',
  'glow',
  'blink',
  'shake',
  'rotate-loop',
  'marquee',
]);

export function isSafeGraphicsUrl(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/')
  ) {
    return false;
  }
  return (
    trimmed.startsWith('/') ||
    lower.startsWith('https://') ||
    lower.startsWith('http://')
  );
}

export function resolveQrTargetUrl(
  el: Pick<GraphicsElement, 'qrLinkType' | 'qrUrl' | 'qrTargetId'>,
  context?: { matchId?: string; tournamentId?: string | null }
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://maidanlive.com';

  const custom = el.qrUrl?.trim();
  const targetId = el.qrTargetId?.trim();

  switch (el.qrLinkType) {
    case 'match': {
      const id = targetId || context?.matchId;
      if (id) return `${origin}/live/${encodeURIComponent(id)}`;
      break;
    }
    case 'tournament':
    case 'registration': {
      const id = targetId || context?.tournamentId;
      if (id) return `${origin}/tournaments/${encodeURIComponent(id)}`;
      break;
    }
    case 'team': {
      if (targetId) return `${origin}/teams/${encodeURIComponent(targetId)}`;
      break;
    }
    default:
      break;
  }

  if (custom && isSafeGraphicsUrl(custom)) {
    return custom;
  }
  if (context?.matchId) {
    return `${origin}/live/${encodeURIComponent(context.matchId)}`;
  }
  return origin;
}

export function formatLinearGradient(
  grad: GraphicsGradientConfig | undefined,
  fallback = 'transparent'
): string {
  if (!grad?.enabled) return fallback;
  const angle = Math.round(Number(grad.angle ?? 135));
  if (Array.isArray(grad.stops) && grad.stops.length >= 2) {
    const sorted = [...grad.stops].sort((a, b) => a.position - b.position);
    const stopStr = sorted.map((s) => `${s.color} ${s.position}%`).join(', ');
    return `linear-gradient(${angle}deg, ${stopStr})`;
  }
  return `linear-gradient(${angle}deg, ${grad.from || '#0f172a'}, ${grad.to || '#1e293b'})`;
}

export function applyColorOpacity(color: string | undefined, opacity = 1): string {
  const raw = (color || 'transparent').trim();
  if (raw === 'transparent' || opacity >= 0.999) return raw;
  const clamped = Math.max(0, Math.min(1, opacity));
  if (raw.startsWith('#')) {
    let hex = raw.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const existingA = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return `rgba(${r}, ${g}, ${b}, ${Number((clamped * existingA).toFixed(3))})`;
      }
    }
  }
  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    raw
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    const a = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1;
    return `rgba(${r}, ${g}, ${b}, ${Number((clamped * a).toFixed(3))})`;
  }
  return raw;
}

export function hexFromColor(color: string | undefined, fallback = '#ffffff'): string {
  const raw = (color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(raw)) return `#${raw.slice(1, 7).toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(raw);
  if (m) {
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${toHex(Number(m[1]))}${toHex(Number(m[2]))}${toHex(Number(m[3]))}`;
  }
  return fallback;
}

export function rgbFromColor(color: string | undefined): { r: number; g: number; b: number } {
  const hex = hexFromColor(color, '#0f172a');
  return {
    r: parseInt(hex.slice(1, 3), 16) || 0,
    g: parseInt(hex.slice(3, 5), 16) || 0,
    b: parseInt(hex.slice(5, 7), 16) || 0,
  };
}

export function getImageMaskStyles(
  mask: GraphicsImageMask | undefined,
  crop?: { top: number; right: number; bottom: number; left: number }
): { clipPath?: string; borderRadius?: number } {
  const hasCrop = Boolean(
    crop && (crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0)
  );
  if (hasCrop && crop) {
    return {
      clipPath: `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`,
    };
  }
  switch (mask) {
    case 'circle':
      return { clipPath: 'circle(50% at 50% 50%)' };
    case 'rounded':
      return { borderRadius: 20 };
    case 'pill':
      return { borderRadius: 9999 };
    case 'diamond':
      return { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' };
    case 'hexagon':
      return { clipPath: 'polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0% 50%)' };
    case 'diagonal':
      return { clipPath: 'polygon(8% 0%, 100% 0%, 92% 100%, 0% 100%)' };
    default:
      return {};
  }
}

export function getAnchorTransformOrigin(anchor?: GraphicsElement['anchorPoint']): string {
  switch (anchor) {
    case 'top-left':
      return 'top left';
    case 'top-right':
      return 'top right';
    case 'bottom-left':
      return 'bottom left';
    case 'bottom-right':
      return 'bottom right';
    default:
      return 'center center';
  }
}

function speedMultiplier(speed?: GraphicsAnimationSpeed): number {
  if (speed === 'slow') return 1.5;
  if (speed === 'fast') return 0.62;
  return 1;
}

export function buildSlotContainerAnimationStyle(opts: {
  entryAnimation?: GraphicsAnimationStyle;
  exitAnimation?: GraphicsAnimationStyle;
  exiting?: boolean;
  paused?: boolean;
}): CSSProperties {
  const styleKey = opts.exiting
    ? opts.exitAnimation || 'fade-out'
    : opts.entryAnimation || 'fade-in';
  const keyframe = ANIMATION_KEYFRAME_MAP[styleKey] || '';
  if (!keyframe) return {};

  const isLoop = !opts.exiting && CONTINUOUS_ONLY_STYLES.has(styleKey);
  const durationMs = opts.exiting ? 320 : isLoop ? 1800 : 420;
  const easing =
    styleKey === 'pop-in' || styleKey === 'bounce-in'
      ? 'cubic-bezier(0.22, 1, 0.36, 1)'
      : styleKey === 'marquee' || styleKey === 'rotate-loop'
        ? 'linear'
        : 'cubic-bezier(0.16, 1, 0.3, 1)';

  return {
    animationName: keyframe,
    animationDuration: `${durationMs}ms`,
    animationTimingFunction: easing,
    animationIterationCount: isLoop ? 'infinite' : '1',
    animationFillMode: 'both',
    animationPlayState: opts.paused ? 'paused' : 'running',
  };
}

export function buildElementAnimationStyle(
  animation: Partial<GraphicsElementAnimation> | undefined,
  opts?: { paused?: boolean; exiting?: boolean; disableDelay?: boolean }
): CSSProperties {
  if (!animation) return {};
  const activeStyle: GraphicsAnimationStyle = opts?.exiting
    ? animation.exitStyle || 'fade-out'
    : animation.style || 'none';
  const keyframe = ANIMATION_KEYFRAME_MAP[activeStyle] || '';
  if (!keyframe) return {};

  const baseDuration = opts?.exiting
    ? Math.max(100, Math.min(15000, Number(animation.exitDurationMs) || 340))
    : Math.max(100, Math.min(15000, Number(animation.durationMs) || 420));

  const scaledDuration = Math.round(baseDuration * speedMultiplier(animation.speed));
  const delayMs = opts?.exiting || opts?.disableDelay
    ? 0
    : Math.max(0, Number(animation.delayMs) || 0) +
      Math.max(0, Number(animation.startTimeMs) || 0);

  const isLegacyLoopStyle = !opts?.exiting && CONTINUOUS_ONLY_STYLES.has(activeStyle);
  const isContinuous =
    !opts?.exiting &&
    (isLegacyLoopStyle || Boolean(animation.loop) || animation.endBehavior === 'loop');
  const repeat =
    isContinuous
      ? 'infinite'
      : typeof animation.repeatCount === 'number' && animation.repeatCount > 1
        ? String(animation.repeatCount)
        : '1';

  const direction: GraphicsAnimationDirection =
    animation.direction === 'reverse' || animation.direction === 'alternate'
      ? animation.direction
      : 'normal';

  const effectiveDuration =
    activeStyle === 'marquee' && scaledDuration < 2500 ? 6000 : scaledDuration;

  const timing =
    animation.easing && animation.easing.trim()
      ? animation.easing
      : activeStyle === 'marquee' || activeStyle === 'rotate-loop'
        ? 'linear'
        : 'cubic-bezier(0.16, 1, 0.3, 1)';

  return {
    animationName: keyframe,
    animationDuration: `${effectiveDuration}ms`,
    animationDelay: `${delayMs}ms`,
    animationTimingFunction: timing,
    animationDirection: direction,
    animationIterationCount: repeat,
    animationFillMode: 'both',
    animationPlayState: opts?.paused ? 'paused' : 'running',
  };
}

export function buildContinuousAnimationStyle(
  animation: Partial<GraphicsElementAnimation> | undefined,
  opts?: { paused?: boolean; exiting?: boolean }
): CSSProperties {
  if (!animation || opts?.exiting) return {};
  const contStyle = animation.continuousStyle;
  if (!contStyle || contStyle === 'none') return {};
  const keyframe = ANIMATION_KEYFRAME_MAP[contStyle] || '';
  if (!keyframe) return {};

  const intensityScale =
    animation.intensity === 'subtle' ? 1.35 : animation.intensity === 'strong' ? 0.68 : 1;
  const baseMs =
    contStyle === 'marquee'
      ? 6500
      : contStyle === 'rotate-loop'
        ? 4500
        : contStyle === 'blink'
          ? 1200
          : 2200;
  const durationMs = Math.round(baseMs * speedMultiplier(animation.speed) * intensityScale);

  const entryOffsetMs =
    animation.startTrigger === 'continuous'
      ? Math.max(0, Number(animation.startTimeMs) || 0)
      : Math.max(0, Number(animation.delayMs) || 0) +
        Math.max(0, Number(animation.startTimeMs) || 0) +
        (animation.style && animation.style !== 'none'
          ? Math.max(150, Number(animation.durationMs) || 420)
          : 0);

  return {
    animationName: keyframe,
    animationDuration: `${durationMs}ms`,
    animationDelay: `${entryOffsetMs}ms`,
    animationTimingFunction:
      contStyle === 'marquee' || contStyle === 'rotate-loop' ? 'linear' : 'ease-in-out',
    animationIterationCount:
      typeof animation.repeatCount === 'number' && animation.repeatCount > 0 && !animation.loop
        ? String(animation.repeatCount)
        : 'infinite',
    animationFillMode: 'none',
    animationPlayState: opts?.paused ? 'paused' : 'running',
  };
}

export function formatSlotRemainingLabel(
  durationSeconds: number,
  expiresAt?: string | null,
  pausedRemainingMs?: number | null,
  nowMs = Date.now()
): string {
  if (!durationSeconds || durationSeconds <= 0) return 'Permanent';
  let remainingMs =
    typeof pausedRemainingMs === 'number' && pausedRemainingMs >= 0
      ? pausedRemainingMs
      : expiresAt
        ? Math.max(0, new Date(expiresAt).getTime() - nowMs)
        : durationSeconds * 1000;

  if (!Number.isFinite(remainingMs)) remainingMs = 0;
  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec <= 0) return 'Ending...';
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
}
