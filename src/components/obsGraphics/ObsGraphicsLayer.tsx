import React, { useEffect, useMemo, useState } from 'react';
import type {
  ActiveBroadcastGraphicSlot,
  BroadcastGraphicsStateData,
  GraphicsElement,
} from '../../types/broadcastGraphics.ts';
import {
  buildElementAnimationStyle,
  buildSlotContainerAnimationStyle,
  isSafeGraphicsUrl,
} from './graphicsStyleUtils.ts';
import { GraphicsQrCode } from './GraphicsQrCode.tsx';

interface ObsGraphicsLayerProps {
  graphicsState?: BroadcastGraphicsStateData | null;
  activeSlotsOverride?: ActiveBroadcastGraphicSlot[];
  animationsPausedOverride?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  matchId?: string;
  tournamentId?: string | null;
  className?: string;
}

export const GraphicElementContent: React.FC<{
  element: GraphicsElement;
  matchId?: string;
  tournamentId?: string | null;
  isEditorPlaceholder?: boolean;
}> = React.memo(({ element, matchId, tournamentId, isEditorPlaceholder }) => {
  const hasGradient = Boolean(element.gradient?.enabled);
  const background = hasGradient
    ? `linear-gradient(${element.gradient?.angle ?? 135}deg, ${element.gradient?.from || '#0f172a'}, ${element.gradient?.to || '#1e293b'})`
    : element.backgroundColor || 'transparent';

  const borderRadius =
    element.type === 'shape' && element.shapeKind === 'circle'
      ? 9999
      : element.borderRadius ?? 0;

  const boxShadow = element.shadowEnabled
    ? `0px ${element.shadowOffsetY ?? 6}px ${element.shadowBlur ?? 16}px ${element.shadowColor || 'rgba(0,0,0,0.45)'}`
    : undefined;

  const borderStyle =
    element.borderWidth && element.borderWidth > 0
      ? `${element.borderWidth}px solid ${element.borderColor || '#ffffff'}`
      : element.type === 'shape' &&
          (element.shapeKind === 'line' || element.shapeKind === 'divider') &&
          element.strokeWidth &&
          element.strokeWidth > 0
        ? `${element.strokeWidth}px solid ${element.borderColor || element.backgroundColor || '#ea580c'}`
        : undefined;

  const commonContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background,
    borderRadius,
    border: borderStyle,
    boxShadow,
    paddingLeft: element.paddingX || 0,
    paddingRight: element.paddingX || 0,
    paddingTop: element.paddingY || 0,
    paddingBottom: element.paddingY || 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  if (element.type === 'shape') {
    if (element.shapeKind === 'line' || element.shapeKind === 'divider') {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: hasGradient
              ? `linear-gradient(${element.gradient?.angle ?? 90}deg, ${element.gradient?.from || '#ea580c'}, ${element.gradient?.to || '#f97316'})`
              : element.backgroundColor || '#ea580c',
            borderRadius: 9999,
            boxShadow,
          }}
        />
      );
    }
    return <div style={commonContainerStyle} />;
  }

  if (element.type === 'text') {
    const textGrad = element.gradientText?.enabled
      ? `linear-gradient(${element.gradientText.angle ?? 90}deg, ${element.gradientText.from || '#ffffff'}, ${element.gradientText.to || '#fb923c'})`
      : null;

    const textStyle: React.CSSProperties = {
      fontFamily: element.fontFamily || '"Outfit", sans-serif',
      fontSize: element.fontSize || 28,
      fontWeight: element.fontWeight || '700',
      fontStyle: element.italic ? 'italic' : 'normal',
      textDecoration: element.underline ? 'underline' : 'none',
      textAlign: element.textAlign || 'center',
      letterSpacing:
        typeof element.letterSpacing === 'number' ? `${element.letterSpacing}px` : undefined,
      lineHeight: element.lineHeight || 1.2,
      whiteSpace: element.wordWrap === false ? 'nowrap' : 'pre-wrap',
      wordBreak: element.wordWrap === false ? 'normal' : 'break-word',
      WebkitTextStroke:
        element.textOutlineWidth && element.textOutlineWidth > 0
          ? `${element.textOutlineWidth}px ${element.textOutlineColor || '#000000'}`
          : undefined,
      textShadow: element.textShadow || undefined,
      ...(textGrad
        ? {
            backgroundImage: textGrad,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }
        : {
            color: element.fontColor || '#ffffff',
          }),
    };

    const justifyContent =
      element.textAlign === 'left'
        ? 'flex-start'
        : element.textAlign === 'right'
          ? 'flex-end'
          : 'center';

    return (
      <div
        style={{
          ...commonContainerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent,
        }}
      >
        <div className="w-full" style={textStyle}>
          {element.text || ''}
        </div>
      </div>
    );
  }

  if (element.type === 'qr') {
    return (
      <div style={commonContainerStyle}>
        <GraphicsQrCode element={element} matchId={matchId} tournamentId={tournamentId} />
      </div>
    );
  }

  // Image or Sponsor Logo
  const safeSrc = isSafeGraphicsUrl(element.src) ? element.src : '';
  const crop = element.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const hasCrop = crop.top > 0 || crop.right > 0 || crop.bottom > 0 || crop.left > 0;

  return (
    <div
      style={{
        ...commonContainerStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {safeSrc ? (
        <img
          src={safeSrc}
          alt={element.layerName || 'Broadcast graphic'}
          draggable={false}
          className="w-full h-full select-none"
          style={{
            objectFit: element.objectFit || 'contain',
            clipPath: hasCrop
              ? `inset(${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%)`
              : undefined,
          }}
        />
      ) : isEditorPlaceholder ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-center border border-dashed border-slate-500/70 rounded-lg bg-slate-900/60 px-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
            {element.type === 'logo' ? 'Sponsor Logo' : 'Image Asset'}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">
            Upload or pick from Asset Library
          </span>
        </div>
      ) : null}
    </div>
  );
});

GraphicElementContent.displayName = 'GraphicElementContent';

export const ObsGraphicsLayer: React.FC<ObsGraphicsLayerProps> = React.memo(
  ({
    graphicsState,
    activeSlotsOverride,
    animationsPausedOverride,
    canvasWidth = 1920,
    canvasHeight = 1080,
    matchId,
    tournamentId,
    className = '',
  }) => {
    const rawSlots = activeSlotsOverride ?? graphicsState?.activeSlots ?? [];
    const paused =
      animationsPausedOverride !== undefined
        ? animationsPausedOverride
        : Boolean(graphicsState?.animationsPaused);

    const hasTimedSlot = useMemo(
      () => rawSlots.some((s) => s.visible && s.durationSeconds > 0 && Boolean(s.expiresAt)),
      [rawSlots]
    );

    const [nowMs, setNowMs] = useState<number>(() => Date.now());

    useEffect(() => {
      if (!hasTimedSlot || paused) return;
      setNowMs(Date.now());
      const id = window.setInterval(() => {
        setNowMs(Date.now());
      }, 250);
      return () => window.clearInterval(id);
    }, [hasTimedSlot, paused]);

    const visibleSlots = useMemo(() => {
      return rawSlots.filter((slot) => {
        if (!slot.visible) return false;
        if (paused) return true;
        if (slot.durationSeconds > 0 && slot.expiresAt) {
          const exp = new Date(slot.expiresAt).getTime();
          if (Number.isFinite(exp) && nowMs > exp + 360) {
            return false;
          }
        }
        return true;
      });
    }, [rawSlots, paused, nowMs]);

    if (visibleSlots.length === 0) {
      return null;
    }

    const effectiveMatchId = matchId || graphicsState?.matchId;
    const effectiveTournamentId = tournamentId ?? graphicsState?.tournamentId;

    return (
      <div
        className={`absolute inset-0 pointer-events-none overflow-hidden z-30 ${className}`}
        aria-hidden="true"
      >
        {visibleSlots.map((slot) => {
          const slotW = slot.canvasWidth || 1920;
          const slotH = slot.canvasHeight || 1080;
          const scaleX = canvasWidth / slotW;
          const scaleY = canvasHeight / slotH;

          const expMs =
            slot.durationSeconds > 0 && slot.expiresAt
              ? new Date(slot.expiresAt).getTime()
              : null;
          const exiting =
            !paused &&
            expMs !== null &&
            Number.isFinite(expMs) &&
            nowMs >= expMs - 320;

          const slotAnimStyle = buildSlotContainerAnimationStyle({
            entryAnimation: slot.entryAnimation,
            exitAnimation: slot.exitAnimation,
            exiting,
            paused,
          });

          const sortedElements = [...(slot.elements || [])]
            .filter((el) => el.visible !== false)
            .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

          return (
            <div
              key={slot.instanceId}
              className="absolute top-0 left-0"
              style={{
                width: slotW,
                height: slotH,
                transform: `scale(${scaleX}, ${scaleY})`,
                transformOrigin: 'top left',
                ...slotAnimStyle,
              }}
            >
              {sortedElements.map((el) => {
                const elAnim = buildElementAnimationStyle(el.animation, {
                  paused,
                  exiting,
                });

                return (
                  <div
                    key={el.id}
                    style={{
                      position: 'absolute',
                      left: el.x,
                      top: el.y,
                      width: el.width,
                      height: el.height,
                      zIndex: el.zIndex || 1,
                      opacity: typeof el.opacity === 'number' ? el.opacity : 1,
                      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                      transformOrigin: 'center center',
                      ...elAnim,
                    }}
                  >
                    <GraphicElementContent
                      element={el}
                      matchId={effectiveMatchId}
                      tournamentId={effectiveTournamentId}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }
);

ObsGraphicsLayer.displayName = 'ObsGraphicsLayer';

export const ScaledGraphicsPreviewFrame: React.FC<{
  children: React.ReactNode;
  canvasWidth?: number;
  canvasHeight?: number;
  className?: string;
}> = ({ children, canvasWidth = 1920, canvasHeight = 1080, className = '' }) => {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setScale(Math.min(rect.width / canvasWidth, rect.height / canvasHeight));
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [canvasWidth, canvasHeight]);

  return (
    <div
      ref={hostRef}
      className={`relative overflow-hidden flex items-center justify-center ${className}`}
    >
      <div
        className="relative shrink-0 overflow-hidden"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
};

