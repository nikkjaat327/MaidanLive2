import {
  DatabaseDiagnosticsData,
  LeaderboardEntry,
  MatchHealthItem,
  MatchReportData,
  NotificationData,
  NotificationPreferences,
  OrganizerSubscriptionData,
  PlayerMatchStatRecord,
  RevenueRecordData,
  SponsorData,
  SponsorOverlayData,
  SponsorPlacement,
  SubscriptionPlanData,
  TournamentRegistrationData,
  VenueData,
  ViewerAnalyticsSummary,
} from '../../types/index.ts';
import { adminApi, customerApi, publicApi } from '../api/httpClient.ts';

export const platformOpsService = {
  // Venues
  async listVenues(): Promise<VenueData[]> {
    const { data } = await publicApi.get<{ venues: VenueData[] }>('/venues');
    return data.venues;
  },
  async createVenue(payload: Partial<VenueData>): Promise<VenueData> {
    const { data } = await adminApi.post<{ venue: VenueData }>('/venues', payload);
    return data.venue;
  },
  async updateVenue(id: string, payload: Partial<VenueData>): Promise<VenueData> {
    const { data } = await adminApi.patch<{ venue: VenueData }>(`/venues/${id}`, payload);
    return data.venue;
  },
  async deleteVenue(id: string): Promise<void> {
    await adminApi.delete(`/venues/${id}`);
  },

  // Sponsors & Overlays
  async listSponsors(publishedOnly = false): Promise<SponsorData[]> {
    const { data } = await publicApi.get<{ sponsors: SponsorData[] }>('/sponsors', {
      params: publishedOnly ? { publishedOnly: 'true' } : undefined,
    });
    return data.sponsors;
  },
  async listPublicSponsors(params?: {
    placement?: SponsorPlacement;
    tournamentId?: string;
    liveStreamId?: string;
  }): Promise<SponsorData[]> {
    const { data } = await publicApi.get<{ sponsors: SponsorData[] }>('/v1/sponsors/public', {
      params,
    });
    return data.sponsors;
  },
  async trackSponsorImpression(id: string): Promise<void> {
    await publicApi.post(`/v1/sponsors/${id}/impression`).catch(() => {});
  },
  async trackSponsorClick(id: string): Promise<void> {
    await publicApi.post(`/v1/sponsors/${id}/click`).catch(() => {});
  },
  async createSponsor(payload: Partial<SponsorData>): Promise<SponsorData> {
    const { data } = await adminApi.post<{ sponsor: SponsorData }>('/sponsors', payload);
    return data.sponsor;
  },
  async updateSponsor(id: string, payload: Partial<SponsorData>): Promise<SponsorData> {
    const { data } = await adminApi.patch<{ sponsor: SponsorData }>(`/sponsors/${id}`, payload);
    return data.sponsor;
  },
  async deleteSponsor(id: string): Promise<void> {
    await adminApi.delete(`/sponsors/${id}`);
  },

  async listLiveSponsorOverlays(streamId: string): Promise<SponsorOverlayData[]> {
    const { data } = await publicApi.get<{ overlays: SponsorOverlayData[] }>(
      `/live/${streamId}/sponsors`
    );
    return data.overlays;
  },
  async listAdminSponsorOverlays(): Promise<SponsorOverlayData[]> {
    const { data } = await adminApi.get<{ overlays: SponsorOverlayData[] }>(
      '/admin/sponsor-overlays'
    );
    return data.overlays;
  },
  async createSponsorOverlay(payload: Record<string, unknown>): Promise<SponsorOverlayData> {
    const { data } = await adminApi.post<{ overlay: SponsorOverlayData }>(
      '/admin/sponsor-overlays',
      payload
    );
    return data.overlay;
  },
  async updateSponsorOverlay(
    id: string,
    payload: Record<string, unknown>
  ): Promise<SponsorOverlayData> {
    const { data } = await adminApi.patch<{ overlay: SponsorOverlayData }>(
      `/admin/sponsor-overlays/${id}`,
      payload
    );
    return data.overlay;
  },
  async deleteSponsorOverlay(id: string): Promise<void> {
    await adminApi.delete(`/admin/sponsor-overlays/${id}`);
  },

  // Notifications
  async listNotifications(): Promise<{
    notifications: NotificationData[];
    unreadCount: number;
  }> {
    const { data } = await customerApi.get<{
      notifications: NotificationData[];
      unreadCount: number;
    }>('/notifications');
    return data;
  },
  async markNotificationRead(id: string): Promise<void> {
    await customerApi.patch(`/notifications/${id}/read`);
  },
  async markAllNotificationsRead(): Promise<void> {
    await customerApi.post('/notifications/read-all');
  },
  async deleteNotification(id: string): Promise<void> {
    await customerApi.delete(`/notifications/${id}`);
  },
  async updateNotificationPreferences(
    prefs: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    const { data } = await customerApi.patch<{ notificationPreferences: NotificationPreferences }>(
      '/notifications/preferences',
      prefs
    );
    return data.notificationPreferences;
  },

  // Issue Reports
  async submitIssueReport(
    streamId: string,
    payload: {
      category: string;
      description: string;
      reporterName?: string;
      reporterEmail?: string;
    },
    isSignedIn = false
  ): Promise<MatchReportData> {
    const client = isSignedIn ? customerApi : publicApi;
    const { data } = await client.post<{ report: MatchReportData }>(
      `/live/${streamId}/reports`,
      payload
    );
    return data.report;
  },
  async listAdminReports(status?: string): Promise<MatchReportData[]> {
    const { data } = await adminApi.get<{ reports: MatchReportData[] }>('/admin/reports', {
      params: status ? { status } : undefined,
    });
    return data.reports;
  },
  async updateAdminReport(
    id: string,
    payload: { status?: string; resolutionNotes?: string }
  ): Promise<MatchReportData> {
    const { data } = await adminApi.patch<{ report: MatchReportData }>(
      `/admin/reports/${id}`,
      payload
    );
    return data.report;
  },

  // Viewer Analytics
  async trackViewerSession(payload: {
    liveStreamId: string;
    sessionKey: string;
    mode: 'LIVE' | 'REPLAY' | 'PREVIEW';
    watchSecondsDelta?: number;
  }): Promise<void> {
    await publicApi.post('/analytics/track', payload);
  },
  async getAdminAnalytics(): Promise<ViewerAnalyticsSummary> {
    const { data } = await adminApi.get<ViewerAnalyticsSummary>('/admin/analytics');
    return data;
  },
  async getMatchHealthOverview(): Promise<{
    generatedAt: string;
    totalStreams: number;
    liveCount: number;
    matches: MatchHealthItem[];
  }> {
    const { data } = await adminApi.get('/admin/match-health');
    return data;
  },

  // Player Stats & Leaderboards
  async getLeaderboards(params?: {
    sportType?: string;
    tournamentId?: string;
  }): Promise<{ entries: LeaderboardEntry[]; insufficientData: boolean; message?: string }> {
    const { data } = await publicApi.get('/leaderboards', { params });
    return data;
  },
  async listMatchPlayerStats(streamId: string): Promise<PlayerMatchStatRecord[]> {
    const { data } = await publicApi.get<{ stats: PlayerMatchStatRecord[] }>(
      `/live/${streamId}/player-stats`
    );
    return data.stats;
  },
  async upsertMatchPlayerStat(
    streamId: string,
    payload: Record<string, unknown>
  ): Promise<PlayerMatchStatRecord> {
    const { data } = await adminApi.post<{ stat: PlayerMatchStatRecord }>(
      `/live/${streamId}/player-stats`,
      payload
    );
    return data.stat;
  },
  async verifyPlayer(playerId: string, isVerified = true): Promise<any> {
    const { data } = await adminApi.post(`/players/${playerId}/verify`, { isVerified });
    return data.player;
  },

  // Diagnostics & Database Engine Control
  async getDiagnostics(): Promise<DatabaseDiagnosticsData> {
    const { data } = await adminApi.get<DatabaseDiagnosticsData>('/v1/admin/diagnostics');
    return data;
  },
  async retryMongoConnection(): Promise<{
    ok: boolean;
    engine: 'mongodb' | 'sqlite';
    message: string;
    syncedRecords: number;
    syncedCollections: number;
  }> {
    const { data } = await adminApi.post('/v1/admin/diagnostics/retry-mongo');
    return data;
  },

  // Captain Tournament Registrations
  async registerTeamForTournament(
    tournamentId: string,
    payload: Record<string, unknown>
  ): Promise<{ registration: TournamentRegistrationData; message: string }> {
    const { data } = await customerApi.post(`/v1/tournaments/${tournamentId}/register`, payload);
    return data;
  },
  async getMyTournamentRegistration(
    tournamentId: string
  ): Promise<TournamentRegistrationData | null> {
    const { data } = await customerApi.get<{ registration: TournamentRegistrationData | null }>(
      `/v1/tournaments/${tournamentId}/my-registration`
    );
    return data.registration;
  },
  async listPublicTournamentRegistrations(
    tournamentId: string
  ): Promise<TournamentRegistrationData[]> {
    const { data } = await publicApi.get<{ registrations: TournamentRegistrationData[] }>(
      `/v1/tournaments/${tournamentId}/registrations`
    );
    return data.registrations;
  },
  async updateRegistration(
    id: string,
    payload: Record<string, unknown>
  ): Promise<TournamentRegistrationData> {
    const { data } = await customerApi.patch<{ registration: TournamentRegistrationData }>(
      `/v1/registrations/${id}`,
      payload
    );
    return data.registration;
  },
  async withdrawRegistration(id: string): Promise<TournamentRegistrationData> {
    const { data } = await customerApi.post<{ registration: TournamentRegistrationData }>(
      `/v1/registrations/${id}/withdraw`
    );
    return data.registration;
  },
  async listAdminRegistrations(params?: {
    status?: string;
    tournamentId?: string;
  }): Promise<TournamentRegistrationData[]> {
    const { data } = await adminApi.get<{ registrations: TournamentRegistrationData[] }>(
      '/v1/admin/registrations',
      { params }
    );
    return data.registrations;
  },
  async reviewAdminRegistration(
    id: string,
    payload: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string }
  ): Promise<TournamentRegistrationData> {
    const { data } = await adminApi.post<{ registration: TournamentRegistrationData }>(
      `/v1/admin/registrations/${id}/review`,
      payload
    );
    return data.registration;
  },

  // Organizer Workspace & Monetization
  async getOrganizerOverview(): Promise<{
    tournaments: any[];
    streams: any[];
    subscriptions: OrganizerSubscriptionData[];
    revenueRecords: RevenueRecordData[];
    plans: SubscriptionPlanData[];
    totalRevenue: number;
  }> {
    const { data } = await adminApi.get('/organizer/overview');
    return data;
  },
  async listSubscriptionPlans(): Promise<SubscriptionPlanData[]> {
    const { data } = await publicApi.get<{ plans: SubscriptionPlanData[] }>('/subscription-plans');
    return data.plans;
  },
  async createSubscriptionPlan(payload: Record<string, unknown>): Promise<SubscriptionPlanData> {
    const { data } = await adminApi.post<{ plan: SubscriptionPlanData }>(
      '/admin/subscription-plans',
      payload
    );
    return data.plan;
  },
  async assignOrganizerSubscription(
    payload: Record<string, unknown>
  ): Promise<OrganizerSubscriptionData> {
    const { data } = await adminApi.post<{ subscription: OrganizerSubscriptionData }>(
      '/admin/organizer-subscriptions',
      payload
    );
    return data.subscription;
  },
  async createRevenueRecord(payload: Record<string, unknown>): Promise<RevenueRecordData> {
    const { data } = await adminApi.post<{ record: RevenueRecordData }>(
      '/admin/revenue-records',
      payload
    );
    return data.record;
  },
};
