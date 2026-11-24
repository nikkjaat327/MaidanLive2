import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type ObsBridgeLifecycleStatus = 'ACTIVE' | 'REVOKED';
export type ObsBridgeConnectionStatus = 'ONLINE' | 'RECONNECTING' | 'CONNECTION_LOST' | 'OFFLINE';
export type ObsBridgeObsStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'CONNECTION_LOST'
  | 'ERROR';
export type BridgeExplicitConnectionState =
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'CONNECTION_LOST'
  | 'OFFLINE';

export interface IObsBridgeDiagnosticEvent {
  timestamp: Date | string;
  level: string;
  category: string;
  message: string;
  reason?: string;
}

export interface IObsBridge extends Document {
  bridgeId: string;
  name: string;
  label: string;
  ownerUserId: mongoose.Types.ObjectId;
  ownerName: string;
  ownerEmail: string;
  tournamentId?: mongoose.Types.ObjectId | null;
  assignedMatchIds: mongoose.Types.ObjectId[];
  activeMatchId?: mongoose.Types.ObjectId | null;
  tokenHash: string;
  tokenPrefix: string;
  status: ObsBridgeLifecycleStatus;
  connectionStatus: ObsBridgeConnectionStatus;
  bridgeConnectionState?: BridgeExplicitConnectionState;
  obsStatus: ObsBridgeObsStatus;
  obsConnectionState?: BridgeExplicitConnectionState;
  obsVersion: string;
  obsWebSocketVersion: string;
  activeObsScene: string;
  obsScenes: string[];
  obsStreamActive: boolean;
  missedHeartbeats?: number;
  lastDisconnectReason?: string;
  reconnectAttempts?: number;
  lastReconnectAttemptAt?: Date | null;
  diagnosticLogs?: IObsBridgeDiagnosticEvent[];
  lastConnectedAt?: Date | null;
  lastDisconnectedAt?: Date | null;
  lastHeartbeatAt?: Date | null;
  lastError: string;
  platform: string;
  bridgeVersion: string;
  bridgeCapabilities: string[];
  mediamtxState?: Record<string, any> | null;
  revokedAt?: Date | null;
  revokedBy?: mongoose.Types.ObjectId | null;
  revokeReason: string;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const obsBridgeSchema = new Schema<IObsBridge>(
  {
    bridgeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    label: {
      type: String,
      trim: true,
      default: '',
      maxlength: 140,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerName: { type: String, trim: true, default: '', maxlength: 120 },
    ownerEmail: { type: String, trim: true, default: '', maxlength: 180 },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    assignedMatchIds: [{ type: Schema.Types.ObjectId, ref: 'LiveStream' }],
    activeMatchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null },
    tokenHash: { type: String, required: true, select: false },
    tokenPrefix: { type: String, default: '', maxlength: 40 },
    status: {
      type: String,
      enum: ['ACTIVE', 'REVOKED'],
      default: 'ACTIVE',
      index: true,
    },
    connectionStatus: {
      type: String,
      enum: ['ONLINE', 'RECONNECTING', 'CONNECTION_LOST', 'OFFLINE'],
      default: 'OFFLINE',
    },
    bridgeConnectionState: {
      type: String,
      enum: ['CONNECTED', 'RECONNECTING', 'CONNECTION_LOST', 'OFFLINE'],
      default: 'OFFLINE',
    },
    obsStatus: {
      type: String,
      enum: ['CONNECTED', 'DISCONNECTED', 'CONNECTING', 'RECONNECTING', 'CONNECTION_LOST', 'ERROR'],
      default: 'DISCONNECTED',
    },
    obsConnectionState: {
      type: String,
      enum: ['CONNECTED', 'RECONNECTING', 'CONNECTION_LOST', 'OFFLINE'],
      default: 'OFFLINE',
    },
    obsVersion: { type: String, default: '' },
    obsWebSocketVersion: { type: String, default: '' },
    activeObsScene: { type: String, default: '' },
    obsScenes: [{ type: String }],
    obsStreamActive: { type: Boolean, default: false },
    missedHeartbeats: { type: Number, default: 0 },
    lastDisconnectReason: { type: String, default: '', maxlength: 300 },
    reconnectAttempts: { type: Number, default: 0 },
    lastReconnectAttemptAt: { type: Date, default: null },
    diagnosticLogs: [
      {
        timestamp: { type: Date, default: Date.now },
        level: { type: String, default: 'info', maxlength: 20 },
        category: { type: String, default: 'lifecycle', maxlength: 60 },
        message: { type: String, default: '', maxlength: 400 },
        reason: { type: String, default: '', maxlength: 200 },
      },
    ],
    lastConnectedAt: { type: Date, default: null },
    lastDisconnectedAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    lastError: { type: String, default: '', maxlength: 500 },
    platform: { type: String, default: 'win32', maxlength: 40 },
    bridgeVersion: { type: String, default: '', maxlength: 40 },
    bridgeCapabilities: [{ type: String, maxlength: 64 }],
    mediamtxState: { type: Schema.Types.Mixed, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: '', maxlength: 240 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

obsBridgeSchema.index({ assignedMatchIds: 1, status: 1 });

const MongooseObsBridge = mongoose.model<IObsBridge>('ObsBridge', obsBridgeSchema);
export const ObsBridge = createDualModel<IObsBridge>('obsbridges', MongooseObsBridge);
