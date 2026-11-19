import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ScoreHistoryItem } from '../../types/index.ts';

interface LiveCommentaryFeedProps {
  history: ScoreHistoryItem[];
}

export function LiveCommentaryFeed({ history }: LiveCommentaryFeedProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#EA580C]" />
          <h2 className="font-display text-sm font-bold text-slate-900">
            Live Commentary &amp; Match Timeline
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-mono tabular-nums">
          {history.length} update{history.length === 1 ? '' : 's'}
        </span>
      </div>

      {history.length === 0 ? (
        <p className="p-5 text-sm text-slate-500">
          Live commentary, wickets, goals, raids, and score updates will stream here in real time.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
          {history.map((item) => {
            const isCommentary = item.entryType === 'COMMENTARY';
            const isResult = item.entryType === 'RESULT';
            const isCorrection = item.entryType === 'CORRECTION';
            return (
              <div
                key={item._id}
                className={`px-4 py-3 flex items-start justify-between gap-3 text-xs ${
                  isCommentary
                    ? 'bg-emerald-50/50'
                    : isResult
                      ? 'bg-amber-50/80'
                      : isCorrection
                        ? 'bg-sky-50/70'
                        : item.reverted
                          ? 'opacity-50 line-through'
                          : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 break-words leading-relaxed">
                    {isCommentary && (
                      <span className="font-bold text-emerald-700 mr-1.5">COMMENTARY</span>
                    )}
                    {isResult && (
                      <span className="font-bold text-amber-800 mr-1.5">OFFICIAL RESULT</span>
                    )}
                    {isCorrection && (
                      <span className="font-bold text-sky-800 mr-1.5">CORRECTION</span>
                    )}
                    {item.action}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </p>
                </div>
                <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0 bg-slate-100 px-2 py-0.5 rounded">
                  {item.updatedScore?.teamAScore ?? 0} - {item.updatedScore?.teamBScore ?? 0}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
