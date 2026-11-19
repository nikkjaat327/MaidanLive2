import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';

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
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const Player = mongoose.model<IPlayer>('Player', playerSchema);
