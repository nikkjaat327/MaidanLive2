import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Play, Tv } from 'lucide-react';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';
import { useLiveMonitor } from '../../context/LiveMonitorContext.tsx';
import { useAuth } from '../../hooks/useAuth.ts';
import {
  isAdminPanelPath,
  resolveAdminEmbedPreviewTarget,
} from '../../utils/mediaPlayerUtils.ts';

interface HeaderYouTubePreviewControlProps {
  tone?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
}

/**
 * Replaces the legacy manual YouTube URL input box with an automatic Header "Preview"
 * button whenever an embedded broadcast video (YouTube or MediaMTX) is started in
 * MaidanLive. Restricted strictly to the Admin Panel.
 */
export function HeaderYouTubePreviewControl({
  tone = 'dark',
  compact = false,
  className = '',
}: HeaderYouTubePreviewControlProps) {
  const { adminUser } = useAuth();
  const location = useLocation();
  const { streams, selectedStreamId } = useLiveMonitor();
  const { youtubePreview, toggleEmbedPreview } = useBroadcastPreview();

  const isAdminPanel = Boolean(adminUser) && isAdminPanelPath(location.pathname);

  const activeTarget = useMemo(
    () => (isAdminPanel ? resolveAdminEmbedPreviewTarget(streams, selectedStreamId) : null),
    [isAdminPanel, streams, selectedStreamId]
  );

  if (!isAdminPanel || !activeTarget) {
    return null;
  }

  const isDark = tone === 'dark';
  const isOpenForTarget =
    youtubePreview.open && youtubePreview.streamId === activeTarget.streamId;

  return (
    <button
      type="button"
      onClick={() => toggleEmbedPreview(activeTarget)}
      aria-pressed={isOpenForTarget}
      aria-label={`Preview live embedded video: ${activeTarget.title}`}
      title={`Open draggable & resizable preview: ${activeTarget.title}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-semibold transition-colors cursor-pointer shrink-0 ${
        compact ? 'min-h-[34px] px-2.5 text-xs' : 'min-h-[36px] px-3 text-xs'
      } ${
        isOpenForTarget
          ? 'bg-[#EA580C] border-[#EA580C] text-white shadow-sm'
          : isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800 hover:border-slate-600'
            : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-slate-200'
      } ${className}`}
    >
      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" aria-hidden="true" />
      <Tv className="w-3.5 h-3.5 shrink-0" />
      <span>Preview</span>
      <Play className="w-3 h-3 fill-current opacity-85 shrink-0" />
    </button>
  );
}
