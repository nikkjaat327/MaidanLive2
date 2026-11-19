import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type ScoreHistoryEntryType = 'SCORE_UPDATE' | 'COMMENTARY' | 'RESULT' | 'CORRECTION';

export interface IScoreHistory extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  entryType: ScoreHistoryEntryType;
  sportType: string;
  teamSide: 'A' | 'B' | '';
  teamId?: mongoose.Types.ObjectId | null;
  eventCategory: string;
  eventType: string;
  pointsAwarded: number;
  playerId?: mongoose.Types.ObjectId | null;
  playerName: string;
  assistPlayerId?: mongoose.Types.ObjectId | null;
  assistPlayerName: string;
  eventPhase: string;
  details: Record<string, unknown>;
  isCorrection: boolean;
  correctionOfId?: mongoose.Types.ObjectId | null;
  correctionReason: string;
  reverted: boolean;
  clientEventId: string;
  previousScore: Record<string, unknown>;
  updatedScore: Record<string, unknown>;
  action: string;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const scoreHistorySchema = new Schema<IScoreHistory>(
  {
    liveStreamId: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: ['SCORE_UPDATE', 'COMMENTARY', 'RESULT', 'CORRECTION'],
      default: 'SCORE_UPDATE',
    },
    sportType: { type: String, trim: true, default: '' },
    teamSide: { type: String, enum: ['A', 'B', ''], default: '' },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    eventCategory: { type: String, trim: true, default: '', maxlength: 60 },
    eventType: { type: String, trim: true, default: '', maxlength: 80 },
    pointsAwarded: { type: Number, default: 0 },
    playerId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    playerName: { type: String, trim: true, default: '', maxlength: 120 },
    assistPlayerId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    assistPlayerName: { type: String, trim: true, default: '', maxlength: 120 },
    eventPhase: { type: String, trim: true, default: '', maxlength: 60 },
    details: { type: Schema.Types.Mixed, default: {} },
    isCorrection: { type: Boolean, default: false },
    correctionOfId: { type: Schema.Types.ObjectId, ref: 'ScoreHistory', default: null },
    correctionReason: { type: String, trim: true, default: '', maxlength: 280 },
    reverted: { type: Boolean, default: false },
    clientEventId: { type: String, trim: true, default: '', maxlength: 100 },
    previousScore: { type: Schema.Types.Mixed, required: true },
    updatedScore: { type: Schema.Types.Mixed, required: true },
    action: { type: String, required: true, trim: true, maxlength: 280 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

scoreHistorySchema.index({ liveStreamId: 1, createdAt: -1 });
scoreHistorySchema.index({ liveStreamId: 1, clientEventId: 1 });

const MongooseScoreHistory = mongoose.model<IScoreHistory>('ScoreHistory', scoreHistorySchema);
export const ScoreHistory = createDualModel<IScoreHistory>('scorehistories', MongooseScoreHistory);
