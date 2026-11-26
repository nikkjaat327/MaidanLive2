import { useEffect, useMemo, useRef, useState } from 'react';
import { BroadcastOverlayConfig } from '../../types/index.ts';
import {
  BROADCAST_EVENT_META,
  BroadcastEventKey,
  EventAnimationRuleConfig,
  EventEntryTransition,
  EventExitTransition,
  EventIdleAnimation,
  EventPatternStyle,
  normalizeEventAnimationsConfig,
  resolveEventStyleOption,
} from '../../utils/eventAnimations.ts';
import type { ActiveBroadcastEventItem } from '../../hooks/useBroadcastEventQueue.ts';

interface BroadcastEventAnimationLayerProps {
  activeItem: ActiveBroadcastEventItem | null;
  isExiting: boolean;
  overlayConfig: BroadcastOverlayConfig;
  variant?: 'canvas' | 'responsive';
  isPortrait?: boolean;
  zIndex?: number;
  /** Admin-only stage guide marker when calibrating position (never shown to viewers) */
  stagePositionGuide?: {
    eventKey: BroadcastEventKey;
    rule: EventAnimationRuleConfig;
    active?: boolean;
  } | null;
}

const SPARK_VECTORS: readonly { x: string; y: string; delay: string; size: number }[] = [
  { x: '-210px', y: '-115px', delay: '20ms', size: 8 },
  { x: '-165px', y: '85px', delay: '60ms', size: 7 },
  { x: '-110px', y: '-145px', delay: '40ms', size: 9 },
  { x: '115px', y: '-140px', delay: '35ms', size: 9 },
  { x: '185px', y: '-105px', delay: '70ms', size: 8 },
  { x: '220px', y: '65px', delay: '90ms', size: 7 },
  { x: '140px', y: '115px', delay: '55ms', size: 6 },
  { x: '-140px', y: '118px', delay: '80ms', size: 6 },
  { x: '0px', y: '-165px', delay: '10ms', size: 10 },
  { x: '250px', y: '-22px', delay: '50ms', size: 7 },
  { x: '-248px', y: '-18px', delay: '45ms', size: 7 },
];

const EMBER_OFFSETS: readonly { left: string; dx: string; delay: string; size: number }[] = [
  { left: '12%', dx: '-18px', delay: '80ms', size: 5 },
  { left: '24%', dx: '14px', delay: '220ms', size: 4 },
  { left: '38%', dx: '-10px', delay: '140ms', size: 6 },
  { left: '54%', dx: '16px', delay: '310ms', size: 5 },
  { left: '68%', dx: '-14px', delay: '180ms', size: 4 },
  { left: '82%', dx: '20px', delay: '260ms', size: 6 },
  { left: '90%', dx: '-12px', delay: '110ms', size: 4 },
];

function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#0f172a').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.slice(0, 6).padEnd(6, '0');
  const num = parseInt(full, 16);
  if (!Number.isFinite(num)) return `rgba(15, 23, 42, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function getEntryTransitionCss(transition: EventEntryTransition): string {
  switch (transition) {
    case 'ribbon_wipe':
      return 'mlEventRibbonSweep 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'pop_blast':
      return 'mlEventPopBlast 540ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'slide_left':
      return 'mlGfxSlideLeft 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'slide_right':
      return 'mlGfxSlideRight 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'slide_top':
      return 'mlGfxSlideTop 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'slide_bottom':
      return 'mlGfxSlideBottom 460ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'zoom_flip':
      return 'mlGfxFlipIn 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'blur_flash':
      return 'mlGfxBlurIn 440ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'bounce_drop':
      return 'mlGfxBounceIn 560ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
    case 'slam_3d':
    default:
      return 'mlEventSlamIn 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
  }
}

function getExitTransitionCss(transition: EventExitTransition): string {
  switch (transition) {
    case 'fade_out':
      return 'mlGfxFadeOut 400ms ease-in forwards';
    case 'slide_left':
      return 'mlGfxSlideOutLeft 410ms cubic-bezier(0.4, 0, 1, 1) forwards';
    case 'slide_right':
      return 'mlGfxSlideOutRight 410ms cubic-bezier(0.4, 0, 1, 1) forwards';
    case 'slide_top':
      return 'mlGfxSlideOutTop 410ms cubic-bezier(0.4, 0, 1, 1) forwards';
    case 'slide_bottom':
      return 'mlGfxSlideOutBottom 410ms cubic-bezier(0.4, 0, 1, 1) forwards';
    case 'zoom_out':
      return 'mlGfxZoomOut 400ms ease-in forwards';
    case 'pop_out':
      return 'mlGfxPopOut 410ms ease-in forwards';
    case 'blur_out':
      return 'mlGfxBlurOut 410ms ease-in forwards';
    case 'flip_out':
      return 'mlEventFlipOut 420ms ease-in forwards';
    case 'slam_out':
    default:
      return 'mlEventSlamOut 410ms cubic-bezier(0.4, 0, 1, 1) forwards';
  }
}

function getIdleAnimationCss(idle: EventIdleAnimation): string {
  switch (idle) {
    case 'badge_float':
      return 'mlEventBadgeFloat 2.1s ease-in-out infinite';
    case 'neon_glow':
      return 'mlEventNeonGlowLoop 1.6s ease-in-out infinite';
    case 'shimmer_fast':
      return 'mlEventShimmerFast 1.2s ease-in-out infinite';
    case 'kinetic_shake':
      return 'mlGfxShake 0.85s ease-in-out infinite';
    case 'radar_spin':
      return 'mlEventEnergyPulse 2s ease-in-out infinite';
    case 'none':
      return 'none';
    case 'energy_pulse':
    default:
      return 'mlEventEnergyPulse 1.8s ease-in-out infinite';
  }
}

function renderPatternBackdrop(
  pattern: EventPatternStyle,
  primaryHex: string,
  accentHex: string
) {
  switch (pattern) {
    case 'diagonal_slats':
      return (
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(-55deg, ${primaryHex}44 0px, ${primaryHex}44 10px, transparent 10px, transparent 22px)`,
          }}
        />
      );
    case 'hex_pulse':
      return (
        <svg
          className="absolute inset-0 w-full h-full opacity-25 pointer-events-none"
          viewBox="0 0 400 120"
          preserveAspectRatio="none"
        >
          <defs>
            <pattern id="mlHexPat" width="28" height="24" patternUnits="userSpaceOnUse">
              <polygon
                points="14,1 26,7 26,17 14,23 2,17 2,7"
                fill="none"
                stroke={accentHex}
                strokeWidth="0.9"
              />
            </pattern>
          </defs>
          <rect width="400" height="120" fill="url(#mlHexPat)" />
        </svg>
      );
    case 'radial_rays':
      return (
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: `repeating-conic-gradient(from 0deg at 22% 50%, ${accentHex}28 0deg 10deg, transparent 10deg 26deg)`,
          }}
        />
      );
    case 'prism_shards':
      return (
        <svg
          className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
          viewBox="0 0 520 140"
          preserveAspectRatio="none"
        >
          <polygon points="0,0 130,0 70,140 0,140" fill={primaryHex} fillOpacity="0.35" />
          <polygon points="410,0 520,0 520,140 350,140" fill={accentHex} fillOpacity="0.25" />
          <polygon points="150,0 240,0 190,140 100,140" fill="#ffffff" fillOpacity="0.08" />
        </svg>
      );
    case 'stadium_rings':
      return (
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, transparent 18px, ${accentHex}44 19px, transparent 21px, transparent 42px, ${primaryHex}44 43px, transparent 45px, transparent 74px, ${accentHex}33 75px, transparent 77px)`,
          }}
        />
      );
    case 'flame_grid':
      return (
        <div
          className="absolute inset-0 opacity-35 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(ellipse at 18% 95%, ${accentHex}55 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, ${primaryHex}55 0%, transparent 50%)`,
          }}
        />
      );
    case 'circuit_lines':
      return (
        <svg
          className="absolute inset-0 w-full h-full opacity-30 pointer-events-none"
          viewBox="0 0 520 140"
          preserveAspectRatio="none"
        >
          <path
            d="M12 24 H135 L155 44 H290 M360 112 H450 L472 90 H510 M40 114 H160 L178 96 H260"
            fill="none"
            stroke={accentHex}
            strokeWidth="1.5"
          />
          <circle cx="290" cy="44" r="3" fill={accentHex} />
          <circle cx="360" cy="112" r="3" fill={primaryHex} />
        </svg>
      );
    case 'crown_crest':
      return (
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(135deg, ${accentHex}33 0%, transparent 45%, ${primaryHex}33 100%)`,
          }}
        />
      );
    case 'cyber_scan':
      return (
        <>
          <div
            className="absolute inset-0 opacity-25 pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(0deg, ${accentHex}24 0px, ${accentHex}24 1px, transparent 1px, transparent 5px)`,
            }}
          />
          <div
            className="absolute inset-x-0 h-6 pointer-events-none"
            style={{
              background: `linear-gradient(180deg, transparent, ${accentHex}55, transparent)`,
              animation: 'mlEventScanSweep 1.6s linear infinite',
            }}
          />
        </>
      );
    case 'gold_foil':
    default:
      return (
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(115deg, ${accentHex}44 0%, transparent 32%, #ffffff22 50%, transparent 68%, ${primaryHex}44 100%)`,
          }}
        />
      );
  }
}

function EventSportEmblemSvg({
  eventKey,
  accentHex,
  primaryHex,
  sizePx,
}: {
  eventKey: BroadcastEventKey;
  accentHex: string;
  primaryHex: string;
  sizePx: number;
}) {
  const iconStyle = {
    width: sizePx,
    height: sizePx,
    filter: `drop-shadow(0 0 12px ${accentHex}77)`,
  };
  const gradId = `mlEmblemGrad_${eventKey}`;

  switch (eventKey) {
    case 'SUPER_RAID':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={accentHex} />
              <stop offset="100%" stopColor={primaryHex} />
            </linearGradient>
          </defs>
          <polygon
            points="32,3 58,17 58,47 32,61 6,47 6,17"
            fill="rgba(8,12,24,0.85)"
            stroke={`url(#${gradId})`}
            strokeWidth="3"
          />
          <path
            d="M35 12 L20 34 H31 L27 52 L45 28 H34 Z"
            fill={accentHex}
            stroke="#ffffff"
            strokeWidth="1.2"
          />
        </svg>
      );
    case 'DO_OR_DIE_RAID':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <polygon
            points="32,6 60,54 4,54"
            fill="rgba(24,6,14,0.9)"
            stroke={accentHex}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <rect x="29" y="21" width="6" height="17" rx="3" fill={accentHex} />
          <circle cx="32" cy="45" r="3.5" fill="#ffffff" />
        </svg>
      );
    case 'SUPER_TACKLE':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <path
            d="M32 5 L55 14 V31 C55 45 45 55 32 60 C19 55 9 45 9 31 V14 Z"
            fill="rgba(8,16,32,0.9)"
            stroke={accentHex}
            strokeWidth="3"
          />
          <path
            d="M21 31 L29 39 L44 23"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'ALL_OUT':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <circle cx="32" cy="32" r="27" fill="rgba(20,8,8,0.9)" stroke={accentHex} strokeWidth="3" />
          <path
            d="M32 13 C38 22 44 26 44 35 C44 43 38 49 32 49 C26 49 20 43 20 35 C20 29 24 24 27 21 C27 26 30 28 31 28 C30 22 31 17 32 13 Z"
            fill={accentHex}
          />
          <path d="M18 48 L46 20" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      );
    case 'SIX':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <circle cx="32" cy="32" r="27" fill="rgba(10,16,38,0.9)" stroke={accentHex} strokeWidth="3" />
          <text
            x="32"
            y="43"
            textAnchor="middle"
            fill={accentHex}
            fontSize="32"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
          >
            6
          </text>
        </svg>
      );
    case 'FOUR':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <rect
            x="7"
            y="7"
            width="50"
            height="50"
            rx="12"
            fill="rgba(8,20,36,0.9)"
            stroke={accentHex}
            strokeWidth="3"
          />
          <text
            x="32"
            y="43"
            textAnchor="middle"
            fill="#ffffff"
            fontSize="31"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
          >
            4
          </text>
        </svg>
      );
    case 'WICKET':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <circle cx="32" cy="32" r="27" fill="rgba(26,6,10,0.9)" stroke={accentHex} strokeWidth="3" />
          <rect x="20" y="20" width="4" height="28" rx="1.5" fill="#ffffff" transform="rotate(-8 22 34)" />
          <rect x="30" y="18" width="4" height="30" rx="1.5" fill="#ffffff" />
          <rect x="40" y="20" width="4" height="28" rx="1.5" fill="#ffffff" transform="rotate(14 42 34)" />
          <line x1="17" y1="15" x2="29" y2="12" stroke={accentHex} strokeWidth="3.5" strokeLinecap="round" />
          <line x1="36" y1="11" x2="48" y2="16" stroke={accentHex} strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case 'NO_BALL':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <circle cx="32" cy="32" r="27" fill="rgba(28,12,6,0.92)" stroke={accentHex} strokeWidth="3" />
          <circle cx="32" cy="32" r="15" fill="none" stroke="#ffffff" strokeWidth="3" />
          <line x1="21" y1="43" x2="43" y2="21" stroke={accentHex} strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'GOAL':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <circle cx="32" cy="32" r="27" fill="rgba(6,24,18,0.9)" stroke={accentHex} strokeWidth="3" />
          <circle cx="32" cy="32" r="17" fill="#f8fafc" stroke="#0f172a" strokeWidth="2" />
          <polygon points="32,21 40,27 37,37 27,37 24,27" fill="#0f172a" />
          <path
            d="M32 15 V21 M47 25 L40 27 M42 44 L37 37 M22 44 L27 37 M17 25 L24 27"
            stroke="#0f172a"
            strokeWidth="2"
          />
        </svg>
      );
    case 'FOUL':
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <rect
            x="16"
            y="12"
            width="22"
            height="34"
            rx="4"
            fill={accentHex}
            stroke="#ffffff"
            strokeWidth="2"
            transform="rotate(-10 27 29)"
          />
          <rect
            x="28"
            y="18"
            width="22"
            height="34"
            rx="4"
            fill={primaryHex}
            stroke="#ffffff"
            strokeWidth="2"
            transform="rotate(8 39 35)"
          />
        </svg>
      );
    case 'SET_WIN':
    default:
      return (
        <svg viewBox="0 0 64 64" style={iconStyle}>
          <circle cx="32" cy="32" r="27" fill="rgba(10,16,36,0.9)" stroke={accentHex} strokeWidth="3" />
          <path
            d="M21 18 H43 V27 C43 34 38 39 32 40 C26 39 21 34 21 27 Z"
            fill={accentHex}
          />
          <path d="M21 21 H14 C14 28 18 31 21 31 M43 21 H50 C50 28 46 31 43 31" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <rect x="29" y="40" width="6" height="8" fill="#ffffff" />
          <rect x="22" y="47" width="20" height="4" rx="2" fill={accentHex} />
        </svg>
      );
  }
}

export function BroadcastEventAnimationLayer({
  activeItem,
  isExiting,
  overlayConfig,
  variant = 'canvas',
  isPortrait = false,
  zIndex = 42,
  stagePositionGuide = null,
}: BroadcastEventAnimationLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(isPortrait ? 1080 : 1920);

  useEffect(() => {
    if (variant !== 'responsive') return;
    const node = containerRef.current;
    if (!node) return;
    const updateWidth = () => {
      setContainerWidth(node.clientWidth || 1280);
    };
    updateWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateWidth);
    ro.observe(node);
    return () => ro.disconnect();
  }, [variant]);

  const normalizedRules = useMemo(
    () => normalizeEventAnimationsConfig(overlayConfig?.eventAnimations),
    [overlayConfig?.eventAnimations]
  );

  const responsiveFactor = useMemo(() => {
    if (variant === 'canvas') return isPortrait ? 0.88 : 1;
    return Math.max(0.32, Math.min(1.05, containerWidth / 1280));
  }, [variant, isPortrait, containerWidth]);

  if (!activeItem && !stagePositionGuide?.active) {
    return (
      <div
        ref={containerRef}
        style={{ zIndex }}
        className="absolute inset-0 pointer-events-none overflow-hidden"
      />
    );
  }

  const payload = activeItem?.payload || null;
  const eventKey = payload?.eventKey;
  const rule = eventKey ? normalizedRules[eventKey] : undefined;
  const meta = eventKey ? BROADCAST_EVENT_META[eventKey] : undefined;
  const styleOpt = eventKey
    ? resolveEventStyleOption(eventKey, payload?.previewStyleId || rule?.styleId)
    : undefined;

  const finalScale = Math.max(0.25, (rule?.scale ?? 1) * responsiveFactor);
  const xPct = rule?.xPct ?? 50;
  const yPct = rule?.yPct ?? 48;

  const primaryHex = rule?.primaryHex || styleOpt?.primaryHex || '#EA580C';
  const secondaryHex = rule?.secondaryHex || styleOpt?.secondaryHex || '#1E293B';
  const accentHex = rule?.accentHex || styleOpt?.accentHex || '#FACC15';
  const borderColorHex = rule?.borderColorHex || accentHex;
  const textColorHex = rule?.textColorHex || '#FFFFFF';
  const badgeTextColorHex = rule?.badgeTextColorHex || '#070B18';
  const subtitleColorHex = rule?.subtitleColorHex || '#F1F5F9';
  const bgOpacity = rule?.bgOpacity ?? 0.96;
  const pattern = rule?.pattern || styleOpt?.pattern || 'diagonal_slats';

  const logoBoxSize = rule?.logoSizePx ?? 80;
  const logoSvgSize = Math.max(20, Math.round(logoBoxSize * 0.62));
  const logoRadius = Math.min(28, Math.max(8, Math.round(logoBoxSize * 0.22)));

  const badgeSizePx = rule?.badgeTextSizePx ?? 11;
  const teamSizePx = rule?.teamTextSizePx ?? 11;
  const headlineSizePx = rule?.headlineTextSizePx ?? 42;
  const subtitleSizePx = rule?.subtitleTextSizePx ?? 12;

  const plateWidthPx = rule?.containerWidthPx ?? 620;
  const platePadX = rule?.containerPaddingX ?? 24;
  const platePadY = rule?.containerPaddingY ?? 16;
  const plateRadiusPx = rule?.containerRadiusPx ?? 16;
  const borderWidthPx = rule?.borderWidthPx ?? 2;

  const entryTransition = rule?.entryTransition || 'slam_3d';
  const exitTransition = rule?.exitTransition || 'slam_out';
  const idleAnimation = rule?.idleAnimation || 'energy_pulse';
  const showShockwaves = rule?.showShockwaves ?? true;
  const showSparks = rule?.showSparks ?? true;
  const showSheen = rule?.showSheen ?? true;

  const headline =
    (rule?.customHeadline || '').trim() ||
    styleOpt?.headlineOverride ||
    meta?.defaultHeadline ||
    '';
  const badgeLabel =
    (rule?.customBadgeText || '').trim() ||
    payload?.pointsLabel ||
    styleOpt?.badgeText ||
    meta?.badge ||
    '';
  const subtitle =
    (rule?.customSubtitle || '').trim() ||
    payload?.subtitle ||
    meta?.defaultSubtitle ||
    '';

  return (
    <div
      ref={containerRef}
      style={{ zIndex }}
      className="absolute inset-0 pointer-events-none overflow-hidden select-none"
      aria-live="off"
    >
      {/* Admin-only Stage Crosshair Calibration Target */}
      {stagePositionGuide?.active && (
        <div
          style={{
            left: `${stagePositionGuide.rule.xPct}%`,
            top: `${stagePositionGuide.rule.yPct}%`,
            transform: 'translate(-50%, -50%)',
          }}
          className="absolute z-10 pointer-events-none"
        >
          <div className="relative flex items-center justify-center">
            <span className="w-12 h-12 rounded-full border-2 border-dashed border-cyan-400/90 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.45)] animate-pulse" />
            <span className="absolute w-7 h-[1.5px] bg-cyan-300/90" />
            <span className="absolute h-7 w-[1.5px] bg-cyan-300/90" />
            <span className="absolute top-14 whitespace-nowrap px-2 py-0.5 rounded bg-slate-950/90 border border-cyan-400/50 text-[11px] font-mono font-bold text-cyan-200">
              {BROADCAST_EVENT_META[stagePositionGuide.eventKey].shortLabel} ({stagePositionGuide.rule.xPct}%, {stagePositionGuide.rule.yPct}%)
            </span>
          </div>
        </div>
      )}

      {activeItem && payload && eventKey && rule && meta && styleOpt && (
        <div
          key={activeItem.instanceKey}
          style={{
            left: `${xPct}%`,
            top: `${yPct}%`,
            transform: `translate(-50%, -50%) scale(${finalScale})`,
            transformOrigin: 'center center',
          }}
          className="absolute"
        >
          {/* Outer Entry / Exit Wrapper */}
          <div
            style={{
              animation: isExiting
                ? getExitTransitionCss(exitTransition)
                : getEntryTransitionCss(entryTransition),
              willChange: 'transform, opacity, filter',
            }}
            className="relative flex items-center justify-center"
          >
            {/* Expanding Dual Shockwave Rings behind plate */}
            {showShockwaves && (
              <>
                <div
                  style={{
                    borderColor: accentHex,
                    boxShadow: `0 0 36px ${primaryHex}`,
                    animation: 'mlEventShockwave 950ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  }}
                  className="absolute left-1/2 top-1/2 w-[360px] h-[360px] rounded-full border-[4px] pointer-events-none"
                />
                <div
                  style={{
                    borderColor: primaryHex,
                    animation: 'mlEventShockwaveOuter 1150ms cubic-bezier(0.16, 1, 0.3, 1) 70ms forwards',
                  }}
                  className="absolute left-1/2 top-1/2 w-[420px] h-[420px] rounded-full border-[2px] border-dashed pointer-events-none"
                />
              </>
            )}

            {/* Radial Pyro Spark Burst */}
            {showSparks && (
              <div className="absolute left-1/2 top-1/2 pointer-events-none">
                {SPARK_VECTORS.map((sp, idx) => (
                  <span
                    key={idx}
                    style={
                      {
                        width: sp.size,
                        height: sp.size,
                        background: idx % 2 === 0 ? accentHex : '#ffffff',
                        boxShadow: `0 0 12px ${accentHex}`,
                        '--spark-x': sp.x,
                        '--spark-y': sp.y,
                        animation: `mlEventSparkBurst 860ms cubic-bezier(0.16, 1, 0.3, 1) ${sp.delay} forwards`,
                      } as React.CSSProperties
                    }
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  />
                ))}
              </div>
            )}

            {/* Ambient Stadium Backlight Aura */}
            <div
              style={{
                background: `radial-gradient(ellipse at center, ${hexToRgba(primaryHex, 0.55 * bgOpacity)} 0%, ${hexToRgba(secondaryHex, 0.36 * bgOpacity)} 45%, transparent 72%)`,
                animation: 'mlEventEnergyPulse 1.8s ease-in-out infinite',
              }}
              className="absolute -inset-x-16 -inset-y-12 blur-2xl pointer-events-none"
            />

            {/* Inner Idle Hold Animation Wrapper */}
            <div
              style={{
                animation: getIdleAnimationCss(idleAnimation),
                willChange: 'transform, filter',
              }}
            >
              {/* Main JioHotstar / Pro Kabaddi League Stinger Plate */}
              <div
                style={{
                  width: plateWidthPx,
                  maxWidth: '94vw',
                  borderRadius: plateRadiusPx,
                  borderWidth: borderWidthPx,
                  borderStyle: borderWidthPx > 0 ? 'solid' : 'none',
                  borderColor: hexToRgba(borderColorHex, 0.85),
                  background: `linear-gradient(125deg, ${hexToRgba(secondaryHex, bgOpacity)} 0%, ${hexToRgba('#070B18', Math.min(1, bgOpacity + 0.04))} 48%, ${hexToRgba(primaryHex, bgOpacity * 0.92)} 125%)`,
                  boxShadow: `0 22px 60px rgba(0, 0, 0, 0.72), 0 0 38px ${hexToRgba(primaryHex, 0.45)}, inset 0 1px 0 rgba(255,255,255,0.28)`,
                }}
                className="relative overflow-hidden"
              >
                {/* Pattern Backdrop */}
                {renderPatternBackdrop(pattern, primaryHex, accentHex)}

                {/* Rising Embers */}
                {showSparks && (
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {EMBER_OFFSETS.map((em, idx) => (
                      <span
                        key={idx}
                        style={
                          {
                            left: em.left,
                            bottom: -4,
                            width: em.size,
                            height: em.size,
                            background: accentHex,
                            boxShadow: `0 0 10px ${accentHex}`,
                            '--ember-dx': em.dx,
                            animation: `mlEventEmberRise 1400ms ease-out ${em.delay} infinite`,
                          } as React.CSSProperties
                        }
                        className="absolute rounded-full"
                      />
                    ))}
                  </div>
                )}

                {/* Diagonal Light Sheen Sweep */}
                {showSheen && (
                  <div
                    style={{
                      background:
                        'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.45) 50%, transparent 80%)',
                      animation: 'mlEventSheenSweep 1500ms cubic-bezier(0.22, 1, 0.36, 1) 120ms infinite',
                    }}
                    className="absolute inset-y-0 w-44 pointer-events-none"
                  />
                )}

                {/* Top Metallic Highlight Rail */}
                <div
                  style={{
                    background: `linear-gradient(90deg, transparent, ${accentHex}, #ffffff, ${accentHex}, transparent)`,
                  }}
                  className="h-[3px] w-full"
                />

                {/* Inner Content Row */}
                <div
                  style={{
                    paddingLeft: platePadX,
                    paddingRight: platePadX,
                    paddingTop: platePadY,
                    paddingBottom: platePadY,
                    gap: Math.max(12, Math.round(logoBoxSize * 0.25)),
                  }}
                  className="relative flex items-center"
                >
                  {/* Left Glowing Sport Crest Medallion */}
                  <div
                    style={{
                      width: logoBoxSize,
                      height: logoBoxSize,
                      borderRadius: logoRadius,
                      background: `radial-gradient(circle at 30% 30%, ${primaryHex}, ${secondaryHex})`,
                      borderColor: borderColorHex,
                      boxShadow: `0 0 26px ${hexToRgba(primaryHex, 0.75)}, inset 0 0 14px rgba(255,255,255,0.22)`,
                      animation:
                        idleAnimation === 'radar_spin'
                          ? 'mlGfxRotateLoop 6s linear infinite'
                          : 'mlEventBadgeFloat 2.1s ease-in-out infinite',
                    }}
                    className="shrink-0 border-2 flex items-center justify-center relative"
                  >
                    <EventSportEmblemSvg
                      eventKey={eventKey}
                      accentHex={accentHex}
                      primaryHex={primaryHex}
                      sizePx={logoSvgSize}
                    />
                  </div>

                  {/* Center Typography Stack */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        style={{
                          background: accentHex,
                          color: badgeTextColorHex,
                          fontSize: `${badgeSizePx}px`,
                          lineHeight: 1.25,
                          boxShadow: `0 0 14px ${hexToRgba(accentHex, 0.55)}`,
                        }}
                        className="px-2.5 py-0.5 rounded font-black uppercase tracking-[0.16em]"
                      >
                        {badgeLabel}
                      </span>
                      <span
                        style={{
                          fontSize: `${Math.max(8, badgeSizePx - 1)}px`,
                          lineHeight: 1.25,
                        }}
                        className="px-2 py-0.5 rounded bg-black/50 border border-white/15 font-bold uppercase tracking-[0.18em] text-slate-200"
                      >
                        {meta.sport}
                      </span>
                      {payload.teamName && (
                        <span
                          style={{
                            borderColor: payload.teamColor || primaryHex,
                            fontSize: `${teamSizePx}px`,
                            lineHeight: 1.25,
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-950/80 border font-extrabold uppercase tracking-wider text-white truncate max-w-[260px]"
                        >
                          <span
                            style={{ background: payload.teamColor || accentHex }}
                            className="w-2 h-2 rounded-full shrink-0"
                          />
                          <span className="truncate">{payload.teamName}</span>
                        </span>
                      )}
                    </div>

                    {/* Hero Kinetic Headline */}
                    <div
                      style={{
                        color: textColorHex,
                        fontSize: `${headlineSizePx}px`,
                        lineHeight: 1.04,
                        textShadow: `0 4px 14px rgba(0,0,0,0.85), 0 0 22px ${hexToRgba(accentHex, 0.45)}`,
                      }}
                      className="font-display font-black italic uppercase tracking-tight"
                    >
                      {headline}
                    </div>

                    {/* Player & Context Ticker */}
                    <div
                      style={{
                        color: subtitleColorHex,
                        fontSize: `${subtitleSizePx}px`,
                        lineHeight: 1.35,
                      }}
                      className="mt-1.5 flex items-center gap-2 font-bold uppercase tracking-[0.12em] truncate"
                    >
                      {payload.playerName && (
                        <span
                          style={{ color: accentHex }}
                          className="font-extrabold shrink-0"
                        >
                          {payload.playerName} ·
                        </span>
                      )}
                      <span className="truncate">{subtitle}</span>
                    </div>
                  </div>

                  {/* Right Angled Neon Wing Accent */}
                  <div
                    style={{
                      background: `linear-gradient(180deg, ${accentHex}, ${primaryHex})`,
                      boxShadow: `0 0 18px ${primaryHex}`,
                      height: Math.max(48, Math.round(logoBoxSize * 0.92)),
                    }}
                    className="hidden sm:block shrink-0 w-2.5 rounded-full opacity-90"
                  />
                </div>

                {/* Bottom Neon Edge */}
                <div
                  style={{
                    background: `linear-gradient(90deg, ${primaryHex}, ${accentHex}, ${primaryHex})`,
                  }}
                  className="h-1 w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
