import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

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

export type CameraOrientationMode = 'auto' | '0' | '90' | '180' | '270';
export type CameraPreviewFit = 'contain' | 'cover' | 'fill';
export type CameraStreamProtocol = 'vdoninja' | 'rtmp' | 'srt' | 'browser' | 'obs_input' | 'rtsp_ffmpeg';

export interface ICameraTelemetry {
  networkType?: string;
  batteryLevel?: number | null;
  batteryCharging?: boolean | null;
  resolutionActual?: string;
  fpsActual?: number | null;
  audioMuted?: boolean;
  userAgent?: string;
  videoWidth?: number | null;
  videoHeight?: number | null;
  deviceOrientation?: string;
  orientationAngle?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
}

export interface IBroadcastCamera extends Document {
  matchId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  cameraId: string;
  name: string;
  label: string;
  cameraNumber: number;
  position: string;
  cameraType: CameraType;
  sourceType: CameraSourceType;
  streamProtocol: CameraStreamProtocol;
  connectionUrl: string;
  vdoRoomName: string;
  vdoStreamId: string;
  vdoPasswordEnc: string;
  pushTokenHash: string;
  pushTokenPrefix: string;
  pushTokenExpiresAt?: Date | null;
  mediamtxStreamPath: string;
  mediamtxStreamKeyEnc: string;
  mediamtxStreamKeyHash: string;
  mediamtxStreamKeyPrefix: string;
  mediamtxRevoked: boolean;
  mediamtxRevokedAt?: Date | null;
  mediamtxPublisherConnected: boolean;
  mediamtxLastConnectedAt?: Date | null;
  mediamtxDisconnectedAt?: Date | null;
  obsSourceConfigured: boolean;
  obsSourceAvailable: boolean;
  obsMediaState: string;
  broadcastSessionId: string;
  audioMuted: boolean;
  obsInputMuted?: boolean | null;
  resolution: '1920x1080' | '1280x720' | '854x480' | '640x360';
  fps: number;
  bitrateKbps: number;
  lowBandwidthMode: boolean;
  facingMode: 'environment' | 'user';
  orientationMode: CameraOrientationMode;
  previewFit: CameraPreviewFit;
  portraitBackdropFill: boolean;
  obsSceneName: string;
  obsInputName: string;
  description: string;
  status: CameraConnectionStatus;
  lastError: string;
  lastHeartbeatAt?: Date | null;
  telemetry?: ICameraTelemetry | null;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  operatorUserId?: mongoose.Types.ObjectId | null;
  operatorName: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastCameraSchema = new Schema<IBroadcastCamera>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    cameraId: { type: String, required: true, trim: true, maxlength: 80, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    label: { type: String, trim: true, default: 'Ground Camera', maxlength: 120 },
    cameraNumber: { type: Number, required: true, min: 1 },
    position: { type: String, trim: true, default: '', maxlength: 120 },
    cameraType: {
      type: String,
      enum: [
        'smartphone_vdo',
        'rtmp_mediamtx',
        'ip_camera',
        'usb_capture',
        'browser_source',
        'obs_scene_only',
      ],
      default: 'smartphone_vdo',
    },
    sourceType: {
      type: String,
      enum: ['vdoninja', 'browser_source', 'mediamtx', 'obs_input', 'rtsp_ffmpeg'],
      default: 'vdoninja',
    },
    streamProtocol: {
      type: String,
      enum: ['vdoninja', 'rtmp', 'srt', 'browser', 'obs_input', 'rtsp_ffmpeg'],
      default: 'vdoninja',
    },
    connectionUrl: { type: String, trim: true, default: '', maxlength: 600 },
    vdoRoomName: { type: String, trim: true, default: '', maxlength: 100 },
    vdoStreamId: { type: String, trim: true, default: '', maxlength: 100 },
    vdoPasswordEnc: { type: String, default: '', select: false },
    pushTokenHash: { type: String, default: '', select: false },
    pushTokenPrefix: { type: String, default: '' },
    pushTokenExpiresAt: { type: Date, default: null },
    mediamtxStreamPath: { type: String, trim: true, default: '', maxlength: 160, index: true },
    mediamtxStreamKeyEnc: { type: String, default: '', select: false },
    mediamtxStreamKeyHash: { type: String, default: '', select: false },
    mediamtxStreamKeyPrefix: { type: String, default: '', maxlength: 40 },
    mediamtxRevoked: { type: Boolean, default: false },
    mediamtxRevokedAt: { type: Date, default: null },
    mediamtxPublisherConnected: { type: Boolean, default: false },
    mediamtxLastConnectedAt: { type: Date, default: null },
    mediamtxDisconnectedAt: { type: Date, default: null },
    obsSourceConfigured: { type: Boolean, default: false },
    obsSourceAvailable: { type: Boolean, default: false },
    obsMediaState: { type: String, trim: true, default: '', maxlength: 40 },
    broadcastSessionId: { type: String, trim: true, default: '', maxlength: 80 },
    audioMuted: { type: Boolean, default: false },
    obsInputMuted: { type: Boolean, default: null },
    resolution: {
      type: String,
      enum: ['1920x1080', '1280x720', '854x480', '640x360'],
      default: '1280x720',
    },
    fps: { type: Number, default: 30, min: 15, max: 60 },
    bitrateKbps: { type: Number, default: 2000, min: 300, max: 12000 },
    lowBandwidthMode: { type: Boolean, default: false },
    facingMode: { type: String, enum: ['environment', 'user'], default: 'environment' },
    orientationMode: {
      type: String,
      enum: ['auto', '0', '90', '180', '270'],
      default: 'auto',
    },
    previewFit: {
      type: String,
      enum: ['contain', 'cover', 'fill'],
      default: 'contain',
    },
    portraitBackdropFill: { type: Boolean, default: true },
    obsSceneName: { type: String, trim: true, default: '', maxlength: 120 },
    obsInputName: { type: String, trim: true, default: '', maxlength: 120 },
    description: { type: String, trim: true, default: '', maxlength: 400 },
    status: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'CONNECTING', 'ACTIVE', 'ERROR', 'NOT_CONFIGURED'],
      default: 'NOT_CONFIGURED',
    },
    lastError: { type: String, default: '', maxlength: 400 },
    lastHeartbeatAt: { type: Date, default: null },
    telemetry: { type: Schema.Types.Mixed, default: null },
    priority: { type: Number, default: 10, min: 1, max: 1000 },
    isDefault: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 1, min: 0 },
    operatorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    operatorName: { type: String, trim: true, default: '', maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

broadcastCameraSchema.index({ matchId: 1, cameraId: 1 }, { unique: true });
broadcastCameraSchema.index({ matchId: 1, sortOrder: 1, cameraNumber: 1 });

const MongooseBroadcastCamera = mongoose.model<IBroadcastCamera>(
  'BroadcastCamera',
  broadcastCameraSchema
);
export const BroadcastCamera = createDualModel<IBroadcastCamera>(
  'broadcastcameras',
  MongooseBroadcastCamera
);
