import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface IActivityLog extends Document {
  actorId: mongoose.Types.ObjectId;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorName: { type: String, required: true, trim: true },
    actorRole: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true, maxlength: 120, index: true },
    resourceType: { type: String, required: true, trim: true, maxlength: 80, index: true },
    resourceId: { type: String, trim: true, default: '' },
    details: { type: String, trim: true, default: '', maxlength: 500 },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ createdAt: -1 });

const MongooseActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
export const ActivityLog = createDualModel<IActivityLog>('activitylogs', MongooseActivityLog);
