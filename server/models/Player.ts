import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';
import { createDualModel } from '../db/dualModel.ts';

export interface IPlayer extends Document {
  name: string;
  teamId?: mongoose.Types.ObjectId | null;
  sportType: SportType;
  role: string;
  position: string;
  battingStyle: string;
  bowlingStyle: string;
  bio: string;
  jerseyNumber?: number | null;
  avatarUrl: string;
  dateOfBirth?: string;
  isMinor?: boolean;
  isVerified?: boolean;
  verifiedBy?: mongoose.Types.ObjectId | null;
  followersCount?: number;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const playerSchema = new Schema<IPlayer>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
    sportType: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'],
      default: 'Cricket',
      index: true,
    },
    role: { type: String, trim: true, default: '', maxlength: 80 },
    position: { type: String, trim: true, default: '', maxlength: 80 },
    battingStyle: { type: String, trim: true, default: '', maxlength: 80 },
    bowlingStyle: { type: String, trim: true, default: '', maxlength: 80 },
    bio: { type: String, trim: true, default: '', maxlength: 600 },
    jerseyNumber: { type: Number, default: null, min: 0, max: 999 },
    avatarUrl: { type: String, trim: true, default: '' },
    dateOfBirth: { type: String, trim: true, default: '' },
    isMinor: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    followersCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

const MongoosePlayer = mongoose.model<IPlayer>('Player', playerSchema);
export const Player = createDualModel<IPlayer>('players', MongoosePlayer);
