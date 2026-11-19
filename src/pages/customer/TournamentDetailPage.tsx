import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BellPlus,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  GitBranch,
  History,
  MapPin,
  Medal,
  Plus,
  ShieldCheck,
  Sparkles,
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
  StoredDocMeta,
  TeamData,
  TournamentData,
  TournamentRegistrationData,
  VenueData,
} from '../../types/index.ts';
import { entityService } from '../../services/entities/entityService.ts';
import { engagementService } from '../../services/engagement/engagementService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';
import { recentlyWatchedStore } from '../../utils/recentlyWatched.ts';
import { StreamCard } from '../../components/streaming/StreamCard.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { TournamentBracket } from '../../components/tournaments/TournamentBracket.tsx';
import { DocumentUploadField } from '../../components/common/DocumentUploadField.tsx';
import { PaymentProofViewerModal } from '../../components/common/PaymentProofViewerModal.tsx';

type TournamentTab = 'matches' | 'bracket' | 'standings' | 'teams' | 'leaderboards' | 'register';

function normalizeTabParam(raw: string | null): TournamentTab | null {
  if (!raw) return null;
  const val = raw.toLowerCase();
  if (val === 'matches' || val === 'overview') return 'matches';
  if (val === 'bracket' || val === 'fixtures') return 'bracket';
  if (val === 'standings' || val === 'points') return 'standings';
  if (val === 'teams') return 'teams';
  if (val === 'leaderboards' || val === 'stats') return 'leaderboards';
  if (val === 'register' || val === 'registration' || val === 'payments') return 'register';
  return null;
}

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

function formatPaymentStatusLabel(status?: string) {
  switch (status) {
    case 'PAYMENT_APPROVED':
      return { label: 'Payment Approved', cls: 'bg-emerald-100 text-emerald-800' };
    case 'PROOF_SUBMITTED':
      return { label: 'Proof Submitted', cls: 'bg-blue-100 text-blue-800' };
    case 'UNDER_VERIFICATION':
      return { label: 'Under Verification', cls: 'bg-amber-100 text-amber-900' };
    case 'PAYMENT_REJECTED':
      return { label: 'Payment Rejected', cls: 'bg-red-100 text-red-800' };
    case 'NOT_REQUIRED':
      return { label: 'No Payment Required', cls: 'bg-slate-100 text-slate-600' };
    default:
      return { label: 'Payment Pending', cls: 'bg-orange-100 text-orange-900' };
  }
}

function formatRefundStatusLabel(status?: string) {
  switch (status) {
    case 'HELD':
      return { label: 'Deposit Held', cls: 'bg-slate-100 text-slate-700' };
    case 'REFUND_INITIATED':
      return { label: 'Refund Initiated', cls: 'bg-blue-100 text-blue-800' };
    case 'REFUNDED':
      return { label: 'Refunded', cls: 'bg-emerald-100 text-emerald-800' };
    case 'FORFEITED':
      return { label: 'Forfeited', cls: 'bg-red-100 text-red-800' };
    default:
      return null;
  }
}

function validateRosterList(list: RosterPlayerEntry[]): string | null {
  const seenNames = new Set<string>();
  const seenJerseys = new Set<number>();
  for (const p of list) {
    const cleanName = p.name.trim();
    if (!cleanName) continue;
    const key = cleanName.toLowerCase();
    if (seenNames.has(key)) {
      return `Duplicate player name "${cleanName}" is not allowed in the same roster.`;
    }
    seenNames.add(key);

    if (p.jerseyNumber !== null && p.jerseyNumber !== undefined) {
      if (seenJerseys.has(p.jerseyNumber)) {
        return `Duplicate jersey number #${p.jerseyNumber} is not allowed in the same roster.`;
      }
      seenJerseys.add(p.jerseyNumber);
    }

    if (p.isMinor && (!p.guardianName?.trim() || !p.guardianPhone?.trim() || !p.guardianConsent)) {
      return `Player "${cleanName}" is under 18. Guardian name, phone, and consent checkbox are mandatory.`;
    }
  }
  return null;
}

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { customerUser, updateCustomerUser } = useAuth();
  const { t } = useLanguage();
  const [followBusy, setFollowBusy] = useState(false);

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
  const [activeTab, setActiveTab] = useState<TournamentTab>(
    () => normalizeTabParam(searchParams.get('tab')) || 'matches'
  );
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
  const [verificationDocId, setVerificationDocId] = useState('');
  const [verificationDocMeta, setVerificationDocMeta] = useState<StoredDocMeta | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('');

  // Top-to-bottom Player Addition UX:
  // `newPlayer` sits inside the always-empty Add Player input box AT THE TOP.
  // `roster` renders added players sequentially UNDERNEATH.
  const [newPlayer, setNewPlayer] = useState<RosterPlayerEntry>(emptyPlayer());
  const [newPlayerError, setNewPlayerError] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPlayerEntry[]>([]);

  const [isEditingApproved, setIsEditingApproved] = useState(false);
  const [regBusy, setRegBusy] = useState(false);
  const [regMessage, setRegMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Payment Screenshot / Proof Upload state
  const [stagedPaymentDoc, setStagedPaymentDoc] = useState<StoredDocMeta | null>(null);
  const [paymentRefNote, setPaymentRefNote] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [paymentViewerOpen, setPaymentViewerOpen] = useState(false);

  // Sync tab with URL query param when navigating from notifications
  useEffect(() => {
    const requestedTab = normalizeTabParam(searchParams.get('tab'));
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  const handleSelectTab = (tab: TournamentTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

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
      if (res.tournament) {
        recentlyWatchedStore.recordTournament({
          id: res.tournament.id,
          name: res.tournament.name,
          sportType: res.tournament.sportType,
          location: res.tournament.location,
        });
      }
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

  const hydrateFormFromRegistration = useCallback(
    (reg: TournamentRegistrationData | null) => {
      if (reg) {
        setTeamName(reg.teamName || '');
        setTeamShortName(reg.teamShortName || '');
        setTeamLogoUrl(reg.teamLogoUrl || '');
        setCity(reg.city || '');
        setCaptainName(reg.captainName || customerUser?.name || '');
        setCaptainPhone(reg.captainPhone || customerUser?.phone || '');
        setVerificationDocUrl(reg.verificationDocUrl || '');
        setVerificationDocId(reg.verificationDocId || reg.verificationDocMeta?.fileId || '');
        setVerificationDocMeta(reg.verificationDocMeta || null);
        setVerificationNotes(reg.verificationNotes || '');
        setRoster(Array.isArray(reg.roster) ? reg.roster : []);
        setPaymentRefNote(reg.paymentReferenceNote || '');
        setStagedPaymentDoc(reg.paymentProofMeta || null);
      } else {
        setTeamName('');
        setTeamShortName('');
        setTeamLogoUrl('');
        setCity('');
        setCaptainName(customerUser?.name || '');
        setCaptainPhone(customerUser?.phone || '');
        setVerificationDocUrl('');
        setVerificationDocId('');
        setVerificationDocMeta(null);
        setVerificationNotes('');
        setRoster([]);
        setPaymentRefNote('');
        setStagedPaymentDoc(null);
      }
      setNewPlayer(emptyPlayer());
      setNewPlayerError(null);
    },
    [customerUser]
  );

  const loadMyRegistration = useCallback(async () => {
    if (!id || !customerUser) {
      setMyRegistration(null);
      return;
    }
    try {
      const reg = await platformOpsService.getMyTournamentRegistration(id);
      setMyRegistration(reg);
      hydrateFormFromRegistration(reg);
    } catch {
      // Non-blocking
    }
  }, [id, customerUser, hydrateFormFromRegistration]);

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

  function updateNewPlayer(patch: Partial<RosterPlayerEntry>) {
    setNewPlayerError(null);
    setNewPlayer((prev) => {
      const next = { ...prev, ...patch };
      if (patch.dateOfBirth !== undefined) {
        next.isMinor = computeIsMinorFromDob(patch.dateOfBirth);
      }
      return next;
    });
  }

  function handleAddNewPlayerToRoster() {
    setNewPlayerError(null);
    const cleanName = newPlayer.name.trim();
    if (!cleanName) {
      setNewPlayerError('Enter player name before adding to the roster.');
      return;
    }
    if (roster.some((p) => p.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      setNewPlayerError(`Player "${cleanName}" is already in the roster.`);
      return;
    }
    if (
      newPlayer.jerseyNumber !== null &&
      newPlayer.jerseyNumber !== undefined &&
      roster.some((p) => p.jerseyNumber === newPlayer.jerseyNumber)
    ) {
      setNewPlayerError(`Jersey #${newPlayer.jerseyNumber} is already assigned to another player.`);
      return;
    }
    if (
      newPlayer.isMinor &&
      (!newPlayer.guardianName?.trim() ||
        !newPlayer.guardianPhone?.trim() ||
        !newPlayer.guardianConsent)
    ) {
      setNewPlayerError(
        `Player "${cleanName}" is under 18. Guardian name, phone, and consent confirmation are required.`
      );
      return;
    }

    setRoster((prev) => [...prev, { ...newPlayer, name: cleanName }]);
    setNewPlayer(emptyPlayer());
    setNewPlayerError(null);
  }

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
    setNewPlayerError(null);

    // If user typed a player into the top box without clicking "+ Add Player", validate & include it cleanly
    let combinedRoster = [...roster.filter((p) => p.name.trim())];
    if (newPlayer.name.trim()) {
      combinedRoster = [...combinedRoster, { ...newPlayer, name: newPlayer.name.trim() }];
    }

    if (combinedRoster.length === 0) {
      setRegMessage({ type: 'error', text: 'Please add at least one player to your roster.' });
      return;
    }

    const rosterValidationErr = validateRosterList(combinedRoster);
    if (rosterValidationErr) {
      setRegMessage({ type: 'error', text: rosterValidationErr });
      return;
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
        verificationDocId: verificationDocId || verificationDocMeta?.fileId || undefined,
        verificationNotes: verificationNotes.trim(),
        roster: combinedRoster,
      };

      const canUpdateExisting =
        myRegistration &&
        (myRegistration.status === 'PENDING' ||
          myRegistration.status === 'REJECTED' ||
          (isEditingApproved &&
            (myRegistration.status === 'APPROVED' ||
              myRegistration.status === 'PENDING_REAPPROVAL')));

      if (canUpdateExisting && myRegistration) {
        const { registration: updated, message } = await platformOpsService.updateRegistration(
          myRegistration.id,
          payload
        );
        setMyRegistration(updated);
        hydrateFormFromRegistration(updated);
        setIsEditingApproved(false);
        setRegMessage({
          type: 'success',
          text:
            message ||
            (updated.status === 'PENDING_REAPPROVAL'
              ? 'Your team details have been updated and are awaiting Admin/Organizer approval.'
              : 'Registration updated and resubmitted for organizer verification.'),
        });
      } else {
        const res = await platformOpsService.registerTeamForTournament(id, payload);
        setMyRegistration(res.registration);
        hydrateFormFromRegistration(res.registration);
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
      setIsEditingApproved(false);
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

  async function handleSubmitPaymentProof() {
    if (!myRegistration) return;
    setPaymentMessage(null);
    const fileIdToSubmit = stagedPaymentDoc?.fileId;
    if (!fileIdToSubmit) {
      setPaymentMessage({
        type: 'error',
        text: 'Please upload a payment screenshot or receipt first (from Device or Google Drive).',
      });
      return;
    }
    try {
      setPaymentBusy(true);
      const res = await platformOpsService.submitPaymentProof(myRegistration.id, {
        storedFileId: fileIdToSubmit,
        referenceNote: paymentRefNote.trim(),
      });
      setMyRegistration(res.registration);
      setPaymentMessage({
        type: 'success',
        text: res.message || 'Payment proof uploaded and submitted for verification.',
      });
      loadTournament();
    } catch (err) {
      setPaymentMessage({
        type: 'error',
        text: extractApiError(err, 'Failed to submit payment proof.'),
      });
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleToggleFollowTournament() {
    if (!tournament) return;
    if (!customerUser) {
      setError('Sign in to follow this tournament and get schedule/result alerts.');
      return;
    }
    const isFollowing = (customerUser.followedTournamentIds || []).includes(tournament.id);
    try {
      setFollowBusy(true);
      const res = isFollowing
        ? await engagementService.unfollowTournament(tournament.id)
        : await engagementService.followTournament(tournament.id);
      updateCustomerUser({ ...customerUser, followedTournamentIds: res.followedTournamentIds });
      setTournament((prev) => (prev ? { ...prev, followersCount: res.followersCount } : prev));
    } catch (err) {
      setError(extractApiError(err, 'Failed to update tournament follow status.'));
    } finally {
      setFollowBusy(false);
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

  const mapsUrl = tournament.googleMapsUrl?.trim()
    ? tournament.googleMapsUrl.trim()
    : venue && typeof venue.latitude === 'number' && typeof venue.longitude === 'number'
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

  // Mutually exclusive tournament payment display
  const activePaymentMode =
    tournament.paymentMode === 'SECURITY_DEPOSIT' && (tournament.securityDepositAmount || 0) > 0
      ? 'SECURITY_DEPOSIT'
      : tournament.paymentMode === 'NONE'
        ? 'NONE'
        : (tournament.registrationFee || 0) > 0
          ? 'ENTRY_FEE'
          : 'NONE';

  const activePaymentAmount =
    activePaymentMode === 'SECURITY_DEPOSIT'
      ? tournament.securityDepositAmount || 0
      : activePaymentMode === 'ENTRY_FEE'
        ? tournament.registrationFee || 0
        : 0;

  // Results & Awards presence
  const hasPositions = Boolean(tournament.positions && tournament.positions.length > 0);
  const hasBestPlayer = Boolean(
    tournament.bestPlayer &&
      tournament.bestPlayer.mode !== 'NONE' &&
      tournament.bestPlayer.playerName?.trim()
  );
  const hasCustomFields = Boolean(
    tournament.customAwardFields && tournament.customAwardFields.length > 0
  );
  const showResultsAwards = hasPositions || hasBestPlayer || hasCustomFields;

  // Post-approval editing calculations
  const editsUsed = myRegistration?.editCount || 0;
  const maxEditsAfterApproval = myRegistration?.maxEditsAfterApproval || 2;
  const remainingEdits = Math.max(0, maxEditsAfterApproval - editsUsed);
  const isPostApprovalLocked =
    myRegistration?.status === 'APPROVED' || myRegistration?.status === 'PENDING_REAPPROVAL';
  const showRegistrationForm =
    !myRegistration ||
    myRegistration.status === 'PENDING' ||
    myRegistration.status === 'REJECTED' ||
    myRegistration.status === 'WITHDRAWN' ||
    (isPostApprovalLocked && isEditingApproved);

  const paymentBadge = formatPaymentStatusLabel(myRegistration?.paymentStatus);
  const refundBadge =
    myRegistration?.paymentType === 'SECURITY_DEPOSIT'
      ? formatRefundStatusLabel(myRegistration?.refundStatus)
      : null;

  return (
    <div className="max-w-7xl mx-auto px-3.5 sm:px-6 py-5 sm:py-8 space-y-5">
      <Link
        to="/tournaments"
        className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>All Tournaments</span>
      </Link>

      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3.5">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            {tournament.logoUrl && (
              <img
                src={tournament.logoUrl}
                alt={tournament.name}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-slate-200 shrink-0"
              />
            )}
            <div className="space-y-1.5 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-500">
                <span className="font-bold text-[#EA580C] uppercase">{tournament.sportType}</span>
                {tournament.format && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
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
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                      Prize: {tournament.prizeMoney}
                    </span>
                  </>
                )}
              </div>

              <h1 className="font-display text-xl sm:text-3xl font-bold text-slate-900 break-words">
                {tournament.name}
              </h1>

              {tournament.organizerName && (
                <p className="text-xs text-slate-500">Organized by {tournament.organizerName}</p>
              )}
              <p className="text-xs text-slate-500 font-mono tabular-nums">
                {tournament.followersCount || 0} follower{(tournament.followersCount || 0) === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
            <button
              type="button"
              disabled={followBusy}
              onClick={handleToggleFollowTournament}
              className={`min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors max-w-full ${
                customerUser?.followedTournamentIds?.includes(tournament.id)
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {customerUser?.followedTournamentIds?.includes(tournament.id) ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <BellPlus className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">
                {customerUser?.followedTournamentIds?.includes(tournament.id)
                  ? 'Following'
                  : 'Follow'}
              </span>
            </button>

            {(regOpen || myRegistration) && (
              <button
                type="button"
                onClick={() => handleSelectTab('register')}
                className="min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-orange-700 transition-colors max-w-full"
              >
                <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {myRegistration
                    ? `Reg: ${myRegistration.status.replace('_', ' ')}`
                    : t('tournament.registerTeam')}
                </span>
              </button>
            )}
          </div>
        </div>

        {tournament.description && (
          <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
            {tournament.description}
          </p>
        )}

        {(tournament.rules || tournament.qualificationRules) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
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

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600 pt-1">
          {(venue?.name || tournament.location || mapsUrl) && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {venue
                  ? `${venue.name}${venue.city ? `, ${venue.city}` : ''}`
                  : tournament.location || 'Tournament Ground'}
              </span>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#EA580C] hover:underline font-semibold"
                >
                  <span>View on Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
          )}
          {tournament.startDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {new Date(tournament.startDate).toLocaleDateString()}
                {tournament.endDate ? ` – ${new Date(tournament.endDate).toLocaleDateString()}` : ''}
              </span>
            </span>
          )}
          {activePaymentMode === 'ENTRY_FEE' && activePaymentAmount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-orange-900 font-mono font-semibold">
              Entry Fee: ₹{activePaymentAmount}
            </span>
          )}
          {activePaymentMode === 'SECURITY_DEPOSIT' && activePaymentAmount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 font-mono font-semibold">
              Refundable Security Deposit: ₹{activePaymentAmount}
            </span>
          )}
        </div>
      </div>

      {/* Results, Dynamic Positions, Best Player & Custom Fields Card */}
      {showResultsAwards && (
        <section className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-xl p-4 sm:p-5 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Medal className="w-5 h-5 text-amber-400" />
              <h2 className="font-display text-base sm:text-lg font-bold">
                Tournament Results &amp; Awards
              </h2>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white/10 text-amber-300">
              Official Standings
            </span>
          </div>

          {hasPositions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {(tournament.positions || []).map((pos) => (
                <div
                  key={`${pos.rank}-${pos.label}`}
                  className={`p-3 rounded-lg border ${
                    pos.rank === 1
                      ? 'bg-amber-500/15 border-amber-400/40'
                      : pos.rank === 2
                        ? 'bg-slate-100/10 border-slate-400/30'
                        : 'bg-white/5 border-white/10'
                  }`}
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                    {pos.label || `${pos.rank} Place`}
                  </p>
                  <p className="text-sm font-bold text-white mt-0.5 truncate">{pos.teamName}</p>
                  {pos.prizeNote && (
                    <p className="text-[11px] text-slate-300 mt-0.5 truncate">{pos.prizeNote}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {(hasBestPlayer || hasCustomFields) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {hasBestPlayer && tournament.bestPlayer && (
                <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-400/30">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{tournament.bestPlayer.title || 'Player of the Tournament'}</span>
                  </p>
                  {tournament.bestPlayer.mode === 'PLAYER' && tournament.bestPlayer.playerId ? (
                    <Link
                      to={`/players/${tournament.bestPlayer.playerId}`}
                      className="text-sm font-bold text-white hover:text-emerald-300 hover:underline mt-0.5 block truncate"
                    >
                      {tournament.bestPlayer.playerName}
                    </Link>
                  ) : (
                    <p className="text-sm font-bold text-white mt-0.5 truncate">
                      {tournament.bestPlayer.playerName}
                    </p>
                  )}
                  {(tournament.bestPlayer.teamName || tournament.bestPlayer.performanceNote) && (
                    <p className="text-[11px] text-slate-300 mt-0.5 truncate">
                      {[tournament.bestPlayer.teamName, tournament.bestPlayer.performanceNote]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              )}

              {(tournament.customAwardFields || []).map((field) => (
                <div
                  key={field.id}
                  className="p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                    {field.label}
                  </p>
                  <p className="text-sm font-bold text-white mt-0.5 break-words">{field.value}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
              className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-orange-300 transition-colors"
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

      {/* Navigation Tabs (Compact, mobile-friendly) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
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
              onClick={() => handleSelectTab(tab.key)}
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
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

      {/* Captain Team Registration & Payment Tab */}
      {activeTab === 'register' && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Captain Team Registration
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Submit your team roster &amp; verification document for organizer review. Documents and payment receipts stay strictly private to tournament organizers.
              </p>
            </div>
            {myRegistration && (
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  myRegistration.status === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : myRegistration.status === 'PENDING_REAPPROVAL'
                      ? 'bg-amber-100 text-amber-900'
                      : myRegistration.status === 'REJECTED'
                        ? 'bg-red-100 text-red-800'
                        : myRegistration.status === 'WITHDRAWN'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-blue-100 text-blue-800'
                }`}
              >
                Status: {myRegistration.status.replace('_', ' ')}
              </span>
            )}
          </div>

          {!customerUser ? (
            <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                Sign in or create a Team Captain account to register your squad.
              </p>
              <div className="flex flex-wrap justify-center gap-2.5">
                <Link
                  to="/login"
                  className="min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="min-h-[36px] inline-flex items-center px-3.5 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold"
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

              {/* Approved / Pending Reapproval Status & Max-2 Edit Controls */}
              {myRegistration && isPostApprovalLocked && (
                <div className="space-y-3">
                  {myRegistration.status === 'APPROVED' ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-900">
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Team Approved &amp; Enrolled!</p>
                          <p className="mt-0.5">
                            &ldquo;{myRegistration.teamName}&rdquo; is officially registered with{' '}
                            {myRegistration.roster?.length || 0} players.
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-emerald-800">
                            Post-approval edits remaining: {remainingEdits} of {maxEditsAfterApproval}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={remainingEdits <= 0}
                        onClick={() => {
                          if (!isEditingApproved) hydrateFormFromRegistration(myRegistration);
                          setIsEditingApproved((v) => !v);
                        }}
                        className="min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>
                          {remainingEdits <= 0
                            ? 'Edit Limit Reached (2/2)'
                            : isEditingApproved
                              ? 'Cancel Editing'
                              : 'Edit Team Details'}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
                      <div className="flex items-start gap-2.5">
                        <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Pending Reapproval</p>
                          <p className="mt-0.5">
                            Your team details have been updated and are awaiting Admin/Organizer approval.
                          </p>
                          <p className="mt-1 text-[11px] font-medium text-amber-800">
                            Active approved tournament participation is paused until reapproved. Remaining edits after approval: {remainingEdits} of {maxEditsAfterApproval}.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={remainingEdits <= 0}
                        onClick={() => {
                          if (!isEditingApproved) hydrateFormFromRegistration(myRegistration);
                          setIsEditingApproved((v) => !v);
                        }}
                        className="min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>
                          {remainingEdits <= 0
                            ? 'Edit Limit Reached (2/2)'
                            : isEditingApproved
                              ? 'Cancel Editing'
                              : 'Edit Again'}
                        </span>
                      </button>
                    </div>
                  )}

                  {myRegistration.editHistory && myRegistration.editHistory.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        <span>Post-Approval Edit History ({editsUsed}/{maxEditsAfterApproval})</span>
                      </p>
                      <div className="space-y-1.5">
                        {myRegistration.editHistory.map((item) => (
                          <div
                            key={`${item.editNumber}-${item.editedAt}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800">Edit #{item.editNumber}:</span>{' '}
                              <span className="text-slate-600">{item.changesSummary}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-400">
                                {new Date(item.editedAt).toLocaleString()}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded font-semibold ${
                                  item.reviewStatus === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.reviewStatus === 'REJECTED'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-900'
                                }`}
                              >
                                {(item.reviewStatus || 'PENDING_REAPPROVAL').replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {myRegistration?.status === 'REJECTED' && myRegistration.reviewNotes && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-900">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <p className="font-bold">Organizer Review Notes:</p>
                    <p className="mt-0.5">{myRegistration.reviewNotes}</p>
                  </div>
                </div>
              )}

              {/* Payment & Refundable Security Deposit Verification Card */}
              {myRegistration &&
                (activePaymentAmount > 0 ||
                  (myRegistration.feeAmount || 0) > 0 ||
                  (myRegistration.paymentType && myRegistration.paymentType !== 'NONE')) && (
                  <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#EA580C]" />
                          <h3 className="text-sm font-bold text-slate-900">
                            {myRegistration.paymentType === 'SECURITY_DEPOSIT' ||
                            activePaymentMode === 'SECURITY_DEPOSIT'
                              ? 'Refundable Security Deposit'
                              : 'Tournament Entry Fee'}{' '}
                            · ₹{myRegistration.feeAmount || activePaymentAmount}
                          </h3>
                        </div>
                        {tournament.refundPolicy &&
                          (myRegistration.paymentType === 'SECURITY_DEPOSIT' ||
                            activePaymentMode === 'SECURITY_DEPOSIT') && (
                            <p className="text-xs text-slate-600">
                              <span className="font-semibold text-slate-800">Refund Policy:</span>{' '}
                              {tournament.refundPolicy}
                            </p>
                          )}
                        {tournament.paymentInstructions && (
                          <p className="text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <span className="font-semibold text-slate-800">Payment Instructions:</span>{' '}
                            {tournament.paymentInstructions}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${paymentBadge.cls}`}
                        >
                          {paymentBadge.label}
                        </span>
                        {refundBadge && (
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${refundBadge.cls}`}
                          >
                            {refundBadge.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {myRegistration.paymentStatus === 'PAYMENT_REJECTED' &&
                      myRegistration.paymentRejectionReason && (
                        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold">Payment Verification Rejected</p>
                            <p className="mt-0.5">{myRegistration.paymentRejectionReason}</p>
                            <p className="mt-1 text-[11px] text-red-700">
                              Please upload a clear screenshot or PDF receipt below to re-submit.
                            </p>
                          </div>
                        </div>
                      )}

                    {myRegistration.paymentStatus === 'PAYMENT_APPROVED' && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <ShieldCheck className="w-4 h-4 text-emerald-700" />
                          Verified by {myRegistration.paymentVerifiedByName || 'Organizer'}
                          {myRegistration.paymentVerifiedAt
                            ? ` on ${new Date(myRegistration.paymentVerifiedAt).toLocaleDateString()}`
                            : ''}
                        </span>
                        {myRegistration.paymentProofFileId && (
                          <button
                            type="button"
                            onClick={() => setPaymentViewerOpen(true)}
                            className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-300 text-emerald-900 text-xs font-semibold hover:bg-emerald-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Approved Receipt</span>
                          </button>
                        )}
                      </div>
                    )}

                    {myRegistration.paymentStatus !== 'PAYMENT_APPROVED' && (
                      <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-3.5">
                        {paymentMessage && (
                          <FeedbackBanner
                            type={paymentMessage.type}
                            message={paymentMessage.text}
                            onDismiss={() => setPaymentMessage(null)}
                          />
                        )}

                        <DocumentUploadField
                          label="Upload Payment Screenshot / Transaction Receipt *"
                          helperText="JPG, PNG, WebP, or PDF (Max 10 MB)"
                          purpose="PAYMENT_PROOF"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          allowedMimeTypesForPicker={[
                            'image/jpeg',
                            'image/png',
                            'image/webp',
                            'application/pdf',
                            'application/vnd.google-apps.document',
                          ]}
                          value={stagedPaymentDoc}
                          tournamentId={tournament.id}
                          registrationId={myRegistration.id}
                          onUploaded={(uploaded) => {
                            setStagedPaymentDoc(uploaded);
                            setPaymentMessage(null);
                          }}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              UPI / Transaction Reference Note (Optional)
                            </label>
                            <input
                              type="text"
                              value={paymentRefNote}
                              onChange={(e) => setPaymentRefNote(e.target.value)}
                              placeholder="e.g. UTR 412399881122"
                              className="w-full min-h-[36px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={paymentBusy || !stagedPaymentDoc?.fileId}
                            onClick={handleSubmitPaymentProof}
                            className="min-h-[36px] inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-orange-700 disabled:opacity-50"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>
                              {paymentBusy ? 'Submitting...' : 'Submit Payment Proof'}
                            </span>
                          </button>
                        </div>

                        {myRegistration.paymentProofFileId && (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setPaymentViewerOpen(true)}
                              className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect Currently Submitted Proof</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {myRegistration.paymentHistory && myRegistration.paymentHistory.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Payment Audit Log
                        </p>
                        <div className="space-y-1">
                          {myRegistration.paymentHistory.map((item, idx) => (
                            <div
                              key={`${item.timestamp}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                            >
                              <span>
                                <strong className="text-slate-800">{item.status.replace('_', ' ')}</strong>
                                {item.notes ? ` — ${item.notes}` : ''} ({item.actorName})
                              </span>
                              <span className="text-slate-400">
                                {new Date(item.timestamp).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {myRegistration.paymentProofFileId && (
                      <PaymentProofViewerModal
                        open={paymentViewerOpen}
                        onClose={() => setPaymentViewerOpen(false)}
                        title={`Payment Proof · ${myRegistration.teamName}`}
                        fileUrlPath={`/v1/payments/${myRegistration.id}/proof`}
                        fileName={myRegistration.paymentProofMeta?.fileName || 'payment-proof'}
                        mimeTypeHint={myRegistration.paymentProofMeta?.mimeType || ''}
                        portal="customer"
                      />
                    )}
                  </div>
                )}

              {showRegistrationForm && (
                <form onSubmit={handleSubmitRegistration} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
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
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
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
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm font-mono uppercase border border-slate-300 rounded-lg"
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
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
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
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
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
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
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
                        className="w-full min-h-[38px] px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Private Verification Document Upload (Device + Google Drive) */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <p className="text-xs font-bold text-slate-800">
                      Private Organizer Verification (Hidden from public APIs)
                    </p>
                    <DocumentUploadField
                      label="Team Verification / ID Proof Document"
                      helperText="PDF, JPG, PNG, WebP, DOC, DOCX (Max 10 MB)"
                      purpose="VERIFICATION_DOC"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      allowedMimeTypesForPicker={[
                        'application/pdf',
                        'image/jpeg',
                        'image/png',
                        'image/webp',
                        'application/msword',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'application/vnd.google-apps.document',
                      ]}
                      value={verificationDocMeta}
                      tournamentId={tournament.id}
                      registrationId={myRegistration?.id}
                      onUploaded={(meta) => {
                        setVerificationDocMeta(meta);
                        setVerificationDocId(meta.id || meta.fileId);
                      }}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          External Verification Link (Optional URL)
                        </label>
                        <input
                          type="url"
                          value={verificationDocUrl}
                          onChange={(e) => setVerificationDocUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full min-h-[36px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Organizer Notes / Eligibility Info
                        </label>
                        <input
                          type="text"
                          value={verificationNotes}
                          onChange={(e) => setVerificationNotes(e.target.value)}
                          placeholder="Eligibility details or team notes"
                          className="w-full min-h-[36px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Top-to-Bottom Player Addition UX (#12): Empty input box stays AT THE TOP */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">
                        Player Roster ({roster.length} added)
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        Add players at the top; added players appear below
                      </span>
                    </div>

                    {/* ALWAYS-TOP Empty Add Player Box */}
                    <div className="p-3.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 space-y-3">
                      <p className="text-xs font-bold text-slate-800">Add New Player</p>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Player Name *
                          </label>
                          <input
                            type="text"
                            value={newPlayer.name}
                            onChange={(e) => updateNewPlayer({ name: e.target.value })}
                            placeholder="Full name"
                            className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Role / Position
                          </label>
                          <input
                            type="text"
                            value={newPlayer.role}
                            onChange={(e) => updateNewPlayer({ role: e.target.value })}
                            placeholder="Batsman / Raider"
                            className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg"
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
                            value={newPlayer.jerseyNumber ?? ''}
                            onChange={(e) =>
                              updateNewPlayer({
                                jerseyNumber: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            className="w-full min-h-[36px] px-2.5 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Date of Birth
                          </label>
                          <input
                            type="date"
                            value={newPlayer.dateOfBirth}
                            onChange={(e) => updateNewPlayer({ dateOfBirth: e.target.value })}
                            className="w-full min-h-[36px] px-2 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div className="sm:col-span-1 flex sm:justify-end">
                          <button
                            type="button"
                            onClick={handleAddNewPlayerToRoster}
                            className="w-full sm:w-auto min-h-[36px] inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        </div>
                      </div>

                      {newPlayer.isMinor && (
                        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                          <p className="text-[11px] font-bold text-amber-900">
                            Under-18 Minor Detected — Guardian Consent Required
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                            <input
                              type="text"
                              value={newPlayer.guardianName || ''}
                              onChange={(e) => updateNewPlayer({ guardianName: e.target.value })}
                              placeholder="Guardian full name *"
                              className="min-h-[36px] px-2.5 text-xs bg-white border border-amber-300 rounded-lg"
                            />
                            <input
                              type="tel"
                              value={newPlayer.guardianPhone || ''}
                              onChange={(e) => updateNewPlayer({ guardianPhone: e.target.value })}
                              placeholder="Guardian phone *"
                              className="min-h-[36px] px-2.5 text-xs bg-white border border-amber-300 rounded-lg"
                            />
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-amber-950 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(newPlayer.guardianConsent)}
                                onChange={(e) =>
                                  updateNewPlayer({ guardianConsent: e.target.checked })
                                }
                                className="w-4 h-4 rounded border-amber-400 text-[#EA580C]"
                              />
                              <span>Guardian Consent Confirmed</span>
                            </label>
                          </div>
                        </div>
                      )}

                      {newPlayerError && (
                        <p className="text-xs font-medium text-red-600">{newPlayerError}</p>
                      )}
                    </div>

                    {/* Chronological List of Already-Added Players BELOW */}
                    {roster.length === 0 ? (
                      <p className="text-xs text-slate-500 italic px-1">
                        No players added yet. Use the Add New Player form above to add squad members.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {roster.map((player, idx) => (
                          <div
                            key={`${idx}-${player.name}`}
                            className="p-3 rounded-xl border border-slate-200 bg-white space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                Player #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setRoster((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="min-h-[28px] inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            </div>

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
                                  className="w-full min-h-[34px] px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
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
                                  className="w-full min-h-[34px] px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
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
                                  className="w-full min-h-[34px] px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg font-mono"
                                />
                              </div>
                              <div className="sm:col-span-3">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Date of Birth
                                </label>
                                <input
                                  type="date"
                                  value={player.dateOfBirth}
                                  onChange={(e) =>
                                    updateRosterRow(idx, { dateOfBirth: e.target.value })
                                  }
                                  className="w-full min-h-[34px] px-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                                />
                              </div>
                            </div>

                            {player.isMinor && (
                              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                                <p className="text-[11px] font-bold text-amber-900">
                                  Under-18 Minor Detected — Guardian Consent Required
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                                  <input
                                    type="text"
                                    required
                                    value={player.guardianName || ''}
                                    onChange={(e) =>
                                      updateRosterRow(idx, { guardianName: e.target.value })
                                    }
                                    placeholder="Guardian full name *"
                                    className="min-h-[34px] px-2.5 text-xs bg-white border border-amber-300 rounded-lg"
                                  />
                                  <input
                                    type="tel"
                                    required
                                    value={player.guardianPhone || ''}
                                    onChange={(e) =>
                                      updateRosterRow(idx, { guardianPhone: e.target.value })
                                    }
                                    placeholder="Guardian phone *"
                                    className="min-h-[34px] px-2.5 text-xs bg-white border border-amber-300 rounded-lg"
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
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={regBusy}
                      className="min-h-[36px] px-4 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-700 disabled:opacity-60"
                    >
                      {regBusy
                        ? 'Submitting...'
                        : isPostApprovalLocked
                          ? `Save Updates (Uses Edit ${editsUsed + 1}/${maxEditsAfterApproval})`
                          : myRegistration &&
                              (myRegistration.status === 'PENDING' ||
                                myRegistration.status === 'REJECTED')
                            ? 'Update & Resubmit Registration'
                            : 'Submit Team Registration'}
                    </button>

                    {isPostApprovalLocked && isEditingApproved && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingApproved(false);
                          hydrateFormFromRegistration(myRegistration);
                        }}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                      >
                        Cancel Edit
                      </button>
                    )}

                    {myRegistration && myRegistration.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={regBusy}
                        onClick={handleWithdrawRegistration}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100"
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
