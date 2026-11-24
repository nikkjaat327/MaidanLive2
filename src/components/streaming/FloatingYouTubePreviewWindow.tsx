import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink, GripHorizontal, Maximize2, Minimize2, X, Youtube } from 'lucide-react';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';

type ResizeDirection = 'se' | 'e' | 's' | 'w' | 'sw';

export function FloatingYouTubePreviewWindow() {
  const location = useLocation();
  const { youtubePreview, updateYouTubeGeometry, closeYouTubePreview } = useBroadcastPreview();

  const [interaction, setInteraction] = useState<'idle' | 'drag' | 'resize'>('idle');
  const interactionRef = useRef<{
    mode: 'idle' | 'drag' | 'resize';
    dir?: ResizeDirection;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  }>({
    mode: 'idle',
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origW: 480,
    origH: 316,
  });

  // Never render floating preview chrome on pure OBS Browser Source or Camera Companion routes
  const isIsolatedRoute =
    location.pathname.startsWith('/broadcast/overlay/view') ||
    location.pathname.startsWith('/camera-connect');

  useEffect(() => {
    if (interaction === 'idle') return;

    const onPointerMove = (e: PointerEvent) => {
      const st = interactionRef.current;
      if (st.mode === 'idle') return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const vw = window.innerWidth || 1440;
      const vh = window.innerHeight || 900;

      if (st.mode === 'drag') {
        updateYouTubeGeometry({
          x: st.origX + dx,
          y: st.origY + dy,
        });
        return;
      }

      if (st.mode === 'resize') {
        let nextW = st.origW;
        let nextH = st.origH;
        let nextX = st.origX;

        if (st.dir === 'se' || st.dir === 'e') {
          nextW = Math.max(280, Math.min(vw - st.origX - 8, st.origW + dx));
        }
        if (st.dir === 'se' || st.dir === 's' || st.dir === 'sw') {
          nextH = Math.max(195, Math.min(vh - st.origY - 8, st.origH + dy));
        }
        if (st.dir === 'w' || st.dir === 'sw') {
          const desiredW = Math.max(280, Math.min(st.origX + st.origW - 8, st.origW - dx));
          nextX = st.origX + (st.origW - desiredW);
          nextW = desiredW;
        }

        updateYouTubeGeometry({
          x: nextX,
          y: st.origY,
          width: nextW,
          height: nextH,
        });
      }
    };

    const onPointerUp = () => {
      interactionRef.current.mode = 'idle';
      setInteraction('idle');
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [interaction, updateYouTubeGeometry]);

  if (isIsolatedRoute || !youtubePreview.open || !youtubePreview.videoId) {
    return null;
  }

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button, a, input')) return;
    e.preventDefault();
    interactionRef.current = {
      mode: 'drag',
      startX: e.clientX,
      startY: e.clientY,
      origX: youtubePreview.x,
      origY: youtubePreview.y,
      origW: youtubePreview.width,
      origH: youtubePreview.height,
    };
    setInteraction('drag');
  };

  const startResize = (dir: ResizeDirection) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    interactionRef.current = {
      mode: 'resize',
      dir,
      startX: e.clientX,
      startY: e.clientY,
      origX: youtubePreview.x,
      origY: youtubePreview.y,
      origW: youtubePreview.width,
      origH: youtubePreview.height,
    };
    setInteraction('resize');
  };

  const applyPresetSize = (targetW: number) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const clampedW = Math.min(vw - 24, targetW);
    const targetH = Math.round((clampedW * 9) / 16) + 42;
    updateYouTubeGeometry({ width: clampedW, height: targetH });
  };

  const embedSrc = `https://www.youtube.com/embed/${encodeURIComponent(
    youtubePreview.videoId
  )}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;

  return (
    <aside
      aria-label="Floating Live YouTube Video Preview"
      style={{
        left: youtubePreview.x,
        top: youtubePreview.y,
        width: youtubePreview.width,
        height: youtubePreview.height,
      }}
      className="fixed z-[95] flex flex-col rounded-xl border border-slate-700/90 bg-slate-950/95 text-white shadow-[0_24px_60px_rgba(0,0,0,0.8)] backdrop-blur-md overflow-hidden select-none"
    >
      {/* Draggable Header */}
      <div
        onPointerDown={startDrag}
        className={`h-10 px-3 flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 shrink-0 ${
          interaction === 'drag' ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Youtube className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-xs font-bold tracking-tight truncate">
            YouTube Live Preview
          </span>
          <span className="hidden sm:inline font-mono text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800">
            {youtubePreview.videoId}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => applyPresetSize(340)}
            title="Compact Size"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800"
          >
            S
          </button>
          <button
            type="button"
            onClick={() => applyPresetSize(520)}
            title="Medium Size"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800"
          >
            M
          </button>
          <button
            type="button"
            onClick={() => applyPresetSize(760)}
            title="Large Size"
            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <a
            href={`https://www.youtube.com/watch?v=${youtubePreview.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on YouTube"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={closeYouTubePreview}
            aria-label="Close YouTube preview"
            title="Close YouTube preview"
            className="p-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Live Video Player Container */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <iframe
          key={youtubePreview.videoId}
          title={`YouTube Preview ${youtubePreview.videoId}`}
          src={embedSrc}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="w-full h-full border-0"
        />

        {/* Prevent iframe from swallowing pointermove/pointerup while dragging or resizing */}
        {interaction !== 'idle' && (
          <div className="absolute inset-0 z-20 bg-slate-950/20 flex items-end justify-start p-2">
            <span className="px-2 py-0.5 rounded bg-black/80 border border-white/15 font-mono text-[10px] font-bold text-white">
              {youtubePreview.width} × {youtubePreview.height}
            </span>
          </div>
        )}
      </div>

      {/* Full Resize Handles (Edges + Bottom Corners) */}
      <div
        onPointerDown={startResize('e')}
        title="Resize horizontally"
        className="absolute top-10 right-0 bottom-3 w-1.5 cursor-ew-resize hover:bg-[#EA580C]/60 z-30"
      />
      <div
        onPointerDown={startResize('w')}
        title="Resize horizontally from left"
        className="absolute top-10 left-0 bottom-3 w-1.5 cursor-ew-resize hover:bg-[#EA580C]/60 z-30"
      />
      <div
        onPointerDown={startResize('s')}
        title="Resize vertically"
        className="absolute left-3 right-3 bottom-0 h-1.5 cursor-ns-resize hover:bg-[#EA580C]/60 z-30"
      />
      <div
        onPointerDown={startResize('sw')}
        title="Resize diagonally"
        className="absolute left-0 bottom-0 w-3.5 h-3.5 cursor-nesw-resize z-30"
      />
      <div
        onPointerDown={startResize('se')}
        title="Drag to resize window"
        aria-label="Resize YouTube preview window"
        className="absolute right-0 bottom-0 w-5 h-5 cursor-nwse-resize z-30 flex items-end justify-end p-0.5 text-slate-300 hover:text-white bg-slate-900/75 rounded-tl-md border-t border-l border-slate-700"
      >
        <Minimize2 className="w-3 h-3 rotate-90" />
      </div>
    </aside>
  );
}
