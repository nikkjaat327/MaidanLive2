import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface IChatReportItem {
  userId: mongoose.Types.ObjectId;
  reason: string;
  createdAt: Date;
}

export interface IChatMessage extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  userName: string;
  userRole: string;
  message: string;
  isDeleted: boolean;
  deletedBy?: mongoose.Types.ObjectId | null;
  reportedCount: number;
  reports: IChatReportItem[];
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, required: true, trim: true, maxlength: 120 },
    userRole: { type: String, trim: true, default: 'SPECTATOR' },
    message: { type: String, required: true, trim: true, maxlength: 400 },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reportedCount: { type: Number, default: 0, min: 0 },
    reports: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, trim: true, default: 'Abuse / Spam', maxlength: 200 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

chatMessageSchema.index({ liveStreamId: 1, createdAt: -1 });
chatMessageSchema.index({ reportedCount: -1, createdAt: -1 });

const MongooseChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
export const ChatMessage = createDualModel<IChatMessage>('chatmessages', MongooseChatMessage);
