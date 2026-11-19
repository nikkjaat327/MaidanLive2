import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';

export type ResultStatus =
  | 'NOT_DECLARED'
  | 'DECLARED'
  | 'DRAW'
  | 'TIE'
  | 'NO_RESULT'
  | 'ABANDONED';
export type ResultType =
  | 'TEAM_A_WON'
  | 'TEAM_B_WON'
  | 'DRAW'
  | 'TIE'
  | 'NO_RESULT'
  | 'ABANDONED'
  | '';

export interface ILiveScore extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  sportType: SportType;
  teamAScore: number;
  teamBScore: number;
  sportSpecificDetails: Record<string, unknown>;
  matchStatus: string;
  resultStatus: ResultStatus;
  resultType: ResultType;
  winnerTeamId?: mongoose.Types.ObjectId | null;
  winnerTeamName: string;
  winningMargin: string;
  resultDescription: string;
  mvpPlayerId?: mongoose.Types.ObjectId | null;
  mvpPlayerName: string;
  finalSummary: string;
  tossWinner: 'A' | 'B' | '';
  tossDecision: string;
  declaredBy?: mongoose.Types.ObjectId | null;
  declaredByName: string;
  declaredAt?: Date | null;
  lastUpdatedBy?: mongoose.Types.ObjectId | null;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const liveScoreSchema = new Schema<ILiveScore>(
  {
    liveStreamId: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      unique: true,
      index: true,
    },
    sportType: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'],
      default: 'Other',
    },
    teamAScore: { type: Number, default: 0, min: 0 },
    teamBScore: { type: Number, default: 0, min: 0 },
    sportSpecificDetails: { type: Schema.Types.Mixed, default: {} },
    matchStatus: { type: String, trim: true, default: 'Live', maxlength: 80 },
    resultStatus: {
      type: String,
      enum: ['NOT_DECLARED', 'DECLARED', 'DRAW', 'TIE', 'NO_RESULT', 'ABANDONED'],
      default: 'NOT_DECLARED',
    },
    resultType: {
      type: String,
      enum: ['TEAM_A_WON', 'TEAM_B_WON', 'DRAW', 'TIE', 'NO_RESULT', 'ABANDONED', ''],
      default: '',
    },
    winnerTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    winnerTeamName: { type: String, trim: true, default: '', maxlength: 120 },
    winningMargin: { type: String, trim: true, default: '', maxlength: 120 },
    resultDescription: { type: String, trim: true, default: '', maxlength: 300 },
    mvpPlayerId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    mvpPlayerName: { type: String, trim: true, default: '', maxlength: 120 },
    finalSummary: { type: String, trim: true, default: '', maxlength: 500 },
    tossWinner: { type: String, enum: ['A', 'B', ''], default: '' },
    tossDecision: { type: String, trim: true, default: '', maxlength: 40 },
    declaredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    declaredByName: { type: String, trim: true, default: '', maxlength: 120 },
    declaredAt: { type: Date, default: null },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const LiveScore = mongoose.model<ILiveScore>('LiveScore', liveScoreSchema);
