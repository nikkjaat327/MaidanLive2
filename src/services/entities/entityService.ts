import {
  ActivityLogItem,
  AuthUser,
  DashboardStats,
  FixtureData,
  LiveStreamData,
  PlayerData,
  PlayerMatchStatRecord,
  PointsTableRow,
  SearchResultsPayload,
  TeamData,
  TournamentData,
  TournamentTemplateData,
  VenueData,
} from '../../types/index.ts';
import { adminApi, publicApi } from '../api/httpClient.ts';

export const entityService = {
  async getDashboardStats(): Promise<{
    stats: DashboardStats;
    recentActivity: ActivityLogItem[];
  }> {
    const { data } = await adminApi.get<{
      stats: DashboardStats;
      recentActivity: ActivityLogItem[];
    }>('/admin/dashboard-stats');
    return data;
  },

  async getActivityLogs(params?: {
    action?: string;
    resourceType?: string;
    search?: string;
    limit?: number;
  }): Promise<ActivityLogItem[]> {
    const { data } = await adminApi.get<{ logs: ActivityLogItem[] }>('/admin/activity-logs', {
      params,
    });
    return data.logs;
  },

  // Tournaments
  async listTournaments(params?: {
    sportType?: string;
    status?: string;
    search?: string;
    publishedOnly?: boolean;
  }): Promise<TournamentData[]> {
    const { data } = await publicApi.get<{ tournaments: TournamentData[] }>('/tournaments', {
      params,
    });
    return data.tournaments;
  },

  async getTournamentDetail(id: string): Promise<{
    tournament: TournamentData;
    streams: LiveStreamData[];
    teams: TeamData[];
    players?: PlayerData[];
    fixtures: FixtureData[];
    pointsTable: PointsTableRow[];
    venue: VenueData | null;
  }> {
    const { data } = await publicApi.get(`/tournaments/${id}`);
    return data;
  },

  async createTournament(payload: Partial<TournamentData>): Promise<TournamentData> {
    const { data } = await adminApi.post<{ tournament: TournamentData }>('/tournaments', payload);
    return data.tournament;
  },

  async updateTournament(id: string, payload: Partial<TournamentData>): Promise<TournamentData> {
    const { data } = await adminApi.patch<{ tournament: TournamentData }>(
      `/tournaments/${id}`,
      payload
    );
    return data.tournament;
  },

  async updateTournamentResultsAwards(
    id: string,
    payload: {
      positions?: TournamentData['positions'];
      bestPlayer?: TournamentData['bestPlayer'];
      customAwardFields?: TournamentData['customAwardFields'];
      status?: TournamentData['status'];
    }
  ): Promise<TournamentData> {
    const { data } = await adminApi.patch<{ tournament: TournamentData }>(
      `/tournaments/${id}/results-awards`,
      payload
    );
    return data.tournament;
  },

  async deleteTournament(id: string): Promise<void> {
    await adminApi.delete(`/tournaments/${id}`);
  },

  // Teams
  async listTeams(params?: {
    sportType?: string;
    tournamentId?: string;
    search?: string;
  }): Promise<TeamData[]> {
    const { data } = await publicApi.get<{ teams: TeamData[] }>('/teams', { params });
    return data.teams;
  },

  async getTeamProfile(id: string): Promise<{
    team: TeamData;
    players: PlayerData[];
    streams: LiveStreamData[];
    fixtures: FixtureData[];
    record: { played: number; won: number; lost: number; drawn: number };
  }> {
    const { data } = await publicApi.get(`/teams/${id}`);
    return data;
  },

  async createTeam(payload: Record<string, unknown>): Promise<TeamData> {
    const { data } = await adminApi.post<{ team: TeamData }>('/teams', payload);
    return data.team;
  },

  async updateTeam(id: string, payload: Record<string, unknown>): Promise<TeamData> {
    const { data } = await adminApi.patch<{ team: TeamData }>(`/teams/${id}`, payload);
    return data.team;
  },

  async deleteTeam(id: string): Promise<void> {
    await adminApi.delete(`/teams/${id}`);
  },

  // Players
  async listPlayers(
    teamIdOrParams?: string | { teamId?: string; sportType?: string; search?: string }
  ): Promise<PlayerData[]> {
    const params =
      typeof teamIdOrParams === 'string' ? { teamId: teamIdOrParams } : teamIdOrParams;
    const { data } = await publicApi.get<{ players: PlayerData[] }>('/players', { params });
    return data.players;
  },

  async getPlayerProfile(id: string): Promise<{
    player: PlayerData;
    totals: Record<string, number>;
    matchStats: PlayerMatchStatRecord[];
  }> {
    const { data } = await publicApi.get(`/players/${id}`);
    return data;
  },

  async createPlayer(payload: Record<string, unknown>): Promise<PlayerData> {
    const { data } = await adminApi.post<{ player: PlayerData }>('/players', payload);
    return data.player;
  },

  async updatePlayer(id: string, payload: Record<string, unknown>): Promise<PlayerData> {
    const { data } = await adminApi.patch<{ player: PlayerData }>(`/players/${id}`, payload);
    return data.player;
  },

  async deletePlayer(id: string): Promise<void> {
    await adminApi.delete(`/players/${id}`);
  },

  // Admin User Management (Super Admin only)
  async listUsers(): Promise<AuthUser[]> {
    const { data } = await adminApi.get<{ users: AuthUser[] }>('/admin/users');
    return data.users;
  },
  async createUser(payload: Record<string, unknown>): Promise<AuthUser> {
    const { data } = await adminApi.post<{ user: AuthUser }>('/admin/users', payload);
    return data.user;
  },
  async updateUser(id: string, payload: Record<string, unknown>): Promise<AuthUser> {
    const { data } = await adminApi.patch<{ user: AuthUser }>(`/admin/users/${id}`, payload);
    return data.user;
  },
  async deleteUser(id: string): Promise<void> {
    await adminApi.delete(`/admin/users/${id}`);
  },

  // Global Unified Search
  async globalSearch(q: string, type = 'all'): Promise<SearchResultsPayload> {
    const { data } = await publicApi.get<SearchResultsPayload>('/search', {
      params: { q, type },
    });
    return data;
  },

  // Tournament Templates
  async listTournamentTemplates(): Promise<TournamentTemplateData[]> {
    const { data } = await adminApi.get<{ templates: TournamentTemplateData[] }>(
      '/tournament-templates'
    );
    return data.templates;
  },
  async createTournamentTemplate(
    payload: Partial<TournamentTemplateData>
  ): Promise<TournamentTemplateData> {
    const { data } = await adminApi.post<{ template: TournamentTemplateData }>(
      '/tournament-templates',
      payload
    );
    return data.template;
  },
  async deleteTournamentTemplate(id: string): Promise<void> {
    await adminApi.delete(`/tournament-templates/${id}`);
  },
};
