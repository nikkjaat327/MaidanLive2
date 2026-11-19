import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type:
    | 'MATCH_STARTING'
    | 'MATCH_LIVE'
    | 'FOLLOWED_TEAM'
    | 'SCORE_UPDATE'
    | 'WICKET'
    | 'INNINGS_BREAK'
    | 'SECOND_INNINGS_STARTED'
    | 'MATCH_RESULT'
    | 'MATCH_COMPLETED'
    | 'TOURNAMENT_PUBLISHED'
    | 'FIXTURE_PUBLISHED'
    | 'SYSTEM';
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  link: string;
  dedupeKey: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'MATCH_STARTING',
        'MATCH_LIVE',
        'FOLLOWED_TEAM',
        'SCORE_UPDATE',
        'WICKET',
        'INNINGS_BREAK',
        'SECOND_INNINGS_STARTED',
        'MATCH_RESULT',
        'MATCH_COMPLETED',
        'TOURNAMENT_PUBLISHED',
        'FIXTURE_PUBLISHED',
        'SYSTEM',
      ],
      default: 'SYSTEM',
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 400 },
    entityType: { type: String, trim: true, default: '' },
    entityId: { type: String, trim: true, default: '' },
    link: { type: String, trim: true, default: '' },
    dedupeKey: { type: String, trim: true, default: '' },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, sparse: true });

const MongooseNotification = mongoose.model<INotification>('Notification', notificationSchema);
export const Notification = createDualModel<INotification>('notifications', MongooseNotification);
