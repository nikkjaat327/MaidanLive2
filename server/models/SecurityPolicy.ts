import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface ISecurityPolicy extends Document {
  key: string;
  enforceAdmin2FA: boolean;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  providerSwitchGraceSeconds: number;
  updatedBy?: mongoose.Types.ObjectId | null;
  updatedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const securityPolicySchema = new Schema<ISecurityPolicy>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    enforceAdmin2FA: { type: Boolean, default: false },
    maxFailedLoginAttempts: { type: Number, default: 5, min: 3, max: 20 },
    lockoutMinutes: { type: Number, default: 15, min: 1, max: 1440 },
    providerSwitchGraceSeconds: { type: Number, default: 15, min: 5, max: 120 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

const MongooseSecurityPolicy = mongoose.model<ISecurityPolicy>(
  'SecurityPolicy',
  securityPolicySchema
);
export const SecurityPolicy = createDualModel<ISecurityPolicy>(
  'securitypolicies',
  MongooseSecurityPolicy
);
