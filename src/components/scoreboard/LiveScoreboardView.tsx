import { useEffect, useState } from 'react';
import { Clock, Trophy } from 'lucide-react';
import { LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { TeamAvatar } from '../common/TeamAvatar.tsx';
import {
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  getCricketCreaseSummary,
  getTotalExtras,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  KabaddiDetails,
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import { KabaddiCourtDots } from './kabaddi/KabaddiCourtDots.tsx';
import { KabaddiAnimations } from './kabaddi/KabaddiAnimations.tsx';
import { FootballDetails, createInitialFootballDetails } from '../../utils/footballScoring.ts';
import { VolleyballDetails, normalizeVolleyballDetails } from '../../utils/volleyballScoring.ts';
import { usePlayerChangeFlash } from '../../hooks/usePlayerChangeFlash.ts';

interface LiveScoreboardViewProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  socketConnected?: boolean;
}

export function LiveScoreboardView({
  stream,
  score,
  socketConnected,
}: LiveScoreboardViewProps) {
  const sport = score?.sportType || stream.gameName || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const details = (score?.sportSpecificDetails || {}) as Record<string, any>;

  const updatedTimeStr = score?.lastUpdatedAt
    ? new Date(score.lastUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  return (
    <section
      aria-label="Live Scoreboard"
      className="bg-slate-950 text-white rounded-xl border border-slate-800 overflow-hidden"
    >
      {/* Top status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <span className="font-semibold text-white">{sport}</span>
          {score?.matchStatus && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-medium">{score.matchStatus}</span>
            </>
          )}
          {typeof socketConnected === 'boolean' && (
            <>
              <span aria-hidden="true">·</span>
              <span className={socketConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {socketConnected ? 'Live Sync Active' : 'Reconnecting...'}
              </span>
            </>
          )}
        </div>
        {updatedTimeStr && (
          <div className="flex items-center gap-1.5 text-slate-400 font-mono tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            <span>Updated {updatedTimeStr}</span>
          </div>
        )}
      </div>

      {/* Official Match Result Strip when declared */}
      {score?.resultStatus && score.resultStatus !== 'NOT_DECLARED' && (
        <div className="px-4 sm:px-5 py-2.5 bg-amber-400 text-slate-950 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 shrink-0" />
            <span className="uppercase tracking-wide">
              {score.resultStatus === 'DECLARED'
                ? 'Official Winner:'
                : score.resultStatus === 'DRAW'
                  ? 'Match Drawn:'
                  : score.resultStatus === 'TIE'
                    ? 'Match Tied:'
                    : 'No Result:'}
            </span>
            <span>{score.resultDescription || score.winnerTeamName}</span>
          </div>
          {score.declaredAt && (
            <span className="text-[11px] font-semibold opacity-80">
              Declared {new Date(score.declaredAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* Sport-specific scoreboard body */}
      <div className="p-4 sm:p-5">
        {sport === 'Cricket' ? (
          <CricketBoard
            teamA={teamA}
            teamB={teamB}
            logoA={stream.teamALogo}
            logoB={stream.teamBLogo}
            details={normalizeCricketDetails(details as Partial<CricketDetails>)}
          />
        ) : sport === 'Kabaddi' ? (
          <KabaddiBoard
            streamId={stream.id}
            teamA={teamA}
            teamB={teamB}
            logoA={stream.teamALogo}
            logoB={stream.teamBLogo}
            scoreA={score?.teamAScore ?? 0}
            scoreB={score?.teamBScore ?? 0}
            details={normalizeKabaddiDetails(details as Partial<KabaddiDetails>)}
          />
        ) : sport === 'Football' ? (
          <FootballBoard
            teamA={teamA}
            teamB={teamB}
            logoA={stream.teamALogo}
            logoB={stream.teamBLogo}
            scoreA={score?.teamAScore ?? 0}
            scoreB={score?.teamBScore ?? 0}
            details={{ ...createInitialFootballDetails(), ...(details as Partial<FootballDetails>) }}
          />
        ) : sport === 'Volleyball' ? (
          <VolleyballBoard
            teamA={teamA}
            teamB={teamB}
            logoA={stream.teamALogo}
            logoB={stream.teamBLogo}
            scoreA={score?.teamAScore ?? 0}
            scoreB={score?.teamBScore ?? 0}
            details={normalizeVolleyballDetails(details as Partial<VolleyballDetails>)}
          />
        ) : (
          <GenericBoard
            teamA={teamA}
            teamB={teamB}
            logoA={stream.teamALogo}
            logoB={stream.teamBLogo}
            scoreA={score?.teamAScore ?? 0}
            scoreB={score?.teamBScore ?? 0}
            periodLabel={typeof details.periodLabel === 'string' ? details.periodLabel : ''}
            notes={typeof details.notes === 'string' ? details.notes : ''}
          />
        )}
      </div>
    </section>
  );
}

function CricketBoard({
  teamA,
  teamB,
  logoA,
  logoB,
  details,
}: {
  teamA: string;
  teamB: string;
  logoA: string;
  logoB: string;
  details: CricketDetails;
}) {
  const chase = computeCricketChaseState(details, teamA, teamB);
  const crease = getCricketCreaseSummary(details, teamA, teamB);
  const flash = usePlayerChangeFlash(
    crease.batsman1?.name,
    crease.batsman2?.name,
    crease.bowler?.name
  );
  const isBattingA = details.battingTeam === 'A';
  const activeExtras = isBattingA ? details.extrasA : details.extrasB;
  const activePlay = !chase.isInningsBreak && !chase.isMatchCompleted;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          className={`p-3.5 rounded-lg border ${
            isBattingA && activePlay
              ? 'bg-slate-900 border-emerald-500/60'
              : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamAvatar name={teamA} logoUrl={logoA} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{teamA}</p>
                {isBattingA && activePlay && (
                  <p className="text-[11px] text-emerald-400 font-medium">
                    Batting · Inn {details.innings}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right font-mono tabular-nums shrink-0">
              <p className="text-2xl font-bold text-white leading-none">
                {details.teamARuns}/{details.teamAWickets}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatCricketOvers(details.teamABalls)} ov
              </p>
            </div>
          </div>
        </div>

        <div
          className={`p-3.5 rounded-lg border ${
            !isBattingA && activePlay
              ? 'bg-slate-900 border-emerald-500/60'
              : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamAvatar name={teamB} logoUrl={logoB} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{teamB}</p>
                {!isBattingA && activePlay && (
                  <p className="text-[11px] text-emerald-400 font-medium">
                    Batting · Inn {details.innings}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right font-mono tabular-nums shrink-0">
              <p className="text-2xl font-bold text-white leading-none">
                {details.teamBRuns}/{details.teamBWickets}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {formatCricketOvers(details.teamBBalls)} ov
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Chase / Innings Break Equation Banner */}
      <div
        className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
          chase.isInningsBreak
            ? 'bg-orange-500/15 border-orange-400/30 text-orange-200'
            : chase.isMatchCompleted
              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
              : 'bg-slate-900 border-slate-800 text-slate-200'
        }`}
      >
        <span>{chase.chaseSummaryText}</span>
        {chase.target > 0 && !chase.isMatchCompleted && (
          <span className="font-mono tabular-nums text-amber-300">
            Target: {chase.target}
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-3 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-300">
        <span>
          CRR: <strong className="text-white">{chase.crr}</strong>
        </span>
        {chase.rrr !== null && (
          <span>
            RRR: <strong className="text-amber-400">{chase.rrr}</strong>
          </span>
        )}
        <span>
          Overs Limit: <strong className="text-white">{chase.configuredOvers}</strong>
        </span>
        <span>
          Extras: <strong className="text-white">{getTotalExtras(activeExtras)}</strong>{' '}
          <span className="text-slate-400">
            (Wd {activeExtras?.wides || 0}, Nb {activeExtras?.noBalls || 0}, B {activeExtras?.byes || 0}, Lb {activeExtras?.legByes || 0})
          </span>
        </span>
      </div>

      {(crease.batsman1 || crease.batsman2 || crease.bowler) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800/80">
          {(crease.batsman1 || crease.batsman2) && (
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span>Batters:</span>
              {crease.batsman1 && (
                <strong className="text-white font-mono tabular-nums">
                  <span
                    key={`s-${flash.strikerAnimKey}`}
                    className={`font-sans text-orange-300 inline-block ${
                      flash.strikerFlash ? 'ml-player-change' : ''
                    }`}
                  >
                    {crease.batsman1.name}*
                  </span>{' '}
                  {crease.batsman1.runs} ({crease.batsman1.balls})
                </strong>
              )}
              {crease.batsman1 && crease.batsman2 && <span className="text-slate-500">&amp;</span>}
              {crease.batsman2 && (
                <strong className="text-white font-mono tabular-nums">
                  <span
                    key={`ns-${flash.nonStrikerAnimKey}`}
                    className={`font-sans inline-block ${
                      flash.nonStrikerFlash ? 'ml-player-change' : ''
                    }`}
                  >
                    {crease.batsman2.name}
                  </span>{' '}
                  {crease.batsman2.runs} ({crease.batsman2.balls})
                </strong>
              )}
            </span>
          )}
          {crease.bowler && (
            <span>
              Bowler:{' '}
              <strong className="text-white font-mono tabular-nums">
                <span
                  key={`bw-${flash.bowlerAnimKey}`}
                  className={`font-sans text-sky-300 inline-block ${
                    flash.bowlerFlash ? 'ml-player-change' : ''
                  }`}
                >
                  {crease.bowler.name}
                </span>{' '}
                {crease.bowler.overs}-{crease.bowler.maidens}-{crease.bowler.runsConceded}-
                {crease.bowler.wickets}
              </strong>
            </span>
          )}
        </div>
      )}

      {details.isSuperOver && (
        <div className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-xs font-mono tabular-nums text-amber-200">
          Super Over: {teamA} {details.superOverTeamARuns}/{details.superOverTeamAWickets} · {teamB}{' '}
          {details.superOverTeamBRuns}/{details.superOverTeamBWickets}
        </div>
      )}

      {Array.isArray(details.recentBalls) && details.recentBalls.length > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 overflow-x-auto">
          <span className="text-xs text-slate-400 shrink-0">Recent:</span>
          <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            {details.recentBalls.map((ball, i) => (
              <span
                key={i}
                className={`min-w-[28px] h-7 px-1.5 rounded flex items-center justify-center font-semibold ${
                  ball === 'W'
                    ? 'bg-red-600 text-white'
                    : ball === '4' || ball === '6'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-200'
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

function KabaddiBoard({
  streamId,
  teamA,
  teamB,
  logoA,
  logoB,
  scoreA,
  scoreB,
  details,
}: {
  streamId: string;
  teamA: string;
  teamB: string;
  logoA: string;
  logoB: string;
  scoreA: number;
  scoreB: number;
  details: KabaddiDetails;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isClockTicking = Boolean(
    !details.matchCompleted &&
      (details.clock.status === 'RUNNING' ||
        details.clock.status === 'EXTRA_TIME' ||
        details.clock.status === 'BREAK' ||
        details.clock.raidRunning ||
        details.clock.timeoutActive ||
        details.doOrDie.active ||
        (details.lastAllOut?.triggeredAtIso &&
          Date.now() - Date.parse(details.lastAllOut.triggeredAtIso) <=
            (details.rules.allOutBannerDurationSec || 5) * 1000))
  );

  useEffect(() => {
    if (!isClockTicking) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isClockTicking]);

  const eff = computeEffectiveKabaddiClock(details, nowMs);
  const vis = details.viewerDisplaySettings;

  return (
    <div className="space-y-4">
      <KabaddiAnimations
        streamId={streamId}
        teamAName={teamA}
        teamBName={teamB}
        doOrDie={details.doOrDie}
        doOrDieVisible={eff.doOrDieVisible}
        doOrDieRemainingSec={eff.doOrDieRemainingSec}
        lastAllOut={details.lastAllOut}
        allOutDurationSec={details.rules.allOutBannerDurationSec}
        timeoutActive={details.clock.timeoutActive}
        timeoutTeam={details.clock.timeoutTeam}
        timeoutRemainingSec={eff.timeoutRemainingSec}
        displaySettings={vis}
        compact
      />

      <div className="grid grid-cols-3 items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {vis.showTeamLogos && <TeamAvatar name={teamA} logoUrl={logoA} />}
          <div className="min-w-0">
            {vis.showTeamNames && <p className="text-sm sm:text-base font-semibold truncate">{teamA}</p>}
            {details.activeRaidingTeam === 'A' && !details.matchCompleted && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                Raiding
              </p>
            )}
          </div>
        </div>
        <div className="text-center font-mono tabular-nums">
          {vis.showScores && (
            <div className="text-3xl sm:text-4xl font-bold tracking-tight">
              {scoreA} <span className="text-slate-600">-</span> {scoreB}
            </div>
          )}
          <div className="text-xs text-emerald-400 mt-1 flex items-center justify-center gap-1.5 flex-wrap">
            {vis.showHalf && <span>{details.clock.halfLabel || details.half}</span>}
            {vis.showMatchTimer && <span>· {eff.formattedClock}</span>}
            {vis.showRaidTimer && details.clock.raidTimerEnabled && !details.matchCompleted && (
              <span className="text-orange-300 font-bold">
                · Raid {String(eff.raidRemainingSec).padStart(2, '0')}s
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 min-w-0">
          <div className="min-w-0 text-right">
            {vis.showTeamNames && <p className="text-sm sm:text-base font-semibold truncate">{teamB}</p>}
            {details.activeRaidingTeam === 'B' && !details.matchCompleted && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">
                Raiding
              </p>
            )}
          </div>
          {vis.showTeamLogos && <TeamAvatar name={teamB} logoUrl={logoB} />}
        </div>
      </div>

      {vis.showPlayersOnCourtDots && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
          <KabaddiCourtDots
            players={details.courtPlayersA}
            maxPlayers={details.rules.playersPerSide}
            teamName={teamA}
            side="A"
            compact
            showNames={vis.showPlayerNames}
            showNumbers={vis.showJerseyNumbers}
          />
          <div className="sm:flex sm:justify-end">
            <KabaddiCourtDots
              players={details.courtPlayersB}
              maxPlayers={details.rules.playersPerSide}
              teamName={teamB}
              side="B"
              compact
              showNames={vis.showPlayerNames}
              showNumbers={vis.showJerseyNumbers}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-300">
        <div className="space-y-1">
          <p className="text-slate-400 font-sans font-medium">{teamA} Breakdown</p>
          <p>
            Raid: <strong className="text-white">{details.teamA.raidPoints}</strong> · Tackle:{' '}
            <strong className="text-white">{details.teamA.tacklePoints}</strong>
          </p>
          <p>
            Bonus: <strong className="text-white">{details.teamA.bonusPoints}</strong> · All-Out:{' '}
            <strong className="text-white">{details.teamA.allOutPoints}</strong> · Super Tackle:{' '}
            <strong className="text-white">{details.teamA.superTackles}</strong>
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-slate-400 font-sans font-medium">{teamB} Breakdown</p>
          <p>
            Raid: <strong className="text-white">{details.teamB.raidPoints}</strong> · Tackle:{' '}
            <strong className="text-white">{details.teamB.tacklePoints}</strong>
          </p>
          <p>
            Bonus: <strong className="text-white">{details.teamB.bonusPoints}</strong> · All-Out:{' '}
            <strong className="text-white">{details.teamB.allOutPoints}</strong> · Super Tackle:{' '}
            <strong className="text-white">{details.teamB.superTackles}</strong>
          </p>
        </div>
      </div>
      {(details.superRaidNote || details.isTieBreaker) && (
        <div className="px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
          {details.superRaidNote && <span className="font-semibold">{details.superRaidNote}</span>}
          {details.isTieBreaker && (
            <span className="font-mono tabular-nums font-semibold">
              Tie-Breaker: {teamA} {details.tieBreakerScoreA} - {details.tieBreakerScoreB} {teamB}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FootballBoard({
  teamA,
  teamB,
  logoA,
  logoB,
  scoreA,
  scoreB,
  details,
}: {
  teamA: string;
  teamB: string;
  logoA: string;
  logoB: string;
  scoreA: number;
  scoreB: number;
  details: FootballDetails;
}) {
  const timer = `${String(details.timerMinutes).padStart(2, '0')}:${String(
    details.timerSeconds
  ).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamAvatar name={teamA} logoUrl={logoA} />
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-semibold truncate">{teamA}</p>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              YC {details.teamAYellowCards} · RC {details.teamARedCards}
            </p>
          </div>
        </div>
        <div className="text-center font-mono tabular-nums">
          <div className="text-3xl sm:text-4xl font-bold tracking-tight">
            {scoreA} <span className="text-slate-600">-</span> {scoreB}
          </div>
          <div className="text-xs text-emerald-400 mt-1">
            {details.half} · {timer}
            {details.extraTimeMinutes > 0 ? ` (+${details.extraTimeMinutes}')` : ''}
          </div>
          {(details.teamAPenalties > 0 || details.teamBPenalties > 0) && (
            <div className="text-xs text-amber-400 mt-0.5">
              Pens: {details.teamAPenalties} - {details.teamBPenalties}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 min-w-0">
          <div className="min-w-0 text-right">
            <p className="text-sm sm:text-base font-semibold truncate">{teamB}</p>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              YC {details.teamBYellowCards} · RC {details.teamBRedCards}
            </p>
          </div>
          <TeamAvatar name={teamB} logoUrl={logoB} />
        </div>
      </div>
    </div>
  );
}

function VolleyballBoard({
  teamA,
  teamB,
  logoA,
  logoB,
  scoreA,
  scoreB,
  details,
}: {
  teamA: string;
  teamB: string;
  logoA: string;
  logoB: string;
  scoreA: number;
  scoreB: number;
  details: VolleyballDetails;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamAvatar name={teamA} logoUrl={logoA} />
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-semibold truncate">
              {teamA}
              {details.servingTeam === 'A' && !details.matchCompleted && (
                <span className="text-[11px] text-amber-400 ml-1.5 font-medium">· Serving</span>
              )}
              {details.advantageTeam === 'A' && !details.matchCompleted && (
                <span className="text-[11px] text-emerald-300 ml-1.5 font-bold">· ADV</span>
              )}
            </p>
            <p className="text-xs text-emerald-400 font-mono tabular-nums">
              Sets Won: {details.teamASetsWon}/{details.winningThreshold}
            </p>
          </div>
        </div>
        <div className="text-center font-mono tabular-nums">
          <div className="text-3xl sm:text-4xl font-bold tracking-tight">
            {scoreA} <span className="text-slate-600">-</span> {scoreB}
          </div>
          <div className="text-xs text-slate-300 mt-1">
            Set {details.currentSet}/{details.bestOfSets}
            {details.bestOfSets > 1 && details.currentSet === details.bestOfSets ? ' · Decider' : ''}
            {details.isDeuce && !details.advantageTeam && !details.matchCompleted ? ' · DEUCE' : ''}
            {details.advantageTeam && !details.matchCompleted
              ? ` · ADV ${details.advantageTeam === 'A' ? teamA : teamB}`
              : ''}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 min-w-0">
          <div className="min-w-0 text-right">
            <p className="text-sm sm:text-base font-semibold truncate">
              {details.advantageTeam === 'B' && !details.matchCompleted && (
                <span className="text-[11px] text-emerald-300 mr-1.5 font-bold">ADV ·</span>
              )}
              {details.servingTeam === 'B' && !details.matchCompleted && (
                <span className="text-[11px] text-amber-400 mr-1.5 font-medium">Serving ·</span>
              )}
              {teamB}
            </p>
            <p className="text-xs text-emerald-400 font-mono tabular-nums">
              Sets Won: {details.teamBSetsWon}/{details.winningThreshold}
            </p>
          </div>
          <TeamAvatar name={teamB} logoUrl={logoB} />
        </div>
      </div>

      {Array.isArray(details.setScores) && details.setScores.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800 text-xs font-mono tabular-nums text-slate-300">
          <span className="text-slate-400 font-sans">Set Scores:</span>
          {details.setScores.map((s) => (
            <span
              key={s.set}
              className={`px-2 py-1 rounded ${
                s.set === details.currentSet ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              S{s.set}: {s.teamA}-{s.teamB}
              {s.winner ? ` (${s.winner === 'A' ? teamA : teamB})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GenericBoard({
  teamA,
  teamB,
  logoA,
  logoB,
  scoreA,
  scoreB,
  periodLabel,
  notes,
}: {
  teamA: string;
  teamB: string;
  logoA: string;
  logoB: string;
  scoreA: number;
  scoreB: number;
  periodLabel: string;
  notes: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <TeamAvatar name={teamA} logoUrl={logoA} />
          <span className="text-sm sm:text-base font-semibold truncate">{teamA}</span>
        </div>
        <div className="text-center font-mono tabular-nums">
          <div className="text-3xl sm:text-4xl font-bold tracking-tight">
            {scoreA} <span className="text-slate-600">-</span> {scoreB}
          </div>
          {periodLabel && <div className="text-xs text-emerald-400 mt-1">{periodLabel}</div>}
        </div>
        <div className="flex items-center justify-end gap-2.5 min-w-0">
          <span className="text-sm sm:text-base font-semibold truncate text-right">{teamB}</span>
          <TeamAvatar name={teamB} logoUrl={logoB} />
        </div>
      </div>
      {notes && <p className="text-xs text-slate-300 pt-2 border-t border-slate-800">{notes}</p>}
    </div>
  );
}
