import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

export type SportType = 'Cricket' | 'Kabaddi' | 'Football' | 'Volleyball' | 'Other';
export type StreamStatus = 'UPCOMING' | 'LIVE' | 'ENDED';
export type ScoreboardPosition = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

export interface ILiveStream extends Document {
  youtubeVideoId: string;
  youtubeInput: string;
  teamAName: string;
  teamBName: string;
  teamAId?: mongoose.Types.ObjectId | null;
  teamBId?: mongoose.Types.ObjectId | null;
  teamALogo: string;
  teamBLogo: string;
  location: string;
  venueId?: mongoose.Types.ObjectId | null;
  gameName: SportType | '';
  matchTitle: string;
  tournamentName: string;
  tournamentId?: mongoose.Types.ObjectId | null;
  matchDate?: Date | null;
  matchDescription: string;
  status: StreamStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId | null;
  endedBy?: mongoose.Types.ObjectId | null;
  replayVideoId: string;
  replayInput: string;
  replayAvailable: boolean;
  replayPublished: boolean;
  replayVerifiedAt?: Date | null;
  replayDescription: string;
  scoreboardVisibleByDefault: boolean;
  scoreboardPosition: ScoreboardPosition;
  chatEnabled: boolean;
  highlightsEnabled: boolean;
  totalViewsCount: number;
  replayViewsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const liveStreamSchema = new Schema<ILiveStream>(
  {
    youtubeVideoId: { type: String, required: true, trim: true, minlength: 11, maxlength: 11 },
    youtubeInput: { type: String, trim: true, default: '' },
    teamAName: { type: String, trim: true, default: '', maxlength: 100 },
    teamBName: { type: String, trim: true, default: '', maxlength: 100 },
    teamAId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamBId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    teamALogo: { type: String, trim: true, default: '' },
    teamBLogo: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', default: null },
    gameName: {
      type: String,
      enum: ['Cricket', 'Kabaddi', 'Football', 'Volleyball', 'Other', ''],
      default: '',
    },
    matchTitle: { type: String, trim: true, default: '', maxlength: 180 },
    tournamentName: { type: String, trim: true, default: '', maxlength: 160 },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    matchDate: { type: Date, default: null },
    matchDescription: { type: String, trim: true, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: ['UPCOMING', 'LIVE', 'ENDED'],
      default: 'LIVE',
      index: true,
    },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    endedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    replayVideoId: { type: String, trim: true, default: '' },
    replayInput: { type: String, trim: true, default: '' },
    replayAvailable: { type: Boolean, default: false },
    replayPublished: { type: Boolean, default: false, index: true },
    replayVerifiedAt: { type: Date, default: null },
    replayDescription: { type: String, trim: true, default: '', maxlength: 500 },
    scoreboardVisibleByDefault: { type: Boolean, default: true },
    scoreboardPosition: {
      type: String,
      enum: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],
      default: 'TOP',
    },
    chatEnabled: { type: Boolean, default: true },
    highlightsEnabled: { type: Boolean, default: true },
    totalViewsCount: { type: Number, default: 0, min: 0 },
    replayViewsCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

liveStreamSchema.index({ status: 1, startedAt: -1 });
liveStreamSchema.index({ status: 1, endedAt: -1 });
liveStreamSchema.index({ youtubeVideoId: 1, status: 1 });
liveStreamSchema.index({ tournamentId: 1 });
liveStreamSchema.index({ replayPublished: 1, endedAt: -1 });
liveStreamSchema.index({ venueId: 1 });

export const LiveStream = mongoose.model<ILiveStream>('LiveStream', liveStreamSchema);
