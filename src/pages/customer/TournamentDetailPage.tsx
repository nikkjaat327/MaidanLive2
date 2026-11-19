import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  GitBranch,
  MapPin,
  Plus,
  Table2,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import {
  FixtureData,
  LeaderboardEntry,
  LiveStreamData,
  PointsTableRow,
  RosterPlayerEntry,
  SponsorData,
  TeamData,
  TournamentData,
  TournamentRegistrationData,
  VenueData,
} from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket.tsx';

type TournamentTab = 'matches' | 'bracket' | 'standings' | 'teams' | 'leaderboards' | 'register';

function computeIsMinorFromDob(dob: string): boolean {
  if (!dob) return false;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const m = now.getMonth() - parsed.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < parsed.getDate())) {
    age--;
  }
  return age < 18;
}

function emptyPlayer(): RosterPlayerEntry {
  return {
    name: '',
    role: '',
    jerseyNumber: null,
    dateOfBirth: '',
    isMinor: false,
    guardianName: '',
    guardianPhone: '',
    guardianConsent: false,
  };
}

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { customerUser } = useAuth();
  const { t } = useLanguage();

  const [tournament, setTournament] = useState<TournamentData | null>(null);
  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [fixtures, setFixtures] = useState<FixtureData[]>([]);
  const [pointsTable, setPointsTable] = useState<PointsTableRow[]>([]);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [bannerSponsors, setBannerSponsors] = useState<SponsorData[]>([]);
  const [publicRegistrations, setPublicRegistrations] = useState<TournamentRegistrationData[]>([]);
  const [myRegistration, setMyRegistration] = useState<TournamentRegistrationData | null>(null);
  const [leaderboards, setLeaderboards] = useState<{
    entries: LeaderboardEntry[];
    insufficientData: boolean;
    message?: string;
  }>({ entries: [], insufficientData: true });
  const [activeTab, setActiveTab] = useState<TournamentTab>('matches');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Captain Registration Form state
  const [teamName, setTeamName] = useState('');
  const [teamShortName, setTeamShortName] = useState('');
  const [teamLogoUrl, setTeamLogoUrl] = useState('');
  const [city, setCity] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [captainPhone, setCaptainPhone] = useState('');
  const [verificationDocUrl, setVerificationDocUrl] = useState('');
  const [verificationNotes, setVerificationNotes] = useState('');
  const [roster, setRoster] = useState<RosterPlayerEntry[]>([emptyPlayer()]);
  const [regBusy, setRegBusy] = useState(false);
  const [regMessage, setRegMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const loadTournament = useCallback(async () => {
    if (!id) return;
    try {
      const [res, sponsors, pubRegs] = await Promise.all([
        entityService.getTournamentDetail(id),
        platformOpsService
          .listPublicSponsors({ placement: 'tournament_banner', tournamentId: id })
          .catch(() => []),
        platformOpsService.listPublicTournamentRegistrations(id).catch(() => []),
      ]);
      setTournament(res.tournament);
      setStreams(res.streams);
      setTeams(res.teams);
      setFixtures(res.fixtures || []);
      setPointsTable(res.pointsTable || []);
      setVenue(res.venue || null);
      setBannerSponsors(sponsors);
      setPublicRegistrations(pubRegs);
      sponsors.forEach((sp) => platformOpsService.trackSponsorImpression(sp.id));

      platformOpsService
        .getLeaderboards({ tournamentId: id, sportType: res.tournament.sportType })
        .then(setLeaderboards)
        .catch(() => {});
    } catch (err) {
      setError(extractApiError(err, 'Unable to load tournament details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadMyRegistration = useCallback(async () => {
    if (!id || !customerUser) {
      setMyRegistration(null);
      return;
    }
    try {
      const reg = await platformOpsService.getMyTournamentRegistration(id);
      setMyRegistration(reg);
      if (reg) {
        setTeamName(reg.teamName || '');
        setTeamShortName(reg.teamShortName || '');
        setTeamLogoUrl(reg.teamLogoUrl || '');
        setCity(reg.city || '');
        setCaptainName(reg.captainName || customerUser.name);
        setCaptainPhone(reg.captainPhone || customerUser.phone || '');
        setVerificationDocUrl(reg.verificationDocUrl || '');
        setVerificationNotes(reg.verificationNotes || '');
        setRoster(reg.roster?.length ? reg.roster : [emptyPlayer()]);
      } else {
        setCaptainName(customerUser.name || '');
        setCaptainPhone(customerUser.phone || '');
      }
    } catch {
      // Non-blocking
    }
  }, [id, customerUser]);

  useEffect(() => {
    setLoading(true);
    loadTournament();
  }, [loadTournament]);

  useEffect(() => {
    loadMyRegistration();
  }, [loadMyRegistration]);

  // Real-time tournament points/bracket socket updates
  useEffect(() => {
    if (!id) return;
    const socket = getSocketClient();
    socket.emit('tournament:join', id);
    const handlePointsUpdated = (payload: { tournamentId?: string }) => {
      if (payload?.tournamentId === id) {
        loadTournament();
      }
    };
    socket.on('tournament:points_updated', handlePointsUpdated);
    return () => {
      socket.off('tournament:points_updated', handlePointsUpdated);
    };
  }, [id, loadTournament]);

  function updateRosterRow(index: number, patch: Partial<RosterPlayerEntry>) {
    setRoster((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        const next = { ...row, ...patch };
        if (patch.dateOfBirth !== undefined) {
          next.isMinor = computeIsMinorFromDob(patch.dateOfBirth);
        }
        return next;
      })
    );
  }

  async function handleSubmitRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setRegMessage(null);

    const cleanedRoster = roster.filter((p) => p.name.trim());
    if (cleanedRoster.length === 0) {
      setRegMessage({ type: 'error', text: 'Please add at least one player to your roster.' });
      return;
    }

    for (const p of cleanedRoster) {
      if (p.isMinor && (!p.guardianName?.trim() || !p.guardianPhone?.trim() || !p.guardianConsent)) {
        setRegMessage({
          type: 'error',
          text: `Player "${p.name}" is under 18. Guardian name, phone, and consent checkbox are mandatory.`,
        });
        return;
      }
    }

    try {
      setRegBusy(true);
      const payload = {
        teamName: teamName.trim(),
        teamShortName: teamShortName.trim().toUpperCase(),
        teamLogoUrl: teamLogoUrl.trim(),
        city: city.trim(),
        captainName: captainName.trim(),
        captainPhone: captainPhone.trim(),
        verificationDocUrl: verificationDocUrl.trim(),
        verificationNotes: verificationNotes.trim(),
        roster: cleanedRoster,
      };

      if (myRegistration && (myRegistration.status === 'PENDING' || myRegistration.status === 'REJECTED')) {
        const updated = await platformOpsService.updateRegistration(myRegistration.id, payload);
        setMyRegistration(updated);
        setRegMessage({
          type: 'success',
          text: 'Registration updated and resubmitted for organizer verification.',
        });
      } else {
        const res = await platformOpsService.registerTeamForTournament(id, payload);
        setMyRegistration(res.registration);
        setRegMessage({ type: 'success', text: res.message || 'Registration submitted!' });
      }
      loadTournament();
    } catch (err) {
      setRegMessage({
        type: 'error',
        text: extractApiError(err, 'Failed to submit team registration.'),
      });
    } finally {
      setRegBusy(false);
    }
  }

  async function handleWithdrawRegistration() {
    if (!myRegistration) return;
    try {
      setRegBusy(true);
      const updated = await platformOpsService.withdrawRegistration(myRegistration.id);
      setMyRegistration(updated);
      setRegMessage({ type: 'success', text: 'Registration withdrawn.' });
    } catch (err) {
      setRegMessage({
        type: 'error',
        text: extractApiError(err, 'Failed to withdraw registration.'),
      });
    } finally {
      setRegBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-64" />
        <div className="h-32 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-4">
        <FeedbackBanner type="error" message={error || 'Tournament not found.'} />
        <Link to="/tournaments" className="inline-flex items-center gap-2 text-sm text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tournaments</span>
        </Link>
      </div>
    );
  }

  const mapsUrl =
    venue && typeof venue.latitude === 'number' && typeof venue.longitude === 'number'
      ? `https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`
      : venue
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [venue.name, venue.address, venue.city, venue.state].filter(Boolean).join(', ')
          )}`
        : tournament.location
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(tournament.location)}`
          : null;

  const isCricket = tournament.sportType === 'Cricket';
  const regOpen = tournament.registrationOpen !== false && tournament.status !== 'COMPLETED';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Link
        to="/tournaments"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>All Tournaments</span>
      </Link>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            {tournament.logoUrl && (
              <img
                src={tournament.logoUrl}
                alt={tournament.name}
                className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
              />
            )}
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-bold text-[#EA580C] uppercase">{tournament.sportType}</span>
                {tournament.format && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                      {tournament.format.replace('_', ' ')}
                    </span>
                  </>
                )}
                {tournament.season && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{tournament.season}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-emerald-700">{tournament.status}</span>
                {tournament.prizeMoney && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                      Prize: {tournament.prizeMoney}
                    </span>
                  </>
                )}
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                {tournament.name}
              </h1>

              {tournament.organizerName && (
                <p className="text-xs text-slate-500">Organized by {tournament.organizerName}</p>
              )}
            </div>
          </div>

          {regOpen && (
            <button
              type="button"
              onClick={() => setActiveTab('register')}
              className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-700 transition-colors shrink-0"
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>
                {myRegistration
                  ? `Registration: ${myRegistration.status}`
                  : t('tournament.registerTeam')}
              </span>
            </button>
          )}
        </div>

        {tournament.description && (
          <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
            {tournament.description}
          </p>
        )}

        {(tournament.rules || tournament.qualificationRules) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {tournament.rules && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <p className="font-bold text-slate-900 mb-1">Tournament Rules</p>
                <p className="whitespace-pre-line">{tournament.rules}</p>
              </div>
            )}
            {tournament.qualificationRules && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                <p className="font-bold text-slate-900 mb-1">Qualification Rules</p>
                <p className="whitespace-pre-line">{tournament.qualificationRules}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500 pt-2">
          {(venue?.name || tournament.location) && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>
                {venue ? `${venue.name}${venue.city ? `, ${venue.city}` : ''}` : tournament.location}
              </span>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#EA580C] hover:underline font-semibold"
                >
                  <span>Directions</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          )}
          {tournament.startDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              <span>
                {new Date(tournament.startDate).toLocaleDateString()}
                {tournament.endDate ? ` – ${new Date(tournament.endDate).toLocaleDateString()}` : ''}
              </span>
            </span>
          )}
          {typeof tournament.registrationFee === 'number' && tournament.registrationFee > 0 && (
            <span className="font-mono font-semibold text-slate-700">
              Entry Fee: ₹{tournament.registrationFee}
            </span>
          )}
        </div>
      </div>

      {/* Tournament Sponsors Banner */}
      {bannerSponsors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {bannerSponsors.map((sp) => (
            <a
              key={sp.id}
              href={sp.websiteUrl || undefined}
              target={sp.websiteUrl ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={() => platformOpsService.trackSponsorClick(sp.id)}
              className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-orange-300 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {sp.logoUrl && (
                  <img
                    src={sp.logoUrl}
                    alt={sp.name}
                    className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-200 p-1 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {sp.sponsorshipType || 'Tournament Sponsor'}
                  </p>
                  <p className="text-xs font-bold text-slate-900 truncate">{sp.name}</p>
                  {sp.tagline && <p className="text-[11px] text-slate-500 truncate">{sp.tagline}</p>}
                </div>
              </div>
              {sp.websiteUrl && (
                <ExternalLink className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
              )}
            </a>
          ))}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {[
          { key: 'matches' as const, label: `Matches (${streams.length})`, icon: Trophy },
          { key: 'bracket' as const, label: `Bracket & Fixtures (${fixtures.length})`, icon: GitBranch },
          { key: 'standings' as const, label: `Points Table (${pointsTable.length})`, icon: Table2 },
          { key: 'teams' as const, label: `Teams (${teams.length})`, icon: Users },
          { key: 'leaderboards' as const, label: 'Leaderboards', icon: Award },
          ...(regOpen || myRegistration
            ? [{ key: 'register' as const, label: 'Team Registration', icon: ClipboardCheck }]
            : []),
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'matches' && (
        <section className="space-y-4">
          {streams.length === 0 ? (
            <EmptyState
              icon={<Trophy className="w-6 h-6" />}
              title="No matches linked yet"
              description="Streams associated with this tournament will show here."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {streams.map((s) => (
                <StreamCard key={s.id} stream={s} to={`/live/${s.id}`} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'bracket' && <TournamentBracket fixtures={fixtures} />}

      {activeTab === 'standings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {pointsTable.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Points table standings will populate automatically once teams and confirmed match results are recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-white uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-3 py-3">Grp</th>
                    <th className="px-3 py-3 text-right">P</th>
                    <th className="px-3 py-3 text-right">W</th>
                    <th className="px-3 py-3 text-right">L</th>
                    <th className="px-3 py-3 text-right">D/T</th>
                    <th className="px-3 py-3 text-right">NR</th>
                    <th className="px-3 py-3 text-right">Pts</th>
                    <th className="px-4 py-3 text-right">{isCricket ? 'NRR' : 'Diff'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {pointsTable.map((row, idx) => (
                    <tr key={row.teamId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 font-bold">{idx + 1}</td>
                      <td className="px-4 py-3 font-sans">
                        <Link
                          to={`/teams/${row.teamId}`}
                          className="inline-flex items-center gap-2.5 font-semibold text-slate-900 hover:text-[#EA580C]"
                        >
                          <TeamAvatar name={row.teamName} logoUrl={row.logoUrl} size="sm" />
                          <span>{row.teamName}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{row.groupName || '—'}</td>
                      <td className="px-3 py-3 text-right">{row.played}</td>
                      <td className="px-3 py-3 text-right text-emerald-700 font-semibold">{row.won}</td>
                      <td className="px-3 py-3 text-right text-red-600">{row.lost}</td>
                      <td className="px-3 py-3 text-right">{row.drawn + row.tied}</td>
                      <td className="px-3 py-3 text-right">{row.noResult}</td>
                      <td className="px-3 py-3 text-right font-bold text-slate-900">{row.points}</td>
                      <td className="px-4 py-3 text-right">
                        {isCricket
                          ? row.netRunRate !== null
                            ? row.netRunRate.toFixed(3)
                            : '0.000'
                          : row.scoreDiff >= 0
                            ? `+${row.scoreDiff}`
                            : row.scoreDiff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'teams' && (
        <section className="space-y-6">
          {teams.length === 0 && publicRegistrations.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No teams assigned yet"
              description="Participating teams added or approved for this tournament will appear here."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((team) => (
                <Link
                  key={team.id}
                  to={`/teams/${team.id}`}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-orange-300 transition-colors"
                >
                  <TeamAvatar name={team.name} logoUrl={team.logoUrl} />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{team.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {[team.city, team.captainName ? `Capt: ${team.captainName}` : '']
                        .filter(Boolean)
                        .join(' · ') || team.sportType}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'leaderboards' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          {leaderboards.insufficientData || leaderboards.entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              {leaderboards.message ||
                'No verified tournament player statistics have been recorded yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Player</th>
                    <th className="px-3 py-2.5">Team</th>
                    <th className="px-3 py-2.5 text-right">Matches</th>
                    {isCricket ? (
                      <>
                        <th className="px-3 py-2.5 text-right">Runs</th>
                        <th className="px-3 py-2.5 text-right">Wkts</th>
                      </>
                    ) : tournament.sportType === 'Kabaddi' ? (
                      <>
                        <th className="px-3 py-2.5 text-right">Raid Pts</th>
                        <th className="px-3 py-2.5 text-right">Tackle Pts</th>
                      </>
                    ) : tournament.sportType === 'Football' ? (
                      <>
                        <th className="px-3 py-2.5 text-right">Goals</th>
                        <th className="px-3 py-2.5 text-right">Assists</th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2.5 text-right">Attacks</th>
                        <th className="px-3 py-2.5 text-right">Blocks</th>
                      </>
                    )}
                    <th className="px-3 py-2.5 text-right">MVP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leaderboards.entries.map((entry) => (
                    <tr key={entry.playerId} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold">
                        <Link
                          to={`/players/${entry.playerId}`}
                          className="text-slate-900 hover:text-[#EA580C]"
                        >
                          {entry.playerName}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{entry.teamName || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{entry.matches}</td>
                      {isCricket ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.runs ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{entry.wickets ?? 0}</td>
                        </>
                      ) : tournament.sportType === 'Kabaddi' ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.raidPoints ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {entry.tacklePoints ?? 0}
                          </td>
                        </>
                      ) : tournament.sportType === 'Football' ? (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.goals ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">{entry.assists ?? 0}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">
                            {entry.attackPoints ?? 0}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {entry.blockPoints ?? 0}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2.5 text-right font-mono text-amber-700 font-bold">
                        {entry.mvpAwards ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Captain Team Registration Wizard Tab */}
      {activeTab === 'register' && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Captain Team Registration Wizard
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Submit your team roster &amp; verification document for organizer review. Verification documents stay strictly private to tournament organizers.
              </p>
            </div>
            {myRegistration && (
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  myRegistration.status === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : myRegistration.status === 'REJECTED'
                      ? 'bg-red-100 text-red-800'
                      : myRegistration.status === 'WITHDRAWN'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-amber-100 text-amber-900'
                }`}
              >
                Status: {myRegistration.status}
              </span>
            )}
          </div>

          {!customerUser ? (
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                Sign in or create a Team Captain account to register your squad.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link
                  to="/login"
                  className="min-h-[42px] inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="min-h-[42px] inline-flex items-center px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-semibold"
                >
                  Register as Captain
                </Link>
              </div>
            </div>
          ) : (
            <>
              {regMessage && (
                <FeedbackBanner
                  type={regMessage.type}
                  message={regMessage.text}
                  onDismiss={() => setRegMessage(null)}
                />
              )}

              {myRegistration?.status === 'APPROVED' && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3 text-xs text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                  <div>
                    <p className="font-bold">Team Approved &amp; Enrolled!</p>
                    <p className="mt-0.5">
                      "{myRegistration.teamName}" is officially registered with {myRegistration.roster?.length || 0} players.
                    </p>
                  </div>
                </div>
              )}

              {myRegistration?.status === 'REJECTED' && myRegistration.reviewNotes && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs text-red-900">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <p className="font-bold">Organizer Review Notes:</p>
                    <p className="mt-0.5">{myRegistration.reviewNotes}</p>
                  </div>
                </div>
              )}

              {myRegistration?.status !== 'APPROVED' && (
                <form onSubmit={handleSubmitRegistration} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Team Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        placeholder="e.g. Rampur Challengers"
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Short Code (3-6 chars)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={teamShortName}
                        onChange={(e) => setTeamShortName(e.target.value.toUpperCase())}
                        placeholder="RMP"
                        className="w-full min-h-[42px] px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Village / City
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Meerut"
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Captain Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={captainName}
                        onChange={(e) => setCaptainName(e.target.value)}
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Captain Phone
                      </label>
                      <input
                        type="tel"
                        value={captainPhone}
                        onChange={(e) => setCaptainPhone(e.target.value)}
                        placeholder="+91 98..."
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Team Logo URL (Optional)
                      </label>
                      <input
                        type="url"
                        value={teamLogoUrl}
                        onChange={(e) => setTeamLogoUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Private Verification Docs */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <p className="text-xs font-bold text-slate-800">
                      Private Organizer Verification (Hidden from public APIs)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Verification Document / ID Proof Link (URL)
                        </label>
                        <input
                          type="url"
                          value={verificationDocUrl}
                          onChange={(e) => setVerificationDocUrl(e.target.value)}
                          placeholder="https://drive.google.com/..."
                          className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Organizer Notes / Fee Reference
                        </label>
                        <input
                          type="text"
                          value={verificationNotes}
                          onChange={(e) => setVerificationNotes(e.target.value)}
                          placeholder="UPI ref or eligibility note"
                          className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Roster Builder with Minor Detection */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">
                        Player Roster ({roster.length})
                      </h3>
                      <button
                        type="button"
                        onClick={() => setRoster((prev) => [...prev, emptyPlayer()])}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Player</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {roster.map((player, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                            <div className="sm:col-span-4">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Player Name *
                              </label>
                              <input
                                type="text"
                                required
                                value={player.name}
                                onChange={(e) => updateRosterRow(idx, { name: e.target.value })}
                                placeholder="Full name"
                                className="w-full min-h-[38px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Role / Position
                              </label>
                              <input
                                type="text"
                                value={player.role}
                                onChange={(e) => updateRosterRow(idx, { role: e.target.value })}
                                placeholder="Batsman / Raider"
                                className="w-full min-h-[38px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Jersey #
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={999}
                                value={player.jerseyNumber ?? ''}
                                onChange={(e) =>
                                  updateRosterRow(idx, {
                                    jerseyNumber: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                className="w-full min-h-[38px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Date of Birth
                              </label>
                              <input
                                type="date"
                                value={player.dateOfBirth}
                                onChange={(e) => updateRosterRow(idx, { dateOfBirth: e.target.value })}
                                className="w-full min-h-[38px] px-2 text-xs bg-white border border-slate-300 rounded-lg"
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end">
                              {roster.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRoster((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  aria-label="Remove player"
                                  className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {player.isMinor && (
                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2.5">
                              <p className="text-[11px] font-bold text-amber-900">
                                Under-18 Minor Detected — Guardian Consent Required
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                                <input
                                  type="text"
                                  required
                                  value={player.guardianName || ''}
                                  onChange={(e) =>
                                    updateRosterRow(idx, { guardianName: e.target.value })
                                  }
                                  placeholder="Guardian full name *"
                                  className="min-h-[38px] px-2.5 text-xs bg-white border border-amber-300 rounded-lg"
                                />
                                <input
                                  type="tel"
                                  required
                                  value={player.guardianPhone || ''}
                                  onChange={(e) =>
                                    updateRosterRow(idx, { guardianPhone: e.target.value })
                                  }
                                  placeholder="Guardian phone *"
                                  className="min-h-[38px] px-2.5 text-xs bg-white border border-amber-300 rounded-lg"
                                />
                                <label className="inline-flex items-center gap-2 text-xs font-medium text-amber-950 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(player.guardianConsent)}
                                    onChange={(e) =>
                                      updateRosterRow(idx, { guardianConsent: e.target.checked })
                                    }
                                    className="w-4 h-4 rounded border-amber-400 text-[#EA580C]"
                                  />
                                  <span>Guardian Consent Confirmed</span>
                                </label>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={regBusy}
                      className="min-h-[44px] px-6 py-2.5 rounded-lg bg-[#EA580C] text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-60"
                    >
                      {regBusy
                        ? 'Submitting...'
                        : myRegistration &&
                            (myRegistration.status === 'PENDING' ||
                              myRegistration.status === 'REJECTED')
                          ? 'Update & Resubmit Registration'
                          : 'Submit Team Registration'}
                    </button>

                    {myRegistration && myRegistration.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={regBusy}
                        onClick={handleWithdrawRegistration}
                        className="min-h-[44px] px-4 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
                      >
                        Withdraw Application
                      </button>
                    )}
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
