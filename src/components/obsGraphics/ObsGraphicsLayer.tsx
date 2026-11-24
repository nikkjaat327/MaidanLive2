import React, { useEffect, useMemo, useState } from 'react';
import type {
  ActiveBroadcastGraphicSlot,
  BroadcastGraphicsStateData,
  GraphicsDesignGroupMeta,
  GraphicsElement,
} from '../../types/broadcastGraphics.ts';
import {
  applyColorOpacity,
  buildContinuousAnimationStyle,
  buildElementAnimationStyle,
  buildSlotContainerAnimationStyle,
  formatLinearGradient,
  getAnchorTransformOrigin,
  getImageMaskStyles,
  isSafeGraphicsUrl,
} from './graphicsStyleUtils.ts';
import { GraphicsQrCode } from './GraphicsQrCode.tsx';
import { GraphicsIconRenderer } from './GraphicsIconRenderer.tsx';

interface ObsGraphicsLayerProps {
  graphicsState?: BroadcastGraphicsStateData | null;
  activeSlotsOverride?: ActiveBroadcastGraphicSlot[];
  animationsPausedOverride?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  matchId?: string;
  tournamentId?: string | null;
  className?: string;
  previewPhase?: 'idle' | 'entry' | 'exit' | 'full';
  timelinePlayheadMs?: number | null;
}

export const GraphicElementContent: React.FC<{
  element: GraphicsElement;
  matchId?: string;
  tournamentId?: string | null;
  isEditorPlaceholder?: boolean;
}> = React.memo(({ element, matchId, tournamentId, isEditorPlaceholder }) => {
  const hasGradient = Boolean(element.gradient?.enabled);
  const bgAlpha = typeof element.backgroundOpacity === 'number' ? element.backgroundOpacity : 1;
  const solidBg = applyColorOpacity(element.backgroundColor || 'transparent', bgAlpha);
  const background = hasGradient
    ? formatLinearGradient(element.gradient, solidBg)
    : solidBg;

  const borderRadius =
    element.type === 'shape' &&
    (element.shapeKind === 'circle' || element.shapeKind === 'ellipse')
      ? 9999
      : element.borderRadius ?? 0;

  const boxShadow = element.shadowEnabled
    ? `${element.shadowOffsetX ?? 0}px ${element.shadowOffsetY ?? 6}px ${element.shadowBlur ?? 16}px ${element.shadowColor || 'rgba(0,0,0,0.45)'}`
    : undefined;

  const bStyle = element.borderStyle || 'solid';
  const borderCss =
    element.borderWidth && element.borderWidth > 0
      ? `${element.borderWidth}px ${bStyle} ${element.borderColor || '#ffffff'}`
      : element.type === 'shape' &&
          (element.shapeKind === 'line' || element.shapeKind === 'divider') &&
          element.strokeWidth &&
          element.strokeWidth > 0
        ? `${element.strokeWidth}px ${bStyle} ${element.borderColor || element.backgroundColor || '#ea580c'}`
        : undefined;

  const commonContainerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background,
    borderRadius,
    border: borderCss,
    boxShadow,
    paddingLeft: element.paddingX || 0,
    paddingRight: element.paddingX || 0,
    paddingTop: element.paddingY || 0,
    paddingBottom: element.paddingY || 0,
    marginTop: element.marginTop || 0,
    marginRight: element.marginRight || 0,
    marginBottom: element.marginBottom || 0,
    marginLeft: element.marginLeft || 0,
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
              ? formatLinearGradient(element.gradient, '#ea580c')
              : solidBg !== 'transparent'
                ? solidBg
                : '#ea580c',
            borderRadius: 9999,
            boxShadow,
          }}
        />
      );
    }
    return <div style={commonContainerStyle} />;
  }

  if (element.type === 'icon') {
    return (
      <div
        style={{
          ...commonContainerStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GraphicsIconRenderer
          iconName={element.iconName || 'trophy'}
          color={element.iconColor || '#ffffff'}
          strokeWidth={element.iconStrokeWidth ?? 2}
        />
      </div>
    );
  }

  if (element.type === 'text') {
    const textGrad = element.gradientText?.enabled
      ? formatLinearGradient(element.gradientText, '#ffffff')
      : null;

    const decorations: string[] = [];
    if (element.underline) decorations.push('underline');
    if (element.strikethrough) decorations.push('line-through');

    const computedTextShadow =
      element.textShadow ||
      (element.textShadowBlur && element.textShadowBlur > 0
        ? `${element.textShadowX ?? 0}px ${element.textShadowY ?? 2}px ${element.textShadowBlur}px ${element.textShadowColor || 'rgba(0,0,0,0.65)'}`
        : undefined);

    const textStyle: React.CSSProperties = {
      fontFamily: element.fontFamily || '"Outfit", sans-serif',
      fontSize: element.fontSize || 28,
      fontWeight: element.fontWeight || '700',
      fontStyle: element.italic ? 'italic' : 'normal',
      textDecoration: decorations.length > 0 ? decorations.join(' ') : 'none',
      textAlign: element.textAlign || 'center',
      textTransform: element.textTransform || 'none',
      direction: element.textDirection || 'ltr',
      letterSpacing:
        typeof element.letterSpacing === 'number' ? `${element.letterSpacing}px` : undefined,
      lineHeight: element.lineHeight || 1.2,
      whiteSpace: element.wordWrap === false ? 'nowrap' : 'pre-wrap',
      wordBreak: element.wordWrap === false ? 'normal' : 'break-word',
      WebkitTextStroke:
        element.textOutlineWidth && element.textOutlineWidth > 0
          ? `${element.textOutlineWidth}px ${element.textOutlineColor || '#000000'}`
          : undefined,
      textShadow: computedTextShadow,
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

    const alignItems =
      element.verticalAlign === 'top'
        ? 'flex-start'
        : element.verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center';

    return (
      <div
        style={{
          ...commonContainerStyle,
          display: 'flex',
          alignItems,
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
  const maskStyle = getImageMaskStyles(element.imageMask, element.crop);
  const flipTransform =
    element.flipX || element.flipY
      ? `scale(${element.flipX ? -1 : 1}, ${element.flipY ? -1 : 1})`
      : undefined;
  const objectPosition =
    element.imageAlign === 'top'
      ? 'center top'
      : element.imageAlign === 'bottom'
        ? 'center bottom'
        : element.imageAlign === 'left'
          ? 'left center'
          : element.imageAlign === 'right'
            ? 'right center'
            : 'center center';

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
            objectPosition,
            transform: flipTransform,
            ...maskStyle,
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
    previewPhase,
    timelinePlayheadMs = null,
  }) => {
    const rawSlots = activeSlotsOverride ?? graphicsState?.activeSlots ?? [];
    const paused =
      animationsPausedOverride !== undefined
        ? animationsPausedOverride
        : Boolean(graphicsState?.animationsPaused);

    const needsClockTick = useMemo(
      () =>
        rawSlots.some(
          (s) =>
            s.visible &&
            ((s.durationSeconds > 0 && Boolean(s.expiresAt)) ||
              (s.elements || []).some(
                (el) =>
                  (el.animation?.startTimeMs || 0) > 0 ||
                  (typeof el.animation?.endTimeMs === 'number' && el.animation.endTimeMs > 0)
              ))
        ),
      [rawSlots]
    );

    const [nowMs, setNowMs] = useState<number>(() => Date.now());

    useEffect(() => {
      if (!needsClockTick || paused || timelinePlayheadMs !== null) return;
      setNowMs(Date.now());
      const id = window.setInterval(() => {
        setNowMs(Date.now());
      }, 200);
      return () => window.clearInterval(id);
    }, [needsClockTick, paused, timelinePlayheadMs]);

    const visibleSlots = useMemo(() => {
      return rawSlots.filter((slot) => {
        if (!slot.visible) return false;
        if (paused || timelinePlayheadMs !== null) return true;
        if (slot.durationSeconds > 0 && slot.expiresAt) {
          const exp = new Date(slot.expiresAt).getTime();
          if (Number.isFinite(exp) && nowMs > exp + 360) {
            return false;
          }
        }
        return true;
      });
    }, [rawSlots, paused, nowMs, timelinePlayheadMs]);

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
          const slotExiting =
            previewPhase === 'exit' ||
            (!paused &&
              timelinePlayheadMs === null &&
              expMs !== null &&
              Number.isFinite(expMs) &&
              nowMs >= expMs - 340);

          const slotAnimStyle = buildSlotContainerAnimationStyle({
            entryAnimation: slot.entryAnimation,
            exitAnimation: slot.exitAnimation,
            exiting: slotExiting,
            paused,
          });

          const groupMap = new Map<string, GraphicsDesignGroupMeta>();
          for (const g of slot.groups || []) {
            groupMap.set(g.groupId, g);
          }

          const slotElapsedMs =
            timelinePlayheadMs !== null
              ? timelinePlayheadMs
              : slot.startedAt
                ? Math.max(0, nowMs - new Date(slot.startedAt).getTime())
                : 0;

          const sortedElements = [...(slot.elements || [])]
            .filter((el) => {
              if (el.visible === false) return false;
              const grp = el.groupId ? groupMap.get(el.groupId) : undefined;
              if (grp && grp.visible === false) return false;
              const startMs = Math.max(0, Number(el.animation?.startTimeMs) || 0);
              const endMs =
                typeof el.animation?.endTimeMs === 'number' && el.animation.endTimeMs > 0
                  ? el.animation.endTimeMs
                  : null;
              if (timelinePlayheadMs !== null) {
                if (timelinePlayheadMs < startMs) return false;
                if (endMs !== null && timelinePlayheadMs > endMs + 340) return false;
              } else if (needsClockTick && !paused) {
                if (startMs > 0 && slotElapsedMs < startMs) return false;
                if (endMs !== null && slotElapsedMs > endMs + 340) return false;
              }
              return true;
            })
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
                const grp = el.groupId ? groupMap.get(el.groupId) : undefined;
                const grpOpacity = typeof grp?.opacity === 'number' ? grp.opacity : 1;
                const combinedOpacity =
                  (typeof el.opacity === 'number' ? el.opacity : 1) * grpOpacity;

                const endMs =
                  typeof el.animation?.endTimeMs === 'number' && el.animation.endTimeMs > 0
                    ? el.animation.endTimeMs
                    : null;
                const elExiting =
                  slotExiting ||
                  (endMs !== null &&
                    slotElapsedMs >= endMs - (el.animation?.exitDurationMs || 340));

                const effectiveAnim =
                  grp?.animation && el.animation?.style === 'none'
                    ? { ...el.animation, ...grp.animation }
                    : el.animation;

                const entryExitAnim = buildElementAnimationStyle(effectiveAnim, {
                  paused,
                  exiting: elExiting,
                  disableDelay: timelinePlayheadMs !== null,
                });
                const contAnim = buildContinuousAnimationStyle(effectiveAnim, {
                  paused,
                  exiting: elExiting,
                });

                const rot = el.rotation || 0;
                const sx = el.scaleX ?? 1;
                const sy = el.scaleY ?? 1;
                const staticTransform =
                  rot !== 0 || sx !== 1 || sy !== 1
                    ? `rotate(${rot}deg) scale(${sx}, ${sy})`
                    : undefined;

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
                      opacity: combinedOpacity,
                      transform: staticTransform,
                      transformOrigin: getAnchorTransformOrigin(el.anchorPoint),
                    }}
                  >
                    <div className="w-full h-full" style={entryExitAnim}>
                      <div className="w-full h-full" style={contAnim}>
                        <GraphicElementContent
                          element={el}
                          matchId={effectiveMatchId}
                          tournamentId={effectiveTournamentId}
                        />
                      </div>
                    </div>
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
