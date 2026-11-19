import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';
import { createDualModel } from '../db/dualModel.ts';

export interface ITeam extends Document {
  name: string;
  shortName: string;
  logoUrl: string;
  sportType: SportType;
  city: string;
  captainName: string;
  bio: string;
  followersCount: number;
  tournamentId?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    shortName: { type: String, trim: true, default: '', maxlength: 12 },
    logoUrl: { type: String, trim: true, default: '' },
    sportType: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'],
      default: 'Cricket',
      index: true,
    },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    captainName: { type: String, trim: true, default: '', maxlength: 120 },
    bio: { type: String, trim: true, default: '', maxlength: 600 },
    followersCount: { type: Number, default: 0, min: 0 },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

teamSchema.index({ name: 1, sportType: 1 });

const MongooseTeam = mongoose.model<ITeam>('Team', teamSchema);
export const Team = createDualModel<ITeam>('teams', MongooseTeam);
