import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface IRosterPlayerEntry {
  name: string;
  role: string;
  jerseyNumber?: number | null;
  dateOfBirth: string;
  isMinor: boolean;
  guardianName?: string;
  guardianPhone?: string;
  guardianConsent?: boolean;
}

export interface ITournamentRegistration extends Document {
  tournamentId: mongoose.Types.ObjectId;
  captainUserId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId | null;
  teamName: string;
  teamShortName: string;
  teamLogoUrl: string;
  city: string;
  captainName: string;
  captainPhone: string;
  captainEmail: string;
  verificationDocUrl: string;
  verificationNotes: string;
  roster: IRosterPlayerEntry[];
  feeAmount: number;
  feeStatus: 'WAIVED' | 'PENDING' | 'PAID';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  reviewNotes: string;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentRegistrationSchema = new Schema<ITournamentRegistration>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true,
    },
    captainUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamName: { type: String, required: true, trim: true, maxlength: 120 },
    teamShortName: { type: String, trim: true, default: '', maxlength: 12 },
    teamLogoUrl: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    captainName: { type: String, required: true, trim: true, maxlength: 120 },
    captainPhone: { type: String, trim: true, default: '', maxlength: 30 },
    captainEmail: { type: String, trim: true, default: '', maxlength: 160 },
    verificationDocUrl: { type: String, trim: true, default: '', select: false },
    verificationNotes: { type: String, trim: true, default: '', maxlength: 500, select: false },
    roster: [
      {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        role: { type: String, trim: true, default: '', maxlength: 80 },
        jerseyNumber: { type: Number, default: null },
        dateOfBirth: { type: String, trim: true, default: '' },
        isMinor: { type: Boolean, default: false },
        guardianName: { type: String, trim: true, default: '', maxlength: 120 },
        guardianPhone: { type: String, trim: true, default: '', maxlength: 30 },
        guardianConsent: { type: Boolean, default: false },
      },
    ],
    feeAmount: { type: Number, default: 0, min: 0 },
    feeStatus: {
      type: String,
      enum: ['WAIVED', 'PENDING', 'PAID'],
      default: 'WAIVED',
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
      default: 'PENDING',
      index: true,
    },
    reviewNotes: { type: String, trim: true, default: '', maxlength: 400 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tournamentRegistrationSchema.index({ tournamentId: 1, status: 1 });

const MongooseTournamentRegistration = mongoose.model<ITournamentRegistration>(
  'TournamentRegistration',
  tournamentRegistrationSchema
);
export const TournamentRegistration = createDualModel<ITournamentRegistration>(
  'tournamentregistrations',
  MongooseTournamentRegistration
);
