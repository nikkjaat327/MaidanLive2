import { FixtureData, LiveStreamData, PointsTableRow } from '../../types/index.ts';
import { adminApi, publicApi } from '../api/httpClient.ts';

export const tournamentWorkflowService = {
  async listFixtures(tournamentId: string): Promise<FixtureData[]> {
    const { data } = await publicApi.get<{ fixtures: FixtureData[] }>(
      `/tournaments/${tournamentId}/fixtures`
    );
    return data.fixtures;
  },

  async getStandings(tournamentId: string): Promise<PointsTableRow[]> {
    const { data } = await publicApi.get<{ pointsTable: PointsTableRow[] }>(
      `/tournaments/${tournamentId}/standings`
    );
    return data.pointsTable;
  },

  async createFixture(
    tournamentId: string,
    payload: {
      roundNumber?: number;
      roundName?: string;
      groupName?: string;
      matchNumber?: number;
      teamAId?: string | null;
      teamBId?: string | null;
      teamAName?: string;
      teamBName?: string;
      venueId?: string | null;
      location?: string;
      scheduledAt?: string | null;
    }
  ): Promise<FixtureData> {
    const { data } = await adminApi.post<{ fixture: FixtureData }>(
      `/tournaments/${tournamentId}/fixtures`,
      payload
    );
    return data.fixture;
  },

  async generateFixtures(
    tournamentId: string,
    payload?: {
      format?: string;
      teamIds?: string[];
      groupCount?: number;
      replaceExisting?: boolean;
    }
  ): Promise<FixtureData[]> {
    const { data } = await adminApi.post<{ fixtures: FixtureData[] }>(
      `/tournaments/${tournamentId}/fixtures/generate`,
      payload || {}
    );
    return data.fixtures;
  },

  async updateFixture(
    fixtureId: string,
    payload: Partial<FixtureData>
  ): Promise<FixtureData> {
    const { data } = await adminApi.patch<{ fixture: FixtureData }>(
      `/fixtures/${fixtureId}`,
      payload
    );
    return data.fixture;
  },

  async deleteFixture(fixtureId: string): Promise<void> {
    await adminApi.delete(`/fixtures/${fixtureId}`);
  },

  async linkStream(
    fixtureId: string,
    payload: {
      liveStreamId?: string;
      youtubeInput?: string;
      status?: 'UPCOMING' | 'LIVE';
    }
  ): Promise<{ fixture: FixtureData; stream: LiveStreamData }> {
    const { data } = await adminApi.post<{ fixture: FixtureData; stream: LiveStreamData }>(
      `/fixtures/${fixtureId}/link-stream`,
      payload
    );
    return data;
  },
};
