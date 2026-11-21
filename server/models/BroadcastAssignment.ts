import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type BroadcastAssignmentScope = 'tournament' | 'match';
export type BroadcastAssignmentStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface IBroadcastAssignment extends Document {
  userId: mongoose.Types.ObjectId;
  role: 'BROADCASTER' | 'SCORER' | 'CAMERA_OPERATOR';
  scopeType: BroadcastAssignmentScope;
  tournamentId?: mongoose.Types.ObjectId | null;
  matchId?: mongoose.Types.ObjectId | null;
  status: BroadcastAssignmentStatus;
  permissions: string[];
  assignedBy: mongoose.Types.ObjectId;
  assignedByName: string;
  notes: string;
  suspendedAt?: Date | null;
  revokedAt?: Date | null;
  revokedBy?: mongoose.Types.ObjectId | null;
  revokeReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastAssignmentSchema = new Schema<IBroadcastAssignment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: {
      type: String,
      enum: ['BROADCASTER', 'SCORER', 'CAMERA_OPERATOR'],
      default: 'BROADCASTER',
      index: true,
    },
    scopeType: {
      type: String,
      enum: ['tournament', 'match'],
      required: true,
      index: true,
    },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED', 'REVOKED'],
      default: 'ACTIVE',
      index: true,
    },
    permissions: [{ type: String, trim: true }],
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedByName: { type: String, trim: true, default: '', maxlength: 120 },
    notes: { type: String, trim: true, default: '', maxlength: 300 },
    suspendedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, trim: true, default: '', maxlength: 240 },
  },
  { timestamps: true }
);

broadcastAssignmentSchema.index({ userId: 1, status: 1, scopeType: 1 });
broadcastAssignmentSchema.index({ tournamentId: 1, status: 1 });
broadcastAssignmentSchema.index({ matchId: 1, status: 1 });

const MongooseBroadcastAssignment = mongoose.model<IBroadcastAssignment>(
  'BroadcastAssignment',
  broadcastAssignmentSchema
);
export const BroadcastAssignment = createDualModel<IBroadcastAssignment>(
  'broadcastassignments',
  MongooseBroadcastAssignment
);
