import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';
import { createDualModel } from '../db/dualModel.ts';
import type { BroadcastOverlayConfig } from '../../src/utils/overlayConfig.ts';
import { DEFAULT_OVERLAY_CONFIG } from '../../src/utils/overlayConfig.ts';

export type SportType = 'Cricket' | 'Kabaddi' | 'Football' | 'Volleyball' | 'Other';
export type StreamStatus = 'UPCOMING' | 'LIVE' | 'ENDED';
export type ScoreboardPosition = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type StreamingProvider = 'youtube' | 'mediamtx';
export type ViewerCountVisibility = 'public' | 'admin_only' | 'hidden';
export type BroadcastPhase =
  | 'MATCH_SETUP'
  | 'MATCH_PREPARED'
  | 'BROADCAST_ACTIVE'
  | 'BROADCAST_ENDED';

export interface IProviderSwitchHistoryItem {
  fromProvider: StreamingProvider;
  toProvider: StreamingProvider;
  switchedBy: string;
  switchedByName: string;
  switchedAt: Date;
  reason: string;
  status: 'SUCCESS' | 'REJECTED' | 'FAILED';
  detail?: string;
}

export interface IStreamHealth {
  ok: boolean;
  status: string;
  checkedAt?: Date | null;
  latencyMs?: number;
  detail?: string;
}

export interface ILiveStream extends Document {
  streamingProvider: StreamingProvider;
  activeStreamingProvider: StreamingProvider;
  youtubeVideoId: string;
  youtubeInput: string;
  youtubeStreamStatus: 'UNKNOWN' | 'READY' | 'LIVE' | 'UNAVAILABLE';
  mediamtxStreamPath: string;
  mediamtxPublishStatus: 'IDLE' | 'PUBLISHING' | 'OFFLINE' | 'ERROR';
  mediamtxPlaybackUrl: string;
  mediamtxWebrtcUrl: string;
  mediamtxStreamKey: string;
  streamHealth: IStreamHealth;
  lastProviderSwitchAt?: Date | null;
  lastProviderSwitchBy?: mongoose.Types.ObjectId | null;
  lastProviderSwitchByName: string;
  providerSwitchHistory: IProviderSwitchHistoryItem[];
  viewerCountVisibility: ViewerCountVisibility;
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
  fixtureId?: mongoose.Types.ObjectId | null;
  roundName: string;
  matchDate?: Date | null;
  matchDescription: string;
  status: StreamStatus;
  broadcastPublished: boolean;
  wasPublished: boolean;
  broadcastPhase: BroadcastPhase;
  preparedAt?: Date | null;
  activatedAt?: Date | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
  authorizedScorerId?: mongoose.Types.ObjectId | null;
  backupScorerId?: mongoose.Types.ObjectId | null;
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
  showScoreboardOnYoutube: boolean;
  scoreboardPosition: ScoreboardPosition;
  chatEnabled: boolean;
  highlightsEnabled: boolean;
  totalViewsCount: number;
  replayViewsCount: number;
  overlayConfig?: BroadcastOverlayConfig;
  createdAt: Date;
  updatedAt: Date;
}

const liveStreamSchema = new Schema<ILiveStream>(
  {
    streamingProvider: {
      type: String,
      enum: ['youtube', 'mediamtx'],
      default: 'youtube',
    },
    activeStreamingProvider: {
      type: String,
      enum: ['youtube', 'mediamtx'],
      default: 'youtube',
      index: true,
    },
    youtubeVideoId: { type: String, trim: true, default: '', maxlength: 20 },
    youtubeInput: { type: String, trim: true, default: '' },
    youtubeStreamStatus: {
      type: String,
      enum: ['UNKNOWN', 'READY', 'LIVE', 'UNAVAILABLE'],
      default: 'UNKNOWN',
    },
    mediamtxStreamPath: { type: String, trim: true, default: '', maxlength: 140 },
    mediamtxPublishStatus: {
      type: String,
      enum: ['IDLE', 'PUBLISHING', 'OFFLINE', 'ERROR'],
      default: 'IDLE',
    },
    mediamtxPlaybackUrl: { type: String, trim: true, default: '', maxlength: 500 },
    mediamtxWebrtcUrl: { type: String, trim: true, default: '', maxlength: 500 },
    mediamtxStreamKey: { type: String, trim: true, default: '', select: false },
    streamHealth: {
      ok: { type: Boolean, default: false },
      status: { type: String, default: 'UNCHECKED' },
      checkedAt: { type: Date, default: null },
      latencyMs: { type: Number, default: 0 },
      detail: { type: String, default: '' },
    },
    lastProviderSwitchAt: { type: Date, default: null },
    lastProviderSwitchBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastProviderSwitchByName: { type: String, trim: true, default: '' },
    providerSwitchHistory: [
      {
        fromProvider: { type: String, enum: ['youtube', 'mediamtx'] },
        toProvider: { type: String, enum: ['youtube', 'mediamtx'] },
        switchedBy: { type: String, default: '' },
        switchedByName: { type: String, default: '' },
        switchedAt: { type: Date, default: Date.now },
        reason: { type: String, default: '' },
        status: { type: String, enum: ['SUCCESS', 'REJECTED', 'FAILED'], default: 'SUCCESS' },
        detail: { type: String, default: '' },
      },
    ],
    viewerCountVisibility: {
      type: String,
      enum: ['public', 'admin_only', 'hidden'],
      default: 'public',
    },
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
    fixtureId: { type: Schema.Types.ObjectId, ref: 'Fixture', default: null },
    roundName: { type: String, trim: true, default: '', maxlength: 100 },
    matchDate: { type: Date, default: null },
    matchDescription: { type: String, trim: true, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: ['UPCOMING', 'LIVE', 'ENDED'],
      default: 'LIVE',
      index: true,
    },
    broadcastPublished: { type: Boolean, default: true, index: true },
    wasPublished: { type: Boolean, default: true },
    broadcastPhase: {
      type: String,
      enum: ['MATCH_SETUP', 'MATCH_PREPARED', 'BROADCAST_ACTIVE', 'BROADCAST_ENDED'],
      default: 'MATCH_PREPARED',
    },
    preparedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    authorizedScorerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    backupScorerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
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
    showScoreboardOnYoutube: { type: Boolean, default: true },
    scoreboardPosition: {
      type: String,
      enum: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],
      default: 'TOP',
    },
    chatEnabled: { type: Boolean, default: true },
    highlightsEnabled: { type: Boolean, default: true },
    totalViewsCount: { type: Number, default: 0, min: 0 },
    replayViewsCount: { type: Number, default: 0, min: 0 },
    overlayConfig: {
      type: Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_OVERLAY_CONFIG }),
    },
  },
  { timestamps: true }
);

liveStreamSchema.index({ status: 1, startedAt: -1 });
liveStreamSchema.index({ status: 1, endedAt: -1 });
liveStreamSchema.index({ youtubeVideoId: 1, status: 1 });
liveStreamSchema.index({ tournamentId: 1 });
liveStreamSchema.index({ replayPublished: 1, endedAt: -1 });
liveStreamSchema.index({ venueId: 1 });

const MongooseLiveStream = mongoose.model<ILiveStream>('LiveStream', liveStreamSchema);
export const LiveStream = createDualModel<ILiveStream>('livestreams', MongooseLiveStream);
