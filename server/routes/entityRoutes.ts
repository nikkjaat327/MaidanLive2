import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Tournament } from '../models/Tournament.ts';
import { TournamentTemplate } from '../models/TournamentTemplate.ts';
import { Team } from '../models/Team.ts';
import { Player } from '../models/Player.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { Fixture } from '../models/Fixture.ts';
import { Venue } from '../models/Venue.ts';
import { PlayerMatchStat } from '../models/PlayerMatchStat.ts';
import { TournamentRegistration } from '../models/TournamentRegistration.ts';
import { User, ADMIN_PORTAL_ROLES, ALL_GRANULAR_PERMISSIONS } from '../models/User.ts';
import type { UserRole } from '../models/User.ts';
import { ActivityLog } from '../models/ActivityLog.ts';
import { Sponsor, SponsorOverlay } from '../models/Sponsor.ts';
import {
  authenticate,
  canManageTournament,
  optionalAuthenticate,
  requireAdminPortal,
  requirePermission,
  requireRole,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeGoogleMapsUrl, sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { calculatePointsTable } from '../../src/utils/tournamentEngine.ts';
import { dispatchMatchNotifications } from '../utils/notifications.ts';
import { deleteFromCloudinary } from '../services/cloudinaryService.ts';
import {
  buildIdMatchFilter,
  deleteDocByAnyId,
  findDocByAnyId,
} from '../utils/mongoNormalize.ts';

function dedupeDocsById<T extends { _id?: any; id?: string }>(docs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const doc of docs) {
    const key = doc?._id ? String(doc._id) : doc?.id ? String(doc.id) : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(doc);
  }
  return out;
}

function redactStreamPlayback<T extends Record<string, any>>(streamObj: T): T {
  return {
    ...streamObj,
    youtubeVideoId: '',
    replayVideoId: '',
    replayInput: '',
    mediamtxPlaybackUrl: '',
    mediamtxWebrtcUrl: '',
    mediamtxPlaybackHlsUrl: '',
    mediamtxPlaybackWebrtcUrl: '',
    mediamtxHlsUrl: '',
    playbackLocked: true,
  };
}

const router = Router();
const VALID_SPORTS = ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'];
const VALID_FORMATS = ['KNOCKOUT', 'LEAGUE', 'GROUP_STAGE', 'GROUP_KNOCKOUT'];

function sanitizeTournamentPrizes(raw: unknown) {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, any>;
  const out: Record<string, { amount: string; label: string }> = {};
  for (const key of ['first', 'second', 'third'] as const) {
    const tier = src[key];
    if (!tier || typeof tier !== 'object') continue;
    const amount = sanitizeText(tier.amount, 80);
    const label = sanitizeText(tier.label, 120);
    if (amount || label) {
      out[key] = { amount, label };
    }
  }
  return out;
}

function sanitizePublicPlayer(p: any) {
  if (!p) return p;
  const id = p._id ? String(p._id) : p.id ? String(p.id) : '';
  return {
    _id: p._id,
    id,
    name: p.name || '',
    teamId: p.teamId || null,
    sportType: p.sportType || 'Cricket',
    role: p.role || '',
    position: p.position || '',
    battingStyle: p.battingStyle || '',
    bowlingStyle: p.bowlingStyle || '',
    bio: p.bio || '',
    jerseyNumber: p.jerseyNumber ?? null,
    avatarUrl: p.avatarUrl || '',
    isVerified: Boolean(p.isVerified),
    followersCount: Number(p.followersCount) || 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function resolveTournamentPaymentInput(body: any, existing?: any): {
  error?: string;
  paymentMode: 'NONE' | 'ENTRY_FEE' | 'SECURITY_DEPOSIT';
  registrationFee: number;
  securityDepositAmount: number;
  refundPolicy: string;
  paymentInstructions: string;
} {
  const hasExplicitMode = ['NONE', 'ENTRY_FEE', 'SECURITY_DEPOSIT'].includes(body.paymentMode);
  let paymentMode: 'NONE' | 'ENTRY_FEE' | 'SECURITY_DEPOSIT' = hasExplicitMode
    ? body.paymentMode
    : existing?.paymentMode || (Number(body.registrationFee) > 0 ? 'ENTRY_FEE' : 'NONE');

  const rawFee =
    body.registrationFee !== undefined
      ? Math.max(0, Number(body.registrationFee) || 0)
      : Math.max(0, Number(existing?.registrationFee) || 0);
  const rawDeposit =
    body.securityDepositAmount !== undefined
      ? Math.max(0, Number(body.securityDepositAmount) || 0)
      : Math.max(0, Number(existing?.securityDepositAmount) || 0);

  if (
    !hasExplicitMode &&
    body.registrationFee !== undefined &&
    Number(body.registrationFee) > 0 &&
    body.securityDepositAmount !== undefined &&
    Number(body.securityDepositAmount) > 0
  ) {
    return {
      error: 'Entry fee and refundable security deposit are mutually exclusive. Choose only one.',
      paymentMode: 'NONE',
      registrationFee: 0,
      securityDepositAmount: 0,
      refundPolicy: '',
      paymentInstructions: '',
    };
  }

  if (!hasExplicitMode && body.securityDepositAmount !== undefined && Number(body.securityDepositAmount) > 0) {
    paymentMode = 'SECURITY_DEPOSIT';
  }

  const refundPolicy =
    body.refundPolicy !== undefined
      ? sanitizeText(body.refundPolicy, 600)
      : sanitizeText(existing?.refundPolicy, 600);
  const paymentInstructions =
    body.paymentInstructions !== undefined
      ? sanitizeText(body.paymentInstructions, 600)
      : sanitizeText(existing?.paymentInstructions, 600);

  if (paymentMode === 'ENTRY_FEE') {
    return {
      paymentMode: 'ENTRY_FEE',
      registrationFee: rawFee,
      securityDepositAmount: 0,
      refundPolicy: '',
      paymentInstructions,
    };
  }
  if (paymentMode === 'SECURITY_DEPOSIT') {
    return {
      paymentMode: 'SECURITY_DEPOSIT',
      registrationFee: 0,
      securityDepositAmount: rawDeposit,
      refundPolicy:
        refundPolicy ||
        'Refundable security deposit is held during the tournament and returned after completion/compliance.',
      paymentInstructions,
    };
  }
  return {
    paymentMode: 'NONE',
    registrationFee: 0,
    securityDepositAmount: 0,
    refundPolicy: '',
    paymentInstructions: '',
  };
}

async function normalizeTournamentAwardsInput(body: any) {
  let positions:
    | Array<{
        rank: number;
        label: string;
        teamId: mongoose.Types.ObjectId | null;
        teamName: string;
        prizeNote: string;
      }>
    | undefined;

  if (Array.isArray(body.positions)) {
    positions = [];
    for (let i = 0; i < body.positions.length; i++) {
      const p = body.positions[i];
      if (!p || typeof p !== 'object') continue;
      const rank = Math.max(1, Math.floor(Number(p.rank) || i + 1));
      const label =
        sanitizeText(p.label, 80) ||
        `${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'} Position`;
      let teamId: mongoose.Types.ObjectId | null = null;
      let teamName = sanitizeText(p.teamName, 140);
      if (p.teamId && mongoose.Types.ObjectId.isValid(p.teamId)) {
        const tm = await Team.findById(p.teamId).select('name').lean();
        if (tm) {
          teamId = tm._id as mongoose.Types.ObjectId;
          if (!teamName) teamName = tm.name;
        }
      }
      const prizeNote = sanitizeText(p.prizeNote ?? p.notes, 240);
      if (!teamName && !teamId && !prizeNote) continue;
      positions.push({
        rank,
        label,
        teamId,
        teamName,
        prizeNote,
      });
    }
    positions.sort((a, b) => a.rank - b.rank);
  }

  let bestPlayer:
    | {
        mode: 'NONE' | 'PLAYER' | 'MANUAL';
        playerId: mongoose.Types.ObjectId | null;
        playerName: string;
        teamId: mongoose.Types.ObjectId | null;
        teamName: string;
        title: string;
        performanceNote: string;
      }
    | null
    | undefined;

  if (body.bestPlayer !== undefined) {
    const bp = body.bestPlayer;
    if (
      !bp ||
      bp.mode === 'NONE' ||
      (!bp.playerId && !sanitizeText(bp.playerName, 140))
    ) {
      bestPlayer = {
        mode: 'NONE',
        playerId: null,
        playerName: '',
        teamId: null,
        teamName: '',
        title: '',
        performanceNote: '',
      };
    } else {
      let playerId: mongoose.Types.ObjectId | null = null;
      let playerName = sanitizeText(bp.playerName, 140);
      let teamId: mongoose.Types.ObjectId | null =
        bp.teamId && mongoose.Types.ObjectId.isValid(bp.teamId)
          ? new mongoose.Types.ObjectId(bp.teamId)
          : null;
      let teamName = sanitizeText(bp.teamName, 140);
      if (bp.mode !== 'MANUAL' && !bp.isManual && bp.playerId && mongoose.Types.ObjectId.isValid(bp.playerId)) {
        const pl = await Player.findById(bp.playerId).populate('teamId', 'name').lean();
        if (pl) {
          playerId = pl._id as mongoose.Types.ObjectId;
          if (!playerName) playerName = pl.name;
          if (pl.teamId && typeof pl.teamId === 'object') {
            teamId = (pl.teamId as any)._id || teamId;
            if (!teamName) teamName = (pl.teamId as any).name || '';
          }
        }
      }
      const mode: 'PLAYER' | 'MANUAL' = playerId ? 'PLAYER' : 'MANUAL';
      bestPlayer = playerName
        ? {
            mode,
            playerId,
            playerName,
            teamId,
            teamName,
            title: sanitizeText(bp.title, 100) || 'Player of the Tournament',
            performanceNote: sanitizeText(bp.performanceNote, 240),
          }
        : {
            mode: 'NONE',
            playerId: null,
            playerName: '',
            teamId: null,
            teamName: '',
            title: '',
            performanceNote: '',
          };
    }
  }

  let customAwardFields: Array<{ id: string; label: string; value: string }> | undefined;
  if (Array.isArray(body.customAwardFields)) {
    customAwardFields = [];
    for (let i = 0; i < body.customAwardFields.length; i++) {
      const f = body.customAwardFields[i];
      if (!f || typeof f !== 'object') continue;
      const label = sanitizeText(f.label, 100);
      const value = sanitizeText(f.value, 240);
      if (!label) continue;
      customAwardFields.push({
        id: sanitizeText(f.id, 60) || `custom-${Date.now()}-${i}`,
        label,
        value,
      });
    }
  }

  return { positions, bestPlayer, customAwardFields };
}

// ==================== ADMIN DASHBOARD STATS & AUDIT LOGS ====================
router.get(
  '/admin/dashboard-stats',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const [
        totalStreams,
        liveStreams,
        endedStreams,
        upcomingStreams,
        availableReplays,
        publishedReplays,
        tournamentsCountRaw,
        teamsCountRaw,
        playersCountRaw,
        recentActivity,
      ] = await Promise.all([
        LiveStream.countDocuments(),
        LiveStream.countDocuments({ status: 'LIVE' }),
        LiveStream.countDocuments({ status: 'ENDED' }),
        LiveStream.countDocuments({ status: 'UPCOMING' }),
        LiveStream.countDocuments({ replayAvailable: true, replayVideoId: { $ne: '' } }),
        LiveStream.countDocuments({ replayPublished: true, replayAvailable: true }),
        Tournament.find().select('_id').lean(),
        Team.find().select('_id').lean(),
        Player.find().select('_id').lean(),
        ActivityLog.find().sort({ createdAt: -1 }).limit(15).lean(),
      ]);

      const tournamentsCount = dedupeDocsById(tournamentsCountRaw).length;
      const teamsCount = dedupeDocsById(teamsCountRaw).length;
      const playersCount = dedupeDocsById(playersCountRaw).length;

      res.json({
        stats: {
          totalStreams,
          liveStreams,
          endedStreams,
          upcomingStreams,
          availableReplays,
          publishedReplays,
          tournamentsCount,
          teamsCount,
          playersCount,
        },
        recentActivity,
      });
    } catch (err) {
      console.error('[Admin] Dashboard stats error:', err);
      res.status(500).json({ message: 'Failed to load dashboard statistics.' });
    }
  }
);

router.get(
  '/admin/activity-logs',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query: Record<string, unknown> = {};
      if (typeof req.query.resourceType === 'string' && req.query.resourceType.trim()) {
        query.resourceType = req.query.resourceType.trim();
      }
      if (typeof req.query.action === 'string' && req.query.action.trim()) {
        query.action = new RegExp(
          req.query.action.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        );
      }
      if (typeof req.query.search === 'string' && req.query.search.trim()) {
        const regex = new RegExp(
          req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        );
        query.$or = [{ actorName: regex }, { details: regex }, { action: regex }];
      }

      const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
      const logs = await ActivityLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
      res.json({ logs });
    } catch (err) {
      console.error('[Admin] Activity logs error:', err);
      res.status(500).json({ message: 'Failed to load activity logs.' });
    }
  }
);

// ==================== TOURNAMENTS ====================
router.get('/tournaments', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.sportType === 'string' && VALID_SPORTS.includes(req.query.sportType)) {
      query.sportType = req.query.sportType;
    }
    if (
      typeof req.query.status === 'string' &&
      ['UPCOMING', 'ONGOING', 'COMPLETED'].includes(req.query.status)
    ) {
      query.status = req.query.status;
    }
    if (req.query.publishedOnly === 'true') {
      query.isPublished = true;
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const regex = new RegExp(
        req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      query.$or = [{ name: regex }, { location: regex }, { organizerName: regex }];
    }

    const tournaments = await Tournament.find(query).sort({ createdAt: -1 }).lean();
    res.json({
      tournaments: tournaments.map((t) => ({ ...t, id: t._id.toString() })),
    });
  } catch (err) {
    console.error('[Tournaments] List error:', err);
    res.status(500).json({ message: 'Failed to load tournaments.' });
  }
});

router.get('/tournaments/:id', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid tournament ID.' });
      return;
    }
    const tournament = await findDocByAnyId(Tournament, id, { lean: true });
    if (!tournament) {
      res.status(404).json({ message: 'Tournament not found.' });
      return;
    }

    const tMatch = buildIdMatchFilter(id);
    const teamIdList = Array.isArray(tournament.teamIds) ? tournament.teamIds : [];
    const teamFilter =
      teamIdList.length > 0
        ? { $or: [{ tournamentId: tMatch }, { _id: { $in: teamIdList } }] }
        : { tournamentId: tMatch };

    const [streamsRaw, rawTeamsRaw, fixturesRaw, venue, nonApprovedRegs] = await Promise.all([
      LiveStream.find({ tournamentId: tMatch }).sort({ createdAt: -1 }).lean(),
      Team.find(teamFilter).sort({ name: 1 }).lean(),
      Fixture.find({ tournamentId: tMatch })
        .sort({ roundNumber: 1, matchNumber: 1 })
        .lean(),
      tournament.venueId
        ? findDocByAnyId(Venue, String(tournament.venueId), { lean: true })
        : Promise.resolve(null),
      TournamentRegistration.find({
        tournamentId: tMatch,
        status: { $ne: 'APPROVED' },
        teamId: { $ne: null },
      })
        .select('teamId')
        .lean(),
    ]);

    const streams = dedupeDocsById(streamsRaw);
    const fixtures = dedupeDocsById(fixturesRaw);
    const suspendedTeamIds = new Set(
      nonApprovedRegs.map((r: any) => r.teamId?.toString()).filter(Boolean)
    );
    const teams = dedupeDocsById(rawTeamsRaw).filter(
      (t) => !suspendedTeamIds.has(t._id.toString())
    );

    const streamIds = streams.map((s) => s._id);
    const scores =
      streamIds.length > 0
        ? await LiveScore.find({ liveStreamId: { $in: streamIds } }).lean()
        : [];
    const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));
    const enrichedStreams = streams.map((s) => {
      const item = {
        ...s,
        id: s._id.toString(),
        score: scoreMap.get(s._id.toString()) || null,
      };
      return req.user ? item : redactStreamPlayback(item);
    });

    const fixtureGroupMap: Record<string, string> = {};
    const fixtureByStreamId = new Map<string, (typeof fixtures)[number]>();
    for (const f of fixtures) {
      if (f.groupName && f.groupName !== 'Knockout') {
        if (f.teamAId) fixtureGroupMap[f.teamAId.toString()] = f.groupName;
        if (f.teamBId) fixtureGroupMap[f.teamBId.toString()] = f.groupName;
      }
      if (f.liveStreamId) {
        fixtureByStreamId.set(f.liveStreamId.toString(), f);
      }
    }

    const confirmedMatches = streams
      .map((s) => {
        const sc = scoreMap.get(s._id.toString());
        if (!sc || !sc.resultStatus || sc.resultStatus === 'NOT_DECLARED') return null;
        const linkedFixture = fixtureByStreamId.get(s._id.toString());
        return {
          teamAId: s.teamAId ? s.teamAId.toString() : null,
          teamBId: s.teamBId ? s.teamBId.toString() : null,
          teamAScore: sc.teamAScore,
          teamBScore: sc.teamBScore,
          resultStatus: sc.resultStatus,
          winnerTeamId: sc.winnerTeamId ? sc.winnerTeamId.toString() : null,
          groupName: linkedFixture?.groupName || '',
          sportSpecificDetails: sc.sportSpecificDetails,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const pointsTable = calculatePointsTable(
      tournament.sportType,
      teams.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        shortName: t.shortName,
        logoUrl: t.logoUrl,
      })),
      confirmedMatches,
      fixtureGroupMap
    );

    const teamMatchIds: any[] = [];
    for (const t of teams) {
      teamMatchIds.push(t._id, t._id.toString());
    }
    const rawPlayers =
      teamMatchIds.length > 0
        ? await Player.find({ teamId: { $in: teamMatchIds } })
            .populate('teamId', 'name shortName')
            .sort({ name: 1 })
            .lean()
        : [];
    const players = dedupeDocsById(rawPlayers);

    const playerCountByTeam = new Map<string, number>();
    for (const p of players) {
      const tid =
        typeof p.teamId === 'object' && p.teamId
          ? String((p.teamId as any)._id)
          : p.teamId
            ? String(p.teamId)
            : '';
      if (tid) {
        playerCountByTeam.set(tid, (playerCountByTeam.get(tid) || 0) + 1);
      }
    }

    res.json({
      tournament: { ...tournament, id: tournament._id.toString() },
      streams: enrichedStreams,
      teams: teams.map((t) => ({
        ...t,
        id: t._id.toString(),
        playerCount: playerCountByTeam.get(t._id.toString()) || 0,
      })),
      players: players.map(sanitizePublicPlayer),
      fixtures: fixtures.map((f) => ({ ...f, id: f._id.toString() })),
      pointsTable,
      venue: venue ? { ...venue, id: venue._id.toString() } : null,
    });
  } catch (err) {
    console.error('[Tournaments] Get error:', err);
    res.status(500).json({ message: 'Failed to load tournament.' });
  }
});

router.post(
  '/tournaments',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = sanitizeText(req.body.name, 160);
      if (!name) {
        res.status(400).json({ message: 'Tournament name is required.' });
        return;
      }
      const sportType = VALID_SPORTS.includes(req.body.sportType) ? req.body.sportType : 'Cricket';
      const format = VALID_FORMATS.includes(req.body.format) ? req.body.format : 'LEAGUE';
      const status = ['UPCOMING', 'ONGOING', 'COMPLETED'].includes(req.body.status)
        ? req.body.status
        : 'UPCOMING';

      let venueId: mongoose.Types.ObjectId | null = null;
      let location = sanitizeText(req.body.location, 160);
      if (req.body.venueId && mongoose.Types.ObjectId.isValid(req.body.venueId)) {
        const venue = await Venue.findById(req.body.venueId);
        if (venue) {
          venueId = venue._id as mongoose.Types.ObjectId;
          if (!location) location = [venue.name, venue.city].filter(Boolean).join(', ');
        }
      }

      const mapsCheck = sanitizeGoogleMapsUrl(req.body.googleMapsUrl);
      if (!mapsCheck.valid) {
        res.status(400).json({
          message:
            'Invalid Google Maps URL. Provide a valid Google Maps link (e.g. https://maps.google.com/... or https://maps.app.goo.gl/...).',
        });
        return;
      }

      const payCfg = resolveTournamentPaymentInput(req.body);
      if (payCfg.error) {
        res.status(400).json({ message: payCfg.error });
        return;
      }

      const teamIds = Array.isArray(req.body.teamIds)
        ? req.body.teamIds.filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
        : [];

      const tournament = await Tournament.create({
        name,
        sportType,
        format,
        logoUrl: sanitizeImageUrl(req.body.logoUrl),
        location,
        googleMapsUrl: mapsCheck.url,
        venueId,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        status,
        description: sanitizeText(req.body.description, 1500),
        rules: sanitizeText(req.body.rules, 2000),
        groupCount: Math.max(1, Math.min(8, Number(req.body.groupCount) || 2)),
        qualificationRules: sanitizeText(req.body.qualificationRules, 400),
        organizerName: sanitizeText(req.body.organizerName, 120) || req.user!.name,
        season: sanitizeText(req.body.season, 60),
        prizeMoney: sanitizeText(req.body.prizeMoney, 120),
        prizes: sanitizeTournamentPrizes(req.body.prizes) || {},
        registrationOpen: req.body.registrationOpen === true,
        paymentMode: payCfg.paymentMode,
        registrationFee: payCfg.registrationFee,
        securityDepositAmount: payCfg.securityDepositAmount,
        refundPolicy: payCfg.refundPolicy,
        paymentInstructions: payCfg.paymentInstructions,
        isPublished: req.body.isPublished === false ? false : true,
        teamIds,
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      await recordActivity(
        req.user!,
        'CREATE_TOURNAMENT',
        'Tournament',
        tournament._id.toString(),
        name,
        { newValue: { name, sportType, format, status } }
      );

      if (tournament.isPublished) {
        await dispatchMatchNotifications({
          type: 'TOURNAMENT_PUBLISHED',
          title: 'New Tournament Published',
          message: `${name} (${sportType} · ${format}) has been published on MaidanLive.`,
          entityType: 'Tournament',
          entityId: tournament._id.toString(),
          link: `/tournaments/${tournament._id.toString()}`,
          dedupeKey: `tournament-published-${tournament._id.toString()}`,
          includeAllSpectatorsIfNoFollowers: true,
        });
      }

      res
        .status(201)
        .json({ tournament: { ...tournament.toObject(), id: tournament._id.toString() } });
    } catch (err) {
      console.error('[Tournaments] Create error:', err);
      res.status(500).json({ message: 'Failed to create tournament.' });
    }
  }
);

router.patch(
  '/tournaments/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const existingTournament = await findDocByAnyId(Tournament, id);
      if (!existingTournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }
      const allowed = await canManageTournament(req.user!, id);
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to edit this tournament.',
        });
        return;
      }
      const tournament = existingTournament;

      if (req.body.googleMapsUrl !== undefined) {
        const mapsCheck = sanitizeGoogleMapsUrl(req.body.googleMapsUrl);
        if (!mapsCheck.valid) {
          res.status(400).json({
            message:
              'Invalid Google Maps URL. Provide a valid Google Maps link (e.g. https://maps.google.com/... or https://maps.app.goo.gl/...).',
          });
          return;
        }
        tournament.googleMapsUrl = mapsCheck.url;
      }

      if (
        req.body.paymentMode !== undefined ||
        req.body.registrationFee !== undefined ||
        req.body.securityDepositAmount !== undefined ||
        req.body.refundPolicy !== undefined ||
        req.body.paymentInstructions !== undefined
      ) {
        const payCfg = resolveTournamentPaymentInput(req.body, tournament);
        if (payCfg.error) {
          res.status(400).json({ message: payCfg.error });
          return;
        }
        tournament.paymentMode = payCfg.paymentMode;
        tournament.registrationFee = payCfg.registrationFee;
        tournament.securityDepositAmount = payCfg.securityDepositAmount;
        tournament.refundPolicy = payCfg.refundPolicy;
        tournament.paymentInstructions = payCfg.paymentInstructions;
      }

      const previousValue = {
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        isPublished: tournament.isPublished,
      };

      if (req.body.name !== undefined) {
        const cleanName = sanitizeText(req.body.name, 160);
        if (!cleanName) {
          res.status(400).json({ message: 'Tournament name cannot be empty.' });
          return;
        }
        tournament.name = cleanName;
      }
      if (req.body.sportType && VALID_SPORTS.includes(req.body.sportType)) {
        tournament.sportType = req.body.sportType;
      }
      if (req.body.format && VALID_FORMATS.includes(req.body.format)) {
        tournament.format = req.body.format;
      }
      if (req.body.status && ['UPCOMING', 'ONGOING', 'COMPLETED'].includes(req.body.status)) {
        tournament.status = req.body.status;
      }
      if (req.body.logoUrl !== undefined) tournament.logoUrl = sanitizeImageUrl(req.body.logoUrl);
      if (req.body.location !== undefined) tournament.location = sanitizeText(req.body.location, 160);
      if (req.body.venueId !== undefined) {
        if (req.body.venueId && mongoose.Types.ObjectId.isValid(req.body.venueId)) {
          const venue = await Venue.findById(req.body.venueId);
          if (venue) {
            tournament.venueId = venue._id as mongoose.Types.ObjectId;
            if (!tournament.location) {
              tournament.location = [venue.name, venue.city].filter(Boolean).join(', ');
            }
          }
        } else {
          tournament.venueId = null;
        }
      }
      if (req.body.description !== undefined) {
        tournament.description = sanitizeText(req.body.description, 1500);
      }
      if (req.body.rules !== undefined) tournament.rules = sanitizeText(req.body.rules, 2000);
      if (req.body.groupCount !== undefined) {
        tournament.groupCount = Math.max(1, Math.min(8, Number(req.body.groupCount) || 2));
      }
      if (req.body.qualificationRules !== undefined) {
        tournament.qualificationRules = sanitizeText(req.body.qualificationRules, 400);
      }
      if (req.body.organizerName !== undefined) {
        tournament.organizerName = sanitizeText(req.body.organizerName, 120);
      }
      if (req.body.season !== undefined) tournament.season = sanitizeText(req.body.season, 60);
      if (req.body.prizeMoney !== undefined) {
        tournament.prizeMoney = sanitizeText(req.body.prizeMoney, 120);
      }
      if (req.body.prizes !== undefined) {
        tournament.prizes = sanitizeTournamentPrizes(req.body.prizes) || {};
      }
      if (typeof req.body.registrationOpen === 'boolean') {
        tournament.registrationOpen = req.body.registrationOpen;
      }
      if (typeof req.body.isPublished === 'boolean') tournament.isPublished = req.body.isPublished;
      if (Array.isArray(req.body.teamIds)) {
        tournament.teamIds = req.body.teamIds.filter((tid: string) =>
          mongoose.Types.ObjectId.isValid(tid)
        );
      }
      if (req.body.startDate !== undefined) {
        tournament.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
      }
      if (req.body.endDate !== undefined) {
        tournament.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
      }
      tournament.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await tournament.save();

      await recordActivity(
        req.user!,
        'UPDATE_TOURNAMENT',
        'Tournament',
        id,
        tournament.name,
        {
          previousValue,
          newValue: {
            name: tournament.name,
            format: tournament.format,
            status: tournament.status,
            isPublished: tournament.isPublished,
          },
        }
      );
      res.json({ tournament: { ...tournament.toObject(), id: tournament._id.toString() } });
    } catch (err) {
      console.error('[Tournaments] Update error:', err);
      res.status(500).json({ message: 'Failed to update tournament.' });
    }
  }
);

router.patch(
  '/tournaments/:id/results-awards',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const tournament = await findDocByAnyId(Tournament, id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }
      const allowed = await canManageTournament(req.user!, id);
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to update awards for this tournament.',
        });
        return;
      }

      const normalized = await normalizeTournamentAwardsInput(req.body);
      if (normalized.positions !== undefined) {
        tournament.positions = normalized.positions;
      }
      if (normalized.bestPlayer !== undefined) {
        tournament.bestPlayer = normalized.bestPlayer;
      }
      if (normalized.customAwardFields !== undefined) {
        tournament.customAwardFields = normalized.customAwardFields;
      }
      if (req.body.status && ['UPCOMING', 'ONGOING', 'COMPLETED'].includes(req.body.status)) {
        tournament.status = req.body.status;
      }
      tournament.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await tournament.save();

      await recordActivity(
        req.user!,
        'UPDATE_TOURNAMENT_RESULTS_AWARDS',
        'Tournament',
        id,
        `${tournament.name} results & awards updated`
      );

      res.json({ tournament: { ...tournament.toObject(), id: tournament._id.toString() } });
    } catch (err) {
      console.error('[Tournaments] Results & awards error:', err);
      res.status(500).json({ message: 'Failed to update tournament results & awards.' });
    }
  }
);

router.delete(
  '/tournaments/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid tournament ID.' });
        return;
      }
      const existing = await findDocByAnyId(Tournament, id, { lean: true });
      if (!existing) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }
      const allowed = await canManageTournament(req.user!, id);
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to delete this tournament.',
        });
        return;
      }
      const deleted = await deleteDocByAnyId(Tournament, id);
      if (!deleted) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      const tMatch = buildIdMatchFilter(id);
      await Promise.all([
        Fixture.deleteMany({ tournamentId: tMatch }),
        TournamentRegistration.deleteMany({ tournamentId: tMatch }),
        Team.updateMany({ tournamentId: tMatch }, { $set: { tournamentId: null } }),
        LiveStream.updateMany(
          { tournamentId: tMatch },
          { $set: { tournamentId: null, tournamentName: '' } }
        ),
        Sponsor.updateMany({ tournamentId: tMatch }, { $set: { tournamentId: null } }),
        SponsorOverlay.updateMany({ tournamentId: tMatch }, { $set: { tournamentId: null } }),
        User.updateMany(
          { $or: [{ assignedTournamentIds: tMatch }, { followedTournamentIds: tMatch }] },
          { $pull: { assignedTournamentIds: tMatch, followedTournamentIds: tMatch } }
        ),
      ]);

      await recordActivity(req.user!, 'DELETE_TOURNAMENT', 'Tournament', id, deleted.name);
      res.json({ message: 'Tournament deleted.' });
    } catch (err) {
      console.error('[Tournaments] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete tournament.' });
    }
  }
);

// ==================== TEAMS ====================
router.get('/teams', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.sportType === 'string' && VALID_SPORTS.includes(req.query.sportType)) {
      query.sportType = req.query.sportType;
    }
    if (
      typeof req.query.tournamentId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.tournamentId)
    ) {
      query.tournamentId = buildIdMatchFilter(req.query.tournamentId);
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const regex = new RegExp(
        req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      query.$or = [{ name: regex }, { shortName: regex }, { city: regex }];
    }

    const [rawTeams, rawPlayers] = await Promise.all([
      Team.find(query).populate('tournamentId', 'name').sort({ createdAt: -1 }).lean(),
      Player.find({ teamId: { $ne: null } }).select('_id teamId').lean(),
    ]);

    const teams = dedupeDocsById(rawTeams);
    const uniquePlayers = dedupeDocsById(rawPlayers);
    const countByTeamId = new Map<string, number>();
    for (const p of uniquePlayers) {
      if (p.teamId) {
        const tid =
          typeof p.teamId === 'object' && p.teamId
            ? String((p.teamId as any)._id || '')
            : String(p.teamId);
        if (tid) {
          countByTeamId.set(tid, (countByTeamId.get(tid) || 0) + 1);
        }
      }
    }

    res.json({
      teams: teams.map((t) => ({
        ...t,
        id: t._id.toString(),
        playerCount: countByTeamId.get(t._id.toString()) || 0,
      })),
    });
  } catch (err) {
    console.error('[Teams] List error:', err);
    res.status(500).json({ message: 'Failed to load teams.' });
  }
});

// Public Team Profile Page endpoint
router.get('/teams/:id', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid team ID.' });
      return;
    }
    const team = await findDocByAnyId(Team, id, {
      populate: [{ path: 'tournamentId', select: 'name sportType' }],
      lean: true,
    });
    if (!team) {
      res.status(404).json({ message: 'Team not found.' });
      return;
    }

    const tmMatch = buildIdMatchFilter(id);
    const [rawPlayers, rawStreams, rawFixtures] = await Promise.all([
      Player.find({ teamId: tmMatch }).sort({ jerseyNumber: 1, name: 1 }).lean(),
      LiveStream.find({ $or: [{ teamAId: tmMatch }, { teamBId: tmMatch }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Fixture.find({ $or: [{ teamAId: tmMatch }, { teamBId: tmMatch }] })
        .sort({ scheduledAt: 1, roundNumber: 1 })
        .limit(50)
        .lean(),
    ]);

    const players = dedupeDocsById(rawPlayers);
    const streams = dedupeDocsById(rawStreams);
    const fixtures = dedupeDocsById(rawFixtures);

    const streamIds = streams.map((s) => s._id);
    const scores =
      streamIds.length > 0
        ? await LiveScore.find({ liveStreamId: { $in: streamIds } }).lean()
        : [];
    const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));

    let played = 0;
    let won = 0;
    let lost = 0;
    let drawn = 0;

    const enrichedStreams = streams.map((s) => {
      const sc = scoreMap.get(s._id.toString()) || null;
      if (sc && sc.resultStatus && sc.resultStatus !== 'NOT_DECLARED') {
        if (sc.resultStatus === 'DRAW' || sc.resultStatus === 'TIE') {
          played += 1;
          drawn += 1;
        } else if (sc.resultStatus === 'DECLARED') {
          played += 1;
          if (sc.winnerTeamId && sc.winnerTeamId.toString() === id) {
            won += 1;
          } else {
            lost += 1;
          }
        }
      }
      const item = {
        ...s,
        id: s._id.toString(),
        score: sc,
      };
      return req.user ? item : redactStreamPlayback(item);
    });

    res.json({
      team: { ...team, id: team._id.toString(), playerCount: players.length },
      players: players.map(sanitizePublicPlayer),
      streams: enrichedStreams,
      fixtures: fixtures.map((f) => ({ ...f, id: f._id.toString() })),
      record: { played, won, lost, drawn },
    });
  } catch (err) {
    console.error('[Teams] Profile error:', err);
    res.status(500).json({ message: 'Failed to load team profile.' });
  }
});

router.post(
  '/teams',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTeams'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = sanitizeText(req.body.name, 120);
      if (!name) {
        res.status(400).json({ message: 'Team name is required.' });
        return;
      }
      const sportType = VALID_SPORTS.includes(req.body.sportType) ? req.body.sportType : 'Cricket';
      const tournamentId =
        req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)
          ? req.body.tournamentId
          : null;

      const team = await Team.create({
        name,
        shortName: sanitizeText(req.body.shortName, 12).toUpperCase(),
        logoUrl: sanitizeImageUrl(req.body.logoUrl),
        sportType,
        city: sanitizeText(req.body.city, 100),
        captainName: sanitizeText(req.body.captainName, 120),
        bio: sanitizeText(req.body.bio ?? req.body.description, 600),
        tournamentId,
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      await recordActivity(req.user!, 'CREATE_TEAM', 'Team', team._id.toString(), name);
      res.status(201).json({ team: { ...team.toObject(), id: team._id.toString(), playerCount: 0 } });
    } catch (err) {
      console.error('[Teams] Create error:', err);
      res.status(500).json({ message: 'Failed to create team.' });
    }
  }
);

router.patch(
  '/teams/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTeams'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid team ID.' });
        return;
      }
      const team = await findDocByAnyId(Team, id);
      if (!team) {
        res.status(404).json({ message: 'Team not found.' });
        return;
      }

      if (req.body.name !== undefined) {
        const cleanName = sanitizeText(req.body.name, 120);
        if (!cleanName) {
          res.status(400).json({ message: 'Team name cannot be empty.' });
          return;
        }
        team.name = cleanName;
      }
      if (req.body.shortName !== undefined) {
        team.shortName = sanitizeText(req.body.shortName, 12).toUpperCase();
      }
      if (req.body.logoUrl !== undefined) team.logoUrl = sanitizeImageUrl(req.body.logoUrl);
      if (req.body.sportType && VALID_SPORTS.includes(req.body.sportType)) {
        team.sportType = req.body.sportType;
      }
      if (req.body.city !== undefined) team.city = sanitizeText(req.body.city, 100);
      if (req.body.captainName !== undefined) {
        team.captainName = sanitizeText(req.body.captainName, 120);
      }
      if (req.body.bio !== undefined || req.body.description !== undefined) {
        team.bio = sanitizeText(req.body.bio ?? req.body.description, 600);
      }
      if (req.body.tournamentId !== undefined) {
        team.tournamentId =
          req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)
            ? req.body.tournamentId
            : null;
      }
      team.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await team.save();

      await recordActivity(req.user!, 'UPDATE_TEAM', 'Team', id, team.name);
      res.json({ team: { ...team.toObject(), id: team._id.toString() } });
    } catch (err) {
      console.error('[Teams] Update error:', err);
      res.status(500).json({ message: 'Failed to update team.' });
    }
  }
);

router.delete(
  '/teams/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTeams'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid team ID.' });
        return;
      }
      const deleted = await deleteDocByAnyId(Team, id);
      if (!deleted) {
        res.status(404).json({ message: 'Team not found.' });
        return;
      }

      const tmMatch = buildIdMatchFilter(id);
      await Promise.all([
        Player.updateMany({ teamId: tmMatch }, { $set: { teamId: null } }),
        Tournament.updateMany({ teamIds: tmMatch }, { $pull: { teamIds: tmMatch } }),
        TournamentRegistration.updateMany({ teamId: tmMatch }, { $set: { teamId: null } }),
        User.updateMany({ followedTeamIds: tmMatch }, { $pull: { followedTeamIds: tmMatch } }),
      ]);

      await recordActivity(req.user!, 'DELETE_TEAM', 'Team', id, deleted.name);
      res.json({ message: 'Team deleted.' });
    } catch (err) {
      console.error('[Teams] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete team.' });
    }
  }
);

// ==================== PLAYERS ====================
router.get('/players', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.teamId === 'string' && mongoose.Types.ObjectId.isValid(req.query.teamId)) {
      query.teamId = buildIdMatchFilter(req.query.teamId);
    }
    if (typeof req.query.sportType === 'string' && VALID_SPORTS.includes(req.query.sportType)) {
      query.sportType = req.query.sportType;
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const regex = new RegExp(
        req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      query.$or = [{ name: regex }, { role: regex }];
    }
    const isAdminViewer = Boolean(
      req.user &&
        ADMIN_PORTAL_ROLES.includes(req.user.role) &&
        req.authPortal === 'admin'
    );
    const rawPlayers = await Player.find(query)
      .populate('teamId', 'name shortName logoUrl')
      .sort({ createdAt: -1 })
      .lean();
    const players = dedupeDocsById(rawPlayers);
    res.json({
      players: isAdminViewer
        ? players.map((p) => ({ ...p, id: p._id.toString() }))
        : players.map(sanitizePublicPlayer),
      totalCount: players.length,
    });
  } catch (err) {
    console.error('[Players] List error:', err);
    res.status(500).json({ message: 'Failed to load players.' });
  }
});

// Public Player Profile Page endpoint (strictly actual match-recorded stats)
router.get('/players/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid player ID.' });
      return;
    }
    const player = await findDocByAnyId(Player, id, {
      populate: [{ path: 'teamId', select: 'name shortName logoUrl city sportType' }],
      lean: true,
    });
    if (!player) {
      res.status(404).json({ message: 'Player not found.' });
      return;
    }

    const matchStats = await PlayerMatchStat.find({ playerId: id })
      .populate('liveStreamId', 'matchTitle teamAName teamBName gameName matchDate status')
      .sort({ createdAt: -1 })
      .lean();

    const totals = matchStats.reduce(
      (acc, st) => {
        acc.matches += st.appearances || 1;
        acc.runs += st.runs || 0;
        acc.ballsFaced += st.ballsFaced || 0;
        acc.fours += st.fours || 0;
        acc.sixes += st.sixes || 0;
        acc.wickets += st.wickets || 0;
        acc.catches += st.catches || 0;
        acc.raidPoints += st.raidPoints || 0;
        acc.tacklePoints += st.tacklePoints || 0;
        acc.bonusPoints += st.bonusPoints || 0;
        acc.superRaids += st.superRaids || 0;
        acc.superTackles += st.superTackles || 0;
        acc.attackPoints += st.attackPoints || 0;
        acc.blockPoints += st.blockPoints || 0;
        acc.serveAces += st.serveAces || 0;
        acc.goals += st.goals || 0;
        acc.assists += st.assists || 0;
        acc.yellowCards += st.yellowCards || 0;
        acc.redCards += st.redCards || 0;
        acc.saves += st.saves || 0;
        if (st.isMvp) acc.mvpAwards += 1;
        return acc;
      },
      {
        matches: 0,
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        wickets: 0,
        catches: 0,
        raidPoints: 0,
        tacklePoints: 0,
        bonusPoints: 0,
        superRaids: 0,
        superTackles: 0,
        attackPoints: 0,
        blockPoints: 0,
        serveAces: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        saves: 0,
        mvpAwards: 0,
      }
    );

    res.json({
      player: sanitizePublicPlayer(player),
      totals,
      matchStats: matchStats.map((st) => ({ ...st, id: st._id.toString() })),
    });
  } catch (err) {
    console.error('[Players] Profile error:', err);
    res.status(500).json({ message: 'Failed to load player profile.' });
  }
});

router.post(
  '/players',
  authenticate,
  requireAdminPortal,
  requirePermission('managePlayers'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = sanitizeText(req.body.name, 120);
      if (!name) {
        res.status(400).json({ message: 'Player name is required.' });
        return;
      }
      const sportType = VALID_SPORTS.includes(req.body.sportType) ? req.body.sportType : 'Cricket';
      const teamId =
        req.body.teamId && mongoose.Types.ObjectId.isValid(req.body.teamId) ? req.body.teamId : null;
      const jerseyNumber =
        req.body.jerseyNumber !== undefined &&
        req.body.jerseyNumber !== '' &&
        Number.isFinite(Number(req.body.jerseyNumber))
          ? Math.max(0, Math.min(999, Number(req.body.jerseyNumber)))
          : null;

      const dob = sanitizeText(req.body.dateOfBirth, 30);
      let isMinor = Boolean(req.body.isMinor);
      if (dob) {
        const parsedDob = new Date(dob);
        if (!isNaN(parsedDob.getTime())) {
          const ageMs = Date.now() - parsedDob.getTime();
          const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
          isMinor = ageYears < 18;
        }
      }

      const cleanAvatarUrl = sanitizeImageUrl(req.body.avatarUrl);
      const player = await Player.create({
        name,
        teamId,
        sportType,
        role: sanitizeText(req.body.role, 80),
        jerseyNumber,
        avatarUrl: cleanAvatarUrl,
        avatarPublicId: cleanAvatarUrl ? sanitizeText(req.body.avatarPublicId, 260) : '',
        bio: sanitizeText(req.body.bio, 500),
        dateOfBirth: dob,
        isMinor,
        isVerified: Boolean(req.body.isVerified),
        verifiedBy: req.body.isVerified ? req.user!._id : null,
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      const populated = await Player.findById(player._id)
        .populate('teamId', 'name shortName logoUrl')
        .lean();
      await recordActivity(req.user!, 'CREATE_PLAYER', 'Player', player._id.toString(), name);
      res.status(201).json({ player: { ...populated, id: player._id.toString() } });
    } catch (err) {
      console.error('[Players] Create error:', err);
      res.status(500).json({ message: 'Failed to create player.' });
    }
  }
);

router.patch(
  '/players/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('managePlayers'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid player ID.' });
        return;
      }
      const player = await findDocByAnyId(Player, id, { select: '+avatarPublicId' });
      if (!player) {
        res.status(404).json({ message: 'Player not found.' });
        return;
      }

      const prevAvatarPublicId = String(player.avatarPublicId || '').trim();

      if (req.body.name !== undefined) {
        const cleanName = sanitizeText(req.body.name, 120);
        if (!cleanName) {
          res.status(400).json({ message: 'Player name cannot be empty.' });
          return;
        }
        player.name = cleanName;
      }
      if (req.body.teamId !== undefined) {
        player.teamId =
          req.body.teamId && mongoose.Types.ObjectId.isValid(req.body.teamId)
            ? req.body.teamId
            : null;
      }
      if (req.body.sportType && VALID_SPORTS.includes(req.body.sportType)) {
        player.sportType = req.body.sportType;
      }
      if (req.body.role !== undefined) player.role = sanitizeText(req.body.role, 80);
      if (req.body.bio !== undefined) player.bio = sanitizeText(req.body.bio, 500);
      if (req.body.avatarUrl !== undefined) {
        player.avatarUrl = sanitizeImageUrl(req.body.avatarUrl);
        if (!player.avatarUrl) {
          player.avatarPublicId = '';
        }
      }
      if (req.body.avatarPublicId !== undefined) {
        player.avatarPublicId = player.avatarUrl ? sanitizeText(req.body.avatarPublicId, 260) : '';
      }
      if (req.body.jerseyNumber !== undefined) {
        player.jerseyNumber =
          req.body.jerseyNumber !== '' &&
          req.body.jerseyNumber !== null &&
          Number.isFinite(Number(req.body.jerseyNumber))
            ? Math.max(0, Math.min(999, Number(req.body.jerseyNumber)))
            : null;
      }
      if (req.body.dateOfBirth !== undefined) {
        const dob = sanitizeText(req.body.dateOfBirth, 30);
        player.dateOfBirth = dob;
        if (dob) {
          const parsedDob = new Date(dob);
          if (!isNaN(parsedDob.getTime())) {
            const ageYears = (Date.now() - parsedDob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            player.isMinor = ageYears < 18;
          }
        }
      }
      if (typeof req.body.isMinor === 'boolean') player.isMinor = req.body.isMinor;
      if (typeof req.body.isVerified === 'boolean') {
        player.isVerified = req.body.isVerified;
        player.verifiedBy = req.body.isVerified ? (req.user!._id as mongoose.Types.ObjectId) : null;
      }
      player.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await player.save();

      const nextAvatarPublicId = String(player.avatarPublicId || '').trim();
      if (
        prevAvatarPublicId &&
        prevAvatarPublicId !== nextAvatarPublicId &&
        prevAvatarPublicId.startsWith('maidanlive/players/')
      ) {
        void deleteFromCloudinary(prevAvatarPublicId);
      }

      const populated = await Player.findById(player._id)
        .populate('teamId', 'name shortName logoUrl')
        .lean();
      await recordActivity(req.user!, 'UPDATE_PLAYER', 'Player', id, player.name);
      res.json({ player: { ...populated, id: player._id.toString() } });
    } catch (err) {
      console.error('[Players] Update error:', err);
      res.status(500).json({ message: 'Failed to update player.' });
    }
  }
);

router.delete(
  '/players/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('managePlayers'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid player ID.' });
        return;
      }
      const existing = await findDocByAnyId(Player, id, {
        select: '+avatarPublicId',
        lean: true,
      });
      const deleted = await deleteDocByAnyId(Player, id);
      if (!deleted) {
        res.status(404).json({ message: 'Player not found.' });
        return;
      }

      const pMatch = buildIdMatchFilter(id);
      await User.updateMany(
        { followedPlayerIds: pMatch },
        { $pull: { followedPlayerIds: pMatch } }
      );

      const oldPublicId = String(existing?.avatarPublicId || deleted?.avatarPublicId || '').trim();
      if (oldPublicId && oldPublicId.startsWith('maidanlive/players/')) {
        void deleteFromCloudinary(oldPublicId);
      }

      await recordActivity(req.user!, 'DELETE_PLAYER', 'Player', id, deleted.name);
      res.json({ message: 'Player deleted.' });
    } catch (err) {
      console.error('[Players] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete player.' });
    }
  }
);

router.post(
  '/players/:id/verify',
  authenticate,
  requireAdminPortal,
  requirePermission('managePlayers'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid player ID.' });
        return;
      }
      const player = await findDocByAnyId(Player, id);
      if (!player) {
        res.status(404).json({ message: 'Player not found.' });
        return;
      }
      player.isVerified = req.body.isVerified !== false;
      player.verifiedBy = player.isVerified ? (req.user!._id as mongoose.Types.ObjectId) : null;
      player.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await player.save();
      await recordActivity(
        req.user!,
        player.isVerified ? 'VERIFY_PLAYER' : 'UNVERIFY_PLAYER',
        'Player',
        id,
        player.name
      );
      res.json({ player: { ...player.toObject(), id: player._id.toString() } });
    } catch (err) {
      console.error('[Players] Verify error:', err);
      res.status(500).json({ message: 'Failed to update player verification.' });
    }
  }
);

// ==================== ADMIN USER MANAGEMENT (SUPER_ADMIN / ADMIN VIEW) ====================
router.get(
  '/admin/users',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN', 'ADMIN'),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      res.json({
        allPermissions: ALL_GRANULAR_PERMISSIONS,
        users: users.map((u) => ({
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          role: u.role,
          permissions: u.permissions,
          granularPermissions: u.granularPermissions || [],
          assignedStreamIds: (u.assignedStreamIds || []).map((id) => id.toString()),
          assignedTournamentIds: (u.assignedTournamentIds || []).map((id) => id.toString()),
          isActive: u.isActive,
          totpEnabled: Boolean(u.totpEnabled),
          failedLoginAttempts: u.failedLoginAttempts || 0,
          lockedUntil: u.lockedUntil || null,
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        })),
      });
    } catch (err) {
      console.error('[AdminUsers] List error:', err);
      res.status(500).json({ message: 'Failed to load users.' });
    }
  }
);

router.post(
  '/admin/users',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = sanitizeText(req.body.name, 120);
      const email = sanitizeText(req.body.email, 160).toLowerCase();
      const password = typeof req.body.password === 'string' ? req.body.password : '';
      const role = req.body.role as UserRole;

      const allowedRoles: UserRole[] = [
        'SUPER_ADMIN',
        'ADMIN',
        'TOURNAMENT_ORGANIZER',
        'BROADCASTER',
        'MODERATOR',
        'SCORER',
        'CAPTAIN',
      ];
      if (!allowedRoles.includes(role)) {
        res.status(400).json({ message: 'Invalid role.' });
        return;
      }

      if (!name || !email || password.length < 6) {
        res.status(400).json({
          message: 'Name, valid email, and password (min 6 characters) are required.',
        });
        return;
      }

      const existing = await User.findOne({ email });
      if (existing) {
        res.status(409).json({ message: 'An account with this email already exists.' });
        return;
      }

      const isManager = role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TOURNAMENT_ORGANIZER';
      const defaultPerms = {
        manageStreams: isManager || role === 'BROADCASTER',
        manageScores: role !== 'MODERATOR' && role !== 'CAPTAIN' && role !== 'BROADCASTER',
        manageTournaments: isManager,
        manageTeams: isManager,
        managePlayers: isManager,
        moderateChat: role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MODERATOR',
        manageSponsors: role === 'SUPER_ADMIN' || role === 'ADMIN',
        manageVenues: isManager,
        declareResults: role !== 'MODERATOR' && role !== 'CAPTAIN' && role !== 'BROADCASTER',
      };

      const perms = req.body.permissions
        ? {
            manageStreams: Boolean(req.body.permissions.manageStreams),
            manageScores: Boolean(req.body.permissions.manageScores),
            manageTournaments: Boolean(req.body.permissions.manageTournaments),
            manageTeams: Boolean(req.body.permissions.manageTeams),
            managePlayers: Boolean(req.body.permissions.managePlayers),
            moderateChat: Boolean(req.body.permissions.moderateChat),
            manageSponsors: Boolean(req.body.permissions.manageSponsors),
            manageVenues: Boolean(req.body.permissions.manageVenues),
            declareResults: req.body.permissions.declareResults !== false,
          }
        : defaultPerms;

      const granularPermissions = Array.isArray(req.body.granularPermissions)
        ? req.body.granularPermissions.filter((p: unknown): p is string => typeof p === 'string')
        : [];

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        email,
        passwordHash,
        role,
        permissions: perms,
        granularPermissions,
        assignedStreamIds: Array.isArray(req.body.assignedStreamIds)
          ? req.body.assignedStreamIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id))
          : [],
        assignedTournamentIds: Array.isArray(req.body.assignedTournamentIds)
          ? req.body.assignedTournamentIds.filter((id: string) =>
              mongoose.Types.ObjectId.isValid(id)
            )
          : [],
        isActive: true,
      });

      await recordActivity(
        req.user!,
        'CREATE_ADMIN_USER',
        'User',
        user._id.toString(),
        `${email} (${role})`
      );
      res.status(201).json({
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          granularPermissions: user.granularPermissions || [],
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error('[AdminUsers] Create error:', err);
      res.status(500).json({ message: 'Failed to create admin user.' });
    }
  }
);

router.patch(
  '/admin/users/:id',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid user ID.' });
        return;
      }
      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ message: 'User not found.' });
        return;
      }

      if (
        req.body.role &&
        [
          'SUPER_ADMIN',
          'ADMIN',
          'TOURNAMENT_ORGANIZER',
          'BROADCASTER',
          'MODERATOR',
          'SCORER',
          'CAPTAIN',
          'SPECTATOR',
        ].includes(req.body.role)
      ) {
        user.role = req.body.role;
      }
      if (req.body.permissions && typeof req.body.permissions === 'object') {
        user.permissions = {
          manageStreams: Boolean(req.body.permissions.manageStreams),
          manageScores: Boolean(req.body.permissions.manageScores),
          manageTournaments: Boolean(req.body.permissions.manageTournaments),
          manageTeams: Boolean(req.body.permissions.manageTeams),
          managePlayers: Boolean(req.body.permissions.managePlayers),
          moderateChat: Boolean(req.body.permissions.moderateChat),
          manageSponsors: Boolean(req.body.permissions.manageSponsors),
          manageVenues: Boolean(req.body.permissions.manageVenues),
          declareResults: req.body.permissions.declareResults !== false,
        };
      }
      if (Array.isArray(req.body.granularPermissions)) {
        user.granularPermissions = req.body.granularPermissions.filter(
          (p: unknown): p is string => typeof p === 'string'
        );
      }
      if (req.body.unlockAccount === true) {
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
      }
      if (typeof req.body.newPassword === 'string' && req.body.newPassword.length >= 6) {
        user.passwordHash = await bcrypt.hash(req.body.newPassword, 10);
      }
      if (typeof req.body.isActive === 'boolean') {
        if (user._id.toString() === req.user!._id.toString() && !req.body.isActive) {
          res
            .status(400)
            .json({ message: 'You cannot deactivate your own active Super Admin account.' });
          return;
        }
        user.isActive = req.body.isActive;
      }
      if (Array.isArray(req.body.assignedStreamIds)) {
        user.assignedStreamIds = req.body.assignedStreamIds.filter((s: string) =>
          mongoose.Types.ObjectId.isValid(s)
        );
      }
      if (Array.isArray(req.body.assignedTournamentIds)) {
        user.assignedTournamentIds = req.body.assignedTournamentIds.filter((s: string) =>
          mongoose.Types.ObjectId.isValid(s)
        );
      }
      await user.save();

      await recordActivity(req.user!, 'UPDATE_USER_ROLE', 'User', id, `${user.email} -> ${user.role}`);
      res.json({
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          permissions: user.permissions,
          granularPermissions: user.granularPermissions || [],
          assignedStreamIds: user.assignedStreamIds,
          assignedTournamentIds: user.assignedTournamentIds,
          isActive: user.isActive,
          totpEnabled: Boolean(user.totpEnabled),
          failedLoginAttempts: user.failedLoginAttempts || 0,
          lockedUntil: user.lockedUntil || null,
        },
      });
    } catch (err) {
      console.error('[AdminUsers] Update error:', err);
      res.status(500).json({ message: 'Failed to update user.' });
    }
  }
);

router.delete(
  '/admin/users/:id',
  authenticate,
  requireAdminPortal,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid user ID.' });
        return;
      }
      if (id === req.user!._id.toString()) {
        res.status(400).json({ message: 'Cannot delete your own account.' });
        return;
      }
      const deleted = await User.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'User not found.' });
        return;
      }
      await recordActivity(req.user!, 'DELETE_USER', 'User', id, deleted.email);
      res.json({ message: 'User deleted.' });
    } catch (err) {
      console.error('[AdminUsers] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete user.' });
    }
  }
);

// ==================== GLOBAL UNIFIED SEARCH ====================
router.get('/search', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawQ = typeof req.query.q === 'string' ? sanitizeText(req.query.q, 80) : '';
    const category = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : 'all';

    if (!rawQ) {
      res.json({
        query: '',
        matches: [],
        tournaments: [],
        teams: [],
        players: [],
        venues: [],
        organizers: [],
      });
      return;
    }

    const regex = new RegExp(rawQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const want = (k: string) => category === 'all' || category === k;

    const [streams, tournaments, teams, players, venues] = await Promise.all([
      want('matches')
        ? LiveStream.find({
            $or: [
              { matchTitle: regex },
              { teamAName: regex },
              { teamBName: regex },
              { tournamentName: regex },
              { location: regex },
              { gameName: regex },
            ],
          })
            .sort({ status: 1, matchDate: -1, createdAt: -1 })
            .limit(20)
            .lean()
        : Promise.resolve([]),
      want('tournaments') || want('organizers')
        ? Tournament.find({
            isPublished: { $ne: false },
            $or: [{ name: regex }, { location: regex }, { organizerName: regex }, { sportType: regex }],
          })
            .sort({ createdAt: -1 })
            .limit(25)
            .lean()
        : Promise.resolve([]),
      want('teams')
        ? Team.find({
            $or: [
              { name: regex },
              { shortName: regex },
              { city: regex },
              { captainName: regex },
              { sportType: regex },
            ],
          })
            .sort({ name: 1 })
            .limit(20)
            .lean()
        : Promise.resolve([]),
      want('players')
        ? Player.find({
            $or: [{ name: regex }, { role: regex }, { position: regex }, { sportType: regex }],
          })
            .populate('teamId', 'name shortName logoUrl')
            .sort({ name: 1 })
            .limit(20)
            .lean()
        : Promise.resolve([]),
      want('venues')
        ? Venue.find({
            $or: [{ name: regex }, { city: regex }, { state: regex }, { address: regex }],
          })
            .sort({ name: 1 })
            .limit(15)
            .lean()
        : Promise.resolve([]),
    ]);

    const uniqueStreams = dedupeDocsById(streams);
    const uniqueTournaments = dedupeDocsById(tournaments);
    const uniqueTeams = dedupeDocsById(teams);
    const uniquePlayers = dedupeDocsById(players);
    const uniqueVenues = dedupeDocsById(venues);

    const streamIds = uniqueStreams.map((s) => s._id);
    const scores =
      streamIds.length > 0
        ? await LiveScore.find({ liveStreamId: { $in: streamIds } }).lean()
        : [];
    const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));

    // Build distinct organizers list in JS (dualModel compatibility without .aggregate/.distinct)
    const orgMap = new Map<
      string,
      { name: string; tournamentCount: number; sports: Set<string>; latestTournamentId: string }
    >();
    if (want('organizers')) {
      for (const tr of uniqueTournaments) {
        const org = (tr.organizerName || '').trim();
        if (!org || !regex.test(org)) continue;
        const key = org.toLowerCase();
        const cur = orgMap.get(key) || {
          name: org,
          tournamentCount: 0,
          sports: new Set<string>(),
          latestTournamentId: tr._id.toString(),
        };
        cur.tournamentCount += 1;
        if (tr.sportType) cur.sports.add(tr.sportType);
        orgMap.set(key, cur);
      }
    }

    res.json({
      query: rawQ,
      matches: uniqueStreams.map((s) => {
        const item = {
          ...s,
          id: s._id.toString(),
          score: scoreMap.get(s._id.toString()) || null,
        };
        return req.user ? item : redactStreamPlayback(item);
      }),
      tournaments: want('tournaments')
        ? uniqueTournaments.map((t) => ({ ...t, id: t._id.toString() }))
        : [],
      teams: uniqueTeams.map((tm) => ({ ...tm, id: tm._id.toString() })),
      players: uniquePlayers.map(sanitizePublicPlayer),
      venues: uniqueVenues.map((v) => ({ ...v, id: v._id.toString() })),
      organizers: Array.from(orgMap.values()).map((o) => ({
        name: o.name,
        tournamentCount: o.tournamentCount,
        sports: Array.from(o.sports),
        latestTournamentId: o.latestTournamentId,
      })),
    });
  } catch (err) {
    console.error('[Search] Global search error:', err);
    res.status(500).json({ message: 'Failed to execute global search.' });
  }
});

// ==================== TOURNAMENT TEMPLATES ====================
router.get(
  '/tournament-templates',
  authenticate,
  requireAdminPortal,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const templates = await TournamentTemplate.find().sort({ createdAt: -1 }).lean();
      res.json({
        templates: templates.map((tpl) => ({ ...tpl, id: tpl._id.toString() })),
      });
    } catch (err) {
      console.error('[Templates] List error:', err);
      res.status(500).json({ message: 'Failed to load tournament templates.' });
    }
  }
);

router.post(
  '/tournament-templates',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = sanitizeText(req.body.name, 140);
      if (!name) {
        res.status(400).json({ message: 'Template name is required.' });
        return;
      }
      const sportType = VALID_SPORTS.includes(req.body.sportType) ? req.body.sportType : 'Cricket';
      const format = VALID_FORMATS.includes(req.body.format) ? req.body.format : 'KNOCKOUT';

      const template = await TournamentTemplate.create({
        name,
        sportType,
        format,
        groupCount: Math.max(1, Math.min(8, Number(req.body.groupCount) || 2)),
        location: sanitizeText(req.body.location, 160),
        prizeMoney: sanitizeText(req.body.prizeMoney, 120),
        prizes: sanitizeTournamentPrizes(req.body.prizes) || {},
        registrationFee: Math.max(0, Number(req.body.registrationFee) || 0),
        rules: sanitizeText(req.body.rules, 2000),
        qualificationRules: sanitizeText(req.body.qualificationRules, 400),
        description: sanitizeText(req.body.description, 1500),
        createdBy: req.user!._id,
      });

      await recordActivity(
        req.user!,
        'CREATE_TOURNAMENT_TEMPLATE',
        'TournamentTemplate',
        template._id.toString(),
        name
      );
      res
        .status(201)
        .json({ template: { ...template.toObject(), id: template._id.toString() } });
    } catch (err) {
      console.error('[Templates] Create error:', err);
      res.status(500).json({ message: 'Failed to save tournament template.' });
    }
  }
);

router.delete(
  '/tournament-templates/:id',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid template ID.' });
        return;
      }
      const deleted = await TournamentTemplate.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Template not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[Templates] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete tournament template.' });
    }
  }
);

export default router;
