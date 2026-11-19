import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type AssignmentScope = 'global' | 'tournament' | 'match' | 'team';

export interface IRoleAssignment extends Document {
  userId: mongoose.Types.ObjectId;
  role: string;
  scopeType: AssignmentScope;
  scopeId?: string;
  permissions: string[];
  assignedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const roleAssignmentSchema = new Schema<IRoleAssignment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true, trim: true },
    scopeType: {
      type: String,
      enum: ['global', 'tournament', 'match', 'team'],
      default: 'global',
      index: true,
    },
    scopeId: { type: String, trim: true, default: '' },
    permissions: [{ type: String, trim: true }],
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

roleAssignmentSchema.index({ userId: 1, scopeType: 1, scopeId: 1 });

const MongooseRoleAssignment = mongoose.model<IRoleAssignment>(
  'RoleAssignment',
  roleAssignmentSchema
);
export const RoleAssignment = createDualModel<IRoleAssignment>(
  'roleassignments',
  MongooseRoleAssignment
);
