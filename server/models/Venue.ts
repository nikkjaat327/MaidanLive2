import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export interface IVenue extends Document {
  name: string;
  address: string;
  city: string;
  state: string;
  details: string;
  latitude?: number | null;
  longitude?: number | null;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const venueSchema = new Schema<IVenue>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    address: { type: String, trim: true, default: '', maxlength: 280 },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    state: { type: String, trim: true, default: '', maxlength: 100 },
    details: { type: String, trim: true, default: '', maxlength: 600 },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

venueSchema.index({ name: 1, city: 1 });

export const Venue = mongoose.model<IVenue>('Venue', venueSchema);
