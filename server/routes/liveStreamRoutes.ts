import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { LiveStream } from '../models/LiveStream.ts';
import type {
  BroadcastPhase,
  ScoreboardPosition,
  SportType,
  StreamStatus,
  StreamingProvider,
  ViewerCountVisibility,
} from '../models/LiveStream.ts';
import { LiveScore } from '../models/LiveScore.ts';
import { Fixture } from '../models/Fixture.ts';
import { Team } from '../models/Team.ts';
import { Tournament } from '../models/Tournament.ts';
import { Venue } from '../models/Venue.ts';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import { ScoreHistory } from '../models/ScoreHistory.ts';
import { MatchHighlight } from '../models/MatchHighlight.ts';
import { ChatMessage } from '../models/ChatMessage.ts';
import { Poll } from '../models/Poll.ts';
import { ViewerMetric } from '../models/ViewerMetric.ts';
import { MatchReport } from '../models/MatchReport.ts';
import { PlayerMatchStat } from '../models/PlayerMatchStat.ts';
import { SponsorOverlay } from '../models/Sponsor.ts';
import { BroadcastCamera } from '../models/BroadcastCamera.ts';
import { BroadcastScene } from '../models/BroadcastScene.ts';
import { BroadcastAdDesign } from '../models/BroadcastAdDesign.ts';
import { BroadcastAdSchedule } from '../models/BroadcastAdSchedule.ts';
import { BroadcastGraphicsAsset } from '../models/BroadcastGraphicsAsset.ts';
import { BroadcastGraphicsState } from '../models/BroadcastGraphicsState.ts';
import { BroadcastAssignment } from '../models/BroadcastAssignment.ts';
import { ObsBridge } from '../models/ObsBridge.ts';
import { ADMIN_PORTAL_ROLES } from '../models/User.ts';
import {
  buildPublicStreamVisibilityQuery,
  isStreamVisibleToPublic,
} from '../utils/streamVisibility.ts';
import {
  emitFullStudioState,
  ensureObsProfileForMatch,
} from '../services/obsControllerService.ts';
import {
  clearLiveGraphics,
  getGraphicsStateForMatch,
  triggerBroadcastGraphicEvent,
} from '../services/broadcastGraphicsService.ts';
import { handleMatchSessionEndedForSchedules } from '../services/broadcastAdScheduleService.ts';
import {
  authenticate,
  canManageStream,
  hasBroadcastAccess,
  hasGranularPermission,
  optionalAuthenticate,
  requireAdminPortal,
  requirePermission,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { extractYouTubeVideoId } from '../../src/utils/youtube.ts';
import { verifyYouTubeVideoAvailability } from '../utils/youtubeVerify.ts';
import { verifyYouTubeStream } from '../services/youtubeService.ts';
import {
  buildMediaMTXConfig,
  getMediaMTXEnvConfig,
  stripPrivateMediaMTXFields,
  verifyMediaMTXStreamHealth,
} from '../services/mediamtxService.ts';
import { getInitialSportDetails } from '../../src/utils/scoringEngine.ts';
import {
  applyVolleyballAction,
  validateVolleyballRules,
} from '../../src/utils/volleyballScoring.ts';
import type { VolleyballRules } from '../../src/utils/volleyballScoring.ts';
import { normalizeOverlayConfig } from '../../src/utils/overlayConfig.ts';
import {
  BROADCAST_EVENT_KEYS,
  BroadcastEventKey,
  normalizeEventAnimationsConfig,
} from '../../src/utils/eventAnimations.ts';
import { emitBroadcastEventAnimation } from '../utils/eventAnimationDispatcher.ts';
import { sanitizeImageUrl, sanitizeText } from '../utils/sanitize.ts';
import {
  emitBroadcastStudioEvent,
  emitRoomOnlyEvent,
  emitStreamEvent,
  getActiveRoomViewerCount,
  invalidateViewerVisibilityCache,
} from '../socket/index.ts';
import { recordActivity } from '../utils/audit.ts';
import { dispatchMatchNotifications } from '../utils/notifications.ts';

const router = Router();

const VALID_SPORTS: SportType[] = ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'];
const VALID_POSITIONS: ScoreboardPosition[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
const VALID_PROVIDERS: StreamingProvider[] = ['youtube', 'mediamtx'];
const VALID_VISIBILITY: ViewerCountVisibility[] = ['public', 'admin_only', 'hidden'];

// Per-match concurrency lock for mid-match provider switching
const activeProviderSwitches = new Set<string>();

function normalizeSport(val: unknown): SportType | '' {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim() as SportType;
  return VALID_SPORTS.includes(trimmed) ? trimmed : '';
}

function normalizePosition(val: unknown): ScoreboardPosition {
  if (typeof val === 'string' && VALID_POSITIONS.includes(val.trim() as ScoreboardPosition)) {
    return val.trim() as ScoreboardPosition;
  }
  return 'BOTTOM';
}

function normalizeProvider(val: unknown): StreamingProvider {
  return val === 'mediamtx' ? 'mediamtx' : 'youtube';
}

function normalizeVisibility(val: unknown): ViewerCountVisibility {
  if (typeof val === 'string' && VALID_VISIBILITY.includes(val.trim() as ViewerCountVisibility)) {
    return val.trim() as ViewerCountVisibility;
  }
  return 'public';
}

function formatPublicStream(streamObj: any, extra: Record<string, any> = {}, isAdminViewer = false) {
  const clean = stripPrivateMediaMTXFields(streamObj);
  const id = (clean._id || clean.id)?.toString();
  const vis: ViewerCountVisibility = clean.viewerCountVisibility || 'public';
  const rawActive = getActiveRoomViewerCount(id);
  const activeViewers =
    vis === 'public' || (vis === 'admin_only' && isAdminViewer) ? rawActive : null;
  const broadcastPublished = clean.broadcastPublished !== false;
  const wasPublished = clean.wasPublished !== false;
  const broadcastPhase: BroadcastPhase =
    clean.broadcastPhase ||
    (clean.status === 'ENDED'
      ? 'BROADCAST_ENDED'
      : clean.status === 'LIVE' && broadcastPublished
        ? 'BROADCAST_ACTIVE'
        : 'MATCH_PREPARED');

  return {
    ...clean,
    id,
    streamingProvider: clean.streamingProvider || 'youtube',
    activeStreamingProvider: clean.activeStreamingProvider || clean.streamingProvider || 'youtube',
    viewerCountVisibility: vis,
    activeViewers,
    broadcastPublished,
    wasPublished,
    broadcastPhase,
    preparedAt: clean.preparedAt || clean.createdAt || null,
    activatedAt: clean.activatedAt || clean.startedAt || null,
    showScoreboardOnYoutube: clean.showScoreboardOnYoutube !== false,
    overlayConfig: normalizeOverlayConfig(clean.overlayConfig),
    ...extra,
  };
}

function redactPlaybackForUnauthenticated(streamObj: any) {
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

async function attachScoresToStreams(
  streams: any[],
  isAdminViewer = false,
  isAuthenticated = false
) {
  if (streams.length === 0) return [];
  const ids = streams.map((s) => s._id);
  const scores = await LiveScore.find({ liveStreamId: { $in: ids } }).lean();
  const scoreMap = new Map(scores.map((sc) => [sc.liveStreamId.toString(), sc]));
  return streams.map((s) => {
    const formatted = formatPublicStream(
      s,
      { score: scoreMap.get(s._id.toString()) || null },
      isAdminViewer
    );
    return isAuthenticated ? formatted : redactPlaybackForUnauthenticated(formatted);
  });
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

async function createMatchOrStreamSession(
  req: AuthenticatedRequest,
  res: Response,
  options: { initializeOnly: boolean }
) {
  try {
    const initializeOnly = options.initializeOnly || req.body.initializeOnly === true;
    const streamingProvider = normalizeProvider(
      req.body.streamingProvider ?? req.body.activeStreamingProvider
    );

    const rawYoutube =
      typeof req.body.youtubeInput === 'string'
        ? req.body.youtubeInput
        : typeof req.body.youtubeVideoId === 'string'
          ? req.body.youtubeVideoId
          : '';

    let parsedYtId = '';
    if (rawYoutube.trim()) {
      const parsedYt = extractYouTubeVideoId(rawYoutube);
      if (!parsedYt.valid || !parsedYt.videoId) {
        res.status(400).json({
          message: parsedYt.error || 'Invalid YouTube Video ID or URL.',
        });
        return;
      }
      parsedYtId = parsedYt.videoId;
    } else if (!initializeOnly && streamingProvider === 'youtube') {
      res.status(400).json({
        message: 'A valid YouTube Video ID or URL is required when YouTube is the active provider.',
      });
      return;
    }

    const requestedStatus: StreamStatus = initializeOnly
      ? 'UPCOMING'
      : req.body.status === 'UPCOMING'
        ? 'UPCOMING'
        : 'LIVE';

    if (requestedStatus === 'LIVE' && parsedYtId && streamingProvider === 'youtube') {
      const duplicate = await LiveStream.findOne({
        youtubeVideoId: parsedYtId,
        status: 'LIVE',
        activeStreamingProvider: 'youtube',
      });
      if (duplicate) {
        res.status(409).json({
          message: `An active LIVE stream already exists for YouTube Video ID "${parsedYtId}".`,
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
    const parsedOversLimit =
      req.body.oversLimit !== undefined && req.body.oversLimit !== ''
        ? Math.max(1, Math.min(90, Math.floor(Number(req.body.oversLimit) || 20)))
        : undefined;
    const parsedPlayersPerSide =
      req.body.playersPerSide !== undefined && req.body.playersPerSide !== ''
        ? Math.max(2, Math.min(15, Math.floor(Number(req.body.playersPerSide) || 11)))
        : undefined;

    let parsedVolleyballRules: Partial<VolleyballRules> | undefined = undefined;
    if (scoreSport === 'Volleyball') {
      const rawVbInput = {
        ...(req.body.volleyballRules && typeof req.body.volleyballRules === 'object'
          ? req.body.volleyballRules
          : {}),
        ...(req.body.bestOfSets !== undefined && req.body.bestOfSets !== ''
          ? { bestOfSets: Number(req.body.bestOfSets) }
          : {}),
      };
      if (Object.keys(rawVbInput).length > 0) {
        const vbValidated = validateVolleyballRules(rawVbInput);
        if (!vbValidated.valid) {
          res.status(400).json({ message: vbValidated.error || 'Invalid Volleyball match rules.' });
          return;
        }
        parsedVolleyballRules = vbValidated.rules;
      }
    }

    const matchDate = req.body.matchDate ? new Date(req.body.matchDate) : null;
    const validMatchDate = matchDate && !isNaN(matchDate.getTime()) ? matchDate : null;

    const tempObjectId = new mongoose.Types.ObjectId();
    const customPath = sanitizeText(req.body.mediamtxStreamPath, 140);
    const mtxCfg = buildMediaMTXConfig(tempObjectId.toString(), customPath);
    const mediamtxPlaybackUrl =
      sanitizeText(req.body.mediamtxPlaybackUrl, 500) || mtxCfg.hlsPlaybackUrl;
    const mediamtxWebrtcUrl =
      sanitizeText(req.body.mediamtxWebrtcUrl, 500) || mtxCfg.webrtcPlaybackUrl;

    const now = new Date();
    const isPublished = initializeOnly ? false : requestedStatus === 'LIVE' ? true : req.body.broadcastPublished !== false;
    const broadcastPhase: BroadcastPhase = initializeOnly
      ? 'MATCH_PREPARED'
      : requestedStatus === 'LIVE'
        ? 'BROADCAST_ACTIVE'
        : 'MATCH_PREPARED';

    const resolvedFixtureId =
      req.body.fixtureId && mongoose.Types.ObjectId.isValid(req.body.fixtureId)
        ? req.body.fixtureId
        : null;

    const stream = await LiveStream.create({
      _id: tempObjectId,
      streamingProvider,
      activeStreamingProvider: streamingProvider,
      youtubeVideoId: parsedYtId,
      youtubeInput: sanitizeText(rawYoutube, 300),
      youtubeStreamStatus: parsedYtId ? 'READY' : 'UNKNOWN',
      mediamtxStreamPath: mtxCfg.streamPath,
      mediamtxPublishStatus: 'IDLE',
      mediamtxPlaybackUrl,
      mediamtxWebrtcUrl,
      mediamtxStreamKey: mtxCfg.streamKey,
      viewerCountVisibility: normalizeVisibility(req.body.viewerCountVisibility),
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
      fixtureId: resolvedFixtureId,
      roundName: sanitizeText(req.body.roundName, 100),
      matchDate: validMatchDate,
      matchDescription: sanitizeText(req.body.matchDescription, 1000),
      status: requestedStatus,
      broadcastPublished: isPublished,
      wasPublished: isPublished,
      broadcastPhase,
      preparedAt: now,
      activatedAt: isPublished && requestedStatus === 'LIVE' ? now : null,
      startedAt: requestedStatus === 'LIVE' ? now : null,
      authorizedScorerId:
        req.body.authorizedScorerId && mongoose.Types.ObjectId.isValid(req.body.authorizedScorerId)
          ? req.body.authorizedScorerId
          : null,
      backupScorerId:
        req.body.backupScorerId && mongoose.Types.ObjectId.isValid(req.body.backupScorerId)
          ? req.body.backupScorerId
          : null,
      scoreboardVisibleByDefault:
        req.body.scoreboardVisibleByDefault === false ? false : true,
      showScoreboardOnYoutube:
        req.body.showScoreboardOnYoutube === false ? false : true,
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
      sportSpecificDetails: getInitialSportDetails(scoreSport, {
        oversLimit: parsedOversLimit,
        playersPerSide: parsedPlayersPerSide,
        volleyballRules: parsedVolleyballRules,
      }),
      matchStatus: initializeOnly ? 'Prepared' : requestedStatus === 'UPCOMING' ? 'Upcoming' : 'Live',
      resultStatus: 'NOT_DECLARED',
      lastUpdatedBy: req.user!._id,
      lastUpdatedAt: now,
    });

    // Provision OBS Control Room profile immediately so Control Room, Scorer Console, and Overlay URL work before YouTube is linked
    await ensureObsProfileForMatch(stream._id.toString(), req.user!._id as any).catch(() => {});

    if (resolvedFixtureId) {
      await Fixture.findByIdAndUpdate(resolvedFixtureId, {
        liveStreamId: stream._id,
        ...(requestedStatus === 'LIVE' && isPublished ? { status: 'LIVE' } : {}),
      }).catch(() => {});
    }

    await recordActivity(
      req.user!,
      initializeOnly
        ? 'INITIALIZE_MATCH'
        : requestedStatus === 'LIVE'
          ? 'START_STREAM'
          : 'SCHEDULE_STREAM',
      'LiveStream',
      stream._id.toString(),
      `${stream.matchTitle || [teamAName, teamBName].filter(Boolean).join(' vs ') || parsedYtId || mtxCfg.streamPath} (${scoreSport} · ${initializeOnly ? 'Prepared/Unpublished' : streamingProvider})`,
      {
        newValue: {
          status: requestedStatus,
          broadcastPublished: isPublished,
          broadcastPhase,
          streamingProvider,
          youtubeVideoId: parsedYtId,
          mediamtxStreamPath: mtxCfg.streamPath,
          gameName: scoreSport,
          scoreboardPosition: stream.scoreboardPosition,
          showScoreboardOnYoutube: stream.showScoreboardOnYoutube,
        },
      }
    );

    const publicPayload = formatPublicStream(
      stream.toObject(),
      { score: initialScore.toObject() },
      true
    );

    if (!initializeOnly && isPublished) {
      if (requestedStatus === 'LIVE') {
        emitStreamEvent(stream._id.toString(), 'live:started', publicPayload);
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
        emitStreamEvent(stream._id.toString(), 'live:updated', publicPayload);
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
    }

    // Include RTMP publish credentials in creation response ONLY for admin creator
    const { rtmpBase } = getMediaMTXEnvConfig();
    res.status(201).json({
      stream: publicPayload,
      adminStreamConfig: {
        mediamtxStreamPath: mtxCfg.streamPath,
        mediamtxStreamKey: mtxCfg.streamKey,
        mediamtxRtmpPublishUrl: `${rtmpBase}/${mtxCfg.streamPath}?key=${mtxCfg.streamKey}`,
        mediamtxPlaybackUrl,
        mediamtxWebrtcUrl,
      },
    });
  } catch (err) {
    console.error('[LiveStream] Create/Initialize error:', err);
    res.status(500).json({ message: 'Failed to initialize match stream.' });
  }
}

// POST /api/live/initialize - Step 2: Initialize Match + Scoreboard without requiring YouTube URL (unpublished draft)
router.post(
  '/initialize',
  authenticate,
  requireAdminPortal,
  requirePermission('manageStreams'),
  async (req: AuthenticatedRequest, res: Response) => {
    await createMatchOrStreamSession(req, res, { initializeOnly: true });
  }
);

// POST /api/live - Start or schedule a LiveStream (supports initializeOnly or legacy direct creation)
router.post(
  '/',
  authenticate,
  requireAdminPortal,
  requirePermission('manageStreams'),
  async (req: AuthenticatedRequest, res: Response) => {
    await createMatchOrStreamSession(req, res, {
      initializeOnly: req.body.initializeOnly === true,
    });
  }
);

// GET /api/live - List streams (hides unpublished prepared drafts from public/Player Portal)
router.get('/', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAdminViewer = Boolean(
      req.user && req.authPortal === 'admin' && ADMIN_PORTAL_ROLES.includes(req.user.role)
    );
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

    if (!isAdminViewer) {
      const visFilter = buildPublicStreamVisibilityQuery();
      if (query.$or) {
        query.$and = [{ $or: query.$or }, visFilter];
        delete query.$or;
      } else {
        query.$or = visFilter.$or;
      }
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));
    const skip = (page - 1) * limit;

    const [rawStreams, total] = await Promise.all([
      LiveStream.find(query)
        .sort({ status: 1, startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LiveStream.countDocuments(query),
    ]);

    const streams = isAdminViewer ? rawStreams : rawStreams.filter(isStreamVisibleToPublic);
    const enriched = await attachScoresToStreams(streams, isAdminViewer, Boolean(req.user));
    res.json({ streams: enriched, total, page, limit });
  } catch (err) {
    console.error('[LiveStream] List error:', err);
    res.status(500).json({ message: 'Failed to load streams.' });
  }
});

// GET /api/live/active - Active LIVE published streams
router.get('/active', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawStreams = await LiveStream.find({
      status: 'LIVE',
      broadcastPublished: { $ne: false },
    })
      .sort({ startedAt: -1, createdAt: -1 })
      .lean();
    const isAdminViewer = Boolean(
      req.user && req.authPortal === 'admin' && ADMIN_PORTAL_ROLES.includes(req.user.role)
    );
    const streams = rawStreams.filter(isStreamVisibleToPublic);
    const enriched = await attachScoresToStreams(streams, isAdminViewer, Boolean(req.user));
    res.json({ streams: enriched });
  } catch (err) {
    console.error('[LiveStream] Active error:', err);
    res.status(500).json({ message: 'Failed to load active streams.' });
  }
});

// GET /api/live/history - Ended published streams
router.get('/history', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isAdminViewer = Boolean(
      req.user && req.authPortal === 'admin' && ADMIN_PORTAL_ROLES.includes(req.user.role)
    );
    const query: Record<string, unknown> = { status: 'ENDED' };
    if (!isAdminViewer) {
      query.wasPublished = { $ne: false };
    }
    const rawStreams = await LiveStream.find(query)
      .sort({ endedAt: -1, updatedAt: -1 })
      .limit(100)
      .lean();
    const streams = isAdminViewer ? rawStreams : rawStreams.filter(isStreamVisibleToPublic);
    const enriched = await attachScoresToStreams(streams, isAdminViewer, Boolean(req.user));
    res.json({ streams: enriched });
  } catch (err) {
    console.error('[LiveStream] History error:', err);
    res.status(500).json({ message: 'Failed to load stream history.' });
  }
});

// GET /api/live/replays - Published available replays for authenticated Players / Admins
router.get('/replays', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeAll = req.query.all === 'true';
    const isAdminViewer = Boolean(
      req.user && req.authPortal === 'admin' && ADMIN_PORTAL_ROLES.includes(req.user.role)
    );
    const query: Record<string, unknown> =
      includeAll && isAdminViewer
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
    const enriched = await attachScoresToStreams(streams, isAdminViewer, true);
    res.json({ replays: enriched });
  } catch (err) {
    console.error('[LiveStream] Replays error:', err);
    res.status(500).json({ message: 'Failed to load replays.' });
  }
});

// GET /api/live/:id - Get single stream + score + venue (blocks unpublished drafts from public portal; redacts playback URLs if unauthenticated)
router.get('/:id', optionalAuthenticate, async (req: AuthenticatedRequest, res: Response) => {
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

    const isAdminViewer = Boolean(
      req.user && req.authPortal === 'admin' && ADMIN_PORTAL_ROLES.includes(req.user.role)
    );
    if (!isAdminViewer && !isStreamVisibleToPublic(stream)) {
      res.status(404).json({ message: 'Broadcast has not been published yet.' });
      return;
    }

    const [score, venue] = await Promise.all([
      LiveScore.findOne({ liveStreamId: stream._id }).lean(),
      stream.venueId ? Venue.findById(stream.venueId).lean() : Promise.resolve(null),
    ]);
    const formatted = formatPublicStream(
      stream,
      {
        score: score || null,
        venue: venue ? { ...venue, id: venue._id.toString() } : null,
      },
      isAdminViewer
    );

    res.json({
      stream: req.user ? formatted : redactPlaybackForUnauthenticated(formatted),
    });
  } catch (err) {
    console.error('[LiveStream] Get error:', err);
    res.status(500).json({ message: 'Failed to load live stream details.' });
  }
});

// GET /api/live/:id/overlay - Public broadcast-safe OBS overlay payload (stream metadata + score + overlayConfig)
router.get('/:id/overlay', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid match ID.' });
      return;
    }

    const stream = await LiveStream.findById(id).lean();
    if (!stream) {
      res.status(404).json({ message: 'Match broadcast not found.' });
      return;
    }

    const [score, venue, graphicsState, obsProfile] = await Promise.all([
      LiveScore.findOne({ liveStreamId: stream._id }).lean(),
      stream.venueId ? Venue.findById(stream.venueId).lean() : Promise.resolve(null),
      getGraphicsStateForMatch(id),
      ObsControllerProfile.findOne({ matchId: stream._id })
        .select(
          'activeLayoutType activeCameraId activeCameraIds activePipPosition activePipSize activeObsScene connectionStatus'
        )
        .lean(),
    ]);

    const overlayConfig = normalizeOverlayConfig((stream as any).overlayConfig);
    const safeStream = formatPublicStream(
      stream,
      {
        venue: venue ? { id: venue._id.toString(), name: venue.name, city: venue.city, state: venue.state } : null,
      },
      false
    );
    // Strip internal admin/audit/switch metadata from public OBS viewer payload
    delete (safeStream as any).providerSwitchHistory;
    delete (safeStream as any).createdBy;
    delete (safeStream as any).updatedBy;
    delete (safeStream as any).endedBy;
    delete (safeStream as any).authorizedScorerId;
    delete (safeStream as any).backupScorerId;
    delete (safeStream as any).lastProviderSwitchBy;
    delete (safeStream as any).lastProviderSwitchByName;
    delete (safeStream as any).streamHealth;
    // Strip playback URLs/IDs from unauthenticated OBS overlay metadata endpoint
    delete (safeStream as any).youtubeVideoId;
    delete (safeStream as any).replayVideoId;
    delete (safeStream as any).replayInput;
    delete (safeStream as any).mediamtxPlaybackUrl;
    delete (safeStream as any).mediamtxWebrtcUrl;
    delete (safeStream as any).mediamtxPlaybackHlsUrl;
    delete (safeStream as any).mediamtxPlaybackWebrtcUrl;
    delete (safeStream as any).mediamtxHlsUrl;

    const obsLayout = obsProfile
      ? {
          activeLayoutType: (obsProfile as any).activeLayoutType || 'SINGLE',
          activeCameraId: (obsProfile as any).activeCameraId || '',
          activeCameraIds: Array.isArray((obsProfile as any).activeCameraIds)
            ? (obsProfile as any).activeCameraIds
            : [],
          activePipPosition: (obsProfile as any).activePipPosition || 'bottom-right',
          activePipSize: (obsProfile as any).activePipSize || 'medium',
          activeObsScene: (obsProfile as any).activeObsScene || '',
        }
      : null;

    const brandLogoUrl =
      (process.env.VITE_BRAND_LOGO_URL || process.env.BRAND_LOGO_URL || '').trim();

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({
      stream: safeStream,
      score: score || null,
      overlayConfig,
      graphicsState,
      obsLayout,
      brandLogoUrl,
      serverNowIso: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[LiveStream] Get overlay error:', err);
    res.status(500).json({ message: 'Failed to load broadcast overlay data.' });
  }
});

// PATCH /api/live/:id/overlay - Update & broadcast real-time OBS overlay configuration
router.patch(
  '/:id/overlay',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid match ID.' });
        return;
      }

      const [canStream, canScore, canOverlayAccess, canScoreGranular] = await Promise.all([
        canManageStream(req.user!, id, 'stream'),
        canManageStream(req.user!, id, 'score'),
        hasBroadcastAccess(req.user!, id, 'broadcast:manage_overlays'),
        hasGranularPermission(req.user!, 'matches:score', { scopeType: 'match', scopeId: id }),
      ]);
      if (!canStream && !canScore && !canOverlayAccess && !canScoreGranular) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to configure broadcast overlays for this match.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Match broadcast not found.' });
        return;
      }

      const incoming =
        req.body.overlayConfig && typeof req.body.overlayConfig === 'object'
          ? req.body.overlayConfig
          : req.body;

      const currentConfig = normalizeOverlayConfig((stream as any).overlayConfig);
      const mergedEventAnimations =
        incoming.eventAnimations && typeof incoming.eventAnimations === 'object'
          ? normalizeEventAnimationsConfig(
              BROADCAST_EVENT_KEYS.reduce<Record<string, unknown>>((acc, key) => {
                const curRule = currentConfig.eventAnimations[key];
                const incRule = (incoming.eventAnimations as Record<string, unknown>)[key];
                acc[key] =
                  incRule && typeof incRule === 'object'
                    ? { ...curRule, ...(incRule as Record<string, unknown>) }
                    : curRule;
                return acc;
              }, {})
            )
          : currentConfig.eventAnimations;

      const mergedRaw: Record<string, unknown> = {
        ...currentConfig,
        ...incoming,
        customScoreboardDesign:
          incoming.customScoreboardDesign && typeof incoming.customScoreboardDesign === 'object'
            ? {
                ...currentConfig.customScoreboardDesign,
                ...incoming.customScoreboardDesign,
              }
            : currentConfig.customScoreboardDesign,
        eventAnimations: mergedEventAnimations,
      };

      // Keep visible & mode coherent
      if (typeof incoming.mode === 'string') {
        if (incoming.mode === 'hidden') {
          mergedRaw.visible = false;
        } else if (
          ['full', 'compact', 'score_only'].includes(incoming.mode) &&
          incoming.visible === undefined
        ) {
          mergedRaw.visible = true;
        }
      }
      if (typeof incoming.visible === 'boolean') {
        if (incoming.visible && mergedRaw.mode === 'hidden') {
          mergedRaw.mode = 'full';
        }
      }

      const nextConfig = normalizeOverlayConfig(mergedRaw);
      (stream as any).overlayConfig = { ...nextConfig };
      if (typeof (stream as any).markModified === 'function') {
        (stream as any).markModified('overlayConfig');
      }
      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      await recordActivity(
        req.user!,
        'UPDATE_OVERLAY_CONFIG',
        'LiveStream',
        stream._id.toString(),
        `Updated OBS broadcast overlay (${nextConfig.visible ? nextConfig.mode : 'hidden'} · ${nextConfig.position} · ${nextConfig.theme})`,
        {
          previousValue: { ...currentConfig } as Record<string, unknown>,
          newValue: { ...nextConfig } as Record<string, unknown>,
        }
      );

      const serverNowIso = new Date().toISOString();
      emitStreamEvent(id, 'overlay:config_updated', {
        streamId: id,
        overlayConfig: nextConfig,
        serverNowIso,
      });
      emitBroadcastStudioEvent(id, 'overlay:config_updated', {
        streamId: id,
        overlayConfig: nextConfig,
        serverNowIso,
      });

      res.json({
        streamId: id,
        overlayConfig: nextConfig,
        serverNowIso,
      });
    } catch (err) {
      console.error('[LiveStream] Update overlay error:', err);
      res.status(500).json({ message: 'Failed to update broadcast overlay configuration.' });
    }
  }
);

// POST /api/live/:id/overlay/trigger-event-animation - Admin manual live trigger for JioHotstar/PKL event animations
router.post(
  '/:id/overlay/trigger-event-animation',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid stream ID.' });
        return;
      }

      const [canStream, canScore, canOverlayAccess, canScoreGranular] = await Promise.all([
        canManageStream(req.user!, id, 'stream'),
        canManageStream(req.user!, id, 'score'),
        hasBroadcastAccess(req.user!, id, 'broadcast:manage_overlays'),
        hasGranularPermission(req.user!, 'matches:score', { scopeType: 'match', scopeId: id }),
      ]);
      if (!canStream && !canScore && !canOverlayAccess && !canScoreGranular) {
        res.status(403).json({
          message: 'Forbidden: You are not authorized to trigger broadcast event animations for this match.',
        });
        return;
      }

      const eventKeyRaw = String(req.body?.eventKey || '').toUpperCase();
      if (!BROADCAST_EVENT_KEYS.includes(eventKeyRaw as BroadcastEventKey)) {
        res.status(400).json({ message: 'Invalid broadcast eventKey.' });
        return;
      }

      const stream = await LiveStream.findById(id)
        .select('teamAName teamBName gameName overlayConfig')
        .lean();
      if (!stream) {
        res.status(404).json({ message: 'Match broadcast not found.' });
        return;
      }

      const teamSide =
        req.body?.teamSide === 'A' || req.body?.teamSide === 'B' ? req.body.teamSide : '';

      const payload = await emitBroadcastEventAnimation({
        streamId: id,
        eventKey: eventKeyRaw as BroadcastEventKey,
        stream,
        teamSide,
        teamName: sanitizeText(req.body?.teamName, 80),
        teamColor: sanitizeText(req.body?.teamColor, 30),
        playerName: sanitizeText(req.body?.playerName, 80),
        subtitle: sanitizeText(req.body?.subtitle, 140),
        pointsLabel: sanitizeText(req.body?.pointsLabel, 40),
        previewStyleId: sanitizeText(req.body?.styleId, 80) || undefined,
        manualOverride: true,
      });

      res.json({ ok: true, eventId: payload?.eventId || '', payload });
    } catch (err) {
      console.error('[LiveStream] Trigger event animation error:', err);
      res.status(500).json({ message: 'Failed to trigger broadcast event animation.' });
    }
  }
);

// GET /api/live/:id/stream-config - Admin-only private MediaMTX & YouTube stream configuration
router.get(
  '/:id/stream-config',
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
          message: 'Forbidden: Only authorized broadcast admins may access private stream keys.',
        });
        return;
      }

      const stream = await LiveStream.findById(id).select('+mediamtxStreamKey');
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      if (!stream.mediamtxStreamPath || !stream.mediamtxStreamKey) {
        const cfg = buildMediaMTXConfig(
          stream._id.toString(),
          stream.mediamtxStreamPath,
          stream.mediamtxStreamKey
        );
        stream.mediamtxStreamPath = cfg.streamPath;
        stream.mediamtxStreamKey = cfg.streamKey;
        if (!stream.mediamtxPlaybackUrl) stream.mediamtxPlaybackUrl = cfg.hlsPlaybackUrl;
        if (!stream.mediamtxWebrtcUrl) stream.mediamtxWebrtcUrl = cfg.webrtcPlaybackUrl;
        await stream.save();
      }

      const { rtmpBase } = getMediaMTXEnvConfig();
      res.json({
        streamId: stream._id.toString(),
        streamingProvider: stream.streamingProvider,
        activeStreamingProvider: stream.activeStreamingProvider,
        youtubeVideoId: stream.youtubeVideoId,
        youtubeStreamStatus: stream.youtubeStreamStatus,
        mediamtxStreamPath: stream.mediamtxStreamPath,
        mediamtxStreamKey: stream.mediamtxStreamKey,
        mediamtxRtmpPublishUrl: `${rtmpBase}/${stream.mediamtxStreamPath}?key=${stream.mediamtxStreamKey}`,
        mediamtxRtmpServerUrl: `${rtmpBase}/${stream.mediamtxStreamPath}`,
        mediamtxPlaybackUrl: stream.mediamtxPlaybackUrl,
        mediamtxWebrtcUrl: stream.mediamtxWebrtcUrl,
        mediamtxPublishStatus: stream.mediamtxPublishStatus,
        streamHealth: stream.streamHealth,
        providerSwitchHistory: stream.providerSwitchHistory || [],
        viewerCountVisibility: stream.viewerCountVisibility || 'public',
      });
    } catch (err) {
      console.error('[LiveStream] Stream config error:', err);
      res.status(500).json({ message: 'Failed to load stream configuration.' });
    }
  }
);

// POST /api/live/:id/verify-health - Check health of YouTube or MediaMTX feed before going live or switching
router.post(
  '/:id/verify-health',
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
        res.status(403).json({ message: 'Forbidden: Not authorized to verify stream health.' });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      const targetProvider: StreamingProvider = VALID_PROVIDERS.includes(req.body.provider)
        ? req.body.provider
        : stream.activeStreamingProvider || 'youtube';

      const startedAtMs = Date.now();
      if (targetProvider === 'mediamtx') {
        const mtxRes = await verifyMediaMTXStreamHealth({
          streamPath: stream.mediamtxStreamPath,
          hlsPlaybackUrl: stream.mediamtxPlaybackUrl,
          webrtcPlaybackUrl: stream.mediamtxWebrtcUrl,
        });
        stream.mediamtxPublishStatus = mtxRes.publishStatus;
        stream.streamHealth = {
          ok: mtxRes.ok,
          status: mtxRes.publishStatus,
          checkedAt: new Date(),
          latencyMs: mtxRes.latencyMs,
          detail: mtxRes.message,
        };
        await stream.save();

        const healthPayload = {
          streamId: stream._id.toString(),
          provider: 'mediamtx' as const,
          mediamtxPublishStatus: stream.mediamtxPublishStatus,
          streamHealth: stream.streamHealth,
          latencyMs: stream.streamHealth.latencyMs,
          checkedAt: stream.streamHealth.checkedAt,
        };
        emitStreamEvent(stream._id.toString(), 'mediamtx:status_changed', healthPayload);
        emitStreamEvent(stream._id.toString(), 'stream:health_updated', healthPayload);

        res.json({
          provider: 'mediamtx',
          ...mtxRes,
          streamHealth: stream.streamHealth,
        });
        return;
      }

      // YouTube verification
      const ytInput = stream.youtubeVideoId || stream.youtubeInput;
      if (!ytInput) {
        res.json({
          provider: 'youtube',
          ok: false,
          playable: false,
          latencyMs: Date.now() - startedAtMs,
          checkedAt: new Date().toISOString(),
          message: 'No YouTube Video ID configured for this stream.',
        });
        return;
      }

      const ytRes = await verifyYouTubeStream(ytInput);
      const isOk = ytRes.available && ytRes.embeddable;
      stream.youtubeStreamStatus = isOk
        ? ytRes.liveBroadcastStatus === 'LIVE'
          ? 'LIVE'
          : 'READY'
        : 'UNAVAILABLE';
      stream.streamHealth = {
        ok: isOk,
        status: stream.youtubeStreamStatus,
        checkedAt: new Date(),
        latencyMs: Date.now() - startedAtMs,
        detail: ytRes.message,
      };
      await stream.save();

      emitStreamEvent(stream._id.toString(), 'stream:health_updated', {
        streamId: stream._id.toString(),
        provider: 'youtube',
        youtubeStreamStatus: stream.youtubeStreamStatus,
        streamHealth: stream.streamHealth,
        latencyMs: stream.streamHealth.latencyMs,
        checkedAt: stream.streamHealth.checkedAt,
      });

      res.json({
        provider: 'youtube',
        ok: isOk,
        playable: isOk,
        liveBroadcastStatus: ytRes.liveBroadcastStatus,
        available: ytRes.available,
        embeddable: ytRes.embeddable,
        title: ytRes.title,
        latencyMs: stream.streamHealth.latencyMs,
        checkedAt: stream.streamHealth.checkedAt,
        message: ytRes.message,
        streamHealth: stream.streamHealth,
      });
    } catch (err) {
      console.error('[LiveStream] Verify health error:', err);
      res.status(500).json({ message: 'Failed to verify stream health.' });
    }
  }
);

// POST /api/live/:id/switch-provider - Mid-match live streaming provider switching with strict validation & lock
router.post(
  '/:id/switch-provider',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid stream ID.' });
      return;
    }

    const allowed = await canManageStream(req.user!, id, 'stream');
    if (!allowed) {
      res.status(403).json({
        message: 'Forbidden: matches:manage_stream permission is required to switch streaming provider.',
      });
      return;
    }

    const toProvider = req.body.toProvider as StreamingProvider;
    if (!VALID_PROVIDERS.includes(toProvider)) {
      res.status(400).json({ message: 'toProvider must be either "youtube" or "mediamtx".' });
      return;
    }

    if (activeProviderSwitches.has(id)) {
      res.status(409).json({
        message: 'A provider switch is already in progress for this match. Please wait.',
      });
      return;
    }

    activeProviderSwitches.add(id);
    try {
      const stream = await LiveStream.findById(id).select('+mediamtxStreamKey');
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }

      const fromProvider: StreamingProvider = stream.activeStreamingProvider || 'youtube';
      const reason = sanitizeText(req.body.reason, 240) || 'Admin live broadcast failover switch';

      // Apply optional target URL / video ID supplied during switch modal
      if (toProvider === 'youtube' && (req.body.youtubeInput || req.body.youtubeVideoId)) {
        const rawYt = String(req.body.youtubeInput || req.body.youtubeVideoId || '');
        const parsed = extractYouTubeVideoId(rawYt);
        if (!parsed.valid || !parsed.videoId) {
          res.status(400).json({ message: parsed.error || 'Invalid target YouTube Video ID or URL.' });
          return;
        }
        stream.youtubeVideoId = parsed.videoId;
        stream.youtubeInput = sanitizeText(rawYt, 300);
      }

      if (toProvider === 'mediamtx') {
        if (req.body.mediamtxStreamPath) {
          stream.mediamtxStreamPath = sanitizeText(req.body.mediamtxStreamPath, 140);
        }
        if (!stream.mediamtxStreamPath || !stream.mediamtxStreamKey) {
          const cfg = buildMediaMTXConfig(
            stream._id.toString(),
            stream.mediamtxStreamPath,
            stream.mediamtxStreamKey
          );
          stream.mediamtxStreamPath = cfg.streamPath;
          stream.mediamtxStreamKey = cfg.streamKey;
          if (!stream.mediamtxPlaybackUrl) stream.mediamtxPlaybackUrl = cfg.hlsPlaybackUrl;
          if (!stream.mediamtxWebrtcUrl) stream.mediamtxWebrtcUrl = cfg.webrtcPlaybackUrl;
        }
        if (req.body.mediamtxPlaybackUrl) {
          stream.mediamtxPlaybackUrl = sanitizeText(req.body.mediamtxPlaybackUrl, 500);
        }
        if (req.body.mediamtxWebrtcUrl) {
          stream.mediamtxWebrtcUrl = sanitizeText(req.body.mediamtxWebrtcUrl, 500);
        }
      }

      // Mandatory destination verification: reject & retain existing provider if destination is NOT live/playable
      let verifiedOk = false;
      let verifyDetail = '';
      let latencyMs = 0;

      if (toProvider === 'youtube') {
        const t0 = Date.now();
        if (!stream.youtubeVideoId) {
          verifyDetail = 'No YouTube Video ID configured for destination.';
        } else {
          const ytCheck = await verifyYouTubeStream(stream.youtubeVideoId);
          latencyMs = Date.now() - t0;
          verifiedOk = ytCheck.available && ytCheck.embeddable;
          verifyDetail = ytCheck.message;
          stream.youtubeStreamStatus = verifiedOk
            ? ytCheck.liveBroadcastStatus === 'LIVE'
              ? 'LIVE'
              : 'READY'
            : 'UNAVAILABLE';
        }
      } else {
        const mtxCheck = await verifyMediaMTXStreamHealth({
          streamPath: stream.mediamtxStreamPath,
          hlsPlaybackUrl: stream.mediamtxPlaybackUrl,
          webrtcPlaybackUrl: stream.mediamtxWebrtcUrl,
        });
        latencyMs = mtxCheck.latencyMs;
        verifiedOk = mtxCheck.playable && mtxCheck.ok;
        verifyDetail = mtxCheck.message;
        stream.mediamtxPublishStatus = mtxCheck.publishStatus;
      }

      if (!verifiedOk) {
        // Retain existing active provider and record rejected switch attempt
        stream.providerSwitchHistory = [
          ...(stream.providerSwitchHistory || []).slice(-19),
          {
            fromProvider,
            toProvider,
            switchedBy: req.user!._id.toString(),
            switchedByName: req.user!.name || req.user!.email,
            switchedAt: new Date(),
            reason,
            status: 'REJECTED',
            detail: verifyDetail,
          },
        ];
        await stream.save();

        await recordActivity(
          req.user!,
          'SWITCH_STREAM_PROVIDER_REJECTED',
          'LiveStream',
          stream._id.toString(),
          `Rejected switch ${fromProvider} -> ${toProvider}: ${verifyDetail}`
        );

        res.status(422).json({
          message: `Cannot switch to ${toProvider === 'mediamtx' ? 'MediaMTX' : 'YouTube'}: ${verifyDetail} Existing provider (${fromProvider}) retained.`,
          retainedProvider: fromProvider,
          verificationDetail: verifyDetail,
          stream: formatPublicStream(stream.toObject(), {}, true),
        });
        return;
      }

      // Switch confirmed and verified
      stream.streamingProvider = toProvider;
      stream.activeStreamingProvider = toProvider;
      stream.lastProviderSwitchAt = new Date();
      stream.lastProviderSwitchBy = req.user!._id as mongoose.Types.ObjectId;
      stream.lastProviderSwitchByName = req.user!.name || req.user!.email;
      stream.streamHealth = {
        ok: true,
        status: toProvider === 'mediamtx' ? 'PUBLISHING' : stream.youtubeStreamStatus,
        checkedAt: new Date(),
        latencyMs,
        detail: verifyDetail,
      };
      stream.providerSwitchHistory = [
        ...(stream.providerSwitchHistory || []).slice(-19),
        {
          fromProvider,
          toProvider,
          switchedBy: req.user!._id.toString(),
          switchedByName: req.user!.name || req.user!.email,
          switchedAt: new Date(),
          reason,
          status: 'SUCCESS',
          detail: verifyDetail,
        },
      ];
      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      await recordActivity(
        req.user!,
        'SWITCH_STREAM_PROVIDER',
        'LiveStream',
        stream._id.toString(),
        `Switched broadcast provider ${fromProvider} -> ${toProvider} (${reason})`,
        {
          previousValue: { activeStreamingProvider: fromProvider },
          newValue: { activeStreamingProvider: toProvider, reason },
        }
      );

      const score = await LiveScore.findOne({ liveStreamId: stream._id }).lean();
      const publicPayload = formatPublicStream(stream.toObject(), { score }, true);

      emitStreamEvent(stream._id.toString(), 'streaming_provider_changed', {
        streamId: stream._id.toString(),
        fromProvider,
        toProvider,
        activeStreamingProvider: toProvider,
        youtubeVideoId: stream.youtubeVideoId,
        mediamtxPlaybackUrl: stream.mediamtxPlaybackUrl,
        mediamtxWebrtcUrl: stream.mediamtxWebrtcUrl,
        switchedAt: stream.lastProviderSwitchAt,
        switchedByName: stream.lastProviderSwitchByName,
        reason,
        stream: publicPayload,
      });

      const switchHealthPayload = {
        streamId: stream._id.toString(),
        provider: toProvider,
        mediamtxPublishStatus: stream.mediamtxPublishStatus,
        youtubeStreamStatus: stream.youtubeStreamStatus,
        streamHealth: stream.streamHealth,
        latencyMs: stream.streamHealth.latencyMs,
        checkedAt: stream.streamHealth.checkedAt,
      };
      emitStreamEvent(stream._id.toString(), 'stream:health_updated', switchHealthPayload);
      if (toProvider === 'mediamtx') {
        emitStreamEvent(stream._id.toString(), 'mediamtx:status_changed', switchHealthPayload);
      }

      res.json({
        message: `Broadcast switched from ${fromProvider} to ${toProvider}.`,
        fromProvider,
        toProvider,
        stream: publicPayload,
      });
    } catch (err) {
      console.error('[LiveStream] Switch provider error:', err);
      res.status(500).json({ message: 'Failed to switch streaming provider.' });
    } finally {
      activeProviderSwitches.delete(id);
    }
  }
);

// PATCH /api/live/:id - Edit optional match info, go live from UPCOMING, or update YouTube/MediaMTX settings
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
        activeStreamingProvider: stream.activeStreamingProvider,
        viewerCountVisibility: stream.viewerCountVisibility,
        matchTitle: stream.matchTitle,
        scoreboardPosition: stream.scoreboardPosition,
        scoreboardVisibleByDefault: stream.scoreboardVisibleByDefault,
        showScoreboardOnYoutube: stream.showScoreboardOnYoutube !== false,
        chatEnabled: stream.chatEnabled,
      };

      if (req.body.youtubeInput !== undefined || req.body.youtubeVideoId !== undefined) {
        const rawYt =
          typeof req.body.youtubeInput === 'string'
            ? req.body.youtubeInput
            : typeof req.body.youtubeVideoId === 'string'
              ? req.body.youtubeVideoId
              : '';
        if (rawYt.trim()) {
          const parsedYt = extractYouTubeVideoId(rawYt);
          if (!parsedYt.valid || !parsedYt.videoId) {
            res.status(400).json({
              message: parsedYt.error || 'Invalid YouTube Video ID or URL.',
            });
            return;
          }
          stream.youtubeVideoId = parsedYt.videoId;
          stream.youtubeInput = sanitizeText(rawYt, 300);
        } else {
          stream.youtubeVideoId = '';
          stream.youtubeInput = '';
        }
      }

      if (req.body.mediamtxStreamPath !== undefined) {
        stream.mediamtxStreamPath = sanitizeText(req.body.mediamtxStreamPath, 140);
      }
      if (req.body.mediamtxPlaybackUrl !== undefined) {
        stream.mediamtxPlaybackUrl = sanitizeText(req.body.mediamtxPlaybackUrl, 500);
      }
      if (req.body.mediamtxWebrtcUrl !== undefined) {
        stream.mediamtxWebrtcUrl = sanitizeText(req.body.mediamtxWebrtcUrl, 500);
      }
      if (req.body.viewerCountVisibility !== undefined) {
        stream.viewerCountVisibility = normalizeVisibility(req.body.viewerCountVisibility);
        invalidateViewerVisibilityCache(id);
      }
      if (req.body.authorizedScorerId !== undefined) {
        stream.authorizedScorerId =
          req.body.authorizedScorerId && mongoose.Types.ObjectId.isValid(req.body.authorizedScorerId)
            ? req.body.authorizedScorerId
            : null;
      }
      if (req.body.backupScorerId !== undefined) {
        stream.backupScorerId =
          req.body.backupScorerId && mongoose.Types.ObjectId.isValid(req.body.backupScorerId)
            ? req.body.backupScorerId
            : null;
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
      if (req.body.roundName !== undefined) {
        stream.roundName = sanitizeText(req.body.roundName, 100);
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
        const effectiveProvider = stream.activeStreamingProvider || stream.streamingProvider || 'youtube';
        if (effectiveProvider === 'youtube' && !stream.youtubeVideoId) {
          res.status(422).json({
            message:
              'Connect a valid YouTube Live Video URL or ID in Step 5 before activating the broadcast.',
          });
          return;
        }
        stream.status = 'LIVE';
        stream.broadcastPublished = true;
        stream.wasPublished = true;
        stream.broadcastPhase = 'BROADCAST_ACTIVE';
        stream.activatedAt = stream.activatedAt || new Date();
        stream.startedAt = stream.startedAt || new Date();
        becameLive = true;
      }

      if (typeof req.body.scoreboardVisibleByDefault === 'boolean') {
        stream.scoreboardVisibleByDefault = req.body.scoreboardVisibleByDefault;
      }
      let showOnYoutubeUpdated = false;
      if (typeof req.body.showScoreboardOnYoutube === 'boolean') {
        showOnYoutubeUpdated =
          (stream.showScoreboardOnYoutube !== false) !== req.body.showScoreboardOnYoutube;
        stream.showScoreboardOnYoutube = req.body.showScoreboardOnYoutube;
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

      const reqOversLimit =
        req.body.oversLimit !== undefined && req.body.oversLimit !== ''
          ? Math.max(1, Math.min(90, Math.floor(Number(req.body.oversLimit) || 20)))
          : undefined;
      const reqPlayersPerSide =
        req.body.playersPerSide !== undefined && req.body.playersPerSide !== ''
          ? Math.max(2, Math.min(15, Math.floor(Number(req.body.playersPerSide) || 11)))
          : undefined;

      const reqVolleyballRulesInput =
        req.body.volleyballRules && typeof req.body.volleyballRules === 'object'
          ? (req.body.volleyballRules as Partial<VolleyballRules>)
          : req.body.bestOfSets !== undefined && req.body.bestOfSets !== ''
            ? ({ bestOfSets: Number(req.body.bestOfSets) } as Partial<VolleyballRules>)
            : undefined;

      if (reqVolleyballRulesInput && (sportChangedTo === 'Volleyball' || stream.gameName === 'Volleyball')) {
        const vbCheck = validateVolleyballRules(reqVolleyballRulesInput);
        if (!vbCheck.valid) {
          res.status(400).json({ message: vbCheck.error || 'Invalid Volleyball match rules.' });
          return;
        }
      }

      if (sportChangedTo) {
        const existingScore = await LiveScore.findOne({ liveStreamId: stream._id });
        if (existingScore && existingScore.sportType !== sportChangedTo) {
          existingScore.sportType = sportChangedTo;
          existingScore.sportSpecificDetails = getInitialSportDetails(sportChangedTo, {
            oversLimit: reqOversLimit,
            playersPerSide: reqPlayersPerSide,
            volleyballRules: reqVolleyballRulesInput,
          });
          existingScore.lastUpdatedAt = new Date();
          existingScore.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
          await existingScore.save();
        }
      } else if (
        stream.gameName === 'Cricket' &&
        (reqOversLimit !== undefined || reqPlayersPerSide !== undefined)
      ) {
        const existingScore = await LiveScore.findOne({ liveStreamId: stream._id });
        if (existingScore) {
          const prevDetails = (existingScore.sportSpecificDetails || {}) as Record<string, unknown>;
          existingScore.sportSpecificDetails = {
            ...prevDetails,
            ...(reqOversLimit !== undefined ? { oversLimit: reqOversLimit } : {}),
            ...(reqPlayersPerSide !== undefined ? { playersPerSide: reqPlayersPerSide } : {}),
          };
          existingScore.lastUpdatedAt = new Date();
          existingScore.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
          await existingScore.save();
          emitStreamEvent(stream._id.toString(), 'score:updated', {
            streamId: stream._id.toString(),
            score: existingScore.toObject(),
          });
        }
      } else if (stream.gameName === 'Volleyball' && reqVolleyballRulesInput) {
        const existingScore = await LiveScore.findOne({ liveStreamId: stream._id });
        if (existingScore && existingScore.resultStatus === 'NOT_DECLARED') {
          const applied = applyVolleyballAction(
            existingScore.sportSpecificDetails,
            existingScore.teamAScore,
            existingScore.teamBScore,
            { type: 'UPDATE_RULES', rules: reqVolleyballRulesInput }
          );
          if (!applied.blockedReason) {
            existingScore.teamAScore = applied.teamAScore;
            existingScore.teamBScore = applied.teamBScore;
            existingScore.sportSpecificDetails = applied.details as unknown as Record<string, unknown>;
            existingScore.markModified?.('sportSpecificDetails');
            existingScore.lastUpdatedAt = new Date();
            existingScore.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
            await existingScore.save();
            emitStreamEvent(stream._id.toString(), 'score:updated', {
              streamId: stream._id.toString(),
              score: existingScore.toObject(),
            });
          }
        }
      }

      if (becameLive) {
        await LiveScore.findOneAndUpdate(
          { liveStreamId: stream._id },
          { matchStatus: 'Live', lastUpdatedAt: new Date() }
        );
      }

      const score = await LiveScore.findOne({ liveStreamId: stream._id }).lean();
      const payload = formatPublicStream(stream.toObject(), { score }, true);

      await recordActivity(
        req.user!,
        becameLive ? 'START_STREAM' : 'UPDATE_STREAM',
        'LiveStream',
        stream._id.toString(),
        stream.matchTitle || stream.youtubeVideoId || stream.mediamtxStreamPath,
        {
          previousValue,
          newValue: {
            status: stream.status,
            youtubeVideoId: stream.youtubeVideoId,
            activeStreamingProvider: stream.activeStreamingProvider,
            viewerCountVisibility: stream.viewerCountVisibility,
            matchTitle: stream.matchTitle,
            scoreboardPosition: stream.scoreboardPosition,
            scoreboardVisibleByDefault: stream.scoreboardVisibleByDefault,
            showScoreboardOnYoutube: stream.showScoreboardOnYoutube !== false,
            chatEnabled: stream.chatEnabled,
          },
        }
      );

      emitStreamEvent(stream._id.toString(), becameLive ? 'live:started' : 'live:updated', payload);
      if (showOnYoutubeUpdated) {
        emitRoomOnlyEvent(id, 'overlay:config_updated', {
          streamId: id,
          overlayConfig: payload.overlayConfig,
          showScoreboardOnYoutube: payload.showScoreboardOnYoutube,
        });
        emitBroadcastStudioEvent(id, 'overlay:config_updated', {
          streamId: id,
          overlayConfig: payload.overlayConfig,
          showScoreboardOnYoutube: payload.showScoreboardOnYoutube,
        });
        await emitFullStudioState(id);
      }

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

// PATCH /api/live/:id/youtube - Step 5: Connect / Verify YouTube Live Video URL or ID on an initialized match
router.patch(
  '/:id/youtube',
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
          message: 'Forbidden: You do not have permission to configure broadcast output.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Stream not found.' });
        return;
      }
      if (stream.status === 'ENDED') {
        res.status(400).json({ message: 'Cannot modify live broadcast output for an ended match.' });
        return;
      }

      const rawYoutube =
        typeof req.body.youtubeInput === 'string'
          ? req.body.youtubeInput
          : typeof req.body.youtubeVideoId === 'string'
            ? req.body.youtubeVideoId
            : undefined;

      const requestedProvider =
        req.body.activeStreamingProvider !== undefined
          ? normalizeProvider(req.body.activeStreamingProvider)
          : stream.activeStreamingProvider || stream.streamingProvider || 'youtube';

      let verificationResult = null;
      if (rawYoutube !== undefined) {
        if (rawYoutube.trim()) {
          const parsedYt = extractYouTubeVideoId(rawYoutube);
          if (!parsedYt.valid || !parsedYt.videoId) {
            res.status(400).json({
              message: parsedYt.error || 'Invalid YouTube Video ID or URL.',
            });
            return;
          }
          if (stream.status === 'LIVE' && requestedProvider === 'youtube') {
            const duplicate = await LiveStream.findOne({
              _id: { $ne: stream._id },
              youtubeVideoId: parsedYt.videoId,
              status: 'LIVE',
              activeStreamingProvider: 'youtube',
            });
            if (duplicate) {
              res.status(409).json({
                message: `Another active LIVE broadcast already uses YouTube Video ID "${parsedYt.videoId}".`,
              });
              return;
            }
          }
          stream.youtubeVideoId = parsedYt.videoId;
          stream.youtubeInput = sanitizeText(parsedYt.watchUrl || rawYoutube.trim(), 300);

          if (req.body.verify === true) {
            verificationResult = await verifyYouTubeVideoAvailability(parsedYt.videoId);
            stream.youtubeStreamStatus =
              verificationResult.liveBroadcastStatus === 'LIVE'
                ? 'LIVE'
                : verificationResult.available
                  ? 'READY'
                  : 'UNAVAILABLE';
            stream.streamHealth = {
              ok: Boolean(verificationResult.available && verificationResult.embeddable),
              status: verificationResult.liveBroadcastStatus || (verificationResult.available ? 'READY' : 'UNAVAILABLE'),
              checkedAt: new Date(),
              latencyMs: 0,
              detail: verificationResult.message,
            };
          } else if (stream.youtubeStreamStatus === 'UNKNOWN' || stream.youtubeStreamStatus === 'UNAVAILABLE') {
            stream.youtubeStreamStatus = 'READY';
          }
        } else {
          stream.youtubeVideoId = '';
          stream.youtubeInput = '';
          stream.youtubeStreamStatus = 'UNKNOWN';
        }
      }

      if (req.body.youtubeStreamStatus && ['UNKNOWN', 'READY', 'LIVE', 'UNAVAILABLE'].includes(req.body.youtubeStreamStatus)) {
        stream.youtubeStreamStatus = req.body.youtubeStreamStatus;
      }

      if (typeof req.body.showScoreboardOnYoutube === 'boolean') {
        stream.showScoreboardOnYoutube = req.body.showScoreboardOnYoutube;
      }
      stream.streamingProvider = requestedProvider;
      stream.activeStreamingProvider = requestedProvider;
      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      const score = await LiveScore.findOne({ liveStreamId: stream._id }).lean();
      const payload = formatPublicStream(stream.toObject(), { score }, true);

      await recordActivity(
        req.user!,
        'CONNECT_YOUTUBE_OUTPUT',
        'LiveStream',
        stream._id.toString(),
        `Updated broadcast output (${requestedProvider}${stream.youtubeVideoId ? ` · ${stream.youtubeVideoId}` : ''})`
      );

      if (stream.broadcastPublished !== false) {
        emitStreamEvent(stream._id.toString(), 'streaming_provider_changed', {
          streamId: stream._id.toString(),
          activeStreamingProvider: stream.activeStreamingProvider,
          youtubeVideoId: stream.youtubeVideoId,
          mediamtxPlaybackUrl: stream.mediamtxPlaybackUrl || '',
          mediamtxWebrtcUrl: stream.mediamtxWebrtcUrl || '',
          switchedAt: new Date().toISOString(),
          switchedByName: req.user!.name,
        });
        emitStreamEvent(stream._id.toString(), 'live:updated', payload);
      }
      await emitFullStudioState(stream._id.toString());

      res.json({ stream: payload, verification: verificationResult });
    } catch (err) {
      console.error('[LiveStream] Connect YouTube error:', err);
      res.status(500).json({ message: 'Failed to update YouTube broadcast connection.' });
    }
  }
);

// POST /api/live/:id/activate - Step 6: Validate playback details and publish broadcast to Player Portal
router.post(
  '/:id/activate',
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
          message: 'Forbidden: You do not have permission to activate this broadcast.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Match stream not found.' });
        return;
      }
      if (stream.status === 'ENDED') {
        res.status(400).json({ message: 'This match broadcast has already ended.' });
        return;
      }

      // Allow inline provider / YouTube link / overlay visibility override on activation if provided
      if (req.body.activeStreamingProvider === 'youtube' || req.body.activeStreamingProvider === 'mediamtx') {
        stream.streamingProvider = req.body.activeStreamingProvider;
        stream.activeStreamingProvider = req.body.activeStreamingProvider;
      }
      if (typeof req.body.showScoreboardOnYoutube === 'boolean') {
        stream.showScoreboardOnYoutube = req.body.showScoreboardOnYoutube;
      }
      const rawYt =
        typeof req.body.youtubeInput === 'string'
          ? req.body.youtubeInput
          : typeof req.body.youtubeVideoId === 'string'
            ? req.body.youtubeVideoId
            : undefined;
      if (rawYt !== undefined && rawYt.trim()) {
        const parsedYt = extractYouTubeVideoId(rawYt);
        if (!parsedYt.valid || !parsedYt.videoId) {
          res.status(400).json({
            message: parsedYt.error || 'Invalid YouTube Video ID or URL.',
          });
          return;
        }
        stream.youtubeVideoId = parsedYt.videoId;
        stream.youtubeInput = sanitizeText(parsedYt.watchUrl || rawYt.trim(), 300);
        if (stream.youtubeStreamStatus === 'UNKNOWN' || stream.youtubeStreamStatus === 'UNAVAILABLE') {
          stream.youtubeStreamStatus = 'READY';
        }
      }

      const activeProvider = stream.activeStreamingProvider || stream.streamingProvider || 'youtube';
      if (activeProvider === 'youtube') {
        if (!stream.youtubeVideoId) {
          res.status(422).json({
            message:
              'Cannot activate MaidanLive broadcast: connect a valid YouTube Live Video URL or ID in Step 5 first.',
          });
          return;
        }
        const duplicate = await LiveStream.findOne({
          _id: { $ne: stream._id },
          youtubeVideoId: stream.youtubeVideoId,
          status: 'LIVE',
          activeStreamingProvider: 'youtube',
          broadcastPublished: { $ne: false },
        });
        if (duplicate) {
          res.status(409).json({
            message: `Another active LIVE broadcast already uses YouTube Video ID "${stream.youtubeVideoId}".`,
            existingStreamId: duplicate._id.toString(),
          });
          return;
        }
      } else {
        if (!stream.mediamtxStreamPath || !stream.mediamtxPlaybackUrl) {
          const mtxCfg = buildMediaMTXConfig(stream._id.toString(), stream.mediamtxStreamPath);
          stream.mediamtxStreamPath = stream.mediamtxStreamPath || mtxCfg.streamPath;
          stream.mediamtxPlaybackUrl = stream.mediamtxPlaybackUrl || mtxCfg.hlsPlaybackUrl;
          stream.mediamtxWebrtcUrl = stream.mediamtxWebrtcUrl || mtxCfg.webrtcPlaybackUrl;
        }
      }

      const now = new Date();
      stream.status = 'LIVE';
      stream.broadcastPublished = true;
      stream.wasPublished = true;
      stream.broadcastPhase = 'BROADCAST_ACTIVE';
      stream.activatedAt = stream.activatedAt || now;
      stream.startedAt = stream.startedAt || now;
      stream.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await stream.save();

      let score = await LiveScore.findOne({ liveStreamId: stream._id });
      if (score && (!score.matchStatus || ['Prepared', 'Upcoming'].includes(score.matchStatus))) {
        score.matchStatus = 'Live';
        score.lastUpdatedAt = now;
        score.lastUpdatedBy = req.user!._id as mongoose.Types.ObjectId;
        await score.save();
      }
      if (stream.fixtureId) {
        await Fixture.findByIdAndUpdate(stream.fixtureId, {
          liveStreamId: stream._id,
          status: 'LIVE',
        }).catch(() => {});
      }

      const payload = formatPublicStream(
        stream.toObject(),
        { score: score ? score.toObject() : null },
        true
      );

      await recordActivity(
        req.user!,
        'ACTIVATE_BROADCAST',
        'LiveStream',
        stream._id.toString(),
        `Activated public broadcast (${stream.matchTitle || stream.youtubeVideoId || stream.mediamtxStreamPath})`
      );

      emitStreamEvent(stream._id.toString(), 'live:started', payload);
      await dispatchMatchNotifications({
        type: 'MATCH_LIVE',
        title: 'Match is Live Now',
        message:
          stream.matchTitle ||
          [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
          'Match broadcast is now live on MaidanLive!',
        entityType: 'LiveStream',
        entityId: stream._id.toString(),
        link: `/live/${stream._id.toString()}`,
        dedupeKey: `stream-live-${stream._id.toString()}`,
        teamIds: [stream.teamAId, stream.teamBId],
        includeAllSpectatorsIfNoFollowers: true,
      });
      await emitFullStudioState(stream._id.toString());
      triggerBroadcastGraphicEvent(
        stream._id.toString(),
        'MATCH_STARTING',
        `match_start_${stream._id.toString()}`
      ).catch(() => {});

      res.json({ stream: payload });
    } catch (err) {
      console.error('[LiveStream] Activate error:', err);
      res.status(500).json({ message: 'Failed to activate broadcast.' });
    }
  }
);

// PATCH /api/live/:id/end - Step 7: End active or prepared stream (preserves scores, sets ENDED & unpublishes active live stage)
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

      const previousStatus = stream.status;
      stream.status = 'ENDED';
      stream.broadcastPublished = false;
      stream.broadcastPhase = 'BROADCAST_ENDED';
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
        `Ended MaidanLive stream (${stream.matchTitle || stream.youtubeVideoId || stream.mediamtxStreamPath})`,
        {
          previousValue: { status: previousStatus },
          newValue: {
            status: 'ENDED',
            broadcastPhase: 'BROADCAST_ENDED',
            endedAt: stream.endedAt,
          },
        }
      );

      const payload = formatPublicStream(stream.toObject(), { score }, true);
      await clearLiveGraphics(stream._id.toString(), req.user!).catch(() => {});
      await handleMatchSessionEndedForSchedules(stream._id.toString()).catch(() => {});
      emitStreamEvent(stream._id.toString(), 'live:ended', payload);
      await emitFullStudioState(stream._id.toString());

      res.json({
        stream: payload,
        note: 'MaidanLive broadcast ended cleanly. Final scores and match history are preserved; stop OBS/YouTube Studio separately if still streaming.',
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
            stream: formatPublicStream(stream.toObject(), {}, true),
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
      const payload = formatPublicStream(stream.toObject(), { score }, true);
      emitStreamEvent(stream._id.toString(), 'live:updated', payload);

      res.json({ stream: payload });
    } catch (err) {
      console.error('[LiveStream] Replay error:', err);
      res.status(500).json({ message: 'Failed to update replay settings.' });
    }
  }
);

// DELETE /api/live/:id - Delete any match (prepared draft, upcoming, live, or ended) — SUPER_ADMIN & ADMIN only
router.delete(
  '/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid match stream ID.' });
        return;
      }

      if (req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'ADMIN') {
        res.status(403).json({
          message: 'Forbidden: Only Super Admin or Admin can delete matches.',
        });
        return;
      }

      const stream = await LiveStream.findById(id);
      if (!stream) {
        res.status(404).json({ message: 'Match not found.' });
        return;
      }

      const matchTitle =
        stream.matchTitle ||
        [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
        stream.youtubeVideoId ||
        stream.mediamtxStreamPath ||
        id;
      const previousStatus = stream.status;
      const previousPhase = stream.broadcastPhase;

      // Unlink any fixture that pointed to this live stream
      if (stream.fixtureId) {
        const fixture = await Fixture.findById(stream.fixtureId).catch(() => null);
        if (fixture) {
          fixture.liveStreamId = null;
          if (fixture.status === 'LIVE') {
            fixture.status = 'SCHEDULED';
          }
          await fixture.save().catch(() => {});
        }
      }
      await Fixture.updateMany(
        { liveStreamId: stream._id },
        { $set: { liveStreamId: null } }
      ).catch(() => {});

      // Clean up ObsBridge references safely on both MongoDB and SQLite fallback
      const bridgesWithMatch = await ObsBridge.find({
        $or: [{ assignedMatchIds: stream._id }, { activeMatchId: stream._id }],
      }).catch(() => []);
      for (const br of bridgesWithMatch) {
        br.assignedMatchIds = (br.assignedMatchIds || []).filter(
          (mid: any) => String(mid) !== id
        );
        if (br.activeMatchId && String(br.activeMatchId) === id) {
          br.activeMatchId = null;
        }
        await br.save().catch(() => {});
      }

      await clearLiveGraphics(id, req.user!).catch(() => {});
      await handleMatchSessionEndedForSchedules(id).catch(() => {});

      // Delete all match-scoped child documents
      await Promise.all([
        LiveScore.deleteMany({ liveStreamId: stream._id }),
        ScoreHistory.deleteMany({ liveStreamId: stream._id }),
        MatchHighlight.deleteMany({ liveStreamId: stream._id }),
        ChatMessage.deleteMany({ liveStreamId: stream._id }),
        Poll.deleteMany({ liveStreamId: stream._id }),
        ViewerMetric.deleteMany({ liveStreamId: stream._id }),
        MatchReport.deleteMany({ liveStreamId: stream._id }),
        PlayerMatchStat.deleteMany({ liveStreamId: stream._id }),
        SponsorOverlay.deleteMany({ liveStreamId: stream._id }),
        BroadcastCamera.deleteMany({ matchId: stream._id }),
        BroadcastScene.deleteMany({ matchId: stream._id }),
        ObsControllerProfile.deleteMany({ matchId: stream._id }),
        BroadcastAdDesign.deleteMany({ matchId: stream._id }),
        BroadcastAdSchedule.deleteMany({ matchId: stream._id }),
        BroadcastGraphicsAsset.deleteMany({ matchId: stream._id }),
        BroadcastGraphicsState.deleteMany({ matchId: stream._id }),
        BroadcastAssignment.deleteMany({ matchId: stream._id }),
      ]);

      await LiveStream.deleteOne({ _id: stream._id });
      invalidateViewerVisibilityCache(id);

      await recordActivity(
        req.user!,
        'DELETE_STREAM',
        'LiveStream',
        id,
        `Deleted match "${matchTitle}" (${previousStatus} / ${previousPhase})`,
        {
          previousValue: {
            status: previousStatus,
            broadcastPhase: previousPhase,
            matchTitle,
          },
        }
      );

      emitStreamEvent(id, 'live:deleted', {
        id,
        status: previousStatus,
        matchTitle,
      });

      res.json({
        deleted: true,
        id,
        message: `Match "${matchTitle}" and its associated broadcast data were permanently deleted.`,
      });
    } catch (err) {
      console.error('[LiveStream] Delete match error:', err);
      res.status(500).json({ message: 'Failed to delete match.' });
    }
  }
);

export default router;
