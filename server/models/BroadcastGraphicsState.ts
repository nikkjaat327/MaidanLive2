import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';
import type {
  ActiveBroadcastGraphicSlot,
  BroadcastAdQueueItem,
  BroadcastGraphicEventRule,
  GraphicsOverlapPolicy,
  GraphicsQueuePhase,
  GraphicsQueueStatus,
} from '../../src/types/broadcastGraphics.ts';

export interface IBroadcastGraphicsState extends Document {
  matchId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  broadcastSessionId: string;
  overlapPolicy: GraphicsOverlapPolicy;
  animationsPaused: boolean;
  pausedAt?: Date | null;
  activeSlots: ActiveBroadcastGraphicSlot[];
  queue: BroadcastAdQueueItem[];
  queueStatus: GraphicsQueueStatus;
  queuePhase?: GraphicsQueuePhase;
  currentQueueIndex: number;
  queueAutoAdvance: boolean;
  queueItemStartedAt?: Date | null;
  queueNextActionAt?: Date | null;
  queuePausedRemainingMs?: number | null;
  eventRules: BroadcastGraphicEventRule[];
  lastUpdatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastGraphicsStateSchema = new Schema<IBroadcastGraphicsState>(
  {
    matchId: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      unique: true,
      index: true,
    },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    broadcastSessionId: { type: String, trim: true, default: '', maxlength: 100 },
    overlapPolicy: {
      type: String,
      enum: ['replace', 'stack'],
      default: 'replace',
    },
    animationsPaused: { type: Boolean, default: false },
    pausedAt: { type: Date, default: null },
    activeSlots: { type: Schema.Types.Mixed, default: [] },
    queue: { type: Schema.Types.Mixed, default: [] },
    queueStatus: {
      type: String,
      enum: ['idle', 'playing', 'paused'],
      default: 'idle',
    },
    queuePhase: {
      type: String,
      enum: ['idle', 'showing', 'gap', 'paused'],
      default: 'idle',
    },
    currentQueueIndex: { type: Number, default: 0, min: 0 },
    queueAutoAdvance: { type: Boolean, default: false },
    queueItemStartedAt: { type: Date, default: null },
    queueNextActionAt: { type: Date, default: null },
    queuePausedRemainingMs: { type: Number, default: null },
    eventRules: { type: Schema.Types.Mixed, default: [] },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const MongooseBroadcastGraphicsState = mongoose.model<IBroadcastGraphicsState>(
  'BroadcastGraphicsState',
  broadcastGraphicsStateSchema
);
export const BroadcastGraphicsState = createDualModel<IBroadcastGraphicsState>(
  'broadcastgraphicsstates',
  MongooseBroadcastGraphicsState
);
