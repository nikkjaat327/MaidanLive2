import React from 'react';
import { NormalizedBroadcast } from '../../types/index.ts';
import {
  CricketDetails,
  getCricketCreaseSummary,
} from '../../utils/cricketScoring.ts';
import { usePlayerChangeFlash } from '../../hooks/usePlayerChangeFlash.ts';

interface BroadcastSportStripProps {
  broadcast: NormalizedBroadcast;
}

export function BroadcastSportStrip({ broadcast }: BroadcastSportStripProps) {
  const isCricket = broadcast.sport === 'Cricket';
  const recentBalls =
    isCricket && Array.isArray(broadcast.score?.sportSpecificDetails?.recentBalls)
      ? (broadcast.score!.sportSpecificDetails.recentBalls as string[])
      : [];

  const crease = isCricket
    ? getCricketCreaseSummary(
        (broadcast.score?.sportSpecificDetails || {}) as Partial<CricketDetails>,
        broadcast.teamA.name,
        broadcast.teamB.name
      )
    : null;

  const flash = usePlayerChangeFlash(
    crease?.batsman1?.name,
    crease?.batsman2?.name,
    crease?.bowler?.name
  );

  const hasCricketCrease = Boolean(
    crease && (crease.batsman1 || crease.batsman2 || crease.bowler)
  );

  const displayStripItems = hasCricketCrease
    ? broadcast.subStripItems.filter(
        (item) => item.label !== 'Batters' && item.label !== 'Bowler'
      )
    : broadcast.subStripItems;

  if (displayStripItems.length === 0 && !hasCricketCrease && recentBalls.length === 0) {
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-300 space-y-2.5">
      {displayStripItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {displayStripItems.map((item, idx) => (
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

      {hasCricketCrease && crease && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
          {/* Current Batters */}
          <div className="rounded-lg bg-slate-950/70 border border-slate-800/90 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              <span>Batting</span>
              <span className="font-mono">R (B) · 4s/6s · SR</span>
            </div>
            {crease.batsman1 || crease.batsman2 ? (
              <div className="space-y-1">
                {crease.batsman1 && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      key={`s-${flash.strikerAnimKey}`}
                      className={`truncate font-semibold text-orange-300 ${
                        flash.strikerFlash ? 'ml-player-change' : ''
                      }`}
                    >
                      {crease.batsman1.name}
                      {crease.batsman1.onStrike ? '*' : ''}
                    </span>
                    <span className="font-mono tabular-nums text-white shrink-0">
                      <strong>{crease.batsman1.runs}</strong>{' '}
                      <span className="text-slate-400">
                        ({crease.batsman1.balls}) · {crease.batsman1.fours}/{crease.batsman1.sixes} ·{' '}
                        {crease.batsman1.strikeRate}
                      </span>
                    </span>
                  </div>
                )}
                {crease.batsman2 && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      key={`ns-${flash.nonStrikerAnimKey}`}
                      className={`truncate font-semibold text-slate-100 ${
                        flash.nonStrikerFlash ? 'ml-player-change' : ''
                      }`}
                    >
                      {crease.batsman2.name}
                      {crease.batsman2.onStrike ? '*' : ''}
                    </span>
                    <span className="font-mono tabular-nums text-white shrink-0">
                      <strong>{crease.batsman2.runs}</strong>{' '}
                      <span className="text-slate-400">
                        ({crease.batsman2.balls}) · {crease.batsman2.fours}/{crease.batsman2.sixes} ·{' '}
                        {crease.batsman2.strikeRate}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">Batters not selected yet</p>
            )}
          </div>

          {/* Current Bowler */}
          <div className="rounded-lg bg-slate-950/70 border border-slate-800/90 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              <span>Bowling</span>
              <span className="font-mono">O-M-R-W · Econ</span>
            </div>
            {crease.bowler ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span
                  key={`bw-${flash.bowlerAnimKey}`}
                  className={`truncate font-semibold text-sky-300 ${
                    flash.bowlerFlash ? 'ml-player-change' : ''
                  }`}
                >
                  {crease.bowler.name}
                </span>
                <span className="font-mono tabular-nums text-white shrink-0">
                  <strong>
                    {crease.bowler.overs}-{crease.bowler.maidens}-{crease.bowler.runsConceded}-
                    {crease.bowler.wickets}
                  </strong>{' '}
                  <span className="text-slate-400">· {crease.bowler.economy}</span>
                </span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">Bowler not selected yet</p>
            )}
          </div>
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

