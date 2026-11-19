import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';
import { createDualModel } from '../db/dualModel.ts';

export type TournamentFormat = 'KNOCKOUT' | 'LEAGUE' | 'GROUP_STAGE' | 'GROUP_KNOCKOUT';

export interface ITournament extends Document {
  name: string;
  sportType: SportType;
  format: TournamentFormat;
  logoUrl: string;
  location: string;
  venueId?: mongoose.Types.ObjectId | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  description: string;
  rules: string;
  prizeMoney: string;
  registrationOpen: boolean;
  registrationFee: number;
  groupCount: number;
  qualificationRules: string;
  organizerName: string;
  season: string;
  isPublished: boolean;
  teamIds: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentSchema = new Schema<ITournament>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    sportType: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'],
      default: 'Cricket',
      index: true,
    },
    format: {
      type: String,
      enum: ['KNOCKOUT', 'LEAGUE', 'GROUP_STAGE', 'GROUP_KNOCKOUT'],
      default: 'LEAGUE',
    },
    logoUrl: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['UPCOMING', 'ONGOING', 'COMPLETED'],
      default: 'UPCOMING',
      index: true,
    },
    description: { type: String, trim: true, default: '', maxlength: 1500 },
    rules: { type: String, trim: true, default: '', maxlength: 2000 },
    prizeMoney: { type: String, trim: true, default: '', maxlength: 120 },
    registrationOpen: { type: Boolean, default: true },
    registrationFee: { type: Number, default: 0, min: 0 },
    groupCount: { type: Number, default: 2, min: 1, max: 8 },
    qualificationRules: { type: String, trim: true, default: '', maxlength: 400 },
    organizerName: { type: String, trim: true, default: '', maxlength: 120 },
    season: { type: String, trim: true, default: '', maxlength: 60 },
    isPublished: { type: Boolean, default: true, index: true },
    teamIds: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const MongooseTournament = mongoose.model<ITournament>('Tournament', tournamentSchema);
export const Tournament = createDualModel<ITournament>('tournaments', MongooseTournament);
