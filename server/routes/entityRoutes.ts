import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Tournament } from '../models/Tournament.ts';
import { Team } from '../models/Team.ts';
import { Player } from '../models/Player.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { Fixture } from '../models/Fixture.ts';
import { Venue } from '../models/Venue.ts';
import { PlayerMatchStat } from '../models/PlayerMatchStat.ts';
import { User, ALL_GRANULAR_PERMISSIONS } from '../models/User.ts';
import type { UserRole } from '../models/User.ts';
import { ActivityLog } from '../models/ActivityLog.ts';
import {
  authenticate,
  canManageTournament,
  requireAdminPortal,
  requirePermission,
  requireRole,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { calculatePointsTable } from '../../src/utils/tournamentEngine.ts';
import { dispatchMatchNotifications } from '../utils/notifications.ts';

const router = Router();
const VALID_SPORTS = ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'];
const VALID_FORMATS = ['KNOCKOUT', 'LEAGUE', 'GROUP_STAGE', 'GROUP_KNOCKOUT'];

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
        tournamentsCount,
        teamsCount,
        playersCount,
        recentActivity,
      ] = await Promise.all([
        LiveStream.countDocuments(),
        LiveStream.countDocuments({ status: 'LIVE' }),
        LiveStream.countDocuments({ status: 'ENDED' }),
        LiveStream.countDocuments({ status: 'UPCOMING' }),
        LiveStream.countDocuments({ replayAvailable: true, replayVideoId: { $ne: '' } }),
        LiveStream.countDocuments({ replayPublished: true, replayAvailable: true }),
        Tournament.countDocuments(),
        Team.countDocuments(),
        Player.countDocuments(),
        ActivityLog.find().sort({ createdAt: -1 }).limit(15).lean(),
      ]);

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

router.get('/tournaments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid tournament ID.' });
      return;
    }
    const tournament = await Tournament.findById(id).lean();
    if (!tournament) {
      res.status(404).json({ message: 'Tournament not found.' });
      return;
    }

    const teamFilter =
      Array.isArray(tournament.teamIds) && tournament.teamIds.length > 0
        ? { $or: [{ tournamentId: id }, { _id: { $in: tournament.teamIds } }] }
        : { tournamentId: id };

    const [streams, teams, fixtures, venue] = await Promise.all([
      LiveStream.find({ tournamentId: id }).sort({ createdAt: -1 }).lean(),
      Team.find(teamFilter).sort({ name: 1 }).lean(),
      Fixture.find({ tournamentId: id })
        .sort({ roundNumber: 1, matchNumber: 1 })
        .lean(),
      tournament.venueId ? Venue.findById(tournament.venueId).lean() : Promise.resolve(null),
    ]);

    const streamIds = streams.map((s) => s._id);
    const scores =
      streamIds.length > 0
        ? await LiveScore.find({ liveStreamId: { $in: streamIds } }).lean()
        : [];
    const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));
    const enrichedStreams = streams.map((s) => ({
      ...s,
      id: s._id.toString(),
      score: scoreMap.get(s._id.toString()) || null,
    }));

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

    res.json({
      tournament: { ...tournament, id: tournament._id.toString() },
      streams: enrichedStreams,
      teams: teams.map((t) => ({ ...t, id: t._id.toString() })),
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

      const teamIds = Array.isArray(req.body.teamIds)
        ? req.body.teamIds.filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
        : [];

      const tournament = await Tournament.create({
        name,
        sportType,
        format,
        logoUrl: sanitizeImageUrl(req.body.logoUrl),
        location,
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
        registrationOpen: req.body.registrationOpen === true,
        registrationFee: Math.max(0, Number(req.body.registrationFee) || 0),
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
      const allowed = await canManageTournament(req.user!, id);
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to edit this tournament.',
        });
        return;
      }
      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
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
      if (typeof req.body.registrationOpen === 'boolean') {
        tournament.registrationOpen = req.body.registrationOpen;
      }
      if (req.body.registrationFee !== undefined) {
        tournament.registrationFee = Math.max(0, Number(req.body.registrationFee) || 0);
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
      const allowed = await canManageTournament(req.user!, id);
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to delete this tournament.',
        });
        return;
      }
      const deleted = await Tournament.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }
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
      query.tournamentId = req.query.tournamentId;
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const regex = new RegExp(
        req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i'
      );
      query.$or = [{ name: regex }, { shortName: regex }, { city: regex }];
    }

    const teams = await Team.find(query)
      .populate('tournamentId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      teams: teams.map((t) => ({ ...t, id: t._id.toString() })),
    });
  } catch (err) {
    console.error('[Teams] List error:', err);
    res.status(500).json({ message: 'Failed to load teams.' });
  }
});

// Public Team Profile Page endpoint
router.get('/teams/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid team ID.' });
      return;
    }
    const team = await Team.findById(id).populate('tournamentId', 'name sportType').lean();
    if (!team) {
      res.status(404).json({ message: 'Team not found.' });
      return;
    }

    const [players, streams, fixtures] = await Promise.all([
      Player.find({ teamId: id }).sort({ jerseyNumber: 1, name: 1 }).lean(),
      LiveStream.find({ $or: [{ teamAId: id }, { teamBId: id }] })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Fixture.find({ $or: [{ teamAId: id }, { teamBId: id }] })
        .sort({ scheduledAt: 1, roundNumber: 1 })
        .limit(50)
        .lean(),
    ]);

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
      return {
        ...s,
        id: s._id.toString(),
        score: sc,
      };
    });

    res.json({
      team: { ...team, id: team._id.toString() },
      players: players.map((p) => ({ ...p, id: p._id.toString() })),
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
      res.status(201).json({ team: { ...team.toObject(), id: team._id.toString() } });
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
      const team = await Team.findById(id);
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
      const deleted = await Team.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Team not found.' });
        return;
      }
      await recordActivity(req.user!, 'DELETE_TEAM', 'Team', id, deleted.name);
      res.json({ message: 'Team deleted.' });
    } catch (err) {
      console.error('[Teams] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete team.' });
    }
  }
);

// ==================== PLAYERS ====================
router.get('/players', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (typeof req.query.teamId === 'string' && mongoose.Types.ObjectId.isValid(req.query.teamId)) {
      query.teamId = req.query.teamId;
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
    const players = await Player.find(query)
      .populate('teamId', 'name shortName logoUrl')
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      players: players.map((p) => ({ ...p, id: p._id.toString() })),
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
    const player = await Player.findById(id)
      .populate('teamId', 'name shortName logoUrl city sportType')
      .lean();
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
      player: { ...player, id: player._id.toString() },
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

      const player = await Player.create({
        name,
        teamId,
        sportType,
        role: sanitizeText(req.body.role, 80),
        jerseyNumber,
        avatarUrl: sanitizeImageUrl(req.body.avatarUrl),
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
      const player = await Player.findById(id);
      if (!player) {
        res.status(404).json({ message: 'Player not found.' });
        return;
      }

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
      if (req.body.avatarUrl !== undefined) player.avatarUrl = sanitizeImageUrl(req.body.avatarUrl);
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
      const deleted = await Player.findByIdAndDelete(id);
      if (!deleted) {
        res.status(404).json({ message: 'Player not found.' });
        return;
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
      const player = await Player.findById(id);
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
        manageStreams: isManager,
        manageScores: role !== 'MODERATOR' && role !== 'CAPTAIN',
        manageTournaments: isManager,
        manageTeams: isManager,
        managePlayers: isManager,
        moderateChat: role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'MODERATOR',
        manageSponsors: role === 'SUPER_ADMIN' || role === 'ADMIN',
        manageVenues: isManager,
        declareResults: role !== 'MODERATOR' && role !== 'CAPTAIN',
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

export default router;
