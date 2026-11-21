import type { UserRole } from '../constants/roles.ts';
import type { SportOption } from '../constants/sports.ts';
import type { BroadcastOverlayConfig } from '../utils/overlayConfig.ts';

export type { BroadcastOverlayConfig };

export type ScoreboardPosition = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
export type StreamingProvider = 'youtube' | 'mediamtx';
export type ViewerCountVisibility = 'public' | 'admin_only' | 'hidden';
export type SponsorPlacement = 'live_match' | 'home_feed' | 'tournament_banner';

export interface UserPermissions {
  manageStreams: boolean;
  manageScores: boolean;
  manageTournaments: boolean;
  manageTeams: boolean;
  managePlayers: boolean;
  moderateChat?: boolean;
  manageSponsors?: boolean;
  manageVenues?: boolean;
  declareResults?: boolean;
}

export interface NotificationPreferences {
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

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: UserPermissions;
  granularPermissions?: string[];
  assignedStreamIds?: string[];
  assignedTournamentIds?: string[];
  followedTeamIds?: string[];
  followedPlayerIds?: string[];
  followedTournamentIds?: string[];
  notificationPreferences?: NotificationPreferences;
  chatMutedUntil?: string | null;
  chatMutedReason?: string;
  isActive: boolean;
  phone?: string;
  favoriteSport?: string;
  totpEnabled?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  lastLoginAt?: string;
  createdAt?: string;
}

export type StreamStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export type MatchResultStatus =
  | 'NOT_DECLARED'
  | 'DECLARED'
  | 'DRAW'
  | 'TIE'
  | 'NO_RESULT'
  | 'ABANDONED';
export type MatchResultType =
  | 'TEAM_A_WON'
  | 'TEAM_B_WON'
  | 'DRAW'
  | 'TIE'
  | 'NO_RESULT'
  | 'ABANDONED'
  | '';

export interface StreamHealthData {
  ok: boolean;
  status: string;
  checkedAt?: string | null;
  latencyMs?: number;
  detail?: string;
}

export interface ProviderSwitchHistoryItem {
  fromProvider: StreamingProvider;
  toProvider: StreamingProvider;
  switchedBy: string;
  switchedByName: string;
  switchedAt: string;
  reason: string;
  status: 'SUCCESS' | 'REJECTED' | 'FAILED';
  detail?: string;
}

export interface LiveScoreData {
  _id?: string;
  liveStreamId: string;
  sportType: SportOption;
  teamAScore: number;
  teamBScore: number;
  sportSpecificDetails: Record<string, any>;
  matchStatus: string;
  resultStatus?: MatchResultStatus;
  resultType?: MatchResultType;
  winnerTeamId?: string | null;
  winnerTeamName?: string;
  winningMargin?: string;
  resultDescription?: string;
  mvpPlayerId?: string | null;
  mvpPlayerName?: string;
  finalSummary?: string;
  tossWinner?: 'A' | 'B' | '';
  tossDecision?: string;
  declaredBy?: string | null;
  declaredByName?: string;
  declaredAt?: string | null;
  lastUpdatedBy?: string;
  lastUpdatedAt: string;
}

export interface LiveStreamData {
  id: string;
  _id?: string;
  streamingProvider?: StreamingProvider;
  activeStreamingProvider?: StreamingProvider;
  youtubeVideoId: string;
  youtubeInput: string;
  youtubeStreamStatus?: 'UNKNOWN' | 'READY' | 'LIVE' | 'UNAVAILABLE';
  mediamtxStreamPath?: string;
  mediamtxPublishStatus?: 'IDLE' | 'PUBLISHING' | 'OFFLINE' | 'ERROR';
  mediamtxPlaybackUrl?: string;
  mediamtxWebrtcUrl?: string;
  streamHealth?: StreamHealthData;
  lastProviderSwitchAt?: string | null;
  lastProviderSwitchByName?: string;
  providerSwitchHistory?: ProviderSwitchHistoryItem[];
  viewerCountVisibility?: ViewerCountVisibility;
  activeViewers?: number | null;
  teamAName: string;
  teamBName: string;
  teamAId?: string | null;
  teamBId?: string | null;
  teamALogo: string;
  teamBLogo: string;
  location: string;
  venueId?: string | VenueData | null;
  gameName: SportOption | '';
  matchTitle: string;
  tournamentName: string;
  tournamentId?: string | null;
  fixtureId?: string | null;
  roundName?: string;
  matchDate?: string | null;
  matchDescription: string;
  status: StreamStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  authorizedScorerId?: string | null;
  backupScorerId?: string | null;
  replayVideoId: string;
  replayInput: string;
  replayAvailable: boolean;
  replayPublished: boolean;
  replayVerifiedAt?: string | null;
  replayDescription?: string;
  scoreboardVisibleByDefault?: boolean;
  scoreboardPosition?: ScoreboardPosition;
  chatEnabled?: boolean;
  highlightsEnabled?: boolean;
  totalViewsCount?: number;
  replayViewsCount?: number;
  overlayConfig?: BroadcastOverlayConfig;
  createdAt: string;
  updatedAt: string;
  score?: LiveScoreData | null;
}

export interface NormalizedBroadcast {
  id: string;
  sourceType: 'match' | 'stream';
  sport: SportOption;
  status: StreamStatus;
  title: string;
  tournamentName: string;
  tournamentId?: string | null;
  roundName: string;
  venueName: string;
  matchDate?: string | null;
  activeProvider: StreamingProvider;
  youtubeVideoId: string;
  replayVideoId: string;
  replayAvailable: boolean;
  replayPublished: boolean;
  mediamtxPlaybackUrl: string;
  mediamtxWebrtcUrl: string;
  mediamtxPublishStatus: string;
  viewerCountVisibility: ViewerCountVisibility;
  activeViewers: number | null;
  chatEnabled: boolean;
  highlightsEnabled: boolean;
  scoreboardVisibleByDefault: boolean;
  teamA: {
    id?: string | null;
    name: string;
    shortName: string;
    logoUrl: string;
    primaryText: string;
    secondaryText: string;
    badgeText?: string;
  };
  teamB: {
    id?: string | null;
    name: string;
    shortName: string;
    logoUrl: string;
    primaryText: string;
    secondaryText: string;
    badgeText?: string;
  };
  centerMeta: {
    statusLabel: string;
    timerOrClock: string;
    periodLabel: string;
    isLive: boolean;
  };
  subStripItems: Array<{ label: string; value: string; accent?: 'orange' | 'emerald' | 'blue' | 'red' | 'slate' }>;
  resultBannerText: string;
  resultDeclared: boolean;
  winnerName: string;
  mvpName: string;
  score: LiveScoreData | null;
  raw: LiveStreamData;
}

export interface ScoreHistoryItem {
  _id: string;
  liveStreamId: string;
  entryType?: 'SCORE_UPDATE' | 'COMMENTARY' | 'RESULT' | 'CORRECTION';
  sportType?: SportOption;
  teamSide?: 'A' | 'B' | '';
  eventCategory?: string;
  eventType?: string;
  pointsAwarded?: number;
  playerId?: string | null;
  playerName?: string;
  assistPlayerId?: string | null;
  assistPlayerName?: string;
  eventPhase?: string;
  details?: Record<string, any>;
  isCorrection?: boolean;
  correctionOfId?: string | null;
  correctionReason?: string;
  reverted?: boolean;
  previousScore: Record<string, any>;
  updatedScore: Record<string, any>;
  action: string;
  updatedBy?: { _id: string; name: string; role: UserRole } | string;
  createdAt: string;
}

export type TournamentFormat = 'KNOCKOUT' | 'LEAGUE' | 'GROUP_STAGE' | 'GROUP_KNOCKOUT';
export type TournamentPaymentMode = 'NONE' | 'ENTRY_FEE' | 'SECURITY_DEPOSIT';

export interface TournamentPositionEntry {
  rank: number;
  label: string;
  teamId?: string | null;
  teamName: string;
  prizeNote?: string;
}

export interface TournamentBestPlayerEntry {
  mode: 'NONE' | 'PLAYER' | 'MANUAL';
  playerId?: string | null;
  playerName: string;
  teamId?: string | null;
  teamName?: string;
  title?: string;
  performanceNote?: string;
}

export interface TournamentCustomAwardField {
  id: string;
  label: string;
  value: string;
}

export interface TournamentPrizeTier {
  amount?: string;
  label?: string;
}

export interface TournamentPrizesConfig {
  first?: TournamentPrizeTier;
  second?: TournamentPrizeTier;
  third?: TournamentPrizeTier;
}

export interface TournamentData {
  id: string;
  _id?: string;
  name: string;
  sportType: SportOption;
  format?: TournamentFormat;
  logoUrl?: string;
  location: string;
  googleMapsUrl?: string;
  venueId?: string | VenueData | null;
  startDate?: string | null;
  endDate?: string | null;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  description: string;
  rules?: string;
  groupCount?: number;
  qualificationRules?: string;
  organizerName: string;
  season?: string;
  prizeMoney?: string;
  prizes?: TournamentPrizesConfig;
  registrationOpen?: boolean;
  paymentMode?: TournamentPaymentMode;
  registrationFee?: number;
  securityDepositAmount?: number;
  refundPolicy?: string;
  paymentInstructions?: string;
  positions?: TournamentPositionEntry[];
  bestPlayer?: TournamentBestPlayerEntry | null;
  customAwardFields?: TournamentCustomAwardField[];
  isPublished?: boolean;
  followersCount?: number;
  teamIds?: string[];
  createdBy?: string;
  createdAt: string;
}

export interface RosterPlayerEntry {
  name: string;
  role: string;
  jerseyNumber?: number | null;
  avatarUrl?: string;
  avatarPublicId?: string;
  dateOfBirth: string;
  isMinor: boolean;
  guardianName?: string;
  guardianPhone?: string;
  guardianConsent?: boolean;
}

export interface StoredDocMeta {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  source: 'DEVICE' | 'GOOGLE_DRIVE';
  driveFileId?: string;
  url?: string;
  cloudinaryPublicId?: string;
  uploadedAt: string;
}

export interface TeamEditHistoryItem {
  editNumber: number;
  editedBy: string;
  editedByName: string;
  editedAt: string;
  previousStatus: string;
  changesSummary: string;
  previousData?: Record<string, any>;
  reviewStatus?: 'PENDING_REAPPROVAL' | 'APPROVED' | 'REJECTED';
  reviewedByName?: string;
  reviewedAt?: string | null;
  reviewNotes?: string;
}

export interface PaymentHistoryItem {
  action: string;
  status: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  notes?: string;
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
}

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

export interface TournamentRegistrationData {
  id: string;
  _id?: string;
  tournamentId: string | TournamentData;
  tournament?: TournamentData | null;
  captainUserId: string;
  teamId?: string | null;
  teamName: string;
  teamShortName: string;
  teamLogoUrl: string;
  city: string;
  captainName: string;
  captainPhone?: string;
  captainEmail?: string;
  verificationDocUrl?: string;
  verificationDocId?: string | null;
  verificationDocMeta?: StoredDocMeta | null;
  verificationNotes?: string;
  roster: RosterPlayerEntry[];
  feeAmount: number;
  feeStatus: 'WAIVED' | 'PENDING' | 'PAID';
  paymentType?: TournamentPaymentMode;
  paymentStatus?: PaymentVerificationStatus;
  refundStatus?: DepositRefundStatus;
  paymentProofFileId?: string | null;
  paymentProofMeta?: StoredDocMeta | null;
  paymentSubmittedAt?: string | null;
  paymentVerifiedByName?: string;
  paymentVerifiedAt?: string | null;
  paymentRejectionReason?: string;
  paymentReferenceNote?: string;
  paymentHistory?: PaymentHistoryItem[];
  editCount?: number;
  maxEditsAfterApproval?: number;
  editHistory?: TeamEditHistoryItem[];
  status: 'PENDING' | 'PENDING_REAPPROVAL' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
  reviewNotes?: string;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamData {
  id: string;
  _id?: string;
  name: string;
  shortName: string;
  logoUrl: string;
  sportType: SportOption;
  city: string;
  captainName: string;
  bio?: string;
  followersCount?: number;
  playerCount?: number;
  tournamentId?: { _id: string; name: string } | string | null;
  createdAt: string;
}

export interface PlayerData {
  id: string;
  _id?: string;
  name: string;
  teamId?: { _id: string; name: string; shortName?: string } | string | null;
  sportType: SportOption;
  role: string;
  position?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  bio?: string;
  jerseyNumber?: number | null;
  avatarUrl: string;
  avatarPublicId?: string;
  dateOfBirth?: string;
  isMinor?: boolean;
  isVerified?: boolean;
  followersCount?: number;
  createdAt: string;
}

export interface VenueData {
  id: string;
  _id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  details?: string;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: string;
}

export interface FixtureData {
  id: string;
  _id?: string;
  tournamentId: string;
  roundNumber: number;
  roundName: string;
  groupName?: string;
  matchFormat?: string;
  matchNumber: number;
  teamAId?: string | null;
  teamBId?: string | null;
  teamAName: string;
  teamBName: string;
  teamALogo?: string;
  teamBLogo?: string;
  venueId?: string | VenueData | null;
  location?: string;
  scheduledAt?: string | null;
  liveStreamId?: string | LiveStreamData | null;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'BYE' | 'CANCELLED';
  isBye?: boolean;
  winnerTeamId?: string | null;
  winnerTeamName?: string;
  nextFixtureId?: string | null;
  nextFixtureSlot?: 'A' | 'B' | '';
  resultConfirmed?: boolean;
  resultSummary?: string;
}

export interface PointsTableRow {
  teamId: string;
  teamName: string;
  shortName: string;
  logoUrl: string;
  groupName: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  tied: number;
  noResult: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDiff: number;
  netRunRate: number | null;
  oversFacedBalls?: number;
  oversBowledBalls?: number;
}

export interface MatchHighlightData {
  id: string;
  _id?: string;
  liveStreamId: string;
  eventType: string;
  videoTimestampSeconds: number;
  description: string;
  teamSide?: 'A' | 'B' | '';
  playerId?: string | null;
  playerName?: string;
  createdBy?: { _id: string; name: string } | string;
  createdAt: string;
  updatedAt?: string;
}

export interface PlayerMatchStatRecord {
  _id?: string;
  id?: string;
  liveStreamId: string;
  tournamentId?: string | null;
  teamId?: string | { _id: string; id?: string; name?: string; shortName?: string } | null;
  playerId: string | { _id: string; id?: string; name?: string };
  sportType: SportOption;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  wickets: number;
  oversBowledBalls: number;
  runsConceded: number;
  catches: number;
  raidPoints: number;
  tacklePoints: number;
  bonusPoints: number;
  superRaids: number;
  superTackles: number;
  attackPoints: number;
  blockPoints: number;
  serveAces: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  isMvp: boolean;
  appearances: number;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  avatarUrl: string;
  teamId?: string | null;
  teamName: string;
  teamShortName?: string;
  sportType: SportOption;
  matches: number;
  runs?: number;
  wickets?: number;
  raidPoints?: number;
  tacklePoints?: number;
  totalKabaddiPoints?: number;
  attackPoints?: number;
  blockPoints?: number;
  serveAces?: number;
  goals?: number;
  assists?: number;
  mvpAwards?: number;
}

export interface ChatMessageData {
  id: string;
  _id?: string;
  liveStreamId: string;
  userId: string;
  userName: string;
  userRole: string;
  message: string;
  isDeleted?: boolean;
  reportedCount?: number;
  createdAt: string;
}

export interface PollOptionData {
  id: string;
  label: string;
  votes: number;
}

export interface PollData {
  id: string;
  _id?: string;
  liveStreamId: string;
  question: string;
  options: PollOptionData[];
  totalVotes: number;
  userVotedOptionId?: string | null;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
}

export interface NotificationData {
  id: string;
  _id?: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  metadata?: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

export interface SponsorData {
  id: string;
  _id?: string;
  name: string;
  logoUrl: string;
  websiteUrl: string;
  contactInfo: string;
  sponsorshipType: string;
  placement?: SponsorPlacement;
  tagline?: string;
  ctaText?: string;
  impressionsCount?: number;
  clicksCount?: number;
  tournamentId?: { _id: string; name: string } | string | null;
  liveStreamId?: { _id: string; matchTitle?: string } | string | null;
  isPublished: boolean;
  isActive: boolean;
  createdAt?: string;
}

export interface SponsorOverlayData {
  id: string;
  _id?: string;
  sponsorId: string | SponsorData;
  sponsor?: SponsorData | null;
  liveStreamId?: { _id: string; matchTitle?: string; teamAName?: string; teamBName?: string } | string | null;
  tournamentId?: { _id: string; name: string } | string | null;
  position: ScoreboardPosition;
  durationSeconds: number;
  displayOrder: number;
  mode: 'BANNER' | 'ANNOUNCEMENT';
  announcementText?: string;
  isVisible: boolean;
}

export interface MatchReportData {
  id: string;
  _id?: string;
  liveStreamId:
    | string
    | { _id: string; matchTitle?: string; teamAName?: string; teamBName?: string; youtubeVideoId?: string; gameName?: string; status?: string };
  stream?: { id?: string; matchTitle?: string; teamAName?: string; teamBName?: string; gameName?: string; status?: string } | null;
  category: 'STREAM_DOWN' | 'WRONG_SCORE' | 'AUDIO_VIDEO_ISSUE' | 'CHAT_ABUSE' | 'OTHER';
  description: string;
  reporterName: string;
  reporterEmail: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
  resolutionNotes?: string;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ViewerAnalyticsSummary {
  summary: {
    totalActiveSocketViewers: number;
    totalPlatformViews: number;
    totalReplayViews: number;
    totalWatchSeconds: number;
    streamsTracked: number;
    sourceNote: string;
  };
  perMatch: Array<{
    streamId: string;
    matchTitle: string;
    gameName: string;
    status: string;
    liveSocketViewers: number;
    totalViews: number;
    replayViews: number;
    uniqueSessions: number;
    totalWatchSeconds: number;
  }>;
}

export interface SubscriptionPlanData {
  id: string;
  _id?: string;
  code: string;
  name: string;
  monthlyPrice: number;
  currency: string;
  maxActiveStreams: number;
  maxTournaments: number;
  features: string[];
  isActive: boolean;
}

export interface OrganizerSubscriptionData {
  id: string;
  _id?: string;
  organizerUserId: string | { _id: string; name: string; email: string };
  planId: string | SubscriptionPlanData;
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED';
  startedAt: string;
  expiresAt?: string | null;
  notes?: string;
}

export interface RevenueRecordData {
  id: string;
  _id?: string;
  organizerUserId?: string;
  tournamentId?: { _id: string; name: string } | string | null;
  sourceType: 'SUBSCRIPTION' | 'SPONSORSHIP' | 'REGISTRATION' | 'OTHER';
  description: string;
  amount: number;
  currency: string;
  status: 'RECORDED' | 'PAID' | 'REFUNDED';
  referenceNumber?: string;
  recordedAt: string;
}

export interface DashboardStats {
  totalStreams: number;
  liveStreams: number;
  endedStreams: number;
  upcomingStreams: number;
  availableReplays: number;
  publishedReplays: number;
  tournamentsCount: number;
  teamsCount: number;
  playersCount: number;
  openReportsCount?: number;
  totalPlatformViews?: number;
}

export interface ActivityLogItem {
  _id: string;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  previousValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
  createdAt: string;
}

export interface UserSessionData {
  id: string;
  portal: 'admin' | 'customer';
  userAgent: string;
  ipAddress: string;
  isRevoked: boolean;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface SecurityPolicyData {
  enforceAdmin2FA: boolean;
  maxFailedLoginAttempts: number;
  lockoutMinutes: number;
  providerSwitchGraceSeconds: number;
  updatedByName?: string;
  updatedAt?: string;
}

export interface DatabaseDiagnosticsData {
  database: {
    engine: 'mongodb' | 'sqlite';
    mongoConfigured: boolean;
    mongoConnected: boolean;
    mongoReadyState: number;
    lastMongoError: string | null;
    lastRetryAt: string | null;
    sqlitePath: string;
    sqliteCounts: Record<string, number>;
    totalSqliteRecords: number;
    lastSyncSummary: { syncedCollections: number; syncedRecords: number; syncedAt: string } | null;
  };
  mediamtx: {
    rtmpBase: string;
    hlsBase: string;
    webrtcBase: string;
    apiConfigured: boolean;
  };
  nodeVersion: string;
  uptimeSeconds: number;
}

export interface SearchOrganizerResult {
  name: string;
  tournamentCount: number;
  sports: string[];
  latestTournamentId: string;
}

export interface SearchResultsPayload {
  query: string;
  matches: LiveStreamData[];
  tournaments: TournamentData[];
  teams: TeamData[];
  players: PlayerData[];
  venues: VenueData[];
  organizers: SearchOrganizerResult[];
}

export interface TournamentTemplateData {
  id: string;
  _id?: string;
  name: string;
  sportType: SportOption;
  format: TournamentFormat;
  groupCount: number;
  location: string;
  prizeMoney: string;
  prizes?: TournamentPrizesConfig;
  registrationFee: number;
  rules: string;
  qualificationRules: string;
  description: string;
  createdAt?: string;
}

export interface MatchHealthItem {
  id: string;
  matchTitle: string;
  teamAName: string;
  teamBName: string;
  sport: string;
  tournamentName: string;
  status: StreamStatus;
  matchStatus: string;
  activeStreamingProvider: StreamingProvider;
  streamHealth: StreamHealthData;
  youtubeVideoId: string;
  youtubeStreamStatus: string;
  mediamtxStreamPath: string;
  mediamtxPublishStatus: string;
  activeSocketViewers: number;
  scoreUpdatedAt: string | null;
  authorizedScorer: { id: string; name: string } | null;
  backupScorer: { id: string; name: string } | null;
  healthGrade: 'Healthy' | 'Degraded' | 'Offline' | 'Unknown';
}
