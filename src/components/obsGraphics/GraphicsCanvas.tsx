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
import type {
  GraphicsDesignGroupMeta,
  GraphicsElement,
} from '../../types/broadcastGraphics.ts';
import { GraphicElementContent } from './ObsGraphicsLayer.tsx';
import { getAnchorTransformOrigin, isSafeGraphicsUrl } from './graphicsStyleUtils.ts';

export type CanvasPreviewBg = 'stadium' | 'turf' | 'checkerboard' | 'custom';

interface GraphicsCanvasProps {
  canvasWidth: number;
  canvasHeight: number;
  elements: GraphicsElement[];
  groups?: GraphicsDesignGroupMeta[];
  selectedIds: string[];
  matchId?: string;
  tournamentId?: string | null;
  previewBg: CanvasPreviewBg;
  customBgUrl?: string;
  showGrid: boolean;
  gridSpacing?: number;
  snapToGrid: boolean;
  showSafeMargins: boolean;
  showScoreboardSafeZone: boolean;
  zoomMode: 'fit' | number;
  timelinePlayheadMs?: number | null;
  onChangePreviewBg: (bg: CanvasPreviewBg) => void;
  onChangeShowGrid: (val: boolean) => void;
  onChangeGridSpacing?: (spacing: number) => void;
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
  onCopySelected?: () => void;
  onPasteClipboard?: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

interface OriginRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fontSize?: number;
}

interface DragSession {
  kind: 'move' | 'resize' | 'rotate' | 'group_resize' | 'marquee';
  handle?: HandleDir;
  startClientX: number;
  startClientY: number;
  startCanvasX?: number;
  startCanvasY?: number;
  shiftAdditive?: boolean;
  originMap: Record<string, OriginRect>;
  groupBoxOrigin?: { x: number; y: number; width: number; height: number };
  activeIds: string[];
  primaryId: string;
}

interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GraphicsCanvas: React.FC<GraphicsCanvasProps> = ({
  canvasWidth,
  canvasHeight,
  elements,
  groups = [],
  selectedIds,
  matchId,
  tournamentId,
  previewBg,
  customBgUrl,
  showGrid,
  gridSpacing = 20,
  snapToGrid,
  showSafeMargins,
  showScoreboardSafeZone,
  zoomMode,
  timelinePlayheadMs = null,
  onChangePreviewBg,
  onChangeShowGrid,
  onChangeGridSpacing,
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
  onCopySelected,
  onPasteClipboard,
  onDuplicateSelected,
  onDeleteSelected,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const [fitScale, setFitScale] = useState(0.42);
  const [activeGuides, setActiveGuides] = useState<{ x?: number; y?: number }>({});
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const marqueeRectRef = useRef<MarqueeRect | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const latestElementsRef = useRef(elements);
  latestElementsRef.current = elements;

  const groupMap = useMemo(() => {
    const map = new Map<string, GraphicsDesignGroupMeta>();
    for (const g of groups) map.set(g.groupId, g);
    return map;
  }, [groups]);

  const isEffectivelyLocked = useCallback(
    (el: GraphicsElement) => {
      const grp = el.groupId ? groupMap.get(el.groupId) : undefined;
      return Boolean(el.locked || grp?.locked);
    },
    [groupMap]
  );

  const isEffectivelyVisible = useCallback(
    (el: GraphicsElement) => {
      if (el.visible === false) return false;
      const grp = el.groupId ? groupMap.get(el.groupId) : undefined;
      if (grp && grp.visible === false) return false;
      if (timelinePlayheadMs !== null) {
        const start = Math.max(0, Number(el.animation?.startTimeMs) || 0);
        const end =
          typeof el.animation?.endTimeMs === 'number' && el.animation.endTimeMs > 0
            ? el.animation.endTimeMs
            : null;
        if (timelinePlayheadMs < start) return false;
        if (end !== null && timelinePlayheadMs > end) return false;
      }
      return true;
    },
    [groupMap, timelinePlayheadMs]
  );

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
      const step = Math.max(5, gridSpacing);
      return Math.round(val / step) * step;
    },
    [snapToGrid, gridSpacing]
  );

  // Keyboard shortcuts
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (selectedIds.length > 0 && onCopySelected) {
          e.preventDefault();
          onCopySelected();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (onPasteClipboard) {
          e.preventDefault();
          onPasteClipboard();
        }
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
      if (e.key === 'Escape' && selectedIds.length > 0) {
        onSelectElements([]);
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
          selectedIds.includes(el.id) && !isEffectivelyLocked(el)
            ? { ...el, x: el.x + dx, y: el.y + dy }
            : el
        );
        onElementsCommit(next, 'Nudge');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedIds,
    onUndo,
    onRedo,
    onCopySelected,
    onPasteClipboard,
    onDuplicateSelected,
    onDeleteSelected,
    onElementsCommit,
    onSelectElements,
    isEffectivelyLocked,
  ]);

  // Global mouse move/up handlers for move, single resize, group resize, rotate, marquee
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const session = dragSessionRef.current;
      if (!session) return;

      if (session.kind === 'marquee' && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        const curX = Math.max(0, Math.min(canvasWidth, (e.clientX - rect.left) / effectiveScale));
        const curY = Math.max(0, Math.min(canvasHeight, (e.clientY - rect.top) / effectiveScale));
        const sx = session.startCanvasX ?? curX;
        const sy = session.startCanvasY ?? curY;
        const box: MarqueeRect = {
          x: Math.min(sx, curX),
          y: Math.min(sy, curY),
          width: Math.abs(curX - sx),
          height: Math.abs(curY - sy),
        };
        marqueeRectRef.current = box;
        setMarqueeRect(box);
        return;
      }

      const dx = (e.clientX - session.startClientX) / effectiveScale;
      const dy = (e.clientY - session.startClientY) / effectiveScale;

      if (session.kind === 'move') {
        const primaryOrig = session.originMap[session.primaryId];
        if (!primaryOrig) return;
        let nextPrimaryX = snapValue(primaryOrig.x + dx);
        let nextPrimaryY = snapValue(primaryOrig.y + dy);

        // Smart alignment guides: canvas center/edges + other unselected elements
        const guides: { x?: number; y?: number } = {};
        const snapTargetsX = [0, canvasWidth / 2, canvasWidth];
        const snapTargetsY = [0, canvasHeight / 2, canvasHeight];
        for (const other of latestElementsRef.current) {
          if (session.activeIds.includes(other.id) || other.visible === false) continue;
          snapTargetsX.push(other.x, other.x + other.width / 2, other.x + other.width);
          snapTargetsY.push(other.y, other.y + other.height / 2, other.y + other.height);
        }

        const pLeft = nextPrimaryX;
        const pCenterX = nextPrimaryX + primaryOrig.width / 2;
        const pRight = nextPrimaryX + primaryOrig.width;
        let snappedX = false;
        for (const tx of snapTargetsX) {
          if (Math.abs(pCenterX - tx) <= 8) {
            nextPrimaryX = Math.round(tx - primaryOrig.width / 2);
            guides.x = tx;
            snappedX = true;
            break;
          }
          if (Math.abs(pLeft - tx) <= 7) {
            nextPrimaryX = Math.round(tx);
            guides.x = tx;
            snappedX = true;
            break;
          }
          if (Math.abs(pRight - tx) <= 7) {
            nextPrimaryX = Math.round(tx - primaryOrig.width);
            guides.x = tx;
            snappedX = true;
            break;
          }
        }
        if (!snappedX) guides.x = undefined;

        const pTop = nextPrimaryY;
        const pCenterY = nextPrimaryY + primaryOrig.height / 2;
        const pBottom = nextPrimaryY + primaryOrig.height;
        for (const ty of snapTargetsY) {
          if (Math.abs(pCenterY - ty) <= 8) {
            nextPrimaryY = Math.round(ty - primaryOrig.height / 2);
            guides.y = ty;
            break;
          }
          if (Math.abs(pTop - ty) <= 7) {
            nextPrimaryY = Math.round(ty);
            guides.y = ty;
            break;
          }
          if (Math.abs(pBottom - ty) <= 7) {
            nextPrimaryY = Math.round(ty - primaryOrig.height);
            guides.y = ty;
            break;
          }
        }

        setActiveGuides(guides);

        const appliedDx = nextPrimaryX - primaryOrig.x;
        const appliedDy = nextPrimaryY - primaryOrig.y;

        const next = latestElementsRef.current.map((el) => {
          if (!session.activeIds.includes(el.id) || isEffectivelyLocked(el)) return el;
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

      if (session.kind === 'group_resize' && session.handle && session.groupBoxOrigin) {
        const gb = session.groupBoxOrigin;
        let { x, y, width, height } = gb;
        const h = session.handle;
        const minBox = 24;

        if (h.includes('e')) width = Math.max(minBox, snapValue(gb.width + dx));
        if (h.includes('s')) height = Math.max(minBox, snapValue(gb.height + dy));
        if (h.includes('w')) {
          const newX = snapValue(gb.x + dx);
          const newW = gb.x + gb.width - newX;
          if (newW >= minBox) {
            x = newX;
            width = newW;
          }
        }
        if (h.includes('n')) {
          const newY = snapValue(gb.y + dy);
          const newH = gb.y + gb.height - newY;
          if (newH >= minBox) {
            y = newY;
            height = newH;
          }
        }

        const scaleX = width / Math.max(1, gb.width);
        const scaleY = height / Math.max(1, gb.height);

        const next = latestElementsRef.current.map((el) => {
          if (!session.activeIds.includes(el.id) || isEffectivelyLocked(el)) return el;
          const orig = session.originMap[el.id];
          if (!orig) return el;
          return {
            ...el,
            x: Math.round(x + (orig.x - gb.x) * scaleX),
            y: Math.round(y + (orig.y - gb.y) * scaleY),
            width: Math.max(8, Math.round(orig.width * scaleX)),
            height: Math.max(4, Math.round(orig.height * scaleY)),
          };
        });
        onElementsLiveChange(next);
        return;
      }

      if (session.kind === 'resize' && session.handle) {
        const orig = session.originMap[session.primaryId];
        const targetEl = latestElementsRef.current.find((i) => i.id === session.primaryId);
        if (!orig || !targetEl || isEffectivelyLocked(targetEl)) return;
        let { x, y, width, height } = orig;
        const h = session.handle;
        const minW = 24;
        const minH = 4;

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

        if ((targetEl.lockAspectRatio || e.shiftKey) && orig.height > 0 && orig.width > 0) {
          const ratio = orig.width / orig.height;
          if (h === 'e' || h === 'w') {
            height = Math.max(minH, Math.round(width / ratio));
          } else if (h === 'n' || h === 's') {
            width = Math.max(minW, Math.round(height * ratio));
          } else {
            height = Math.max(minH, Math.round(width / ratio));
            if (h.includes('n')) y = orig.y + orig.height - height;
          }
        }

        const next = latestElementsRef.current.map((el) =>
          el.id === session.primaryId
            ? {
                ...el,
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
              }
            : el
        );
        onElementsLiveChange(next);
        return;
      }

      if (session.kind === 'rotate') {
        const orig = session.originMap[session.primaryId];
        if (!orig) return;
        const nextRot = Math.round((((orig.rotation + dx * 0.5) % 360) + 360) % 360);
        const normalizedRot = nextRot > 180 ? nextRot - 360 : nextRot;
        const next = latestElementsRef.current.map((el) =>
          el.id === session.primaryId && !isEffectivelyLocked(el)
            ? { ...el, rotation: normalizedRot }
            : el
        );
        onElementsLiveChange(next);
      }
    };

    const onMouseUp = () => {
      const session = dragSessionRef.current;
      if (!session) return;
      dragSessionRef.current = null;
      setActiveGuides({});

      if (session.kind === 'marquee') {
        const box = marqueeRectRef.current;
        marqueeRectRef.current = null;
        setMarqueeRect(null);
        if (box && (box.width > 6 || box.height > 6)) {
          const hitIds = latestElementsRef.current
            .filter((el) => {
              if (!isEffectivelyVisible(el)) return false;
              const overlapX = el.x < box.x + box.width && el.x + el.width > box.x;
              const overlapY = el.y < box.y + box.height && el.y + el.height > box.y;
              return overlapX && overlapY;
            })
            .map((el) => el.id);
          if (session.shiftAdditive) {
            const combined = Array.from(new Set([...selectedIds, ...hitIds]));
            onSelectElements(combined);
          } else {
            onSelectElements(hitIds);
          }
        } else if (!session.shiftAdditive) {
          onSelectElements([]);
        }
        return;
      }

      onElementsCommit(latestElementsRef.current, session.kind);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [
    effectiveScale,
    snapValue,
    canvasWidth,
    canvasHeight,
    onElementsLiveChange,
    onElementsCommit,
    onSelectElements,
    selectedIds,
    isEffectivelyLocked,
    isEffectivelyVisible,
  ]);

  const startMarqueeSelection = (e: React.MouseEvent) => {
    if (e.button !== 0 || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(canvasWidth, (e.clientX - rect.left) / effectiveScale));
    const cy = Math.max(0, Math.min(canvasHeight, (e.clientY - rect.top) / effectiveScale));
    dragSessionRef.current = {
      kind: 'marquee',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCanvasX: cx,
      startCanvasY: cy,
      shiftAdditive: e.shiftKey,
      originMap: {},
      activeIds: [],
      primaryId: '',
    };
    const initial = { x: cx, y: cy, width: 0, height: 0 };
    marqueeRectRef.current = initial;
    setMarqueeRect(initial);
  };

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

    if (isEffectivelyLocked(el)) return;

    const originMap: Record<string, OriginRect> = {};
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
    if (isEffectivelyLocked(el)) return;
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

  // Multi-select / group bounding box
  const multiSelectionBox = useMemo(() => {
    if (selectedIds.length <= 1) return null;
    const selectedItems = elements.filter(
      (el) => selectedIds.includes(el.id) && isEffectivelyVisible(el)
    );
    if (selectedItems.length <= 1) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of selectedItems) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    const anyUnlocked = selectedItems.some((el) => !isEffectivelyLocked(el));
    return {
      x: minX,
      y: minY,
      width: Math.max(8, maxX - minX),
      height: Math.max(4, maxY - minY),
      anyUnlocked,
    };
  }, [elements, selectedIds, isEffectivelyVisible, isEffectivelyLocked]);

  const startGroupResizeDrag = (e: React.MouseEvent, handle: HandleDir) => {
    e.stopPropagation();
    if (!multiSelectionBox || !multiSelectionBox.anyUnlocked) return;
    const originMap: Record<string, OriginRect> = {};
    for (const el of elements) {
      if (selectedIds.includes(el.id)) {
        originMap[el.id] = {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          rotation: el.rotation || 0,
        };
      }
    }
    dragSessionRef.current = {
      kind: 'group_resize',
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originMap,
      groupBoxOrigin: {
        x: multiSelectionBox.x,
        y: multiSelectionBox.y,
        width: multiSelectionBox.width,
        height: multiSelectionBox.height,
      },
      activeIds: selectedIds,
      primaryId: selectedIds[0],
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
            Stage:
          </span>
          {(
            [
              { id: 'stadium', label: 'Stadium' },
              { id: 'turf', label: 'Turf' },
              { id: 'checkerboard', label: 'Transparent' },
            ] as const
          ).map((bg) => (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChangePreviewBg(bg.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
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
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
              previewBg === 'custom'
                ? 'bg-[#EA580C] text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <ImageIcon className="w-3 h-3" />
            <span>Frame</span>
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
            title="Toggle Alignment Grid"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 ${
              showGrid ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Grid className="w-3 h-3" />
            <span>Grid</span>
          </button>
          {onChangeGridSpacing && (
            <select
              aria-label="Grid Spacing"
              value={gridSpacing}
              onChange={(e) => onChangeGridSpacing(Number(e.target.value))}
              className="px-1.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-200"
            >
              <option value={10}>10px</option>
              <option value={20}>20px</option>
              <option value={40}>40px</option>
              <option value={50}>50px</option>
            </select>
          )}
          <button
            type="button"
            onClick={() => onChangeSnapToGrid(!snapToGrid)}
            title="Snap movement & sizing to grid"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 ${
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
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 ${
              showSafeMargins ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Shield className="w-3 h-3" />
            <span>Safe</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeShowScoreboardSafeZone(!showScoreboardSafeZone)}
            title="Show Scoreboard Bar Reference Zone"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 ${
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
        onMouseDown={(e) => {
          if (e.target === viewportRef.current) onSelectElements([]);
        }}
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
            ref={stageRef}
            onMouseDown={startMarqueeSelection}
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

            {/* Alignment Grid */}
            {showGrid && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
                  backgroundSize: `${gridSpacing * 2}px ${gridSpacing * 2}px`,
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

            {/* Smart Alignment Center / Edge Guides */}
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
              if (!isEffectivelyVisible(el)) return null;
              const isSelected = selectedIds.includes(el.id);
              const isSingleSelected = selectedIds.length === 1 && selectedIds[0] === el.id;
              const locked = isEffectivelyLocked(el);
              const grp = el.groupId ? groupMap.get(el.groupId) : undefined;
              const combinedOpacity =
                (typeof el.opacity === 'number' ? el.opacity : 1) *
                (typeof grp?.opacity === 'number' ? grp.opacity : 1);
              const rot = el.rotation || 0;
              const sx = el.scaleX ?? 1;
              const sy = el.scaleY ?? 1;
              const transformStr =
                rot !== 0 || sx !== 1 || sy !== 1
                  ? `rotate(${rot}deg) scale(${sx}, ${sy})`
                  : undefined;

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
                    opacity: combinedOpacity,
                    transform: transformStr,
                    transformOrigin: getAnchorTransformOrigin(el.anchorPoint),
                    cursor: locked ? 'not-allowed' : 'move',
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
                        locked
                          ? 'border-amber-400'
                          : selectedIds.length > 1
                            ? 'border-sky-400'
                            : 'border-[#EA580C]'
                      }`}
                    >
                      {isSingleSelected && (
                        <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-[#EA580C] text-white text-[14px] font-mono font-bold whitespace-nowrap shadow">
                          {el.layerName} ({el.width}×{el.height})
                        </div>
                      )}

                      {isSingleSelected && !locked && (
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

            {/* Unified Multi-Select / Group Bounding Box */}
            {multiSelectionBox && (
              <div
                className="absolute pointer-events-none border-2 border-dashed border-[#EA580C] z-[9990]"
                style={{
                  left: multiSelectionBox.x,
                  top: multiSelectionBox.y,
                  width: multiSelectionBox.width,
                  height: multiSelectionBox.height,
                }}
              >
                <div className="absolute -top-7 left-0 px-2 py-0.5 rounded bg-slate-900 border border-[#EA580C] text-white text-[14px] font-mono font-bold whitespace-nowrap shadow">
                  Selection ({selectedIds.length} items · {Math.round(multiSelectionBox.width)}×
                  {Math.round(multiSelectionBox.height)})
                </div>
                {multiSelectionBox.anyUnlocked &&
                  (
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
                      onMouseDown={(e) => startGroupResizeDrag(e, h.id)}
                      className={`pointer-events-auto absolute w-4 h-4 rounded-sm bg-white border-2 border-[#EA580C] shadow ${h.cls}`}
                    />
                  ))}
              </div>
            )}

            {/* Marquee Drag-Box Selection */}
            {marqueeRect && (marqueeRect.width > 3 || marqueeRect.height > 3) && (
              <div
                className="absolute pointer-events-none border-2 border-[#EA580C] bg-[#EA580C]/15 z-[9995]"
                style={{
                  left: marqueeRect.x,
                  top: marqueeRect.y,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Canvas Footer Coordinates Hint */}
      <div className="px-3 py-1.5 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-slate-400">
        <span>
          Canvas: <strong className="text-slate-200">{canvasWidth}×{canvasHeight}</strong> · Layers:{' '}
          <strong className="text-slate-200">{elements.length}</strong>
        </span>
        <span>
          Drag empty canvas to box-select · Arrows Nudge (Shift=10px) · Ctrl+C/V Copy/Paste · Ctrl+D Duplicate · Del Delete
        </span>
      </div>
    </div>
  );
};
