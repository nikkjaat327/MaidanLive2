import { LiveScoreData, ScoreHistoryItem } from '../../types/index.ts';
import {
  getDiagRequestHeaders,
  type ScoreDiagTraceServer,
} from '../../utils/realtimeDiagnostics.ts';
import { adminApi, publicApi } from '../api/httpClient.ts';

export const scoreboardService = {
  async getScore(streamId: string): Promise<LiveScoreData> {
    const { data } = await publicApi.get<{ score: LiveScoreData }>(`/live/${streamId}/score`);
    return data.score;
  },

  async updateScore(
    streamId: string,
    payload: {
      clientEventId?: string;
      traceId?: string;
      teamAScore?: number;
      teamBScore?: number;
      sportSpecificDetails?: Record<string, unknown>;
      matchStatus?: string;
      sportType?: string;
      tossWinner?: 'A' | 'B' | '';
      tossDecision?: string;
      action?: string;
      allowLockedOverride?: boolean;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
    duplicatePrevented?: boolean;
    diag?: ScoreDiagTraceServer;
  }> {
    const { traceId, ...body } = payload;
    const headers = getDiagRequestHeaders(traceId);
    const { data } = await adminApi.patch<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      duplicatePrevented?: boolean;
      diag?: ScoreDiagTraceServer;
    }>(`/live/${streamId}/score`, body, Object.keys(headers).length ? { headers } : undefined);
    return data;
  },

  async recordScoreEvent(
    streamId: string,
    payload: {
      clientEventId?: string;
      traceId?: string;
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
    diag?: ScoreDiagTraceServer;
  }> {
    const { traceId, ...body } = payload;
    const headers = getDiagRequestHeaders(traceId);
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      duplicatePrevented?: boolean;
      diag?: ScoreDiagTraceServer;
    }>(`/live/${streamId}/score/event`, body, Object.keys(headers).length ? { headers } : undefined);
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

  async undoScore(
    streamId: string,
    options?: { clientEventId?: string; traceId?: string }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    undoneAction: string;
    duplicatePrevented?: boolean;
    diag?: ScoreDiagTraceServer;
  }> {
    const headers = getDiagRequestHeaders(options?.traceId);
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      undoneAction: string;
      duplicatePrevented?: boolean;
      diag?: ScoreDiagTraceServer;
    }>(
      `/live/${streamId}/score/undo`,
      options?.clientEventId ? { clientEventId: options.clientEventId } : undefined,
      Object.keys(headers).length ? { headers } : undefined
    );
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

  async completeCricketInnings(
    streamId: string,
    reason: 'MANUAL' | 'OVERS_COMPLETED' | 'ALL_OUT' = 'MANUAL'
  ): Promise<{ streamId: string; score: LiveScoreData; historyItem?: ScoreHistoryItem }> {
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
    }>(`/live/${streamId}/cricket/complete-innings`, { reason });
    return data;
  },

  async startSecondCricketInnings(
    streamId: string,
    payload: {
      battingTeam?: 'A' | 'B';
      batsman1: string;
      batsman2: string;
      bowler: string;
      oversLimit?: number;
      target?: number;
    }
  ): Promise<{ streamId: string; score: LiveScoreData; historyItem?: ScoreHistoryItem }> {
    const { data } = await adminApi.post<{
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
    }>(`/live/${streamId}/cricket/start-second-innings`, payload);
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

  async recordKabaddiEvent(
    streamId: string,
    payload: {
      clientEventId?: string;
      traceId?: string;
      action: Record<string, unknown>;
      allowPostCompletionOverride?: boolean;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
    duplicatePrevented?: boolean;
    triggeredDoOrDie?: Record<string, unknown> | null;
    triggeredAllOut?: Record<string, unknown> | null;
    diag?: ScoreDiagTraceServer;
  }> {
    const { traceId, ...body } = payload;
    const headers = getDiagRequestHeaders(traceId);
    const { data } = await adminApi.post(
      `/live/${streamId}/kabaddi/event`,
      body,
      Object.keys(headers).length ? { headers } : undefined
    );
    return data;
  },

  async controlKabaddiClock(
    streamId: string,
    command: Record<string, unknown>
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
    serverNowIso?: string;
  }> {
    const { data } = await adminApi.post(`/live/${streamId}/kabaddi/clock`, { command });
    return data;
  },

  async saveKabaddiSettings(
    streamId: string,
    payload: {
      rules?: Record<string, unknown>;
      scorerSettings?: Record<string, unknown>;
      viewerDisplaySettings?: Record<string, unknown>;
      resetRulesDefaults?: boolean;
      resetScorerDefaults?: boolean;
      resetViewerDefaults?: boolean;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
  }> {
    const { data } = await adminApi.patch(`/live/${streamId}/kabaddi/settings`, payload);
    return data;
  },

  async completeKabaddiMatch(
    streamId: string,
    payload?: {
      forfeitTeam?: 'A' | 'B' | '';
      forfeitReason?: string;
      goldenRaidWinner?: 'A' | 'B' | '';
      allowDraw?: boolean;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
  }> {
    const { data } = await adminApi.post(`/live/${streamId}/kabaddi/complete`, payload || {});
    return data;
  },

  async reopenKabaddiMatch(
    streamId: string,
    reason?: string
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
  }> {
    const { data } = await adminApi.post(`/live/${streamId}/kabaddi/reopen`, { reason });
    return data;
  },

  async saveVolleyballRules(
    streamId: string,
    payload: {
      bestOfSets?: number;
      pointsPerSet?: number;
      minMargin?: number;
      finalSetPoints?: number;
      finalSetMinMargin?: number;
      autoCompleteSets?: boolean;
      allowManualWinnerDeclaration?: boolean;
      allowMatchReopen?: boolean;
      rules?: Record<string, unknown>;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
  }> {
    const { data } = await adminApi.patch(`/live/${streamId}/volleyball/rules`, payload);
    return data;
  },

  async completeVolleyballMatch(
    streamId: string,
    payload: {
      winnerSide: 'A' | 'B';
      reason?: string;
      winningMargin?: string;
      resultDescription?: string;
      mvpPlayerId?: string;
      mvpPlayerName?: string;
      finalSummary?: string;
    }
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
  }> {
    const { data } = await adminApi.post(`/live/${streamId}/volleyball/complete`, payload);
    return data;
  },

  async reopenVolleyballMatch(
    streamId: string,
    reason?: string
  ): Promise<{
    streamId: string;
    score: LiveScoreData;
    historyItem?: ScoreHistoryItem;
  }> {
    const { data } = await adminApi.post(`/live/${streamId}/volleyball/reopen`, { reason });
    return data;
  },
};

