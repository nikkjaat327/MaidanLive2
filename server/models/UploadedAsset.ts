import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export interface IUploadedAsset extends Document {
  url: string;
  publicId: string;
  originalName: string;
  mimeType: string;
  format: string;
  resourceType: string;
  folder: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const uploadedAssetSchema = new Schema<IUploadedAsset>(
  {
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    publicId: { type: String, required: true, trim: true, maxlength: 400, index: true },
    originalName: { type: String, trim: true, default: '', maxlength: 260 },
    mimeType: { type: String, trim: true, default: '', maxlength: 120 },
    format: { type: String, trim: true, default: '', maxlength: 40 },
    resourceType: { type: String, trim: true, default: 'image', maxlength: 40 },
    folder: { type: String, trim: true, default: 'maidanlive/general', maxlength: 120 },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

uploadedAssetSchema.index({ createdAt: -1 });

export const UploadedAsset = mongoose.model<IUploadedAsset>('UploadedAsset', uploadedAssetSchema);
