import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  ExternalLink,
  GitBranch,
  Link2,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  FixtureData,
  LiveStreamData,
  PointsTableRow,
  TeamData,
  TournamentData,
  TournamentFormat,
  VenueData,
} from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { tournamentWorkflowService } from '../../services/tournaments/tournamentWorkflowService.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

type FixturesViewTab = 'LIST' | 'BRACKET' | 'STANDINGS';

export function AdminFixturesPage() {
  const { id: routeTournamentId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState<TournamentData[]>([]);
  const [selectedId, setSelectedId] = useState(routeTournamentId || '');
  const [fixtures, setFixtures] = useState<FixtureData[]>([]);
  const [standings, setStandings] = useState<PointsTableRow[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [venues, setVenues] = useState<VenueData[]>([]);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);

  const [viewTab, setViewTab] = useState<FixturesViewTab>('LIST');
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-generate modal
  const [genOpen, setGenOpen] = useState(false);
  const [genFormat, setGenFormat] = useState<TournamentFormat>('KNOCKOUT');
  const [genTeamIds, setGenTeamIds] = useState<string[]>([]);
  const [genGroupCount, setGenGroupCount] = useState('2');
  const [genReplace, setGenReplace] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Manual create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [roundNumber, setRoundNumber] = useState('1');
  const [roundName, setRoundName] = useState('Round 1');
  const [groupName, setGroupName] = useState('');
  const [matchNumber, setMatchNumber] = useState('1');
  const [teamAId, setTeamAId] = useState('');
  const [teamBId, setTeamBId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [savingFixture, setSavingFixture] = useState(false);

  // Link live stream modal
  const [linkTarget, setLinkTarget] = useState<FixtureData | null>(null);
  const [linkStreamId, setLinkStreamId] = useState('');
  const [linkYoutubeInput, setLinkYoutubeInput] = useState('');
  const [linkStatus, setLinkStatus] = useState<'UPCOMING' | 'LIVE'>('UPCOMING');
  const [linking, setLinking] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<FixtureData | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadBase = useCallback(async () => {
    try {
      setError(null);
      const [allTours, allTeams, allVenues, allStreams] = await Promise.all([
        entityService.listTournaments(),
        entityService.listTeams(),
        platformOpsService.listVenues().catch(() => [] as VenueData[]),
        liveStreamService.listStreams(),
      ]);
      setTournaments(allTours);
      setTeams(allTeams);
      setVenues(allVenues);
      setStreams(allStreams);

      if (routeTournamentId) {
        setSelectedId(routeTournamentId);
      } else if (allTours.length > 0 && !selectedId) {
        setSelectedId(allTours[0].id);
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to load tournament metadata.'));
    } finally {
      setLoading(false);
    }
  }, [routeTournamentId, selectedId]);

  const loadTournamentFixtures = useCallback(async (tid: string) => {
    if (!tid) return;
    try {
      setLoadingDetails(true);
      setError(null);
      const [fxList, table] = await Promise.all([
        tournamentWorkflowService.listFixtures(tid),
        tournamentWorkflowService.getStandings(tid),
      ]);
      setFixtures(fxList);
      setStandings(table);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load fixtures and standings.'));
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (routeTournamentId && routeTournamentId !== selectedId) {
      setSelectedId(routeTournamentId);
    }
  }, [routeTournamentId, selectedId]);

  useEffect(() => {
    if (selectedId) {
      loadTournamentFixtures(selectedId);
    }
  }, [selectedId, loadTournamentFixtures]);

  const selectedTournament = tournaments.find((t) => t.id === selectedId) || null;
  const tournamentTeams = teams.filter((tm) => {
    const tid =
      typeof tm.tournamentId === 'object' && tm.tournamentId
        ? tm.tournamentId._id
        : tm.tournamentId;
    return (
      tid === selectedId ||
      (selectedTournament?.teamIds || []).includes(tm.id)
    );
  });
  const eligibleTeams = tournamentTeams.length >= 2 ? tournamentTeams : teams;

  function openGenerateModal() {
    if (!selectedTournament) return;
    setGenFormat(selectedTournament.format || 'KNOCKOUT');
    const preselected = eligibleTeams.map((t) => t.id);
    setGenTeamIds(preselected);
    setGenGroupCount(String(selectedTournament.groupCount || 2));
    setGenReplace(false);
    setGenOpen(true);
  }

  function openCreateModal() {
    setRoundNumber('1');
    setRoundName('Round 1');
    setGroupName('');
    setMatchNumber(String(fixtures.length + 1));
    setTeamAId('');
    setTeamBId('');
    setVenueId('');
    setLocation(selectedTournament?.location || '');
    setScheduledAt('');
    setCreateOpen(true);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    if (genTeamIds.length < 2) {
      setError('Select at least 2 teams to generate fixtures.');
      return;
    }
    try {
      setGenerating(true);
      setError(null);
      await tournamentWorkflowService.generateFixtures(selectedId, {
        format: genFormat,
        teamIds: genTeamIds,
        groupCount: Math.max(1, Number(genGroupCount) || 2),
        replaceExisting: genReplace,
      });
      setGenOpen(false);
      setSuccess('Fixtures and bracket slots generated in MongoDB.');
      await loadTournamentFixtures(selectedId);
    } catch (err) {
      setError(extractApiError(err, 'Failed to generate fixtures.'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateFixture(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    try {
      setSavingFixture(true);
      setError(null);
      const tA = teams.find((t) => t.id === teamAId);
      const tB = teams.find((t) => t.id === teamBId);
      await tournamentWorkflowService.createFixture(selectedId, {
        roundNumber: Math.max(1, Number(roundNumber) || 1),
        roundName: roundName.trim() || `Round ${roundNumber}`,
        groupName: groupName.trim(),
        matchNumber: Math.max(1, Number(matchNumber) || 1),
        teamAId: teamAId || null,
        teamBId: teamBId || null,
        teamAName: tA?.name || 'TBD',
        teamBName: tB?.name || 'TBD',
        venueId: venueId || null,
        location: location.trim(),
        scheduledAt: scheduledAt || null,
      });
      setCreateOpen(false);
      setSuccess('Fixture scheduled.');
      await loadTournamentFixtures(selectedId);
    } catch (err) {
      setError(extractApiError(err, 'Failed to create fixture.'));
    } finally {
      setSavingFixture(false);
    }
  }

  async function handleLinkStream(e: React.FormEvent) {
    e.preventDefault();
    if (!linkTarget) return;
    if (!linkStreamId && !linkYoutubeInput.trim()) {
      setError('Select an existing live stream or enter a YouTube Video ID / URL to create one.');
      return;
    }
    try {
      setLinking(true);
      setError(null);
      await tournamentWorkflowService.linkStream(linkTarget.id, {
        liveStreamId: linkStreamId || undefined,
        youtubeInput: linkYoutubeInput.trim() || undefined,
        status: linkStatus,
      });
      setLinkTarget(null);
      setLinkStreamId('');
      setLinkYoutubeInput('');
      setSuccess('Live stream linked to fixture.');
      await Promise.all([loadBase(), loadTournamentFixtures(selectedId)]);
    } catch (err) {
      setError(extractApiError(err, 'Failed to link stream to fixture.'));
    } finally {
      setLinking(false);
    }
  }

  async function handleDeleteFixture() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await tournamentWorkflowService.deleteFixture(deleteTarget.id);
      setDeleteTarget(null);
      setSuccess('Fixture removed.');
      await loadTournamentFixtures(selectedId);
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete fixture.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Fixtures, Brackets &amp; Standings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate knockout brackets or group/league schedules, link live streams, and review points tables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedId && (
            <>
              <button
                type="button"
                onClick={openGenerateModal}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
              >
                <Sparkles className="w-4 h-4" />
                <span>Auto-Generate</span>
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <Plus className="w-4 h-4" />
                <span>Add Fixture</span>
              </button>
            </>
          )}
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6" />}
          title="No tournaments found"
          description="Create a tournament first before generating brackets and match fixtures."
          action={
            <Link
              to="/admin/tournaments"
              className="min-h-[42px] inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg"
            >
              Go to Tournaments
            </Link>
          }
        />
      ) : (
        <>
          {/* Tournament Selector + View Switcher */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Tournament:
              </label>
              <select
                value={selectedId}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedId(next);
                  navigate(`/admin/tournaments/${next}/fixtures`);
                }}
                className="flex-1 max-w-md min-h-[40px] px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-lg bg-white"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.sportType} · {(t.format || 'KNOCKOUT').replace(/_/g, ' ')})
                  </option>
                ))}
              </select>
              {selectedId && (
                <Link
                  to={`/tournaments/${selectedId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 whitespace-nowrap"
                >
                  <span>Public Page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
              {(
                [
                  ['LIST', 'Fixtures List'],
                  ['BRACKET', 'Bracket View'],
                  ['STANDINGS', 'Points Table'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setViewTab(tab)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    viewTab === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingDetails ? (
            <TableSkeleton rows={4} />
          ) : viewTab === 'BRACKET' ? (
            <TournamentBracket fixtures={fixtures} />
          ) : viewTab === 'STANDINGS' ? (
            standings.length === 0 ? (
              <EmptyState
                icon={<Trophy className="w-6 h-6" />}
                title="No standings data yet"
                description="Standings calculate automatically from confirmed match results."
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Team</th>
                      <th className="py-3 px-4">Group</th>
                      <th className="py-3 px-4 font-mono">P</th>
                      <th className="py-3 px-4 font-mono">W</th>
                      <th className="py-3 px-4 font-mono">L</th>
                      <th className="py-3 px-4 font-mono">D/T</th>
                      <th className="py-3 px-4 font-mono">Pts</th>
                      <th className="py-3 px-4 font-mono">Diff / NRR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {standings.map((row, idx) => (
                      <tr key={row.teamId} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{row.teamName}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{row.groupName || '—'}</td>
                        <td className="py-3 px-4 font-mono tabular-nums">{row.played}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-emerald-700 font-semibold">
                          {row.won}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-red-600">{row.lost}</td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {row.drawn + row.tied}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900">
                          {row.points}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                          {row.netRunRate !== null && row.netRunRate !== undefined
                            ? `NRR ${row.netRunRate >= 0 ? '+' : ''}${row.netRunRate.toFixed(3)}`
                            : `${row.scoreDiff >= 0 ? '+' : ''}${row.scoreDiff}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : fixtures.length === 0 ? (
            <EmptyState
              icon={<GitBranch className="w-6 h-6" />}
              title="No fixtures created yet"
              description="Use Auto-Generate to build knockout or league fixtures from participating teams, or add a single fixture manually."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Match</th>
                    <th className="py-3 px-4">Teams</th>
                    <th className="py-3 px-4">Schedule / Venue</th>
                    <th className="py-3 px-4">Status / Result</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {fixtures.map((fx) => {
                    const streamObj =
                      typeof fx.liveStreamId === 'object' && fx.liveStreamId ? fx.liveStreamId : null;
                    const linkedStreamId = streamObj
                      ? streamObj.id || streamObj._id
                      : (fx.liveStreamId as string | null);

                    return (
                      <tr key={fx.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">
                            {fx.roundName || `Round ${fx.roundNumber}`}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            Match #{fx.matchNumber}
                            {fx.groupName ? ` · ${fx.groupName}` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div>{fx.teamAName || 'TBD'}</div>
                          <div className="text-xs text-slate-400">vs</div>
                          <div>{fx.teamBName || (fx.isBye ? 'BYE' : 'TBD')}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          <div className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {fx.scheduledAt
                                ? new Date(fx.scheduledAt).toLocaleString()
                                : 'Unscheduled'}
                            </span>
                          </div>
                          {fx.location && <div className="text-slate-500 mt-0.5">{fx.location}</div>}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-semibold ${
                              fx.status === 'LIVE'
                                ? 'bg-red-100 text-red-700'
                                : fx.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {fx.status}
                          </span>
                          {fx.resultSummary && (
                            <p className="text-emerald-800 font-medium mt-1">{fx.resultSummary}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {linkedStreamId ? (
                            <Link
                              to={`/admin/scoreboard/${linkedStreamId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-md mr-1"
                            >
                              <Radio className="w-3.5 h-3.5" />
                              <span>Scoreboard</span>
                            </Link>
                          ) : (
                            !fx.isBye && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLinkTarget(fx);
                                  setLinkStreamId('');
                                  setLinkYoutubeInput('');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-md mr-1"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>Link Stream</span>
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(fx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Auto-Generate Modal */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Auto-Generate Fixtures & Bracket"
        subtitle="Creates structured match slots in MongoDB and links next-round knockout progression automatically."
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Format</label>
              <select
                value={genFormat}
                onChange={(e) => setGenFormat(e.target.value as TournamentFormat)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="KNOCKOUT">Knockout Bracket</option>
                <option value="LEAGUE">League / Round-Robin</option>
                <option value="GROUP_STAGE">Group Stage</option>
                <option value="GROUP_KNOCKOUT">Group Stage + Knockout</option>
              </select>
            </div>
            {(genFormat === 'GROUP_STAGE' || genFormat === 'GROUP_KNOCKOUT') && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Number of Groups
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={genGroupCount}
                  onChange={(e) => setGenGroupCount(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Select Teams ({genTeamIds.length} selected)
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border border-slate-200 rounded-lg bg-slate-50">
              {eligibleTeams.map((tm) => (
                <label key={tm.id} className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={genTeamIds.includes(tm.id)}
                    onChange={() =>
                      setGenTeamIds((prev) =>
                        prev.includes(tm.id) ? prev.filter((x) => x !== tm.id) : [...prev, tm.id]
                      )
                    }
                    className="w-3.5 h-3.5 rounded border-slate-300"
                  />
                  <span className="truncate">{tm.name}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={genReplace}
              onChange={(e) => setGenReplace(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-red-600"
            />
            <span>Replace existing fixtures for this tournament</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setGenOpen(false)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating || genTeamIds.length < 2}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate Fixtures'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manual Fixture Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Schedule Manual Fixture"
      >
        <form onSubmit={handleCreateFixture} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Round #</label>
              <input
                type="number"
                min={1}
                value={roundNumber}
                onChange={(e) => setRoundNumber(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Match #</label>
              <input
                type="number"
                min={1}
                value={matchNumber}
                onChange={(e) => setMatchNumber(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Round Name</label>
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="Quarter Final"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Group (Optional)
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group A"
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Team A</label>
              <select
                value={teamAId}
                onChange={(e) => setTeamAId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">TBD</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Team B</label>
              <select
                value={teamBId}
                onChange={(e) => setTeamBId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">TBD</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Venue</label>
              <select
                value={venueId}
                onChange={(e) => {
                  const id = e.target.value;
                  setVenueId(id);
                  const found = venues.find((v) => v.id === id);
                  if (found) setLocation([found.name, found.city].filter(Boolean).join(', '));
                }}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Manual location</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Scheduled Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingFixture}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {savingFixture ? 'Saving...' : 'Create Fixture'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Link Live Stream Modal */}
      <Modal
        open={Boolean(linkTarget)}
        onClose={() => setLinkTarget(null)}
        title="Link Live Stream to Fixture"
        subtitle={
          linkTarget
            ? `${linkTarget.teamAName || 'TBD'} vs ${linkTarget.teamBName || 'TBD'}`
            : ''
        }
      >
        <form onSubmit={handleLinkStream} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Select Existing Stream (Optional)
            </label>
            <select
              value={linkStreamId}
              onChange={(e) => setLinkStreamId(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">-- Or create a new stream below --</option>
              {streams.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.status}] {s.matchTitle || `${s.teamAName} vs ${s.teamBName}` || s.youtubeVideoId}
                </option>
              ))}
            </select>
          </div>

          {!linkStreamId && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Or Enter YouTube Video ID / URL to Launch New Stream
                </label>
                <input
                  type="text"
                  value={linkYoutubeInput}
                  onChange={(e) => setLinkYoutubeInput(e.target.value)}
                  placeholder="e.g. dQw4w9WgXcQ or https://youtube.com/live/..."
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Initial Stream Status
                </label>
                <select
                  value={linkStatus}
                  onChange={(e) => setLinkStatus(e.target.value as 'UPCOMING' | 'LIVE')}
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="LIVE">LIVE</option>
                </select>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setLinkTarget(null)}
              className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={linking}
              className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {linking ? 'Linking...' : 'Link Stream'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteFixture}
        loading={deleting}
        title="Delete Fixture"
        message={`Remove Match #${deleteTarget?.matchNumber} (${deleteTarget?.teamAName} vs ${deleteTarget?.teamBName})?`}
        confirmLabel="Delete"
      />
    </div>
  );
}
