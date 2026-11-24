import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';
import type { MultiCameraLayoutType } from './ObsControllerProfile.ts';
import type { OverlayMode, OverlayPosition } from '../../src/utils/overlayConfig.ts';

export interface IBroadcastScene extends Document {
  matchId: mongoose.Types.ObjectId;
  name: string;
  label: string;
  obsSceneName: string;
  layoutType: MultiCameraLayoutType;
  cameraIds: string[];
  mainCameraId: string;
  pipPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  pipSize?: 'small' | 'medium' | 'large';
  includeScoreboardOverlay: boolean;
  overlayMode: OverlayMode;
  overlayPosition: OverlayPosition;
  sponsorIds: string[];
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const broadcastSceneSchema = new Schema<IBroadcastScene>(
  {
    matchId: { type: Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    label: { type: String, trim: true, default: '', maxlength: 120 },
    obsSceneName: { type: String, required: true, trim: true, maxlength: 120 },
    layoutType: {
      type: String,
      enum: [
        'SINGLE',
        'SPLIT_2_H',
        'SPLIT_2_V',
        'SPLIT_3',
        'GRID_4',
        'GRID_5',
        'GRID_6',
        'PIP',
        'MAIN_PLUS_SECONDARY',
        'DYNAMIC_GRID',
        'SPORT_BROADCAST',
      ],
      default: 'SINGLE',
    },
    cameraIds: [{ type: String, trim: true }],
    mainCameraId: { type: String, trim: true, default: '' },
    pipPosition: {
      type: String,
      enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      default: 'bottom-right',
    },
    pipSize: {
      type: String,
      enum: ['small', 'medium', 'large'],
      default: 'medium',
    },
    includeScoreboardOverlay: { type: Boolean, default: true },
    overlayMode: {
      type: String,
      enum: ['full', 'compact', 'score_only', 'hidden'],
      default: 'full',
    },
    overlayPosition: {
      type: String,
      enum: [
        'top-left',
        'top-center',
        'top-right',
        'bottom-left',
        'bottom-center',
        'bottom-right',
      ],
      default: 'bottom-center',
    },
    sponsorIds: [{ type: String, trim: true }],
    isDefault: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 1, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

broadcastSceneSchema.index({ matchId: 1, sortOrder: 1 });

const MongooseBroadcastScene = mongoose.model<IBroadcastScene>(
  'BroadcastScene',
  broadcastSceneSchema
);
export const BroadcastScene = createDualModel<IBroadcastScene>(
  'broadcastscenes',
  MongooseBroadcastScene
);
