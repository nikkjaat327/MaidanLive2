import React, { useEffect, useState } from 'react';
import { CheckCircle2, Info, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import {
  LiveStreamData,
  MatchDraftPlayerData,
  ScoreboardPosition,
  TeamData,
  TournamentData,
  VenueData,
  ViewerCountVisibility,
} from '../../types/index.ts';
import { SPORT_OPTIONS, SportOption } from '../../constants/sports.ts';
import { CRICKET_OVER_PRESETS } from '../../utils/cricketScoring.ts';
import {
  VOLLEYBALL_SET_PRESETS,
  normalizeVolleyballDetails,
  validateVolleyballRules,
} from '../../utils/volleyballScoring.ts';
import { getSportPositions, sanitizeDraftPlayersClient } from '../../utils/sportPositions.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { offlineScoreQueue } from '../../utils/offlineScoreQueue.ts';
import { Modal } from '../common/Modal.tsx';
import { FeedbackBanner } from '../common/FeedbackBanner.tsx';

export interface MatchSetupFormModalProps {
  open: boolean;
  onClose: () => void;
  mode?: 'create' | 'edit';
  initialStream?: LiveStreamData | null;
  teams?: TeamData[];
  tournaments?: TournamentData[];
  venues?: VenueData[];
  onInitialized?: (stream: LiveStreamData) => void | Promise<void>;
  onUpdated?: (stream: LiveStreamData) => void | Promise<void>;
}

export function MatchSetupFormModal({
  open,
  onClose,
  mode = 'create',
  initialStream = null,
  teams: providedTeams,
  tournaments: providedTournaments,
  venues: providedVenues,
  onInitialized,
  onUpdated,
}: MatchSetupFormModalProps) {
  const [teams, setTeams] = useState<TeamData[]>(providedTeams || []);
  const [tournaments, setTournaments] = useState<TournamentData[]>(providedTournaments || []);
  const [venues, setVenues] = useState<VenueData[]>(providedVenues || []);

  const [gameName, setGameName] = useState<SportOption | ''>('');
  const [matchTitle, setMatchTitle] = useState('');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [teamALogo, setTeamALogo] = useState('');
  const [teamBLogo, setTeamBLogo] = useState('');
  const [tournamentId, setTournamentId] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [venueId, setVenueId] = useState('');
  const [location, setLocation] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchDescription, setMatchDescription] = useState('');
  const [scoreboardPosition, setScoreboardPosition] = useState<ScoreboardPosition>('BOTTOM');
  const [viewerCountVisibility, setViewerCountVisibility] =
    useState<ViewerCountVisibility>('public');
  const [scoreboardVisibleByDefault, setScoreboardVisibleByDefault] = useState(true);
  const [showScoreboardOnYoutube, setShowScoreboardOnYoutube] = useState(true);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [highlightsEnabled, setHighlightsEnabled] = useState(true);
  const [oversLimit, setOversLimit] = useState('20');
  const [playersPerSide, setPlayersPerSide] = useState('11');
  const [vbBestOfSets, setVbBestOfSets] = useState('5');
  const [vbPointsPerSet, setVbPointsPerSet] = useState('25');
  const [vbMinMargin, setVbMinMargin] = useState('2');
  const [vbFinalSetPoints, setVbFinalSetPoints] = useState('15');
  const [vbFinalSetMinMargin, setVbFinalSetMinMargin] = useState('2');
  const [vbAutoCompleteSets, setVbAutoCompleteSets] = useState(true);
  const [vbAllowManualWinner, setVbAllowManualWinner] = useState(true);
  const [vbAllowMatchReopen, setVbAllowMatchReopen] = useState(true);
  const [teamAPlayers, setTeamAPlayers] = useState<MatchDraftPlayerData[]>([]);
  const [teamBPlayers, setTeamBPlayers] = useState<MatchDraftPlayerData[]>([]);
  const [customPosKeys, setCustomPosKeys] = useState<Record<string, boolean>>({});
  const [importingRosterSide, setImportingRosterSide] = useState<'A' | 'B' | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (providedTeams) setTeams(providedTeams);
  }, [providedTeams]);

  useEffect(() => {
    if (providedTournaments) setTournaments(providedTournaments);
  }, [providedTournaments]);

  useEffect(() => {
    if (providedVenues) setVenues(providedVenues);
  }, [providedVenues]);

  useEffect(() => {
    if (!open) return;
    if (!providedTeams) {
      entityService.listTeams().then(setTeams).catch(() => {});
    }
    if (!providedTournaments) {
      entityService.listTournaments().then(setTournaments).catch(() => {});
    }
    if (!providedVenues) {
      platformOpsService.listVenues().then(setVenues).catch(() => {});
    }
  }, [open, providedTeams, providedTournaments, providedVenues]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && initialStream) {
      setGameName((initialStream.gameName as SportOption) || '');
      setMatchTitle(initialStream.matchTitle || '');
      setTeamAId(initialStream.teamAId || '');
      setTeamBId(initialStream.teamBId || '');
      setTeamAName(initialStream.teamAName || '');
      setTeamBName(initialStream.teamBName || '');
      setTeamALogo(initialStream.teamALogo || '');
      setTeamBLogo(initialStream.teamBLogo || '');
      setTournamentId(initialStream.tournamentId || '');
      setTournamentName(initialStream.tournamentName || '');
      setVenueId(
        typeof initialStream.venueId === 'object' && initialStream.venueId
          ? initialStream.venueId.id || initialStream.venueId._id || ''
          : initialStream.venueId || ''
      );
      setLocation(initialStream.location || '');
      setMatchDate(initialStream.matchDate ? initialStream.matchDate.slice(0, 10) : '');
      setMatchDescription(initialStream.matchDescription || '');
      setScoreboardPosition(initialStream.scoreboardPosition || 'BOTTOM');
      setViewerCountVisibility(initialStream.viewerCountVisibility || 'public');
      setScoreboardVisibleByDefault(initialStream.scoreboardVisibleByDefault ?? true);
      setShowScoreboardOnYoutube(initialStream.showScoreboardOnYoutube ?? true);
      setChatEnabled(initialStream.chatEnabled ?? true);
      setHighlightsEnabled(initialStream.highlightsEnabled ?? true);
      const crkDetails = (initialStream.score?.sportSpecificDetails || {}) as Record<
        string,
        unknown
      >;
      setOversLimit(String(crkDetails.oversLimit || 20));
      setPlayersPerSide(String(crkDetails.playersPerSide || 11));
      const vbNorm = normalizeVolleyballDetails(initialStream.score?.sportSpecificDetails);
      setVbBestOfSets(String(vbNorm.rules.bestOfSets));
      setVbPointsPerSet(String(vbNorm.rules.pointsPerSet));
      setVbMinMargin(String(vbNorm.rules.minMargin));
      setVbFinalSetPoints(String(vbNorm.rules.finalSetPoints));
      setVbFinalSetMinMargin(String(vbNorm.rules.finalSetMinMargin));
      setVbAutoCompleteSets(vbNorm.rules.autoCompleteSets);
      setVbAllowManualWinner(vbNorm.rules.allowManualWinnerDeclaration);
      setVbAllowMatchReopen(vbNorm.rules.allowMatchReopen);
      setTeamAPlayers(
        Array.isArray(initialStream.teamAPlayers)
          ? initialStream.teamAPlayers.map((p) => ({ ...p }))
          : []
      );
      setTeamBPlayers(
        Array.isArray(initialStream.teamBPlayers)
          ? initialStream.teamBPlayers.map((p) => ({ ...p }))
          : []
      );
      setCustomPosKeys({});
    } else {
      setGameName('');
      setMatchTitle('');
      setTeamAId('');
      setTeamBId('');
      setTeamAName('');
      setTeamBName('');
      setTeamALogo('');
      setTeamBLogo('');
      setTournamentId('');
      setTournamentName('');
      setVenueId('');
      setLocation('');
      setMatchDate('');
      setMatchDescription('');
      setScoreboardPosition('BOTTOM');
      setViewerCountVisibility('public');
      setScoreboardVisibleByDefault(true);
      setShowScoreboardOnYoutube(true);
      setChatEnabled(true);
      setHighlightsEnabled(true);
      setOversLimit('20');
      setPlayersPerSide('11');
      setVbBestOfSets('5');
      setVbPointsPerSet('25');
      setVbMinMargin('2');
      setVbFinalSetPoints('15');
      setVbFinalSetMinMargin('2');
      setVbAutoCompleteSets(true);
      setVbAllowManualWinner(true);
      setVbAllowMatchReopen(true);
      setTeamAPlayers([]);
      setTeamBPlayers([]);
      setCustomPosKeys({});
    }
  }, [open, mode, initialStream]);

  const positionPresets = getSportPositions(gameName);

  function addDraftPlayer(side: 'A' | 'B') {
    const updater = side === 'A' ? setTeamAPlayers : setTeamBPlayers;
    updater((prev) => [
      ...prev,
      { id: `draft_${side}_${Date.now()}_${prev.length}`, name: '', position: '' },
    ]);
  }

  function updateDraftPlayer(
    side: 'A' | 'B',
    index: number,
    patch: Partial<MatchDraftPlayerData>
  ) {
    const updater = side === 'A' ? setTeamAPlayers : setTeamBPlayers;
    updater((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }

  function removeDraftPlayer(side: 'A' | 'B', index: number) {
    const updater = side === 'A' ? setTeamAPlayers : setTeamBPlayers;
    updater((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function importSavedTeamPlayers(side: 'A' | 'B', selectedTeamId: string) {
    if (!selectedTeamId) return;
    try {
      setImportingRosterSide(side);
      const list = await entityService.listPlayers({ teamId: selectedTeamId });
      const updater = side === 'A' ? setTeamAPlayers : setTeamBPlayers;
      updater((prev) => {
        const existingNames = new Set(
          prev.map((p) => p.name.trim().toLowerCase()).filter(Boolean)
        );
        const cleanedPrev = prev.filter((p) => p.name.trim().length > 0);
        const imported: MatchDraftPlayerData[] = list
          .filter((p) => p.name && !existingNames.has(p.name.trim().toLowerCase()))
          .map((p) => ({
            id: p.id || p._id,
            name: p.name,
            position: p.position || p.role || '',
            jerseyNumber: p.jerseyNumber ?? null,
          }));
        return [...cleanedPrev, ...imported].slice(0, 30);
      });
    } catch {
      // Optional helper; fail silently
    } finally {
      setImportingRosterSide(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      let vbRulesPayload: Record<string, unknown> | undefined;
      if (gameName === 'Volleyball') {
        const vbValidated = validateVolleyballRules({
          bestOfSets: Number(vbBestOfSets),
          pointsPerSet: Number(vbPointsPerSet),
          minMargin: Number(vbMinMargin),
          finalSetPoints: Number(vbFinalSetPoints),
          finalSetMinMargin: Number(vbFinalSetMinMargin),
          autoCompleteSets: vbAutoCompleteSets,
          allowManualWinnerDeclaration: vbAllowManualWinner,
          allowMatchReopen: vbAllowMatchReopen,
        });
        if (!vbValidated.valid) {
          setError(vbValidated.error || 'Please enter valid Volleyball rules.');
          setSubmitting(false);
          return;
        }
        vbRulesPayload = vbValidated.rules as unknown as Record<string, unknown>;
      }

      const payload: Record<string, unknown> = {
        gameName,
        matchTitle: matchTitle.trim(),
        teamAId: teamAId || null,
        teamBId: teamBId || null,
        teamAName: teamAName.trim(),
        teamBName: teamBName.trim(),
        teamALogo: teamALogo.trim(),
        teamBLogo: teamBLogo.trim(),
        teamAPlayers: sanitizeDraftPlayersClient(teamAPlayers),
        teamBPlayers: sanitizeDraftPlayersClient(teamBPlayers),
        tournamentId: tournamentId || null,
        tournamentName: tournamentName.trim(),
        venueId: venueId || null,
        location: location.trim(),
        matchDate: matchDate || null,
        matchDescription: matchDescription.trim(),
        scoreboardPosition,
        viewerCountVisibility,
        scoreboardVisibleByDefault,
        showScoreboardOnYoutube,
        chatEnabled,
        highlightsEnabled,
        ...(gameName === 'Cricket'
          ? {
              oversLimit: Math.max(1, Math.min(90, Math.floor(Number(oversLimit) || 20))),
              playersPerSide: Math.max(2, Math.min(15, Math.floor(Number(playersPerSide) || 11))),
            }
          : {}),
        ...(gameName === 'Volleyball' && vbRulesPayload
          ? {
              bestOfSets: Number(vbBestOfSets),
              volleyballRules: vbRulesPayload,
            }
          : {}),
      };

      if (mode === 'edit' && initialStream) {
        const updated = await liveStreamService.updateStream(initialStream.id, payload);
        onClose();
        await onUpdated?.(updated);
      } else {
        const res = await liveStreamService.initializeMatch(payload);
        if (res.stream?.id) {
          await offlineScoreQueue.clearStream(res.stream.id).catch(() => {});
        }
        onClose();
        await onInitialized?.(res.stream);
      }
    } catch (err) {
      setError(
        extractApiError(
          err,
          mode === 'edit' ? 'Failed to update match setup.' : 'Failed to initialize match session.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Step 1 — Edit Match Setup' : 'Step 1 — New Match Setup'}
      subtitle={
        mode === 'edit'
          ? 'Update match metadata, teams, scoreboard layout, and viewer privacy without interrupting OBS or YouTube.'
          : 'Configure match teams, format, and viewer privacy first. You will connect YouTube Live and activate playback inside the Control Room.'
      }
      maxWidthClass="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

        {mode === 'create' && (
          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 flex items-start gap-2.5 text-xs text-sky-900">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">
                No YouTube URL required yet — Initialize Match keeps the broadcast unpublished
              </p>
              <p className="text-sky-800/90 leading-relaxed">
                Clicking <strong>Initialize Match</strong> creates a fresh prepared match session, resets any previous match&apos;s scoreboard state, and makes the Scorer Console + OBS Browser Source Overlay ready while staying hidden from players until you connect YouTube and click <strong>Activate Broadcast</strong>.
              </p>
            </div>
          </div>
        )}

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
              placeholder="e.g. Semi-Final 1 · Tigers vs Royals"
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {gameName === 'Cricket' && (
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-orange-50/60 border border-orange-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900">
                  Cricket Format Configuration (Overs &amp; Squad Size)
                </p>
                <span className="text-[11px] font-mono text-orange-800 font-semibold">
                  {Math.max(1, Math.min(90, Number(oversLimit) || 20))} Overs ·{' '}
                  {Math.max(2, Math.min(15, Number(playersPerSide) || 11))}/side
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CRICKET_OVER_PRESETS.map((ov) => (
                  <button
                    key={ov}
                    type="button"
                    onClick={() => setOversLimit(String(ov))}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border transition-colors ${
                      Number(oversLimit) === ov
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {ov} ov
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Match Overs Limit (1–90)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={oversLimit}
                    onChange={(e) => setOversLimit(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Players per Side (2–15)
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={playersPerSide}
                    onChange={(e) => setPlayersPerSide(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {gameName === 'Volleyball' && (
            <div className="sm:col-span-2 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-900">
                  Volleyball Format &amp; Match Rules
                </p>
                <span className="text-[11px] font-mono text-amber-900 font-semibold">
                  Best of {Math.max(1, Number(vbBestOfSets) || 5)} · Win Threshold:{' '}
                  {Math.ceil(Math.max(1, Number(vbBestOfSets) || 5) / 2)} set
                  {Math.ceil(Math.max(1, Number(vbBestOfSets) || 5) / 2) === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {VOLLEYBALL_SET_PRESETS.map((bo) => (
                  <button
                    key={bo}
                    type="button"
                    onClick={() => setVbBestOfSets(String(bo))}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold border transition-colors whitespace-nowrap ${
                      Number(vbBestOfSets) === bo
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    Best of {bo}
                  </button>
                ))}
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 ml-1">
                  <span>Custom (Odd 1–15):</span>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    step={2}
                    value={vbBestOfSets}
                    onChange={(e) => setVbBestOfSets(e.target.value)}
                    className="w-16 min-h-[30px] px-2 py-0.5 text-xs font-mono border border-slate-300 rounded bg-white"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Points / Set
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={99}
                    value={vbPointsPerSet}
                    onChange={(e) => setVbPointsPerSet(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Min Margin
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={vbMinMargin}
                    onChange={(e) => setVbMinMargin(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Final Set Points
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={99}
                    value={vbFinalSetPoints}
                    onChange={(e) => setVbFinalSetPoints(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Final Margin
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={vbFinalSetMinMargin}
                    onChange={(e) => setVbFinalSetMinMargin(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 text-sm font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-700">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vbAutoCompleteSets}
                    onChange={(e) => setVbAutoCompleteSets(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900"
                  />
                  <span>Auto-complete set on target + margin</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vbAllowManualWinner}
                    onChange={(e) => setVbAllowManualWinner(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900"
                  />
                  <span>Allow manual winner anytime</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vbAllowMatchReopen}
                    onChange={(e) => setVbAllowMatchReopen(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900"
                  />
                  <span>Allow reopen after completion</span>
                </label>
              </div>
            </div>
          )}

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
              placeholder="Team A name"
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
              placeholder="Team B name"
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

        {/* Optional Team Squads & Sport Positions */}
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#EA580C]" />
                <span>Team Players &amp; Positions (Optional — All Sports)</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Add players and positions now to pick them from dropdowns while live scoring. Nothing here is required to draft or start the match.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {gameName ? `${gameName} positions` : 'General positions'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(
              [
                {
                  side: 'A' as const,
                  title: teamAName.trim() || 'Team A',
                  selectedTeamId: teamAId,
                  list: teamAPlayers,
                },
                {
                  side: 'B' as const,
                  title: teamBName.trim() || 'Team B',
                  selectedTeamId: teamBId,
                  list: teamBPlayers,
                },
              ] as const
            ).map((teamBox) => (
              <div
                key={teamBox.side}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {teamBox.title} Squad ({teamBox.list.filter((p) => p.name.trim()).length})
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {teamBox.selectedTeamId && (
                      <button
                        type="button"
                        disabled={importingRosterSide === teamBox.side}
                        onClick={() => importSavedTeamPlayers(teamBox.side, teamBox.selectedTeamId)}
                        className="min-h-[30px] px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 disabled:opacity-50"
                      >
                        {importingRosterSide === teamBox.side ? 'Loading...' : 'Import DB Squad'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => addDraftPlayer(teamBox.side)}
                      className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-slate-900 rounded-md hover:bg-slate-800"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Player</span>
                    </button>
                  </div>
                </div>

                {teamBox.list.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-1.5">
                    No players added yet (optional). Click <strong>Add Player</strong> to list squad members.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {teamBox.list.map((player, idx) => {
                      const rowKey = `${teamBox.side}_${idx}`;
                      const curPos = player.position || '';
                      const isPresetPos = !curPos || positionPresets.includes(curPos);
                      const showCustomPos = Boolean(customPosKeys[rowKey]) || !isPresetPos;
                      return (
                        <div key={rowKey} className="grid grid-cols-12 gap-1.5 items-center">
                          <input
                            type="text"
                            value={player.name}
                            onChange={(e) =>
                              updateDraftPlayer(teamBox.side, idx, { name: e.target.value })
                            }
                            placeholder={`Player ${idx + 1} name`}
                            aria-label={`${teamBox.title} Player ${idx + 1} name`}
                            className="col-span-6 min-h-[36px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                          {!showCustomPos ? (
                            <select
                              value={curPos}
                              aria-label={`${teamBox.title} Player ${idx + 1} position`}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__CUSTOM__') {
                                  setCustomPosKeys((prev) => ({ ...prev, [rowKey]: true }));
                                  return;
                                }
                                updateDraftPlayer(teamBox.side, idx, { position: val });
                              }}
                              className="col-span-5 min-h-[36px] px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                            >
                              <option value="">Position (Opt.)</option>
                              {positionPresets.map((pos) => (
                                <option key={pos} value={pos}>
                                  {pos}
                                </option>
                              ))}
                              <option value="__CUSTOM__">Custom position...</option>
                            </select>
                          ) : (
                            <div className="col-span-5 flex items-center gap-1">
                              <input
                                type="text"
                                value={curPos}
                                onChange={(e) =>
                                  updateDraftPlayer(teamBox.side, idx, { position: e.target.value })
                                }
                                placeholder="Position"
                                aria-label={`${teamBox.title} Player ${idx + 1} custom position`}
                                className="w-full min-h-[36px] px-2 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomPosKeys((prev) => ({ ...prev, [rowKey]: false }));
                                  if (curPos && !positionPresets.includes(curPos)) {
                                    updateDraftPlayer(teamBox.side, idx, { position: '' });
                                  }
                                }}
                                title="Use preset positions"
                                className="min-h-[36px] px-1.5 text-[10px] font-semibold bg-white border border-slate-300 rounded-lg text-slate-600"
                              >
                                List
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeDraftPlayer(teamBox.side, idx)}
                            aria-label={`Remove ${player.name || `player ${idx + 1}`}`}
                            className="col-span-1 min-h-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-red-600 hover:border-red-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
          <div className="space-y-3">
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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Viewer Count Visibility
              </label>
              <select
                value={viewerCountVisibility}
                onChange={(e) =>
                  setViewerCountVisibility(e.target.value as ViewerCountVisibility)
                }
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="public">Public (Visible on Player Portal)</option>
                <option value="admin_only">Admin Only (Hidden from Public)</option>
                <option value="hidden">Hidden Everywhere</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-2.5 pt-2">
            <label className="flex flex-col gap-1 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-800 cursor-pointer hover:bg-slate-50">
              <span className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showScoreboardOnYoutube}
                  onChange={(e) => setShowScoreboardOnYoutube(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#EA580C]"
                />
                <span className="font-semibold">Scoreboard on YouTube (OBS Overlay)</span>
              </span>
              <span className="text-[11px] text-slate-500 pl-6 leading-snug">
                {showScoreboardOnYoutube
                  ? 'Checked: Scoreboard appears on YouTube Live (via OBS) and MaidanLive.'
                  : 'Unchecked: Clean YouTube video — scoreboard appears only inside MaidanLive embedded video.'}
              </span>
            </label>
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

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {mode === 'edit' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>
              {submitting
                ? mode === 'edit'
                  ? 'Saving...'
                  : 'Initializing...'
                : mode === 'edit'
                  ? 'Save Match Metadata'
                  : 'Initialize Match (Unpublished)'}
            </span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
