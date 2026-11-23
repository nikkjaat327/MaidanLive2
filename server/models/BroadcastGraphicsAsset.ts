import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';
import type { GraphicsAssetType, GraphicsScope } from '../../src/types/broadcastGraphics.ts';

export interface IBroadcastGraphicsAsset extends Document {
  ownerUserId: mongoose.Types.ObjectId;
  scope: GraphicsScope;
  tournamentId?: mongoose.Types.ObjectId | null;
  matchId?: mongoose.Types.ObjectId | null;
  name: string;
  assetType: GraphicsAssetType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  url: string;
  dataBase64: string;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastGraphicsAssetSchema = new Schema<IBroadcastGraphicsAsset>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: {
      type: String,
      enum: ['global', 'tournament', 'match'],
      default: 'global',
      index: true,
    },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 140 },
    assetType: {
      type: String,
      enum: ['logo', 'banner', 'promo', 'background'],
      default: 'banner',
      index: true,
    },
    fileName: { type: String, required: true, trim: true, maxlength: 240 },
    mimeType: { type: String, required: true, trim: true, maxlength: 120 },
    sizeBytes: { type: Number, required: true, min: 0 },
    width: { type: Number, default: 0, min: 0 },
    height: { type: Number, default: 0, min: 0 },
    cloudinaryUrl: { type: String, trim: true, default: '', maxlength: 1000 },
    cloudinaryPublicId: { type: String, trim: true, default: '', maxlength: 300 },
    url: { type: String, trim: true, default: '', maxlength: 1000 },
    dataBase64: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

broadcastGraphicsAssetSchema.index({ ownerUserId: 1, assetType: 1, updatedAt: -1 });
broadcastGraphicsAssetSchema.index({ scope: 1, updatedAt: -1 });

const MongooseBroadcastGraphicsAsset = mongoose.model<IBroadcastGraphicsAsset>(
  'BroadcastGraphicsAsset',
  broadcastGraphicsAssetSchema
);
export const BroadcastGraphicsAsset = createDualModel<IBroadcastGraphicsAsset>(
  'broadcastgraphicsassets',
  MongooseBroadcastGraphicsAsset
);
