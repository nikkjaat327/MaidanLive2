import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import type { SportType } from './LiveStream.ts';
import type { TournamentFormat } from './Tournament.ts';
import { createDualModel } from '../db/dualModel.ts';

export interface ITournamentTemplate extends Document {
  name: string;
  sportType: SportType;
  format: TournamentFormat;
  groupCount: number;
  location: string;
  prizeMoney: string;
  registrationFee: number;
  rules: string;
  qualificationRules: string;
  description: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentTemplateSchema = new Schema<ITournamentTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    sportType: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other'],
      default: 'Cricket',
    },
    format: {
      type: String,
      enum: ['KNOCKOUT', 'LEAGUE', 'GROUP_STAGE', 'GROUP_KNOCKOUT'],
      default: 'KNOCKOUT',
    },
    groupCount: { type: Number, default: 2, min: 1, max: 8 },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    prizeMoney: { type: String, trim: true, default: '', maxlength: 120 },
    registrationFee: { type: Number, default: 0, min: 0 },
    rules: { type: String, trim: true, default: '', maxlength: 2000 },
    qualificationRules: { type: String, trim: true, default: '', maxlength: 400 },
    description: { type: String, trim: true, default: '', maxlength: 1500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const MongooseTournamentTemplate = mongoose.model<ITournamentTemplate>(
  'TournamentTemplate',
  tournamentTemplateSchema
);
export const TournamentTemplate = createDualModel<ITournamentTemplate>(
  'tournamenttemplates',
  MongooseTournamentTemplate
);
