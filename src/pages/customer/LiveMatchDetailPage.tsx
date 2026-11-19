import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  BellPlus,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Flag,
  MapPin,
  MessageSquare,
  Radio,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  MatchHighlightData,
  SponsorData,
  SponsorOverlayData,
  VenueData,
} from '../../types/index.ts';
import { useLiveStream } from '../../hooks/useLiveStream.ts';
import { useScoreboard } from '../../hooks/useScoreboard.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { BroadcastPlayerShell } from '../../components/streaming/BroadcastPlayerShell.tsx';
import { LiveScoreboardView } from '../../components/scoreboard/LiveScoreboardView.tsx';
import { MatchResultGraphic } from '../../components/streaming/MatchResultGraphic.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { ShareButton } from '../../components/common/ShareButton.tsx';
import { MatchReportModal } from '../../components/engagement/MatchReportModal.tsx';
import { LiveChatAndPollsPanel } from '../../components/engagement/LiveChatAndPollsPanel.tsx';
import { formatTimestamp } from '../../components/scoreboard/MatchHighlightsManager.tsx';

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

export function LiveMatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const wantsReplay = searchParams.get('mode') === 'replay';
  const urlStartParam = Number(searchParams.get('start'));

  const { customerUser, updateCustomerUser } = useAuth();
  const { stream, loading, error } = useLiveStream(id);
  const { score, history, connected } = useScoreboard(id);

  const [highlights, setHighlights] = useState<MatchHighlightData[]>([]);
  const [sponsorOverlays, setSponsorOverlays] = useState<SponsorOverlayData[]>([]);
  const [startSeconds, setStartSeconds] = useState<number | null>(
    Number.isFinite(urlStartParam) && urlStartParam > 0 ? Math.floor(urlStartParam) : null
  );
  const [jumpKey, setJumpKey] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [followFeedback, setFollowFeedback] = useState<string | null>(null);

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
  }, [id, stream, wantsReplay]);

  async function handleToggleFollow(teamId: string, teamName: string) {
    if (!customerUser) {
      setFollowFeedback('Sign in on the Customer Portal to follow teams and get live match alerts.');
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
      setFollowFeedback(isFollowing ? `Unfollowed ${teamName}.` : `Now following ${teamName}!`);
      window.setTimeout(() => setFollowFeedback(null), 2500);
    } catch {
      setFollowFeedback('Unable to update team follow status.');
    } finally {
      setFollowBusyId(null);
    }
  }

  function handleJumpHighlight(sec: number) {
    setStartSeconds(sec);
    setJumpKey((k) => k + 1);
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-48" />
        <div className="aspect-video bg-slate-200 rounded-xl" />
        <div className="h-40 bg-slate-200 rounded-xl" />
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

  const activeVideoId =
    wantsReplay && stream.replayPublished && stream.replayVideoId
      ? stream.replayVideoId
      : stream.youtubeVideoId;

  const displayTitle =
    stream.matchTitle ||
    (stream.teamAName && stream.teamBName
      ? `${stream.teamAName} vs ${stream.teamBName}`
      : stream.teamAName || stream.teamBName || 'MaidanLive Match Broadcast');

  const hasTeams = Boolean(stream.teamAName || stream.teamBName);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const venueObj = typeof stream.venueId === 'object' && stream.venueId ? stream.venueId : null;
  const mapsUrl = buildGoogleMapsUrl(venueObj, stream.location);
  const followedIds = new Set(customerUser?.followedTeamIds || []);

  // Deduplicate sponsors for the match sponsor card
  const matchSponsors: SponsorData[] = [];
  const seenSponsorIds = new Set<string>();
  for (const ov of sponsorOverlays) {
    const sp = ov.sponsor || (typeof ov.sponsorId === 'object' ? ov.sponsorId : null);
    if (sp && sp.id && !seenSponsorIds.has(sp.id)) {
      seenSponsorIds.add(sp.id);
      matchSponsors.push(sp);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-0 sm:px-6 py-0 sm:py-6 space-y-6">
      {/* Compact Top Bar */}
      <div className="px-4 sm:px-0 pt-4 sm:pt-0 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/live"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Broadcasts</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {stream.status === 'LIVE' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-semibold">
              <Radio className="w-3.5 h-3.5" />
              LIVE
            </span>
          ) : stream.status === 'ENDED' ? (
            <span className="px-2.5 py-1 rounded-md bg-slate-200 text-slate-800 text-xs font-semibold">
              {wantsReplay && stream.replayPublished ? 'REPLAY' : 'MATCH ENDED'}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-semibold">
              UPCOMING
            </span>
          )}

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Flag className="w-3.5 h-3.5 text-red-600" />
            <span>Report Issue</span>
          </button>
        </div>
      </div>

      {/* Main Broadcast Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Top: Broadcast Player + Match Details + Highlights */}
        <div className="lg:col-span-7 space-y-4">
          <div className="sm:rounded-xl overflow-hidden">
            <BroadcastPlayerShell
              stream={stream}
              score={score}
              videoId={activeVideoId}
              title={displayTitle}
              startSeconds={startSeconds}
              jumpKey={jumpKey}
              sponsorOverlays={sponsorOverlays}
            />
          </div>

          <div className="px-4 sm:px-0 space-y-4">
            {resultDeclared && score && <MatchResultGraphic stream={stream} score={score} />}

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 text-balance">
                {displayTitle}
              </h1>
              <ShareButton
                title={displayTitle}
                text={`Watch ${stream.gameName || 'live sports'} on MaidanLive`}
                compact
              />
            </div>

            {/* Metadata + Real Venue Map Link */}
            {(stream.gameName ||
              stream.tournamentName ||
              stream.location ||
              venueObj ||
              stream.matchDate) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-slate-600">
                {stream.gameName && (
                  <span className="font-semibold text-slate-800">{stream.gameName}</span>
                )}
                {stream.tournamentName && (
                  <Link
                    to={stream.tournamentId ? `/tournaments/${stream.tournamentId}` : '/tournaments'}
                    className="inline-flex items-center gap-1.5 hover:text-emerald-700 font-medium"
                  >
                    <Trophy className="w-3.5 h-3.5 text-slate-400" />
                    <span>{stream.tournamentName}</span>
                  </Link>
                )}
                {(venueObj?.name || stream.location) && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{venueObj ? venueObj.name : stream.location}</span>
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                      >
                        <span>Map</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </span>
                )}
                {stream.matchDate && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(stream.matchDate).toLocaleDateString()}</span>
                  </span>
                )}
              </div>
            )}

            {followFeedback && (
              <div className="p-2.5 rounded-lg bg-slate-900 text-white text-xs">{followFeedback}</div>
            )}

            {/* Teams Bar with Profile Links & Follow Buttons */}
            {hasTeams && (
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
                {stream.teamAName && (
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <TeamAvatar name={stream.teamAName} logoUrl={stream.teamALogo} size="sm" />
                    {stream.teamAId ? (
                      <Link
                        to={`/teams/${stream.teamAId}`}
                        className="text-sm font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        {stream.teamAName}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900">{stream.teamAName}</span>
                    )}
                    {stream.teamAId && (
                      <button
                        type="button"
                        disabled={followBusyId === stream.teamAId}
                        onClick={() => handleToggleFollow(stream.teamAId!, stream.teamAName)}
                        className={`ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          followedIds.has(stream.teamAId)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {followedIds.has(stream.teamAId) ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <BellPlus className="w-3 h-3" />
                        )}
                        <span>{followedIds.has(stream.teamAId) ? 'Following' : 'Follow'}</span>
                      </button>
                    )}
                  </div>
                )}

                {stream.teamAName && stream.teamBName && (
                  <span className="text-xs font-bold text-slate-400">VS</span>
                )}

                {stream.teamBName && (
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <TeamAvatar name={stream.teamBName} logoUrl={stream.teamBLogo} size="sm" />
                    {stream.teamBId ? (
                      <Link
                        to={`/teams/${stream.teamBId}`}
                        className="text-sm font-semibold text-slate-900 hover:text-emerald-700"
                      >
                        {stream.teamBName}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900">{stream.teamBName}</span>
                    )}
                    {stream.teamBId && (
                      <button
                        type="button"
                        disabled={followBusyId === stream.teamBId}
                        onClick={() => handleToggleFollow(stream.teamBId!, stream.teamBName)}
                        className={`ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          followedIds.has(stream.teamBId)
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {followedIds.has(stream.teamBId) ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <BellPlus className="w-3 h-3" />
                        )}
                        <span>{followedIds.has(stream.teamBId) ? 'Following' : 'Follow'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {wantsReplay && stream.replayDescription && (
              <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs sm:text-sm text-slate-700">
                <p className="font-semibold text-slate-900 mb-1">Replay Notes</p>
                <p>{stream.replayDescription}</p>
              </div>
            )}

            {stream.matchDescription && (
              <p className="text-sm text-slate-600 leading-relaxed pt-1">
                {stream.matchDescription}
              </p>
            )}

            {/* Key Match Highlights Timeline */}
            {stream.highlightsEnabled !== false && highlights.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Match Highlights Timeline</span>
                  </h2>
                  <span className="text-xs text-slate-500 font-mono tabular-nums">
                    {highlights.length} moment{highlights.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {highlights.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => handleJumpHighlight(h.videoTimestampSeconds)}
                      className="min-h-[38px] inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-xs transition-colors text-left"
                    >
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px]">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        {formatTimestamp(h.videoTimestampSeconds)}
                      </span>
                      <span className="font-semibold text-slate-900">{h.eventType}</span>
                      {h.playerName && <span className="text-slate-600">({h.playerName})</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Match Sponsors */}
            {matchSponsors.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 inline-flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  <span>Official Broadcast Partners</span>
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {matchSponsors.map((sp) => (
                    <a
                      key={sp.id}
                      href={sp.websiteUrl || undefined}
                      target={sp.websiteUrl ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100"
                    >
                      {sp.logoUrl && (
                        <img
                          src={sp.logoUrl}
                          alt={sp.name}
                          className="w-7 h-7 rounded object-contain bg-white"
                        />
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-900">{sp.name}</p>
                        <p className="text-[11px] text-slate-500">{sp.sponsorshipType}</p>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right/Bottom: Scoreboard + Live Chat & Polls + Commentary */}
        <div className="lg:col-span-5 px-4 sm:px-0 space-y-4">
          <LiveScoreboardView stream={stream} score={score} socketConnected={connected} />

          <LiveChatAndPollsPanel
            streamId={stream.id}
            chatEnabled={stream.chatEnabled !== false}
          />

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Live Commentary &amp; Score Feed
                </h2>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {history.length} event{history.length === 1 ? '' : 's'}
              </span>
            </div>
            {history.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Live commentary and score updates will appear here in real time as the scorer logs plays.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {history.map((item) => {
                  const isCommentary = item.entryType === 'COMMENTARY';
                  const isResult = item.entryType === 'RESULT';
                  const isCorrection = item.entryType === 'CORRECTION';
                  return (
                    <div
                      key={item._id}
                      className={`px-4 py-3 flex items-start justify-between gap-3 text-xs ${
                        isCommentary
                          ? 'bg-emerald-50/50'
                          : isResult
                            ? 'bg-amber-50/70'
                            : isCorrection
                              ? 'bg-sky-50/60'
                              : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 break-words">
                          {isCommentary && (
                            <span className="font-bold text-emerald-700 mr-1.5">COMMENTARY</span>
                          )}
                          {isResult && (
                            <span className="font-bold text-amber-800 mr-1.5">OFFICIAL RESULT</span>
                          )}
                          {isCorrection && (
                            <span className="font-bold text-sky-800 mr-1.5">CORRECTION</span>
                          )}
                          {item.action}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          {new Date(item.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                        {item.updatedScore?.teamAScore ?? 0} - {item.updatedScore?.teamBScore ?? 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <MatchReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        streamId={stream.id}
        matchTitle={displayTitle}
      />
    </div>
  );
}
