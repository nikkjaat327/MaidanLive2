import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';
import type {
  GraphicsAnimationStyle,
  GraphicsDesignType,
  GraphicsElement,
  GraphicsLayoutPresetId,
  GraphicsScope,
} from '../../src/types/broadcastGraphics.ts';

export interface IBroadcastAdDesign extends Document {
  name: string;
  designType: GraphicsDesignType;
  isTemplate: boolean;
  scope: GraphicsScope;
  ownerUserId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  matchId?: mongoose.Types.ObjectId | null;
  canvasWidth: number;
  canvasHeight: number;
  layoutPreset: GraphicsLayoutPresetId;
  elements: GraphicsElement[];
  entryAnimation: GraphicsAnimationStyle;
  exitAnimation: GraphicsAnimationStyle;
  defaultDurationSeconds: number;
  thumbnailDataUrl: string;
  usageCount: number;
  lastUsedAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastAdDesignSchema = new Schema<IBroadcastAdDesign>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    designType: {
      type: String,
      enum: ['banner', 'lower_third', 'logo', 'qr', 'side_ad', 'full_banner', 'event_promo', 'custom'],
      default: 'custom',
      index: true,
    },
    isTemplate: { type: Boolean, default: false, index: true },
    scope: {
      type: String,
      enum: ['global', 'tournament', 'match'],
      default: 'global',
      index: true,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    canvasWidth: { type: Number, default: 1920, min: 320, max: 3840 },
    canvasHeight: { type: Number, default: 1080, min: 320, max: 3840 },
    layoutPreset: { type: String, trim: true, default: 'custom_position', maxlength: 60 },
    elements: { type: Schema.Types.Mixed, default: [] },
    entryAnimation: { type: String, trim: true, default: 'slide-bottom', maxlength: 40 },
    exitAnimation: { type: String, trim: true, default: 'fade-out', maxlength: 40 },
    defaultDurationSeconds: { type: Number, default: 10, min: 0, max: 86400 },
    thumbnailDataUrl: { type: String, default: '', maxlength: 90000 },
    usageCount: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

broadcastAdDesignSchema.index({ scope: 1, isTemplate: 1, updatedAt: -1 });
broadcastAdDesignSchema.index({ ownerUserId: 1, updatedAt: -1 });
broadcastAdDesignSchema.index({ tournamentId: 1, updatedAt: -1 });
broadcastAdDesignSchema.index({ matchId: 1, updatedAt: -1 });

const MongooseBroadcastAdDesign = mongoose.model<IBroadcastAdDesign>(
  'BroadcastAdDesign',
  broadcastAdDesignSchema
);
export const BroadcastAdDesign = createDualModel<IBroadcastAdDesign>(
  'broadcastaddesigns',
  MongooseBroadcastAdDesign
);
