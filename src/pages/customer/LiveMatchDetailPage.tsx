import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { MatchHighlightData, SponsorOverlayData } from '../../types/index.ts';
import { useLiveStream } from '../../hooks/useLiveStream.ts';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { LiveBroadcastView } from '../../components/broadcast/LiveBroadcastView.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { MatchReportModal } from '../../components/engagement/MatchReportModal.tsx';

export function LiveMatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const wantsReplay = searchParams.get('mode') === 'replay';
  const urlStartParam = Number(searchParams.get('start'));

  const { stream, setStream, loading, error, switchingBanner } = useLiveStream(id);
  const { score, history, connected } = useScoreboard(id, {
    onViewerCountUpdated: (viewers, visibility) => {
      setStream((prev) =>
        prev
          ? {
              ...prev,
              activeViewers: viewers,
              viewerCountVisibility: (visibility as any) || prev.viewerCountVisibility,
            }
          : prev
      );
    },
  });

  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [sponsorOverlays, setSponsorOverlays] = useState<SponsorOverlayData[]>([]);
  const [startSeconds, setStartSeconds] = useState<number | null>(
    Number.isFinite(urlStartParam) && urlStartParam > 0 ? Math.floor(urlStartParam) : null
  );
  const [jumpKey, setJumpKey] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  const sessionKeyRef = useRef<string>('');

  const loadHighlightsAndSponsors = useCallback(async () => {
    if (!id) return;
    try {
      const [hl, overlays] = await Promise.all([
        engagementService.listHighlights(id),
        platformOpsService.listLiveSponsorOverlays(id),
      ]);
      setHighlights(hl);
      setSponsorOverlays(overlays);
    } catch {
      // Non-blocking
    }
  }, [id]);

  useEffect(() => {
    loadHighlightsAndSponsors();
  }, [loadHighlightsAndSponsors]);

  useEffect(() => {
    if (!id) return;
    const socket = getSocketClient();
    socket.emit('stream:join', id);

    const refreshHighlights = (payload: { streamId?: string }) => {
      if (payload?.streamId === id) {
        engagementService.listHighlights(id).then(setHighlights).catch(() => {});
      }
    };
    const refreshSponsors = (payload: { streamId?: string }) => {
      if (payload?.streamId === id) {
        platformOpsService.listLiveSponsorOverlays(id).then(setSponsorOverlays).catch(() => {});
      }
    };

    socket.on('highlight:created', refreshHighlights);
    socket.on('highlight:updated', refreshHighlights);
    socket.on('highlight:deleted', refreshHighlights);
    socket.on('sponsor:updated', refreshSponsors);

    return () => {
      socket.off('highlight:created', refreshHighlights);
      socket.off('highlight:updated', refreshHighlights);
      socket.off('highlight:deleted', refreshHighlights);
      socket.off('sponsor:updated', refreshSponsors);
    };
  }, [id]);

  // Platform viewer session tracking (debounced once per mount + 20s watch heartbeat)
  useEffect(() => {
    if (!id || !stream) return;
    if (!sessionKeyRef.current) {
      sessionKeyRef.current = `ml_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    const mode: 'LIVE' | 'REPLAY' | 'PREVIEW' =
      wantsReplay && stream.replayPublished
        ? 'REPLAY'
        : stream.status === 'LIVE'
          ? 'LIVE'
          : 'PREVIEW';

    platformOpsService
      .trackViewerSession({
        liveStreamId: id,
        sessionKey: sessionKeyRef.current,
        mode,
        watchSecondsDelta: 0,
      })
      .catch(() => {});

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        platformOpsService
          .trackViewerSession({
            liveStreamId: id,
            sessionKey: sessionKeyRef.current,
            mode,
            watchSecondsDelta: 20,
          })
          .catch(() => {});
      }
    }, 20000);

    return () => window.clearInterval(timer);
  }, [id, stream?.id, stream?.status, stream?.replayPublished, wantsReplay]);

  function handleJumpHighlight(sec: number) {
    setStartSeconds(sec);
    setJumpKey((k) => k + 1);
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-44" />
        <div className="aspect-video bg-slate-200 rounded-xl" />
        <div className="h-24 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <FeedbackBanner type="error" message={error || 'Live stream not found.'} />
        <Link
          to="/live"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Live Streams</span>
        </Link>
      </div>
    );
  }

  const displayTitle =
    stream.matchTitle ||
    (stream.teamAName && stream.teamBName
      ? `${stream.teamAName} vs ${stream.teamBName}`
      : stream.teamAName || stream.teamBName || 'MaidanLive Match Broadcast');

  return (
    <div className="max-w-6xl mx-auto px-0 sm:px-6 py-0 sm:py-6 space-y-4">
      <div className="px-4 sm:px-0 pt-3 sm:pt-0 flex items-center justify-between gap-3">
        <Link
          to="/live"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Broadcasts</span>
        </Link>
      </div>

      <LiveBroadcastView
        stream={stream}
        score={score}
        history={history}
        connected={connected}
        highlights={highlights}
        sponsorOverlays={sponsorOverlays}
        wantsReplay={wantsReplay}
        startSeconds={startSeconds}
        jumpKey={jumpKey}
        switchingBanner={switchingBanner}
        onJumpHighlight={handleJumpHighlight}
        onOpenReport={() => setReportOpen(true)}
      />

      <MatchReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        streamId={stream.id}
        matchTitle={displayTitle}
      />
    </div>
  );
}
