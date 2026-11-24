import { Clock, Flame, Radio, Shield, Trophy } from 'lucide-react';
import type {
  BroadcastOverlayConfig,
  LiveScoreData,
  LiveStreamData,
} from '../../types/index.ts';
import type { MatchTimeoutInfo } from '../../utils/matchTimeout.ts';
import { DEFAULT_OVERLAY_CONFIG, sanitizeHexColor } from '../../utils/overlayConfig.ts';
import { normalizeBroadcast } from '../../utils/normalizeBroadcast.ts';
import {
  computeCricketChaseState,
  deriveCricketInningsScorecard,
  normalizeCricketDetails,
  type CricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
  type KabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import {
  normalizeVolleyballDetails,
  type VolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import {
  createInitialFootballDetails,
  type FootballDetails,
} from '../../utils/footballScoring.ts';
import { TeamAvatar } from '../common/TeamAvatar.tsx';

interface JioHotstarFullScoreboardProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config?: Partial<BroadcastOverlayConfig> | null;
  timeoutInfo?: MatchTimeoutInfo;
  isPortrait?: boolean;
  variant?: 'canvas' | 'responsive';
  serverClockOffsetMs?: number;
  zIndex?: number;
  visible: boolean;
}

function formatTimeoutCountdown(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}` : `${rem}s`;
}

export function JioHotstarFullScoreboard({
  stream,
  score,
  config,
  timeoutInfo,
  isPortrait = false,
  variant = 'canvas',
  serverClockOffsetMs = 0,
  zIndex = 31,
  visible,
}: JioHotstarFullScoreboardProps) {
  if (!visible) return null;

  const isCanvas = variant === 'canvas';
  const nowMs = Date.now() + serverClockOffsetMs;
  const broadcast = normalizeBroadcast(stream, score, nowMs);
  const sport = broadcast.sport;
  const teamAColor = sanitizeHexColor(config?.teamAColor, DEFAULT_OVERLAY_CONFIG.teamAColor);
  const teamBColor = sanitizeHexColor(config?.teamBColor, DEFAULT_OVERLAY_CONFIG.teamBColor);

  const timeoutCountdown = formatTimeoutCountdown(timeoutInfo?.remainingSec);

  return (
    <div
      data-jiohotstar-full-scoreboard="true"
      style={{
        zIndex,
        background:
          'radial-gradient(ellipse at top center, rgba(37, 99, 235, 0.34) 0%, rgba(15, 23, 42, 0.98) 46%, rgba(4, 7, 18, 0.99) 100%)',
      }}
      className={`absolute inset-0 overflow-hidden select-none text-white flex flex-col ${
        isCanvas ? 'pointer-events-none' : 'pointer-events-auto overflow-y-auto'
      }`}
    >
      {/* Top Broadcast Accent Beams */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 flex"
      >
        <div className="flex-1" style={{ backgroundColor: teamAColor }} />
        <div className="w-24 bg-gradient-to-r from-amber-400 via-pink-500 to-cyan-400" />
        <div className="flex-1" style={{ backgroundColor: teamBColor }} />
      </div>

      {/* Header Strip */}
      <header
        className={`relative z-10 border-b border-white/10 bg-[#070B1E]/85 backdrop-blur-md flex items-center justify-between gap-3 shrink-0 ${
          isCanvas ? 'px-12 py-5' : 'px-3 py-2 sm:px-5 sm:py-3'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            className={`inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-[#EA580C] to-pink-600 text-white shadow shrink-0 ${
              isCanvas ? 'w-11 h-11' : 'w-6 h-6 sm:w-8 sm:h-8'
            }`}
          >
            <Trophy className={isCanvas ? 'w-6 h-6' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} />
          </span>
          <div className="min-w-0">
            <p
              className={`font-display font-extrabold uppercase tracking-wider text-amber-300 truncate ${
                isCanvas ? 'text-xl' : 'text-[10px] sm:text-xs'
              }`}
            >
              {broadcast.tournamentName || 'MATCH CENTER'}
              {broadcast.roundName ? ` · ${broadcast.roundName}` : ''}
            </p>
            <p
              className={`text-slate-300 truncate ${
                isCanvas ? 'text-base' : 'text-[9px] sm:text-[11px]'
              }`}
            >
              {sport}
              {broadcast.venueName ? ` · ${broadcast.venueName}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {timeoutInfo?.isTimeout ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500 text-slate-950 font-display font-black uppercase tracking-wider shadow-lg ${
                isCanvas ? 'px-5 py-1.5 text-lg' : 'px-2.5 py-0.5 text-[10px] sm:text-xs'
              }`}
            >
              <Clock className={isCanvas ? 'w-5 h-5' : 'w-3 h-3'} />
              <span>
                {timeoutInfo.label || 'TEAM TIMEOUT'}
                {timeoutCountdown ? ` · ${timeoutCountdown}` : ''}
              </span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border font-mono font-extrabold uppercase tracking-wider ${
                broadcast.centerMeta.isLive
                  ? 'bg-red-600/20 border-red-400/50 text-red-200'
                  : 'bg-emerald-600/20 border-emerald-400/50 text-emerald-200'
              } ${isCanvas ? 'px-5 py-1.5 text-lg' : 'px-2.5 py-0.5 text-[10px] sm:text-xs'}`}
            >
              <Radio className={isCanvas ? 'w-4 h-4 text-red-400 animate-pulse' : 'w-3 h-3 text-red-400'} />
              <span>{broadcast.centerMeta.statusLabel}</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <div
        className={`relative z-10 flex-1 min-h-0 flex flex-col justify-between gap-2 sm:gap-4 ${
          isCanvas
            ? isPortrait
              ? 'px-10 py-8 gap-6'
              : 'px-12 py-7 gap-5'
            : 'px-3 py-2.5 sm:px-6 sm:py-4'
        }`}
      >
        {/* VS HERO SCOREBOARD CARD */}
        <section
          className={`rounded-2xl border border-white/15 bg-gradient-to-r from-[#0F172A]/95 via-[#131C3A]/95 to-[#0F172A]/95 shadow-2xl overflow-hidden shrink-0 ${
            isCanvas ? 'p-6 sm:p-8' : 'p-2.5 sm:p-5'
          }`}
        >
          <div
            className={`grid items-center gap-2 sm:gap-4 ${
              isCanvas && isPortrait ? 'grid-cols-1 gap-5' : 'grid-cols-12'
            }`}
          >
            {/* Team A */}
            <div
              className={`${
                isCanvas && isPortrait ? '' : 'col-span-5'
              } flex items-center gap-2.5 sm:gap-4 min-w-0`}
            >
              <div
                className="rounded-xl p-0.5 shrink-0"
                style={{ backgroundColor: teamAColor }}
              >
                <TeamAvatar
                  name={broadcast.teamA.name}
                  logoUrl={broadcast.teamA.logoUrl}
                  size={isCanvas ? 'lg' : 'md'}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`font-display font-black uppercase tracking-tight text-white truncate ${
                      isCanvas ? 'text-4xl' : 'text-sm sm:text-2xl'
                    }`}
                  >
                    {isCanvas ? broadcast.teamA.name : broadcast.teamA.shortName}
                  </span>
                  {broadcast.teamA.badgeText && (
                    <span
                      className={`rounded bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-amber-300 uppercase shrink-0 ${
                        isCanvas ? 'px-2.5 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[8px] sm:text-[10px]'
                      }`}
                    >
                      {broadcast.teamA.badgeText}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 sm:gap-3 mt-0.5">
                  <span
                    className={`font-mono font-black tabular-nums leading-none text-white ${
                      isCanvas ? 'text-6xl' : 'text-xl sm:text-4xl'
                    }`}
                  >
                    {broadcast.teamA.primaryText}
                  </span>
                  {broadcast.teamA.secondaryText && (
                    <span
                      className={`font-mono text-slate-300 truncate ${
                        isCanvas ? 'text-2xl' : 'text-[10px] sm:text-sm'
                      }`}
                    >
                      {broadcast.teamA.secondaryText}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Center Match Status Core */}
            <div
              className={`${
                isCanvas && isPortrait ? '' : 'col-span-2'
              } flex flex-col items-center justify-center text-center px-1`}
            >
              <span
                className={`inline-flex items-center justify-center rounded-full bg-white/10 border border-white/20 font-display font-black text-amber-300 ${
                  isCanvas ? 'px-5 py-1.5 text-2xl' : 'px-2.5 py-0.5 text-[10px] sm:text-sm'
                }`}
              >
                VS
              </span>
              {broadcast.centerMeta.periodLabel && (
                <span
                  className={`font-display font-bold text-slate-200 uppercase tracking-wider mt-1 truncate max-w-full ${
                    isCanvas ? 'text-lg' : 'text-[9px] sm:text-xs'
                  }`}
                >
                  {broadcast.centerMeta.periodLabel}
                </span>
              )}
              {broadcast.centerMeta.timerOrClock && (
                <span
                  className={`font-mono font-bold text-sky-300 truncate max-w-full ${
                    isCanvas ? 'text-xl' : 'text-[9px] sm:text-xs'
                  }`}
                >
                  {broadcast.centerMeta.timerOrClock}
                </span>
              )}
            </div>

            {/* Team B */}
            <div
              className={`${
                isCanvas && isPortrait ? '' : 'col-span-5'
              } flex items-center justify-end gap-2.5 sm:gap-4 min-w-0 text-right`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                  {broadcast.teamB.badgeText && (
                    <span
                      className={`rounded bg-amber-500/20 border border-amber-400/40 font-mono font-bold text-amber-300 uppercase shrink-0 ${
                        isCanvas ? 'px-2.5 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[8px] sm:text-[10px]'
                      }`}
                    >
                      {broadcast.teamB.badgeText}
                    </span>
                  )}
                  <span
                    className={`font-display font-black uppercase tracking-tight text-white truncate ${
                      isCanvas ? 'text-4xl' : 'text-sm sm:text-2xl'
                    }`}
                  >
                    {isCanvas ? broadcast.teamB.name : broadcast.teamB.shortName}
                  </span>
                </div>
                <div className="flex items-baseline justify-end gap-2 sm:gap-3 mt-0.5">
                  {broadcast.teamB.secondaryText && (
                    <span
                      className={`font-mono text-slate-300 truncate ${
                        isCanvas ? 'text-2xl' : 'text-[10px] sm:text-sm'
                      }`}
                    >
                      {broadcast.teamB.secondaryText}
                    </span>
                  )}
                  <span
                    className={`font-mono font-black tabular-nums leading-none text-white ${
                      isCanvas ? 'text-6xl' : 'text-xl sm:text-4xl'
                    }`}
                  >
                    {broadcast.teamB.primaryText}
                  </span>
                </div>
              </div>
              <div
                className="rounded-xl p-0.5 shrink-0"
                style={{ backgroundColor: teamBColor }}
              >
                <TeamAvatar
                  name={broadcast.teamB.name}
                  logoUrl={broadcast.teamB.logoUrl}
                  size={isCanvas ? 'lg' : 'md'}
                />
              </div>
            </div>
          </div>

          {broadcast.resultBannerText && (
            <div
              className={`mt-2 sm:mt-4 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-center font-display font-bold text-emerald-200 ${
                isCanvas ? 'py-2.5 px-4 text-2xl' : 'py-1 px-2.5 text-[11px] sm:text-sm'
              }`}
            >
              {broadcast.resultBannerText}
            </div>
          )}
        </section>

        {/* SPORT-SPECIFIC JIOHOTSTAR FULL SCORECARD PANELS */}
        {sport === 'Cricket' && (() => {
          const cd = normalizeCricketDetails(
            (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
          );
          const chase = computeCricketChaseState(cd, broadcast.teamA.name, broadcast.teamB.name);
          const card = deriveCricketInningsScorecard(
            cd,
            cd.innings,
            broadcast.teamA.name,
            broadcast.teamB.name
          );
          const batters = card.batting.slice(0, isCanvas ? 6 : 4);
          const bowlers = card.bowling.slice(0, isCanvas ? 5 : 3);

          return (
            <div className="flex-1 min-h-0 flex flex-col gap-2 sm:gap-4">
              {/* Chase / Rate Banner */}
              <div
                className={`rounded-xl border border-indigo-400/25 bg-[#0D1533]/90 flex flex-wrap items-center justify-between gap-2 shrink-0 ${
                  isCanvas ? 'px-6 py-3.5 text-xl' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                }`}
              >
                <span className="font-semibold text-amber-200 truncate">
                  {chase.chaseSummaryText}
                </span>
                <div className="flex flex-wrap items-center gap-3 sm:gap-5 font-mono tabular-nums font-bold">
                  <span className="text-emerald-300">CRR {chase.crr}</span>
                  {chase.rrr && <span className="text-orange-300">RRR {chase.rrr}</span>}
                  <span className="text-slate-300">Extras {card.extras.total}</span>
                </div>
              </div>

              {/* Batting + Bowling Grid */}
              <div
                className={`flex-1 min-h-0 grid gap-2 sm:gap-4 ${
                  isCanvas && isPortrait ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
                }`}
              >
                {/* Batting Table */}
                <div className="rounded-xl border border-white/10 bg-[#0B1129]/90 overflow-hidden flex flex-col">
                  <div
                    className={`border-b border-white/10 bg-white/5 flex items-center justify-between font-display font-bold uppercase tracking-wider ${
                      isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                    }`}
                  >
                    <span className="text-orange-300 truncate">{card.battingTeamName} Batting</span>
                    <span className="font-mono text-white">
                      {card.runs}/{card.wickets} ({card.oversText} ov)
                    </span>
                  </div>
                  <div className="flex-1 divide-y divide-white/5">
                    {batters.length === 0 ? (
                      <div
                        className={`text-slate-400 ${
                          isCanvas ? 'p-6 text-lg' : 'p-3 text-xs'
                        }`}
                      >
                        Innings batting details will appear here as balls are scored.
                      </div>
                    ) : (
                      batters.map((b, idx) => (
                        <div
                          key={`${b.name}-${idx}`}
                          className={`flex items-center justify-between gap-2 ${
                            isCanvas ? 'px-5 py-2.5 text-xl' : 'px-3 py-1 text-[10px] sm:text-xs'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white truncate">
                              {b.name}
                              {b.onStrike ? ' *' : ''}
                            </p>
                            {b.dismissalText && (
                              <p
                                className={`text-slate-400 truncate ${
                                  isCanvas ? 'text-sm' : 'text-[9px]'
                                }`}
                              >
                                {b.dismissalText}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 sm:gap-4 font-mono tabular-nums shrink-0">
                            <span className="font-black text-white">
                              {b.runs}
                              <span className="text-slate-400 font-normal">({b.balls})</span>
                            </span>
                            <span className="text-slate-300 hidden sm:inline">
                              {b.fours}×4 {b.sixes}×6
                            </span>
                            <span className="text-sky-300">SR {b.strikeRate}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Bowling + Recent Balls */}
                <div className="rounded-xl border border-white/10 bg-[#0B1129]/90 overflow-hidden flex flex-col justify-between">
                  <div>
                    <div
                      className={`border-b border-white/10 bg-white/5 flex items-center justify-between font-display font-bold uppercase tracking-wider ${
                        isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                      }`}
                    >
                      <span className="text-sky-300 truncate">{card.bowlingTeamName} Bowling</span>
                      <span className="font-mono text-slate-300">O · R · W · ECON</span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {bowlers.length === 0 ? (
                        <div
                          className={`text-slate-400 ${
                            isCanvas ? 'p-6 text-lg' : 'p-3 text-xs'
                          }`}
                        >
                          Bowling figures update after deliveries are bowled.
                        </div>
                      ) : (
                        bowlers.map((bw, idx) => (
                          <div
                            key={`${bw.name}-${idx}`}
                            className={`flex items-center justify-between gap-2 ${
                              isCanvas ? 'px-5 py-2.5 text-xl' : 'px-3 py-1 text-[10px] sm:text-xs'
                            }`}
                          >
                            <span className="font-bold text-white truncate">{bw.name}</span>
                            <div className="flex items-center gap-3 sm:gap-4 font-mono tabular-nums shrink-0">
                              <span className="text-slate-300">{bw.overs}</span>
                              <span className="text-slate-200">{bw.runsConceded}</span>
                              <span className="font-black text-amber-300">{bw.wickets}W</span>
                              <span className="text-emerald-300">{bw.economy}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {cd.recentBalls.length > 0 && (
                    <div
                      className={`border-t border-white/10 bg-white/5 flex items-center justify-between gap-2 ${
                        isCanvas ? 'px-5 py-3' : 'px-3 py-1.5'
                      }`}
                    >
                      <span
                        className={`font-display font-bold uppercase tracking-wider text-slate-300 shrink-0 ${
                          isCanvas ? 'text-base' : 'text-[9px] sm:text-xs'
                        }`}
                      >
                        Recent Balls
                      </span>
                      <div className="flex items-center gap-1 sm:gap-1.5 overflow-hidden">
                        {cd.recentBalls.slice(-8).map((ball, i) => (
                          <span
                            key={`${ball}-${i}`}
                            className={`inline-flex items-center justify-center rounded-full font-mono font-extrabold ${
                              ball === 'W' || ball.includes('W')
                                ? 'bg-red-600 text-white'
                                : ball === '6'
                                  ? 'bg-emerald-600 text-white'
                                  : ball === '4'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-800 text-slate-200 border border-white/15'
                            } ${
                              isCanvas ? 'w-9 h-9 text-base' : 'w-5 h-5 sm:w-6 sm:h-6 text-[9px] sm:text-[11px]'
                            }`}
                          >
                            {ball}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {sport === 'Kabaddi' && (() => {
          const kd = normalizeKabaddiDetails(
            (score?.sportSpecificDetails || {}) as Partial<KabaddiDetails>
          );
          const eff = computeEffectiveKabaddiClock(kd, nowMs);
          const recentRaids = [...(kd.raidTimeline || [])]
            .filter((r) => !r.reverted)
            .slice(-4)
            .reverse();
          const maxDots = Math.max(1, kd.rules.playersPerSide || 7);

          const statRows = [
            { label: 'Raid Points', a: kd.teamA.raidPoints, b: kd.teamB.raidPoints },
            { label: 'Tackle Points', a: kd.teamA.tacklePoints, b: kd.teamB.tacklePoints },
            { label: 'Bonus Points', a: kd.teamA.bonusPoints, b: kd.teamB.bonusPoints },
            { label: 'All-Out Points', a: kd.teamA.allOutPoints, b: kd.teamB.allOutPoints },
            { label: 'Super Tackles', a: kd.teamA.superTackles, b: kd.teamB.superTackles },
          ];

          return (
            <div
              className={`flex-1 min-h-0 grid gap-2 sm:gap-4 ${
                isCanvas && isPortrait ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              {/* Team Comparison Breakdown */}
              <div className="rounded-xl border border-white/10 bg-[#0B1129]/90 overflow-hidden flex flex-col">
                <div
                  className={`border-b border-white/10 bg-white/5 flex items-center justify-between font-display font-bold uppercase tracking-wider ${
                    isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                  }`}
                >
                  <span className="text-orange-300 truncate">{broadcast.teamA.shortName}</span>
                  <span className="text-slate-300">Match Stats</span>
                  <span className="text-sky-300 truncate">{broadcast.teamB.shortName}</span>
                </div>
                <div className="flex-1 divide-y divide-white/5 flex flex-col justify-center">
                  {statRows.map((row) => (
                    <div
                      key={row.label}
                      className={`flex items-center justify-between gap-2 ${
                        isCanvas ? 'px-6 py-2.5 text-xl' : 'px-3 py-1 text-[10px] sm:text-xs'
                      }`}
                    >
                      <span className="font-mono font-black tabular-nums text-orange-300 w-10">
                        {row.a}
                      </span>
                      <span className="font-semibold text-slate-200 text-center flex-1">
                        {row.label}
                      </span>
                      <span className="font-mono font-black tabular-nums text-sky-300 w-10 text-right">
                        {row.b}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mat Strength + Recent Raids */}
              <div className="rounded-xl border border-white/10 bg-[#0B1129]/90 overflow-hidden flex flex-col justify-between">
                <div
                  className={`border-b border-white/10 bg-white/5 flex items-center justify-between ${
                    isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 font-display font-bold uppercase text-amber-300">
                    <Flame className="w-4 h-4" />
                    <span>Court Strength &amp; Raids</span>
                  </span>
                  <span className="font-mono font-bold text-slate-200">
                    Clock {eff.formattedClock}
                  </span>
                </div>

                <div className={`space-y-2 ${isCanvas ? 'p-5' : 'p-2.5 sm:p-3'}`}>
                  {(
                    [
                      { name: broadcast.teamA.shortName, onCourt: kd.playersOnCourtA, color: teamAColor },
                      { name: broadcast.teamB.shortName, onCourt: kd.playersOnCourtB, color: teamBColor },
                    ] as const
                  ).map((row) => (
                    <div key={row.name} className="flex items-center justify-between gap-2">
                      <span
                        className={`font-bold text-white truncate ${
                          isCanvas ? 'text-lg w-28' : 'text-[10px] sm:text-xs w-16'
                        }`}
                      >
                        {row.name} ({row.onCourt}/{maxDots})
                      </span>
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: maxDots }).map((_, idx) => {
                          const active = idx < row.onCourt;
                          return (
                            <span
                              key={idx}
                              style={active ? { backgroundColor: row.color } : undefined}
                              className={`rounded-full border ${
                                active ? 'border-white/50' : 'bg-slate-800 border-slate-700'
                              } ${isCanvas ? 'w-5 h-5' : 'w-2.5 h-2.5 sm:w-3.5 sm:h-3.5'}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 divide-y divide-white/5">
                  {recentRaids.length === 0 ? (
                    <p
                      className={`text-slate-400 ${
                        isCanvas ? 'px-5 py-3 text-base' : 'px-3 py-1.5 text-[10px]'
                      }`}
                    >
                      Recent raid events appear live during play.
                    </p>
                  ) : (
                    recentRaids.map((raid) => (
                      <div
                        key={raid.id}
                        className={`flex items-center justify-between gap-2 ${
                          isCanvas ? 'px-5 py-2 text-base' : 'px-3 py-1 text-[10px] sm:text-xs'
                        }`}
                      >
                        <span className="truncate text-slate-200">
                          <strong className="text-amber-300">
                            {raid.team === 'A' ? broadcast.teamA.shortName : broadcast.teamB.shortName}
                          </strong>{' '}
                          {raid.description || raid.eventType.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono font-bold text-emerald-300 shrink-0">
                          +{raid.points}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {sport === 'Volleyball' && (() => {
          const vd = normalizeVolleyballDetails(
            (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
          );
          const sets = vd.setScores || [];
          return (
            <div className="flex-1 min-h-0 flex flex-col justify-between gap-2 sm:gap-4 rounded-xl border border-white/10 bg-[#0B1129]/90 p-3 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                <span
                  className={`font-display font-bold uppercase tracking-wider text-amber-300 ${
                    isCanvas ? 'text-2xl' : 'text-xs sm:text-base'
                  }`}
                >
                  Set-by-Set Scoreboard (Best of {vd.bestOfSets})
                </span>
                <span
                  className={`font-mono font-bold text-sky-300 ${
                    isCanvas ? 'text-xl' : 'text-[10px] sm:text-sm'
                  }`}
                >
                  Serving: {vd.servingTeam === 'A' ? broadcast.teamA.shortName : broadcast.teamB.shortName}
                  {vd.isDeuce ? ' · DEUCE' : ''}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4 flex-1 items-center">
                {Array.from({ length: vd.bestOfSets }).map((_, idx) => {
                  const setNo = idx + 1;
                  const row = sets.find((s) => s.set === setNo);
                  const isCurrent = setNo === vd.currentSet;
                  return (
                    <div
                      key={setNo}
                      className={`rounded-xl border text-center ${
                        isCurrent
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-white/10 bg-white/5'
                      } ${isCanvas ? 'p-5 space-y-2' : 'p-2 sm:p-3 space-y-1'}`}
                    >
                      <p
                        className={`font-mono font-bold uppercase ${
                          isCurrent ? 'text-amber-300' : 'text-slate-400'
                        } ${isCanvas ? 'text-lg' : 'text-[10px] sm:text-xs'}`}
                      >
                        Set {setNo}
                      </p>
                      <p
                        className={`font-mono font-black tabular-nums text-white ${
                          isCanvas ? 'text-4xl' : 'text-sm sm:text-2xl'
                        }`}
                      >
                        {row ? `${row.teamA} - ${row.teamB}` : '—'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {sport === 'Football' && (() => {
          const fd: FootballDetails = {
            ...createInitialFootballDetails(),
            ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
          };
          const events = [...(fd.events || [])].slice(-4).reverse();
          return (
            <div
              className={`flex-1 min-h-0 grid gap-2 sm:gap-4 ${
                isCanvas && isPortrait ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'
              }`}
            >
              <div className="rounded-xl border border-white/10 bg-[#0B1129]/90 overflow-hidden flex flex-col justify-center divide-y divide-white/5">
                {[
                  { label: 'Yellow Cards', a: fd.teamAYellowCards, b: fd.teamBYellowCards },
                  { label: 'Red Cards', a: fd.teamARedCards, b: fd.teamBRedCards },
                  { label: 'Penalties', a: fd.teamAPenalties, b: fd.teamBPenalties },
                ].map((row) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between ${
                      isCanvas ? 'px-6 py-4 text-2xl' : 'px-3 py-1.5 text-xs sm:text-sm'
                    }`}
                  >
                    <span className="font-mono font-black text-orange-300">{row.a}</span>
                    <span className="font-semibold text-slate-200">{row.label}</span>
                    <span className="font-mono font-black text-sky-300">{row.b}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0B1129]/90 overflow-hidden flex flex-col">
                <div
                  className={`border-b border-white/10 bg-white/5 font-display font-bold uppercase tracking-wider text-amber-300 ${
                    isCanvas ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-[10px] sm:text-xs'
                  }`}
                >
                  Key Match Events
                </div>
                <div className="divide-y divide-white/5 flex-1">
                  {events.length === 0 ? (
                    <p
                      className={`text-slate-400 ${
                        isCanvas ? 'p-5 text-lg' : 'p-3 text-xs'
                      }`}
                    >
                      Goals, cards, and substitutions appear live here.
                    </p>
                  ) : (
                    events.map((ev) => (
                      <div
                        key={ev.id}
                        className={`flex items-center justify-between gap-2 ${
                          isCanvas ? 'px-5 py-2.5 text-lg' : 'px-3 py-1 text-[10px] sm:text-xs'
                        }`}
                      >
                        <span className="font-mono font-bold text-amber-300 shrink-0">
                          {ev.minuteLabel}
                        </span>
                        <span className="truncate flex-1 text-slate-100">
                          {ev.playerName || ev.eventType.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-slate-400 shrink-0">
                          {ev.team === 'A' ? broadcast.teamA.shortName : broadcast.teamB.shortName}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {sport === 'Other' && (
          <div
            className={`flex-1 min-h-0 rounded-xl border border-white/10 bg-[#0B1129]/90 flex flex-col items-center justify-center text-center gap-2 ${
              isCanvas ? 'p-8' : 'p-3 sm:p-5'
            }`}
          >
            <Shield className={isCanvas ? 'w-14 h-14 text-amber-400' : 'w-6 h-6 text-amber-400'} />
            <p
              className={`font-display font-bold text-white ${
                isCanvas ? 'text-3xl' : 'text-sm sm:text-lg'
              }`}
            >
              {broadcast.title}
            </p>
            <p
              className={`text-slate-300 ${
                isCanvas ? 'text-xl' : 'text-[11px] sm:text-sm'
              }`}
            >
              Match Status: {score?.matchStatus || broadcast.centerMeta.statusLabel}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Ticker Strip */}
      <footer
        className={`relative z-10 border-t border-white/10 bg-[#06091A]/90 flex items-center justify-between gap-3 text-slate-300 shrink-0 ${
          isCanvas ? 'px-12 py-3.5 text-base' : 'px-3 py-1.5 sm:px-5 sm:py-2 text-[10px] sm:text-xs'
        }`}
      >
        <span className="font-mono uppercase tracking-wider truncate">
          MaidanLive Broadcast Center · Full Match Scoreboard
        </span>
        <span className="font-semibold text-amber-300 shrink-0">
          {broadcast.subStripItems
            .slice(0, 2)
            .map((item) => `${item.label}: ${item.value}`)
            .join(' · ') || 'Live Telemetry Sync'}
        </span>
      </footer>
    </div>
  );
}
