import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';
import type {
  AdScheduleBridgePolicy,
  AdScheduleConflictPolicy,
  AdScheduleEventRestriction,
  AdScheduleExecutionLogItem,
  AdScheduleRepeatRule,
  AdScheduleSessionPolicy,
  AdScheduleStatus,
  GraphicsDesignType,
} from '../../src/types/broadcastGraphics.ts';

export interface IBroadcastAdSchedule extends Document {
  matchId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  broadcastSessionId: string;
  designId: mongoose.Types.ObjectId;
  adName: string;
  adDesignType: GraphicsDesignType;
  adThumbnailDataUrl: string;
  matchTitle: string;
  scheduledDate: string;
  scheduledStartTime: string;
  timezone: string;
  scheduledStartAt: Date;
  nextRunAt: Date;
  durationSeconds: number;
  gracePeriodSeconds: number;
  priority: number;
  conflictPolicy: AdScheduleConflictPolicy;
  bridgePolicy: AdScheduleBridgePolicy;
  eventRestriction: AdScheduleEventRestriction;
  sessionPolicy: AdScheduleSessionPolicy;
  repeatRule: AdScheduleRepeatRule;
  repeatIntervalMinutes: number;
  repeatDailyTimes: string[];
  repeatWeekdays: number[];
  repeatStartDate: string;
  repeatEndDate: string;
  repeatEndTime: string;
  maxOccurrences: number;
  occurrenceCount: number;
  status: AdScheduleStatus;
  statusReason: string;
  claimLockToken: string;
  claimLockedAt?: Date | null;
  activeSlotInstanceId: string;
  lastExecutedAt?: Date | null;
  lastCompletedAt?: Date | null;
  executionHistory: AdScheduleExecutionLogItem[];
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastAdScheduleSchema = new Schema<IBroadcastAdSchedule>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    broadcastSessionId: { type: String, trim: true, default: '', maxlength: 100 },
    designId: { type: Schema.Types.ObjectId, ref: 'BroadcastAdDesign', required: true, index: true },
    adName: { type: String, trim: true, required: true, maxlength: 140 },
    adDesignType: { type: String, trim: true, default: 'custom', maxlength: 40 },
    adThumbnailDataUrl: { type: String, default: '', maxlength: 90000 },
    matchTitle: { type: String, trim: true, default: '', maxlength: 200 },
    scheduledDate: { type: String, trim: true, required: true, maxlength: 20 },
    scheduledStartTime: { type: String, trim: true, required: true, maxlength: 16 },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata', maxlength: 80 },
    scheduledStartAt: { type: Date, required: true, index: true },
    nextRunAt: { type: Date, required: true, index: true },
    durationSeconds: { type: Number, required: true, default: 15, min: 1, max: 3600 },
    gracePeriodSeconds: { type: Number, default: 45, min: 0, max: 3600 },
    priority: { type: Number, default: 5, min: 1, max: 100 },
    conflictPolicy: {
      type: String,
      enum: ['prevent', 'stack', 'replace_lower_priority'],
      default: 'prevent',
    },
    bridgePolicy: {
      type: String,
      enum: ['allow_overlay_only', 'require_bridge'],
      default: 'allow_overlay_only',
    },
    eventRestriction: {
      type: String,
      enum: ['any', 'live_only', 'break_only'],
      default: 'any',
    },
    sessionPolicy: {
      type: String,
      enum: ['cancel_on_end', 'miss_on_end'],
      default: 'cancel_on_end',
    },
    repeatRule: {
      type: String,
      enum: ['none', 'every_x_minutes', 'daily_times', 'weekdays'],
      default: 'none',
    },
    repeatIntervalMinutes: { type: Number, default: 15, min: 1, max: 1440 },
    repeatDailyTimes: { type: [String], default: [] },
    repeatWeekdays: { type: [Number], default: [] },
    repeatStartDate: { type: String, trim: true, default: '', maxlength: 20 },
    repeatEndDate: { type: String, trim: true, default: '', maxlength: 20 },
    repeatEndTime: { type: String, trim: true, default: '', maxlength: 16 },
    maxOccurrences: { type: Number, default: 0, min: 0, max: 1000 },
    occurrenceCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: [
        'scheduled',
        'preparing',
        'playing',
        'completed',
        'missed',
        'cancelled',
        'failed',
        'paused',
      ],
      default: 'scheduled',
      index: true,
    },
    statusReason: { type: String, trim: true, default: '', maxlength: 400 },
    claimLockToken: { type: String, default: '', maxlength: 80 },
    claimLockedAt: { type: Date, default: null },
    activeSlotInstanceId: { type: String, default: '', maxlength: 80 },
    lastExecutedAt: { type: Date, default: null },
    lastCompletedAt: { type: Date, default: null },
    executionHistory: { type: Schema.Types.Mixed, default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, trim: true, default: '', maxlength: 120 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

broadcastAdScheduleSchema.index({ status: 1, nextRunAt: 1 });
broadcastAdScheduleSchema.index({ matchId: 1, status: 1, nextRunAt: 1 });
broadcastAdScheduleSchema.index({ matchId: 1, createdAt: -1 });

const MongooseBroadcastAdSchedule = mongoose.model<IBroadcastAdSchedule>(
  'BroadcastAdSchedule',
  broadcastAdScheduleSchema
);
export const BroadcastAdSchedule = createDualModel<IBroadcastAdSchedule>(
  'broadcastadschedules',
  MongooseBroadcastAdSchedule
);
