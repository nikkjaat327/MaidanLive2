import { useEffect, useState } from 'react';
import { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import {
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
} from '../../../utils/kabaddiScoring.ts';
import { deriveShortTeamName } from '../../../utils/matchResultValidation.ts';
import { KabaddiAnimations } from '../kabaddi/KabaddiAnimations.tsx';
import { BroadcastLogo } from './BroadcastLogo.tsx';

interface KabaddiBroadcastBarProps {
  stream: LiveStreamData;
  score: LiveScoreData;
  compact?: boolean;
  isPortrait?: boolean;
}

export function KabaddiBroadcastBar({
  stream,
  score,
  compact = false,
  isPortrait,
}: KabaddiBroadcastBarProps) {
  const d = normalizeKabaddiDetails(score.sportSpecificDetails);
  const vis = d.viewerDisplaySettings;

  const isClockActive = Boolean(
    !d.matchCompleted &&
      (d.clock.status === 'RUNNING' ||
        d.clock.status === 'EXTRA_TIME' ||
        d.clock.status === 'BREAK' ||
        d.clock.timeoutActive ||
        d.clock.raidRunning ||
        d.doOrDie.active ||
        (d.lastAllOut && d.lastAllOut.triggeredAtIso))
  );

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isClockActive) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isClockActive]);
  const eff = computeEffectiveKabaddiClock(d, nowMs);

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const clock = eff.formattedClock;

  return (
    <div className="w-full max-w-[740px] flex flex-col gap-2">
      <KabaddiAnimations
        streamId={stream.id}
        teamAName={nameA}
        teamBName={nameB}
        doOrDie={d.doOrDie}
        doOrDieVisible={eff.doOrDieVisible}
        doOrDieRemainingSec={eff.doOrDieRemainingSec}
        lastAllOut={d.lastAllOut}
        allOutDurationSec={d.rules.allOutBannerDurationSec}
        timeoutActive={d.clock.timeoutActive}
        timeoutTeam={d.clock.timeoutTeam}
        timeoutRemainingSec={eff.timeoutRemainingSec}
        displaySettings={vis}
        compact
        showTimer={false}
      />
      <div className="w-full bg-slate-950/90 backdrop-blur-md text-white rounded-md shadow-xl overflow-hidden border border-white/10">
        {/* Main Broadcast Score Strip */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-2.5 sm:px-3.5 py-1.5">
          {/* Team A */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {vis.showTeamLogos && <BroadcastLogo logoUrl={stream.teamALogo} alt={shortA} />}
              {vis.showTeamNames && (
                <span className="font-display font-bold text-xs sm:text-sm uppercase truncate">
                  {isPortrait === true ? (
                    shortA
                  ) : isPortrait === false ? (
                    nameA
                  ) : (
                    <>
                      <span className="hidden portrait:inline">{shortA}</span>
                      <span className="portrait:hidden">{nameA}</span>
                    </>
                  )}
                </span>
              )}
            </div>
            {vis.showScores && (
              <span className="font-mono tabular-nums font-bold text-lg sm:text-xl text-emerald-300 leading-none">
                {score.teamAScore}
              </span>
            )}
          </div>

          {/* Center Clock & Half */}
          <div className="flex flex-col items-center justify-center px-2.5 py-0.5 rounded bg-white/10 text-center shrink-0">
            {vis.showMatchTimer && (
              <span className="font-mono tabular-nums text-xs sm:text-sm font-bold leading-tight text-white">
                {clock}
                {vis.showRaidTimer && d.clock.raidTimerEnabled && !d.matchCompleted
                  ? ` · ${eff.raidRemainingSec}s`
                  : ''}
              </span>
            )}
            {vis.showHalf && (
              <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-amber-300 leading-tight">
                {d.clock.halfLabel || d.half}
              </span>
            )}
          </div>

          {/* Team B */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            {vis.showScores && (
              <span className="font-mono tabular-nums font-bold text-lg sm:text-xl text-sky-300 leading-none">
                {score.teamBScore}
              </span>
            )}
            <div className="flex items-center gap-1.5 min-w-0 justify-end">
              {vis.showTeamNames && (
                <span className="font-display font-bold text-xs sm:text-sm uppercase truncate text-right">
                  {isPortrait === true ? (
                    shortB
                  ) : isPortrait === false ? (
                    nameB
                  ) : (
                    <>
                      <span className="hidden portrait:inline">{shortB}</span>
                      <span className="portrait:hidden">{nameB}</span>
                    </>
                  )}
                </span>
              )}
              {vis.showTeamLogos && <BroadcastLogo logoUrl={stream.teamBLogo} alt={shortB} />}
            </div>
          </div>
        </div>

        {/* Compact Breakdown Strip */}
        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2.5 sm:px-3.5 py-1 bg-white/[0.06] border-t border-white/10 text-[10px] font-mono tabular-nums text-slate-200">
            <span className="truncate">
              {shortA}: R {d.teamA.raidPoints} · T {d.teamA.tacklePoints} · B {d.teamA.bonusPoints} · AO {d.teamA.allOutPoints} · ST {d.teamA.superTackles}
              {vis.showPlayersOnCourtDots ? ` (${d.playersOnCourtA}/${d.rules.playersPerSide})` : ''}
            </span>
            {vis.showDoOrDieBanner && eff.doOrDieVisible && d.doOrDie.team ? (
              <span className="font-sans font-bold text-amber-300 truncate">
                DO-OR-DIE · {d.doOrDie.team === 'A' ? shortA : shortB}
              </span>
            ) : vis.showTimeoutBanner && d.clock.timeoutActive ? (
              <span className="font-sans font-bold text-sky-300 truncate">
                TIMEOUT · {d.clock.timeoutTeam === 'A' ? shortA : shortB} ({eff.timeoutRemainingSec}s)
              </span>
            ) : (d.superRaidNote || d.isTieBreaker) ? (
              <span className="font-sans font-semibold text-amber-300 truncate">
                {d.isTieBreaker
                  ? `Tie-Breaker ${d.tieBreakerScoreA}-${d.tieBreakerScoreB}`
                  : d.superRaidNote}
              </span>
            ) : null}
            <span className="truncate ml-auto">
              {shortB}: R {d.teamB.raidPoints} · T {d.teamB.tacklePoints} · B {d.teamB.bonusPoints} · AO {d.teamB.allOutPoints} · ST {d.teamB.superTackles}
              {vis.showPlayersOnCourtDots ? ` (${d.playersOnCourtB}/${d.rules.playersPerSide})` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
