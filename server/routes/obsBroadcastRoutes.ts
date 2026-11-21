import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import {
  authenticate,
  canManageStream,
  canManageTournament,
  getAuthorizedBroadcastScope,
  hasBroadcastAccess,
  hasGranularPermission,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest, BroadcastAccessPermission } from '../middleware/auth.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Tournament } from '../models/Tournament.ts';
import { Sponsor } from '../models/Sponsor.ts';
import { User } from '../models/User.ts';
import { BroadcastAssignment } from '../models/BroadcastAssignment.ts';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import { BroadcastCamera } from '../models/BroadcastCamera.ts';
import type { CameraSourceType, CameraType } from '../models/BroadcastCamera.ts';
import { BroadcastScene } from '../models/BroadcastScene.ts';
import { BroadcastAuditLog } from '../models/BroadcastAuditLog.ts';
import {
  applyDynamicLayoutToObs,
  captureObsPreviewImage,
  connectDirectObs,
  controlObsOutput,
  disconnectCameraByOperator,
  disconnectObs,
  emitFullStudioState,
  ensureObsProfileForMatch,
  formatAuditLog,
  formatSafeCamera,
  formatSafeProfile,
  formatSafeScene,
  getStudioSnapshot,
  manageBroadcastSession,
  refreshObsState,
  setCameraObsAudioMute,
  switchCameraLive,
  switchObsSceneByName,
  testObsConnection,
  writeBroadcastAudit,
} from '../services/obsControllerService.ts';
import {
  buildVdoNinjaLinks,
  decryptObsSecret,
  encryptObsSecret,
  generateScopedToken,
  verifyScopedToken,
} from '../utils/obsCrypto.ts';
import { LAYOUT_METADATA } from '../../src/utils/obsLayoutGeometry.ts';
import type { ObsLayoutType } from '../../src/utils/obsLayoutGeometry.ts';
import { sanitizeText } from '../utils/sanitize.ts';
import { recordActivity } from '../utils/audit.ts';
import { emitBroadcastStudioEvent } from '../socket/index.ts';
import { verifyMediaMTXStreamHealth } from '../services/mediamtxService.ts';

const router = Router();

const broadcastCommandLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many broadcast control commands. Please slow down.' },
});

const VALID_CAMERA_TYPES: CameraType[] = [
  'smartphone_vdo',
  'rtmp_mediamtx',
  'ip_camera',
  'usb_capture',
  'browser_source',
  'obs_scene_only',
];

const VALID_SOURCE_TYPES: CameraSourceType[] = [
  'vdoninja',
  'browser_source',
  'mediamtx',
  'obs_input',
  'rtsp_ffmpeg',
];

const VALID_RESOLUTIONS = ['1920x1080', '1280x720', '854x480', '640x360'] as const;
const VALID_LAYOUTS = Object.keys(LAYOUT_METADATA) as ObsLayoutType[];

const DEFAULT_BROADCASTER_PERMS = [
  'broadcast:control',
  'broadcast:manage_cameras',
  'broadcast:manage_overlays',
  'broadcast:stream_control',
  'broadcast:record_control',
];

function resolveBaseAppUrl(req: Request): string {
  const envUrl = (process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const proto =
    String(req.headers['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim() ||
    req.protocol ||
    'http';
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

async function authorizeBroadcastControl(
  req: AuthenticatedRequest,
  res: Response,
  matchId: string,
  requiredPerm: BroadcastAccessPermission = 'broadcast:control'
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    res.status(400).json({ message: 'Invalid match ID.' });
    return false;
  }
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') return true;
  if (requiredPerm === 'broadcast:override') {
    const canOverride = await hasBroadcastAccess(user, matchId, 'broadcast:override');
    if (!canOverride) {
      res.status(403).json({
        message: 'Forbidden: Admin Override permission is required for this action.',
      });
      return false;
    }
    return true;
  }

  const allowed = await hasBroadcastAccess(user, matchId, requiredPerm);
  if (!allowed) {
    res.status(403).json({
      message:
        'Forbidden: You do not have active broadcast assignment or permission for this match.',
    });
    return false;
  }
  return true;
}

// =========================================================================
// SMARTPHONE CAMERA COMPANION ENDPOINTS (Scoped Camera Push Token Auth Only)
// =========================================================================

// GET /api/obs/camera-connect/:cameraDocId?token=...
router.get('/camera-connect/:cameraDocId', async (req: Request, res: Response) => {
  try {
    const { cameraDocId } = req.params;
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!mongoose.Types.ObjectId.isValid(cameraDocId) || !token) {
      res.status(401).json({ message: 'Valid camera ID and scoped connection token are required.' });
      return;
    }

    const cam: any = await BroadcastCamera.findById(cameraDocId).select('+pushTokenHash +vdoPasswordEnc');
    if (!cam || !verifyScopedToken(token, cam.pushTokenHash || '')) {
      res.status(403).json({ message: 'Invalid or revoked camera connection token.' });
      return;
    }
    if (cam.pushTokenExpiresAt && new Date(cam.pushTokenExpiresAt).getTime() <= Date.now()) {
      res.status(403).json({
        message:
          'This camera QR connection link has expired. Ask the broadcaster to generate a fresh QR code.',
        code: 'CAMERA_TOKEN_EXPIRED',
      });
      return;
    }

    const [profile, stream] = await Promise.all([
      ObsControllerProfile.findOne({ matchId: cam.matchId }).select('+vdoRoomPasswordEnc').lean(),
      LiveStream.findById(cam.matchId)
        .select('matchTitle teamAName teamBName gameName tournamentName status')
        .lean(),
    ]);

    const roomPassword = profile?.vdoRoomPasswordEnc
      ? decryptObsSecret(profile.vdoRoomPasswordEnc)
      : '';
    const vdoLinks =
      cam.sourceType === 'vdoninja'
        ? buildVdoNinjaLinks({
            roomName: cam.vdoRoomName || profile?.vdoRoomName || 'maidanlive',
            streamId: cam.vdoStreamId || cam.cameraId,
            password: roomPassword,
            label: cam.label || cam.name,
            resolution: cam.resolution,
            fps: cam.fps,
            bitrateKbps: cam.bitrateKbps,
            lowBandwidthMode: cam.lowBandwidthMode,
            facingMode: cam.facingMode,
          })
        : null;

    res.json({
      camera: {
        id: String(cam._id),
        matchId: String(cam.matchId),
        cameraId: cam.cameraId,
        name: cam.name,
        label: cam.label,
        cameraNumber: cam.cameraNumber,
        position: cam.position,
        sourceType: cam.sourceType,
        resolution: cam.resolution,
        fps: cam.fps,
        bitrateKbps: cam.bitrateKbps,
        lowBandwidthMode: cam.lowBandwidthMode,
        facingMode: cam.facingMode,
        enabled: cam.enabled,
        status: cam.status,
        operatorName: cam.operatorName,
        audioMuted: Boolean(cam.audioMuted ?? cam.telemetry?.audioMuted),
        broadcastSessionId: cam.broadcastSessionId || profile?.broadcastSessionId || '',
        pushTokenExpiresAt: cam.pushTokenExpiresAt || null,
        vdoPushUrl: vdoLinks?.pushUrl || '',
        connectionUrl: cam.connectionUrl || '',
      },
      match: stream
        ? {
            id: String(stream._id),
            matchTitle:
              stream.matchTitle ||
              [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
              'Live Match',
            gameName: stream.gameName,
            tournamentName: stream.tournamentName,
            status: stream.status,
          }
        : null,
    });
  } catch (err) {
    console.error('[OBS Camera Connect] Error:', err);
    res.status(500).json({ message: 'Failed to load camera companion details.' });
  }
});

// POST /api/obs/camera-connect/:cameraDocId/heartbeat
router.post('/camera-connect/:cameraDocId/heartbeat', async (req: Request, res: Response) => {
  try {
    const { cameraDocId } = req.params;
    const token =
      typeof req.body.token === 'string'
        ? req.body.token.trim()
        : typeof req.query.token === 'string'
          ? req.query.token.trim()
          : '';
    if (!mongoose.Types.ObjectId.isValid(cameraDocId) || !token) {
      res.status(401).json({ message: 'Camera token required.' });
      return;
    }

    const cam = await BroadcastCamera.findById(cameraDocId).select('+pushTokenHash');
    if (!cam || !verifyScopedToken(token, cam.pushTokenHash || '')) {
      res.status(403).json({ message: 'Invalid or revoked camera connection token.' });
      return;
    }
    if (cam.pushTokenExpiresAt && new Date(cam.pushTokenExpiresAt).getTime() <= Date.now()) {
      res.status(403).json({
        message: 'Camera connection token expired. Please re-scan the updated QR code.',
        code: 'CAMERA_TOKEN_EXPIRED',
      });
      return;
    }

    const reqStatus = req.body.status;
    const allowed = ['CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR'] as const;
    const nextStatus = allowed.includes(reqStatus) ? reqStatus : 'CONNECTED';

    const profile = await ObsControllerProfile.findOne({ matchId: cam.matchId }).lean();
    const isCurrentlyActive =
      profile?.connectionStatus === 'CONNECTED' &&
      (profile.activeCameraId === cam.cameraId ||
        (cam.obsSceneName && profile.activeObsScene === cam.obsSceneName));

    cam.status = isCurrentlyActive && nextStatus === 'CONNECTED' ? 'ACTIVE' : nextStatus;
    cam.lastHeartbeatAt = new Date();
    cam.lastError = nextStatus === 'ERROR' ? sanitizeText(req.body.error, 350) : '';
    if (req.body.facingMode === 'user' || req.body.facingMode === 'environment') {
      cam.facingMode = req.body.facingMode;
    }
    if (req.body.telemetry && typeof req.body.telemetry === 'object') {
      const audioMuted =
        typeof req.body.telemetry.audioMuted === 'boolean'
          ? req.body.telemetry.audioMuted
          : cam.audioMuted;
      cam.audioMuted = Boolean(audioMuted);
      cam.telemetry = {
        networkType: sanitizeText(req.body.telemetry.networkType, 40),
        batteryLevel:
          req.body.telemetry.batteryLevel !== undefined
            ? Number(req.body.telemetry.batteryLevel)
            : cam.telemetry?.batteryLevel ?? null,
        batteryCharging:
          typeof req.body.telemetry.batteryCharging === 'boolean'
            ? req.body.telemetry.batteryCharging
            : cam.telemetry?.batteryCharging ?? null,
        resolutionActual: sanitizeText(req.body.telemetry.resolutionActual, 40),
        fpsActual:
          req.body.telemetry.fpsActual !== undefined ? Number(req.body.telemetry.fpsActual) : null,
        audioMuted: Boolean(audioMuted),
      };
    }
    await cam.save();

    emitBroadcastStudioEvent(String(cam.matchId), 'obs:camera_status', {
      matchId: String(cam.matchId),
      cameraId: cam.cameraId,
      status: cam.status,
      lastHeartbeatAt: cam.lastHeartbeatAt,
      telemetry: cam.telemetry,
      audioMuted: cam.audioMuted,
      lastError: cam.lastError,
    });
    await emitFullStudioState(String(cam.matchId));

    res.json({ ok: true, status: cam.status, lastHeartbeatAt: cam.lastHeartbeatAt });
  } catch (err) {
    console.error('[OBS Camera Heartbeat] Error:', err);
    res.status(500).json({ message: 'Failed to record camera heartbeat.' });
  }
});

// =========================================================================
// BROADCASTER DASHBOARD & BROADCASTER ROLE ASSIGNMENT MANAGEMENT
// =========================================================================

// GET /api/obs/broadcaster/dashboard
router.get(
  '/broadcaster/dashboard',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      if (
        !['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER', 'BROADCASTER', 'SCORER'].includes(
          user.role
        )
      ) {
        res.status(403).json({ message: 'Forbidden: Broadcaster dashboard access required.' });
        return;
      }

      // Scorer must have explicit broadcast assignments or granular broadcast:control to enter broadcaster dashboard
      if (user.role === 'SCORER') {
        const activeAssignCount = await BroadcastAssignment.countDocuments({
          userId: user._id,
          status: 'ACTIVE',
        });
        const hasExplicit =
          activeAssignCount > 0 ||
          (Array.isArray(user.granularPermissions) &&
            user.granularPermissions.includes('broadcast:control'));
        if (!hasExplicit) {
          res.status(403).json({
            message:
              'Forbidden: Scorers do not automatically have Broadcaster permissions. Request a Broadcaster assignment.',
          });
          return;
        }
      }

      const scope = await getAuthorizedBroadcastScope(user);

      let tournamentList: any[] = [];
      let streamList: any[] = [];

      if (scope.allAccess) {
        [tournamentList, streamList] = await Promise.all([
          Tournament.find().sort({ createdAt: -1 }).limit(100).lean(),
          LiveStream.find().sort({ startedAt: -1, createdAt: -1 }).limit(120).lean(),
        ]);
      } else {
        const allStreams = await LiveStream.find().sort({ startedAt: -1, createdAt: -1 }).lean();
        streamList = allStreams.filter((s: any) => {
          const sid = String(s._id);
          const tid = s.tournamentId ? String(s.tournamentId) : '';
          return scope.matchIds.includes(sid) || (tid && scope.tournamentIds.includes(tid));
        });

        const tourIdSet = new Set<string>(scope.tournamentIds);
        for (const s of streamList) {
          if (s.tournamentId) tourIdSet.add(String(s.tournamentId));
        }
        if (tourIdSet.size > 0) {
          const allTours = await Tournament.find().sort({ createdAt: -1 }).lean();
          tournamentList = allTours.filter((t: any) => tourIdSet.has(String(t._id)));
        }
      }

      const matchIds = streamList.map((s: any) => String(s._id));
      const [profiles, cameras, userAssignments] = await Promise.all([
        ObsControllerProfile.find().lean(),
        BroadcastCamera.find().lean(),
        BroadcastAssignment.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
      ]);

      const profileByMatch = new Map<string, any>();
      for (const p of profiles) {
        profileByMatch.set(String(p.matchId), formatSafeProfile(p));
      }

      const camerasByMatch = new Map<string, any[]>();
      for (const c of cameras) {
        const mid = String(c.matchId);
        const list = camerasByMatch.get(mid) || [];
        list.push(c);
        camerasByMatch.set(mid, list);
      }

      const enrichedMatches = streamList.map((s: any) => {
        const mid = String(s._id);
        const prof = profileByMatch.get(mid) || null;
        const cams = camerasByMatch.get(mid) || [];
        const formattedCams = cams.map((c) => formatSafeCamera(c, prof || {}));
        const connectedCount = formattedCams.filter(
          (c) => c.enabled && (c.status === 'CONNECTED' || c.status === 'ACTIVE')
        ).length;
        return {
          id: mid,
          matchTitle:
            s.matchTitle ||
            [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') ||
            'Match Broadcast',
          teamAName: s.teamAName || '',
          teamBName: s.teamBName || '',
          gameName: s.gameName || '',
          tournamentId: s.tournamentId ? String(s.tournamentId) : null,
          tournamentName: s.tournamentName || '',
          status: s.status,
          matchDate: s.matchDate || null,
          startedAt: s.startedAt || null,
          endedAt: s.endedAt || null,
          activeStreamingProvider: s.activeStreamingProvider || s.streamingProvider || 'youtube',
          obsConnectionStatus: prof?.connectionStatus || 'DISCONNECTED',
          obsStreamActive: Boolean(prof?.obsStreamActive),
          obsRecordActive: Boolean(prof?.obsRecordActive),
          activeObsScene: prof?.activeObsScene || '',
          activeLayoutType: prof?.activeLayoutType || 'SINGLE',
          broadcastSessionId: prof?.broadcastSessionId || '',
          activeControllerName: prof?.activeControllerName || '',
          adminOverrideLocked: Boolean(prof?.adminOverrideLocked),
          connectedCameraCount: connectedCount,
          totalCameraCount: formattedCams.length,
        };
      });

      const activeSessions = enrichedMatches.filter(
        (m) =>
          m.status === 'LIVE' ||
          m.obsConnectionStatus === 'CONNECTED' ||
          m.connectedCameraCount > 0 ||
          m.obsStreamActive
      );

      res.json({
        scope,
        assignments: userAssignments.map((a: any) => ({
          id: String(a._id),
          scopeType: a.scopeType,
          tournamentId: a.tournamentId ? String(a.tournamentId) : null,
          matchId: a.matchId ? String(a.matchId) : null,
          status: a.status,
          permissions: a.permissions || [],
          assignedByName: a.assignedByName || '',
          notes: a.notes || '',
          createdAt: a.createdAt,
        })),
        tournaments: tournamentList.map((t: any) => ({
          id: String(t._id),
          name: t.name,
          sportType: t.sportType || 'Cricket',
          status: t.status,
          startDate: t.startDate || null,
          matchCount: enrichedMatches.filter((m) => m.tournamentId === String(t._id)).length,
        })),
        matches: enrichedMatches,
        activeSessions,
        summary: {
          assignedTournaments: tournamentList.length,
          liveMatches: enrichedMatches.filter((m) => m.status === 'LIVE').length,
          upcomingMatches: enrichedMatches.filter((m) => m.status === 'UPCOMING').length,
          completedMatches: enrichedMatches.filter((m) => m.status === 'ENDED').length,
          connectedObsCount: enrichedMatches.filter((m) => m.obsConnectionStatus === 'CONNECTED').length,
          connectedCamerasTotal: enrichedMatches.reduce((acc, m) => acc + m.connectedCameraCount, 0),
          authorizedMatchIdsCount: matchIds.length,
        },
      });
    } catch (err) {
      console.error('[Broadcaster Dashboard] Error:', err);
      res.status(500).json({ message: 'Failed to load broadcaster dashboard.' });
    }
  }
);

// GET /api/obs/broadcasters - Management view for Admin / Super Admin / Organizer
router.get(
  '/broadcasters',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      if (!['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER'].includes(user.role)) {
        res.status(403).json({
          message: 'Forbidden: Only Super Admins, Admins, and Tournament Organizers can manage broadcasters.',
        });
        return;
      }

      const [allAssignments, allUsers, allTournaments, allStreams, allProfiles, allCameras, allLogs] =
        await Promise.all([
          BroadcastAssignment.find().sort({ createdAt: -1 }).lean(),
          User.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
          Tournament.find().sort({ createdAt: -1 }).lean(),
          LiveStream.find().sort({ createdAt: -1 }).lean(),
          ObsControllerProfile.find().lean(),
          BroadcastCamera.find().lean(),
          BroadcastAuditLog.find().sort({ timestamp: -1 }).limit(80).lean(),
        ]);

      // Filter tournaments & matches for TOURNAMENT_ORGANIZER
      const managedTournamentIds = new Set<string>();
      for (const t of allTournaments) {
        const tid = String(t._id);
        if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
          managedTournamentIds.add(tid);
        } else if (await canManageTournament(user, tid)) {
          managedTournamentIds.add(tid);
        }
      }

      const visibleTournaments = allTournaments.filter((t: any) =>
        managedTournamentIds.has(String(t._id))
      );

      const visibleStreams = allStreams.filter((s: any) => {
        if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
        if (s.createdBy && String(s.createdBy) === String(user._id)) return true;
        if (s.tournamentId && managedTournamentIds.has(String(s.tournamentId))) return true;
        return (user.assignedStreamIds || []).some((id) => String(id) === String(s._id));
      });
      const visibleStreamIds = new Set(visibleStreams.map((s: any) => String(s._id)));

      const userMap = new Map(allUsers.map((u: any) => [String(u._id), u]));
      const tourMap = new Map(allTournaments.map((t: any) => [String(t._id), t]));
      const streamMap = new Map(allStreams.map((s: any) => [String(s._id), s]));

      const visibleAssignments = allAssignments
        .filter((a: any) => {
          if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
          if (a.scopeType === 'tournament' && a.tournamentId) {
            return managedTournamentIds.has(String(a.tournamentId));
          }
          if (a.scopeType === 'match' && a.matchId) {
            return visibleStreamIds.has(String(a.matchId));
          }
          return false;
        })
        .map((a: any) => {
          const u = userMap.get(String(a.userId));
          const t = a.tournamentId ? tourMap.get(String(a.tournamentId)) : null;
          const m = a.matchId ? streamMap.get(String(a.matchId)) : null;
          return {
            id: String(a._id),
            userId: String(a.userId),
            userName: u?.name || 'Unknown User',
            userEmail: u?.email || '',
            userRole: u?.role || 'SPECTATOR',
            role: a.role,
            scopeType: a.scopeType,
            tournamentId: a.tournamentId ? String(a.tournamentId) : null,
            tournamentName: t?.name || m?.tournamentName || '',
            matchId: a.matchId ? String(a.matchId) : null,
            matchTitle: m
              ? m.matchTitle || [m.teamAName, m.teamBName].filter(Boolean).join(' vs ')
              : '',
            status: a.status,
            permissions: a.permissions || [],
            assignedByName: a.assignedByName || '',
            notes: a.notes || '',
            suspendedAt: a.suspendedAt || null,
            revokedAt: a.revokedAt || null,
            revokeReason: a.revokeReason || '',
            createdAt: a.createdAt,
          };
        });

      const activeSessions = allProfiles
        .filter((p: any) => visibleStreamIds.has(String(p.matchId)))
        .map((p: any) => {
          const safe = formatSafeProfile(p);
          const m = streamMap.get(String(p.matchId));
          const cams = allCameras.filter((c: any) => String(c.matchId) === String(p.matchId));
          const onlineCams = cams
            .map((c: any) => formatSafeCamera(c, safe))
            .filter((c: any) => c.enabled && (c.status === 'CONNECTED' || c.status === 'ACTIVE'));
          return {
            matchId: String(p.matchId),
            matchTitle: m
              ? m.matchTitle || [m.teamAName, m.teamBName].filter(Boolean).join(' vs ')
              : 'Match',
            matchStatus: m?.status || 'UPCOMING',
            connectionStatus: safe?.connectionStatus || 'DISCONNECTED',
            obsStreamActive: Boolean(safe?.obsStreamActive),
            obsRecordActive: Boolean(safe?.obsRecordActive),
            activeObsScene: safe?.activeObsScene || '',
            broadcastSessionId: safe?.broadcastSessionId || '',
            activeControllerName: safe?.activeControllerName || '',
            onlineCameraCount: onlineCams.length,
            totalCameraCount: cams.length,
          };
        });

      const recentAuditLogs = allLogs
        .filter((l: any) => visibleStreamIds.has(String(l.matchId)))
        .slice(0, 40)
        .map(formatAuditLog);

      res.json({
        assignments: visibleAssignments,
        candidates: allUsers.map((u: any) => ({
          id: String(u._id),
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive,
        })),
        tournaments: visibleTournaments.map((t: any) => ({
          id: String(t._id),
          name: t.name,
          sportType: t.sportType || 'Cricket',
          status: t.status,
        })),
        matches: visibleStreams.map((s: any) => ({
          id: String(s._id),
          matchTitle:
            s.matchTitle || [s.teamAName, s.teamBName].filter(Boolean).join(' vs ') || 'Match',
          tournamentId: s.tournamentId ? String(s.tournamentId) : null,
          tournamentName: s.tournamentName || '',
          status: s.status,
        })),
        activeSessions,
        recentAuditLogs,
      });
    } catch (err) {
      console.error('[Broadcasters Management] List error:', err);
      res.status(500).json({ message: 'Failed to load broadcaster assignments.' });
    }
  }
);

// POST /api/obs/broadcasters/assign
router.post(
  '/broadcasters/assign',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = req.user!;
      if (!['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER'].includes(actor.role)) {
        res.status(403).json({
          message: 'Forbidden: Only Super Admins, Admins, and Tournament Organizers can assign broadcasters.',
        });
        return;
      }

      const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
      const scopeType = req.body.scopeType === 'tournament' ? 'tournament' : 'match';
      const tournamentId =
        typeof req.body.tournamentId === 'string' ? req.body.tournamentId.trim() : '';
      const matchId = typeof req.body.matchId === 'string' ? req.body.matchId.trim() : '';
      const notes = sanitizeText(req.body.notes, 300);
      const promoteToBroadcaster = req.body.promoteToBroadcaster !== false;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({ message: 'Valid target userId is required.' });
        return;
      }

      const targetUser = await User.findById(userId);
      if (!targetUser || !targetUser.isActive) {
        res.status(404).json({ message: 'Target user not found or inactive.' });
        return;
      }

      let resolvedTournamentId: mongoose.Types.ObjectId | null = null;
      let resolvedMatchId: mongoose.Types.ObjectId | null = null;

      if (scopeType === 'tournament') {
        if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
          res.status(400).json({ message: 'Valid tournamentId is required for tournament scope.' });
          return;
        }
        const tour = await Tournament.findById(tournamentId).lean();
        if (!tour) {
          res.status(404).json({ message: 'Tournament not found.' });
          return;
        }
        if (actor.role === 'TOURNAMENT_ORGANIZER' && !(await canManageTournament(actor, tournamentId))) {
          res.status(403).json({
            message: 'Forbidden: You can only assign broadcasters to tournaments you manage.',
          });
          return;
        }
        resolvedTournamentId = tour._id as mongoose.Types.ObjectId;
      } else {
        if (!mongoose.Types.ObjectId.isValid(matchId)) {
          res.status(400).json({ message: 'Valid matchId is required for match scope.' });
          return;
        }
        const stream = await LiveStream.findById(matchId).lean();
        if (!stream) {
          res.status(404).json({ message: 'Match not found.' });
          return;
        }
        if (actor.role === 'TOURNAMENT_ORGANIZER') {
          const canTour = stream.tournamentId
            ? await canManageTournament(actor, String(stream.tournamentId))
            : false;
          const isCreator = stream.createdBy && String(stream.createdBy) === String(actor._id);
          if (!canTour && !isCreator) {
            res.status(403).json({
              message: 'Forbidden: You can only assign broadcasters to matches in your managed tournaments.',
            });
            return;
          }
        }
        resolvedMatchId = stream._id as mongoose.Types.ObjectId;
        resolvedTournamentId = (stream.tournamentId as mongoose.Types.ObjectId) || null;
      }

      // Prevent privilege escalation or downgrading higher admin roles
      if (promoteToBroadcaster && ['SPECTATOR', 'CAPTAIN', 'MODERATOR'].includes(targetUser.role)) {
        targetUser.role = 'BROADCASTER';
        targetUser.permissions = {
          manageStreams: true,
          manageScores: false,
          manageTournaments: false,
          manageTeams: false,
          managePlayers: false,
          moderateChat: false,
          manageSponsors: false,
          manageVenues: false,
          declareResults: false,
        };
        await targetUser.save();
      } else if (
        promoteToBroadcaster &&
        targetUser.role === 'SCORER' &&
        req.body.convertScorerToBroadcaster === true
      ) {
        targetUser.role = 'BROADCASTER';
        targetUser.permissions = {
          manageStreams: true,
          manageScores: false,
          manageTournaments: false,
          manageTeams: false,
          managePlayers: false,
          moderateChat: false,
          manageSponsors: false,
          manageVenues: false,
          declareResults: false,
        };
        await targetUser.save();
      }

      const permissions =
        Array.isArray(req.body.permissions) && req.body.permissions.length > 0
          ? req.body.permissions.filter((p: unknown): p is string => typeof p === 'string')
          : [...DEFAULT_BROADCASTER_PERMS];

      // Upsert or reactivate existing assignment for exact scope
      const existingQuery: Record<string, any> = {
        userId: targetUser._id,
        scopeType,
      };
      if (scopeType === 'tournament') existingQuery.tournamentId = resolvedTournamentId;
      else existingQuery.matchId = resolvedMatchId;

      let assignment = await BroadcastAssignment.findOne(existingQuery);
      if (assignment) {
        assignment.status = 'ACTIVE';
        assignment.permissions = permissions;
        assignment.notes = notes;
        assignment.assignedBy = actor._id as mongoose.Types.ObjectId;
        assignment.assignedByName = actor.name;
        assignment.suspendedAt = null;
        assignment.revokedAt = null;
        assignment.revokedBy = null;
        assignment.revokeReason = '';
        await assignment.save();
      } else {
        assignment = await BroadcastAssignment.create({
          userId: targetUser._id,
          role: 'BROADCASTER',
          scopeType,
          tournamentId: resolvedTournamentId,
          matchId: resolvedMatchId,
          status: 'ACTIVE',
          permissions,
          assignedBy: actor._id,
          assignedByName: actor.name,
          notes,
        });
      }

      if (resolvedMatchId) {
        await writeBroadcastAudit({
          matchId: String(resolvedMatchId),
          tournamentId: resolvedTournamentId ? String(resolvedTournamentId) : null,
          actionType: 'BROADCASTER_ASSIGNED',
          actor,
          obsStatus: 'SUCCESS',
          metadata: {
            broadcasterId: String(targetUser._id),
            broadcasterName: targetUser.name,
            scopeType,
          },
        });
      }

      await recordActivity(
        actor,
        'ASSIGN_BROADCASTER',
        'BroadcastAssignment',
        String(assignment._id),
        `Assigned ${targetUser.email} as Broadcaster (${scopeType})`
      );

      res.status(201).json({
        assignment: {
          id: String(assignment._id),
          userId: String(assignment.userId),
          scopeType: assignment.scopeType,
          tournamentId: assignment.tournamentId ? String(assignment.tournamentId) : null,
          matchId: assignment.matchId ? String(assignment.matchId) : null,
          status: assignment.status,
          permissions: assignment.permissions,
          assignedByName: assignment.assignedByName,
          notes: assignment.notes,
        },
      });
    } catch (err) {
      console.error('[Broadcasters] Assign error:', err);
      res.status(500).json({ message: 'Failed to assign broadcaster.' });
    }
  }
);

// PATCH /api/obs/broadcasters/assignments/:id - Suspend, reactivate, or revoke (preserves history)
router.patch(
  '/broadcasters/assignments/:id',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const actor = req.user!;
      if (!['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER'].includes(actor.role)) {
        res.status(403).json({ message: 'Forbidden: Insufficient role permissions.' });
        return;
      }
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ message: 'Invalid assignment ID.' });
        return;
      }

      const assignment = await BroadcastAssignment.findById(id);
      if (!assignment) {
        res.status(404).json({ message: 'Broadcast assignment not found.' });
        return;
      }

      if (actor.role === 'TOURNAMENT_ORGANIZER') {
        let authorized = false;
        if (assignment.tournamentId && (await canManageTournament(actor, String(assignment.tournamentId)))) {
          authorized = true;
        } else if (assignment.matchId) {
          const stream = await LiveStream.findById(assignment.matchId).lean();
          if (stream?.createdBy && String(stream.createdBy) === String(actor._id)) authorized = true;
          else if (stream?.tournamentId && (await canManageTournament(actor, String(stream.tournamentId)))) {
            authorized = true;
          }
        }
        if (!authorized) {
          res.status(403).json({ message: 'Forbidden: Assignment is outside your managed tournaments.' });
          return;
        }
      }

      const nextStatus = req.body.status;
      if (['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(nextStatus)) {
        assignment.status = nextStatus;
        if (nextStatus === 'SUSPENDED') {
          assignment.suspendedAt = new Date();
        } else if (nextStatus === 'REVOKED') {
          assignment.revokedAt = new Date();
          assignment.revokedBy = actor._id as mongoose.Types.ObjectId;
          assignment.revokeReason = sanitizeText(req.body.reason || req.body.revokeReason, 240);
        } else if (nextStatus === 'ACTIVE') {
          assignment.suspendedAt = null;
          assignment.revokedAt = null;
          assignment.revokeReason = '';
        }
      }
      if (Array.isArray(req.body.permissions)) {
        assignment.permissions = req.body.permissions.filter(
          (p: unknown): p is string => typeof p === 'string'
        );
      }
      if (typeof req.body.notes === 'string') {
        assignment.notes = sanitizeText(req.body.notes, 300);
      }
      await assignment.save();

      if (assignment.matchId) {
        await writeBroadcastAudit({
          matchId: String(assignment.matchId),
          tournamentId: assignment.tournamentId ? String(assignment.tournamentId) : null,
          actionType: 'BROADCASTER_STATUS_CHANGED',
          actor,
          obsStatus: 'SUCCESS',
          metadata: {
            assignmentId: String(assignment._id),
            status: assignment.status,
            reason: assignment.revokeReason,
          },
        });
      }

      res.json({
        assignment: {
          id: String(assignment._id),
          status: assignment.status,
          permissions: assignment.permissions,
          notes: assignment.notes,
          suspendedAt: assignment.suspendedAt,
          revokedAt: assignment.revokedAt,
          revokeReason: assignment.revokeReason,
        },
      });
    } catch (err) {
      console.error('[Broadcasters] Update assignment error:', err);
      res.status(500).json({ message: 'Failed to update broadcast assignment.' });
    }
  }
);

// =========================================================================
// PROTECTED BROADCAST STUDIO CONTROL ROUTES (Admin / Broadcaster RBAC)
// =========================================================================

// GET /api/obs/matches/:matchId/studio
router.get(
  '/matches/:matchId/studio',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const stream = await LiveStream.findById(matchId).lean();
      if (!stream) {
        res.status(404).json({ message: 'Match stream not found.' });
        return;
      }

      const [snapshot, sponsors, operators, canOverride, canManageCameras, canManageOverlays, canControlStream, canControlRecord] = await Promise.all([
        getStudioSnapshot(matchId, true),
        Sponsor.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
        User.find({
          isActive: true,
          role: { $in: ['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER', 'BROADCASTER', 'MODERATOR', 'SCORER'] },
        })
          .select('name email role permissions')
          .lean(),
        req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN'
          ? Promise.resolve(true)
          : hasBroadcastAccess(req.user!, matchId, 'broadcast:override'),
        hasBroadcastAccess(req.user!, matchId, 'broadcast:manage_cameras'),
        hasBroadcastAccess(req.user!, matchId, 'broadcast:manage_overlays'),
        hasBroadcastAccess(req.user!, matchId, 'broadcast:stream_control'),
        hasBroadcastAccess(req.user!, matchId, 'broadcast:record_control'),
      ]);

      const baseUrl = resolveBaseAppUrl(req);
      res.json({
        match: {
          id: String(stream._id),
          matchTitle:
            stream.matchTitle ||
            [stream.teamAName, stream.teamBName].filter(Boolean).join(' vs ') ||
            'Untitled Match',
          teamAName: stream.teamAName,
          teamBName: stream.teamBName,
          gameName: stream.gameName,
          tournamentName: stream.tournamentName,
          tournamentId: stream.tournamentId ? String(stream.tournamentId) : null,
          status: stream.status,
          activeStreamingProvider: stream.activeStreamingProvider || stream.streamingProvider || 'youtube',
          youtubeVideoId: stream.youtubeVideoId,
          youtubeStreamStatus: stream.youtubeStreamStatus,
          mediamtxPublishStatus: stream.mediamtxPublishStatus,
          overlayConfig: stream.overlayConfig,
        },
        ...snapshot,
        scoreboardOverlayUrl: `${baseUrl}/broadcast/overlay/view/${matchId}?obs=1&controls=0`,
        sponsors: sponsors.map((sp: any) => ({
          id: String(sp._id),
          name: sp.name,
          logoUrl: sp.logoUrl,
          sponsorshipType: sp.sponsorshipType,
          tagline: sp.tagline,
        })),
        operators: operators.map((op: any) => ({
          id: String(op._id),
          name: op.name,
          email: op.email,
          role: op.role,
        })),
        permissions: {
          canOverride,
          canManageCameras,
          canManageOverlays,
          canControlStream,
          canControlRecord,
        },
      });
    } catch (err) {
      console.error('[OBS Studio] Load error:', err);
      res.status(500).json({ message: 'Failed to load OBS Broadcast Control Studio.' });
    }
  }
);

// PATCH /api/obs/matches/:matchId/profile
router.patch(
  '/matches/:matchId/profile',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const profile = await ensureObsProfileForMatch(matchId, req.user!._id as any);

      if (req.body.connectionMode === 'direct_ws' || req.body.connectionMode === 'local_agent') {
        profile.connectionMode = req.body.connectionMode;
      }
      if (req.body.obsProtocol === 'ws' || req.body.obsProtocol === 'wss') {
        profile.obsProtocol = req.body.obsProtocol;
      }
      if (typeof req.body.obsHost === 'string' && req.body.obsHost.trim()) {
        profile.obsHost = sanitizeText(req.body.obsHost, 200);
      }
      if (req.body.obsPort !== undefined) {
        const portNum = Math.max(1, Math.min(65535, Math.floor(Number(req.body.obsPort) || 4455)));
        profile.obsPort = portNum;
      }
      if (typeof req.body.obsPassword === 'string') {
        if (req.body.obsPassword.length > 0) {
          profile.obsPasswordEnc = encryptObsSecret(req.body.obsPassword);
          profile.hasPassword = true;
        } else if (req.body.clearPassword === true) {
          profile.obsPasswordEnc = '';
          profile.hasPassword = false;
        }
      }
      if (typeof req.body.vdoRoomName === 'string' && req.body.vdoRoomName.trim()) {
        profile.vdoRoomName = sanitizeText(req.body.vdoRoomName, 80).replace(/[^a-zA-Z0-9_-]/g, '_');
      }
      if (typeof req.body.autoSyncScoreboardSource === 'boolean') {
        profile.autoSyncScoreboardSource = req.body.autoSyncScoreboardSource;
      }
      if (typeof req.body.scoreboardSourceName === 'string' && req.body.scoreboardSourceName.trim()) {
        profile.scoreboardSourceName = sanitizeText(req.body.scoreboardSourceName, 120);
      }
      if (Array.isArray(req.body.selectedSponsorIds)) {
        profile.selectedSponsorIds = req.body.selectedSponsorIds
          .filter((s: unknown): s is string => typeof s === 'string')
          .slice(0, 20);
      }
      profile.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await profile.save();

      await emitFullStudioState(matchId);
      res.json({ profile: formatSafeProfile(profile) });
    } catch (err) {
      console.error('[OBS Studio] Profile update error:', err);
      res.status(500).json({ message: 'Failed to update OBS connection settings.' });
    }
  }
);

// POST /api/obs/matches/:matchId/agent-token
router.post(
  '/matches/:matchId/agent-token',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const profile = await ensureObsProfileForMatch(matchId, req.user!._id as any);
      const tokenPair = generateScopedToken('mlobs');
      profile.agentTokenHash = tokenPair.hash;
      profile.agentTokenPrefix = tokenPair.displayPrefix;
      profile.connectionMode = 'local_agent';
      profile.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await profile.save();

      const baseUrl = resolveBaseAppUrl(req);
      await emitFullStudioState(matchId);

      res.json({
        agentToken: tokenPair.raw,
        agentTokenPrefix: tokenPair.displayPrefix,
        command: `node deploy/obs-agent/maidanlive-obs-agent.mjs --server ${baseUrl} --match ${matchId} --token ${tokenPair.raw}`,
        profile: formatSafeProfile(profile),
      });
    } catch (err) {
      console.error('[OBS Studio] Agent token error:', err);
      res.status(500).json({ message: 'Failed to generate Local OBS Agent token.' });
    }
  }
);

// POST /api/obs/matches/:matchId/test-connection
router.post(
  '/matches/:matchId/test-connection',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      await ensureObsProfileForMatch(matchId, req.user!._id as any);
      const result = await testObsConnection(matchId, {
        obsProtocol: req.body.obsProtocol,
        obsHost: req.body.obsHost,
        obsPort: req.body.obsPort,
        obsPassword: req.body.obsPassword,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err?.message || 'OBS connection test failed.' });
    }
  }
);

// POST /api/obs/matches/:matchId/connect
router.post(
  '/matches/:matchId/connect',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const profile = await ensureObsProfileForMatch(matchId, req.user!._id as any);
      if (profile.connectionMode === 'local_agent' && req.body.mode !== 'direct_ws') {
        const snapshot = await refreshObsState(matchId);
        res.json({ ok: true, profile: formatSafeProfile(profile), snapshot });
        return;
      }

      const result = await connectDirectObs(matchId, req.user!);
      if (!result.ok) {
        res.status(502).json({
          ok: false,
          message: result.error || 'Could not connect to OBS WebSocket.',
          profile: result.profile,
        });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ ok: false, message: err?.message || 'Failed to connect to OBS Studio.' });
    }
  }
);

// POST /api/obs/matches/:matchId/disconnect
router.post(
  '/matches/:matchId/disconnect',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;
      const profile = await disconnectObs(matchId, req.user!);
      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || 'Failed to disconnect OBS.' });
    }
  }
);

// POST /api/obs/matches/:matchId/refresh
router.post(
  '/matches/:matchId/refresh',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;
      const data = await refreshObsState(matchId);
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, data, ...snapshot });
    } catch (err: any) {
      res.status(503).json({ ok: false, message: err?.message || 'OBS Studio is not connected.' });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras - Add new dynamic camera (no limit)
router.post(
  '/matches/:matchId/cameras',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const stream = await LiveStream.findById(matchId).lean();
      if (!stream) {
        res.status(404).json({ message: 'Match stream not found.' });
        return;
      }

      const profile = await ensureObsProfileForMatch(matchId, req.user!._id as any);
      const existingCameras = await BroadcastCamera.find({ matchId }).sort({ cameraNumber: 1 }).lean();
      const maxNum = existingCameras.reduce((acc, c) => Math.max(acc, Number(c.cameraNumber) || 0), 0);
      const nextNum = Number(req.body.cameraNumber) > 0 ? Math.floor(Number(req.body.cameraNumber)) : maxNum + 1;
      const pad = String(nextNum).padStart(2, '0');

      const requestedCamId = sanitizeText(req.body.cameraId, 60).replace(/[^a-zA-Z0-9_-]/g, '_');
      const cameraId = requestedCamId || `maidanlive_cam_${pad}`;
      const duplicate = existingCameras.some((c) => c.cameraId === cameraId);
      const finalCameraId = duplicate ? `${cameraId}_${Date.now().toString(36).slice(-4)}` : cameraId;

      const cameraType: CameraType = VALID_CAMERA_TYPES.includes(req.body.cameraType)
        ? req.body.cameraType
        : 'smartphone_vdo';
      const sourceType: CameraSourceType = VALID_SOURCE_TYPES.includes(req.body.sourceType)
        ? req.body.sourceType
        : cameraType === 'smartphone_vdo'
          ? 'vdoninja'
          : cameraType === 'rtmp_mediamtx'
            ? 'mediamtx'
            : cameraType === 'browser_source'
              ? 'browser_source'
              : 'obs_input';

      const pushToken = generateScopedToken('mlcam');
      const expiresInHours = Math.max(1, Math.min(72, Number(req.body.expiresInHours) || 12));
      const pushTokenExpiresAt = new Date(Date.now() + expiresInHours * 3600_000);
      const vdoStreamId = sanitizeText(req.body.vdoStreamId, 80) || `${finalCameraId}_${matchId.slice(-4)}`;
      const vdoRoomName = sanitizeText(req.body.vdoRoomName, 80) || profile.vdoRoomName;

      let operatorName = sanitizeText(req.body.operatorName, 120);
      let operatorUserId: mongoose.Types.ObjectId | null = null;
      if (req.body.operatorUserId && mongoose.Types.ObjectId.isValid(req.body.operatorUserId)) {
        const op = await User.findById(req.body.operatorUserId).lean();
        if (op) {
          operatorUserId = op._id as mongoose.Types.ObjectId;
          if (!operatorName) operatorName = op.name;
        }
      }

      const cam = await BroadcastCamera.create({
        matchId,
        tournamentId: stream.tournamentId || null,
        cameraId: finalCameraId,
        name: sanitizeText(req.body.name, 100) || `Camera ${nextNum}`,
        label: sanitizeText(req.body.label, 120) || `Angle ${nextNum}`,
        cameraNumber: nextNum,
        position: sanitizeText(req.body.position, 120),
        cameraType,
        sourceType,
        connectionUrl: sanitizeText(req.body.connectionUrl, 600),
        vdoRoomName,
        vdoStreamId,
        pushTokenHash: pushToken.hash,
        pushTokenPrefix: pushToken.displayPrefix,
        pushTokenExpiresAt,
        broadcastSessionId: profile.broadcastSessionId || '',
        resolution: VALID_RESOLUTIONS.includes(req.body.resolution) ? req.body.resolution : '1280x720',
        fps: Math.max(15, Math.min(60, Number(req.body.fps) || 30)),
        bitrateKbps: Math.max(300, Math.min(12000, Number(req.body.bitrateKbps) || 2000)),
        lowBandwidthMode: Boolean(req.body.lowBandwidthMode),
        facingMode: req.body.facingMode === 'user' ? 'user' : 'environment',
        obsSceneName: sanitizeText(req.body.obsSceneName, 120) || `CAM ${nextNum} FULL`,
        obsInputName: sanitizeText(req.body.obsInputName, 120) || `ML_CAM_${nextNum}`,
        description: sanitizeText(req.body.description, 400),
        status: 'DISCONNECTED',
        priority: Number(req.body.priority) || nextNum * 10,
        isDefault: existingCameras.length === 0 ? true : Boolean(req.body.isDefault),
        enabled: req.body.enabled !== false,
        sortOrder: existingCameras.length + 1,
        operatorUserId,
        operatorName,
        createdBy: req.user!._id,
      });

      if (cam.isDefault && existingCameras.length > 0) {
        await BroadcastCamera.updateMany(
          { matchId, _id: { $ne: cam._id } },
          { $set: { isDefault: false } }
        );
      }

      await writeBroadcastAudit({
        matchId,
        actionType: 'CAMERA_CREATED',
        cameraId: cam.cameraId,
        cameraName: cam.name,
        actor: req.user!,
        obsStatus: 'SUCCESS',
      });
      await emitFullStudioState(matchId);

      const baseUrl = resolveBaseAppUrl(req);
      res.status(201).json({
        camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
        mobileConnectUrl: `${baseUrl}/camera-connect/${cam._id.toString()}?token=${pushToken.raw}`,
        pushToken: pushToken.raw,
        pushTokenExpiresAt: pushTokenExpiresAt.toISOString(),
        broadcastSessionId: profile.broadcastSessionId || '',
      });
    } catch (err: any) {
      console.error('[OBS Camera] Create error:', err);
      res.status(500).json({ message: err?.message || 'Failed to create camera.' });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras/scaffold - Quickly create N unconfigured dynamic cameras
router.post(
  '/matches/:matchId/cameras/scaffold',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const count = Math.max(1, Math.min(20, Math.floor(Number(req.body.count) || 4)));
      const stream = await LiveStream.findById(matchId).lean();
      if (!stream) {
        res.status(404).json({ message: 'Match stream not found.' });
        return;
      }

      const profile = await ensureObsProfileForMatch(matchId, req.user!._id as any);
      const existing = await BroadcastCamera.find({ matchId }).sort({ cameraNumber: 1 }).lean();
      const startNum = existing.reduce((acc, c) => Math.max(acc, Number(c.cameraNumber) || 0), 0) + 1;

      const defaultLabels = [
        'Main Ground Camera',
        'Bowler End',
        'Boundary Camera',
        'Side Camera',
        'Player Close-Up',
        'Crowd Camera',
        'Pavilion Camera',
        'Scoreboard / Dugout Cam',
      ];

      const created: any[] = [];
      const baseUrl = resolveBaseAppUrl(req);
      const expiresInHours = Math.max(1, Math.min(72, Number(req.body.expiresInHours) || 12));
      const pushTokenExpiresAt = new Date(Date.now() + expiresInHours * 3600_000);

      for (let i = 0; i < count; i += 1) {
        const num = startNum + i;
        const pad = String(num).padStart(2, '0');
        const camId = `maidanlive_cam_${pad}_${Date.now().toString(36).slice(-2)}${i}`;
        const pushToken = generateScopedToken('mlcam');
        const label = defaultLabels[num - 1] || `Mobile Camera ${num}`;
        const doc = await BroadcastCamera.create({
          matchId,
          tournamentId: stream.tournamentId || null,
          cameraId: camId,
          name: `Camera ${num}`,
          label,
          cameraNumber: num,
          position: label,
          cameraType: 'smartphone_vdo',
          sourceType: 'vdoninja',
          vdoRoomName: profile.vdoRoomName,
          vdoStreamId: `cam${num}_${matchId.slice(-4)}`,
          pushTokenHash: pushToken.hash,
          pushTokenPrefix: pushToken.displayPrefix,
          pushTokenExpiresAt,
          broadcastSessionId: profile.broadcastSessionId || '',
          resolution: '1280x720',
          fps: 30,
          bitrateKbps: 2000,
          facingMode: 'environment',
          obsSceneName: `CAM ${num} FULL`,
          obsInputName: `ML_CAM_${num}`,
          status: 'DISCONNECTED',
          priority: num * 10,
          isDefault: existing.length === 0 && i === 0,
          enabled: true,
          sortOrder: existing.length + i + 1,
          createdBy: req.user!._id,
        });
        created.push({
          ...formatSafeCamera(doc.toObject(), profile, { includePrivateUrls: true }),
          mobileConnectUrl: `${baseUrl}/camera-connect/${doc._id.toString()}?token=${pushToken.raw}`,
          pushTokenExpiresAt: pushTokenExpiresAt.toISOString(),
          broadcastSessionId: profile.broadcastSessionId || '',
        });
      }

      await emitFullStudioState(matchId);
      res.status(201).json({ created });
    } catch (err) {
      console.error('[OBS Camera] Scaffold error:', err);
      res.status(500).json({ message: 'Failed to create cameras.' });
    }
  }
);

// PATCH /api/obs/matches/:matchId/cameras/reorder
router.patch(
  '/matches/:matchId/cameras/reorder',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
      for (let i = 0; i < orderedIds.length; i += 1) {
        const id = String(orderedIds[i] || '');
        if (!id) continue;
        await BroadcastCamera.findOneAndUpdate(
          { matchId, $or: [{ cameraId: id }, { _id: mongoose.Types.ObjectId.isValid(id) ? id : undefined }] },
          { $set: { sortOrder: i + 1 } }
        ).catch(() => {});
      }
      await emitFullStudioState(matchId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: 'Failed to reorder cameras.' });
    }
  }
);

// PATCH /api/obs/matches/:matchId/cameras/:cameraId
router.patch(
  '/matches/:matchId/cameras/:cameraId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const cam = await BroadcastCamera.findOne({ matchId, cameraId });
      if (!cam) {
        res.status(404).json({ message: 'Camera not found.' });
        return;
      }

      if (typeof req.body.name === 'string' && req.body.name.trim()) cam.name = sanitizeText(req.body.name, 100);
      if (typeof req.body.label === 'string') cam.label = sanitizeText(req.body.label, 120);
      if (req.body.cameraNumber !== undefined) cam.cameraNumber = Math.max(1, Number(req.body.cameraNumber) || cam.cameraNumber);
      if (typeof req.body.position === 'string') cam.position = sanitizeText(req.body.position, 120);
      if (VALID_CAMERA_TYPES.includes(req.body.cameraType)) cam.cameraType = req.body.cameraType;
      if (VALID_SOURCE_TYPES.includes(req.body.sourceType)) cam.sourceType = req.body.sourceType;
      if (typeof req.body.connectionUrl === 'string') cam.connectionUrl = sanitizeText(req.body.connectionUrl, 600);
      if (typeof req.body.vdoRoomName === 'string' && req.body.vdoRoomName.trim()) cam.vdoRoomName = sanitizeText(req.body.vdoRoomName, 100);
      if (typeof req.body.vdoStreamId === 'string' && req.body.vdoStreamId.trim()) cam.vdoStreamId = sanitizeText(req.body.vdoStreamId, 100);
      if (VALID_RESOLUTIONS.includes(req.body.resolution)) cam.resolution = req.body.resolution;
      if (req.body.fps !== undefined) cam.fps = Math.max(15, Math.min(60, Number(req.body.fps) || 30));
      if (req.body.bitrateKbps !== undefined) cam.bitrateKbps = Math.max(300, Math.min(12000, Number(req.body.bitrateKbps) || 2000));
      if (typeof req.body.lowBandwidthMode === 'boolean') cam.lowBandwidthMode = req.body.lowBandwidthMode;
      if (req.body.facingMode === 'user' || req.body.facingMode === 'environment') cam.facingMode = req.body.facingMode;
      if (typeof req.body.obsSceneName === 'string') cam.obsSceneName = sanitizeText(req.body.obsSceneName, 120);
      if (typeof req.body.obsInputName === 'string') cam.obsInputName = sanitizeText(req.body.obsInputName, 120);
      if (typeof req.body.description === 'string') cam.description = sanitizeText(req.body.description, 400);
      if (req.body.priority !== undefined) cam.priority = Math.max(1, Math.min(1000, Number(req.body.priority) || 10));
      if (typeof req.body.enabled === 'boolean') cam.enabled = req.body.enabled;
      if (req.body.operatorUserId !== undefined) {
        if (req.body.operatorUserId && mongoose.Types.ObjectId.isValid(req.body.operatorUserId)) {
          const op = await User.findById(req.body.operatorUserId).lean();
          cam.operatorUserId = op ? (op._id as mongoose.Types.ObjectId) : null;
          cam.operatorName = op?.name || sanitizeText(req.body.operatorName, 120);
        } else {
          cam.operatorUserId = null;
          cam.operatorName = sanitizeText(req.body.operatorName, 120);
        }
      } else if (typeof req.body.operatorName === 'string') {
        cam.operatorName = sanitizeText(req.body.operatorName, 120);
      }

      if (typeof req.body.isDefault === 'boolean') {
        cam.isDefault = req.body.isDefault;
        if (cam.isDefault) {
          await BroadcastCamera.updateMany(
            { matchId, _id: { $ne: cam._id } },
            { $set: { isDefault: false } }
          );
        }
      }

      await cam.save();
      await writeBroadcastAudit({
        matchId,
        actionType: 'CAMERA_UPDATED',
        cameraId: cam.cameraId,
        cameraName: cam.name,
        actor: req.user!,
        obsStatus: 'SUCCESS',
      });
      await emitFullStudioState(matchId);

      const profile = await ObsControllerProfile.findOne({ matchId }).lean();
      res.json({
        camera: formatSafeCamera(cam.toObject(), profile, { includePrivateUrls: true }),
      });
    } catch (err) {
      console.error('[OBS Camera] Update error:', err);
      res.status(500).json({ message: 'Failed to update camera.' });
    }
  }
);

// DELETE /api/obs/matches/:matchId/cameras/:cameraId
router.delete(
  '/matches/:matchId/cameras/:cameraId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const cam = await BroadcastCamera.findOne({ matchId, cameraId });
      if (!cam) {
        res.status(404).json({ message: 'Camera not found.' });
        return;
      }
      await BroadcastCamera.deleteOne({ _id: cam._id });
      await writeBroadcastAudit({
        matchId,
        actionType: 'CAMERA_DELETED',
        cameraId: cam.cameraId,
        cameraName: cam.name,
        actor: req.user!,
        obsStatus: 'SUCCESS',
      });
      await emitFullStudioState(matchId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: 'Failed to remove camera.' });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras/:cameraId/rotate-token
router.post(
  '/matches/:matchId/cameras/:cameraId/rotate-token',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const cam = await BroadcastCamera.findOne({ matchId, cameraId });
      if (!cam) {
        res.status(404).json({ message: 'Camera not found.' });
        return;
      }
      const profile = await ObsControllerProfile.findOne({ matchId }).lean();
      const nextToken = generateScopedToken('mlcam');
      const expiresInHours = Math.max(1, Math.min(72, Number(req.body.expiresInHours) || 12));
      const pushTokenExpiresAt = new Date(Date.now() + expiresInHours * 3600_000);
      cam.pushTokenHash = nextToken.hash;
      cam.pushTokenPrefix = nextToken.displayPrefix;
      cam.pushTokenExpiresAt = pushTokenExpiresAt;
      cam.broadcastSessionId = profile?.broadcastSessionId || cam.broadcastSessionId || '';
      await cam.save();

      const baseUrl = resolveBaseAppUrl(req);
      const mobileConnectUrl = `${baseUrl}/camera-connect/${cam._id.toString()}?token=${nextToken.raw}`;
      await emitFullStudioState(matchId);
      res.json({
        pushToken: nextToken.raw,
        pushTokenPrefix: nextToken.displayPrefix,
        pushTokenExpiresAt: pushTokenExpiresAt.toISOString(),
        broadcastSessionId: cam.broadcastSessionId || '',
        mobileConnectUrl,
      });
    } catch {
      res.status(500).json({ message: 'Failed to rotate camera connection link.' });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras/:cameraId/test
router.post(
  '/matches/:matchId/cameras/:cameraId/test',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const cam = await BroadcastCamera.findOne({ matchId, cameraId });
      if (!cam) {
        res.status(404).json({ message: 'Camera not found.' });
        return;
      }
      const profile = await ObsControllerProfile.findOne({ matchId }).lean();
      const safeProfile = formatSafeProfile(profile);

      let ok = false;
      let detail = '';

      if (cam.sourceType === 'mediamtx' && cam.connectionUrl) {
        const mtx = await verifyMediaMTXStreamHealth({
          streamPath: cam.connectionUrl,
          hlsPlaybackUrl: cam.connectionUrl,
          webrtcPlaybackUrl: '',
        });
        ok = mtx.ok;
        detail = mtx.message;
      } else if (cam.lastHeartbeatAt && Date.now() - new Date(cam.lastHeartbeatAt).getTime() <= 45_000) {
        ok = cam.status !== 'ERROR';
        detail = ok
          ? `Smartphone companion active (heartbeat ${Math.round((Date.now() - new Date(cam.lastHeartbeatAt).getTime()) / 1000)}s ago).`
          : cam.lastError || 'Camera companion reported an error.';
      } else if (
        safeProfile?.connectionStatus === 'CONNECTED' &&
        cam.obsSceneName &&
        safeProfile.obsScenes.includes(cam.obsSceneName)
      ) {
        ok = true;
        detail = `Scene "${cam.obsSceneName}" verified in connected OBS Studio.`;
      } else {
        ok = false;
        detail =
          cam.sourceType === 'vdoninja'
            ? 'No active camera companion heartbeat detected yet. Open the mobile camera setup link on the phone or verify the Browser Source inside OBS.'
            : 'Camera source is not currently reporting an active feed.';
      }

      await writeBroadcastAudit({
        matchId,
        actionType: 'CAMERA_TEST',
        cameraId: cam.cameraId,
        cameraName: cam.name,
        actor: req.user!,
        obsStatus: ok ? 'SUCCESS' : 'FAILED',
        errorDetails: ok ? '' : detail,
      });

      res.json({
        ok,
        status: cam.status,
        detail,
        checkedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, detail: err?.message || 'Camera test failed.' });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras/:cameraId/switch
router.post(
  '/matches/:matchId/cameras/:cameraId/switch',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const result = await switchCameraLive(matchId, cameraId, req.user!, {
        override: Boolean(req.body.override),
        baseAppUrl: resolveBaseAppUrl(req),
      });
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, ...result, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 503;
      res.status(code).json({ ok: false, message: err?.message || 'Failed to switch OBS camera.' });
    }
  }
);

// POST /api/obs/matches/:matchId/layouts/apply
router.post(
  '/matches/:matchId/layouts/apply',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const layoutType: ObsLayoutType = VALID_LAYOUTS.includes(req.body.layoutType)
        ? req.body.layoutType
        : 'DYNAMIC_GRID';
      const cameraIds = Array.isArray(req.body.cameraIds)
        ? req.body.cameraIds.filter((s: unknown): s is string => typeof s === 'string')
        : [];

      const result = await applyDynamicLayoutToObs(
        matchId,
        {
          layoutType,
          cameraIds,
          mainCameraId: typeof req.body.mainCameraId === 'string' ? req.body.mainCameraId : undefined,
          sceneName: typeof req.body.sceneName === 'string' ? sanitizeText(req.body.sceneName, 120) : undefined,
          includeScoreboardOverlay: req.body.includeScoreboardOverlay !== false,
          override: Boolean(req.body.override),
          baseAppUrl: resolveBaseAppUrl(req),
        },
        req.user!
      );

      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, ...result, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 503;
      res.status(code).json({
        ok: false,
        message: err?.message || 'Failed to apply multi-camera layout in OBS Studio.',
      });
    }
  }
);

// POST /api/obs/matches/:matchId/scenes
router.post(
  '/matches/:matchId/scenes',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;

      const name = sanitizeText(req.body.name, 100);
      const obsSceneName = sanitizeText(req.body.obsSceneName, 120) || name;
      if (!name || !obsSceneName) {
        res.status(400).json({ message: 'Scene name and OBS scene name are required.' });
        return;
      }

      const existingCount = await BroadcastScene.countDocuments({ matchId });
      const scene = await BroadcastScene.create({
        matchId,
        name,
        label: sanitizeText(req.body.label, 120) || name,
        obsSceneName,
        layoutType: VALID_LAYOUTS.includes(req.body.layoutType) ? req.body.layoutType : 'SINGLE',
        cameraIds: Array.isArray(req.body.cameraIds)
          ? req.body.cameraIds.filter((s: unknown): s is string => typeof s === 'string')
          : [],
        mainCameraId: sanitizeText(req.body.mainCameraId, 80),
        includeScoreboardOverlay: req.body.includeScoreboardOverlay !== false,
        overlayMode: ['full', 'compact', 'score_only', 'hidden'].includes(req.body.overlayMode)
          ? req.body.overlayMode
          : 'full',
        isDefault: Boolean(req.body.isDefault),
        enabled: true,
        sortOrder: existingCount + 1,
        createdBy: req.user!._id,
      });

      await emitFullStudioState(matchId);
      res.status(201).json({ scene: formatSafeScene(scene.toObject()) });
    } catch {
      res.status(500).json({ message: 'Failed to save broadcast scene.' });
    }
  }
);

// DELETE /api/obs/matches/:matchId/scenes/:sceneId
router.delete(
  '/matches/:matchId/scenes/:sceneId',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, sceneId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;
      if (!mongoose.Types.ObjectId.isValid(sceneId)) {
        res.status(400).json({ message: 'Invalid scene ID.' });
        return;
      }
      await BroadcastScene.deleteOne({ _id: sceneId, matchId });
      await emitFullStudioState(matchId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ message: 'Failed to delete scene.' });
    }
  }
);

// POST /api/obs/matches/:matchId/scenes/switch
router.post(
  '/matches/:matchId/scenes/switch',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const sceneName = sanitizeText(req.body.sceneName, 120);
      if (!sceneName) {
        res.status(400).json({ message: 'sceneName is required.' });
        return;
      }

      const result = await switchObsSceneByName(matchId, sceneName, req.user!, {
        override: Boolean(req.body.override),
      });
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, ...result, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 503;
      res.status(code).json({ ok: false, message: err?.message || 'Failed to switch OBS scene.' });
    }
  }
);

// POST /api/obs/matches/:matchId/override
router.post(
  '/matches/:matchId/override',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:override'))) return;

      const locked = Boolean(req.body.locked);
      const reason = sanitizeText(req.body.reason, 240);

      const profile = await ensureObsProfileForMatch(matchId, req.user!._id as any);
      profile.adminOverrideLocked = locked;
      profile.adminOverrideByUserId = locked ? (req.user!._id as mongoose.Types.ObjectId) : null;
      profile.adminOverrideByName = locked ? req.user!.name : '';
      profile.adminOverrideReason = locked ? reason || 'Manual admin production takeover' : '';
      profile.adminOverrideLockedAt = locked ? new Date() : null;
      profile.updatedBy = req.user!._id as mongoose.Types.ObjectId;
      await profile.save();

      await writeBroadcastAudit({
        matchId,
        actionType: locked ? 'ADMIN_OVERRIDE_ON' : 'ADMIN_OVERRIDE_OFF',
        actor: req.user!,
        adminOverride: locked,
        obsStatus: 'SUCCESS',
        metadata: { reason: profile.adminOverrideReason },
      });

      emitBroadcastStudioEvent(matchId, 'obs:admin_override', {
        matchId,
        adminOverrideLocked: locked,
        adminOverrideByName: profile.adminOverrideByName,
        adminOverrideReason: profile.adminOverrideReason,
      });
      await emitFullStudioState(matchId);

      res.json({ ok: true, profile: formatSafeProfile(profile) });
    } catch (err) {
      console.error('[OBS Override] Error:', err);
      res.status(500).json({ message: 'Failed to update Admin Override state.' });
    }
  }
);

// POST /api/obs/matches/:matchId/preview
router.post(
  '/matches/:matchId/preview',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const sourceName = sanitizeText(req.body.sourceName, 140);
      if (!sourceName) {
        res.status(400).json({ message: 'sourceName is required for OBS preview snapshot.' });
        return;
      }

      const imageData = await captureObsPreviewImage(matchId, sourceName);
      res.json({ ok: true, sourceName, imageData });
    } catch (err: any) {
      res.status(503).json({
        ok: false,
        message: err?.message || 'Unable to capture live OBS screenshot for this source.',
      });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras/:cameraId/disconnect
router.post(
  '/matches/:matchId/cameras/:cameraId/disconnect',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId, 'broadcast:manage_cameras'))) return;
      const camera = await disconnectCameraByOperator(matchId, cameraId, req.user!);
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, camera, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ ok: false, message: err?.message || 'Failed to disconnect camera.' });
    }
  }
);

// POST /api/obs/matches/:matchId/cameras/:cameraId/audio
router.post(
  '/matches/:matchId/cameras/:cameraId/audio',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId, cameraId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;
      const muted = Boolean(req.body.muted);
      const result = await setCameraObsAudioMute(
        matchId,
        cameraId,
        muted,
        req.user!,
        Boolean(req.body.override)
      );
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, ...result, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ ok: false, message: err?.message || 'Failed to toggle camera audio.' });
    }
  }
);

// POST /api/obs/matches/:matchId/obs-action
router.post(
  '/matches/:matchId/obs-action',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      const action = req.body.action;
      if (!['start_stream', 'stop_stream', 'start_record', 'stop_record'].includes(action)) {
        res.status(400).json({ message: 'Invalid OBS action requested.' });
        return;
      }
      const perm: BroadcastAccessPermission =
        action === 'start_stream' || action === 'stop_stream'
          ? 'broadcast:stream_control'
          : 'broadcast:record_control';
      if (!(await authorizeBroadcastControl(req, res, matchId, perm))) return;

      const out = await controlObsOutput(matchId, action, req.user!, Boolean(req.body.override));
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, ...out, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 503;
      res.status(code).json({ ok: false, message: err?.message || 'OBS output command failed.' });
    }
  }
);

// POST /api/obs/matches/:matchId/session
router.post(
  '/matches/:matchId/session',
  authenticate,
  requireAdminPortal,
  broadcastCommandLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;
      const mode = req.body.mode;
      if (!['start', 'end', 'takeover'].includes(mode)) {
        res.status(400).json({ message: 'mode must be start, end, or takeover.' });
        return;
      }
      await manageBroadcastSession(matchId, mode, req.user!);
      const snapshot = await getStudioSnapshot(matchId, true);
      res.json({ ok: true, ...snapshot });
    } catch (err: any) {
      const code = Number(err?.statusCode) || 500;
      res.status(code).json({ ok: false, message: err?.message || 'Failed to update broadcast session.' });
    }
  }
);

// GET /api/obs/matches/:matchId/audit-logs
router.get(
  '/matches/:matchId/audit-logs',
  authenticate,
  requireAdminPortal,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { matchId } = req.params;
      if (!(await authorizeBroadcastControl(req, res, matchId))) return;

      const query: Record<string, unknown> = { matchId };
      if (typeof req.query.actionType === 'string' && req.query.actionType.trim()) {
        query.actionType = req.query.actionType.trim();
      }

      const logs = await BroadcastAuditLog.find(query).sort({ timestamp: -1 }).limit(120).lean();
      res.json({ logs: logs.map(formatAuditLog) });
    } catch {
      res.status(500).json({ message: 'Failed to load broadcast audit logs.' });
    }
  }
);

export default router;
