import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface IObsBridgePairing extends Document {
  codeHash: string;
  codePrefix: string;
  createdByUserId: mongoose.Types.ObjectId;
  ownerName: string;
  ownerEmail: string;
  tournamentId?: mongoose.Types.ObjectId | null;
  matchId?: mongoose.Types.ObjectId | null;
  bridgeId?: string;
  label: string;
  requestedOrigin: string;
  expiresAt: Date;
  usedAt?: Date | null;
  usedByBridgeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const obsBridgePairingSchema = new Schema<IObsBridgePairing>(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    codePrefix: { type: String, default: '', maxlength: 20 },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerName: { type: String, default: '', maxlength: 120 },
    ownerEmail: { type: String, default: '', maxlength: 180 },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null },
    bridgeId: { type: String, default: '', uppercase: true, maxlength: 40 },
    label: { type: String, default: '', maxlength: 140 },
    requestedOrigin: { type: String, default: '', maxlength: 300 },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    usedByBridgeId: { type: String, default: '' },
  },
  { timestamps: true }
);

obsBridgePairingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

const MongooseObsBridgePairing = mongoose.model<IObsBridgePairing>(
  'ObsBridgePairing',
  obsBridgePairingSchema
);
export const ObsBridgePairing = createDualModel<IObsBridgePairing>(
  'obsbridgepairings',
  MongooseObsBridgePairing
);
