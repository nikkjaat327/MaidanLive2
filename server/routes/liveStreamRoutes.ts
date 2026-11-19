import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { LiveStream } from '../models/LiveStream.ts';
import type { ScoreboardPosition, SportType, StreamStatus } from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { Team } from '../models/Team.ts';
import { Tournament } from '../models/Tournament.ts';
import { Venue } from '../models/Venue.ts';
import {
  authenticate,
  canManageStream,
  requireAdminPortal,
  requirePermission,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { extractYouTubeVideoId } from '../../src/utils/youtube.ts';
import { verifyYouTubeVideoAvailability } from '../utils/youtubeVerify.ts';
import { getInitialSportDetails } from '../../src/utils/scoringEngine.ts';
import { sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import { emitStreamEvent } from '../socket/index.ts';
import { recordActivity } from '../utils/audit.ts';
import { dispatchMatchNotifications } from '../utils/notifications.ts';

const router = Router();

const VALID_SPORTS: SportType[] = ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'];
const VALID_POSITIONS: ScoreboardPosition[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];

function normalizeSport(val: unknown): SportType | '' {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim() as SportType;
  return VALID_SPORTS.includes(trimmed) ? trimmed : '';
}

function normalizePosition(val: unknown): ScoreboardPosition {
  if (typeof val === 'string' && VALID_POSITIONS.includes(val.trim() as ScoreboardPosition)) {
    return val.trim() as ScoreboardPosition;
  }
  return 'TOP';
}

async function attachScoresToStreams(streams: any[]) {
  if (streams.length === 0) return [];
  const ids = streams.map((s) => s._id);
  const scores = await LiveScore.find({ liveStreamId: { $in: ids } }).lean();
  const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));
  return streams.map((s) => ({
    ...s,
    id: s._id.toString(),
    score: scoreMap.get(s._id.toString()) || null,
  }));
}

// Verify YouTube Video ID or URL availability & embeddability
router.post(
  '/verify-youtube',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const input = typeof req.body.youtubeInput === 'string' ? req.body.youtubeInput : '';
      const result = await verifyYouTubeVideoAvailability(input);
      res.json(result);
    } catch (err) {
      console.error('[LiveStream] YouTube verification error:', err);
      res.status(500).json({ message: 'Failed to verify YouTube video.' });
    }
  }
);

// POST /api/live - Start or schedule a LiveStream (only YouTube Video ID/URL is mandatory)
router.post(
  '/',
  authenticate,
  requireAdminPortal,
  requirePermission('manageStreams'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawYoutube =
        typeof req.body.youtubeInput === 'string'
          ? req.body.youtubeInput
          : typeof req.body.youtubeVideoId === 'string'
            ? req.body.youtubeVideoId
            : '';

      const parsedYt = extractYouTubeVideoId(rawYoutube);
      if (!parsedYt.valid || !parsedYt.videoId) {
        res.status(400).json({
          message: parsedYt.error || 'A valid YouTube Video ID or URL is required.',
        });
        return;
      }

      const requestedStatus: StreamStatus =
        req.body.status === 'UPCOMING' ? 'UPCOMING' : 'LIVE';

      if (requestedStatus === 'LIVE') {
        const duplicate = await LiveStream.findOne({
          youtubeVideoId: parsedYt.videoId,
          status: 'LIVE',
        });
        if (duplicate) {
          res.status(409).json({
            message: `An active LIVE stream already exists for YouTube Video ID "${parsedYt.videoId}".`,
            existingStreamId: duplicate._id.toString(),
          });
          return;
        }
      }

      let teamAName = sanitizeText(req.body.teamAName, 100);
      let teamBName = sanitizeText(req.body.teamBName, 100);
      let teamALogo = sanitizeImageUrl(req.body.teamALogo);
      let teamBLogo = sanitizeImageUrl(req.body.teamBLogo);
      let teamAId: mongoose.Types.ObjectId | null = null;
      let teamBId: mongoose.Types.ObjectId | null = null;

      if (req.body.teamAId && mongoose.Types.ObjectId.isValid(req.body.teamAId)) {
        const tA = await Team.findById(req.body.teamAId);
        if (tA) {
          teamAId = tA._id as mongoose.Types.ObjectId;
          if (!teamAName) teamAName = tA.name;
          if (!teamALogo) teamALogo = tA.logoUrl || '';
        }
      }

      if (req.body.teamBId && mongoose.Types.ObjectId.isValid(req.body.teamBId)) {
        const tB = await Team.findById(req.body.teamBId);
        if (tB) {
          teamBId = tB._id as mongoose.Types.ObjectId;
          if (!teamBName) teamBName = tB.name;
          if (!teamBLogo) teamBLogo = tB.logoUrl || '';
        }
      }

      let tournamentId: mongoose.Types.ObjectId | null = null;
      let tournamentName = sanitizeText(req.body.tournamentName, 160);
      if (req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)) {
        const tour = await Tournament.findById(req.body.tournamentId);
        if (tour) {
          tournamentId = tour._id as mongoose.Types.ObjectId;
          if (!tournamentName) tournamentName = tour.name;
        }
      }

      let venueId: mongoose.Types.ObjectId | null = null;
      let location = sanitizeText(req.body.location, 160);
      if (req.body.venueId && mongoose.Types.ObjectId.isValid(req.body.venueId)) {
        const venue = await Venue.findById(req.body.venueId);
        if (venue) {
          venueId = venue._id as mongoose.Types.ObjectId;
          if (!location) {
            location = [venue.name, venue.city].filter(Boolean).join(', ');
          }
        }
      }

      const gameName = normalizeSport(req.body.gameName);
      const scoreSport: SportType = gameName || 'Other';

      const matchDate = req.body.matchDate ? new Date(req.body.matchDate) : null;
      const validMatchDate = matchDate && !isNaN(matchDate.getTime()) ? matchDate : null;

      const stream = await LiveStream.create({
        youtubeVideoId: parsedYt.videoId,
        youtubeInput: sanitizeText(rawYoutube, 300),
        teamAName,
        teamBName,
        teamAId,
        teamBId,
        teamALogo,
        teamBLogo,
        location,
        venueId,
        gameName,
        matchTitle: sanitizeText(req.body.matchTitle, 180),
        tournamentName,
        tournamentId,
        matchDate: validMatchDate,
        matchDescription: sanitizeText(req.body.matchDescription, 1000),
        status: requestedStatus,
        startedAt: requestedStatus === 'LIVE' ? new Date() : null,
        scoreboardVisibleByDefault:
          req.body.scoreboardVisibleByDefault === false ? false : true,
        scoreboardPosition: normalizePosition(req.body.scoreboardPosition),
        chatEnabled: req.body.chatEnabled === false ? false : true,
        highlightsEnabled: req.body.highlightsEnabled === false ? false : true,
        replayDescription: sanitizeText(req.body.replayDescription, 500),
        createdBy: req.user!._id,
        updatedBy: req.user!._id,
      });

      const initialScore = await LiveScore.create({
        liveStreamId: stream._id,
        sportType: scoreSport,
        teamAScore: 0,
        teamBScore: 0,
        sportSpecificDetails: getInitialSportDetails(scoreSport),
        matchStatus: requestedStatus === 'UPCOMING' ? 'Upcoming' : 'Live',
        lastUpdatedBy: req.user!._id,
        lastUpdatedAt: new Date(),
      });

      await recordActivity(
        req.user!,
        requestedStatus === 'LIVE' ? 'START_STREAM' : 'SCHEDULE_STREAM',
        'LiveStream',
        stream._id.toString(),
        `${stream.matchTitle || parsedYt.videoId} (${scoreSport})`,
        {
          newValue: {
            status: requestedStatus,
            youtubeVideoId: parsedYt.videoId,
            gameName: scoreSport,
            scoreboardPosition: stream.scoreboardPosition,
          },
        }
      );

      const responsePayload = {
        ...stream.toObject(),
        id: stream._id.toString(),
        score: initialScore.toObject(),
      };

      if (requestedStatus === 'LIVE') {
        emitStreamEvent(stream._id.toString(), 'live:started', responsePayload);
        await dispatchMatchNotifications({
          type: 'MATCH_LIVE',
          title: 'Match is Live Now',
          message:
            stream.matchTitle ||
            [teamAName, teamBName].filter(Boolean).join(' vs ') ||
            'A scheduled match is now live!',
          entityType: 'LiveStream',
          entityId: stream._id.toString(),
          link: `/live/${stream._id.toString()}`,
          dedupeKey: `stream-live-${stream._id.toString()}`,
          teamIds: [teamAId, teamBId],
          includeAllSpectatorsIfNoFollowers: true,
        });
      } else {
        emitStreamEvent(stream._id.toString(), 'live:updated', responsePayload);
        if (teamAId || teamBId) {
          await dispatchMatchNotifications({
            type: 'MATCH_STARTING',
            title: 'Upcoming Match Scheduled',
            message:
              stream.matchTitle ||
              [teamAName, teamBName].filter(Boolean).join(' vs ') ||
              'An upcoming match has been scheduled.',
            entityType: 'LiveStream',
            entityId: stream._id.toString(),
            link: `/live/${stream._id.toString()}`,
            dedupeKey: `stream-upcoming-${stream._id.toString()}`,
            teamIds: [teamAId, teamBId],
          });
        }
      }

      res.status(201).json({ stream: responsePayload });
    } catch (err) {
      console.error('[LiveStream] Create error:', err);
      res.status(500).json({ message: 'Failed to create live stream.' });
    }
  }
);

// GET /api/live - List streams (with optional status/gameName/tournamentId/search/pagination)
router.get('/', async (req: Request, res: Response) => {
  try {
    const query: Record<string, unknown> = {};
    if (
      typeof req.query.status === 'string' &&
      ['UPCOMING', 'LIVE', 'ENDED'].includes(req.query.status)
    ) {
      query.status = req.query.status;
    }
    if (
      typeof req.query.gameName === 'string' &&
      VALID_SPORTS.includes(req.query.gameName as SportType)
    ) {
      query.gameName = req.query.gameName;
    }
    if (
      typeof req.query.tournamentId === 'string' &&
      mongoose.Types.ObjectId.isValid(req.query.tournamentId)
    ) {
      query.tournamentId = req.query.tournamentId;
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      query.$or = [
        { matchTitle: regex },
        { teamAName: regex },
        { teamBName: regex },
        { tournamentName: regex },
        { location: regex },
      ];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const [streams, total] = await Promise.all([
      LiveStream.find(query)
        .sort({ status: 1, startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LiveStream.countDocuments(query),
    ]);

    const enriched = await attachScoresToStreams(streams);
    res.json({ streams: enriched, total, page, limit });
  } catch (err) {
    console.error('[LiveStream] List error:', err);
    res.status(500).json({ message: 'Failed to load streams.' });
  }
});

// GET /api/live/active - Active LIVE streams
router.get('/active', async (_req: Request, res: Response) => {
  try {
    const streams = await LiveStream.find({ status: 'LIVE' })
      .sort({ startedAt: -1, createdAt: -1 })
      .lean();
    const enriched = await attachScoresToStreams(streams);
    res.json({ streams: enriched });
  } catch (err) {
    console.error('[LiveStream] Active error:', err);
    res.status(500).json({ message: 'Failed to load active streams.' });
  }
});

// GET /api/live/history - Ended streams
router.get('/history', async (_req: Request, res: Response) => {
  try {
    const streams = await LiveStream.find({ status: 'ENDED' })
      .sort({ endedAt: -1, updatedAt: -1 })
      .limit(100)
      .lean();
    const enriched = await attachScoresToStreams(streams);
    res.json({ streams: enriched });
  } catch (err) {
    console.error('[LiveStream] History error:', err);
    res.status(500).json({ message: 'Failed to load stream history.' });
  }
});

// GET /api/live/replays - Published available replays for Customer Portal
router.get('/replays', async (req: Request, res: Response) => {
  try {
    const includeAll = req.query.all === 'true';
    const query: Record<string, unknown> = includeAll
      ? { status: 'ENDED' }
      : { replayPublished: true, replayAvailable: true, replayVideoId: { $ne: '' } };

    if (
      typeof req.query.gameName === 'string' &&
      VALID_SPORTS.includes(req.query.gameName as SportType)
    ) {
      query.gameName = req.query.gameName;
    }

    const streams = await LiveStream.find(query)
      .sort({ endedAt: -1, updatedAt: -1 })
      .limit(100)
      .lean();
    const enriched = await attachScoresToStreams(streams);
    res.json({ replays: enriched });
  } catch (err) {
    console.error('[LiveStream] Replays error:', err);
    res.status(500).json({ message: 'Failed to load replays.' });
  }
});

// GET /api/live/:id - Get single stream + score + venue
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const stream = await LiveStream.findById(id).lean();
    if (!stream) {
      res.status(404).json({ message: 'Live stream not found.' });
      return;
    }

    const [score, venue] = await Promise.all([
      LiveScore.findOne({ liveStreamId: stream._id }).lean(),
      stream.venueId ? Venue.findById(stream.venueId).lean() : Promise.resolve(null),
    ]);
    res.json({
      stream: {
        ...stream,
        id: stream._id.toString(),
        score: score || null,
        venue: venue ? { ...venue, id: venue._id.toString() } : null,
      },
    });
  } catch (err) {
    console.error('[LiveStream] Get error:', err);
    res.status(500).json({ message: 'Failed to load live stream details.' });
  }
});

// PATCH /api/live/:id - Edit optional match info, go live from UPCOMING, or update YouTube ID
router.patch(
  '/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'stream');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You do not have permission to edit this stream.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      const previousValue = {
        status: stream.status,
        youtubeVideoId: stream.youtubeVideoId,
        matchTitle: stream.matchTitle,
        scoreboardPosition: stream.scoreboardPosition,
        scoreboardVisibleByDefault: stream.scoreboardVisibleByDefault,
        chatEnabled: stream.chatEnabled,
      };

      if (req.body.youtubeInput !== undefined || req.body.youtubeVideoId !== undefined) {
        const rawYt =
          typeof req.body.youtubeInput === 'string'
            ? req.body.youtubeInput
            : typeof req.body.youtubeVideoId === 'string'
              ? req.body.youtubeVideoId
              : '';
        const parsedYt = extractYouTubeVideoId(rawYt);
        if (!parsedYt.valid || !parsedYt.videoId) {
          res.status(400).json({
            message: parsedYt.error || 'Invalid YouTube Video ID or URL.',
          });
          return;
        }
        stream.youtubeVideoId = parsedYt.videoId;
        stream.youtubeInput = sanitizeText(rawYt, 300);
      }

      if (req.body.teamAName !== undefined) stream.teamAName = sanitizeText(req.body.teamAName, 100);
      if (req.body.teamBName !== undefined) stream.teamBName = sanitizeText(req.body.teamBName, 100);
      if (req.body.teamALogo !== undefined) stream.teamALogo = sanitizeImageUrl(req.body.teamALogo);
      if (req.body.teamBLogo !== undefined) stream.teamBLogo = sanitizeImageUrl(req.body.teamBLogo);
      if (req.body.location !== undefined) stream.location = sanitizeText(req.body.location, 160);
      if (req.body.matchTitle !== undefined) stream.matchTitle = sanitizeText(req.body.matchTitle, 180);
      if (req.body.tournamentName !== undefined) {
        stream.tournamentName = sanitizeText(req.body.tournamentName, 160);
      }
      if (req.body.matchDescription !== undefined) {
        stream.matchDescription = sanitizeText(req.body.matchDescription, 1000);
      }
      if (req.body.replayDescription !== undefined) {
        stream.replayDescription = sanitizeText(req.body.replayDescription, 500);
      }
      if (req.body.matchDate !== undefined) {
        const d = req.body.matchDate ? new Date(req.body.matchDate) : null;
        stream.matchDate = d && !isNaN(d.getTime()) ? d : null;
      }

      if (req.body.venueId !== undefined) {
        if (req.body.venueId && mongoose.Types.ObjectId.isValid(req.body.venueId)) {
          const venue = await Venue.findById(req.body.venueId);
          if (venue) {
            stream.venueId = venue._id as mongoose.Types.ObjectId;
            if (req.body.location === undefined || !stream.location) {
              stream.location = [venue.name, venue.city].filter(Boolean).join(', ');
            }
          }
        } else {
          stream.venueId = null;
        }
      }

      if (req.body.teamAId !== undefined) {
        if (req.body.teamAId && mongoose.Types.ObjectId.isValid(req.body.teamAId)) {
          const tA = await Team.findById(req.body.teamAId);
          if (tA) {
            stream.teamAId = tA._id as mongoose.Types.ObjectId;
            if (!req.body.teamAName) stream.teamAName = tA.name;
            if (!req.body.teamALogo && tA.logoUrl) stream.teamALogo = tA.logoUrl;
          }
        } else {
          stream.teamAId = null;
        }
      }

      if (req.body.teamBId !== undefined) {
        if (req.body.teamBId && mongoose.Types.ObjectId.isValid(req.body.teamBId)) {
          const tB = await Team.findById(req.body.teamBId);
          if (tB) {
            stream.teamBId = tB._id as mongoose.Types.ObjectId;
            if (!req.body.teamBName) stream.teamBName = tB.name;
            if (!req.body.teamBLogo && tB.logoUrl) stream.teamBLogo = tB.logoUrl;
          }
        } else {
          stream.teamBId = null;
        }
      }

      if (req.body.tournamentId !== undefined) {
        if (req.body.tournamentId && mongoose.Types.ObjectId.isValid(req.body.tournamentId)) {
          const tour = await Tournament.findById(req.body.tournamentId);
          if (tour) {
            stream.tournamentId = tour._id as mongoose.Types.ObjectId;
            if (!req.body.tournamentName) stream.tournamentName = tour.name;
          }
        } else {
          stream.tournamentId = null;
        }
      }

      let sportChangedTo: SportType | null = null;
      if (req.body.gameName !== undefined) {
        const normalized = normalizeSport(req.body.gameName);
        if (normalized !== stream.gameName) {
          stream.gameName = normalized;
          sportChangedTo = normalized || 'Other';
        }
      }

      let becameLive = false;
      if (req.body.status === 'LIVE' && stream.status === 'UPCOMING') {
        stream.status = 'LIVE';
        stream.startedAt = new Date();
        becameLive = true;
      }

      if (typeof req.body.scoreboardVisibleByDefault === 'boolean') {
        stream.scoreboardVisibleByDefault = req.body.scoreboardVisibleByDefault;
      }
      if (req.body.scoreboardPosition !== undefined) {
        stream.scoreboardPosition = normalizePosition(req.body.scoreboardPosition);
      }
      if (typeof req.body.chatEnabled === 'boolean') {
        stream.chatEnabled = req.body.chatEnabled;
      }
      if (typeof req.body.highlightsEnabled === 'boolean') {
        stream.highlightsEnabled = req.body.highlightsEnabled;
      }

      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      if (sportChangedTo) {
        const existingScore = await LiveScore.findOne({ liveStreamId: stream._id });
        if (existingScore && existingScore.sportType !== sportChangedTo) {
          existingScore.sportType = sportChangedTo;
          existingScore.sportSpecificDetails = getInitialSportDetails(sportChangedTo);
          existingScore.lastUpdatedAt = new Date();
          existingScore.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
          await existingScore.save();
        }
      }

      if (becameLive) {
        await LiveScore.findOneAndUpdate(
          { liveStreamId: stream._id },
          { matchStatus: 'Live', lastUpdatedAt: new Date() }
        );
      }

      const score = await LiveScore.findOne({ liveStreamId: stream._id }).lean();
      const payload = { ...stream.toObject(), id: stream._id.toString(), score };

      await recordActivity(
        req.user!,
        becameLive ? 'START_STREAM' : 'UPDATE_STREAM',
        'LiveStream',
        stream._id.toString(),
        stream.matchTitle || stream.youtubeVideoId,
        {
          previousValue,
          newValue: {
            status: stream.status,
            youtubeVideoId: stream.youtubeVideoId,
            matchTitle: stream.matchTitle,
            scoreboardPosition: stream.scoreboardPosition,
            scoreboardVisibleByDefault: stream.scoreboardVisibleByDefault,
            chatEnabled: stream.chatEnabled,
          },
        }
      );

      emitStreamEvent(stream._id.toString(), becameLive ? 'live:started' : 'live:updated', payload);

      if (becameLive) {
        await dispatchMatchNotifications({
          type: 'MATCH_LIVE',
          title: 'Match is Live Now',
          message:
            stream.matchTitle ||
            [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
            'Scheduled match has started!',
          entityType: 'LiveStream',
          entityId: stream._id.toString(),
          link: `/live/${stream._id.toString()}`,
          dedupeKey: `stream-live-${stream._id.toString()}`,
          teamIds: [stream.teamAId, stream.teamBId],
          includeAllSpectatorsIfNoFollowers: true,
        });
      }

      res.json({ stream: payload });
    } catch (err) {
      console.error('[LiveStream] Update error:', err);
      res.status(500).json({ message: 'Failed to update stream.' });
    }
  }
);

// PATCH /api/live/:id/end - End active stream (preserves scores, sets ENDED)
router.patch(
  '/:id/end',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'stream');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: You do not have permission to end this stream.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      if (stream.status === 'ENDED') {
        res.status(400).json({ message: 'This stream has already ended.' });
        return;
      }

      stream.status = 'ENDED';
      stream.endedAt = new Date();
      stream.endedBy = req.user!._id as mongoose.Types.ObjectId;
      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      const score = await LiveScore.findOneAndUpdate(
        { liveStreamId: stream._id },
        {
          matchStatus: 'Completed',
          lastUpdatedAt: new Date(),
          lastUpdatedBy: req.user!._id,
        },
        { returnDocument: 'after' }
      ).lean();

      await recordActivity(
        req.user!,
        'END_STREAM',
        'LiveStream',
        stream._id.toString(),
        `Ended MaidanLive stream (${stream.matchTitle || stream.youtubeVideoId})`,
        {
          previousValue: { status: 'LIVE' },
          newValue: { status: 'ENDED', endedAt: stream.endedAt },
        }
      );

      const payload = { ...stream.toObject(), id: stream._id.toString(), score };
      emitStreamEvent(stream._id.toString(), 'live:ended', payload);

      res.json({
        stream: payload,
        note: 'MaidanLive stream ended and moved to history. Stop your encoder/YouTube Studio separately if still broadcasting on YouTube.',
      });
    } catch (err) {
      console.error('[LiveStream] End error:', err);
      res.status(500).json({ message: 'Failed to end stream.' });
    }
  }
);

// PATCH /api/live/:id/replay - Add, verify, publish, or hide replay
router.patch(
  '/:id/replay',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const allowed = await canManageStream(req.user!, id, 'stream');
      if (!allowed) {
        res.status(403).json({
          message: 'Forbidden: Insufficient permissions to manage replays.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      const rawInput =
        typeof req.body.replayInput === 'string' && req.body.replayInput.trim()
          ? req.body.replayInput.trim()
          : stream.replayVideoId || stream.youtubeVideoId;

      const wantsPublish = req.body.replayPublished === true;
      const wantsHide = req.body.replayPublished === false;

      if (req.body.replayInput !== undefined || wantsPublish) {
        const verification = await verifyYouTubeVideoAvailability(rawInput);
        if (!verification.validId || !verification.videoId) {
          res.status(400).json({ message: verification.message });
          return;
        }

        stream.replayVideoId = verification.videoId;
        stream.replayInput = sanitizeText(rawInput, 300);
        stream.replayAvailable = verification.available && verification.embeddable;
        stream.replayVerifiedAt = new Date();

        if (wantsPublish && !stream.replayAvailable) {
          await stream.save();
          res.status(422).json({
            message: `Cannot publish replay: ${verification.message}`,
            verification,
            stream: { ...stream.toObject(), id: stream._id.toString() },
          });
          return;
        }
      }

      if (req.body.replayDescription !== undefined) {
        stream.replayDescription = sanitizeText(req.body.replayDescription, 500);
      }

      if (wantsPublish) {
        stream.replayPublished = true;
      } else if (wantsHide) {
        stream.replayPublished = false;
      }

      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      await recordActivity(
        req.user!,
        stream.replayPublished ? 'PUBLISH_REPLAY' : 'UPDATE_REPLAY',
        'LiveStream',
        stream._id.toString(),
        `Replay ${stream.replayVideoId} (${stream.replayPublished ? 'Published' : 'Hidden'})`
      );

      const score = await LiveScore.findOne({ liveStreamId: stream._id }).lean();
      const payload = { ...stream.toObject(), id: stream._id.toString(), score };
      emitStreamEvent(stream._id.toString(), 'live:updated', payload);

      res.json({ stream: payload });
    } catch (err) {
      console.error('[LiveStream] Replay error:', err);
      res.status(500).json({ message: 'Failed to update replay settings.' });
    }
  }
);

export default router;
