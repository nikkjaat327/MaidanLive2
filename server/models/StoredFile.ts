import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type StoredFilePurpose = 'VERIFICATION_DOC' | 'PAYMENT_PROOF';
export type StoredFileSource = 'DEVICE' | 'GOOGLE_DRIVE';

export interface IStoredFile extends Document {
  ownerUserId: mongoose.Types.ObjectId;
  tournamentId?: mongoose.Types.ObjectId | null;
  registrationId?: mongoose.Types.ObjectId | null;
  purpose: StoredFilePurpose;
  source: StoredFileSource;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  driveFileId: string;
  driveWebViewLink: string;
  dataBase64: string;
  createdAt: Date;
  updatedAt: Date;
}

const storedFileSchema = new Schema<IStoredFile>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    registrationId: {
      type: Schema.Types.ObjectId,
      ref: 'TournamentRegistration',
      default: null,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['VERIFICATION_DOC', 'PAYMENT_PROOF'],
      default: 'VERIFICATION_DOC',
      index: true,
    },
    source: {
      type: String,
      enum: ['DEVICE', 'GOOGLE_DRIVE'],
      default: 'DEVICE',
    },
    fileName: { type: String, required: true, trim: true, maxlength: 260 },
    mimeType: { type: String, required: true, trim: true, maxlength: 120 },
    sizeBytes: { type: Number, required: true, min: 0 },
    driveFileId: { type: String, trim: true, default: '', maxlength: 200 },
    driveWebViewLink: { type: String, trim: true, default: '', maxlength: 500 },
    dataBase64: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

const MongooseStoredFile = mongoose.model<IStoredFile>('StoredFile', storedFileSchema);
export const StoredFile = createDualModel<IStoredFile>('storedfiles', MongooseStoredFile);
