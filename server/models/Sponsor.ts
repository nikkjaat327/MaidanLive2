import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type SponsorPlacement = 'live_match' | 'home_feed' | 'tournament_banner';

export interface ISponsor extends Document {
  name: string;
  logoUrl: string;
  websiteUrl: string;
  contactInfo: string;
  sponsorshipType: string;
  placement: SponsorPlacement;
  tagline: string;
  ctaText: string;
  impressionsCount: number;
  clicksCount: number;
  tournamentId?: mongoose.Types.ObjectId | null;
  liveStreamId?: mongoose.Types.ObjectId | null;
  isPublished: boolean;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sponsorSchema = new Schema<ISponsor>(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    logoUrl: { type: String, trim: true, default: '' },
    websiteUrl: { type: String, trim: true, default: '', maxlength: 300 },
    contactInfo: { type: String, trim: true, default: '', maxlength: 200 },
    sponsorshipType: { type: String, trim: true, default: 'Broadcast Partner', maxlength: 80 },
    placement: {
      type: String,
      enum: ['live_match', 'home_feed', 'tournament_banner'],
      default: 'live_match',
      index: true,
    },
    tagline: { type: String, trim: true, default: '', maxlength: 200 },
    ctaText: { type: String, trim: true, default: 'Visit Partner', maxlength: 60 },
    impressionsCount: { type: Number, default: 0, min: 0 },
    clicksCount: { type: Number, default: 0, min: 0 },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    isPublished: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const MongooseSponsor = mongoose.model<ISponsor>('Sponsor', sponsorSchema);
export const Sponsor = createDualModel<ISponsor>('sponsors', MongooseSponsor);

export interface ISponsorOverlay extends Document {
  sponsorId: mongoose.Types.ObjectId;
  liveStreamId?: mongoose.Types.ObjectId | null;
  tournamentId?: mongoose.Types.ObjectId | null;
  position: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
  durationSeconds: number;
  displayOrder: number;
  mode: 'BANNER' | 'ANNOUNCEMENT';
  announcementText: string;
  isVisible: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const sponsorOverlaySchema = new Schema<ISponsorOverlay>(
  {
    sponsorId: { type: Schema.Types.ObjectId, ref: 'Sponsor', required: true, index: true },
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    position: { type: String, enum: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'], default: 'BOTTOM' },
    durationSeconds: { type: Number, default: 12, min: 3, max: 300 },
    displayOrder: { type: Number, default: 1, min: 1 },
    mode: { type: String, enum: ['BANNER', 'ANNOUNCEMENT'], default: 'BANNER' },
    announcementText: { type: String, trim: true, default: '', maxlength: 180 },
    isVisible: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const MongooseSponsorOverlay = mongoose.model<ISponsorOverlay>('SponsorOverlay', sponsorOverlaySchema);
export const SponsorOverlay = createDualModel<ISponsorOverlay>(
  'sponsoroverlays',
  MongooseSponsorOverlay
);
