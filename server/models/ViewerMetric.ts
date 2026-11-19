import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export interface IViewerMetric extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  sessionKey: string;
  userId?: mongoose.Types.ObjectId | null;
  mode: 'LIVE' | 'REPLAY' | 'PREVIEW';
  watchSeconds: number;
  lastHeartbeatAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const viewerMetricSchema = new Schema<IViewerMetric>(
  {
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    sessionKey: { type: String, required: true, trim: true, maxlength: 120 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mode: {
      type: String,
      enum: ['LIVE', 'REPLAY', 'PREVIEW'],
      default: 'LIVE',
      index: true,
    },
    watchSeconds: { type: Number, default: 0, min: 0 },
    lastHeartbeatAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

viewerMetricSchema.index({ liveStreamId: 1, sessionKey: 1 }, { unique: true });
viewerMetricSchema.index({ liveStreamId: 1, mode: 1 });

export const ViewerMetric = mongoose.model<IViewerMetric>('ViewerMetric', viewerMetricSchema);
