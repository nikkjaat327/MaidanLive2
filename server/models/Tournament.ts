import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';
import { createDualModel } from '../db/dualModel.ts';

export type TournamentFormat = 'KNOCKOUT' | 'LEAGUE' | 'GROUP_STAGE' | 'GROUP_KNOCKOUT';
export type TournamentPaymentMode = 'NONE' | 'ENTRY_FEE' | 'SECURITY_DEPOSIT';

export interface ITournamentPosition {
  rank: number;
  label: string;
  teamId?: mongoose.Types.ObjectId | null;
  teamName: string;
  prizeNote?: string;
}

export interface ITournamentBestPlayer {
  mode: 'NONE' | 'PLAYER' | 'MANUAL';
  playerId?: mongoose.Types.ObjectId | null;
  playerName: string;
  teamId?: mongoose.Types.ObjectId | null;
  teamName?: string;
  title?: string;
  performanceNote?: string;
}

export interface ITournamentCustomAwardField {
  id: string;
  label: string;
  value: string;
}

export interface ITournamentPrizeTier {
  amount?: string;
  label?: string;
}

export interface ITournamentPrizes {
  first?: ITournamentPrizeTier;
  second?: ITournamentPrizeTier;
  third?: ITournamentPrizeTier;
}

export interface ITournament extends Document {
  name: string;
  sportType: SportType;
  format: TournamentFormat;
  logoUrl: string;
  location: string;
  googleMapsUrl: string;
  venueId?: mongoose.Types.ObjectId | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  description: string;
  rules: string;
  prizeMoney: string;
  prizes?: ITournamentPrizes;
  registrationOpen: boolean;
  paymentMode: TournamentPaymentMode;
  registrationFee: number;
  securityDepositAmount: number;
  refundPolicy: string;
  paymentInstructions: string;
  groupCount: number;
  qualificationRules: string;
  organizerName: string;
  season: string;
  isPublished: boolean;
  followersCount?: number;
  teamIds: mongoose.Types.ObjectId[];
  positions: ITournamentPosition[];
  bestPlayer?: ITournamentBestPlayer | null;
  customAwardFields: ITournamentCustomAwardField[];
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const prizeTierSchema = new Schema(
  {
    amount: { type: String, trim: true, default: '', maxlength: 80 },
    label: { type: String, trim: true, default: '', maxlength: 120 },
  },
  { _id: false }
);

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
    googleMapsUrl: { type: String, trim: true, default: '', maxlength: 600 },
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
    prizes: {
      type: {
        first: { type: prizeTierSchema, default: undefined },
        second: { type: prizeTierSchema, default: undefined },
        third: { type: prizeTierSchema, default: undefined },
      },
      default: undefined,
    },
    registrationOpen: { type: Boolean, default: true },
    paymentMode: {
      type: String,
      enum: ['NONE', 'ENTRY_FEE', 'SECURITY_DEPOSIT'],
      default: 'NONE',
    },
    registrationFee: { type: Number, default: 0, min: 0 },
    securityDepositAmount: { type: Number, default: 0, min: 0 },
    refundPolicy: { type: String, trim: true, default: '', maxlength: 600 },
    paymentInstructions: { type: String, trim: true, default: '', maxlength: 600 },
    groupCount: { type: Number, default: 2, min: 1, max: 8 },
    qualificationRules: { type: String, trim: true, default: '', maxlength: 400 },
    organizerName: { type: String, trim: true, default: '', maxlength: 120 },
    season: { type: String, trim: true, default: '', maxlength: 60 },
    isPublished: { type: Boolean, default: true, index: true },
    followersCount: { type: Number, default: 0, min: 0 },
    teamIds: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
    positions: [
      {
        rank: { type: Number, required: true, min: 1 },
        label: { type: String, trim: true, required: true, maxlength: 80 },
        teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
        teamName: { type: String, trim: true, default: '', maxlength: 140 },
        prizeNote: { type: String, trim: true, default: '', maxlength: 240 },
      },
    ],
    bestPlayer: {
      mode: { type: String, enum: ['NONE', 'PLAYER', 'MANUAL'], default: 'NONE' },
      playerId: { type: Schema.Types.ObjectId, ref: 'Player', default: null },
      playerName: { type: String, trim: true, default: '', maxlength: 140 },
      teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
      teamName: { type: String, trim: true, default: '', maxlength: 140 },
      title: { type: String, trim: true, default: 'Player of the Tournament', maxlength: 100 },
      performanceNote: { type: String, trim: true, default: '', maxlength: 240 },
    },
    customAwardFields: [
      {
        id: { type: String, trim: true, required: true, maxlength: 60 },
        label: { type: String, trim: true, required: true, maxlength: 100 },
        value: { type: String, trim: true, default: '', maxlength: 240 },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const MongooseTournament = mongoose.model<ITournament>('Tournament', tournamentSchema);
export const Tournament = createDualModel<ITournament>('tournaments', MongooseTournament);
