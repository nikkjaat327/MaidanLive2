import { useCallback, useEffect, useState } from 'react';
import { LiveScoreData, ScoreHistoryItem } from '../types/index.ts';
import { scoreboardService } from '../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../services/api/httpClient.ts';
import { useSocket } from './useSocket.ts';

export function useScoreboard(streamId?: string) {
  const [score, setScore] = useState<LiveScoreData | null>(null);
  const [history, setHistory] = useState<ScoreHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(streamId));
  const [error, setError] = useState<string | null>(null);

  const fetchScoreAndHistory = useCallback(async () => {
    if (!streamId) return;
    try {
      setError(null);
      const [scoreData, historyData] = await Promise.all([
        scoreboardService.getScore(streamId),
        scoreboardService.getScoreHistory(streamId),
      ]);
      setScore(scoreData);
      setHistory(historyData);
    } catch (err) {
      setError(extractApiError(err, 'Unable to load scoreboard.'));
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  const { connected, socket } = useSocket(streamId, fetchScoreAndHistory);

  useEffect(() => {
    if (!streamId) {
      setScore(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchScoreAndHistory();
  }, [streamId, fetchScoreAndHistory]);

  useEffect(() => {
    if (!streamId) return;

    const handleScoreUpdated = (payload: {
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
      correctedEventId?: string;
    }) => {
      if (payload.streamId !== streamId) return;
      setScore(payload.score);
      if (payload.historyItem) {
        setHistory((prev) => {
          const updatedPrev = payload.correctedEventId
            ? prev.map((item) =>
                item._id === payload.correctedEventId ? { ...item, reverted: true } : item
              )
            : prev;
          if (updatedPrev.some((h) => h._id === payload.historyItem!._id)) return updatedPrev;
          return [payload.historyItem!, ...updatedPrev].slice(0, 100);
        });
      }
    };

    const handleScoreUndo = (payload: { streamId: string; score: LiveScoreData }) => {
      if (payload.streamId !== streamId) return;
      setScore(payload.score);
      scoreboardService.getScoreHistory(streamId).then(setHistory).catch(() => {});
    };

    const handleScoreReset = (payload: { streamId: string; score: LiveScoreData }) => {
      if (payload.streamId !== streamId) return;
      setScore(payload.score);
      scoreboardService.getScoreHistory(streamId).then(setHistory).catch(() => {});
    };

    const handleCommentaryAdded = (payload: {
      streamId: string;
      commentary?: ScoreHistoryItem;
    }) => {
      if (payload.streamId !== streamId || !payload.commentary) return;
      setHistory((prev) => {
        if (prev.some((h) => h._id === payload.commentary!._id)) return prev;
        return [payload.commentary!, ...prev].slice(0, 100);
      });
    };

    const handleResultEvent = (payload: {
      streamId: string;
      score: LiveScoreData;
      historyItem?: ScoreHistoryItem;
    }) => {
      if (payload.streamId !== streamId) return;
      setScore(payload.score);
      if (payload.historyItem) {
        setHistory((prev) => {
          if (prev.some((h) => h._id === payload.historyItem!._id)) return prev;
          return [payload.historyItem!, ...prev].slice(0, 100);
        });
      }
    };

    socket.on('score:updated', handleScoreUpdated);
    socket.on('score:event:created', handleScoreUpdated);
    socket.on('score:event:corrected', handleScoreUpdated);
    socket.on('score:undo', handleScoreUndo);
    socket.on('score:reset', handleScoreReset);
    socket.on('commentary:added', handleCommentaryAdded);
    socket.on('match:result:declared', handleResultEvent);
    socket.on('match:result:updated', handleResultEvent);

    return () => {
      socket.off('score:updated', handleScoreUpdated);
      socket.off('score:event:created', handleScoreUpdated);
      socket.off('score:event:corrected', handleScoreUpdated);
      socket.off('score:undo', handleScoreUndo);
      socket.off('score:reset', handleScoreReset);
      socket.off('commentary:added', handleCommentaryAdded);
      socket.off('match:result:declared', handleResultEvent);
      socket.off('match:result:updated', handleResultEvent);
    };
  }, [streamId, socket]);

  return {
    score,
    setScore,
    history,
    loading,
    error,
    connected,
    refetch: fetchScoreAndHistory,
  };
}
