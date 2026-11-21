import type { ObsLayoutType } from '../utils/obsLayoutGeometry.ts';
import type { BroadcastOverlayConfig, StreamingProvider, StreamStatus } from './index.ts';
import type { OverlayMode, OverlayPosition } from '../utils/overlayConfig.ts';

export type ObsConnectionMode = 'direct_ws' | 'local_agent';
export type ObsConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

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
  activeLayoutType: ObsLayoutType;
  activeSceneId: string;
  obsScenes: string[];
  obsStreamActive: boolean;
  obsStreamTimecode: string;
  obsStats?: ObsLiveStats | null;
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

export interface CameraTelemetry {
  networkType?: string;
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
  resolutionActual?: string;
  fpsActual?: number | null;
  audioMuted?: boolean;
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
  resolution: '1920x1080' | '1280x720' | '854x480' | '640x360';
  fps: number;
  bitrateKbps: number;
  lowBandwidthMode: boolean;
  facingMode: 'environment' | 'user';
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
  activeStreamingProvider: StreamingProvider;
  youtubeVideoId: string;
  youtubeStreamStatus?: string;
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
  };
}
