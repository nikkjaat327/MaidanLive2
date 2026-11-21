import { Router } from 'express';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  authenticate,
  canManageStream,
  hasGranularPermission,
  requireAdminPortal,
} from '../middleware/auth.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';
import { LiveStream } from '../models/LiveStream.ts';
import { Sponsor } from '../models/Sponsor.ts';
import { User } from '../models/User.ts';
import { ObsControllerProfile } from '../models/ObsControllerProfile.ts';
import { BroadcastCamera } from '../models/BroadcastCamera.ts';
import type { CameraSourceType, CameraType } from '../models/BroadcastCamera.ts';
import { BroadcastScene } from '../models/BroadcastScene.ts';
import { BroadcastAuditLog } from '../models/BroadcastAuditLog.ts';
import {
  applyDynamicLayoutToObs,
  captureObsPreviewImage,
  connectDirectObs,
  disconnectObs,
  emitFullStudioState,
  ensureObsProfileForMatch,
  formatAuditLog,
  formatSafeCamera,
  formatSafeProfile,
  formatSafeScene,
  getStudioSnapshot,
  refreshObsState,
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
import { emitBroadcastStudioEvent } from '../socket/index.ts';
import { verifyMediaMTXStreamHealth } from '../services/mediamtxService.ts';

const router = Router();

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
  requiredPerm: 'broadcast:control' | 'broadcast:manage_cameras' | 'broadcast:override' = 'broadcast:control'
): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(matchId)) {
    res.status(400).json({ message: 'Invalid match ID.' });
    return false;
  }
  const user = req.user!;
  if (user.role === 'SUPER_ADMIN') return true;
  if (requiredPerm === 'broadcast:override') {
    const canOverride =
      user.role === 'ADMIN' ||
      (await hasGranularPermission(user, 'broadcast:override', {
        scopeType: 'match',
        scopeId: matchId,
      }));
    if (!canOverride) {
      res.status(403).json({
        message: 'Forbidden: Admin Override permission is required for this action.',
      });
      return false;
    }
    return true;
  }

  const [canStream, hasPerm] = await Promise.all([
    canManageStream(user, matchId, 'stream'),
    hasGranularPermission(user, requiredPerm, { scopeType: 'match', scopeId: matchId }),
  ]);

  if (!canStream && !hasPerm) {
    res.status(403).json({
      message: 'Forbidden: You are not authorized to control OBS broadcast production for this match.',
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
        audioMuted:
          typeof req.body.telemetry.audioMuted === 'boolean'
            ? req.body.telemetry.audioMuted
            : false,
      };
    }
    await cam.save();

    emitBroadcastStudioEvent(String(cam.matchId), 'obs:camera_status', {
      matchId: String(cam.matchId),
      cameraId: cam.cameraId,
      status: cam.status,
      lastHeartbeatAt: cam.lastHeartbeatAt,
      telemetry: cam.telemetry,
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

      const [snapshot, sponsors, operators] = await Promise.all([
        getStudioSnapshot(matchId, true),
        Sponsor.find({ isActive: true }).sort({ createdAt: -1 }).lean(),
        User.find({
          isActive: true,
          role: { $in: ['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER', 'MODERATOR', 'SCORER'] },
        })
          .select('name email role permissions')
          .lean(),
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
          canOverride:
            req.user!.role === 'SUPER_ADMIN' ||
            req.user!.role === 'ADMIN' ||
            (await hasGranularPermission(req.user!, 'broadcast:override', {
              scopeType: 'match',
              scopeId: matchId,
            })),
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
      const nextToken = generateScopedToken('mlcam');
      cam.pushTokenHash = nextToken.hash;
      cam.pushTokenPrefix = nextToken.displayPrefix;
      await cam.save();

      const baseUrl = resolveBaseAppUrl(req);
      const mobileConnectUrl = `${baseUrl}/camera-connect/${cam._id.toString()}?token=${nextToken.raw}`;
      await emitFullStudioState(matchId);
      res.json({
        pushToken: nextToken.raw,
        pushTokenPrefix: nextToken.displayPrefix,
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
