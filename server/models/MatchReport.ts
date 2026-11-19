import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type ReportCategory =
  | 'STREAM_DOWN'
  | 'WRONG_SCORE'
  | 'AUDIO_VIDEO_ISSUE'
  | 'CHAT_ABUSE'
  | 'OTHER';

export type ReportStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface IMatchReport extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  reportedByUserId?: mongoose.Types.ObjectId | null;
  reporterName: string;
  reporterEmail: string;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  resolutionNotes: string;
  resolvedBy?: mongoose.Types.ObjectId | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const matchReportSchema = new Schema<IMatchReport>(
  {
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    reportedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reporterName: { type: String, trim: true, default: 'Viewer', maxlength: 120 },
    reporterEmail: { type: String, trim: true, default: '', maxlength: 160 },
    category: {
      type: String,
      enum: ['STREAM_DOWN', 'WRONG_SCORE', 'AUDIO_VIDEO_ISSUE', 'CHAT_ABUSE', 'OTHER'],
      default: 'OTHER',
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'],
      default: 'OPEN',
      index: true,
    },
    resolutionNotes: { type: String, trim: true, default: '', maxlength: 500 },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

matchReportSchema.index({ status: 1, createdAt: -1 });
matchReportSchema.index({ liveStreamId: 1, createdAt: -1 });

const MongooseMatchReport = mongoose.model<IMatchReport>('MatchReport', matchReportSchema);
export const MatchReport = createDualModel<IMatchReport>('matchreports', MongooseMatchReport);
