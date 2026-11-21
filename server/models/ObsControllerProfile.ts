import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type ObsConnectionMode = 'direct_ws' | 'local_agent';
export type ObsConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
export type MultiCameraLayoutType =
  | 'SINGLE'
  | 'SPLIT_2_H'
  | 'SPLIT_2_V'
  | 'SPLIT_3'
  | 'GRID_4'
  | 'MAIN_PLUS_SECONDARY'
  | 'DYNAMIC_GRID'
  | 'SPORT_BROADCAST';

export interface IObsLiveStats {
  cpuUsage: number;
  activeFps: number;
  outputSkippedFrames: number;
  outputTotalFrames: number;
  averageFrameRenderTime: number;
  memoryUsageMb?: number;
}

export interface IObsControllerProfile extends Document {
  matchId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  connectionMode: ObsConnectionMode;
  obsProtocol: 'ws' | 'wss';
  obsHost: string;
  obsPort: number;
  obsPasswordEnc: string;
  hasPassword: boolean;
  agentTokenHash: string;
  agentTokenPrefix: string;
  agentOnline: boolean;
  agentLastSeenAt?: Date | null;
  agentLabel: string;
  connectionStatus: ObsConnectionStatus;
  lastError: string;
  obsVersion: string;
  obsWebSocketVersion: string;
  activeObsScene: string;
  activeCameraId: string;
  activeLayoutType: MultiCameraLayoutType;
  activeSceneId: string;
  obsScenes: string[];
  obsStreamActive: boolean;
  obsStreamTimecode: string;
  obsStats?: IObsLiveStats | null;
  vdoRoomName: string;
  vdoRoomPasswordEnc: string;
  adminOverrideLocked: boolean;
  adminOverrideByUserId?: mongoose.Types.ObjectId | null;
  adminOverrideByName: string;
  adminOverrideReason: string;
  adminOverrideLockedAt?: Date | null;
  autoSyncScoreboardSource: boolean;
  scoreboardSourceName: string;
  selectedSponsorIds: string[];
  lastSyncedAt?: Date | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const obsControllerProfileSchema = new Schema<IObsControllerProfile>(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      unique: true,
      index: true,
    },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    connectionMode: {
      type: String,
      enum: ['direct_ws', 'local_agent'],
      default: 'local_agent',
    },
    obsProtocol: { type: String, enum: ['ws', 'wss'], default: 'ws' },
    obsHost: { type: String, trim: true, default: '127.0.0.1', maxlength: 200 },
    obsPort: { type: Number, default: 4455, min: 1, max: 65535 },
    obsPasswordEnc: { type: String, default: '', select: false },
    hasPassword: { type: Boolean, default: false },
    agentTokenHash: { type: String, default: '', select: false },
    agentTokenPrefix: { type: String, default: '' },
    agentOnline: { type: Boolean, default: false },
    agentLastSeenAt: { type: Date, default: null },
    agentLabel: { type: String, trim: true, default: '', maxlength: 120 },
    connectionStatus: {
      type: String,
      enum: ['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR'],
      default: 'DISCONNECTED',
    },
    lastError: { type: String, default: '', maxlength: 500 },
    obsVersion: { type: String, default: '' },
    obsWebSocketVersion: { type: String, default: '' },
    activeObsScene: { type: String, default: '' },
    activeCameraId: { type: String, default: '' },
    activeLayoutType: {
      type: String,
      enum: [
        'SINGLE',
        'SPLIT_2_H',
        'SPLIT_2_V',
        'SPLIT_3',
        'GRID_4',
        'MAIN_PLUS_SECONDARY',
        'DYNAMIC_GRID',
        'SPORT_BROADCAST',
      ],
      default: 'SINGLE',
    },
    activeSceneId: { type: String, default: '' },
    obsScenes: [{ type: String }],
    obsStreamActive: { type: Boolean, default: false },
    obsStreamTimecode: { type: String, default: '' },
    obsStats: {
      type: Schema.Types.Mixed,
      default: null,
    },
    vdoRoomName: { type: String, trim: true, default: '', maxlength: 100 },
    vdoRoomPasswordEnc: { type: String, default: '', select: false },
    adminOverrideLocked: { type: Boolean, default: false },
    adminOverrideByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    adminOverrideByName: { type: String, default: '' },
    adminOverrideReason: { type: String, default: '', maxlength: 240 },
    adminOverrideLockedAt: { type: Date, default: null },
    autoSyncScoreboardSource: { type: Boolean, default: true },
    scoreboardSourceName: {
      type: String,
      trim: true,
      default: 'MaidanLive_Scoreboard_Overlay',
      maxlength: 120,
    },
    selectedSponsorIds: [{ type: String }],
    lastSyncedAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const MongooseObsControllerProfile = mongoose.model<IObsControllerProfile>(
  'ObsControllerProfile',
  obsControllerProfileSchema
);
export const ObsControllerProfile = createDualModel<IObsControllerProfile>(
  'obscontrollerprofiles',
  MongooseObsControllerProfile
);
