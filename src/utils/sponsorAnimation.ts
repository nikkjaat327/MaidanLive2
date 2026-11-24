import { useEffect, useState } from 'react';
import type { SponsorAdAnimation, SponsorAdTransition } from './overlayConfig.ts';

export const SPONSOR_ANIMATION_OPTIONS: Array<{ id: SponsorAdAnimation; label: string }> = [
  { id: 'none', label: 'None (Static)' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'float', label: 'Float' },
  { id: 'glow', label: 'Glow Aura' },
  { id: 'shimmer', label: 'Glossy Shimmer' },
  { id: 'bounce', label: 'Bounce' },
];

export const SPONSOR_TRANSITION_OPTIONS: Array<{ id: SponsorAdTransition; label: string }> = [
  { id: 'fade', label: 'Fade' },
  { id: 'slide-right', label: 'Slide Right' },
  { id: 'slide-left', label: 'Slide Left' },
  { id: 'slide-top', label: 'Slide Down' },
  { id: 'slide-bottom', label: 'Slide Up' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pop', label: 'Pop' },
  { id: 'none', label: 'Instant (None)' },
];

export function getSponsorTransitionAnimation(
  transition: SponsorAdTransition | undefined,
  phase: 'visible' | 'exiting' | 'hidden',
  durationMs: number
): string | undefined {
  if (phase === 'hidden') return undefined;
  const tr = transition || 'fade';
  if (tr === 'none') return undefined;

  const ms = Math.max(100, Math.min(3000, Math.round(durationMs || 450)));

  if (phase === 'exiting') {
    const exitMap: Record<Exclude<SponsorAdTransition, 'none'>, string> = {
      fade: 'mlGfxFadeOut',
      'slide-left': 'mlGfxSlideOutLeft',
      'slide-right': 'mlGfxSlideOutRight',
      'slide-top': 'mlGfxSlideOutTop',
      'slide-bottom': 'mlGfxSlideOutBottom',
      zoom: 'mlGfxZoomOut',
      pop: 'mlGfxPopOut',
    };
    return `${exitMap[tr]} ${ms}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`;
  }

  const enterMap: Record<Exclude<SponsorAdTransition, 'none'>, string> = {
    fade: 'mlGfxFadeIn',
    'slide-left': 'mlGfxSlideLeft',
    'slide-right': 'mlGfxSlideRight',
    'slide-top': 'mlGfxSlideTop',
    'slide-bottom': 'mlGfxSlideBottom',
    zoom: 'mlGfxZoomIn',
    pop: 'mlGfxPopIn',
  };
  return `${enterMap[tr]} ${ms}ms cubic-bezier(0.22, 1, 0.36, 1) both`;
}

export function getSponsorLoopAnimation(animation: SponsorAdAnimation | undefined): string | undefined {
  switch (animation) {
    case 'pulse':
      return 'mlGfxPulse 2.2s ease-in-out infinite';
    case 'float':
      return 'mlGfxFloat 3.0s ease-in-out infinite';
    case 'glow':
      return 'mlGfxGlow 2.4s ease-in-out infinite';
    case 'bounce':
      return 'mlGfxBounce 1.8s ease-in-out infinite';
    case 'shimmer':
    case 'none':
    default:
      return undefined;
  }
}

interface UseSponsorAdCycleParams {
  enabled: boolean;
  durationSeconds: number;
  transitionMs: number;
  transition: SponsorAdTransition;
  repeatIntervalSeconds: number;
  repeatContinuously: boolean;
  cycleKey?: string;
}

export function useSponsorAdCycle({
  enabled,
  durationSeconds,
  transitionMs,
  transition,
  repeatIntervalSeconds,
  repeatContinuously,
  cycleKey = '',
}: UseSponsorAdCycleParams): {
  phase: 'visible' | 'exiting' | 'hidden';
  cycleCount: number;
} {
  const [phase, setPhase] = useState<'visible' | 'exiting' | 'hidden'>(enabled ? 'visible' : 'hidden');
  const [cycleCount, setCycleCount] = useState(0);

  const safeShowMs = Math.max(2000, Math.min(300_000, Math.round((durationSeconds || 12) * 1000)));
  const safeTransitionMs =
    transition === 'none' ? 0 : Math.max(100, Math.min(3000, Math.round(transitionMs || 450)));
  const safeRepeatMs = Math.max(0, Math.min(3_600_000, Math.round((repeatIntervalSeconds ?? 20) * 1000)));

  useEffect(() => {
    if (!enabled) {
      setPhase('hidden');
      return;
    }

    setPhase('visible');
    setCycleCount((c) => c + 1);
  }, [enabled, durationSeconds, transitionMs, transition, repeatIntervalSeconds, repeatContinuously, cycleKey]);

  useEffect(() => {
    if (!enabled) return;

    // Continuous with 0s pause stays continuously visible after its entrance
    if (phase === 'visible' && repeatContinuously && safeRepeatMs === 0) {
      return;
    }

    if (phase === 'visible') {
      const t = window.setTimeout(() => {
        if (safeTransitionMs > 0) {
          setPhase('exiting');
        } else {
          setPhase('hidden');
        }
      }, safeShowMs);
      return () => window.clearTimeout(t);
    }

    if (phase === 'exiting') {
      const t = window.setTimeout(() => {
        setPhase('hidden');
      }, safeTransitionMs);
      return () => window.clearTimeout(t);
    }

    if (phase === 'hidden' && repeatContinuously) {
      const t = window.setTimeout(() => {
        setCycleCount((c) => c + 1);
        setPhase('visible');
      }, safeRepeatMs);
      return () => window.clearTimeout(t);
    }
  }, [enabled, phase, repeatContinuously, safeShowMs, safeTransitionMs, safeRepeatMs]);

  return { phase, cycleCount };
}
