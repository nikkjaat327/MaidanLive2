import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type RegistrationStatus =
  | 'PENDING'
  | 'PENDING_REAPPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type PaymentVerificationStatus =
  | 'NOT_REQUIRED'
  | 'PAYMENT_PENDING'
  | 'PROOF_SUBMITTED'
  | 'UNDER_VERIFICATION'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED';

export type DepositRefundStatus =
  | 'NOT_APPLICABLE'
  | 'HELD'
  | 'REFUND_INITIATED'
  | 'REFUNDED'
  | 'FORFEITED';

export interface IRosterPlayerEntry {
  name: string;
  role: string;
  jerseyNumber?: number | null;
  dateOfBirth: string;
  isMinor: boolean;
  guardianName?: string;
  guardianPhone?: string;
  guardianConsent?: boolean;
}

export interface IStoredDocMeta {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  source: 'DEVICE' | 'GOOGLE_DRIVE';
  driveFileId?: string;
  uploadedAt: Date;
}

export interface ITeamEditHistoryItem {
  editNumber: number;
  editedBy: mongoose.Types.ObjectId;
  editedByName: string;
  editedAt: Date;
  previousStatus: RegistrationStatus;
  changesSummary: string;
  previousData: Record<string, any>;
  reviewStatus?: 'PENDING_REAPPROVAL' | 'APPROVED' | 'REJECTED';
  reviewedByName?: string;
  reviewedAt?: Date | null;
  reviewNotes?: string;
}

export interface IPaymentHistoryItem {
  action: string;
  status: PaymentVerificationStatus | DepositRefundStatus;
  actorId: mongoose.Types.ObjectId;
  actorName: string;
  timestamp: Date;
  notes?: string;
  fileId?: string;
  fileName?: string;
}

export interface ITournamentRegistration extends Document {
  tournamentId: mongoose.Types.ObjectId;
  captainUserId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId | null;
  teamName: string;
  teamShortName: string;
  teamLogoUrl: string;
  city: string;
  captainName: string;
  captainPhone: string;
  captainEmail: string;
  verificationDocUrl: string;
  verificationDocId?: mongoose.Types.ObjectId | null;
  verificationDocMeta?: IStoredDocMeta | null;
  verificationNotes: string;
  roster: IRosterPlayerEntry[];
  feeAmount: number;
  feeStatus: 'WAIVED' | 'PENDING' | 'PAID';
  paymentType: 'NONE' | 'ENTRY_FEE' | 'SECURITY_DEPOSIT';
  paymentStatus: PaymentVerificationStatus;
  refundStatus: DepositRefundStatus;
  paymentProofFileId?: mongoose.Types.ObjectId | null;
  paymentProofMeta?: IStoredDocMeta | null;
  paymentSubmittedAt?: Date | null;
  paymentVerifiedBy?: mongoose.Types.ObjectId | null;
  paymentVerifiedByName?: string;
  paymentVerifiedAt?: Date | null;
  paymentRejectionReason?: string;
  paymentReferenceNote?: string;
  paymentHistory: IPaymentHistoryItem[];
  editCount: number;
  maxEditsAfterApproval: number;
  previousApprovalSnapshot?: Record<string, any> | null;
  editHistory: ITeamEditHistoryItem[];
  status: RegistrationStatus;
  reviewNotes: string;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const storedDocMetaSchema = new Schema(
  {
    fileId: { type: String, trim: true, default: '' },
    fileName: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    sizeBytes: { type: Number, default: 0 },
    source: { type: String, enum: ['DEVICE', 'GOOGLE_DRIVE'], default: 'DEVICE' },
    driveFileId: { type: String, trim: true, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const tournamentRegistrationSchema = new Schema<ITournamentRegistration>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true,
    },
    captainUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamName: { type: String, required: true, trim: true, maxlength: 120 },
    teamShortName: { type: String, trim: true, default: '', maxlength: 12 },
    teamLogoUrl: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    captainName: { type: String, required: true, trim: true, maxlength: 120 },
    captainPhone: { type: String, trim: true, default: '', maxlength: 30 },
    captainEmail: { type: String, trim: true, default: '', maxlength: 160 },
    verificationDocUrl: { type: String, trim: true, default: '', select: false },
    verificationDocId: { type: Schema.Types.ObjectId, ref: 'StoredFile', default: null, select: false },
    verificationDocMeta: { type: storedDocMetaSchema, default: null, select: false },
    verificationNotes: { type: String, trim: true, default: '', maxlength: 500, select: false },
    roster: [
      {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        role: { type: String, trim: true, default: '', maxlength: 80 },
        jerseyNumber: { type: Number, default: null },
        dateOfBirth: { type: String, trim: true, default: '' },
        isMinor: { type: Boolean, default: false },
        guardianName: { type: String, trim: true, default: '', maxlength: 120 },
        guardianPhone: { type: String, trim: true, default: '', maxlength: 30 },
        guardianConsent: { type: Boolean, default: false },
      },
    ],
    feeAmount: { type: Number, default: 0, min: 0 },
    feeStatus: {
      type: String,
      enum: ['WAIVED', 'PENDING', 'PAID'],
      default: 'WAIVED',
    },
    paymentType: {
      type: String,
      enum: ['NONE', 'ENTRY_FEE', 'SECURITY_DEPOSIT'],
      default: 'NONE',
    },
    paymentStatus: {
      type: String,
      enum: [
        'NOT_REQUIRED',
        'PAYMENT_PENDING',
        'PROOF_SUBMITTED',
        'UNDER_VERIFICATION',
        'PAYMENT_APPROVED',
        'PAYMENT_REJECTED',
      ],
      default: 'NOT_REQUIRED',
      index: true,
    },
    refundStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'HELD', 'REFUND_INITIATED', 'REFUNDED', 'FORFEITED'],
      default: 'NOT_APPLICABLE',
    },
    paymentProofFileId: {
      type: Schema.Types.ObjectId,
      ref: 'StoredFile',
      default: null,
      select: false,
    },
    paymentProofMeta: { type: storedDocMetaSchema, default: null, select: false },
    paymentSubmittedAt: { type: Date, default: null },
    paymentVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    paymentVerifiedByName: { type: String, trim: true, default: '' },
    paymentVerifiedAt: { type: Date, default: null },
    paymentRejectionReason: { type: String, trim: true, default: '', maxlength: 500 },
    paymentReferenceNote: { type: String, trim: true, default: '', maxlength: 300 },
    paymentHistory: [
      {
        action: { type: String, required: true, trim: true },
        status: { type: String, required: true, trim: true },
        actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        actorName: { type: String, trim: true, default: '' },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, trim: true, default: '' },
        fileId: { type: String, trim: true, default: '' },
        fileName: { type: String, trim: true, default: '' },
      },
    ],
    editCount: { type: Number, default: 0, min: 0 },
    maxEditsAfterApproval: { type: Number, default: 2, min: 1 },
    previousApprovalSnapshot: { type: Schema.Types.Mixed, default: null, select: false },
    editHistory: [
      {
        editNumber: { type: Number, required: true },
        editedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        editedByName: { type: String, trim: true, default: '' },
        editedAt: { type: Date, default: Date.now },
        previousStatus: { type: String, trim: true, default: 'APPROVED' },
        changesSummary: { type: String, trim: true, default: '' },
        previousData: { type: Schema.Types.Mixed, default: {} },
        reviewStatus: {
          type: String,
          enum: ['PENDING_REAPPROVAL', 'APPROVED', 'REJECTED'],
          default: 'PENDING_REAPPROVAL',
        },
        reviewedByName: { type: String, trim: true, default: '' },
        reviewedAt: { type: Date, default: null },
        reviewNotes: { type: String, trim: true, default: '' },
      },
    ],
    status: {
      type: String,
      enum: ['PENDING', 'PENDING_REAPPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
      default: 'PENDING',
      index: true,
    },
    reviewNotes: { type: String, trim: true, default: '', maxlength: 400 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tournamentRegistrationSchema.index({ tournamentId: 1, status: 1 });

const MongooseTournamentRegistration = mongoose.model<ITournamentRegistration>(
  'TournamentRegistration',
  tournamentRegistrationSchema
);
export const TournamentRegistration = createDualModel<ITournamentRegistration>(
  'tournamentregistrations',
  MongooseTournamentRegistration
);
