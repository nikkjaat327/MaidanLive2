import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
  Minimize2,
  Move,
  Radio,
  RefreshCw,
  Tv,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { useLiveMonitor } from '../../context/LiveMonitorContext.tsx';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';
import { LiveStreamPlayer } from '../broadcast/LiveStreamPlayer.tsx';

export function GlobalLiveMonitor() {
  const { adminUser } = useAuth();
  const location = useLocation();
  const {
    isOpen,
    minimized,
    expanded,
    selectedStreamId,
    streams,
    loadingStreams,
    closeMonitor,
    setSelectedStreamId,
    setMinimized,
    setExpanded,
    refreshStreams,
  } = useLiveMonitor();

  const liveStreams = useMemo(() => {
    const onlyLive = streams.filter((s) => s.status === 'LIVE');
    return onlyLive.length > 0 ? onlyLive : streams;
  }, [streams]);

  const activeStream = useMemo(() => {
    if (liveStreams.length === 0) return null;
    return (
      liveStreams.find((s) => String(s.id || s._id || '') === selectedStreamId) ||
      liveStreams.find((s) => s.status === 'LIVE') ||
      liveStreams[0]
    );
  }, [liveStreams, selectedStreamId]);

  const activeId = activeStream ? String(activeStream.id || activeStream._id || '') : undefined;
  const { score } = useScoreboard(isOpen && adminUser ? activeId : undefined);
  const broadcast = useMemo(
    () => (activeStream ? normalizeBroadcast(activeStream, score) : null),
    [activeStream, score]
  );

  // Draggable offset relative to bottom-right anchor
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      const maxX = Math.max(0, window.innerWidth - 360);
      const maxY = Math.max(0, window.innerHeight - 160);
      setOffset({
        x: Math.max(-maxX, Math.min(12, dragRef.current.origX + dx)),
        y: Math.max(-maxY, Math.min(12, dragRef.current.origY + dy)),
      });
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  if (!isOpen || !adminUser) return null;

  // Never render over the isolated OBS transparency browser source route
  if (location.pathname.startsWith('/broadcast/overlay/view')) return null;

  const widthClass = minimized
    ? 'w-[310px] sm:w-[340px]'
    : expanded
      ? 'w-[calc(100vw-24px)] sm:w-[560px]'
      : 'w-[calc(100vw-24px)] sm:w-[400px]';

  return (
    <aside
      aria-label="Live Video Preview Monitor"
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
      className={`fixed bottom-4 right-3 z-50 ${widthClass} rounded-xl bg-[#0F172A] text-slate-100 border border-slate-700/90 shadow-2xl overflow-hidden transition-[width] duration-200`}
    >
      {/* Draggable Monitor Header */}
      <div
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button, select, a')) return;
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: offset.x,
            origY: offset.y,
          };
        }}
        className="px-3 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2 cursor-move select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Move className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <Tv className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
          <span className="text-xs font-semibold text-white truncate">
            Live Video Preview
          </span>
          {activeStream?.status === 'LIVE' && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-[11px] font-mono font-bold text-red-400 uppercase tracking-wider shrink-0">
                LIVE
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => refreshStreams()}
            disabled={loadingStreams}
            title="Refresh live streams"
            aria-label="Refresh live streams"
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStreams ? 'animate-spin' : ''}`} />
          </button>
          {!minimized && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Compact monitor size' : 'Expand monitor size'}
              aria-label={expanded ? 'Compact monitor size' : 'Expand monitor size'}
              className="hidden sm:inline-flex p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? 'Show video preview' : 'Minimize video preview'}
            aria-label={minimized ? 'Expand monitor' : 'Minimize monitor'}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={closeMonitor}
            title="Close monitor"
            aria-label="Close monitor"
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Match Stream Selector */}
      <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center gap-2">
        <select
          value={activeId || ''}
          onChange={(e) => setSelectedStreamId(e.target.value)}
          aria-label="Select live stream for video preview"
          className="flex-1 min-w-0 min-h-[34px] px-2 text-xs font-medium bg-slate-950 text-slate-100 border border-slate-700 rounded-md"
        >
          {liveStreams.length === 0 && <option value="">No live stream running</option>}
          {liveStreams.map((s) => {
            const sid = String(s.id || s._id || '');
            const label =
              s.matchTitle ||
              [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') ||
              'Live Stream';
            return (
              <option key={sid} value={sid}>
                [{s.status}] {label}
              </option>
            );
          })}
        </select>

        {activeId && (
          <Link
            to={`/live/${activeId}`}
            title="Open full match viewer"
            className="min-h-[34px] inline-flex items-center gap-1 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 whitespace-nowrap shrink-0"
          >
            <span>Open</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Live Video Preview Stage (kept mounted when minimized so stream stays continuous) */}
      <div
        className={`relative bg-black transition-all duration-200 ${
          minimized ? 'h-0 overflow-hidden' : 'aspect-video w-full'
        }`}
      >
        {activeStream && broadcast && !activeStream.playbackLocked ? (
          <LiveStreamPlayer
            provider={broadcast.activeProvider}
            youtubeVideoId={broadcast.youtubeVideoId}
            mediamtxPlaybackUrl={broadcast.mediamtxPlaybackUrl}
            mediamtxWebrtcUrl={broadcast.mediamtxWebrtcUrl}
            title={broadcast.title}
            autoplay
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-slate-400">
            <Radio className="w-6 h-6 text-slate-600 mb-1.5" />
            <p className="text-xs font-medium text-slate-300">
              {loadingStreams
                ? 'Loading live video preview...'
                : 'No active YouTube Live or Direct Feed playback URL found for this stream.'}
            </p>
          </div>
        )}
      </div>

      {/* Live Score Footer */}
      {broadcast && (
        <div className="px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
          <div className="min-w-0 flex items-center gap-2 font-mono tabular-nums">
            <span className="font-semibold text-white truncate max-w-[115px]">
              {broadcast.teamA.shortName || broadcast.teamA.name}
            </span>
            <span className="font-bold text-[#EA580C]">{broadcast.teamA.primaryText}</span>
            <span className="text-slate-600">vs</span>
            <span className="font-semibold text-white truncate max-w-[115px]">
              {broadcast.teamB.shortName || broadcast.teamB.name}
            </span>
            <span className="font-bold text-slate-200">{broadcast.teamB.primaryText}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase whitespace-nowrap shrink-0">
            {broadcast.activeProvider === 'mediamtx' ? 'Direct Feed' : 'YouTube Live'}
          </span>
        </div>
      )}
    </aside>
  );
}
