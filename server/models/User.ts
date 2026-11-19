import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'TOURNAMENT_ORGANIZER'
  | 'MODERATOR'
  | 'SCORER'
  | 'SPECTATOR';

export const ADMIN_PORTAL_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'TOURNAMENT_ORGANIZER',
  'MODERATOR',
  'SCORER',
];

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
  followedTeams: boolean;
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
  assignedStreamIds: mongoose.Types.ObjectId[];
  assignedTournamentIds: mongoose.Types.ObjectId[];
  followedTeamIds: mongoose.Types.ObjectId[];
  notificationPreferences: INotificationPreferences;
  chatMutedUntil?: Date | null;
  chatMutedReason: string;
  isActive: boolean;
  avatarUrl?: string;
  phone?: string;
  favoriteSport?: string;
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
      enum: ['SUPER_ADMIN', 'ADMIN', 'TOURNAMENT_ORGANIZER', 'MODERATOR', 'SCORER', 'SPECTATOR'],
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
    assignedStreamIds: [{ type: Schema.Types.ObjectId, ref: 'LiveStream' }],
    assignedTournamentIds: [{ type: Schema.Types.ObjectId, ref: 'Tournament' }],
    followedTeamIds: [{ type: Schema.Types.ObjectId, ref: 'Team', index: true }],
    notificationPreferences: {
      matchStart: { type: Boolean, default: true },
      matchLive: { type: Boolean, default: true },
      followedTeams: { type: Boolean, default: true },
      scoreUpdates: { type: Boolean, default: false },
      matchResults: { type: Boolean, default: true },
      tournamentUpdates: { type: Boolean, default: true },
      browserPushEnabled: { type: Boolean, default: false },
    },
    chatMutedUntil: { type: Date, default: null },
    chatMutedReason: { type: String, trim: true, default: '', maxlength: 240 },
    isActive: { type: Boolean, default: true, index: true },
    avatarUrl: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    favoriteSport: { type: String, trim: true, default: '' },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, isActive: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
