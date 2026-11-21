import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TOURNAMENT_ORGANIZER'
  | 'BROADCASTER'
  | 'MODERATOR'
  | 'SCORER'
  | 'CAPTAIN'
  | 'SPECTATOR';

export const ADMIN_PORTAL_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'BROADCASTER',
  'MODERATOR',
  'SCORER',
];

export const ALL_GRANULAR_PERMISSIONS = [
  'admin_portal:access',
  'analytics:view',
  'tournaments:create',
  'tournaments:approve',
  'tournaments:manage',
  'tournaments:delete',
  'teams:register',
  'teams:approve',
  'teams:manage',
  'players:manage',
  'players:verify',
  'matches:create',
  'matches:manage',
  'matches:assign_scorers',
  'matches:score',
  'matches:manage_stream',
  'matches:publish_replay',
  'broadcast:control',
  'broadcast:manage_cameras',
  'broadcast:manage_overlays',
  'broadcast:stream_control',
  'broadcast:record_control',
  'broadcast:assign_broadcasters',
  'broadcast:override',
  'registrations:review',
  'sponsors:manage',
  'users:view',
  'users:create_admin',
  'users:manage_roles',
  'users:manage_status',
  'users:reset_password',
  'permissions:manage',
  'audit_logs:view',
  'security:manage',
] as const;

export type GranularPermission = (typeof ALL_GRANULAR_PERMISSIONS)[number];

export interface UserPermissions {
  manageStreams: boolean;
  manageScores: boolean;
  manageTournaments: boolean;
  manageTeams: boolean;
  managePlayers: boolean;
  moderateChat: boolean;
  manageSponsors: boolean;
  manageVenues: boolean;
  declareResults: boolean;
}

export interface INotificationPreferences {
  matchStart: boolean;
  matchLive: boolean;
  matchDelayed?: boolean;
  matchResumed?: boolean;
  followedTeams: boolean;
  favoritePlayers?: boolean;
  scoreUpdates: boolean;
  matchResults: boolean;
  tournamentUpdates: boolean;
  browserPushEnabled: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  permissions: UserPermissions;
  granularPermissions: string[];
  assignedStreamIds: mongoose.Types.ObjectId[];
  assignedTournamentIds: mongoose.Types.ObjectId[];
  followedTeamIds: mongoose.Types.ObjectId[];
  followedPlayerIds: mongoose.Types.ObjectId[];
  followedTournamentIds: mongoose.Types.ObjectId[];
  notificationPreferences: INotificationPreferences;
  chatMutedUntil?: Date | null;
  chatMutedReason: string;
  isActive: boolean;
  phone?: string;
  favoriteSport?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  totpEnabled: boolean;
  totpSecret: string;
  totpVerifiedAt?: Date | null;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date | null;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: [
        'SUPER_ADMIN',
        'ADMIN',
        'TOURNAMENT_ORGANIZER',
        'BROADCASTER',
        'MODERATOR',
        'SCORER',
        'CAPTAIN',
        'SPECTATOR',
      ],
      default: 'SPECTATOR',
      index: true,
    },
    permissions: {
      manageStreams: { type: Boolean, default: false },
      manageScores: { type: Boolean, default: false },
      manageTournaments: { type: Boolean, default: false },
      manageTeams: { type: Boolean, default: false },
      managePlayers: { type: Boolean, default: false },
      moderateChat: { type: Boolean, default: false },
      manageSponsors: { type: Boolean, default: false },
      manageVenues: { type: Boolean, default: false },
      declareResults: { type: Boolean, default: true },
    },
    granularPermissions: [{ type: String, trim: true }],
    assignedStreamIds: [{ type: Schema.Types.ObjectId, ref: 'LiveStream' }],
    assignedTournamentIds: [{ type: Schema.Types.ObjectId, ref: 'Tournament' }],
    followedTeamIds: [{ type: Schema.Types.ObjectId, ref: 'Team', index: true }],
    followedPlayerIds: [{ type: Schema.Types.ObjectId, ref: 'Player', index: true }],
    followedTournamentIds: [{ type: Schema.Types.ObjectId, ref: 'Tournament', index: true }],
    notificationPreferences: {
      matchStart: { type: Boolean, default: true },
      matchLive: { type: Boolean, default: true },
      matchDelayed: { type: Boolean, default: true },
      matchResumed: { type: Boolean, default: true },
      followedTeams: { type: Boolean, default: true },
      favoritePlayers: { type: Boolean, default: true },
      scoreUpdates: { type: Boolean, default: false },
      matchResults: { type: Boolean, default: true },
      tournamentUpdates: { type: Boolean, default: true },
      browserPushEnabled: { type: Boolean, default: false },
    },
    chatMutedUntil: { type: Date, default: null },
    chatMutedReason: { type: String, trim: true, default: '', maxlength: 240 },
    isActive: { type: Boolean, default: true, index: true },
    phone: { type: String, trim: true, default: '' },
    favoriteSport: { type: String, trim: true, default: '' },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    totpEnabled: { type: Boolean, default: false },
    totpSecret: { type: String, default: '', select: false },
    totpVerifiedAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: '', select: false },
    passwordResetExpiresAt: { type: Date, default: null },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });

const MongooseUser = mongoose.model<IUser>('User', userSchema);
export const User = createDualModel<IUser>('users', MongooseUser);
