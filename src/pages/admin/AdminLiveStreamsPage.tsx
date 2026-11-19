import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  PlaySquare,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  StopCircle,
  Video,
} from 'lucide-react';
import {
  LiveStreamData,
  ScoreboardPosition,
  TeamData,
  TournamentData,
  VenueData,
} from '../../types/index.ts';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import {
  YouTubeVerification,
  liveStreamService,
} from '../../services/liveStream/liveStreamService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { extractYouTubeVideoId } from '../../utils/youtube.ts';
import { YouTubePlayer } from '../../components/streaming/YouTubePlayer.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

type AdminStreamTab = 'ACTIVE' | 'UPCOMING' | 'HISTORY' | 'REPLAYS';

export function AdminLiveStreamsPage() {
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminStreamTab>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [sportFilter, setSportFilter] = useState('');

  // Create / Edit Stream Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingStream, setEditingStream] = useState<LiveStreamData | null>(null);
  const [youtubeInput, setYoutubeInput] = useState('');
  const [ytVerify, setYtVerify] = useState<YouTubeVerification | null>(null);
  const [verifyingYt, setVerifyingYt] = useState(false);

  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamALogo, setTeamALogo] = useState('');
  const [teamBLogo, setTeamBLogo] = useState('');
  const [venueId, setVenueId] = useState('');
  const [location, setLocation] = useState('');
  const [gameName, setGameName] = useState<SportOption | ''>('');
  const [matchTitle, setMatchTitle] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchDescription, setMatchDescription] = useState('');
  const [streamStatus, setStreamStatus] = useState<'LIVE' | 'UPCOMING'>('LIVE');
  const [scoreboardVisibleByDefault, setScoreboardVisibleByDefault] = useState(true);
  const [scoreboardPosition, setScoreboardPosition] = useState<ScoreboardPosition>('BOTTOM');
  const [chatEnabled, setChatEnabled] = useState(true);
  const [highlightsEnabled, setHighlightsEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmVideoChangeOpen, setConfirmVideoChangeOpen] = useState(false);

  // End Stream confirmation
  const [endTarget, setEndTarget] = useState<LiveStreamData | null>(null);
  const [ending, setEnding] = useState(false);

  // Replay management modal
  const [replayTarget, setReplayTarget] = useState<LiveStreamData | null>(null);
  const [replayInput, setReplayInput] = useState('');
  const [replayDescription, setReplayDescription] = useState('');
  const [replayVerify, setReplayVerify] = useState<YouTubeVerification | null>(null);
  const [verifyingReplay, setVerifyingReplay] = useState(false);
  const [savingReplay, setSavingReplay] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [allStreams, allTeams, allTours, allVenues] = await Promise.all([
        liveStreamService.listStreams(),
        entityService.listTeams(),
        entityService.listTournaments(),
        platformOpsService.listVenues().catch(() => [] as VenueData[]),
      ]);
      setStreams(allStreams);
      setTeams(allTeams);
      setTournaments(allTours);
      setVenues(allVenues);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load streams.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const parsedYoutube = extractYouTubeVideoId(youtubeInput);

  function openNewStreamModal() {
    setEditingStream(null);
    setYoutubeInput('');
    setYtVerify(null);
    setTeamAId('');
    setTeamBId('');
    setTeamAName('');
    setTeamBName('');
    setTeamALogo('');
    setTeamBLogo('');
    setVenueId('');
    setLocation('');
    setGameName('');
    setMatchTitle('');
    setTournamentId('');
    setTournamentName('');
    setMatchDate('');
    setMatchDescription('');
    setStreamStatus('LIVE');
    setScoreboardVisibleByDefault(true);
    setScoreboardPosition('BOTTOM');
    setChatEnabled(true);
    setHighlightsEnabled(true);
    setFormOpen(true);
  }

  function openEditStreamModal(stream: LiveStreamData) {
    setEditingStream(stream);
    setYoutubeInput(stream.youtubeInput || stream.youtubeVideoId);
    setYtVerify(null);
    setTeamAId(stream.teamAId || '');
    setTeamBId(stream.teamBId || '');
    setTeamAName(stream.teamAName || '');
    setTeamBName(stream.teamBName || '');
    setTeamALogo(stream.teamALogo || '');
    setTeamBLogo(stream.teamBLogo || '');
    setVenueId(
      typeof stream.venueId === 'object' && stream.venueId
        ? stream.venueId.id || stream.venueId._id || ''
        : stream.venueId || ''
    );
    setLocation(stream.location || '');
    setGameName((stream.gameName as SportOption) || '');
    setMatchTitle(stream.matchTitle || '');
    setTournamentId(stream.tournamentId || '');
    setTournamentName(stream.tournamentName || '');
    setMatchDate(stream.matchDate ? stream.matchDate.slice(0, 10) : '');
    setMatchDescription(stream.matchDescription || '');
    setStreamStatus(stream.status === 'UPCOMING' ? 'UPCOMING' : 'LIVE');
    setScoreboardVisibleByDefault(stream.scoreboardVisibleByDefault ?? true);
    setScoreboardPosition(stream.scoreboardPosition || 'BOTTOM');
    setChatEnabled(stream.chatEnabled ?? true);
    setHighlightsEnabled(stream.highlightsEnabled ?? true);
    setFormOpen(true);
  }

  async function handleVerifyStreamYoutube() {
    if (!parsedYoutube.valid) return;
    try {
      setVerifyingYt(true);
      const res = await liveStreamService.verifyYouTubeVideo(youtubeInput);
      setYtVerify(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to verify YouTube video.'));
    } finally {
      setVerifyingYt(false);
    }
  }

  async function saveStream(confirmedVideoChange = false) {
    if (!parsedYoutube.valid || !parsedYoutube.videoId) {
      setError(parsedYoutube.error || 'Please enter a valid YouTube Video ID or URL.');
      return;
    }

    if (
      editingStream &&
      parsedYoutube.videoId !== editingStream.youtubeVideoId &&
      !confirmedVideoChange
    ) {
      setConfirmVideoChangeOpen(true);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload: Record<string, unknown> = {
        youtubeInput: youtubeInput.trim(),
        youtubeVideoId: parsedYoutube.videoId,
        teamAId: teamAId || null,
        teamBId: teamBId || null,
        teamAName: teamAName.trim(),
        teamBName: teamBName.trim(),
        teamALogo: teamALogo.trim(),
        teamBLogo: teamBLogo.trim(),
        venueId: venueId || null,
        location: location.trim(),
        gameName,
        matchTitle: matchTitle.trim(),
        tournamentId: tournamentId || null,
        tournamentName: tournamentName.trim(),
        matchDate: matchDate || null,
        matchDescription: matchDescription.trim(),
        scoreboardVisibleByDefault,
        scoreboardPosition,
        chatEnabled,
        highlightsEnabled,
      };

      if (editingStream) {
        if (editingStream.status === 'UPCOMING' && streamStatus === 'LIVE') {
          payload.status = 'LIVE';
        }
        await liveStreamService.updateStream(editingStream.id, payload);
        setSuccess('Stream details updated.');
      } else {
        payload.status = streamStatus;
        await liveStreamService.createStream(payload);
        setSuccess(
          streamStatus === 'LIVE'
            ? 'Live stream started on MaidanLive.'
            : 'Upcoming stream scheduled.'
        );
      }

      setConfirmVideoChangeOpen(false);
      setFormOpen(false);
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to save stream.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEndStream() {
    if (!endTarget) return;
    try {
      setEnding(true);
      setError(null);
      const res = await liveStreamService.endStream(endTarget.id);
      setEndTarget(null);
      setSuccess(
        res.note ||
          'MaidanLive stream ended and moved to history with final scores preserved.'
      );
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Failed to end stream.'));
    } finally {
      setEnding(false);
    }
  }

  function openReplayModal(stream: LiveStreamData) {
    setReplayTarget(stream);
    setReplayInput(stream.replayInput || stream.replayVideoId || stream.youtubeVideoId);
    setReplayDescription(stream.replayDescription || '');
    setReplayVerify(null);
  }

  async function handleVerifyReplay() {
    try {
      setVerifyingReplay(true);
      setError(null);
      const res = await liveStreamService.verifyYouTubeVideo(replayInput);
      setReplayVerify(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to verify YouTube replay.'));
    } finally {
      setVerifyingReplay(false);
    }
  }

  async function handleSaveReplay(publishState: boolean) {
    if (!replayTarget) return;
    try {
      setSavingReplay(true);
      setError(null);
      await liveStreamService.updateReplay(replayTarget.id, {
        replayInput: replayInput.trim(),
        replayPublished: publishState,
        replayDescription: replayDescription.trim(),
      });
      setReplayTarget(null);
      setSuccess(publishState ? 'Verified replay published to Customer Portal.' : 'Replay saved/hidden.');
      await loadAll();
    } catch (err) {
      setError(extractApiError(err, 'Could not update replay.'));
    } finally {
      setSavingReplay(false);
    }
  }

  const totalCount = streams.length;
  const activeStreams = streams.filter((s) => s.status === 'LIVE');
  const upcomingStreams = streams.filter((s) => s.status === 'UPCOMING');
  const endedStreams = streams.filter((s) => s.status === 'ENDED');
  const availableReplaysCount = endedStreams.filter(
    (s) => s.replayAvailable && s.replayVideoId
  ).length;

  const baseStreams =
    activeTab === 'ACTIVE'
      ? activeStreams
      : activeTab === 'UPCOMING'
        ? upcomingStreams
        : endedStreams;

  const q = searchQuery.trim().toLowerCase();
  const displayedStreams = baseStreams.filter((s) => {
    if (sportFilter && s.gameName !== sportFilter) return false;
    if (!q) return true;
    const text = [
      s.matchTitle,
      s.teamAName,
      s.teamBName,
      s.tournamentName,
      s.location,
      s.youtubeVideoId,
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(q);
  });

  const parsedReplay = extractYouTubeVideoId(replayInput);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Live Streaming Studio
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Launch YouTube Live streams instantly using a Video ID or URL. Optional match details can be skipped or updated anytime.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewStreamModal}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Start New Live Stream</span>
        </button>
      </div>

      {/* Dashboard Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Total Streams</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-1">
            {loading ? '—' : totalCount}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Currently Live</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-red-600 mt-1">
            {loading ? '—' : activeStreams.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Ended Streams</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-slate-700 mt-1">
            {loading ? '—' : endedStreams.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500">Available Replays</p>
          <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-1">
            {loading ? '—' : availableReplaysCount}
          </p>
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {/* Section Tabs & Search/Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto max-w-full">
          {[
            { key: 'ACTIVE' as const, label: `Active (${activeStreams.length})` },
            { key: 'UPCOMING' as const, label: `Upcoming (${upcomingStreams.length})` },
            { key: 'HISTORY' as const, label: `Stream History (${endedStreams.length})` },
            { key: 'REPLAYS' as const, label: `Replays (${endedStreams.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search streams..."
              className="w-full min-h-[38px] pl-9 pr-3 text-xs border border-slate-300 rounded-lg bg-white"
            />
          </div>
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="min-h-[38px] px-3 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Sports</option>
            {SPORT_OPTIONS.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stream List */}
      {loading ? (
        <TableSkeleton rows={4} />
      ) : displayedStreams.length === 0 ? (
        <EmptyState
          icon={<Video className="w-6 h-6" />}
          title={
            activeTab === 'ACTIVE'
              ? 'No active live streams'
              : activeTab === 'UPCOMING'
                ? 'No upcoming streams scheduled'
                : 'No ended streams yet'
          }
          description="Click Start New Live Stream with just a YouTube Video ID or URL to begin broadcasting."
          action={
            activeTab === 'ACTIVE' && (
              <button
                type="button"
                onClick={openNewStreamModal}
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <Plus className="w-4 h-4" />
                <span>Start New Live Stream</span>
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {displayedStreams.map((stream) => {
            const title =
              stream.matchTitle ||
              (stream.teamAName && stream.teamBName
                ? `${stream.teamAName} vs ${stream.teamBName}`
                : stream.youtubeVideoId);

            return (
              <div
                key={stream.id}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {stream.status === 'LIVE' && (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                        <Radio className="w-3.5 h-3.5" />
                        LIVE
                      </span>
                    )}
                    {stream.status === 'UPCOMING' && (
                      <span className="font-semibold text-amber-700">UPCOMING</span>
                    )}
                    {stream.status === 'ENDED' && (
                      <span className="font-semibold text-slate-600">ENDED</span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-700">ID: {stream.youtubeVideoId}</span>
                    {stream.gameName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{stream.gameName}</span>
                      </>
                    )}
                    {stream.location && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{stream.location}</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>

                  {stream.score && (
                    <p className="text-xs font-mono tabular-nums text-slate-600">
                      Score: {stream.teamAName || 'Team A'} {stream.score.teamAScore} -{' '}
                      {stream.score.teamBScore} {stream.teamBName || 'Team B'}
                      {stream.endedAt &&
                        ` · Ended ${new Date(stream.endedAt).toLocaleString()}`}
                    </p>
                  )}

                  {stream.score?.resultStatus && stream.score.resultStatus !== 'NOT_DECLARED' && (
                    <p className="text-xs font-semibold text-amber-800">
                      Result: {stream.score.resultDescription || stream.score.winnerTeamName}
                    </p>
                  )}

                  {activeTab === 'REPLAYS' && (
                    <p className="text-xs text-slate-600">
                      Replay Status:{' '}
                      <strong
                        className={
                          stream.replayPublished
                            ? 'text-emerald-700'
                            : stream.replayAvailable
                              ? 'text-slate-900'
                              : 'text-slate-500'
                        }
                      >
                        {stream.replayPublished
                          ? `Published (${stream.replayVideoId})`
                          : stream.replayAvailable
                            ? `Verified & Hidden (${stream.replayVideoId})`
                            : 'Not verified / No replay set'}
                      </strong>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link
                    to={`/admin/scoreboard/${stream.id}`}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Score Control</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => openEditStreamModal(stream)}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Info</span>
                  </button>

                  {stream.status === 'LIVE' && (
                    <button
                      type="button"
                      onClick={() => setEndTarget(stream)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 whitespace-nowrap"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>End Stream</span>
                    </button>
                  )}

                  {stream.status === 'UPCOMING' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await liveStreamService.updateStream(stream.id, { status: 'LIVE' });
                          setSuccess('Stream is now LIVE on MaidanLive.');
                          await loadAll();
                        } catch (err) {
                          setError(extractApiError(err, 'Failed to start stream.'));
                        }
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 whitespace-nowrap"
                    >
                      <Radio className="w-3.5 h-3.5" />
                      <span>Go Live Now</span>
                    </button>
                  )}

                  {stream.status === 'ENDED' && (
                    <button
                      type="button"
                      onClick={() => openReplayModal(stream)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
                    >
                      <PlaySquare className="w-3.5 h-3.5" />
                      <span>Manage Replay</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Start / Edit Stream Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingStream ? 'Edit Stream Details' : 'Start New Live Stream'}
        subtitle="Only a valid YouTube Video ID or URL is required. All match details are optional."
        maxWidthClass="max-w-3xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveStream(false);
          }}
          className="space-y-6"
        >
          {/* Mandatory YouTube Input + Preview */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-900">
              YouTube Video ID or URL <span className="text-red-600">*</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={youtubeInput}
                onChange={(e) => {
                  setYoutubeInput(e.target.value);
                  setYtVerify(null);
                }}
                placeholder="e.g. dQw4w9WgXcQ or https://youtube.com/live/..."
                className="flex-1 min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="button"
                disabled={!parsedYoutube.valid || verifyingYt}
                onClick={handleVerifyStreamYoutube}
                className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 disabled:opacity-50 whitespace-nowrap"
              >
                {verifyingYt ? 'Checking...' : 'Check YouTube Embed'}
              </button>
            </div>

            {youtubeInput.trim() && !parsedYoutube.valid && (
              <p className="text-xs text-red-600">{parsedYoutube.error}</p>
            )}

            {parsedYoutube.valid && parsedYoutube.videoId && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Extracted Video ID:{' '}
                    <strong className="font-mono text-slate-900">{parsedYoutube.videoId}</strong>
                  </span>
                  <span className="text-slate-500">
                    Valid ID preview — live status depends on your YouTube broadcast.
                  </span>
                </div>

                {ytVerify && (
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      ytVerify.available
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {ytVerify.available
                      ? `Verified available: "${ytVerify.title || ytVerify.videoId}"`
                      : ytVerify.message}
                  </div>
                )}

                <YouTubePlayer videoId={parsedYoutube.videoId} title="Stream Preview" />
              </div>
            )}
          </div>

          {!editingStream && (
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-slate-700">Initial Stream Status:</label>
              <div className="flex items-center gap-2">
                {(['LIVE', 'UPCOMING'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStreamStatus(st)}
                    className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-lg border ${
                      streamStatus === st
                        ? st === 'LIVE'
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {st === 'LIVE' ? 'Start LIVE Now' : 'Schedule UPCOMING'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Optional Match Information */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Optional Match Information
              </h3>
              <p className="text-xs text-slate-500">
                Leave any field blank to start immediately, or select from existing database teams and tournaments.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Sport / Game Name
                </label>
                <select
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value as SportOption | '')}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Not specified</option>
                  {SPORT_OPTIONS.map((sp) => (
                    <option key={sp} value={sp}>
                      {sp}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Match Title</label>
                <input
                  type="text"
                  value={matchTitle}
                  onChange={(e) => setMatchTitle(e.target.value)}
                  placeholder="Optional match title"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {/* Team A */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  Team A (Select DB Team or Enter Manually)
                </label>
                {teams.length > 0 && (
                  <select
                    value={teamAId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTeamAId(id);
                      const found = teams.find((t) => t.id === id);
                      if (found) {
                        setTeamAName(found.name);
                        setTeamALogo(found.logoUrl || '');
                      }
                    }}
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Manual entry / None</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.sportType})
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  placeholder="Team A name (optional)"
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="url"
                  value={teamALogo}
                  onChange={(e) => setTeamALogo(e.target.value)}
                  placeholder="Team A logo URL (optional)"
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {/* Team B */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  Team B (Select DB Team or Enter Manually)
                </label>
                {teams.length > 0 && (
                  <select
                    value={teamBId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTeamBId(id);
                      const found = teams.find((t) => t.id === id);
                      if (found) {
                        setTeamBName(found.name);
                        setTeamBLogo(found.logoUrl || '');
                      }
                    }}
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Manual entry / None</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.sportType})
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  placeholder="Team B name (optional)"
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="url"
                  value={teamBLogo}
                  onChange={(e) => setTeamBLogo(e.target.value)}
                  placeholder="Team B logo URL (optional)"
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tournament (Optional)
                </label>
                {tournaments.length > 0 && (
                  <select
                    value={tournamentId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTournamentId(id);
                      const found = tournaments.find((t) => t.id === id);
                      if (found) setTournamentName(found.name);
                    }}
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white mb-2"
                  >
                    <option value="">Manual entry / None</option>
                    {tournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="Tournament name (optional)"
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                {venues.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Saved Venue (Optional)
                    </label>
                    <select
                      value={venueId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setVenueId(id);
                        const v = venues.find((item) => item.id === id);
                        if (v && !location.trim()) {
                          setLocation([v.name, v.city].filter(Boolean).join(', '));
                        }
                      }}
                      className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Manual location / None</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} {v.city ? `(${v.city})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Location / Ground
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Stadium or ground name"
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Match Date</label>
                  <input
                    type="date"
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Match Description
              </label>
              <textarea
                rows={2}
                value={matchDescription}
                onChange={(e) => setMatchDescription(e.target.value)}
                placeholder="Optional match context, pitch notes, or stage details"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Default Scoreboard Overlay Position
                </label>
                <select
                  value={scoreboardPosition}
                  onChange={(e) => setScoreboardPosition(e.target.value as ScoreboardPosition)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="BOTTOM">Bottom Strip</option>
                  <option value="TOP">Top Strip</option>
                  <option value="LEFT">Left Corner</option>
                  <option value="RIGHT">Right Corner</option>
                </select>
              </div>
              <div className="flex flex-col justify-center gap-2 pt-2">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scoreboardVisibleByDefault}
                    onChange={(e) => setScoreboardVisibleByDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span>Show TV broadcast scoreboard by default</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={chatEnabled}
                    onChange={(e) => setChatEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span>Enable Live Match Chat</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={highlightsEnabled}
                    onChange={(e) => setHighlightsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                  />
                  <span>Enable Timestamped Highlights</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !parsedYoutube.valid}
              className="min-h-[44px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting
                ? 'Saving...'
                : editingStream
                  ? 'Save Stream Changes'
                  : streamStatus === 'LIVE'
                    ? 'Start Live Stream'
                    : 'Schedule Stream'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm YouTube Video ID change */}
      <ConfirmDialog
        open={confirmVideoChangeOpen}
        onClose={() => setConfirmVideoChangeOpen(false)}
        onConfirm={() => saveStream(true)}
        loading={submitting}
        variant="primary"
        title="Confirm YouTube Video ID Change"
        message="Changing the YouTube Video ID will reload the video player for active viewers. Scoreboard data will be preserved. Proceed?"
        confirmLabel="Change Video ID"
      />

      {/* Confirm End Stream */}
      <ConfirmDialog
        open={Boolean(endTarget)}
        onClose={() => setEndTarget(null)}
        onConfirm={handleEndStream}
        loading={ending}
        title="End MaidanLive Stream"
        message="This will mark the stream as ENDED on MaidanLive, preserve all final scores, move it to Stream History, and notify viewers. Remember to also stop your broadcast encoder in YouTube Studio if you are still streaming."
        confirmLabel="End Stream"
      />

      {/* Manage & Verify Replay Modal */}
      <Modal
        open={Boolean(replayTarget)}
        onClose={() => setReplayTarget(null)}
        title="Replay Management"
        subtitle="Verify that the YouTube replay is available and embeddable before publishing."
      >
        {replayTarget && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Replay YouTube Video ID or URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={replayInput}
                  onChange={(e) => {
                    setReplayInput(e.target.value);
                    setReplayVerify(null);
                  }}
                  className="flex-1 min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  disabled={!parsedReplay.valid || verifyingReplay}
                  onClick={handleVerifyReplay}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {verifyingReplay ? 'Verifying...' : 'Verify Availability'}
                </button>
              </div>
            </div>

            {replayVerify && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                  replayVerify.available
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {replayVerify.available
                    ? `Replay verified available: ${replayVerify.title || replayVerify.videoId}`
                    : replayVerify.message}
                </span>
              </div>
            )}

            {parsedReplay.valid && parsedReplay.videoId && (
              <YouTubePlayer videoId={parsedReplay.videoId} title="Replay Preview" />
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Replay Notes / Summary (Optional)
              </label>
              <textarea
                rows={2}
                value={replayDescription}
                onChange={(e) => setReplayDescription(e.target.value)}
                placeholder="Highlight summary or broadcast notes for replay viewers"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
              {replayTarget.replayPublished && (
                <button
                  type="button"
                  disabled={savingReplay}
                  onClick={() => handleSaveReplay(false)}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  <EyeOff className="w-4 h-4" />
                  <span>Hide Replay</span>
                </button>
              )}
              <button
                type="button"
                disabled={savingReplay || !parsedReplay.valid}
                onClick={() => handleSaveReplay(true)}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                <span>{savingReplay ? 'Verifying & Publishing...' : 'Verify & Publish Replay'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
