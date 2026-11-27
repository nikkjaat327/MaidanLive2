import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  FixtureData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
  SponsorData,
  SponsorOverlayData,
} from '../../types/index.ts';
import { useLiveStream } from '../../hooks/useLiveStream.ts';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import {
  liveStreamService,
  type MatchDetailBundleResponse,
} from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { LiveBroadcastView } from '../../components/broadcast/LiveBroadcastView.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { MatchReportModal } from '../../components/engagement/MatchReportModal.tsx';
import { recentlyWatchedStore } from '../../utils/recentlyWatched.ts';
import {
  getCachedViewerData,
  pickFresherScore,
  setCachedViewerData,
} from '../../utils/viewerCache.ts';

export function LiveMatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const wantsReplay = searchParams.get('mode') === 'replay';
  const urlStartParam = Number(searchParams.get('start'));

  const { customerUser, adminUser, customerLoading, adminLoading } = useAuth();
  const isAuthenticated = Boolean(customerUser || adminUser);
  const authLoading = customerLoading || adminLoading;
  const authKey = `${customerUser?.id || ''}:${adminUser?.id || ''}`;

  const { stream, setStream, switchingBanner } = useLiveStream(id, authKey, {
    skipInitialFetch: true,
  });
  const {
    score,
    setScore,
    history,
    setHistory,
    setLoading: setScoreLoading,
    connected,
  } = useScoreboard(id, {
    skipInitialFetch: true,
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

  const [detailLoading, setDetailLoading] = useState<boolean>(Boolean(id));
  const [detailError, setDetailError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [sponsorOverlays, setSponsorOverlays] = useState<SponsorOverlayData[]>([]);
  const [publicSponsors, setPublicSponsors] = useState<SponsorData[]>([]);
  const [matchStats, setMatchStats] = useState<PlayerMatchStatRecord[]>([]);
  const [lineupPlayers, setLineupPlayers] = useState<{ teamA: PlayerData[]; teamB: PlayerData[] }>({
    teamA: [],
    teamB: [],
  });
  const [upcomingFixtures, setUpcomingFixtures] = useState<FixtureData[]>([]);
  const [startSeconds, setStartSeconds] = useState<number | null>(
    Number.isFinite(urlStartParam) && urlStartParam > 0 ? Math.floor(urlStartParam) : null
  );
  const [jumpKey, setJumpKey] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  const sessionKeyRef = useRef<string>('');
  const detailCacheKey = id ? `match_detail_${id}_${isAuthenticated ? 'auth' : 'pub'}` : '';

  const applyBundle = useCallback(
    (bundle: MatchDetailBundleResponse, fromCache = false) => {
      setStream((prev) => {
        if (!prev) return bundle.stream;
        return fromCache ? prev : { ...prev, ...bundle.stream };
      });
      setScore((prev) => pickFresherScore(prev, bundle.score));
      setHistory((prev) => (fromCache && prev.length > 0 ? prev : bundle.history || []));
      setHighlights(bundle.highlights || []);
      setSponsorOverlays(bundle.sponsorOverlays || []);
      setPublicSponsors(bundle.publicSponsors || []);
      setMatchStats(bundle.playerStats || []);
      setLineupPlayers(bundle.lineupPlayers || { teamA: [], teamB: [] });
      setUpcomingFixtures(bundle.upcomingFixtures || []);
      setScoreLoading(false);
    },
    [setStream, setScore, setHistory, setScoreLoading]
  );

  useEffect(() => {
    if (!id) {
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetailError(null);

    const cached = detailCacheKey
      ? getCachedViewerData<MatchDetailBundleResponse>(detailCacheKey, 3 * 60 * 1000)
      : null;
    if (cached && cached.stream) {
      applyBundle(cached, true);
      setDetailLoading(false);
    } else {
      setDetailLoading(true);
    }

    liveStreamService
      .getMatchDetail(id)
      .then((bundle) => {
        if (cancelled) return;
        applyBundle(bundle, false);
        setDetailLoading(false);
        if (detailCacheKey) {
          setCachedViewerData(detailCacheKey, bundle);
        }
        (bundle.publicSponsors || []).forEach((sp) => platformOpsService.trackSponsorImpression(sp.id));
      })
      .catch((err) => {
        if (cancelled) return;
        if (!cached) {
          setDetailError(extractApiError(err, 'Unable to load match stream details.'));
        }
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, authKey, detailCacheKey, applyBundle]);

  useEffect(() => {
    if (!id) return;
    const socket = getSocketClient();

    const refreshHighlights = (payload: { streamId?: string }) => {
      if (payload?.streamId === id && isAuthenticated) {
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
  }, [id, isAuthenticated]);

  useEffect(() => {
    if (!stream?.id) return;
    const title =
      stream.matchTitle ||
      (stream.teamAName && stream.teamBName
        ? `${stream.teamAName} vs ${stream.teamBName}`
        : 'Live Match');
    recentlyWatchedStore.recordMatch({
      id: stream.id,
      title,
      teamAName: stream.teamAName || 'Team A',
      teamBName: stream.teamBName || 'Team B',
      sport: stream.gameName || score?.sportType || 'Other',
      status: stream.status,
      tournamentName: stream.tournamentName,
    });
  }, [stream?.id, stream?.matchTitle, stream?.teamAName, stream?.teamBName, stream?.gameName, stream?.status, stream?.tournamentName, score?.sportType]);

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
    if (!isAuthenticated) return;
    setStartSeconds(sec);
    setJumpKey((k) => k + 1);
  }

  if (detailLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-44" />
        <div className="aspect-video bg-slate-200 rounded-xl" />
        <div className="h-24 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (detailError || !stream) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <FeedbackBanner type="error" message={detailError || 'Live stream not found.'} />
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
        prefetchedDetailBundle
        initialPublicSponsors={publicSponsors}
        initialMatchStats={matchStats}
        initialLineupPlayers={lineupPlayers}
        initialUpcomingFixtures={upcomingFixtures}
        wantsReplay={wantsReplay}
        startSeconds={startSeconds}
        jumpKey={jumpKey}
        switchingBanner={switchingBanner}
        isAuthenticated={isAuthenticated}
        authLoading={authLoading}
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
