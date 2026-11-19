import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type FixtureStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'BYE' | 'CANCELLED';

export interface IFixture extends Document {
  tournamentId: mongoose.Types.ObjectId;
  roundNumber: number;
  roundName: string;
  groupName: string;
  matchFormat: string;
  matchNumber: number;
  teamAId?: mongoose.Types.ObjectId | null;
  teamBId?: mongoose.Types.ObjectId | null;
  teamAName: string;
  teamBName: string;
  teamALogo: string;
  teamBLogo: string;
  venueId?: mongoose.Types.ObjectId | null;
  location: string;
  scheduledAt?: Date | null;
  liveStreamId?: mongoose.Types.ObjectId | null;
  authorizedScorerId?: mongoose.Types.ObjectId | null;
  backupScorerId?: mongoose.Types.ObjectId | null;
  status: FixtureStatus;
  isBye: boolean;
  winnerTeamId?: mongoose.Types.ObjectId | null;
  winnerTeamName: string;
  nextFixtureId?: mongoose.Types.ObjectId | null;
  nextFixtureSlot: 'A' | 'B' | '';
  resultConfirmed: boolean;
  resultSummary: string;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const fixtureSchema = new Schema<IFixture>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true,
    },
    roundNumber: { type: Number, required: true, min: 1 },
    roundName: { type: String, required: true, trim: true, maxlength: 100 },
    groupName: { type: String, trim: true, default: '', maxlength: 60 },
    matchFormat: { type: String, trim: true, default: '', maxlength: 80 },
    matchNumber: { type: Number, required: true, min: 1 },
    teamAId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamBId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamAName: { type: String, trim: true, default: 'TBD', maxlength: 120 },
    teamBName: { type: String, trim: true, default: 'TBD', maxlength: 120 },
    teamALogo: { type: String, trim: true, default: '' },
    teamBLogo: { type: String, trim: true, default: '' },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', default: null },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    scheduledAt: { type: Date, default: null },
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    authorizedScorerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    backupScorerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['SCHEDULED', 'LIVE', 'COMPLETED', 'BYE', 'CANCELLED'],
      default: 'SCHEDULED',
      index: true,
    },
    isBye: { type: Boolean, default: false },
    winnerTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    winnerTeamName: { type: String, trim: true, default: '', maxlength: 120 },
    nextFixtureId: { type: Schema.Types.ObjectId, ref: 'Fixture', default: null },
    nextFixtureSlot: { type: String, enum: ['A', 'B', ''], default: '' },
    resultConfirmed: { type: Boolean, default: false },
    resultSummary: { type: String, trim: true, default: '', maxlength: 300 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

fixtureSchema.index({ tournamentId: 1, roundNumber: 1, matchNumber: 1 });

const MongooseFixture = mongoose.model<IFixture>('Fixture', fixtureSchema);
export const Fixture = createDualModel<IFixture>('fixtures', MongooseFixture);
