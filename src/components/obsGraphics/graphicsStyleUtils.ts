import type { CSSProperties } from 'react';
import type {
  GraphicsAnimationDirection,
  GraphicsAnimationSpeed,
  GraphicsAnimationStyle,
  GraphicsElement,
  GraphicsElementAnimation,
} from '../../types/broadcastGraphics.ts';

const ANIMATION_KEYFRAME_MAP: Record<GraphicsAnimationStyle, string> = {
  none: '',
  'fade-in': 'mlGfxFadeIn',
  'fade-out': 'mlGfxFadeOut',
  'slide-left': 'mlGfxSlideLeft',
  'slide-right': 'mlGfxSlideRight',
  'slide-top': 'mlGfxSlideTop',
  'slide-bottom': 'mlGfxSlideBottom',
  'zoom-in': 'mlGfxZoomIn',
  'zoom-out': 'mlGfxZoomOut',
  'pop-in': 'mlGfxPopIn',
  bounce: 'mlGfxBounce',
  pulse: 'mlGfxPulse',
  marquee: 'mlGfxMarquee',
};

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

  const isLoop =
    !opts.exiting && (styleKey === 'pulse' || styleKey === 'bounce' || styleKey === 'marquee');
  const durationMs = opts.exiting ? 320 : isLoop ? 1800 : 420;
  const easing =
    styleKey === 'pop-in'
      ? 'cubic-bezier(0.22, 1, 0.36, 1)'
      : styleKey === 'marquee'
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
  opts?: { paused?: boolean; exiting?: boolean }
): CSSProperties {
  if (!animation) return {};
  const activeStyle: GraphicsAnimationStyle = opts?.exiting
    ? animation.exitStyle || 'fade-out'
    : animation.style || 'none';
  const keyframe = ANIMATION_KEYFRAME_MAP[activeStyle] || '';
  if (!keyframe) return {};

  const baseDuration = Math.max(100, Math.min(15000, Number(animation.durationMs) || 420));
  const scaledDuration = opts?.exiting
    ? Math.min(400, Math.round(baseDuration * 0.75))
    : Math.round(baseDuration * speedMultiplier(animation.speed));
  const delayMs = opts?.exiting ? 0 : Math.max(0, Number(animation.delayMs) || 0);
  const isContinuous =
    !opts?.exiting &&
    (Boolean(animation.loop) ||
      animation.endBehavior === 'loop' ||
      activeStyle === 'marquee');
  const direction: GraphicsAnimationDirection =
    animation.direction === 'reverse' || animation.direction === 'alternate'
      ? animation.direction
      : 'normal';

  const effectiveDuration =
    activeStyle === 'marquee' && scaledDuration < 2500 ? 6000 : scaledDuration;

  return {
    animationName: keyframe,
    animationDuration: `${effectiveDuration}ms`,
    animationDelay: `${delayMs}ms`,
    animationTimingFunction:
      activeStyle === 'marquee' ? 'linear' : 'cubic-bezier(0.16, 1, 0.3, 1)',
    animationDirection: direction,
    animationIterationCount: isContinuous ? 'infinite' : '1',
    animationFillMode: 'both',
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
