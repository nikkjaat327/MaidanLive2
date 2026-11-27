import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Radio, X } from 'lucide-react';
import { LiveStreamData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { formatCricketOvers } from '../../utils/cricketScoring.ts';
import { TeamAvatar } from '../common/TeamAvatar.tsx';

interface QuickMatchSwitcherModalProps {
  open: boolean;
  currentMatchId: string;
  onClose: () => void;
}

function formatScoreLine(stream: LiveStreamData): string {
  const sc = stream.score;
  if (!sc) return 'Scoreboard ready';
  if (sc.sportType === 'Cricket' && sc.sportSpecificDetails) {
    const d = sc.sportSpecificDetails;
    return `${d.teamARuns ?? sc.teamAScore}/${d.teamAWickets ?? 0} (${formatCricketOvers(
      d.teamABalls ?? 0
    )}) vs ${d.teamBRuns ?? sc.teamBScore}/${d.teamBWickets ?? 0} (${formatCricketOvers(
      d.teamBBalls ?? 0
    )})`;
  }
  return `${sc.teamAScore} - ${sc.teamBScore}`;
}

export function QuickMatchSwitcherModal({
  open,
  currentMatchId,
  onClose,
}: QuickMatchSwitcherModalProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [liveMatches, setLiveMatches] = useState<LiveStreamData[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    liveStreamService
      .listStreams()
      .then((list) => {
        if (cancelled) return;
        const active = list.filter(
          (item) => item.status === 'LIVE' || item.status === 'UPCOMING'
        );
        setLiveMatches(active);
      })
      .catch(() => {
        if (!cancelled) setLiveMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const liveNow = liveMatches.filter((m) => m.status === 'LIVE');
  const upcoming = liveMatches.filter((m) => m.status === 'UPCOMING').slice(0, 6);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Switch Live Match"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[82vh] flex flex-col safe-pb">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-600" />
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                Switch Live Match
              </h2>
              <p className="text-[11px] text-slate-500">
                Jump directly between active broadcasts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close match switcher"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {loading ? (
            <div className="py-10 flex flex-col items-center gap-2 text-xs text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-[#EA580C]" />
              <span>Loading active matches...</span>
            </div>
          ) : liveNow.length === 0 && upcoming.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No other active broadcasts available right now.
            </p>
          ) : (
            <>
              {liveNow.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                    Live Now ({liveNow.length})
                  </p>
                  <div className="space-y-2">
                    {liveNow.map((m) => {
                      const isCurrent = m.id === currentMatchId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onClose();
                            if (!isCurrent) navigate(`/live/${m.id}`);
                          }}
                          className={`w-full min-h-[56px] p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                            isCurrent
                              ? 'bg-orange-50 border-orange-300'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <TeamAvatar
                              name={m.teamAName || 'A'}
                              logoUrl={m.teamALogo}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-600" />
                                <span className="font-bold text-[#EA580C]">
                                  {m.gameName || 'Match'}
                                </span>
                                {m.tournamentName && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">{m.tournamentName}</span>
                                  </>
                                )}
                              </div>
                              <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {m.matchTitle ||
                                  `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'}`}
                              </p>
                              <p className="font-mono tabular-nums text-[11px] font-semibold text-slate-600 mt-0.5">
                                {formatScoreLine(m)}
                              </p>
                            </div>
                          </div>
                          {isCurrent ? (
                            <span className="text-[11px] font-bold text-[#EA580C] shrink-0">
                              Watching
                            </span>
                          ) : (
                            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {upcoming.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1">
                    Upcoming ({upcoming.length})
                  </p>
                  <div className="space-y-1.5">
                    {upcoming.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate(`/live/${m.id}`);
                        }}
                        className="w-full min-h-[48px] p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100 text-left flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {m.matchTitle ||
                              `${m.teamAName || 'Team A'} vs ${m.teamBName || 'Team B'}`}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {m.gameName || 'Sports'}
                            {m.matchDate ? ` · ${new Date(m.matchDate).toLocaleString()}` : ''}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
