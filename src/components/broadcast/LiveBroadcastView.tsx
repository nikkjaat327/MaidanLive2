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
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import {
  LiveScoreData,
  LiveStreamData,
  MatchHighlightData,
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
import { LiveStreamPlayer } from './LiveStreamPlayer.tsx';
import { BroadcastScoreboard } from './BroadcastScoreboard.tsx';
import { BroadcastSportStrip } from './BroadcastSportStrip.tsx';
import { BroadcastResultBar } from './BroadcastResultBar.tsx';
import { LiveCommentaryFeed } from './LiveCommentaryFeed.tsx';
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

type DetailTab = 'commentary' | 'chat' | 'highlights' | 'info';

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
  const [activeTab, setActiveTab] = useState<DetailTab>('commentary');
  const [publicSponsors, setPublicSponsors] = useState<SponsorData[]>([]);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [followFeedback, setFollowFeedback] = useState<string | null>(null);

  const isFullscreenActive = isNativeFullscreen || isExpandedFallback;
  const activeVideoId =
    wantsReplay && broadcast.replayPublished && broadcast.replayVideoId
      ? broadcast.replayVideoId
      : broadcast.youtubeVideoId;

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

  // Load live_match sponsors & record impressions
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
  }, [broadcast.id, broadcast.tournamentId]);

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
              switchingBanner={switchingBanner}
            />

            {broadcast.status === 'UPCOMING' && !showUpcomingPreview && (
              <StartingSoonGraphic
                stream={stream}
                onShowPreview={() => setShowUpcomingPreview(true)}
              />
            )}

            {/* Top-Left Live / Viewer / Sync Badge */}
            <div className="pointer-events-none absolute top-2.5 left-2.5 z-30 flex flex-wrap items-center gap-1.5">
              {broadcast.centerMeta.isLive && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-600/95 text-white text-[10px] font-extrabold uppercase tracking-wider shadow">
                  <Radio className="w-3 h-3 animate-pulse" />
                  <span>{t('broadcast.live')}</span>
                </span>
              )}
              {canSeeViewers && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 border border-white/15 text-white font-mono text-[10px] font-semibold tabular-nums backdrop-blur-md">
                  <Users className="w-3 h-3 text-emerald-400" />
                  <span>{broadcast.activeViewers}</span>
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 border border-white/15 text-[10px] font-semibold backdrop-blur-md ${
                  connected ? 'text-emerald-300' : 'text-amber-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    connected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>{broadcast.activeProvider === 'mediamtx' ? 'MediaMTX' : 'YouTube'}</span>
              </span>
            </div>

            {/* Top-Right Viewer Controls */}
            <div className="pointer-events-none absolute top-2.5 right-2.5 z-30 flex items-center gap-1.5">
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

      {/* 2. PORTRAIT / DEFAULT HIERARCHY: SCOREBOARD STRIP -> SPORT STRIP -> RESULT BAR */}
      <div className="px-3 sm:px-0 space-y-3">
        {scoreboardVisible && <BroadcastScoreboard broadcast={broadcast} />}
        <BroadcastSportStrip broadcast={broadcast} />
        <BroadcastResultBar broadcast={broadcast} />

        {/* Match Header & Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
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

        {/* 3. DETAIL TABS: COMMENTARY | CHAT & POLLS | HIGHLIGHTS | TEAMS & PARTNERS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'commentary' as const, label: `Commentary (${history.length})` },
            { id: 'chat' as const, label: 'Live Chat & Polls' },
            ...(broadcast.highlightsEnabled && highlights.length > 0
              ? [{ id: 'highlights' as const, label: `Highlights (${highlights.length})` }]
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
