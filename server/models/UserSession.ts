import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface IUserSession extends Document {
  userId: mongoose.Types.ObjectId;
  portal: 'admin' | 'customer';
  refreshTokenHash: string;
  previousRefreshTokenHash?: string;
  previousTokenGraceUntil?: Date | null;
  userAgent: string;
  ipAddress: string;
  isRevoked: boolean;
  revokedAt?: Date | null;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSessionSchema = new Schema<IUserSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    portal: { type: String, enum: ['admin', 'customer'], default: 'customer' },
    refreshTokenHash: { type: String, required: true, index: true },
    previousRefreshTokenHash: { type: String, default: '', index: true },
    previousTokenGraceUntil: { type: Date, default: null },
    userAgent: { type: String, trim: true, default: '', maxlength: 300 },
    ipAddress: { type: String, trim: true, default: '', maxlength: 100 },
    isRevoked: { type: Boolean, default: false, index: true },
    revokedAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

const MongooseUserSession = mongoose.model<IUserSession>('UserSession', userSessionSchema);
export const UserSession = createDualModel<IUserSession>('usersessions', MongooseUserSession);
