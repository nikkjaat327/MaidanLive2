import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  Grid,
  Image as ImageIcon,
  Layers,
  Magnet,
  Maximize2,
  Shield,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { GraphicsElement } from '../../types/broadcastGraphics.ts';
import { GraphicElementContent } from './ObsGraphicsLayer.tsx';
import { isSafeGraphicsUrl } from './graphicsStyleUtils.ts';

export type CanvasPreviewBg = 'stadium' | 'turf' | 'checkerboard' | 'custom';

interface GraphicsCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  elements: GraphicsElement[];
  selectedIds: string[];
  matchId?: string;
  tournamentId?: string | null;
  previewBg: CanvasPreviewBg;
  customBgUrl?: string;
  showGrid: boolean;
  snapToGrid: boolean;
  showSafeMargins: boolean;
  showScoreboardSafeZone: boolean;
  zoomMode: 'fit' | number;
  onChangePreviewBg: (bg: CanvasPreviewBg) => void;
  onChangeShowGrid: (val: boolean) => void;
  onChangeSnapToGrid: (val: boolean) => void;
  onChangeShowSafeMargins: (val: boolean) => void;
  onChangeShowScoreboardSafeZone: (val: boolean) => void;
  onChangeZoomMode: (mode: 'fit' | number) => void;
  onUploadCustomBg: (file: File) => void;
  onSelectElements: (ids: string[]) => void;
  onElementsLiveChange: (nextElements: GraphicsElement[]) => void;
  onElementsCommit: (nextElements: GraphicsElement[], label?: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

interface DragSession {
  kind: 'move' | 'resize' | 'rotate';
  handle?: HandleDir;
  startClientX: number;
  startClientY: number;
  originMap: Record<string, { x: number; y: number; width: number; height: number; rotation: number }>;
  activeIds: string[];
  primaryId: string;
}

export const GraphicsCanvas: React.FC<GraphicsCanvasProps> = ({
  canvasWidth,
  canvasHeight,
  elements,
  selectedIds,
  matchId,
  tournamentId,
  previewBg,
  customBgUrl,
  showGrid,
  snapToGrid,
  showSafeMargins,
  showScoreboardSafeZone,
  zoomMode,
  onChangePreviewBg,
  onChangeShowGrid,
  onChangeSnapToGrid,
  onChangeShowSafeMargins,
  onChangeShowScoreboardSafeZone,
  onChangeZoomMode,
  onUploadCustomBg,
  onSelectElements,
  onElementsLiveChange,
  onElementsCommit,
  onUndo,
  onRedo,
  onDuplicateSelected,
  onDeleteSelected,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [fitScale, setFitScale] = useState(0.42);
  const [activeGuides, setActiveGuides] = useState<{ x?: number; y?: number }>({});
  const dragSessionRef = useRef<DragSession | null>(null);
  const latestElementsRef = useRef(elements);
  latestElementsRef.current = elements;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(200, rect.width - 40);
      const availH = Math.max(160, rect.height - 40);
      setFitScale(Math.min(1, availW / canvasWidth, availH / canvasHeight));
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

  const effectiveScale = zoomMode === 'fit' ? fitScale : zoomMode;

  const snapValue = useCallback(
    (val: number) => {
      if (!snapToGrid) return Math.round(val);
      return Math.round(val / 20) * 20;
    },
    [snapToGrid]
  );

  // Keyboard shortcuts when canvas or stage has focus (and user isn't typing in an input/textarea)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          onDuplicateSelected();
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        onDeleteSelected();
        return;
      }
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const next = latestElementsRef.current.map((el) =>
          selectedIds.includes(el.id) && !el.locked
            ? { ...el, x: el.x + dx, y: el.y + dy }
            : el
        );
        onElementsCommit(next, 'Nudge');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, onUndo, onRedo, onDuplicateSelected, onDeleteSelected, onElementsCommit]);

  // Global mouse move/up handlers for drag, resize, rotate
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;
      const dx = (e.clientX - session.startClientX) / effectiveScale;
      const dy = (e.clientY - session.startClientY) / effectiveScale;

      if (session.kind === 'move') {
        const primaryOrig = session.originMap[session.primaryId];
        if (!primaryOrig) return;
        let nextPrimaryX = snapValue(primaryOrig.x + dx);
        let nextPrimaryY = snapValue(primaryOrig.y + dy);

        // Smart alignment guides against canvas center (within 8px tolerance)
        const guides: { x?: number; y?: number } = {};
        const primaryCenterX = nextPrimaryX + primaryOrig.width / 2;
        const primaryCenterY = nextPrimaryY + primaryOrig.height / 2;
        if (Math.abs(primaryCenterX - canvasWidth / 2) <= 10) {
          nextPrimaryX = Math.round(canvasWidth / 2 - primaryOrig.width / 2);
          guides.x = canvasWidth / 2;
        }
        if (Math.abs(primaryCenterY - canvasHeight / 2) <= 10) {
          nextPrimaryY = Math.round(canvasHeight / 2 - primaryOrig.height / 2);
          guides.y = canvasHeight / 2;
        }
        setActiveGuides(guides);

        const appliedDx = nextPrimaryX - primaryOrig.x;
        const appliedDy = nextPrimaryY - primaryOrig.y;

        const next = latestElementsRef.current.map((el) => {
          if (!session.activeIds.includes(el.id) || el.locked) return el;
          const o = session.originMap[el.id];
          if (!o) return el;
          return {
            ...el,
            x: Math.round(o.x + appliedDx),
            y: Math.round(o.y + appliedDy),
          };
        });
        onElementsLiveChange(next);
        return;
      }

      if (session.kind === 'resize' && session.handle) {
        const orig = session.originMap[session.primaryId];
        if (!orig) return;
        let { x, y, width, height } = orig;
        const h = session.handle;
        const minW = 24;
        const minH = 6;

        if (h.includes('e')) {
          width = Math.max(minW, snapValue(orig.width + dx));
        }
        if (h.includes('s')) {
          height = Math.max(minH, snapValue(orig.height + dy));
        }
        if (h.includes('w')) {
          const newX = snapValue(orig.x + dx);
          const newW = orig.x + orig.width - newX;
          if (newW >= minW) {
            x = newX;
            width = newW;
          }
        }
        if (h.includes('n')) {
          const newY = snapValue(orig.y + dy);
          const newH = orig.y + orig.height - newY;
          if (newH >= minH) {
            y = newY;
            height = newH;
          }
        }

        const next = latestElementsRef.current.map((el) =>
          el.id === session.primaryId && !el.locked
            ? { ...el, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
            : el
        );
        onElementsLiveChange(next);
        return;
      }

      if (session.kind === 'rotate') {
        const orig = session.originMap[session.primaryId];
        if (!orig) return;
        const nextRot = Math.round(((orig.rotation + dx * 0.5) % 360 + 360) % 360);
        const normalizedRot = nextRot > 180 ? nextRot - 360 : nextRot;
        const next = latestElementsRef.current.map((el) =>
          el.id === session.primaryId && !el.locked ? { ...el, rotation: normalizedRot } : el
        );
        onElementsLiveChange(next);
      }
    };

    const onMouseUp = () => {
      if (!dragSessionRef.current) return;
      const kind = dragSessionRef.current.kind;
      dragSessionRef.current = null;
      setActiveGuides({});
      onElementsCommit(latestElementsRef.current, kind);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [effectiveScale, snapValue, canvasWidth, canvasHeight, onElementsLiveChange, onElementsCommit]);

  const startDragMove = (e: React.MouseEvent, el: GraphicsElement) => {
    e.stopPropagation();
    const isShift = e.shiftKey;
    let nextSelected: string[];
    if (isShift) {
      nextSelected = selectedIds.includes(el.id)
        ? selectedIds.filter((id) => id !== el.id)
        : [...selectedIds, el.id];
    } else if (el.groupId) {
      nextSelected = elements.filter((item) => item.groupId === el.groupId).map((i) => i.id);
    } else if (selectedIds.includes(el.id)) {
      nextSelected = selectedIds;
    } else {
      nextSelected = [el.id];
    }
    onSelectElements(nextSelected);

    if (el.locked) return;

    const originMap: DragSession['originMap'] = {};
    for (const item of elements) {
      if (nextSelected.includes(item.id)) {
        originMap[item.id] = {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          rotation: item.rotation || 0,
        };
      }
    }
    dragSessionRef.current = {
      kind: 'move',
      startClientX: e.clientX,
      startClientY: e.clientY,
      originMap,
      activeIds: nextSelected,
      primaryId: el.id,
    };
  };

  const startHandleDrag = (e: React.MouseEvent, el: GraphicsElement, handle: HandleDir) => {
    e.stopPropagation();
    if (el.locked) return;
    dragSessionRef.current = {
      kind: handle === 'rotate' ? 'rotate' : 'resize',
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originMap: {
        [el.id]: {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          rotation: el.rotation || 0,
        },
      },
      activeIds: [el.id],
      primaryId: el.id,
    };
  };

  const sortedElements = useMemo(
    () => [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)),
    [elements]
  );

  const safeCustomBg = customBgUrl && isSafeGraphicsUrl(customBgUrl) ? customBgUrl : '';

  return (
    <div className="flex flex-col h-full rounded-xl border border-slate-800 bg-[#090d16] overflow-hidden">
      {/* Canvas Stage Toolbar */}
      <div className="px-3 py-2 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">
            Stage BG:
          </span>
          {(
            [
              { id: 'stadium', label: 'Stadium Feed' },
              { id: 'turf', label: 'Turf Cam' },
              { id: 'checkerboard', label: 'Transparent' },
            ] as const
          ).map((bg) => (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChangePreviewBg(bg.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                previewBg === bg.id
                  ? 'bg-[#EA580C] text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {bg.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => bgFileInputRef.current?.click()}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
              previewBg === 'custom'
                ? 'bg-[#EA580C] text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>Upload Frame</span>
          </button>
          <input
            ref={bgFileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadCustomBg(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChangeShowGrid(!showGrid)}
            title="Toggle 20px Canvas Grid"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
              showGrid ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>Grid</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeSnapToGrid(!snapToGrid)}
            title="Snap movement & sizing to 20px grid"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
              snapToGrid ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeShowSafeMargins(!showSafeMargins)}
            title="Show Broadcast Title & Action Safe Margins"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
              showSafeMargins ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>Safe Zone</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeShowScoreboardSafeZone(!showScoreboardSafeZone)}
            title="Show Scoreboard Bar Reference Zone"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
              showScoreboardSafeZone ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Score Zone</span>
          </button>

          <div className="h-4 w-px bg-slate-700 mx-0.5" />

          <button
            type="button"
            onClick={() =>
              onChangeZoomMode(Math.max(0.2, Number((effectiveScale - 0.1).toFixed(2))))
            }
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeZoomMode('fit')}
            className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums ${
              zoomMode === 'fit'
                ? 'bg-[#EA580C] text-white'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            title="Fit Canvas to Screen"
          >
            {zoomMode === 'fit' ? 'FIT' : `${Math.round(effectiveScale * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() =>
              onChangeZoomMode(Math.min(1.5, Number((effectiveScale + 0.1).toFixed(2))))
            }
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChangeZoomMode('fit')}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Reset Zoom to Fit"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Canvas Viewport */}
      <div
        ref={viewportRef}
        onClick={() => onSelectElements([])}
        className="flex-1 min-h-[380px] lg:min-h-[520px] overflow-auto flex items-center justify-center p-5 bg-[#050811] select-none relative"
      >
        <div
          style={{
            width: Math.round(canvasWidth * effectiveScale),
            height: Math.round(canvasHeight * effectiveScale),
          }}
          className="relative shrink-0 shadow-2xl border border-slate-700/80"
        >
          <div
            className={`relative overflow-hidden ${
              previewBg === 'checkerboard' ? 'obs-checkerboard' : 'bg-slate-950'
            }`}
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${effectiveScale})`,
              transformOrigin: 'top left',
            }}
          >
            {/* Preview Background Modes */}
            {previewBg === 'stadium' && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse at 25% 15%, rgba(251,191,36,0.22), transparent 45%), radial-gradient(ellipse at 75% 15%, rgba(56,189,248,0.18), transparent 45%), linear-gradient(180deg, #090d16 0%, #0f172a 48%, #064e3b 72%, #022c22 100%)',
                }}
              />
            )}
            {previewBg === 'turf' && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'repeating-linear-gradient(90deg, rgba(16,185,129,0.08) 0px, rgba(16,185,129,0.08) 120px, rgba(5,150,105,0.12) 120px, rgba(5,150,105,0.12) 240px), linear-gradient(180deg, #065f46 0%, #064e3b 65%, #022c22 100%)',
                }}
              />
            )}
            {previewBg === 'custom' && safeCustomBg && (
              <img
                src={safeCustomBg}
                alt="Custom Stage Frame"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}

            {/* 20px Alignment Grid */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
                  backgroundSize: '40px 40px',
                }}
              />
            )}

            {/* Broadcast Safe Margins */}
            {showSafeMargins && (
              <>
                <div
                  className="absolute border border-dashed border-sky-400/45 pointer-events-none"
                  style={{
                    left: Math.round(canvasWidth * 0.035),
                    top: Math.round(canvasHeight * 0.035),
                    right: Math.round(canvasWidth * 0.035),
                    bottom: Math.round(canvasHeight * 0.035),
                  }}
                />
                <div
                  className="absolute border border-dashed border-amber-400/50 pointer-events-none"
                  style={{
                    left: Math.round(canvasWidth * 0.05),
                    top: Math.round(canvasHeight * 0.05),
                    right: Math.round(canvasWidth * 0.05),
                    bottom: Math.round(canvasHeight * 0.05),
                  }}
                >
                  <span className="absolute top-1 left-2 text-[14px] font-mono font-bold text-amber-300/80 uppercase tracking-wider">
                    Title Safe Zone (90%)
                  </span>
                </div>
              </>
            )}

            {/* Scoreboard Reference Zone */}
            {showScoreboardSafeZone && (
              <div
                className="absolute border-2 border-dashed border-orange-500/60 bg-orange-500/10 rounded-xl pointer-events-none flex items-center justify-center"
                style={{
                  left: Math.round(canvasWidth * 0.2),
                  bottom: 24,
                  width: Math.round(canvasWidth * 0.6),
                  height: 112,
                }}
              >
                <span className="text-[18px] font-bold uppercase tracking-widest text-orange-300">
                  MaidanLive Scoreboard Safe Zone
                </span>
              </div>
            )}

            {/* Smart Alignment Center Guides */}
            {activeGuides.x !== undefined && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-[#EA580C] pointer-events-none z-50"
                style={{ left: activeGuides.x }}
              />
            )}
            {activeGuides.y !== undefined && (
              <div
                className="absolute left-0 right-0 h-[2px] bg-[#EA580C] pointer-events-none z-50"
                style={{ top: activeGuides.y }}
              />
            )}

            {/* Elements */}
            {sortedElements.map((el) => {
              if (!el.visible) return null;
              const isSelected = selectedIds.includes(el.id);
              const isPrimary = selectedIds[0] === el.id;

              return (
                <div
                  key={el.id}
                  onMouseDown={(e) => startDragMove(e, el)}
                  onClick={(e) => e.stopPropagation()}
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
                    cursor: el.locked ? 'not-allowed' : 'move',
                  }}
                >
                  <GraphicElementContent
                    element={el}
                    matchId={matchId}
                    tournamentId={tournamentId}
                    isEditorPlaceholder
                  />

                  {/* Selection Box & Handles */}
                  {isSelected && (
                    <div
                      className={`absolute inset-0 pointer-events-none border-2 ${
                        el.locked ? 'border-amber-400' : 'border-[#EA580C]'
                      }`}
                    >
                      <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-[#EA580C] text-white text-[14px] font-mono font-bold whitespace-nowrap shadow">
                        {el.layerName} ({el.width}×{el.height})
                      </div>

                      {isPrimary && !el.locked && (
                        <>
                          {(
                            [
                              { id: 'nw', cls: '-top-2 -left-2 cursor-nwse-resize' },
                              { id: 'n', cls: '-top-2 left-1/2 -translate-x-1/2 cursor-ns-resize' },
                              { id: 'ne', cls: '-top-2 -right-2 cursor-nesw-resize' },
                              { id: 'e', cls: 'top-1/2 -right-2 -translate-y-1/2 cursor-ew-resize' },
                              { id: 'se', cls: '-bottom-2 -right-2 cursor-nwse-resize' },
                              { id: 's', cls: '-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize' },
                              { id: 'sw', cls: '-bottom-2 -left-2 cursor-nesw-resize' },
                              { id: 'w', cls: 'top-1/2 -left-2 -translate-y-1/2 cursor-ew-resize' },
                            ] as Array<{ id: HandleDir; cls: string }>
                          ).map((h) => (
                            <div
                              key={h.id}
                              onMouseDown={(e) => startHandleDrag(e, el, h.id)}
                              className={`pointer-events-auto absolute w-4 h-4 rounded-sm bg-white border-2 border-[#EA580C] shadow ${h.cls}`}
                            />
                          ))}

                          {/* Rotation Handle */}
                          <div
                            onMouseDown={(e) => startHandleDrag(e, el, 'rotate')}
                            title="Drag horizontally to rotate"
                            className="pointer-events-auto absolute -top-10 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-sky-500 shadow cursor-grab flex items-center justify-center"
                          >
                            <Crosshair className="w-3 h-3 text-sky-600" />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Canvas Footer Coordinates Hint */}
      <div className="px-3 py-1.5 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
        <span>
          Canvas: <strong className="text-slate-200">{canvasWidth}×{canvasHeight}</strong> · Elements:{' '}
          <strong className="text-slate-200">{elements.length}</strong>
        </span>
        <span>
          Shortcuts: Arrows Nudge (Shift=10px) · Ctrl+D Duplicate · Ctrl+Z/Y Undo/Redo · Del Delete
        </span>
      </div>
    </div>
  );
};
