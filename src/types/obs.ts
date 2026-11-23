import type { ObsLayoutType, PipPosition, PipSize } from '../utils/obsLayoutGeometry.ts';
import type { BroadcastOverlayConfig, BroadcastPhase, StreamingProvider, StreamStatus } from './index.ts';
import type { OverlayMode, OverlayPosition } from '../utils/overlayConfig.ts';
import type {
  CameraOrientationMode,
  CameraPreviewFit,
  ObsSceneTransformItem,
} from '../utils/obsTransformGeometry.ts';

export type { CameraOrientationMode, CameraPreviewFit, ObsSceneTransformItem };

export type ObsConnectionMode = 'direct_ws' | 'local_agent';
export type ObsConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface ObsDiscoveredInput {
  inputName: string;
  inputKind: string;
  unversionedInputKind?: string;
}

export type CameraType =
  | 'smartphone_vdo'
  | 'rtmp_mediamtx'
  | 'ip_camera'
  | 'usb_capture'
  | 'browser_source'
  | 'obs_scene_only';

export type CameraSourceType =
  | 'vdoninja'
  | 'browser_source'
  | 'mediamtx'
  | 'obs_input'
  | 'rtsp_ffmpeg';

export type CameraConnectionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'ACTIVE'
  | 'ERROR'
  | 'NOT_CONFIGURED';

export interface ObsLiveStats {
  cpuUsage: number;
  activeFps: number;
  outputSkippedFrames: number;
  outputTotalFrames: number;
  averageFrameRenderTime: number;
  memoryUsageMb?: number;
}

export interface ObsControllerProfileData {
  id: string;
  matchId: string;
  tournamentId?: string | null;
  connectionMode: ObsConnectionMode;
  obsProtocol: 'ws' | 'wss';
  obsHost: string;
  obsPort: number;
  hasPassword: boolean;
  hasAgentToken: boolean;
  agentTokenPrefix: string;
  agentOnline: boolean;
  agentLastSeenAt?: string | null;
  agentLabel: string;
  connectionStatus: ObsConnectionStatus;
  lastError: string;
  obsVersion: string;
  obsWebSocketVersion: string;
  activeObsScene: string;
  activeCameraId: string;
  activeCameraIds?: string[];
  activeLayoutType: ObsLayoutType;
  activePipPosition?: PipPosition;
  activePipSize?: PipSize;
  activeSceneId: string;
  obsScenes: string[];
  obsInputs?: ObsDiscoveredInput[];
  sceneLabels?: Record<string, string>;
  obsStreamActive: boolean;
  obsStreamTimecode: string;
  obsStreamBytes?: number | null;
  obsStreamDurationMs?: number | null;
  obsRecordActive?: boolean;
  obsRecordTimecode?: string;
  obsStats?: ObsLiveStats | null;
  broadcastSessionId?: string;
  broadcastSessionStartedAt?: string | null;
  activeControllerUserId?: string | null;
  activeControllerName?: string;
  activeControllerRole?: string;
  activeControllerSince?: string | null;
  vdoRoomName: string;
  adminOverrideLocked: boolean;
  adminOverrideByUserId?: string | null;
  adminOverrideByName: string;
  adminOverrideReason: string;
  adminOverrideLockedAt?: string | null;
  autoSyncScoreboardSource: boolean;
  scoreboardSourceName: string;
  selectedSponsorIds: string[];
  lastSyncedAt?: string | null;
  updatedAt?: string | null;
}

export interface ObsSceneItemData {
  sceneItemId: number;
  sourceName: string;
  sourceType: string;
  inputKind: string;
  sceneItemEnabled: boolean;
  sceneItemLocked: boolean;
}

export interface CameraTelemetry {
  networkType?: string;
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
  resolutionActual?: string;
  fpsActual?: number | null;
  audioMuted?: boolean;
  videoWidth?: number | null;
  videoHeight?: number | null;
  deviceOrientation?: string;
  orientationAngle?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
}

export interface BroadcastCameraData {
  id: string;
  matchId: string;
  tournamentId?: string | null;
  cameraId: string;
  name: string;
  label: string;
  cameraNumber: number;
  position: string;
  cameraType: CameraType;
  sourceType: CameraSourceType;
  connectionUrl: string;
  vdoRoomName: string;
  vdoStreamId: string;
  vdoPushUrl?: string;
  obsBrowserSourceUrl?: string;
  pushTokenPrefix: string;
  pushTokenExpiresAt?: string | null;
  broadcastSessionId?: string;
  audioMuted?: boolean;
  obsInputMuted?: boolean | null;
  resolution: '1920x1080' | '1280x720' | '854x480' | '640x360';
  fps: number;
  bitrateKbps: number;
  lowBandwidthMode: boolean;
  facingMode: 'environment' | 'user';
  orientationMode?: CameraOrientationMode;
  previewFit?: CameraPreviewFit;
  portraitBackdropFill?: boolean;
  obsSceneName: string;
  obsInputName: string;
  description: string;
  status: CameraConnectionStatus;
  rawStatus?: CameraConnectionStatus;
  lastError: string;
  lastHeartbeatAt?: string | null;
  telemetry?: CameraTelemetry | null;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  operatorUserId?: string | null;
  operatorName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BroadcastSceneData {
  id: string;
  matchId: string;
  name: string;
  label: string;
  obsSceneName: string;
  layoutType: ObsLayoutType;
  cameraIds: string[];
  mainCameraId: string;
  pipPosition?: PipPosition;
  pipSize?: PipSize;
  includeScoreboardOverlay: boolean;
  overlayMode: OverlayMode;
  overlayPosition: OverlayPosition;
  sponsorIds: string[];
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface BroadcastAuditLogData {
  id: string;
  matchId: string;
  actionType: string;
  cameraId: string;
  cameraName: string;
  previousScene: string;
  newScene: string;
  previousCameraId: string;
  newCameraId: string;
  layoutSelected: string;
  userId?: string | null;
  userName: string;
  userRole: string;
  adminOverride: boolean;
  obsStatus: 'SUCCESS' | 'FAILED' | 'REJECTED';
  errorDetails: string;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
}

export interface ObsStudioMatchSummary {
  id: string;
  matchTitle: string;
  teamAName: string;
  teamBName: string;
  gameName: string;
  tournamentName: string;
  tournamentId?: string | null;
  status: StreamStatus;
  broadcastPublished?: boolean;
  wasPublished?: boolean;
  broadcastPhase?: BroadcastPhase;
  preparedAt?: string | null;
  activatedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  activeStreamingProvider: StreamingProvider;
  youtubeVideoId: string;
  youtubeStreamStatus?: string;
  mediamtxStreamPath?: string;
  mediamtxPublishStatus?: string;
  overlayConfig?: BroadcastOverlayConfig;
}

export interface ObsStudioPayload {
  match: ObsStudioMatchSummary;
  profile: ObsControllerProfileData;
  cameras: BroadcastCameraData[];
  scenes: BroadcastSceneData[];
  auditLogs: BroadcastAuditLogData[];
  scoreboardOverlayUrl: string;
  sponsors: Array<{
    id: string;
    name: string;
    logoUrl: string;
    sponsorshipType: string;
    tagline?: string;
  }>;
  operators: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  permissions: {
    canOverride: boolean;
    canManageCameras?: boolean;
    canManageOverlays?: boolean;
    canControlStream?: boolean;
    canControlRecord?: boolean;
  };
}

export interface BroadcastAssignmentData {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  role?: string;
  scopeType: 'tournament' | 'match';
  tournamentId?: string | null;
  tournamentName?: string;
  matchId?: string | null;
  matchTitle?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  permissions: string[];
  assignedByName: string;
  notes: string;
  suspendedAt?: string | null;
  revokedAt?: string | null;
  revokeReason?: string;
  createdAt: string;
}

export interface BroadcasterDashboardMatchItem {
  id: string;
  matchTitle: string;
  teamAName: string;
  teamBName: string;
  gameName: string;
  tournamentId?: string | null;
  tournamentName: string;
  status: StreamStatus;
  broadcastPublished?: boolean;
  wasPublished?: boolean;
  broadcastPhase?: BroadcastPhase;
  matchDate?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  activeStreamingProvider: StreamingProvider;
  obsConnectionStatus: ObsConnectionStatus;
  obsStreamActive: boolean;
  obsRecordActive: boolean;
  activeObsScene: string;
  activeLayoutType: ObsLayoutType;
  broadcastSessionId: string;
  activeControllerName: string;
  adminOverrideLocked: boolean;
  connectedCameraCount: number;
  totalCameraCount: number;
}

export interface BroadcasterDashboardPayload {
  scope: {
    allAccess: boolean;
    tournamentIds: string[];
    matchIds: string[];
    permissions: string[];
  };
  assignments: BroadcastAssignmentData[];
  tournaments: Array<{
    id: string;
    name: string;
    sportType: string;
    status: string;
    startDate?: string | null;
    matchCount: number;
  }>;
  matches: BroadcasterDashboardMatchItem[];
  activeSessions: BroadcasterDashboardMatchItem[];
  summary: {
    assignedTournaments: number;
    liveMatches: number;
    upcomingMatches: number;
    completedMatches: number;
    connectedObsCount: number;
    connectedCamerasTotal: number;
    authorizedMatchIdsCount: number;
  };
}

export interface BroadcastersManagementPayload {
  assignments: BroadcastAssignmentData[];
  candidates: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  }>;
  tournaments: Array<{
    id: string;
    name: string;
    sportType: string;
    status: string;
  }>;
  matches: Array<{
    id: string;
    matchTitle: string;
    tournamentId?: string | null;
    tournamentName: string;
    status: string;
  }>;
  activeSessions: Array<{
    matchId: string;
    matchTitle: string;
    matchStatus: string;
    connectionStatus: ObsConnectionStatus;
    obsStreamActive: boolean;
    obsRecordActive: boolean;
    activeObsScene: string;
    broadcastSessionId: string;
    activeControllerName: string;
    onlineCameraCount: number;
    totalCameraCount: number;
  }>;
  recentAuditLogs: BroadcastAuditLogData[];
}

export interface ObsBridgeConfigPayload {
  serverUrl: string;
  bridgeId: string;
  bridgeToken: string;
  obsUrl: string;
  obsPassword: string;
  label: string;
}

export interface ObsBridgeData {
  id: string;
  bridgeId: string;
  name: string;
  label: string;
  ownerUserId?: string | null;
  ownerName: string;
  ownerEmail: string;
  tournamentId?: string | null;
  assignedMatchIds: string[];
  activeMatchId?: string | null;
  tokenPrefix: string;
  status: 'ACTIVE' | 'REVOKED';
  connectionStatus: 'ONLINE' | 'OFFLINE';
  obsStatus: ObsConnectionStatus;
  obsVersion: string;
  obsWebSocketVersion: string;
  activeObsScene: string;
  obsScenes: string[];
  obsStreamActive: boolean;
  lastConnectedAt?: string | null;
  lastDisconnectedAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastError: string;
  platform: string;
  revokedAt?: string | null;
  revokeReason: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ObsBridgeTokenResponse {
  bridge: ObsBridgeData;
  bridgeToken: string;
  configJson: ObsBridgeConfigPayload;
  command: string;
}

export interface ObsBridgePairingResponse {
  pairingCode: string;
  expiresAt: string;
  ttlSeconds: number;
  protocolUrl: string;
  serverUrl: string;
  matchId: string | null;
}

export interface ObsBridgeInstallerStatus {
  available: boolean;
  fileName: string;
  version: string;
  sizeBytes: number;
  updatedAt: string | null;
  downloadUrl: string;
}

export interface LocalBridgeProbeStatus {
  running: boolean;
  app?: string;
  paired?: boolean;
  bridgeId?: string | null;
  serverUrl?: string | null;
  serverConnected?: boolean;
  serverStatus?: string;
  obsConnected?: boolean;
  obsStatus?: string;
  obsVersion?: string;
  activeObsScene?: string;
  sceneCount?: number;
  obsDetected?: boolean;
  obsRunning?: boolean;
}

