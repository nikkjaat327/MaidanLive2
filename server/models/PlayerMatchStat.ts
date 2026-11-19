import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';
import { createDualModel } from '../db/dualModel.ts';

export interface IPlayerMatchStat extends Document {
  liveStreamId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  teamId?: mongoose.Types.ObjectId | null;
  playerId: mongoose.Types.ObjectId;
  sportType: SportType;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  wickets: number;
  oversBowledBalls: number;
  runsConceded: number;
  catches: number;
  raidPoints: number;
  tacklePoints: number;
  bonusPoints: number;
  superRaids: number;
  superTackles: number;
  attackPoints: number;
  blockPoints: number;
  serveAces: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  isMvp: boolean;
  appearances: number;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const playerMatchStatSchema = new Schema<IPlayerMatchStat>(
  {
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
    playerId: { type: Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
    sportType: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'],
      default: 'Cricket',
      index: true,
    },
    runs: { type: Number, default: 0, min: 0 },
    ballsFaced: { type: Number, default: 0, min: 0 },
    fours: { type: Number, default: 0, min: 0 },
    sixes: { type: Number, default: 0, min: 0 },
    wickets: { type: Number, default: 0, min: 0 },
    oversBowledBalls: { type: Number, default: 0, min: 0 },
    runsConceded: { type: Number, default: 0, min: 0 },
    catches: { type: Number, default: 0, min: 0 },
    raidPoints: { type: Number, default: 0, min: 0 },
    tacklePoints: { type: Number, default: 0, min: 0 },
    bonusPoints: { type: Number, default: 0, min: 0 },
    superRaids: { type: Number, default: 0, min: 0 },
    superTackles: { type: Number, default: 0, min: 0 },
    attackPoints: { type: Number, default: 0, min: 0 },
    blockPoints: { type: Number, default: 0, min: 0 },
    serveAces: { type: Number, default: 0, min: 0 },
    goals: { type: Number, default: 0, min: 0 },
    assists: { type: Number, default: 0, min: 0 },
    yellowCards: { type: Number, default: 0, min: 0 },
    redCards: { type: Number, default: 0, min: 0 },
    saves: { type: Number, default: 0, min: 0 },
    isMvp: { type: Boolean, default: false },
    appearances: { type: Number, default: 1, min: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

playerMatchStatSchema.index({ liveStreamId: 1, playerId: 1 }, { unique: true });

const MongoosePlayerMatchStat = mongoose.model<IPlayerMatchStat>(
  'PlayerMatchStat',
  playerMatchStatSchema
);
export const PlayerMatchStat = createDualModel<IPlayerMatchStat>(
  'playermatchstats',
  MongoosePlayerMatchStat
);
