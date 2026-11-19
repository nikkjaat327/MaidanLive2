import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export interface ISponsor extends Document {
  name: string;
  logoUrl: string;
  websiteUrl: string;
  contactInfo: string;
  sponsorshipType: string;
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
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    liveStreamId: { type: Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    isPublished: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Sponsor = mongoose.model<ISponsor>('Sponsor', sponsorSchema);

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

export const SponsorOverlay = mongoose.model<ISponsorOverlay>('SponsorOverlay', sponsorOverlaySchema);
