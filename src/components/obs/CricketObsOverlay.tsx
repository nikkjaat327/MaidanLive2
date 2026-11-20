import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  getMaxWickets,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';

interface CricketObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
}

export function CricketObsOverlay({ stream, score, config, theme }: CricketObsOverlayProps) {
  const details: CricketDetails = normalizeCricketDetails(
    (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
  );

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = details.teamAShortName || deriveShortTeamName(nameA, 'TMA');
  const shortB = details.teamBShortName || deriveShortTeamName(nameB, 'TMB');

  const chase = computeCricketChaseState(details, nameA, nameB);
  const stdStatus = resolveMatchStatus(stream, score);

  const isBattingA = details.battingTeam === 'A';
  const batShort = isBattingA ? shortA : shortB;
  const batName = isBattingA ? nameA : nameB;
  const batLogo = isBattingA ? stream.teamALogo : stream.teamBLogo;
  const batAccent = isBattingA ? config.teamAColor : config.teamBColor;

  const bowlShort = isBattingA ? shortB : shortA;
  const bowlName = isBattingA ? nameB : nameA;
  const bowlLogo = isBattingA ? stream.teamBLogo : stream.teamALogo;
  const bowlAccent = isBattingA ? config.teamBColor : config.teamAColor;

  const runs = isBattingA ? details.teamARuns : details.teamBRuns;
  const wickets = isBattingA ? details.teamAWickets : details.teamBWickets;
  const balls = isBattingA ? details.teamABalls : details.teamBBalls;

  const bowlRuns = isBattingA ? details.teamBRuns : details.teamARuns;
  const bowlWickets = isBattingA ? details.teamBWickets : details.teamAWickets;
  const bowlBalls = isBattingA ? details.teamBBalls : details.teamABalls;

  const maxWickets = getMaxWickets(details);
  const configuredBalls = Math.max(1, details.oversLimit) * 6;
  const isAllOut = wickets >= maxWickets;
  const isOversDone = balls >= configuredBalls;

  const isAbandoned =
    score?.resultStatus === 'ABANDONED' ||
    score?.resultStatus === 'NO_RESULT' ||
    stdStatus === 'CANCELLED';
  const isInterrupted = stdStatus === 'INTERRUPTED' || stdStatus === 'DELAYED';
  const isCompleted =
    chase.isMatchCompleted ||
    (Boolean(score?.resultStatus) && score?.resultStatus !== 'NOT_DECLARED');

  // Detect live score transitions for subtle GPU animation
  const prevScoreKeyRef = useRef(`${runs}-${wickets}-${balls}`);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    const nextKey = `${runs}-${wickets}-${balls}`;
    if (prevScoreKeyRef.current !== nextKey) {
      prevScoreKeyRef.current = nextKey;
      setPulseKey((k) => k + 1);
    }
  }, [runs, wickets, balls]);

  const recentBalls = details.recentBalls || [];
  const lastOver =
    recentBalls.length > 0
      ? recentBalls.slice(-6)
      : (details.lastOverSummary || []).slice(-6);

  // Status Pill Resolution
  let statusPillLabel = 'LIVE';
  let statusPillVariant: 'live' | 'break' | 'warning' | 'final' | 'upcoming' = 'live';
  let showLiveDot = stream.status === 'LIVE' && !isCompleted && !isAbandoned;

  if (isAbandoned) {
    statusPillLabel = score?.resultStatus === 'NO_RESULT' ? 'NO RESULT' : 'ABANDONED';
    statusPillVariant = 'warning';
    showLiveDot = false;
  } else if (isInterrupted) {
    statusPillLabel =
      (score?.matchStatus || '').toUpperCase().includes('RAIN')
        ? 'RAIN DELAY'
        : stdStatus === 'DELAYED'
          ? 'DELAYED'
          : 'INTERRUPTED';
    statusPillVariant = 'warning';
    showLiveDot = false;
  } else if (chase.isInningsBreak) {
    statusPillLabel = 'INN BREAK';
    statusPillVariant = 'break';
    showLiveDot = false;
  } else if (isCompleted) {
    statusPillLabel = chase.outcome === 'TIED' || score?.resultStatus === 'TIE' ? 'TIED' : 'FINAL';
    statusPillVariant = 'final';
    showLiveDot = false;
  } else if (stream.status === 'UPCOMING') {
    statusPillLabel = 'UPCOMING';
    statusPillVariant = 'upcoming';
    showLiveDot = false;
  } else if (details.isSuperOver) {
    statusPillLabel = 'SUPER OVER';
    statusPillVariant = 'live';
  }

  // Contextual dynamic situation banner text
  let situationBannerText = '';
  let situationAccent: 'chase' | 'break' | 'result' | 'warning' | 'info' = 'info';

  if (isAbandoned) {
    situationBannerText = score?.resultDescription || score?.matchStatus || 'Match Abandoned';
    situationAccent = 'warning';
  } else if (isInterrupted) {
    situationBannerText = score?.matchStatus || 'Play Interrupted';
    situationAccent = 'warning';
  } else if (isCompleted) {
    situationBannerText = score?.resultDescription || chase.chaseSummaryText || 'Match Completed';
    situationAccent = 'result';
  } else if (chase.isInningsBreak) {
    const parts = ['INNINGS BREAK'];
    if (config.showTarget && chase.target > 0) parts.push(`TARGET ${chase.target}`);
    parts.push(`${bowlShort} NEED ${chase.target} (${details.oversLimit} OV)`);
    situationBannerText = parts.join(' · ');
    situationAccent = 'break';
  } else if (chase.isSecondInnings && chase.target > 0) {
    const parts: string[] = [];
    if (config.showRunsRequired && config.showBallsRemaining) {
      parts.push(`NEED ${chase.runsRequired} FROM ${chase.ballsRemaining} BALL${chase.ballsRemaining === 1 ? '' : 'S'}`);
    } else if (config.showRunsRequired) {
      parts.push(`NEED ${chase.runsRequired} RUN${chase.runsRequired === 1 ? '' : 'S'}`);
    } else if (config.showBallsRemaining) {
      parts.push(`${chase.ballsRemaining} BALLS REM`);
    }
    if (parts.length > 0) {
      situationBannerText = parts.join(' · ');
      situationAccent = 'chase';
    }
  } else if (isAllOut) {
    situationBannerText = `${batShort} ALL OUT`;
    situationAccent = 'info';
  } else if (isOversDone) {
    situationBannerText = `${batShort} INNINGS COMPLETED`;
    situationAccent = 'info';
  }

  // 1) SCORE_ONLY ultra-minimal corner bug
  if (config.mode === 'score_only') {
    return (
      <div
        style={{
          background: theme.barBg,
          borderColor: theme.barBorder,
          color: theme.primaryText,
        }}
        className="inline-flex items-center rounded-lg border shadow-[0_10px_30px_rgba(0,0,0,0.55)] overflow-hidden backdrop-blur-md"
      >
        <div
          style={{ background: config.theme === 'team_colors' ? batAccent : theme.brandBg }}
          className="w-1.5 self-stretch shrink-0"
        />
        <div className="flex items-center gap-2.5 px-3 py-1.5">
          <ObsTeamBadge
            logoUrl={batLogo}
            shortName={batShort}
            accentColor={batAccent}
            size="sm"
            showLogo={config.showTeamLogos}
          />
          <span className="font-display font-extrabold text-sm tracking-wide uppercase">
            {batShort}
          </span>
          <span
            key={pulseKey}
            style={{ background: theme.scorePillBg, color: theme.scorePillText }}
            className="obs-score-pop font-mono tabular-nums font-extrabold text-base px-2.5 py-0.5 rounded"
          >
            {runs}/{wickets}
          </span>
          <span
            style={{ color: theme.secondaryText }}
            className="font-mono tabular-nums text-xs font-semibold"
          >
            {formatCricketOvers(balls)} OV
          </span>
          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={statusPillLabel}
              isLive={showLiveDot}
              variant={statusPillVariant}
              compact
            />
          )}
        </div>
      </div>
    );
  }

  // 2) COMPACT single-bar broadcast strip
  if (config.mode === 'compact') {
    return (
      <div
        style={{
          background: theme.barBg,
          borderColor: theme.barBorder,
          color: theme.primaryText,
        }}
        className="inline-flex items-stretch rounded-lg border shadow-[0_14px_36px_rgba(0,0,0,0.6)] overflow-hidden backdrop-blur-md max-w-full"
      >
        <ObsBrandMark
          theme={theme}
          compact
          accentColor={config.theme === 'team_colors' ? config.teamAColor : undefined}
        />

        <div className="flex items-center gap-2.5 px-3 py-1.5 min-w-0">
          <ObsTeamBadge
            logoUrl={batLogo}
            shortName={batShort}
            accentColor={batAccent}
            size="sm"
            showLogo={config.showTeamLogos}
          />
          <span className="font-display font-extrabold text-sm tracking-wide uppercase truncate max-w-[110px]">
            {batShort}
          </span>

          <div
            key={pulseKey}
            style={{ background: theme.scorePillBg, color: theme.scorePillText }}
            className="obs-score-pop flex items-baseline gap-1.5 px-2.5 py-1 rounded font-mono tabular-nums shrink-0"
          >
            <span className="font-extrabold text-base leading-none">
              {runs}/{wickets}
            </span>
            <span className="text-[11px] opacity-80 font-semibold leading-none">
              {formatCricketOvers(balls)} OV
            </span>
          </div>

          {config.showRunRate && (
            <span
              style={{ color: theme.accentSecondary }}
              className="font-mono tabular-nums text-[11px] font-bold shrink-0"
            >
              CRR {chase.crr}
            </span>
          )}

          {chase.isSecondInnings && config.showTarget && chase.target > 0 && !isCompleted && (
            <span
              style={{ color: theme.secondaryText, borderColor: theme.divider }}
              className="font-mono tabular-nums text-[11px] font-bold pl-2 border-l shrink-0"
            >
              TGT {chase.target}
            </span>
          )}

          {situationBannerText && (
            <span
              style={{
                background:
                  situationAccent === 'result'
                    ? 'rgba(16, 185, 129, 0.22)'
                    : situationAccent === 'warning'
                      ? 'rgba(225, 29, 72, 0.24)'
                      : theme.chaseHighlightBg,
                color:
                  situationAccent === 'result'
                    ? '#6EE7B7'
                    : situationAccent === 'warning'
                      ? '#FDA4AF'
                      : theme.chaseHighlightText,
              }}
              className="font-display font-bold text-[11px] tracking-wide uppercase px-2.5 py-1 rounded truncate max-w-[260px]"
            >
              {situationBannerText}
            </span>
          )}

          {!situationBannerText && details.innings === 1 && bowlBalls > 0 && (
            <span
              style={{ color: theme.mutedText, borderColor: theme.divider }}
              className="font-mono tabular-nums text-[11px] pl-2 border-l shrink-0"
            >
              {bowlShort} {bowlRuns}/{bowlWickets}
            </span>
          )}

          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={statusPillLabel}
              isLive={showLiveDot}
              variant={statusPillVariant}
              compact
            />
          )}
        </div>
      </div>
    );
  }

  // 3) FULL Hotstar-Inspired Broadcast Scoreboard
  const showCreaseInfo =
    !chase.isInningsBreak &&
    !isCompleted &&
    !isAbandoned &&
    ((config.showBatters && Boolean(details.batsman1 || details.batsman2)) ||
      (config.showBowler && Boolean(details.bowler)));

  const showRecentStrip = config.showRecentOver && lastOver.length > 0 && !isAbandoned;
  const showTournamentRow = config.showTournamentName && Boolean(stream.tournamentName);

  const showBottomSubStrip =
    showTournamentRow ||
    showCreaseInfo ||
    showRecentStrip ||
    details.isSuperOver ||
    (isCompleted && Boolean(score?.mvpPlayerName));

  return (
    <div
      style={{
        background: theme.barBg,
        borderColor: theme.barBorder,
        color: theme.primaryText,
      }}
      className="inline-flex flex-col rounded-lg border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md max-w-[960px]"
    >
      {/* Top Primary Broadcast Strip */}
      <div className="flex items-stretch">
        {/* Original MaidanLive Crest */}
        <ObsBrandMark
          theme={theme}
          accentColor={config.theme === 'team_colors' ? config.teamAColor : undefined}
        />

        {/* Batting Team Accent Stripe */}
        <div style={{ background: batAccent }} className="w-1 shrink-0" />

        {/* Batting Team Wing + Main Score */}
        <div className="flex items-center gap-3 px-3.5 py-2">
          <ObsTeamBadge
            logoUrl={batLogo}
            shortName={batShort}
            accentColor={batAccent}
            size="md"
            showLogo={config.showTeamLogos}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold text-sm sm:text-base tracking-wide uppercase leading-none truncate max-w-[140px]">
                {batShort}
              </span>
              <span
                style={{ color: theme.accentPrimary }}
                className="text-[10px] font-bold uppercase tracking-wider leading-none"
              >
                {details.innings === 2 ? '2ND' : '1ST'}
              </span>
            </div>
            <p
              style={{ color: theme.mutedText }}
              className="text-[10px] font-medium truncate max-w-[150px] mt-0.5 leading-none"
            >
              {batName}
            </p>
          </div>

          {/* Score Capsule + Overs */}
          <div
            key={pulseKey}
            style={{ background: theme.scorePillBg, color: theme.scorePillText }}
            className="obs-score-pop flex items-baseline gap-2 px-3 py-1.5 rounded-md shadow-inner shrink-0"
          >
            <span className="font-mono tabular-nums font-extrabold text-xl leading-none tracking-tight">
              {runs}/{wickets}
            </span>
            <span className="font-mono tabular-nums text-xs font-bold opacity-85 leading-none">
              {formatCricketOvers(balls)}
              <span className="opacity-65">/{details.oversLimit}</span> OV
            </span>
          </div>
        </div>

        {/* Opponent / Bowling Team Wing */}
        <div
          style={{ borderColor: theme.divider }}
          className="flex items-center gap-2.5 px-3 py-2 border-l"
        >
          <ObsTeamBadge
            logoUrl={bowlLogo}
            shortName={bowlShort}
            accentColor={bowlAccent}
            size="sm"
            showLogo={config.showTeamLogos}
          />
          <div className="leading-tight">
            <span className="font-display font-bold text-xs tracking-wide uppercase block">
              {bowlShort}
            </span>
            <span
              style={{ color: theme.mutedText }}
              className="font-mono tabular-nums text-[10px] block"
            >
              {chase.isSecondInnings || bowlBalls > 0 || bowlRuns > 0
                ? `${bowlRuns}/${bowlWickets} (${formatCricketOvers(bowlBalls)})`
                : bowlName.slice(0, 14)}
            </span>
          </div>
        </div>

        {/* Run Rates & Target / Chase Box */}
        <div
          style={{ borderColor: theme.divider }}
          className="flex items-center gap-3 px-3.5 py-2 border-l"
        >
          {config.showRunRate && (
            <div className="leading-tight">
              <span
                style={{ color: theme.mutedText }}
                className="text-[9px] font-bold uppercase tracking-wider block"
              >
                CRR
              </span>
              <span
                style={{ color: theme.accentSecondary }}
                className="font-mono tabular-nums font-bold text-xs"
              >
                {chase.crr}
              </span>
            </div>
          )}

          {chase.isSecondInnings && config.showTarget && chase.target > 0 && !isCompleted && (
            <div className="leading-tight">
              <span
                style={{ color: theme.mutedText }}
                className="text-[9px] font-bold uppercase tracking-wider block"
              >
                TARGET
              </span>
              <span className="font-mono tabular-nums font-extrabold text-xs">
                {chase.target}
              </span>
            </div>
          )}

          {chase.isSecondInnings && config.showRequiredRunRate && chase.rrr !== null && !isCompleted && (
            <div className="leading-tight">
              <span
                style={{ color: theme.mutedText }}
                className="text-[9px] font-bold uppercase tracking-wider block"
              >
                RRR
              </span>
              <span
                style={{ color: theme.accentPrimary }}
                className="font-mono tabular-nums font-bold text-xs"
              >
                {chase.rrr}
              </span>
            </div>
          )}

          {/* Chase Equation / Dynamic Match Situation Callout */}
          {situationBannerText && (config.showMatchStatus || situationAccent === 'chase') && (
            <div
              style={{
                background:
                  situationAccent === 'result'
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.18) 100%)'
                    : situationAccent === 'warning'
                      ? 'linear-gradient(135deg, rgba(225, 29, 72, 0.28) 0%, rgba(190, 18, 60, 0.18) 100%)'
                      : theme.chaseHighlightBg,
                color:
                  situationAccent === 'result'
                    ? '#6EE7B7'
                    : situationAccent === 'warning'
                      ? '#FDA4AF'
                      : theme.chaseHighlightText,
                borderColor:
                  situationAccent === 'result'
                    ? 'rgba(52, 211, 153, 0.35)'
                    : situationAccent === 'warning'
                      ? 'rgba(251, 113, 133, 0.35)'
                      : 'rgba(251, 191, 36, 0.26)',
              }}
              className="px-3 py-1 rounded border flex items-center gap-1.5 font-display font-extrabold text-xs tracking-wide uppercase whitespace-nowrap"
            >
              {situationAccent === 'result' && <Trophy className="w-3.5 h-3.5 shrink-0" />}
              <span>{situationBannerText}</span>
            </div>
          )}

          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={statusPillLabel}
              isLive={showLiveDot}
              variant={statusPillVariant}
            />
          )}
        </div>
      </div>

      {/* Bottom Secondary Telemetry Strip (Tournament, Batters/Bowler, Recent Balls, Super Over) */}
      {showBottomSubStrip && (
        <div
          style={{
            background: theme.subStripBg,
            borderColor: theme.subStripBorder,
            color: theme.secondaryText,
          }}
          className="flex items-center justify-between gap-4 px-3.5 py-1.5 border-t text-[11px]"
        >
          <div className="flex items-center gap-3 min-w-0">
            {showTournamentRow && (
              <span
                style={{ color: theme.accentPrimary }}
                className="font-display font-bold uppercase tracking-wider truncate max-w-[200px]"
              >
                {stream.tournamentName}
              </span>
            )}

            {details.isSuperOver && (
              <span className="font-mono tabular-nums font-bold text-amber-300 shrink-0">
                SUPER OVER: {shortA} {details.superOverTeamARuns}/{details.superOverTeamAWickets} · {shortB}{' '}
                {details.superOverTeamBRuns}/{details.superOverTeamBWickets}
              </span>
            )}

            {showCreaseInfo && (
              <div className="flex items-center gap-3 min-w-0 font-medium">
                {config.showBatters && (details.batsman1 || details.batsman2) && (
                  <div className="flex items-center gap-2 min-w-0">
                    {details.batsman1 && (
                      <span className="truncate max-w-[140px] font-semibold">
                        <span style={{ color: theme.accentPrimary }}>*</span> {details.batsman1}
                      </span>
                    )}
                    {details.batsman2 && (
                      <span style={{ color: theme.mutedText }} className="truncate max-w-[130px]">
                        {details.batsman2}
                      </span>
                    )}
                  </div>
                )}
                {config.showBowler && details.bowler && (
                  <span
                    style={{ borderColor: theme.divider }}
                    className="truncate max-w-[150px] pl-2.5 border-l"
                  >
                    <span style={{ color: theme.mutedText }} className="uppercase text-[10px] mr-1">
                      BWL
                    </span>
                    <span className="font-semibold">{details.bowler}</span>
                  </span>
                )}
              </div>
            )}

            {isCompleted && score?.mvpPlayerName && (
              <span className="font-semibold text-emerald-300 truncate">
                POTM: {score.mvpPlayerName}
              </span>
            )}
          </div>

          {showRecentStrip && (
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <span
                style={{ color: theme.mutedText }}
                className="text-[9px] font-bold uppercase tracking-wider mr-0.5"
              >
                THIS OVER
              </span>
              {lastOver.map((b, i) => {
                const isWicket = b.includes('W') && !b.startsWith('Wd');
                const isFour = b === '4';
                const isSix = b === '6';
                const isExtra = b.startsWith('Wd') || b.startsWith('Nb');
                return (
                  <span
                    key={`${b}-${i}`}
                    className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded text-[10px] font-mono tabular-nums font-extrabold ${
                      isWicket
                        ? 'bg-red-600 text-white'
                        : isSix
                          ? 'bg-emerald-600 text-white'
                          : isFour
                            ? 'bg-sky-600 text-white'
                            : isExtra
                              ? 'bg-amber-500 text-slate-950'
                              : theme.isLight
                                ? 'bg-slate-200 text-slate-900'
                                : 'bg-white/15 text-slate-100'
                    }`}
                  >
                    {b}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
