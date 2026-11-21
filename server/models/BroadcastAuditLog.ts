import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type BroadcastAuditAction =
  | 'OBS_CONNECT'
  | 'OBS_DISCONNECT'
  | 'OBS_ERROR'
  | 'OBS_STREAM_START'
  | 'OBS_STREAM_STOP'
  | 'OBS_RECORD_START'
  | 'OBS_RECORD_STOP'
  | 'AGENT_CONNECTED'
  | 'AGENT_DISCONNECTED'
  | 'CAMERA_CREATED'
  | 'CAMERA_UPDATED'
  | 'CAMERA_DELETED'
  | 'CAMERA_DISCONNECTED'
  | 'CAMERA_RECONNECT'
  | 'CAMERA_AUDIO_TOGGLE'
  | 'CAMERA_TEST'
  | 'CAMERA_SWITCH'
  | 'LAYOUT_SWITCH'
  | 'SCENE_SWITCH'
  | 'OVERLAY_SYNC'
  | 'SCOREBOARD_OVERLAY_TOGGLE'
  | 'BROADCAST_SESSION_STARTED'
  | 'BROADCAST_SESSION_ENDED'
  | 'BROADCASTER_ASSIGNED'
  | 'BROADCASTER_STATUS_CHANGED'
  | 'CONTROLLER_TAKEOVER'
  | 'ADMIN_OVERRIDE_ON'
  | 'ADMIN_OVERRIDE_OFF';

export interface IBroadcastAuditLog extends Document {
  matchId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  actionType: BroadcastAuditAction;
  cameraId: string;
  cameraName: string;
  previousScene: string;
  newScene: string;
  previousCameraId: string;
  newCameraId: string;
  layoutSelected: string;
  userId?: mongoose.Types.ObjectId | null;
  userName: string;
  userRole: string;
  adminOverride: boolean;
  obsStatus: 'SUCCESS' | 'FAILED' | 'REJECTED';
  errorDetails: string;
  metadata?: Record<string, unknown> | null;
  timestamp: Date;
  createdAt: Date;
}

const broadcastAuditLogSchema = new Schema<IBroadcastAuditLog>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    actionType: {
      type: String,
      enum: [
        'OBS_CONNECT',
        'OBS_DISCONNECT',
        'OBS_ERROR',
        'OBS_STREAM_START',
        'OBS_STREAM_STOP',
        'OBS_RECORD_START',
        'OBS_RECORD_STOP',
        'AGENT_CONNECTED',
        'AGENT_DISCONNECTED',
        'CAMERA_CREATED',
        'CAMERA_UPDATED',
        'CAMERA_DELETED',
        'CAMERA_DISCONNECTED',
        'CAMERA_RECONNECT',
        'CAMERA_AUDIO_TOGGLE',
        'CAMERA_TEST',
        'CAMERA_SWITCH',
        'LAYOUT_SWITCH',
        'SCENE_SWITCH',
        'OVERLAY_SYNC',
        'SCOREBOARD_OVERLAY_TOGGLE',
        'BROADCAST_SESSION_STARTED',
        'BROADCAST_SESSION_ENDED',
        'BROADCASTER_ASSIGNED',
        'BROADCASTER_STATUS_CHANGED',
        'CONTROLLER_TAKEOVER',
        'ADMIN_OVERRIDE_ON',
        'ADMIN_OVERRIDE_OFF',
      ],
      required: true,
      index: true,
    },
    cameraId: { type: String, default: '' },
    cameraName: { type: String, default: '' },
    previousScene: { type: String, default: '' },
    newScene: { type: String, default: '' },
    previousCameraId: { type: String, default: '' },
    newCameraId: { type: String, default: '' },
    layoutSelected: { type: String, default: '' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: 'System' },
    userRole: { type: String, default: 'SYSTEM' },
    adminOverride: { type: Boolean, default: false },
    obsStatus: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'REJECTED'],
      default: 'SUCCESS',
    },
    errorDetails: { type: String, default: '', maxlength: 600 },
    metadata: { type: Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

broadcastAuditLogSchema.index({ matchId: 1, timestamp: -1 });

const MongooseBroadcastAuditLog = mongoose.model<IBroadcastAuditLog>(
  'BroadcastAuditLog',
  broadcastAuditLogSchema
);
export const BroadcastAuditLog = createDualModel<IBroadcastAuditLog>(
  'broadcastauditlogs',
  MongooseBroadcastAuditLog
);
