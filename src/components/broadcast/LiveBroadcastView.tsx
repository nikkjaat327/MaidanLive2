import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BellPlus,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  MapPin,
  Maximize2,
  Minimize2,
  Radio,
  Sparkles,
  Sun,
  Trophy,
  Users,
  Video,
  VideoOff,
  Wifi,
} from 'lucide-react';
import {
  FixtureData,
  LiveScoreData,
  LiveStreamData,
  MatchHighlightData,
  PlayerData,
  PlayerMatchStatRecord,
  ScoreHistoryItem,
  SponsorData,
  SponsorOverlayData,
  VenueData,
} from '../../types/index.ts';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { useAuth } from '../../hooks/useAuth.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { tournamentWorkflowService } from '../../services/tournaments/tournamentWorkflowService.ts';
import { LiveStreamPlayer, type PlayerPlaybackSignal } from './LiveStreamPlayer.tsx';
import { StreamStatusIndicator } from './StreamStatusIndicator.tsx';
import { BroadcastScoreboard } from './BroadcastScoreboard.tsx';
import { BroadcastSportStrip } from './BroadcastSportStrip.tsx';
import { BroadcastResultBar } from './BroadcastResultBar.tsx';
import { LiveCommentaryFeed } from './LiveCommentaryFeed.tsx';
import { ScoreboardSummary } from '../scoreboard/ScoreboardSummary.tsx';
import { MatchStatusBadge } from '../common/MatchStatusBadge.tsx';
import { StartingSoonGraphic } from '../streaming/StartingSoonGraphic.tsx';
import { SponsorOverlayBanner } from '../streaming/SponsorOverlayBanner.tsx';
import { LiveChatAndPollsPanel } from '../engagement/LiveChatAndPollsPanel.tsx';
import { ShareButton } from '../common/ShareButton.tsx';
import { TeamAvatar } from '../common/TeamAvatar.tsx';
import { formatTimestamp } from '../scoreboard/MatchHighlightsManager.tsx';

interface LiveBroadcastViewProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  history: ScoreHistoryItem[];
  connected: boolean;
  highlights: MatchHighlightData[];
  sponsorOverlays: SponsorOverlayData[];
  wantsReplay?: boolean;
  startSeconds?: number | null;
  jumpKey?: number;
  switchingBanner?: boolean;
  onJumpHighlight: (seconds: number) => void;
  onOpenReport: () => void;
}

function canUseElementFullscreen(el: HTMLElement | null): boolean {
  if (!el) return false;
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  const node = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const enabled =
    typeof document.fullscreenEnabled === 'boolean'
      ? document.fullscreenEnabled
      : Boolean(doc.webkitFullscreenEnabled);
  return (
    enabled &&
    (typeof el.requestFullscreen === 'function' || typeof node.webkitRequestFullscreen === 'function')
  );
}

function buildGoogleMapsUrl(venue: VenueData | null, fallbackLocation?: string): string | null {
  if (venue && typeof venue.latitude === 'number' && typeof venue.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`;
  }
  const query = venue
    ? [venue.name, venue.address, venue.city, venue.state].filter(Boolean).join(', ')
    : fallbackLocation?.trim();
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

type DetailTab = 'commentary' | 'stats' | 'lineups' | 'chat' | 'highlights' | 'fixtures' | 'info';

export function LiveBroadcastView({
  stream,
  score,
  history,
  connected,
  highlights,
  sponsorOverlays,
  wantsReplay = false,
  startSeconds = null,
  jumpKey = 0,
  switchingBanner = false,
  onJumpHighlight,
  onOpenReport,
}: LiveBroadcastViewProps) {
  const { t } = useLanguage();
  const { customerUser, adminUser, updateCustomerUser } = useAuth();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const broadcast = useMemo(() => normalizeBroadcast(stream, score), [stream, score]);
  const storageKey = `maidanlive_sb_vis_${broadcast.id || broadcast.youtubeVideoId}`;

  const [scoreboardVisible, setScoreboardVisible] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') return true;
      if (saved === 'false') return false;
    } catch {
      // Ignore storage error
    }
    return broadcast.scoreboardVisibleByDefault;
  });

  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isExpandedFallback, setIsExpandedFallback] = useState(false);
  const [showUpcomingPreview, setShowUpcomingPreview] = useState(false);
  const [lowDataMode, setLowDataMode] = useState(false);
  const [videoDisabled, setVideoDisabled] = useState(false);
  const [playerSignal, setPlayerSignal] = useState<PlayerPlaybackSignal>('ok');
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('commentary');
  const [publicSponsors, setPublicSponsors] = useState<SponsorData[]>([]);
  const [matchStats, setMatchStats] = useState<PlayerMatchStatRecord[]>([]);
  const [lineupPlayers, setLineupPlayers] = useState<{ teamA: PlayerData[]; teamB: PlayerData[] }>({
    teamA: [],
    teamB: [],
  });
  const [upcomingFixtures, setUpcomingFixtures] = useState<FixtureData[]>([]);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [followFeedback, setFollowFeedback] = useState<string | null>(null);

  const isFullscreenActive = isNativeFullscreen || isExpandedFallback;
  const activeVideoId =
    wantsReplay && broadcast.replayPublished && broadcast.replayVideoId
      ? broadcast.replayVideoId
      : broadcast.youtubeVideoId;
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'true') setScoreboardVisible(true);
      else if (saved === 'false') setScoreboardVisible(false);
      else setScoreboardVisible(broadcast.scoreboardVisibleByDefault);
    } catch {
      setScoreboardVisible(broadcast.scoreboardVisibleByDefault);
    }
  }, [storageKey, broadcast.scoreboardVisibleByDefault]);

  // Sync documentElement fullscreen attribute for nav hiding + body scroll lock
  useEffect(() => {
    if (isFullscreenActive) {
      document.documentElement.dataset.broadcastFullscreen = 'true';
    } else {
      delete document.documentElement.dataset.broadcastFullscreen;
    }
    return () => {
      delete document.documentElement.dataset.broadcastFullscreen;
    };
  }, [isFullscreenActive]);

  // Listen to native fullscreenchange
  useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const fsEl = document.fullscreenElement || doc.webkitFullscreenElement || null;
      const active = Boolean(fsEl && fsEl === stageRef.current);
      setIsNativeFullscreen(active);
      if (!active) {
        try {
          (screen.orientation as any)?.unlock?.();
        } catch {
          // Ignore unsupported unlock
        }
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  // Esc key closes CSS fallback fullscreen
  useEffect(() => {
    if (!isExpandedFallback) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpandedFallback(false);
        try {
          (screen.orientation as any)?.unlock?.();
        } catch {
          // Ignore
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExpandedFallback]);

  // Load live_match sponsors, match player stats, lineups, and upcoming fixtures
  useEffect(() => {
    if (!broadcast.id) return;
    platformOpsService
      .listPublicSponsors({
        placement: 'live_match',
        liveStreamId: broadcast.id,
        tournamentId: broadcast.tournamentId || undefined,
      })
      .then((list) => {
        setPublicSponsors(list);
        list.forEach((sp) => platformOpsService.trackSponsorImpression(sp.id));
      })
      .catch(() => {});

    platformOpsService
      .listMatchPlayerStats(broadcast.id)
      .then(setMatchStats)
      .catch(() => setMatchStats([]));

    if (broadcast.teamA.id || broadcast.teamB.id) {
      Promise.all([
        broadcast.teamA.id
          ? entityService.listPlayers({ teamId: broadcast.teamA.id }).catch(() => [])
          : Promise.resolve([]),
        broadcast.teamB.id
          ? entityService.listPlayers({ teamId: broadcast.teamB.id }).catch(() => [])
          : Promise.resolve([]),
      ]).then(([teamA, teamB]) => setLineupPlayers({ teamA, teamB }));
    }

    if (broadcast.tournamentId) {
      tournamentWorkflowService
        .listFixtures(broadcast.tournamentId)
        .then((fxList) =>
          setUpcomingFixtures(
            fxList.filter((f) => f.status === 'SCHEDULED' || f.status === 'LIVE').slice(0, 6)
          )
        )
        .catch(() => setUpcomingFixtures([]));
    }
  }, [broadcast.id, broadcast.tournamentId, broadcast.teamA.id, broadcast.teamB.id]);

  // Screen Wake Lock lifecycle
  const toggleWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return;
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
      setWakeLockActive(false);
      return;
    }
    try {
      const sentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener?.('release', () => {
        wakeLockRef.current = null;
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }, [wakeLockSupported]);

  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, []);

  const toggleScoreboard = useCallback(() => {
    setScoreboardVisible((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(storageKey, String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, [storageKey]);

  const toggleFullscreen = useCallback(async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (isNativeFullscreen || doc.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } catch {
        setIsNativeFullscreen(false);
      }
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        // Ignore
      }
      return;
    }

    if (isExpandedFallback) {
      setIsExpandedFallback(false);
      try {
        (screen.orientation as any)?.unlock?.();
      } catch {
        // Ignore
      }
      return;
    }

    const el = stageRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;

    if (canUseElementFullscreen(el) && el) {
      try {
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        try {
          await (screen.orientation as any)?.lock?.('landscape');
        } catch {
          // Safe fallback if browser does not support orientation lock
        }
        return;
      } catch {
        // Fall through to CSS fixed fullscreen fallback (e.g. iOS Safari)
      }
    }

    setIsExpandedFallback(true);
    try {
      await (screen.orientation as any)?.lock?.('landscape');
    } catch {
      // Safe fallback
    }
  }, [isNativeFullscreen, isExpandedFallback]);

  async function handleToggleFollow(teamId: string, teamName: string) {
    if (!customerUser) {
      setFollowFeedback('Sign in on the Customer Portal to follow teams.');
      return;
    }
    const followedSet = new Set(customerUser.followedTeamIds || []);
    const isFollowing = followedSet.has(teamId);
    try {
      setFollowBusyId(teamId);
      const res = isFollowing
        ? await engagementService.unfollowTeam(teamId)
        : await engagementService.followTeam(teamId);
      updateCustomerUser({ ...customerUser, followedTeamIds: res.followedTeamIds });
      setFollowFeedback(isFollowing ? `Unfollowed ${teamName}.` : `Following ${teamName}!`);
      window.setTimeout(() => setFollowFeedback(null), 2500);
    } catch {
      setFollowFeedback('Unable to update follow status.');
    } finally {
      setFollowBusyId(null);
    }
  }

  const venueObj = typeof stream.venueId === 'object' && stream.venueId ? stream.venueId : null;
  const mapsUrl = buildGoogleMapsUrl(venueObj, stream.location);
  const followedIds = new Set(customerUser?.followedTeamIds || []);

  // Show viewer count ONLY if public or signed-in admin
  const canSeeViewers =
    typeof broadcast.activeViewers === 'number' &&
    (broadcast.viewerCountVisibility === 'public' || Boolean(adminUser));

  // Merge deduplicated match partners (overlays + placement sponsors)
  const partnerSponsors: SponsorData[] = [];
  const seenSp = new Set<string>();
  for (const ov of sponsorOverlays) {
    const sp = ov.sponsor || (typeof ov.sponsorId === 'object' ? ov.sponsorId : null);
    if (sp && sp.id && !seenSp.has(sp.id)) {
      seenSp.add(sp.id);
      partnerSponsors.push(sp);
    }
  }
  for (const sp of publicSponsors) {
    if (sp.id && !seenSp.has(sp.id)) {
      seenSp.add(sp.id);
      partnerSponsors.push(sp);
    }
  }

  const canQuickScore = Boolean(
    adminUser &&
      (adminUser.role === 'SUPER_ADMIN' ||
        adminUser.role === 'ADMIN' ||
        adminUser.permissions?.manageScores ||
        stream.authorizedScorerId === adminUser.id ||
        stream.backupScorerId === adminUser.id)
  );

  return (
    <div className="space-y-4">
      {/* 1. PERSISTENT VIDEO STAGE (NEVER REMOUNTS ON ORIENTATION / FULLSCREEN / SCORE TOGGLE) */}
      <div className="bg-slate-950 sm:rounded-xl overflow-hidden border border-slate-800 shadow-lg">
        <div
          ref={stageRef}
          className={
            isExpandedFallback
              ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
              : isNativeFullscreen
                ? 'relative w-full h-full bg-black flex items-center justify-center'
                : 'relative w-full aspect-video bg-black'
          }
        >
          <div className="relative w-full h-full">
            <LiveStreamPlayer
              provider={wantsReplay && broadcast.replayPublished ? 'youtube' : broadcast.activeProvider}
              youtubeVideoId={activeVideoId}
              mediamtxPlaybackUrl={broadcast.mediamtxPlaybackUrl}
              mediamtxWebrtcUrl={broadcast.mediamtxWebrtcUrl}
              title={broadcast.title}
              startSeconds={startSeconds}
              jumpKey={jumpKey}
              lowDataMode={lowDataMode}
              videoDisabled={videoDisabled}
              onEnableVideo={() => setVideoDisabled(false)}
              switchingBanner={switchingBanner}
              onPlaybackHealthChange={setPlayerSignal}
            />

            {broadcast.status === 'UPCOMING' && !showUpcomingPreview && !videoDisabled && (
              <StartingSoonGraphic
                stream={stream}
                onShowPreview={() => setShowUpcomingPreview(true)}
              />
            )}

            {/* Top-Left Live / Viewer / Stream Connectivity Indicator */}
            <div className="pointer-events-none absolute top-2.5 left-2.5 z-30 flex flex-wrap items-center gap-1.5">
              <MatchStatusBadge stream={stream} score={score} dark compact />
              {canSeeViewers && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 border border-white/15 text-white font-mono text-[10px] font-semibold tabular-nums backdrop-blur-md">
                  <Users className="w-3 h-3 text-emerald-400" />
                  <span>{broadcast.activeViewers}</span>
                </span>
              )}
              <StreamStatusIndicator
                stream={stream}
                socketConnected={connected}
                playerSignal={playerSignal}
                dark
              />
            </div>

            {/* Top-Right Viewer Controls */}
            <div className="pointer-events-none absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
              {wakeLockSupported && (
                <button
                  type="button"
                  onClick={toggleWakeLock}
                  title="Keep screen awake while watching"
                  aria-pressed={wakeLockActive}
                  className={`pointer-events-auto min-h-[34px] inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border backdrop-blur-md transition cursor-pointer ${
                    wakeLockActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
                  }`}
                >
                  <Sun className="w-3 h-3" />
                  <span className="hidden md:inline">AWAKE</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setVideoDisabled((v) => !v)}
                title="Disable video and retain live scores only"
                aria-pressed={videoDisabled}
                className={`pointer-events-auto min-h-[34px] inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border backdrop-blur-md transition cursor-pointer ${
                  videoDisabled
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
                }`}
              >
                {videoDisabled ? <Video className="w-3 h-3" /> : <VideoOff className="w-3 h-3" />}
                <span className="hidden sm:inline">{videoDisabled ? 'VIDEO ON' : 'SCORE ONLY'}</span>
              </button>

              <button
                type="button"
                onClick={() => setLowDataMode((v) => !v)}
                title="Toggle Low-Data Mode"
                className={`pointer-events-auto min-h-[34px] inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border backdrop-blur-md transition cursor-pointer ${
                  lowDataMode
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
                }`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">LOW DATA</span>
              </button>

              <button
                type="button"
                onClick={toggleScoreboard}
                aria-pressed={scoreboardVisible}
                className="pointer-events-auto min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md cursor-pointer"
              >
                {scoreboardVisible ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                    <span>{t('broadcast.hideScore')}</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-[#EA580C]" />
                    <span>{t('broadcast.score')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreenActive ? 'Exit fullscreen' : 'Broadcast fullscreen'}
                className="pointer-events-auto min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-950/85 hover:bg-slate-900 text-white text-[11px] font-semibold border border-white/15 backdrop-blur-md cursor-pointer"
              >
                {isFullscreenActive ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden sm:inline">{t('broadcast.exitFullscreen')}</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden sm:inline">{t('broadcast.fullscreen')}</span>
                  </>
                )}
              </button>
            </div>

            {/* Fullscreen Scoreboard Overlay */}
            {isFullscreenActive && scoreboardVisible && (
              <div className="pointer-events-none absolute top-14 left-3 right-3 sm:left-6 sm:right-6 z-25 flex justify-center">
                <div className="pointer-events-auto w-full max-w-2xl">
                  <BroadcastScoreboard broadcast={broadcast} compact />
                </div>
              </div>
            )}

            {/* Sponsor Overlay Strip */}
            {sponsorOverlays.length > 0 && (
              <div className="pointer-events-none absolute bottom-12 right-2.5 z-20 max-w-[75%] flex justify-end">
                <SponsorOverlayBanner overlays={sponsorOverlays} />
              </div>
            )}
          </div>
        </div>

        {/* Footer Strip below stage */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-slate-900 text-[11px] text-slate-300 border-t border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">
              {broadcast.activeProvider === 'mediamtx'
                ? 'Streaming via MaidanLive Direct Feed (Low-Latency HLS / WebRTC).'
                : 'Adaptive YouTube Live playback · Use Fullscreen for live scoreboard overlay.'}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {canQuickScore && (
              <Link
                to={`/admin/scoreboard/${broadcast.id}`}
                className="text-orange-400 hover:text-orange-300 font-semibold whitespace-nowrap"
              >
                Open Scorer Console
              </Link>
            )}
            {activeVideoId && (
              <a
                href={`https://www.youtube.com/watch?v=${activeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-white hover:text-orange-400 font-semibold whitespace-nowrap"
              >
                <span>Watch on YouTube</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 2. PORTRAIT / DEFAULT HIERARCHY: SCOREBOARD STRIP -> SPORT STRIP -> SUMMARY -> RESULT BAR */}
      <div className="px-3 sm:px-0 space-y-3">
        {scoreboardVisible && <BroadcastScoreboard broadcast={broadcast} />}
        <BroadcastSportStrip broadcast={broadcast} />
        <ScoreboardSummary stream={stream} score={score} variant="detail" />
        <BroadcastResultBar broadcast={broadcast} />

        {/* Match Header & Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <MatchStatusBadge stream={stream} score={score} />
                <span className="font-bold text-[#EA580C] uppercase tracking-wide">
                  {broadcast.sport}
                </span>
                {broadcast.tournamentName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Link
                      to={broadcast.tournamentId ? `/tournaments/${broadcast.tournamentId}` : '/tournaments'}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-[#EA580C]"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-500" />
                      <span>{broadcast.tournamentName}</span>
                    </Link>
                  </>
                )}
                {broadcast.roundName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{broadcast.roundName}</span>
                  </>
                )}
              </div>
              <h1 className="font-display text-lg sm:text-2xl font-bold text-slate-900">
                {broadcast.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <ShareButton
                title={broadcast.title}
                text={`Watch ${broadcast.sport} live on MaidanLive`}
                compact
                shareCard={
                  broadcast.resultDeclared
                    ? {
                        type: 'MATCH_RESULT',
                        title: broadcast.title,
                        sport: broadcast.sport,
                        tournamentName: broadcast.tournamentName,
                        resultText: broadcast.resultBannerText || 'Match Completed',
                        winnerName: broadcast.winnerName,
                        mvpName: broadcast.mvpName,
                        teamAName: broadcast.teamA.name,
                        teamBName: broadcast.teamB.name,
                        teamAScore: broadcast.teamA.primaryText,
                        teamBScore: broadcast.teamB.primaryText,
                        teamASecondary: broadcast.teamA.secondaryText,
                        teamBSecondary: broadcast.teamB.secondaryText,
                      }
                    : {
                        type: 'LIVE_SCORE',
                        title: broadcast.title,
                        sport: broadcast.sport,
                        tournamentName: broadcast.tournamentName,
                        statusLabel: broadcast.centerMeta.statusLabel,
                        teamAName: broadcast.teamA.name,
                        teamBName: broadcast.teamB.name,
                        teamAScore: broadcast.teamA.primaryText,
                        teamBScore: broadcast.teamB.primaryText,
                        teamASecondary: broadcast.teamA.secondaryText,
                        teamBSecondary: broadcast.teamB.secondaryText,
                        venueName: broadcast.venueName,
                      }
                }
              />
              <button
                type="button"
                onClick={onOpenReport}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Flag className="w-3.5 h-3.5 text-red-600" />
                <span>Report</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {broadcast.venueName && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{broadcast.venueName}</span>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-[#EA580C] font-semibold hover:underline ml-1"
                  >
                    Map <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </span>
            )}
            {broadcast.matchDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(broadcast.matchDate).toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>

        {/* 3. MATCH CENTER TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'commentary' as const, label: `Commentary (${history.length})` },
            { id: 'stats' as const, label: `Player Stats (${matchStats.length})` },
            {
              id: 'lineups' as const,
              label: `Lineups (${lineupPlayers.teamA.length + lineupPlayers.teamB.length})`,
            },
            { id: 'chat' as const, label: 'Live Chat & Polls' },
            ...(broadcast.highlightsEnabled && highlights.length > 0
              ? [{ id: 'highlights' as const, label: `Highlights (${highlights.length})` }]
              : []),
            ...(upcomingFixtures.length > 0
              ? [{ id: 'fixtures' as const, label: `Upcoming (${upcomingFixtures.length})` }]
              : []),
            { id: 'info' as const, label: 'Teams & Partners' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'commentary' && <LiveCommentaryFeed history={history} />}

        {activeTab === 'stats' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Match Player Statistics
            </h2>
            {matchStats.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">
                No verified player statistics recorded for this match yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-3">Player</th>
                      <th className="py-2.5 px-3">Team</th>
                      {broadcast.sport === 'Cricket' && (
                        <>
                          <th className="py-2.5 px-3 font-mono">Runs</th>
                          <th className="py-2.5 px-3 font-mono">Balls</th>
                          <th className="py-2.5 px-3 font-mono">4s/6s</th>
                          <th className="py-2.5 px-3 font-mono">Wkts</th>
                        </>
                      )}
                      {broadcast.sport === 'Kabaddi' && (
                        <>
                          <th className="py-2.5 px-3 font-mono">Raid</th>
                          <th className="py-2.5 px-3 font-mono">Tackle</th>
                          <th className="py-2.5 px-3 font-mono">Bonus</th>
                        </>
                      )}
                      {broadcast.sport === 'Football' && (
                        <>
                          <th className="py-2.5 px-3 font-mono">Goals</th>
                          <th className="py-2.5 px-3 font-mono">Assists</th>
                          <th className="py-2.5 px-3 font-mono">Cards</th>
                        </>
                      )}
                      {broadcast.sport === 'Volleyball' && (
                        <>
                          <th className="py-2.5 px-3 font-mono">Attack</th>
                          <th className="py-2.5 px-3 font-mono">Block</th>
                          <th className="py-2.5 px-3 font-mono">Aces</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchStats.map((st) => {
                      const pObj = typeof st.playerId === 'object' && st.playerId ? st.playerId : null;
                      const tObj = typeof st.teamId === 'object' && st.teamId ? st.teamId : null;
                      const pId = pObj?._id || (typeof st.playerId === 'string' ? st.playerId : '');
                      return (
                        <tr key={st.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {pId ? (
                              <Link to={`/players/${pId}`} className="hover:text-[#EA580C]">
                                {pObj?.name || 'Player'}
                              </Link>
                            ) : (
                              <span>{pObj?.name || 'Player'}</span>
                            )}
                            {st.isMvp && (
                              <span className="ml-1.5 text-[10px] font-bold text-amber-700">
                                POTM
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {tObj?.shortName || tObj?.name || '—'}
                          </td>
                          {broadcast.sport === 'Cricket' && (
                            <>
                              <td className="py-2.5 px-3 font-mono tabular-nums font-bold">{st.runs}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.ballsFaced}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">
                                {st.fours}/{st.sixes}
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.wickets}</td>
                            </>
                          )}
                          {broadcast.sport === 'Kabaddi' && (
                            <>
                              <td className="py-2.5 px-3 font-mono tabular-nums font-bold">{st.raidPoints}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.tacklePoints}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.bonusPoints}</td>
                            </>
                          )}
                          {broadcast.sport === 'Football' && (
                            <>
                              <td className="py-2.5 px-3 font-mono tabular-nums font-bold">{st.goals}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.assists}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">
                                Y:{st.yellowCards} R:{st.redCards}
                              </td>
                            </>
                          )}
                          {broadcast.sport === 'Volleyball' && (
                            <>
                              <td className="py-2.5 px-3 font-mono tabular-nums font-bold">{st.attackPoints}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.blockPoints}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">{st.serveAces}</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lineups' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { team: broadcast.teamA, roster: lineupPlayers.teamA },
              { team: broadcast.teamB, roster: lineupPlayers.teamB },
            ].map((side, idx) => (
              <div
                key={side.team.id || idx}
                className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2.5 border-b border-slate-100 pb-2.5">
                  <TeamAvatar name={side.team.name} logoUrl={side.team.logoUrl} size="sm" />
                  <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                    {side.team.name}
                  </h3>
                  <span className="ml-auto text-xs text-slate-500 font-mono">
                    {side.roster.length} players
                  </span>
                </div>
                {side.roster.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">Squad list not published yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {side.roster.map((p) => (
                      <Link
                        key={p.id}
                        to={`/players/${p.id}`}
                        className="py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 px-1 rounded"
                      >
                        <span className="font-medium text-slate-900 truncate">
                          {p.jerseyNumber ? `#${p.jerseyNumber} ` : ''}
                          {p.name}
                        </span>
                        <span className="text-slate-500 shrink-0">{p.role || 'Player'}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'fixtures' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900">
                Tournament Schedule
              </h2>
              {broadcast.tournamentId && (
                <Link
                  to={`/tournaments/${broadcast.tournamentId}`}
                  className="text-xs font-semibold text-[#EA580C] hover:underline"
                >
                  Full Tournament
                </Link>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {upcomingFixtures.map((fx) => (
                <div key={fx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {fx.teamAName || 'TBD'} vs {fx.teamBName || 'TBD'}
                    </p>
                    <p className="text-slate-500 mt-0.5">
                      {fx.roundName || `Round ${fx.roundNumber}`}
                      {fx.scheduledAt ? ` · ${new Date(fx.scheduledAt).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-600 shrink-0">{fx.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <LiveChatAndPollsPanel streamId={broadcast.id} chatEnabled={broadcast.chatEnabled} />
        )}

        {activeTab === 'highlights' && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#EA580C]" />
                <span>Key Match Moments</span>
              </h2>
              <span className="text-xs text-slate-500 font-mono">{highlights.length} clips</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {highlights.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onJumpHighlight(h.videoTimestampSeconds)}
                  className="min-h-[40px] inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-xs transition-colors"
                >
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px]">
                    <Clock className="w-3 h-3 text-orange-400" />
                    {formatTimestamp(h.videoTimestampSeconds)}
                  </span>
                  <span className="font-semibold text-slate-900">{h.eventType}</span>
                  {h.playerName && <span className="text-slate-600">({h.playerName})</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="space-y-4">
            {followFeedback && (
              <div className="p-2.5 rounded-lg bg-slate-900 text-white text-xs">{followFeedback}</div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="font-display text-sm font-bold text-slate-900">Participating Teams</h2>
              <div className="flex flex-wrap gap-3">
                {[broadcast.teamA, broadcast.teamB].map((tm, i) => (
                  <div
                    key={tm.id || tm.name || i}
                    className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <TeamAvatar name={tm.name} logoUrl={tm.logoUrl} size="sm" />
                    {tm.id ? (
                      <Link
                        to={`/teams/${tm.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-[#EA580C]"
                      >
                        {tm.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900">{tm.name}</span>
                    )}
                    {tm.id && (
                      <button
                        type="button"
                        disabled={followBusyId === tm.id}
                        onClick={() => handleToggleFollow(tm.id!, tm.name)}
                        className={`ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                          followedIds.has(tm.id)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {followedIds.has(tm.id) ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <BellPlus className="w-3 h-3" />
                        )}
                        <span>{followedIds.has(tm.id) ? 'Following' : 'Follow'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {stream.matchDescription && (
                <p className="text-sm text-slate-600 leading-relaxed pt-1">
                  {stream.matchDescription}
                </p>
              )}
            </div>

            {partnerSponsors.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Official Broadcast Partners</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {partnerSponsors.map((sp) => (
                    <a
                      key={sp.id}
                      href={sp.websiteUrl || undefined}
                      target={sp.websiteUrl ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      onClick={() => platformOpsService.trackSponsorClick(sp.id)}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:border-orange-300 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {sp.logoUrl && (
                          <img
                            src={sp.logoUrl}
                            alt={sp.name}
                            className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-200 p-1 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{sp.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {sp.tagline || sp.sponsorshipType}
                          </p>
                        </div>
                      </div>
                      {sp.websiteUrl && (
                        <span className="text-[11px] font-semibold text-[#EA580C] shrink-0">
                          {sp.ctaText || 'Visit'}
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
