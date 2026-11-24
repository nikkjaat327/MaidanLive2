import React, { useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import type { GraphicsElement } from '../../types/broadcastGraphics.ts';

interface GraphicsTimelinePanelProps {
  elements: GraphicsElement[];
  selectedIds: string[];
  totalDurationSeconds: number;
  playheadMs: number | null;
  isPlaying: boolean;
  onSelectElements: (ids: string[]) => void;
  onChangeTotalDurationSeconds: (secs: number) => void;
  onChangePlayheadMs: (ms: number | null) => void;
  onTogglePlay: () => void;
  onStopPlayback: () => void;
  onReplayPlayback: () => void;
  onElementsLiveChange: (next: GraphicsElement[]) => void;
  onElementsCommit: (next: GraphicsElement[]) => void;
}

interface BarDragSession {
  elementId: string;
  mode: 'move' | 'start' | 'end';
  startClientX: number;
  originStartMs: number;
  originEndMs: number;
  trackWidthPx: number;
}

export const GraphicsTimelinePanel: React.FC<GraphicsTimelinePanelProps> = ({
  elements,
  selectedIds,
  totalDurationSeconds,
  playheadMs,
  isPlaying,
  onSelectElements,
  onChangeTotalDurationSeconds,
  onChangePlayheadMs,
  onTogglePlay,
  onStopPlayback,
  onReplayPlayback,
  onElementsLiveChange,
  onElementsCommit,
}) => {
  const totalMs = Math.max(1000, (totalDurationSeconds || 10) * 1000);
  const trackAreaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<BarDragSession | null>(null);
  const latestElementsRef = useRef(elements);
  latestElementsRef.current = elements;

  const sortedAsc = useMemo(
    () => [...elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)),
    [elements]
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = dragRef.current;
      if (!s) return;
      const dxPx = e.clientX - s.startClientX;
      const dMs = Math.round(((dxPx / Math.max(1, s.trackWidthPx)) * totalMs) / 50) * 50;

      const next = latestElementsRef.current.map((el) => {
        if (el.id !== s.elementId) return el;
        let nextStart = s.originStartMs;
        let nextEnd = s.originEndMs;
        if (s.mode === 'move') {
          const span = Math.max(200, s.originEndMs - s.originStartMs);
          nextStart = Math.max(0, Math.min(totalMs - 200, s.originStartMs + dMs));
          nextEnd = Math.min(totalMs, nextStart + span);
        } else if (s.mode === 'start') {
          nextStart = Math.max(0, Math.min(s.originEndMs - 200, s.originStartMs + dMs));
        } else if (s.mode === 'end') {
          nextEnd = Math.max(s.originStartMs + 200, Math.min(totalMs, s.originEndMs + dMs));
        }
        return {
          ...el,
          animation: {
            ...el.animation,
            startTimeMs: nextStart,
            endTimeMs: nextEnd >= totalMs ? null : nextEnd,
          },
        };
      });
      onElementsLiveChange(next);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      onElementsCommit(latestElementsRef.current);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [totalMs, onElementsLiveChange, onElementsCommit]);

  const handleRulerScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackAreaRef.current) return;
    const rect = trackAreaRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    onChangePlayheadMs(Math.round((ratio * totalMs) / 50) * 50);
  };

  const handleAutoStagger = () => {
    const ordered = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const step = Math.min(350, Math.floor(totalMs / Math.max(2, ordered.length + 1)));
    const map = new Map<string, number>();
    ordered.forEach((el, idx) => map.set(el.id, idx * step));
    onElementsCommit(
      elements.map((el) => ({
        ...el,
        animation: {
          ...el.animation,
          startTimeMs: map.get(el.id) ?? 0,
        },
      }))
    );
  };

  const tickMarks = useMemo(() => {
    const secs = Math.max(1, Math.round(totalMs / 1000));
    const step = secs > 30 ? 5 : secs > 14 ? 2 : 1;
    const list: number[] = [];
    for (let s = 0; s <= secs; s += step) list.push(s);
    return list;
  }, [totalMs]);

  const currentSecLabel = ((playheadMs ?? 0) / 1000).toFixed(2);
  const totalSecLabel = (totalMs / 1000).toFixed(1);

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0b1120] text-slate-200 overflow-hidden">
      {/* Timeline Controls Header */}
      <div className="px-3.5 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-bold text-white uppercase tracking-wide flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Motion Timeline</span>
          </span>

          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={onTogglePlay}
              className="px-2.5 py-1 rounded bg-[#EA580C] hover:bg-orange-600 text-white font-bold inline-flex items-center gap-1"
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              type="button"
              onClick={onReplayPlayback}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1"
              title="Replay from 0.00s"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Replay</span>
            </button>
            <button
              type="button"
              onClick={onStopPlayback}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold inline-flex items-center gap-1"
              title="Stop & Reset Playhead"
            >
              <Square className="w-3 h-3" />
              <span>Stop</span>
            </button>
          </div>

          <span className="font-mono tabular-nums text-[11px] text-emerald-300 px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
            {currentSecLabel}s / {totalSecLabel}s
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
            <span>Timeline Span (s):</span>
            <input
              type="number"
              min={2}
              max={120}
              value={totalDurationSeconds}
              onChange={(e) =>
                onChangeTotalDurationSeconds(Math.max(2, Math.min(120, Number(e.target.value) || 10)))
              }
              className="w-14 px-1.5 py-1 rounded bg-slate-950 border border-slate-700 font-mono text-white"
            />
          </label>
          <button
            type="button"
            onClick={handleAutoStagger}
            className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-white inline-flex items-center gap-1"
          >
            <Wand2 className="w-3 h-3 text-[#EA580C]" />
            <span>Auto-Stagger</span>
          </button>
          {playheadMs !== null && (
            <button
              type="button"
              onClick={() => onChangePlayheadMs(null)}
              className="px-2 py-1 rounded border border-slate-700 text-[11px] text-slate-300 hover:text-white"
            >
              Exit Scrub
            </button>
          )}
        </div>
      </div>

      {/* Ruler & Layer Bars */}
      <div className="p-3 overflow-x-auto">
        <div className="min-w-[640px] space-y-1.5">
          {/* Top Ruler */}
          <div className="flex items-center gap-2">
            <div className="w-44 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Layer Track
            </div>
            <div
              ref={trackAreaRef}
              onClick={handleRulerScrub}
              className="flex-1 relative h-6 rounded bg-slate-950 border border-slate-800 cursor-pointer select-none"
            >
              {tickMarks.map((s) => {
                const leftPct = Math.min(100, ((s * 1000) / totalMs) * 100);
                return (
                  <div
                    key={s}
                    className="absolute top-0 bottom-0 border-l border-slate-700/80 pl-1 text-[10px] font-mono tabular-nums text-slate-400 flex items-center"
                    style={{ left: `${leftPct}%` }}
                  >
                    {s}s
                  </div>
                );
              })}

              {playheadMs !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-[#EA580C] z-20 pointer-events-none"
                  style={{ left: `${Math.min(100, (playheadMs / totalMs) * 100)}%` }}
                />
              )}
            </div>
          </div>

          {/* Element Timing Tracks */}
          {sortedAsc.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              Add elements to configure per-layer entry/exit timing bars.
            </p>
          ) : (
            sortedAsc.map((el) => {
              const startMs = Math.max(0, Math.min(totalMs - 200, el.animation?.startTimeMs || 0));
              const endMs =
                typeof el.animation?.endTimeMs === 'number' && el.animation.endTimeMs > 0
                  ? Math.min(totalMs, el.animation.endTimeMs)
                  : totalMs;
              const leftPct = (startMs / totalMs) * 100;
              const widthPct = Math.max(4, ((endMs - startMs) / totalMs) * 100);
              const isSelected = selectedIds.includes(el.id);

              return (
                <div
                  key={el.id}
                  onClick={() => onSelectElements([el.id])}
                  className={`flex items-center gap-2 py-0.5 rounded ${
                    isSelected ? 'bg-slate-800/70' : ''
                  }`}
                >
                  <div className="w-44 shrink-0 px-2 flex items-center justify-between gap-1 text-[11px] truncate">
                    <span className="font-semibold text-slate-200 truncate">{el.layerName}</span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0 tabular-nums">
                      {(startMs / 1000).toFixed(1)}–{(endMs / 1000).toFixed(1)}s
                    </span>
                  </div>

                  <div className="flex-1 relative h-6 rounded bg-slate-900/90 border border-slate-800">
                    {/* Timing Bar */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const w = trackAreaRef.current?.getBoundingClientRect().width || 600;
                        dragRef.current = {
                          elementId: el.id,
                          mode: 'move',
                          startClientX: e.clientX,
                          originStartMs: startMs,
                          originEndMs: endMs,
                          trackWidthPx: w,
                        };
                      }}
                      className={`absolute top-0.5 bottom-0.5 rounded flex items-center justify-between px-1.5 cursor-grab active:cursor-grabbing ${
                        isSelected
                          ? 'bg-[#EA580C] text-white'
                          : 'bg-sky-600/80 hover:bg-sky-600 text-white'
                      }`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    >
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const w = trackAreaRef.current?.getBoundingClientRect().width || 600;
                          dragRef.current = {
                            elementId: el.id,
                            mode: 'start',
                            startClientX: e.clientX,
                            originStartMs: startMs,
                            originEndMs: endMs,
                            trackWidthPx: w,
                          };
                        }}
                        title="Drag to change start time"
                        className="w-1.5 h-3.5 rounded-sm bg-white/75 cursor-ew-resize shrink-0"
                      />
                      <span className="text-[10px] font-mono truncate px-1 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 shrink-0" />
                        <span>{el.animation?.style || 'none'}</span>
                      </span>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const w = trackAreaRef.current?.getBoundingClientRect().width || 600;
                          dragRef.current = {
                            elementId: el.id,
                            mode: 'end',
                            startClientX: e.clientX,
                            originStartMs: startMs,
                            originEndMs: endMs,
                            trackWidthPx: w,
                          };
                        }}
                        title="Drag to change end time"
                        className="w-1.5 h-3.5 rounded-sm bg-white/75 cursor-ew-resize shrink-0"
                      />
                    </div>

                    {playheadMs !== null && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-[#EA580C] z-20 pointer-events-none"
                        style={{ left: `${Math.min(100, (playheadMs / totalMs) * 100)}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
