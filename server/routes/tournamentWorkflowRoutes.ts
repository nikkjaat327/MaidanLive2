import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Tournament } from '../models/Tournament.ts';
import { Team } from '../models/Team.ts';
import { Fixture } from '../models/Fixture.ts';
import { Venue } from '../models/Venue.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import {
  authenticate,
  canManageTournament,
  requireAdminPortal,
  requirePermission,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { getInitialSportDetails } from '../../src/utils/scoringEngine.ts';
import type { SportType } from '../models/LiveStream.ts';
import {
  calculatePointsTable,
  generateTournamentFixtures,
} from '../../src/utils/tournamentEngine.ts';
import type { TournamentTeamInput } from '../../src/utils/tournamentEngine.ts';
import { extractYouTubeVideoId } from '../../src/utils/youtube.ts';
import { dispatchMatchNotifications } from '../utils/notifications.ts';

const router = Router();

// GET /api/tournaments/:id/fixtures
router.get('/tournaments/:id/fixtures', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid tournament ID.' });
      return;
    }
    const fixtures = await Fixture.find({ tournamentId: id })
      .sort({ roundNumber: 1, matchNumber: 1 })
      .lean();
    res.json({
      fixtures: fixtures.map((f) => ({ ...f, id: f._id.toString() })),
    });
  } catch (err) {
    console.error('[Fixtures] List error:', err);
    res.status(500).json({ message: 'Failed to load tournament fixtures.' });
  }
});

// GET /api/tournaments/:id/standings
router.get('/tournaments/:id/standings', async (req: Request, res: Response) => {
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

    const [teams, fixtures, streams] = await Promise.all([
      Team.find(teamFilter).sort({ name: 1 }).lean(),
      Fixture.find({ tournamentId: id }).lean(),
      LiveStream.find({ tournamentId: id }).select('_id').lean(),
    ]);

    const streamIds = streams.map((s) => s._id);
    const scores =
      streamIds.length > 0
        ? await LiveScore.find({ liveStreamId: { $in: streamIds } }).lean()
        : [];

    const streamsWithTeams = await LiveStream.find({ tournamentId: id })
      .select('_id teamAId teamBId')
      .lean();
    const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));
    const fixtureByStreamId = new Map<string, (typeof fixtures)[number]>();
    const teamGroupLookup: Record<string, string> = {};

    for (const f of fixtures) {
      if (f.groupName && f.groupName !== 'Knockout') {
        if (f.teamAId) teamGroupLookup[f.teamAId.toString()] = f.groupName;
        if (f.teamBId) teamGroupLookup[f.teamBId.toString()] = f.groupName;
      }
      if (f.liveStreamId) {
        fixtureByStreamId.set(f.liveStreamId.toString(), f);
      }
    }

    const confirmedMatches = streamsWithTeams
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
      teamGroupLookup
    );

    res.json({ pointsTable });
  } catch (err) {
    console.error('[Fixtures] Standings error:', err);
    res.status(500).json({ message: 'Failed to compute tournament standings.' });
  }
});

// POST /api/tournaments/:id/fixtures - Create a manual fixture
router.post(
  '/tournaments/:id/fixtures',
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
          message: 'Forbidden: You are not authorized to manage fixtures for this tournament.',
        });
        return;
      }

      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      let teamAId: mongoose.Types.ObjectId | null = null;
      let teamBId: mongoose.Types.ObjectId | null = null;
      let teamAName = sanitizeText(req.body.teamAName, 120) || 'TBD';
      let teamBName = sanitizeText(req.body.teamBName, 120) || 'TBD';
      let teamALogo = '';
      let teamBLogo = '';

      if (req.body.teamAId && mongoose.Types.ObjectId.isValid(req.body.teamAId)) {
        const tA = await Team.findById(req.body.teamAId);
        if (tA) {
          teamAId = tA._id as mongoose.Types.ObjectId;
          teamAName = tA.name;
          teamALogo = tA.logoUrl || '';
        }
      }

      if (req.body.teamBId && mongoose.Types.ObjectId.isValid(req.body.teamBId)) {
        const tB = await Team.findById(req.body.teamBId);
        if (tB) {
          teamBId = tB._id as mongoose.Types.ObjectId;
          teamBName = tB.name;
          teamBLogo = tB.logoUrl || '';
        }
      }

      let venueId: mongoose.Types.ObjectId | null = null;
      let location = sanitizeText(req.body.location, 160) || tournament.location || '';
      if (req.body.venueId && mongoose.Types.ObjectId.isValid(req.body.venueId)) {
        const venue = await Venue.findById(req.body.venueId);
        if (venue) {
          venueId = venue._id as mongoose.Types.ObjectId;
          if (!req.body.location) {
            location = [venue.name, venue.city].filter(Boolean).join(', ');
          }
        }
      }

      const existingCount = await Fixture.countDocuments({ tournamentId: id });
      const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;

      const fixture = await Fixture.create({
        tournamentId: tournament._id,
        roundNumber: Math.max(1, Number(req.body.roundNumber) || 1),
        roundName: sanitizeText(req.body.roundName, 100) || 'Round 1',
        groupName: sanitizeText(req.body.groupName, 60),
        matchNumber: Math.max(1, Number(req.body.matchNumber) || existingCount + 1),
        teamAId,
        teamBId,
        teamAName,
        teamBName,
        teamALogo,
        teamBLogo,
        venueId,
        location,
        scheduledAt: scheduledAt && !isNaN(scheduledAt.getTime()) ? scheduledAt : null,
        status: 'SCHEDULED',
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      await recordActivity(
        req.user!,
        'CREATE_FIXTURE',
        'Fixture',
        fixture._id.toString(),
        `${tournament.name}: ${teamAName} vs ${teamBName}`
      );

      res.status(201).json({ fixture: { ...fixture.toObject(), id: fixture._id.toString() } });
    } catch (err) {
      console.error('[Fixtures] Create error:', err);
      res.status(500).json({ message: 'Failed to create fixture.' });
    }
  }
);

// POST /api/tournaments/:id/fixtures/generate - Auto-generate knockout/league/group fixtures
router.post(
  '/tournaments/:id/fixtures/generate',
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
          message: 'Forbidden: You are not authorized to generate fixtures for this tournament.',
        });
        return;
      }

      const tournament = await Tournament.findById(id);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      const existingFixtures = await Fixture.find({ tournamentId: id });
      if (existingFixtures.length > 0) {
        const hasActiveOrCompleted = existingFixtures.some(
          (f) => f.status === 'LIVE' || f.status === 'COMPLETED' || f.resultConfirmed
        );
        if (hasActiveOrCompleted || req.body.replaceExisting !== true) {
          res.status(409).json({
            message: hasActiveOrCompleted
              ? 'Cannot regenerate fixtures after matches have started or completed.'
              : 'Fixtures already exist for this tournament. Confirm replaceExisting to regenerate.',
            existingCount: existingFixtures.length,
          });
          return;
        }
        await Fixture.deleteMany({ tournamentId: id });
      }

      // Resolve participating teams
      let teamIds: string[] = Array.isArray(req.body.teamIds)
        ? req.body.teamIds.filter((tid: string) => mongoose.Types.ObjectId.isValid(tid))
        : [];

      if (teamIds.length === 0 && Array.isArray(tournament.teamIds) && tournament.teamIds.length > 0) {
        teamIds = tournament.teamIds.map((tid) => tid.toString());
      }

      const teamsQuery =
        teamIds.length > 0 ? { _id: { $in: teamIds } } : { tournamentId: id };
      const teamDocs = await Team.find(teamsQuery).sort({ name: 1 }).lean();

      if (teamDocs.length < 2) {
        res.status(400).json({
          message: 'At least 2 participating teams are required to generate tournament fixtures.',
        });
        return;
      }

      const inputTeams: TournamentTeamInput[] = teamDocs.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        shortName: t.shortName,
        logoUrl: t.logoUrl,
      }));

      const format =
        ['KNOCKOUT', 'LEAGUE', 'GROUP_STAGE', 'GROUP_KNOCKOUT'].includes(req.body.format)
          ? req.body.format
          : tournament.format;

      const drafts = generateTournamentFixtures(
        format,
        inputTeams,
        Number(req.body.groupCount) || tournament.groupCount || 2
      );

      const createdDocs = await Fixture.insertMany(
        drafts.map((d) => {
          const byeWinnerId = d.isBye ? d.teamAId || d.teamBId || null : null;
          const byeWinnerName = d.isBye
            ? d.teamAId
              ? d.teamAName
              : d.teamBId
                ? d.teamBName
                : ''
            : '';
          return {
            tournamentId: tournament._id,
            roundNumber: d.roundNumber,
            roundName: d.roundName,
            groupName: d.groupName,
            matchNumber: d.matchNumber,
            teamAId: d.teamAId ? new mongoose.Types.ObjectId(d.teamAId) : null,
            teamBId: d.teamBId ? new mongoose.Types.ObjectId(d.teamBId) : null,
            teamAName: d.teamAName,
            teamBName: d.teamBName,
            teamALogo: d.teamALogo,
            teamBLogo: d.teamBLogo,
            venueId: tournament.venueId || null,
            location: tournament.location || '',
            status: d.isBye ? 'BYE' : 'SCHEDULED',
            isBye: d.isBye,
            winnerTeamId: byeWinnerId ? new mongoose.Types.ObjectId(byeWinnerId) : null,
            winnerTeamName: byeWinnerName,
            resultConfirmed: d.isBye && Boolean(byeWinnerId),
            resultSummary: d.isBye && byeWinnerName ? `${byeWinnerName} advanced via BYE` : '',
            createdBy: req.user!._id,
            updatedBy: req.user!._id,
          };
        })
      );

      // Link nextFixtureId references cleanly using tempKey mapping (Round 1 BYEs are already seeded into Round 2 drafts)
      const docByTempKey = new Map<string, (typeof createdDocs)[number]>();
      for (let i = 0; i < drafts.length; i++) {
        docByTempKey.set(drafts[i].tempKey, createdDocs[i]);
      }
      for (let i = 0; i < drafts.length; i++) {
        const draft = drafts[i];
        if (draft.nextTempKey) {
          const currentDoc = createdDocs[i];
          const nextDoc = docByTempKey.get(draft.nextTempKey);
          if (nextDoc) {
            currentDoc.nextFixtureId = nextDoc._id as mongoose.Types.ObjectId;
            currentDoc.nextFixtureSlot = draft.nextFixtureSlot || 'A';
            await currentDoc.save();
          }
        }
      }

      const finalFixtures = await Fixture.find({ tournamentId: id })
        .sort({ roundNumber: 1, matchNumber: 1 })
        .lean();

      await recordActivity(
        req.user!,
        'GENERATE_FIXTURES',
        'Tournament',
        id,
        `Generated ${finalFixtures.length} ${format} fixtures for ${tournament.name}`
      );

      if (tournament.isPublished) {
        await dispatchMatchNotifications({
          type: 'FIXTURE_PUBLISHED',
          title: 'Tournament Schedule Published',
          message: `${finalFixtures.length} fixtures generated for ${tournament.name}.`,
          entityType: 'Tournament',
          entityId: id,
          link: `/tournaments/${id}`,
          dedupeKey: `fixtures-generated-${id}-${finalFixtures.length}`,
          teamIds: teamDocs.map((t) => t._id),
          includeAllSpectatorsIfNoFollowers: true,
        });
      }

      res.status(201).json({
        fixtures: finalFixtures.map((f) => ({ ...f, id: f._id.toString() })),
      });
    } catch (err) {
      console.error('[Fixtures] Generate error:', err);
      res.status(500).json({ message: 'Failed to generate fixtures.' });
    }
  }
);

// PATCH /api/fixtures/:fixtureId
router.patch(
  '/fixtures/:fixtureId',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fixtureId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(fixtureId)) {
        res.status(400).json({ message: 'Invalid fixture ID.' });
        return;
      }

      const fixture = await Fixture.findById(fixtureId);
      if (!fixture) {
        res.status(404).json({ message: 'Fixture not found.' });
        return;
      }

      const allowed = await canManageTournament(req.user!, fixture.tournamentId.toString());
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to edit this fixture.',
        });
        return;
      }

      if (req.body.roundName !== undefined) fixture.roundName = sanitizeText(req.body.roundName, 100);
      if (req.body.groupName !== undefined) fixture.groupName = sanitizeText(req.body.groupName, 60);
      if (req.body.location !== undefined) fixture.location = sanitizeText(req.body.location, 160);
      if (req.body.scheduledAt !== undefined) {
        const d = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
        fixture.scheduledAt = d && !isNaN(d.getTime()) ? d : null;
      }
      if (req.body.teamAId !== undefined && mongoose.Types.ObjectId.isValid(req.body.teamAId)) {
        const tA = await Team.findById(req.body.teamAId);
        if (tA) {
          fixture.teamAId = tA._id as mongoose.Types.ObjectId;
          fixture.teamAName = tA.name;
          fixture.teamALogo = tA.logoUrl || '';
        }
      }
      if (req.body.teamBId !== undefined && mongoose.Types.ObjectId.isValid(req.body.teamBId)) {
        const tB = await Team.findById(req.body.teamBId);
        if (tB) {
          fixture.teamBId = tB._id as mongoose.Types.ObjectId;
          fixture.teamBName = tB.name;
          fixture.teamBLogo = tB.logoUrl || '';
        }
      }
      if (req.body.venueId !== undefined) {
        if (req.body.venueId && mongoose.Types.ObjectId.isValid(req.body.venueId)) {
          const venue = await Venue.findById(req.body.venueId);
          if (venue) {
            fixture.venueId = venue._id as mongoose.Types.ObjectId;
            if (!fixture.location) fixture.location = [venue.name, venue.city].filter(Boolean).join(', ');
          }
        } else {
          fixture.venueId = null;
        }
      }
      if (
        req.body.status &&
        ['SCHEDULED', 'LIVE', 'COMPLETED', 'BYE', 'CANCELLED'].includes(req.body.status)
      ) {
        fixture.status = req.body.status;
      }

      fixture.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await fixture.save();

      await recordActivity(
        req.user!,
        'UPDATE_FIXTURE',
        'Fixture',
        fixtureId,
        `${fixture.roundName} M${fixture.matchNumber}: ${fixture.teamAName} vs ${fixture.teamBName}`
      );

      res.json({ fixture: { ...fixture.toObject(), id: fixture._id.toString() } });
    } catch (err) {
      console.error('[Fixtures] Update error:', err);
      res.status(500).json({ message: 'Failed to update fixture.' });
    }
  }
);

// DELETE /api/fixtures/:fixtureId
router.delete(
  '/fixtures/:fixtureId',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fixtureId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(fixtureId)) {
        res.status(400).json({ message: 'Invalid fixture ID.' });
        return;
      }
      const fixture = await Fixture.findById(fixtureId);
      if (!fixture) {
        res.status(404).json({ message: 'Fixture not found.' });
        return;
      }
      const allowed = await canManageTournament(req.user!, fixture.tournamentId.toString());
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to delete this fixture.',
        });
        return;
      }
      await Fixture.deleteOne({ _id: fixtureId });
      await recordActivity(
        req.user!,
        'DELETE_FIXTURE',
        'Fixture',
        fixtureId,
        `${fixture.teamAName} vs ${fixture.teamBName}`
      );
      res.json({ message: 'Fixture deleted.' });
    } catch (err) {
      console.error('[Fixtures] Delete error:', err);
      res.status(500).json({ message: 'Failed to delete fixture.' });
    }
  }
);

// POST /api/fixtures/:fixtureId/link-stream - Attach existing stream or create stream from fixture
router.post(
  '/fixtures/:fixtureId/link-stream',
  authenticate,
  requireAdminPortal,
  requirePermission('manageTournaments'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fixtureId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(fixtureId)) {
        res.status(400).json({ message: 'Invalid fixture ID.' });
        return;
      }
      const fixture = await Fixture.findById(fixtureId);
      if (!fixture) {
        res.status(404).json({ message: 'Fixture not found.' });
        return;
      }
      const allowed = await canManageTournament(req.user!, fixture.tournamentId.toString());
      if (!allowed) {
        res.status(403).json({ message: 'Forbidden: Not authorized for this tournament.' });
        return;
      }

      const tournament = await Tournament.findById(fixture.tournamentId);
      if (!tournament) {
        res.status(404).json({ message: 'Tournament not found.' });
        return;
      }

      if (req.body.liveStreamId && mongoose.Types.ObjectId.isValid(req.body.liveStreamId)) {
        const existingStream = await LiveStream.findById(req.body.liveStreamId);
        if (!existingStream) {
          res.status(404).json({ message: 'Selected LiveStream not found.' });
          return;
        }
        fixture.liveStreamId = existingStream._id as mongoose.Types.ObjectId;
        if (existingStream.status === 'LIVE') fixture.status = 'LIVE';
        await fixture.save();
        res.json({
          fixture: { ...fixture.toObject(), id: fixture._id.toString() },
          stream: { ...existingStream.toObject(), id: existingStream._id.toString() },
        });
        return;
      }

      // Create new stream directly from fixture + youtubeInput
      const rawYt = typeof req.body.youtubeInput === 'string' ? req.body.youtubeInput : '';
      const parsedYt = extractYouTubeVideoId(rawYt);
      if (!parsedYt.valid || !parsedYt.videoId) {
        res.status(400).json({
          message: parsedYt.error || 'A valid YouTube Video ID or URL is required to create a match stream.',
        });
        return;
      }

      const requestedStatus = req.body.status === 'LIVE' ? 'LIVE' : 'UPCOMING';
      const sport: SportType = (tournament.sportType as SportType) || 'Other';

      const stream = await LiveStream.create({
        youtubeVideoId: parsedYt.videoId,
        youtubeInput: sanitizeText(rawYt, 300),
        teamAId: fixture.teamAId || null,
        teamBId: fixture.teamBId || null,
        teamAName: fixture.teamAName,
        teamBName: fixture.teamBName,
        teamALogo: fixture.teamALogo,
        teamBLogo: fixture.teamBLogo,
        venueId: fixture.venueId || tournament.venueId || null,
        location: fixture.location || tournament.location || '',
        gameName: sport,
        matchTitle: `${fixture.teamAName} vs ${fixture.teamBName} · ${fixture.roundName}`,
        tournamentName: tournament.name,
        tournamentId: tournament._id,
        matchDate: fixture.scheduledAt || null,
        status: requestedStatus,
        startedAt: requestedStatus === 'LIVE' ? new Date() : null,
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      await LiveScore.create({
        liveStreamId: stream._id,
        sportType: sport,
        teamAScore: 0,
        teamBScore: 0,
        sportSpecificDetails: getInitialSportDetails(sport),
        matchStatus: requestedStatus === 'LIVE' ? 'Live' : 'Upcoming',
        lastUpdatedBy: req.user!._id,
        lastUpdatedAt: new Date(),
      });

      fixture.liveStreamId = stream._id as mongoose.Types.ObjectId;
      fixture.status = requestedStatus === 'LIVE' ? 'LIVE' : 'SCHEDULED';
      await fixture.save();

      await recordActivity(
        req.user!,
        'LINK_FIXTURE_STREAM',
        'Fixture',
        fixtureId,
        `Linked stream ${parsedYt.videoId} to ${fixture.teamAName} vs ${fixture.teamBName}`
      );

      res.status(201).json({
        fixture: { ...fixture.toObject(), id: fixture._id.toString() },
        stream: { ...stream.toObject(), id: stream._id.toString() },
      });
    } catch (err) {
      console.error('[Fixtures] Link stream error:', err);
      res.status(500).json({ message: 'Failed to link stream to fixture.' });
    }
  }
);

export default router;
