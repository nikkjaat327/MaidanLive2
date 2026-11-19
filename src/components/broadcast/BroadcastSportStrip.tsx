import React from 'react';
import { NormalizedBroadcast } from '../../types/index.ts';

interface BroadcastSportStripProps {
  broadcast: NormalizedBroadcast;
}

export function BroadcastSportStrip({ broadcast }: BroadcastSportStripProps) {
  const recentBalls =
    broadcast.sport === 'Cricket' &&
    Array.isArray(broadcast.score?.sportSpecificDetails?.recentBalls)
      ? (broadcast.score!.sportSpecificDetails.recentBalls as string[])
      : [];

  if (broadcast.subStripItems.length === 0 && recentBalls.length === 0) {
    return null;
  }

  const accentMap: Record<string, string> = {
    orange: 'text-orange-300',
    emerald: 'text-emerald-300',
    blue: 'text-sky-300',
    red: 'text-red-300',
    slate: 'text-white',
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 space-y-2">
      {broadcast.subStripItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {broadcast.subStripItems.map((item, idx) => (
            <div key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {item.label}:
              </span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  accentMap[item.accent || 'slate'] || 'text-white'
                }`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {recentBalls.length > 0 && (
        <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800 overflow-x-auto">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0">
            Recent Balls:
          </span>
          <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            {recentBalls.slice(-10).map((ball, i) => (
              <span
                key={`${ball}-${i}`}
                className={`min-w-[26px] h-6 px-1.5 rounded flex items-center justify-center font-bold ${
                  ball === 'W'
                    ? 'bg-red-600 text-white'
                    : ball === '4' || ball === '6'
                      ? 'bg-[#EA580C] text-white'
                      : 'bg-slate-800 text-slate-200 border border-slate-700'
                }`}
              >
                {ball}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
