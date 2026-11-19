import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export interface ISubscriptionPlan extends Document {
  name: string;
  code: string;
  monthlyPrice: number;
  currency: string;
  maxActiveStreams: number;
  maxTournaments: number;
  features: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 40 },
    monthlyPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, default: 'INR', maxlength: 10 },
    maxActiveStreams: { type: Number, default: 2, min: 1 },
    maxTournaments: { type: Number, default: 5, min: 1 },
    features: [{ type: String, trim: true, maxlength: 160 }],
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const MongooseSubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  'SubscriptionPlan',
  subscriptionPlanSchema
);
export const SubscriptionPlan = createDualModel<ISubscriptionPlan>(
  'subscriptionplans',
  MongooseSubscriptionPlan
);

export interface IOrganizerSubscription extends Document {
  organizerUserId: mongoose.Types.ObjectId;
  planId: mongoose.Types.ObjectId;
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED';
  startedAt: Date;
  expiresAt?: Date | null;
  notes: string;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const organizerSubscriptionSchema = new Schema<IOrganizerSubscription>(
  {
    organizerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null },
    notes: { type: String, trim: true, default: '', maxlength: 400 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

organizerSubscriptionSchema.index({ organizerUserId: 1, status: 1 });

const MongooseOrganizerSubscription = mongoose.model<IOrganizerSubscription>(
  'OrganizerSubscription',
  organizerSubscriptionSchema
);
export const OrganizerSubscription = createDualModel<IOrganizerSubscription>(
  'organizersubscriptions',
  MongooseOrganizerSubscription
);

export interface IRevenueRecord extends Document {
  organizerUserId?: mongoose.Types.ObjectId | null;
  tournamentId?: mongoose.Types.ObjectId | null;
  sourceType: 'SUBSCRIPTION' | 'SPONSORSHIP' | 'REGISTRATION' | 'OTHER';
  description: string;
  amount: number;
  currency: string;
  status: 'RECORDED' | 'PAID' | 'REFUNDED';
  recordedAt: Date;
  referenceNumber: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const revenueRecordSchema = new Schema<IRevenueRecord>(
  {
    organizerUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    sourceType: {
      type: String,
      enum: ['SUBSCRIPTION', 'SPONSORSHIP', 'REGISTRATION', 'OTHER'],
      default: 'OTHER',
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 240 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, trim: true, default: 'INR', maxlength: 10 },
    status: {
      type: String,
      enum: ['RECORDED', 'PAID', 'REFUNDED'],
      default: 'RECORDED',
      index: true,
    },
    recordedAt: { type: Date, default: Date.now, index: true },
    referenceNumber: { type: String, trim: true, default: '', maxlength: 80 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const MongooseRevenueRecord = mongoose.model<IRevenueRecord>(
  'RevenueRecord',
  revenueRecordSchema
);
export const RevenueRecord = createDualModel<IRevenueRecord>(
  'revenuerecords',
  MongooseRevenueRecord
);
