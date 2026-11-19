import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export interface IPollOption {
  id: string;
  label: string;
  votes: number;
}

export interface IPollVote {
  userId: mongoose.Types.ObjectId;
  optionId: string;
  votedAt: Date;
}

export interface IPoll extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  question: string;
  options: IPollOption[];
  voters: IPollVote[];
  status: 'OPEN' | 'CLOSED';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pollSchema = new Schema<IPoll>(
  {
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    question: { type: String, required: true, trim: true, maxlength: 240 },
    options: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true, trim: true, maxlength: 120 },
        votes: { type: Number, default: 0, min: 0 },
      },
    ],
    voters: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        optionId: { type: String, required: true },
        votedAt: { type: Date, default: Date.now },
      },
    ],
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

pollSchema.index({ liveStreamId: 1, status: 1, createdAt: -1 });

export const Poll = mongoose.model<IPoll>('Poll', pollSchema);
