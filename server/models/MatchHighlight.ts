import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export interface IMatchHighlightAudit {
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  actorId: mongoose.Types.ObjectId;
  actorName: string;
  at: Date;
  note?: string;
}

export interface IMatchHighlight extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  eventType: string;
  videoTimestampSeconds: number;
  description: string;
  teamSide: 'A' | 'B' | '';
  playerId?: mongoose.Types.ObjectId | null;
  playerName: string;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  auditTrail: IMatchHighlightAudit[];
  createdAt: Date;
  updatedAt: Date;
}

const matchHighlightSchema = new Schema<IMatchHighlight>(
  {
    liveStreamId: {
      type: Schema.Types.ObjectId,
      ref: 'LiveStream',
      required: true,
      index: true,
    },
    eventType: { type: String, required: true, trim: true, maxlength: 80 },
    videoTimestampSeconds: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: '', maxlength: 300 },
    teamSide: { type: String, enum: ['A', 'B', ''], default: '' },
    playerId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
    playerName: { type: String, trim: true, default: '', maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    auditTrail: [
      {
        action: { type: String, enum: ['CREATED', 'UPDATED', 'DELETED'] },
        actorId: { type: Schema.Types.ObjectId, ref: 'User' },
        actorName: { type: String, trim: true },
        at: { type: Date, default: Date.now },
        note: { type: String, trim: true, default: '' },
      },
    ],
  },
  { timestamps: true }
);

matchHighlightSchema.index({ liveStreamId: 1, videoTimestampSeconds: 1 });

export const MatchHighlight = mongoose.model<IMatchHighlight>('MatchHighlight', matchHighlightSchema);
