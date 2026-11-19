import React from 'react';
import { Award, Trophy } from 'lucide-react';
import { NormalizedBroadcast } from '../../types/index.ts';

interface BroadcastResultBarProps {
  broadcast: NormalizedBroadcast;
}

export function BroadcastResultBar({ broadcast }: BroadcastResultBarProps) {
  if (!broadcast.resultDeclared || !broadcast.resultBannerText) {
    return null;
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-orange-300 text-slate-950 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-2.5 min-w-0">
        <Trophy className="w-5 h-5 shrink-0 text-slate-950" />
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-80">
            Official Match Result
          </p>
          <p className="font-display text-sm sm:text-base font-extrabold truncate">
            {broadcast.resultBannerText}
          </p>
        </div>
      </div>

      {broadcast.mvpName && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 text-amber-300 text-xs font-bold shrink-0">
          <Award className="w-3.5 h-3.5" />
          <span>MVP: {broadcast.mvpName}</span>
        </div>
      )}
    </div>
  );
}
