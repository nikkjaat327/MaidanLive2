import { Link } from 'react-router-dom';
import { Calendar, Radio, Trophy } from 'lucide-react';
import { FixtureData } from '../../types/index.ts';

interface TournamentBracketProps {
  fixtures: FixtureData[];
}

export function TournamentBracket({ fixtures }: TournamentBracketProps) {
  if (fixtures.length === 0) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
        No bracket fixtures have been scheduled for this tournament yet.
      </div>
    );
  }

  // Group fixtures by roundNumber (and sort ascending)
  const roundMap = new Map<number, { roundName: string; items: FixtureData[] }>();
  for (const fx of fixtures) {
    const existing = roundMap.get(fx.roundNumber);
    if (existing) {
      existing.items.push(fx);
    } else {
      roundMap.set(fx.roundNumber, {
        roundName: fx.roundName || `Round ${fx.roundNumber}`,
        items: [fx],
      });
    }
  }

  const rounds = Array.from(roundMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, val]) => ({
      roundNumber,
      roundName: val.roundName,
      items: val.items.sort((a, b) => a.matchNumber - b.matchNumber),
    }));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 overflow-x-auto">
      <div className="flex items-start gap-6 min-w-max">
        {rounds.map((round) => (
          <div key={round.roundNumber} className="w-72 shrink-0 space-y-3">
            <div className="px-3 py-2 rounded-lg bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">{round.roundName}</span>
              <span className="font-mono text-[11px] text-slate-300">
                {round.items.length} match{round.items.length === 1 ? '' : 'es'}
              </span>
            </div>

            <div className="space-y-3">
              {round.items.map((fx) => {
                const streamObj =
                  typeof fx.liveStreamId === 'object' && fx.liveStreamId ? fx.liveStreamId : null;
                const streamId = streamObj ? streamObj.id || streamObj._id : (fx.liveStreamId as string | null);
                const winnerA = fx.resultConfirmed && fx.winnerTeamId && fx.winnerTeamId === fx.teamAId;
                const winnerB = fx.resultConfirmed && fx.winnerTeamId && fx.winnerTeamId === fx.teamBId;

                return (
                  <div
                    key={fx.id}
                    className={`rounded-xl border p-3 space-y-2 transition-colors ${
                      fx.status === 'LIVE'
                        ? 'border-red-300 bg-red-50/40'
                        : fx.isBye
                          ? 'border-dashed border-slate-300 bg-slate-50/70'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-mono font-semibold">
                        Match #{fx.matchNumber}
                        {fx.groupName ? ` · ${fx.groupName}` : ''}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold uppercase ${
                          fx.status === 'LIVE'
                            ? 'bg-red-600 text-white'
                            : fx.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : fx.status === 'BYE'
                                ? 'bg-slate-200 text-slate-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {fx.status}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div
                        className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs border ${
                          winnerA
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-950'
                            : 'bg-slate-50 border-slate-100 text-slate-800 font-medium'
                        }`}
                      >
                        <span className="truncate">{fx.teamAName || 'TBD'}</span>
                        {winnerA && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                      <div
                        className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs border ${
                          winnerB
                            ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-950'
                            : 'bg-slate-50 border-slate-100 text-slate-800 font-medium'
                        }`}
                      >
                        <span className="truncate">{fx.teamBName || (fx.isBye ? 'BYE' : 'TBD')}</span>
                        {winnerB && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                    </div>

                    {fx.resultSummary && (
                      <p className="text-[11px] font-semibold text-emerald-800">{fx.resultSummary}</p>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 truncate">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {fx.scheduledAt
                          ? new Date(fx.scheduledAt).toLocaleDateString()
                          : fx.location || 'TBD'}
                      </span>
                      {streamId && (
                        <Link
                          to={`/live/${streamId}`}
                          className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900 shrink-0"
                        >
                          <Radio className="w-3 h-3" />
                          <span>Watch</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
