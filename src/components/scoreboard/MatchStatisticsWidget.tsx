import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { LiveScoreData, LiveStreamData, ScoreHistoryItem } from '../../types/index.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import { deriveMatchStatisticsSummary } from '../../utils/matchStatistics.ts';
import { WinProbabilityWidget } from './WinProbabilityWidget.tsx';

export interface MatchStatisticsWidgetProps {
  matchId: string;
  stream?: Pick<LiveStreamData, 'teamAName' | 'teamBName' | 'gameName' | 'status'>;
  score?: LiveScoreData | null;
  history?: ScoreHistoryItem[];
  className?: string;
}

export function MatchStatisticsWidget({
  matchId,
  stream,
  score: externalScore,
  history = [],
  className = '',
}: MatchStatisticsWidgetProps) {
  const [fetchedScore, setFetchedScore] = useState<LiveScoreData | null>(
    externalScore ?? null
  );
  const [loading, setLoading] = useState<boolean>(externalScore === undefined && Boolean(matchId));
  const [pulseKey, setPulseKey] = useState<number>(0);
  const prevSignatureRef = useRef<string>('');

  useEffect(() => {
    if (externalScore !== undefined) {
      setFetchedScore(externalScore);
      setLoading(false);
    }
  }, [externalScore]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    if (externalScore === undefined) {
      scoreboardService
        .getScore(matchId)
        .then((liveScore) => {
          if (!cancelled && liveScore) {
            setFetchedScore(liveScore);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    const socket = getSocketClient();
    const handleScoreEvent = (payload: { streamId?: string; score?: LiveScoreData }) => {
      if (payload?.streamId === matchId && payload?.score) {
        setFetchedScore(payload.score);
      }
    };

    socket.on('score:updated', handleScoreEvent);
    socket.on('score:event:created', handleScoreEvent);
    socket.on('score:undo', handleScoreEvent);
    socket.on('score:reset', handleScoreEvent);

    return () => {
      cancelled = true;
      socket.off('score:updated', handleScoreEvent);
      socket.off('score:event:created', handleScoreEvent);
      socket.off('score:undo', handleScoreEvent);
      socket.off('score:reset', handleScoreEvent);
    };
  }, [matchId, externalScore === undefined]);

  const activeScore = externalScore ?? fetchedScore;

  const summary = useMemo(
    () =>
      deriveMatchStatisticsSummary({
        sportType: activeScore?.sportType || stream?.gameName,
        teamAName: stream?.teamAName,
        teamBName: stream?.teamBName,
        score: activeScore,
        history,
      }),
    [activeScore, stream?.gameName, stream?.teamAName, stream?.teamBName, history]
  );

  const signature = useMemo(
    () => summary.items.map((item) => `${item.id}:${item.value}`).join('|'),
    [summary.items]
  );

  useEffect(() => {
    if (!signature) return;
    if (prevSignatureRef.current && prevSignatureRef.current !== signature) {
      setPulseKey((k) => k + 1);
    }
    prevSignatureRef.current = signature;
  }, [signature]);

  if (loading && !activeScore) {
    return (
      <section
        aria-label="Match Statistics"
        className={`bg-slate-950 border border-slate-800 rounded-xl p-3.5 sm:p-4 text-white animate-pulse space-y-3 ${className}`}
      >
        <div className="h-4 w-36 bg-slate-800 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="h-14 bg-slate-900 rounded" />
          <div className="h-14 bg-slate-900 rounded" />
          <div className="h-14 bg-slate-900 rounded" />
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Match Statistics"
      className={`bg-slate-950 border border-slate-800 rounded-xl p-3.5 sm:p-4 text-white shadow-sm space-y-3 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-[#EA580C] shrink-0" />
          <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            Match Statistics
          </h2>
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-400">
          {summary.headerBadge}
        </span>
      </div>

      {/* Cumulative KPI Matrix with crisp hairline dividers */}
      <div
        key={pulseKey}
        className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border border-slate-800/90 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-800/90 bg-slate-900/60 overflow-hidden ${
          pulseKey > 0 ? 'ml-player-change' : ''
        }`}
      >
        {summary.items.map((item, idx) => (
          <div
            key={item.id}
            className={`px-3 py-2.5 flex flex-col justify-between min-w-0 ${
              idx >= 3 ? 'lg:border-t-0 sm:border-t sm:border-slate-800/90' : ''
            } ${idx % 2 === 1 ? 'border-l border-slate-800/90 sm:border-l-0' : ''}`}
          >
            <span className="text-[11px] font-medium text-slate-400 truncate">
              {item.label}
            </span>
            <span
              className={`mt-1 font-mono tabular-nums text-lg sm:text-xl font-bold leading-tight ${
                item.highlight ? 'text-orange-300' : 'text-white'
              }`}
            >
              {item.value}
            </span>
            <span className="mt-1 font-mono tabular-nums text-[11px] text-slate-400 truncate">
              {item.sublabel}
            </span>
          </div>
        ))}
      </div>

      {/* Team-by-Team Cumulative Breakdown Row */}
      {summary.teamBreakdown.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800/80">
          {summary.teamBreakdown.map((team) => (
            <div
              key={team.side}
              className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-slate-900/40"
            >
              <div className="min-w-0 flex items-center gap-2">
                <span
                  className={`text-xs font-semibold truncate ${
                    team.active ? 'text-orange-300' : 'text-slate-200'
                  }`}
                >
                  {team.teamName}
                </span>
                {team.active && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 shrink-0">
                    Batting
                  </span>
                )}
              </div>
              <div className="text-right shrink-0 font-mono tabular-nums">
                <span className="text-xs font-bold text-white mr-2">
                  {team.primaryMetric}
                </span>
                <span className="text-[11px] text-slate-400">
                  {team.detailText}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live Win Probability Indicator */}
      <WinProbabilityWidget
        sportType={activeScore?.sportType || stream?.gameName}
        teamAName={stream?.teamAName}
        teamBName={stream?.teamBName}
        score={activeScore}
      />
    </section>
  );
}
