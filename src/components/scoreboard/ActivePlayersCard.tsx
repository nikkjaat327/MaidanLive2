import { useEffect, useState } from 'react';
import { LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  CricketDetails,
  getCricketCreaseSummary,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import { usePlayerChangeFlash } from '../../hooks/usePlayerChangeFlash.ts';

export interface ActivePlayersCardProps {
  matchId: string;
  stream?: Pick<LiveStreamData, 'teamAName' | 'teamBName' | 'gameName' | 'status'>;
  score?: LiveScoreData | null;
  className?: string;
}

export function ActivePlayersCard({
  matchId,
  stream,
  score: externalScore,
  className = '',
}: ActivePlayersCardProps) {
  const [fetchedScore, setFetchedScore] = useState<LiveScoreData | null>(
    externalScore ?? null
  );
  const [loading, setLoading] = useState<boolean>(!externalScore && Boolean(matchId));

  useEffect(() => {
    if (externalScore !== undefined) {
      setFetchedScore(externalScore);
      setLoading(false);
    }
  }, [externalScore]);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;

    scoreboardService
      .getScore(matchId)
      .then((liveScore) => {
        if (!cancelled && liveScore) {
          setFetchedScore(liveScore);
        }
      })
      .catch(() => {
        // Keep existing externalScore fallback silently if transient error
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

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
  }, [matchId]);

  const activeScore = externalScore ?? fetchedScore;
  const sport = activeScore?.sportType || stream?.gameName || '';
  const isCricket = sport === 'Cricket';

  const teamAName = stream?.teamAName || 'Team A';
  const teamBName = stream?.teamBName || 'Team B';
  const details = normalizeCricketDetails(
    (activeScore?.sportSpecificDetails || {}) as Partial<CricketDetails>
  );
  const crease = getCricketCreaseSummary(
    (activeScore?.sportSpecificDetails || {}) as Partial<CricketDetails>,
    teamAName,
    teamBName
  );

  const hasAnyActivePlayer = Boolean(
    crease.batsman1 || crease.batsman2 || crease.bowler
  );

  const flash = usePlayerChangeFlash(
    isCricket ? crease.batsman1?.name : undefined,
    isCricket ? crease.batsman2?.name : undefined,
    isCricket ? crease.bowler?.name : undefined
  );

  if (!isCricket) return null;

  const battingTeamName = details.battingTeam === 'B' ? teamBName : teamAName;
  const bowlingTeamName = details.battingTeam === 'B' ? teamAName : teamBName;

  if (loading && !hasAnyActivePlayer) {
    return (
      <section
        aria-label="Active Players"
        className={`bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white animate-pulse ${className}`}
      >
        <div className="h-4 w-32 bg-slate-800 rounded mb-3" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="h-16 bg-slate-900 rounded-lg" />
          <div className="h-16 bg-slate-900 rounded-lg" />
          <div className="h-16 bg-slate-900 rounded-lg" />
        </div>
      </section>
    );
  }

  if (!hasAnyActivePlayer) {
    return null;
  }

  const substitutions = Array.isArray(details.substitutions) ? details.substitutions : [];
  const findSubNoteForSlot = (
    role: 'STRIKER' | 'NON_STRIKER' | 'BOWLER',
    playerName?: string
  ): string | null => {
    if (!playerName || substitutions.length === 0) return null;
    const clean = playerName.trim().toLowerCase();
    const match = substitutions.find(
      (s) =>
        s.playerIn.trim().toLowerCase() === clean &&
        (s.role === role || s.role === 'SQUAD')
    );
    if (!match) return null;
    return match.playerOut ? `Subbed in for ${match.playerOut}` : 'Substitute';
  };

  const strikerSubNote = findSubNoteForSlot('STRIKER', crease.batsman1?.name);
  const nonStrikerSubNote = findSubNoteForSlot('NON_STRIKER', crease.batsman2?.name);
  const bowlerSubNote = findSubNoteForSlot('BOWLER', crease.bowler?.name);
  const latestSub = substitutions[0] || null;
  const latestSubShownOnCard = Boolean(
    latestSub &&
      ((crease.batsman1 && latestSub.playerIn.trim().toLowerCase() === crease.batsman1.name.trim().toLowerCase()) ||
        (crease.batsman2 && latestSub.playerIn.trim().toLowerCase() === crease.batsman2.name.trim().toLowerCase()) ||
        (crease.bowler && latestSub.playerIn.trim().toLowerCase() === crease.bowler.name.trim().toLowerCase()))
  );

  return (
    <section
      aria-label="Active Players"
      className={`bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white shadow-sm space-y-2.5 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="font-display text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            Active Players
          </h2>
          <span className="text-[11px] text-slate-400 truncate">
            {battingTeamName} batting · {bowlingTeamName} bowling
          </span>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-orange-300 font-semibold">
          Innings {crease.innings}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Striker */}
        <div
          key={`striker-${flash.strikerAnimKey}`}
          className={`rounded-lg border px-3 py-2.5 transition-colors ${
            flash.strikerFlash
              ? 'bg-orange-500/20 border-orange-400 ml-player-change'
              : 'bg-orange-500/10 border-orange-500/35'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="text-orange-300">Striker</span>
            <span className="font-mono text-slate-400">R (B)</span>
          </div>
          {crease.batsman1 ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span
                className={`font-display text-sm sm:text-base font-bold text-white truncate ${
                  flash.strikerFlash ? 'ml-player-change' : ''
                }`}
              >
                {crease.batsman1.name}
                <span className="text-orange-400 ml-0.5">*</span>
              </span>
              <span className="font-mono tabular-nums text-sm font-extrabold text-orange-200 shrink-0">
                {crease.batsman1.runs}{' '}
                <span className="text-xs font-normal text-slate-300">
                  ({crease.batsman1.balls})
                </span>
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Not selected</p>
          )}
          {crease.batsman1 && (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
              4s: {crease.batsman1.fours} · 6s: {crease.batsman1.sixes} · SR{' '}
              {crease.batsman1.strikeRate}
            </p>
          )}
          {strikerSubNote && (
            <p className="mt-1 text-[10px] font-semibold text-violet-300 truncate">
              {strikerSubNote}
            </p>
          )}
        </div>

        {/* Non-Striker */}
        <div
          key={`nonstriker-${flash.nonStrikerAnimKey}`}
          className={`rounded-lg border px-3 py-2.5 transition-colors ${
            flash.nonStrikerFlash
              ? 'bg-slate-800/90 border-slate-500 ml-player-change'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="text-slate-300">Non-Striker</span>
            <span className="font-mono text-slate-400">R (B)</span>
          </div>
          {crease.batsman2 ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span
                className={`font-display text-sm sm:text-base font-bold text-slate-100 truncate ${
                  flash.nonStrikerFlash ? 'ml-player-change' : ''
                }`}
              >
                {crease.batsman2.name}
              </span>
              <span className="font-mono tabular-nums text-sm font-extrabold text-white shrink-0">
                {crease.batsman2.runs}{' '}
                <span className="text-xs font-normal text-slate-400">
                  ({crease.batsman2.balls})
                </span>
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Not selected</p>
          )}
          {crease.batsman2 && (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
              4s: {crease.batsman2.fours} · 6s: {crease.batsman2.sixes} · SR{' '}
              {crease.batsman2.strikeRate}
            </p>
          )}
          {nonStrikerSubNote && (
            <p className="mt-1 text-[10px] font-semibold text-violet-300 truncate">
              {nonStrikerSubNote}
            </p>
          )}
        </div>

        {/* Current Bowler */}
        <div
          key={`bowler-${flash.bowlerAnimKey}`}
          className={`rounded-lg border px-3 py-2.5 transition-colors ${
            flash.bowlerFlash
              ? 'bg-sky-500/20 border-sky-400 ml-player-change'
              : 'bg-sky-500/10 border-sky-500/30'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="text-sky-300">Bowler</span>
            <span className="font-mono text-slate-400">O-M-R-W</span>
          </div>
          {crease.bowler ? (
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span
                className={`font-display text-sm sm:text-base font-bold text-white truncate ${
                  flash.bowlerFlash ? 'ml-player-change' : ''
                }`}
              >
                {crease.bowler.name}
              </span>
              <span className="font-mono tabular-nums text-sm font-extrabold text-sky-200 shrink-0">
                {crease.bowler.overs}-{crease.bowler.maidens}-{crease.bowler.runsConceded}-
                {crease.bowler.wickets}
              </span>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Not selected</p>
          )}
          {crease.bowler && (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
              Econ {crease.bowler.economy}
            </p>
          )}
          {bowlerSubNote && (
            <p className="mt-1 text-[10px] font-semibold text-violet-300 truncate">
              {bowlerSubNote}
            </p>
          )}
        </div>
      </div>

      {latestSub && !latestSubShownOnCard && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-[11px] text-violet-200">
          <span>
            Latest Substitution ({latestSub.team === 'B' ? teamBName : teamAName}):{' '}
            <strong>{latestSub.playerOut || 'Player'}</strong> →{' '}
            <strong>{latestSub.playerIn || 'Substitute'}</strong>
            {latestSub.reason ? ` (${latestSub.reason})` : ''}
          </span>
        </div>
      )}
    </section>
  );
}
