import { LiveScoreData, ScoreHistoryItem } from '../../types/index.ts';
import { adminApi, publicApi } from '../api/httpClient.ts';

export const scoreboardService = {
  async getScore(streamId: string): Promise<LiveScoreData> {
    const { data } = await publicApi.get<{ score: LiveScoreData }>(`/live/${streamId}/score`);
    return data.score;
  },

  async updateScore(
    streamId: string,
    payload: {
      teamAScore?: number;
      teamBScore?: number;
      sportSpecificDetails?: Record<string, unknown>;
      matchStatus?: string;
      sportType?: string;
      tossWinner?: 'A' | 'B' | '';
      tossDecision?: string;
      action?: string;
    }
  ): Promise<{ streamId: string; score: LiveScoreData; historyItem?: ScoreHistoryItem }> {
    const { data } = await adminApi.patch<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
    }>(`/live/${streamId}/score`, payload);
    return data;
  },

  async recordScoreEvent(
    streamId: string,
    payload: {
      clientEventId?: string;
      sportType?: string;
      action: Record<string, unknown>;
      playerId?: string;
      playerName?: string;
      assistPlayerId?: string;
      assistPlayerName?: string;
      eventPhase?: string;
      matchStatus?: string;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
    duplicatePrevented?: boolean;
  }> {
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      duplicatePrevented?: boolean;
    }>(`/live/${streamId}/score/event`, payload);
    return data;
  },

  async correctScoreEvent(
    streamId: string,
    eventId: string,
    payload: {
      correctionReason: string;
      teamAScore?: number;
      teamBScore?: number;
      sportSpecificDetails?: Record<string, unknown>;
      revertToBeforeEvent?: boolean;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
  }> {
    const { data } = await adminApi.patch<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
    }>(`/live/${streamId}/score/event/${eventId}`, payload);
    return data;
  },

  async undoScore(streamId: string): Promise<{
    streamId: string;
    score: LiveScoreData;
    undoneAction: string;
  }> {
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      undoneAction: string;
    }>(`/live/${streamId}/score/undo`);
    return data;
  },

  async recordCricketBall(
    streamId: string,
    payload: Record<string, unknown>
  ): Promise<{ streamId: string; score: LiveScoreData; historyItem?: ScoreHistoryItem }> {
    const { data } = await adminApi.post(`/live/${streamId}/cricket/ball`, payload);
    return data;
  },

  async undoCricketBall(streamId: string): Promise<{
    streamId: string;
    score: LiveScoreData;
    undoneAction: string;
  }> {
    const { data } = await adminApi.post(`/live/${streamId}/cricket/undo`);
    return data;
  },

  async resetScore(streamId: string): Promise<{ streamId: string; score: LiveScoreData }> {
    const { data } = await adminApi.post<{ streamId: string; score: LiveScoreData }>(
      `/live/${streamId}/score/reset`
    );
    return data;
  },

  async getScoreHistory(streamId: string): Promise<ScoreHistoryItem[]> {
    const { data } = await publicApi.get<{ history: ScoreHistoryItem[] }>(
      `/live/${streamId}/score/history`
    );
    return data.history;
  },

  async submitCommentary(
    streamId: string,
    snippet: string
  ): Promise<{ streamId: string; commentary: ScoreHistoryItem }> {
    const { data } = await adminApi.post<{ streamId: string; commentary: ScoreHistoryItem }>(
      `/live/${streamId}/commentary`,
      { snippet }
    );
    return data;
  },

  async getMatchResult(streamId: string): Promise<{
    streamId: string;
    score: LiveScoreData;
  }> {
    const { data } = await publicApi.get<{ streamId: string; score: LiveScoreData }>(
      `/live/${streamId}/result`
    );
    return data;
  },

  async declareMatchResult(
    streamId: string,
    payload: {
      resultType: string;
      winningMargin?: string;
      resultDescription?: string;
      mvpPlayerId?: string;
      mvpPlayerName?: string;
      finalSummary?: string;
      confirmCorrection?: boolean;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
    isCorrection?: boolean;
  }> {
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      isCorrection?: boolean;
    }>(`/live/${streamId}/result`, payload);
    return data;
  },
};
