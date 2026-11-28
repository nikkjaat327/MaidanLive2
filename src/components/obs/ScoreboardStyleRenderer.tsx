import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import {
  computeOverlayMetrics,
  hexToRgba,
  normalizeCustomScoreboardDesign,
  resolveScoreboardTeamName,
  type ScoreboardStyleId,
} from '../../utils/overlayConfig.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';
import { KabaddiAnimations } from '../scoreboard/kabaddi/KabaddiAnimations.tsx';
import { buildScoreboardViewModel, type ScoreboardViewModel } from './scoreboardViewModel.ts';
import { CricketObsOverlay } from './CricketObsOverlay.tsx';
import { FootballObsOverlay } from './FootballObsOverlay.tsx';
import { KabaddiObsOverlay } from './KabaddiObsOverlay.tsx';
import { VolleyballObsOverlay } from './VolleyballObsOverlay.tsx';
import { GenericObsOverlay } from './GenericObsOverlay.tsx';
import { normalizeKabaddiDetails } from '../../utils/kabaddiScoring.ts';

interface ScoreboardStyleRendererProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
  isPortrait?: boolean;
  serverClockOffsetMs?: number;
}

function BallChips({
  balls,
  chipPx,
  fontPx,
  isLight,
}: {
  balls: string[];
  chipPx: number;
  fontPx: number;
  isLight: boolean;
}) {
  if (balls.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {balls.map((b, i) => {
        const isWicket = b.includes('W') && !b.startsWith('Wd');
        const isFour = b === '4';
        const isSix = b === '6';
        const isExtra = b.startsWith('Wd') || b.startsWith('Nb');
        return (
          <span
            key={`${b}-${i}`}
            style={{
              minWidth: chipPx,
              height: chipPx,
              fontSize: fontPx,
            }}
            className={`inline-flex items-center justify-center px-1 rounded font-mono tabular-nums font-extrabold leading-none ${
              isWicket
                ? 'bg-red-600 text-white'
                : isSix
                  ? 'bg-emerald-600 text-white'
                  : isFour
                    ? 'bg-sky-600 text-white'
                    : isExtra
                      ? 'bg-amber-500 text-slate-950'
                      : isLight
                        ? 'bg-slate-200 text-slate-900'
                        : 'bg-white/15 text-slate-100'
            }`}
          >
            {b}
          </span>
        );
      })}
    </div>
  );
}

function TelemetrySubRow({
  vm,
  config,
  theme,
  m,
  isPortrait,
  className = '',
  style,
}: {
  vm: ScoreboardViewModel;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
  m: ReturnType<typeof computeOverlayMetrics>;
  isPortrait: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const showLegacyBatters = !vm.isCricket && Boolean(vm.battersText);
  const showLegacyBowler = !vm.isCricket && Boolean(vm.bowlerText);
  const hasSplitStats = Boolean(vm.leftStatsText || vm.rightStatsText);
  const hasContent =
    hasSplitStats ||
    vm.tournamentName ||
    showLegacyBatters ||
    showLegacyBowler ||
    vm.statChips.length > 0 ||
    vm.recentBalls.length > 0 ||
    vm.situationBanner ||
    vm.mvpPlayerName ||
    vm.footerNote;

  if (!hasContent || config.mode !== 'full') return null;

  if (hasSplitStats) {
    return (
      <div
        style={{
          fontSize: m.metaFontPx,
          paddingLeft: m.subStripPadX,
          paddingRight: m.subStripPadX,
          paddingTop: m.subStripPadY,
          paddingBottom: m.subStripPadY,
          gap: Math.max(8, Math.round(m.sectionGapPx * 0.75)),
          ...style,
        }}
        className={`flex items-center justify-between min-w-0 font-mono tabular-nums ${isPortrait ? 'flex-wrap' : ''} ${className}`}
      >
        <span className="font-semibold truncate">{vm.leftStatsText}</span>
        {vm.situationBanner ? (
          <span
            style={{
              color:
                vm.situationAccent === 'result'
                  ? '#6EE7B7'
                  : vm.situationAccent === 'warning'
                    ? '#FDA4AF'
                    : theme.chaseHighlightText,
            }}
            className="inline-flex items-center gap-1 font-display font-extrabold uppercase tracking-wide truncate"
          >
            {vm.situationAccent === 'result' && <Trophy className="w-3.5 h-3.5 shrink-0" />}
            {vm.situationBanner}
          </span>
        ) : vm.tournamentName ? (
          <span
            style={{ color: theme.accentPrimary }}
            className="font-display font-extrabold uppercase tracking-wider truncate"
          >
            {vm.tournamentName}
          </span>
        ) : null}
        <span className="font-semibold truncate text-right">{vm.rightStatsText}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: m.metaFontPx,
        paddingLeft: m.subStripPadX,
        paddingRight: m.subStripPadX,
        paddingTop: m.subStripPadY,
        paddingBottom: m.subStripPadY,
        gap: Math.max(8, Math.round(m.sectionGapPx * 0.75)),
        ...style,
      }}
      className={`flex items-center justify-between min-w-0 ${isPortrait ? 'flex-wrap' : ''} ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
        {vm.tournamentName && (
          <span
            style={{ color: theme.accentPrimary }}
            className="font-display font-extrabold uppercase tracking-wider truncate"
          >
            {vm.tournamentName}
          </span>
        )}
        {showLegacyBatters && (
          <span className="font-semibold truncate">{vm.battersText}</span>
        )}
        {showLegacyBowler && (
          <span style={{ color: theme.mutedText }} className="font-semibold truncate">
            {vm.bowlerText}
          </span>
        )}
        {vm.statChips.map((chip) => (
          <span
            key={chip.label}
            className="font-mono tabular-nums font-bold whitespace-nowrap"
            style={{
              color:
                chip.accent === 'primary'
                  ? theme.accentPrimary
                  : chip.accent === 'secondary'
                    ? theme.accentSecondary
                    : theme.secondaryText,
            }}
          >
            <span className="opacity-70 mr-1">{chip.label}</span>
            {chip.value}
          </span>
        ))}
        {vm.footerNote && (
          <span className="font-mono font-bold text-amber-300 truncate">{vm.footerNote}</span>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0 flex-wrap">
        {vm.situationBanner && (
          <span
            style={{
              color:
                vm.situationAccent === 'result'
                  ? '#6EE7B7'
                  : vm.situationAccent === 'warning'
                    ? '#FDA4AF'
                    : theme.chaseHighlightText,
            }}
            className="inline-flex items-center gap-1 font-display font-extrabold uppercase tracking-wide truncate"
          >
            {vm.situationAccent === 'result' && <Trophy className="w-3.5 h-3.5 shrink-0" />}
            {vm.situationBanner}
          </span>
        )}
        {vm.mvpPlayerName && (
          <span className="font-semibold text-emerald-300 truncate">POTM: {vm.mvpPlayerName}</span>
        )}
        <BallChips
          balls={vm.recentBalls}
          chipPx={m.ballChipPx}
          fontPx={m.ballChipFontPx}
          isLight={theme.isLight}
        />
      </div>
    </div>
  );
}

export function ScoreboardStyleRenderer({
  stream,
  score,
  config,
  theme,
  isPortrait = false,
  serverClockOffsetMs = 0,
}: ScoreboardStyleRendererProps) {
  const styleId: ScoreboardStyleId = config.style || 'broadcast_classic';
  const sport = score?.sportType || stream.gameName || 'Other';

  // Classic style preserves 100% of original per-sport overlays
  if (styleId === 'broadcast_classic') {
    switch (sport) {
      case 'Cricket':
        return (
          <CricketObsOverlay stream={stream} score={score} config={config} theme={theme} isPortrait={isPortrait} />
        );
      case 'Football':
        return (
          <FootballObsOverlay stream={stream} score={score} config={config} theme={theme} isPortrait={isPortrait} />
        );
      case 'Kabaddi':
        return (
          <KabaddiObsOverlay
            stream={stream}
            score={score}
            config={config}
            theme={theme}
            isPortrait={isPortrait}
            serverClockOffsetMs={serverClockOffsetMs}
          />
        );
      case 'Volleyball':
        return (
          <VolleyballObsOverlay stream={stream} score={score} config={config} theme={theme} isPortrait={isPortrait} />
        );
      default:
        return (
          <GenericObsOverlay stream={stream} score={score} config={config} theme={theme} isPortrait={isPortrait} />
        );
    }
  }

  return (
    <AlternativeScoreboardStyles
      stream={stream}
      score={score}
      config={config}
      theme={theme}
      isPortrait={isPortrait}
      serverClockOffsetMs={serverClockOffsetMs}
      styleId={styleId}
    />
  );
}

function AlternativeScoreboardStyles({
  stream,
  score,
  config,
  theme,
  isPortrait = false,
  serverClockOffsetMs = 0,
  styleId,
}: ScoreboardStyleRendererProps & { styleId: Exclude<ScoreboardStyleId, 'broadcast_classic'> }) {
  const m = computeOverlayMetrics(config, isPortrait);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isKabaddi = (score?.sportType || stream.gameName) === 'Kabaddi';
  const kabaddiTickActive = (() => {
    if (!isKabaddi) return false;
    const kd = normalizeKabaddiDetails(score?.sportSpecificDetails);
    if (kd.matchCompleted) return false;
    return Boolean(
      kd.clock.status === 'RUNNING' ||
        kd.clock.status === 'EXTRA_TIME' ||
        kd.clock.status === 'BREAK' ||
        kd.clock.raidRunning ||
        kd.clock.timeoutActive ||
        kd.doOrDie.active ||
        (kd.lastAllOut?.triggeredAtIso &&
          Date.now() - Date.parse(kd.lastAllOut.triggeredAtIso) <=
            (kd.rules.allOutBannerDurationSec || 5) * 1000)
    );
  })();

  useEffect(() => {
    if (!kabaddiTickActive) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [kabaddiTickActive]);

  const effectiveNowMs = nowMs + serverClockOffsetMs;
  const vm = buildScoreboardViewModel(stream, score, config, theme, effectiveNowMs);

  const prevSeedRef = useRef(vm.pulseKeySeed);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (prevSeedRef.current !== vm.pulseKeySeed) {
      prevSeedRef.current = vm.pulseKeySeed;
      setPulseKey((k) => k + 1);
    }
  }, [vm.pulseKeySeed]);

  const kabaddiBanner = vm.kabaddiBannerData ? (
    <KabaddiAnimations
      streamId={vm.kabaddiBannerData.streamId}
      teamAName={vm.kabaddiBannerData.teamAName}
      teamBName={vm.kabaddiBannerData.teamBName}
      doOrDie={vm.kabaddiBannerData.d.doOrDie}
      doOrDieVisible={vm.kabaddiBannerData.effClock.doOrDieVisible}
      doOrDieRemainingSec={vm.kabaddiBannerData.effClock.doOrDieRemainingSec}
      lastAllOut={vm.kabaddiBannerData.d.lastAllOut}
      allOutDurationSec={vm.kabaddiBannerData.d.rules.allOutBannerDurationSec}
      timeoutActive={vm.kabaddiBannerData.d.clock.timeoutActive}
      timeoutTeam={vm.kabaddiBannerData.d.clock.timeoutTeam}
      timeoutRemainingSec={vm.kabaddiBannerData.effClock.timeoutRemainingSec}
      displaySettings={vm.kabaddiBannerData.d.viewerDisplaySettings}
      compact
      showTimer={false}
      scaleMultiplier={m.overallScale}
      nowMs={effectiveNowMs}
    />
  ) : null;

  const isScoreOnly = config.mode === 'score_only';
  const isCompact = config.mode === 'compact';
  const teamADisplay = resolveScoreboardTeamName(vm.primaryName, vm.primaryShort, isPortrait);
  const teamBDisplay = resolveScoreboardTeamName(vm.secondaryName, vm.secondaryShort, isPortrait);

  const wrapWithKabaddi = (node: React.ReactNode) =>
    kabaddiBanner ? (
      <div className="w-full flex flex-col items-center gap-2">
        {kabaddiBanner}
        {node}
      </div>
    ) : (
      node
    );

  // -----------------------------------------------------------------------
  // STYLE 2: FLOATING PILL BAR — rounded-full capsule + center orb badge
  // -----------------------------------------------------------------------
  if (styleId === 'floating_pill') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col items-center gap-1.5`}>
        <div
          style={{
            background: theme.barBg,
            borderColor: theme.barBorder,
            color: theme.primaryText,
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className={`${
            isScoreOnly ? 'inline-flex' : 'w-full flex'
          } items-center justify-between rounded-full border-2 shadow-[0_14px_40px_rgba(0,0,0,0.65)] backdrop-blur-xl`}
        >
          <div
            style={{ gap: m.sectionGapPx }}
            className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
          >
            {/* Left Team Pill */}
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                style={{ background: vm.primaryAccent }}
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow"
              />
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0 flex-1">
                <span
                  style={{ fontSize: m.teamNameFontPx }}
                  className="font-display font-extrabold uppercase tracking-wide truncate block leading-none"
                >
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono font-semibold truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
                {vm.primaryServing && (
                  <span className="text-[9px] font-mono font-bold text-amber-400 uppercase block">SERVING</span>
                )}
              </div>
              <span
                key={`fp-a-${pulseKey}`}
                style={{
                  background: theme.scorePillBg,
                  color: theme.scorePillText,
                  fontSize: m.scoreFontPx,
                  paddingLeft: m.scorePillPadX,
                  paddingRight: m.scorePillPadX,
                  paddingTop: Math.max(4, Math.round(m.scorePillPadY * 0.7)),
                  paddingBottom: Math.max(4, Math.round(m.scorePillPadY * 0.7)),
                }}
                className="obs-score-pop rounded-full font-mono tabular-nums font-extrabold leading-none shrink-0 border border-white/15"
              >
                {vm.primaryScore}
              </span>
            </div>

            {/* Center Orb */}
            <div
              style={{
                background: theme.brandBg,
                color: theme.brandText,
                paddingLeft: m.pillPadX * 1.4,
                paddingRight: m.pillPadX * 1.4,
                paddingTop: Math.max(5, Math.round(m.stripPadY * 0.65)),
                paddingBottom: Math.max(5, Math.round(m.stripPadY * 0.65)),
              }}
              className="rounded-full flex flex-col items-center justify-center shrink-0 shadow-lg border border-white/25"
            >
              {vm.centerPrimary ? (
                <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-extrabold leading-none whitespace-nowrap">
                  {vm.centerPrimary}
                </span>
              ) : !(!isScoreOnly && vm.centerSecondary) ? (
                <span style={{ fontSize: m.metaLabelPx }} className="font-display font-black uppercase tracking-wider leading-none whitespace-nowrap">
                  VS
                </span>
              ) : null}
              {!isScoreOnly && vm.centerSecondary && (
                <span style={{ fontSize: m.metaLabelPx }} className={`font-bold uppercase tracking-wider opacity-85 leading-none whitespace-nowrap ${vm.centerPrimary ? 'mt-0.5' : ''}`}>
                  {vm.centerSecondary}
                </span>
              )}
            </div>

            {/* Right Team Pill */}
            <div className="flex items-center gap-2.5 min-w-0 justify-end">
              <span
                key={`fp-b-${pulseKey}`}
                style={{
                  background: theme.scorePillBg,
                  color: theme.scorePillText,
                  fontSize: m.scoreFontPx,
                  paddingLeft: m.scorePillPadX,
                  paddingRight: m.scorePillPadX,
                  paddingTop: Math.max(4, Math.round(m.scorePillPadY * 0.7)),
                  paddingBottom: Math.max(4, Math.round(m.scorePillPadY * 0.7)),
                }}
                className="obs-score-pop rounded-full font-mono tabular-nums font-extrabold leading-none shrink-0 border border-white/15"
              >
                {vm.secondaryScore}
              </span>
              <div className="min-w-0 flex-1 text-right">
                <span
                  style={{ fontSize: m.teamNameFontPx }}
                  className="font-display font-extrabold uppercase tracking-wide truncate block leading-none"
                >
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono font-semibold truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
                {!vm.isCricket && vm.secondaryServing && (
                  <span className="text-[9px] font-mono font-bold text-amber-400 uppercase block">SERVING</span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
            </div>
          </div>

          {config.showLiveIndicator && !isScoreOnly && (
            <div className="shrink-0">
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                fontPx={m.pillFontPx}
                padX={m.pillPadX}
                padY={m.pillPadY}
              />
            </div>
          )}
        </div>

        {/* Floating Sub Capsule */}
        {config.mode === 'full' && (
          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, color: theme.secondaryText }}
            className="rounded-full border px-5 shadow-lg backdrop-blur-md max-w-[92%]"
          />
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 3: ESPORTS CHAMFER HUD — sharp diagonal polygons + neon rim
  // -----------------------------------------------------------------------
  if (styleId === 'esports_angular') {
    const chamferClip = 'polygon(14px 0%, calc(100% - 14px) 0%, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0% calc(100% - 14px), 0% 14px)';
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col gap-1`}>
        <div
          style={{
            background: theme.barBg,
            color: theme.primaryText,
            clipPath: chamferClip,
            borderTop: `2px solid ${theme.accentPrimary}`,
            borderBottom: `2px solid ${theme.accentSecondary}`,
          }}
          className="w-full flex flex-col shadow-[0_0_32px_rgba(124,58,237,0.35)]"
        >
          <div
            style={{
              paddingLeft: m.stripPadX * 1.2,
              paddingRight: m.stripPadX * 1.2,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
              gap: m.sectionGapPx,
            }}
            className="flex items-center justify-between min-w-0"
          >
            <div
              style={{ gap: m.sectionGapPx }}
              className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
            >
              {/* Team A Angular Wing */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  style={{
                    background: vm.primaryAccent,
                    transform: 'skewX(-14deg)',
                  }}
                  className="w-2.5 h-8 shrink-0"
                />
                <ObsTeamBadge
                  logoUrl={vm.primaryLogo}
                  shortName={vm.primaryShort}
                  accentColor={vm.primaryAccent}
                  sizePx={m.logoMdPx}
                  showLogo={config.showTeamLogos}
                />
                <div className="min-w-0 flex-1">
                  <span
                    style={{ fontSize: m.teamNameFontPx }}
                    className="font-display font-black uppercase tracking-wider block truncate leading-none"
                  >
                    {teamADisplay}
                  </span>
                  {!isScoreOnly && (
                    <span style={{ color: theme.mutedText, fontSize: m.metaLabelPx }} className="font-mono uppercase block mt-0.5 truncate">
                      {vm.isCricket && vm.leftPlayerLine ? vm.leftPlayerLine : vm.primarySub}
                    </span>
                  )}
                </div>
                <div
                  key={`ea-a-${pulseKey}`}
                  style={{
                    background: theme.scorePillBg,
                    color: theme.scorePillText,
                    fontSize: m.scoreFontPx,
                    transform: 'skewX(-12deg)',
                    paddingLeft: m.scorePillPadX * 1.1,
                    paddingRight: m.scorePillPadX * 1.1,
                    paddingTop: m.scorePillPadY,
                    paddingBottom: m.scorePillPadY,
                  }}
                  className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0 border-l-4 border-amber-400"
                >
                  <span style={{ transform: 'skewX(12deg)' }} className="inline-block">
                    {vm.primaryScore}
                  </span>
                </div>
              </div>

              {/* Hexagonal Center Core */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
                  clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
                  paddingLeft: m.stripPadX * 1.25,
                  paddingRight: m.stripPadX * 1.25,
                  paddingTop: m.stripPadY * 0.75,
                  paddingBottom: m.stripPadY * 0.75,
                }}
                className="flex flex-col items-center justify-center text-white shrink-0"
              >
                <span style={{ fontSize: m.metaLabelPx }} className="font-mono font-bold uppercase tracking-widest text-purple-200 leading-none">
                  {vm.sportLabel}
                </span>
                {vm.centerPrimary && (
                  <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black leading-tight whitespace-nowrap">
                    {vm.centerPrimary}
                  </span>
                )}
              </div>

              {/* Team B Angular Wing */}
              <div className="flex items-center gap-2.5 min-w-0 justify-end">
                <div
                  key={`ea-b-${pulseKey}`}
                  style={{
                    background: theme.scorePillBg,
                    color: theme.scorePillText,
                    fontSize: m.scoreFontPx,
                    transform: 'skewX(-12deg)',
                    paddingLeft: m.scorePillPadX * 1.1,
                    paddingRight: m.scorePillPadX * 1.1,
                    paddingTop: m.scorePillPadY,
                    paddingBottom: m.scorePillPadY,
                  }}
                  className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0 border-r-4 border-sky-400"
                >
                  <span style={{ transform: 'skewX(12deg)' }} className="inline-block">
                    {vm.secondaryScore}
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <span
                    style={{ fontSize: m.teamNameFontPx }}
                    className="font-display font-black uppercase tracking-wider block truncate leading-none"
                  >
                    {teamBDisplay}
                  </span>
                  {!isScoreOnly && (
                    <span style={{ color: theme.mutedText, fontSize: m.metaLabelPx }} className="font-mono uppercase block mt-0.5 truncate">
                      {vm.isCricket && vm.rightPlayerLine ? vm.rightPlayerLine : vm.secondarySub}
                    </span>
                  )}
                </div>
                <ObsTeamBadge
                  logoUrl={vm.secondaryLogo}
                  shortName={vm.secondaryShort}
                  accentColor={vm.secondaryAccent}
                  sizePx={m.logoMdPx}
                  showLogo={config.showTeamLogos}
                />
                <div
                  style={{
                    background: vm.secondaryAccent,
                    transform: 'skewX(-14deg)',
                  }}
                  className="w-2.5 h-8 shrink-0"
                />
              </div>
            </div>

            {config.showLiveIndicator && (
              <div className="shrink-0">
                <ObsLiveStatusPill
                  label={vm.statusPillLabel}
                  isLive={vm.showLiveDot}
                  variant={vm.statusPillVariant}
                  fontPx={m.pillFontPx}
                  padX={m.pillPadX}
                  padY={m.pillPadY}
                />
              </div>
            )}
          </div>

          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{ background: 'rgba(15, 10, 35, 0.92)', borderColor: 'rgba(167, 139, 250, 0.25)', color: theme.secondaryText }}
            className="border-t"
          />
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 4: STACKED FROSTED GLASS — 2 floating glassmorphic layers
  // -----------------------------------------------------------------------
  if (styleId === 'stacked_glass') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col gap-2`}>
        {/* Glass Tier 1 */}
        <div
          style={{
            background: theme.isLight ? 'rgba(255,255,255,0.78)' : 'rgba(15, 23, 42, 0.68)',
            borderColor: theme.isLight ? 'rgba(15,23,42,0.18)' : 'rgba(255,255,255,0.22)',
            color: theme.primaryText,
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="w-full flex items-center justify-between rounded-2xl border backdrop-blur-2xl shadow-[0_16px_42px_rgba(0,0,0,0.45)]"
        >
          {!isScoreOnly && !isPortrait && (
            <div className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 shrink-0">
              <span style={{ color: theme.accentPrimary, fontSize: m.brandFontPx }} className="font-display font-black uppercase tracking-widest">
                MAIDAN<span className="opacity-75">LIVE</span>
              </span>
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 justify-between px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <ObsTeamBadge
                  logoUrl={vm.primaryLogo}
                  shortName={vm.primaryShort}
                  accentColor={vm.primaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
                <div className="min-w-0">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                    {teamADisplay}
                  </span>
                  {!isScoreOnly && vm.leftPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono font-semibold truncate block mt-0.5 leading-tight">
                      {vm.leftPlayerLine}
                    </span>
                  )}
                </div>
              </div>
              <span
                key={`sg-a-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx, color: theme.accentPrimary }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0"
              >
                {vm.primaryScore}
              </span>
            </div>

            <div className="flex flex-col items-center px-3 py-1 rounded-xl bg-white/10 border border-white/15 shrink-0">
              {vm.centerPrimary ? (
                <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-bold leading-none">
                  {vm.centerPrimary}
                </span>
              ) : !(!isScoreOnly && vm.centerSecondary) ? (
                <span style={{ fontSize: m.metaLabelPx }} className="font-display font-black uppercase leading-none">
                  VS
                </span>
              ) : null}
              {!isScoreOnly && vm.centerSecondary && (
                <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className={`font-bold uppercase leading-none ${vm.centerPrimary ? 'mt-0.5' : ''}`}>
                  {vm.centerSecondary}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 min-w-0 justify-between px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              <span
                key={`sg-b-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx, color: theme.accentSecondary }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0"
              >
                {vm.secondaryScore}
              </span>
              <div className="flex items-center gap-2 min-w-0 justify-end text-right">
                <div className="min-w-0">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                    {teamBDisplay}
                  </span>
                  {!isScoreOnly && vm.rightPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono font-semibold truncate block mt-0.5 leading-tight">
                      {vm.rightPlayerLine}
                    </span>
                  )}
                </div>
                <ObsTeamBadge
                  logoUrl={vm.secondaryLogo}
                  shortName={vm.secondaryShort}
                  accentColor={vm.secondaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
              </div>
            </div>
          </div>

          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={vm.statusPillLabel}
              isLive={vm.showLiveDot}
              variant={vm.statusPillVariant}
              fontPx={m.pillFontPx}
              padX={m.pillPadX}
              padY={m.pillPadY}
            />
          )}
        </div>

        {/* Detached Glass Tier 2 */}
        {config.mode === 'full' && (
          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{
              background: theme.isLight ? 'rgba(248,250,252,0.82)' : 'rgba(15, 23, 42, 0.58)',
              borderColor: theme.isLight ? 'rgba(15,23,42,0.14)' : 'rgba(255,255,255,0.16)',
              color: theme.secondaryText,
            }}
            className="w-full rounded-xl border backdrop-blur-xl shadow-lg"
          />
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 5: FLAT TICKER STRIP — sharp ESPN-style full-bleed color tabs
  // -----------------------------------------------------------------------
  if (styleId === 'espn_ticker') {
    return wrapWithKabaddi(
      <div
        style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-none border-y-2 shadow-2xl overflow-hidden`}
      >
        <div className="flex items-stretch min-w-0">
          {!isScoreOnly && (
            <ObsBrandMark
              theme={theme}
              compact
              iconPx={m.brandIconPx}
              fontPx={m.brandFontPx}
              padX={m.brandPadX}
              padY={m.brandPadY}
            />
          )}

          <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch">
            {/* Team A Solid Color Block */}
            <div
              style={{
                background: vm.primaryAccent,
                color: '#FFFFFF',
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
                paddingTop: m.stripPadY,
                paddingBottom: m.stripPadY,
              }}
              className="flex items-center justify-between gap-2 min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ObsTeamBadge
                  logoUrl={vm.primaryLogo}
                  shortName={vm.primaryShort}
                  accentColor={vm.primaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
                <div className="min-w-0">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase tracking-tight truncate block leading-none">
                    {teamADisplay}
                  </span>
                  {!isScoreOnly && vm.leftPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-white/90 truncate block mt-0.5 leading-tight">
                      {vm.leftPlayerLine}
                    </span>
                  )}
                </div>
              </div>
              <span
                key={`et-a-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx }}
                className="obs-score-pop font-mono tabular-nums font-black shrink-0 leading-none"
              >
                {vm.primaryScore}
              </span>
            </div>

            {/* Center Flat Divider Cell */}
            <div
              style={{
                background: theme.isLight ? '#0F172A' : '#020617',
                color: '#F8FAFC',
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
              }}
              className="flex flex-col items-center justify-center border-x border-white/20 shrink-0"
            >
              {vm.centerPrimary ? (
                <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black leading-none whitespace-nowrap">
                  {vm.centerPrimary}
                </span>
              ) : !(!isScoreOnly && vm.centerSecondary) ? (
                <span style={{ fontSize: m.metaLabelPx }} className="font-display font-black uppercase tracking-wider leading-none whitespace-nowrap">
                  VS
                </span>
              ) : null}
              {!isScoreOnly && vm.centerSecondary && (
                <span style={{ fontSize: m.metaLabelPx }} className={`font-bold uppercase tracking-widest text-amber-400 leading-none ${vm.centerPrimary ? 'mt-1' : ''}`}>
                  {vm.centerSecondary}
                </span>
              )}
            </div>

            {/* Team B Solid Color Block */}
            <div
              style={{
                background: vm.secondaryAccent,
                color: '#FFFFFF',
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
                paddingTop: m.stripPadY,
                paddingBottom: m.stripPadY,
              }}
              className="flex items-center justify-between gap-2 min-w-0"
            >
              <span
                key={`et-b-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx }}
                className="obs-score-pop font-mono tabular-nums font-black shrink-0 leading-none"
              >
                {vm.secondaryScore}
              </span>
              <div className="flex items-center gap-2 min-w-0 justify-end text-right">
                <div className="min-w-0">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase tracking-tight truncate block leading-none">
                    {teamBDisplay}
                  </span>
                  {!isScoreOnly && vm.rightPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-white/90 truncate block mt-0.5 leading-tight">
                      {vm.rightPlayerLine}
                    </span>
                  )}
                </div>
                <ObsTeamBadge
                  logoUrl={vm.secondaryLogo}
                  shortName={vm.secondaryShort}
                  accentColor={vm.secondaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
              </div>
            </div>
          </div>

          {config.showLiveIndicator && (
            <div className="flex items-center px-2.5 bg-slate-950 border-l border-white/15 shrink-0">
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                fontPx={m.pillFontPx}
                padX={m.pillPadX}
                padY={m.pillPadY}
              />
            </div>
          )}
        </div>

        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, color: theme.secondaryText }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 6: CENTER VS TOWER — elevated central pedestal + symmetric wings
  // -----------------------------------------------------------------------
  if (styleId === 'split_versus_card') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col items-center`}>
        <div className="w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-0">
          {/* Left Wing */}
          <div
            style={{
              background: theme.barBg,
              borderColor: vm.primaryAccent,
              color: theme.primaryText,
              paddingLeft: m.stripPadX,
              paddingRight: m.stripPadX,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="min-w-0 flex items-center justify-between gap-2 rounded-l-xl border-b-4 border-l border-t shadow-xl"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase block truncate leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && (
                  <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono block mt-0.5 truncate">
                    {vm.isCricket && vm.leftPlayerLine ? vm.leftPlayerLine : vm.primarySub}
                  </span>
                )}
              </div>
            </div>
            <span
              key={`svc-a-${pulseKey}`}
              style={{ fontSize: m.scoreFontPx, color: theme.primaryText }}
              className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0"
            >
              {vm.primaryScore}
            </span>
          </div>

          {/* Elevated Central Tower */}
          <div
            style={{
              background: theme.brandBg,
              color: theme.brandText,
              paddingLeft: m.stripPadX * 1.15,
              paddingRight: m.stripPadX * 1.15,
              paddingTop: m.stripPadY * 1.35,
              paddingBottom: m.stripPadY * 1.1,
            }}
            className="shrink-0 rounded-t-2xl border-2 border-white/25 shadow-[0_-8px_28px_rgba(0,0,0,0.65)] flex flex-col items-center justify-center z-10 -mx-1"
          >
            {config.showLiveIndicator && (
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                fontPx={Math.max(8, m.pillFontPx - 1)}
                padX={Math.max(5, m.pillPadX - 2)}
                padY={Math.max(2, m.pillPadY - 1)}
              />
            )}
            {vm.centerPrimary && (
              <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black mt-1 leading-none whitespace-nowrap">
                {vm.centerPrimary}
              </span>
            )}
            {(vm.centerSecondary || !vm.centerPrimary) && (
              <span style={{ fontSize: m.metaLabelPx }} className="font-bold uppercase tracking-widest opacity-85 mt-0.5 leading-none">
                {vm.centerSecondary || 'VS'}
              </span>
            )}
          </div>

          {/* Right Wing */}
          <div
            style={{
              background: theme.barBg,
              borderColor: vm.secondaryAccent,
              color: theme.primaryText,
              paddingLeft: m.stripPadX,
              paddingRight: m.stripPadX,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="min-w-0 flex items-center justify-between gap-2 rounded-r-xl border-b-4 border-r border-t shadow-xl"
          >
            <span
              key={`svc-b-${pulseKey}`}
              style={{ fontSize: m.scoreFontPx, color: theme.primaryText }}
              className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0"
            >
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 justify-end text-right">
              <div className="min-w-0">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase block truncate leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && (
                  <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono block mt-0.5 truncate">
                    {vm.isCricket && vm.rightPlayerLine ? vm.rightPlayerLine : vm.secondarySub}
                  </span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
            </div>
          </div>
        </div>

        {config.mode === 'full' && (
          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, color: theme.secondaryText }}
            className="w-[94%] rounded-b-xl border-x border-b shadow-lg"
          />
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 7: MINIMAL CORNER BUG — compact TV corner bug footprint
  // -----------------------------------------------------------------------
  if (styleId === 'minimal_corner_bug') {
    const bugWidth = isScoreOnly ? Math.round(350 * m.overallScale) : Math.round(480 * m.overallScale);
    return wrapWithKabaddi(
      <div
        style={{
          width: isPortrait ? '100%' : Math.min(1150, Math.max(220, bugWidth)),
          background: theme.barBg,
          borderColor: theme.barBorder,
          color: theme.primaryText,
        }}
        className="mx-auto rounded-xl border shadow-[0_14px_38px_rgba(0,0,0,0.68)] overflow-hidden backdrop-blur-md"
      >
        {/* Top micro header */}
        <div
          style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, fontSize: m.metaLabelPx }}
          className="px-3 py-1 border-b flex items-center justify-between gap-2"
        >
          <span style={{ color: theme.accentPrimary }} className="font-display font-black uppercase tracking-wider truncate">
            {vm.tournamentName || vm.sportLabel}
          </span>
          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={vm.statusPillLabel}
              isLive={vm.showLiveDot}
              variant={vm.statusPillVariant}
              compact
              fontPx={Math.max(8, m.pillFontPx - 1)}
              padX={6}
              padY={2}
            />
          )}
        </div>

        {/* Stacked 2-team bug */}
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span style={{ background: vm.primaryAccent }} className="w-1 h-5 rounded-full shrink-0" />
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span
                key={`mcb-a-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx, color: theme.primaryText }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none"
              >
                {vm.primaryScore}
              </span>
              <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono">
                {vm.isCricket ? vm.centerPrimary : vm.primarySub}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span style={{ background: vm.secondaryAccent }} className="w-1 h-5 rounded-full shrink-0" />
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span
                key={`mcb-b-${pulseKey}`}
                style={{ fontSize: Math.round(m.scoreFontPx * 0.86), color: theme.secondaryText }}
                className="obs-score-pop font-mono tabular-nums font-bold leading-none"
              >
                {vm.secondaryScore}
              </span>
              {!vm.isCricket && vm.centerPrimary && (
                <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono">
                  {vm.centerPrimary}
                </span>
              )}
            </div>
          </div>
        </div>

        {config.mode === 'full' && (vm.leftStatsText || vm.rightStatsText) ? (
          <div
            style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, fontSize: m.metaLabelPx }}
            className="px-3 py-1 border-t flex items-center justify-between gap-2 font-mono tabular-nums"
          >
            <span className="truncate">{vm.leftStatsText}</span>
            <span className="truncate text-right">{vm.rightStatsText}</span>
          </div>
        ) : config.mode === 'full' && (vm.situationBanner || vm.recentBalls.length > 0 || (!vm.isCricket && vm.battersText)) ? (
          <div
            style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, fontSize: m.metaLabelPx }}
            className="px-3 py-1 border-t flex items-center justify-between gap-2"
          >
            <span style={{ color: theme.chaseHighlightText }} className="font-bold uppercase truncate">
              {vm.situationBanner || (!vm.isCricket ? vm.battersText || vm.bowlerText : '')}
            </span>
            <BallChips balls={vm.recentBalls} chipPx={Math.max(14, m.ballChipPx - 3)} fontPx={Math.max(8, m.ballChipFontPx - 1)} isLight={theme.isLight} />
          </div>
        ) : null}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 8: CHAMPIONSHIP PLAQUE — gold/accent crown + championship deck
  // -----------------------------------------------------------------------
  if (styleId === 'championship_marquee') {
    return wrapWithKabaddi(
      <div
        style={{
          background: theme.barBg,
          borderColor: 'rgba(251, 191, 36, 0.45)',
          color: theme.primaryText,
        }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-xl border-2 shadow-[0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden`}
      >
        {/* Top Championship Crown */}
        {!isScoreOnly && (
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(217,119,6,0.92) 0%, rgba(245,158,11,0.95) 50%, rgba(217,119,6,0.92) 100%)',
              color: '#0F172A',
              fontSize: m.metaLabelPx,
            }}
            className="px-4 py-1 flex items-center justify-between gap-2 font-display font-black uppercase tracking-[0.14em]"
          >
            <span className="inline-flex items-center gap-1.5 truncate">
              <Trophy className="w-3 h-3 shrink-0" />
              {vm.tournamentName || `MAIDANLIVE ${vm.sportLabel} CHAMPIONSHIP`}
            </span>
            {vm.centerPrimary && (
              <span className="font-mono font-extrabold shrink-0">{vm.centerPrimary}</span>
            )}
          </div>
        )}

        {/* Main Symmetrical Plaque */}
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="flex items-center justify-between min-w-0"
        >
          <div
            style={{ gap: m.sectionGapPx }}
            className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && (
                  <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono block mt-0.5 truncate">
                    {vm.isCricket && vm.leftPlayerLine ? vm.leftPlayerLine : vm.primarySub}
                  </span>
                )}
              </div>
            </div>

            <div
              key={`cm-${pulseKey}`}
              style={{
                background: theme.scorePillBg,
                color: theme.scorePillText,
                borderColor: 'rgba(251, 191, 36, 0.45)',
                paddingLeft: m.scorePillPadX * 1.25,
                paddingRight: m.scorePillPadX * 1.25,
                paddingTop: m.scorePillPadY,
                paddingBottom: m.scorePillPadY,
              }}
              className="obs-score-pop rounded-lg border flex items-center gap-3 font-mono tabular-nums font-black shrink-0"
            >
              <span style={{ fontSize: m.scoreFontPx }} className="leading-none">{vm.primaryScore}</span>
              <span className="text-amber-400 text-xs font-display font-black">VS</span>
              <span style={{ fontSize: m.scoreFontPx }} className="leading-none">{vm.secondaryScore}</span>
            </div>

            <div className="flex items-center gap-2.5 min-w-0 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && (
                  <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono block mt-0.5 truncate">
                    {vm.isCricket && vm.rightPlayerLine ? vm.rightPlayerLine : vm.secondarySub}
                  </span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
            </div>
          </div>
          {config.showLiveIndicator && (
            <div className="shrink-0">
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                fontPx={m.pillFontPx}
                padX={m.pillPadX}
                padY={m.pillPadY}
              />
            </div>
          )}
        </div>

        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: theme.subStripBg, borderColor: 'rgba(251,191,36,0.22)', color: theme.secondaryText }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 9: STACKED TEAM TABLE — 2-row team matrix + right telemetry wing
  // -----------------------------------------------------------------------
  if (styleId === 'vertical_hud_dock') {
    return wrapWithKabaddi(
      <div
        style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} items-stretch rounded-xl border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md`}
      >
        {!isScoreOnly && !isPortrait && (
          <ObsBrandMark
            theme={theme}
            compact
            iconPx={m.brandIconPx}
            fontPx={m.brandFontPx}
            padX={m.brandPadX}
            padY={m.brandPadY}
          />
        )}

        {/* Left 2-Row Score Table */}
        <div className="flex-1 min-w-0 divide-y divide-white/10">
          <div
            style={{ paddingLeft: m.stripPadX, paddingRight: m.stripPadX, paddingTop: Math.max(4, m.stripPadY * 0.6), paddingBottom: Math.max(4, m.stripPadY * 0.6) }}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span style={{ background: vm.primaryAccent }} className="w-1.5 h-5 rounded-sm shrink-0" />
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
              {vm.primaryServing && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <span
                key={`vhd-a-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx, color: theme.accentPrimary }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none"
              >
                {vm.primaryScore}
              </span>
              {!isScoreOnly && (
                <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono">
                  {vm.primarySub}
                </span>
              )}
            </div>
          </div>

          <div
            style={{ paddingLeft: m.stripPadX, paddingRight: m.stripPadX, paddingTop: Math.max(4, m.stripPadY * 0.6), paddingBottom: Math.max(4, m.stripPadY * 0.6) }}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span style={{ background: vm.secondaryAccent }} className="w-1.5 h-5 rounded-sm shrink-0" />
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              {vm.secondaryServing && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
            </div>
            <div className="flex items-baseline gap-2 shrink-0">
              <span
                key={`vhd-b-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx, color: theme.primaryText }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none"
              >
                {vm.secondaryScore}
              </span>
              {!isScoreOnly && (
                <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-mono">
                  {vm.secondarySub}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Telemetry Wing */}
        {!isScoreOnly && (
          <div
            style={{
              background: theme.subStripBg,
              borderColor: theme.divider,
              paddingLeft: m.stripPadX,
              paddingRight: m.stripPadX,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="border-l flex flex-col justify-center gap-1 min-w-[160px] max-w-[44%] shrink-0"
          >
            {(vm.centerPrimary || config.showLiveIndicator) && (
              <div className="flex items-center justify-between gap-2">
                {vm.centerPrimary ? (
                  <span style={{ fontSize: m.metaFontPx, color: theme.accentPrimary }} className="font-mono font-extrabold whitespace-nowrap">
                    {vm.centerPrimary}
                  </span>
                ) : (
                  <span style={{ fontSize: m.metaLabelPx, color: theme.mutedText }} className="font-bold uppercase">
                    {vm.centerSecondary || vm.sportLabel}
                  </span>
                )}
                {config.showLiveIndicator && (
                  <ObsLiveStatusPill
                    label={vm.statusPillLabel}
                    isLive={vm.showLiveDot}
                    variant={vm.statusPillVariant}
                    compact
                    fontPx={m.pillFontPx}
                    padX={m.pillPadX}
                    padY={m.pillPadY}
                  />
                )}
              </div>
            )}
            {config.mode === 'full' && (vm.leftStatsText || vm.rightStatsText) ? (
              <div style={{ fontSize: m.metaLabelPx, color: theme.secondaryText }} className="flex items-center justify-between gap-2 font-mono tabular-nums">
                <span className="truncate">{vm.leftStatsText}</span>
                <span className="truncate text-right">{vm.rightStatsText}</span>
              </div>
            ) : config.mode === 'full' && (vm.situationBanner || (!vm.isCricket && vm.battersText) || vm.statChips.length > 0) ? (
              <p style={{ fontSize: m.metaLabelPx, color: theme.secondaryText }} className="font-mono truncate">
                {vm.situationBanner || (!vm.isCricket ? vm.battersText : '') || vm.statChips.map((c) => `${c.label} ${c.value}`).join(' · ')}
              </p>
            ) : null}
            {config.mode === 'full' && vm.recentBalls.length > 0 && (
              <BallChips balls={vm.recentBalls} chipPx={Math.max(15, m.ballChipPx - 2)} fontPx={Math.max(8, m.ballChipFontPx - 1)} isLight={theme.isLight} />
            )}
          </div>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 10: MODULAR BENTO PODS — detached floating multi-capsule cluster
  // -----------------------------------------------------------------------
  if (styleId === 'dynamic_capsule') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col items-center gap-1.5`}>
        <div className="w-full flex items-center gap-2">
          {/* Pod 1: Brand + Live Status */}
          {!isScoreOnly && (
            <div
              style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText, padding: `${Math.round(m.stripPadY * 0.7)}px ${m.stripPadX}px` }}
              className="rounded-xl border shadow-lg flex items-center gap-2 shrink-0"
            >
              <span style={{ color: theme.accentPrimary, fontSize: m.brandFontPx }} className="font-display font-black uppercase tracking-wider">
                ML
              </span>
              {config.showLiveIndicator && (
                <ObsLiveStatusPill
                  label={vm.statusPillLabel}
                  isLive={vm.showLiveDot}
                  variant={vm.statusPillVariant}
                  compact
                  fontPx={m.pillFontPx}
                  padX={m.pillPadX}
                  padY={m.pillPadY}
                />
              )}
            </div>
          )}

          <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            {/* Pod 2: Primary Team */}
            <div
              style={{
                background: theme.barBg,
                borderColor: vm.primaryAccent,
                color: theme.primaryText,
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
                paddingTop: Math.round(m.stripPadY * 0.8),
                paddingBottom: Math.round(m.stripPadY * 0.8),
              }}
              className="rounded-xl border-b-2 border shadow-lg flex items-center justify-between gap-2.5 min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ObsTeamBadge
                  logoUrl={vm.primaryLogo}
                  shortName={vm.primaryShort}
                  accentColor={vm.primaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
                <div className="min-w-0">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                    {teamADisplay}
                  </span>
                  {!isScoreOnly && vm.leftPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono font-semibold truncate block mt-0.5 leading-tight">
                      {vm.leftPlayerLine}
                    </span>
                  )}
                </div>
              </div>
              <span
                key={`dc-a-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx, color: theme.accentPrimary }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0"
              >
                {vm.primaryScore}
              </span>
            </div>

            {/* Pod 3: Center Clock / Match Info */}
            {(vm.centerPrimary || (!isScoreOnly && vm.centerSecondary)) ? (
              <div
                style={{
                  background: theme.brandBg,
                  color: theme.brandText,
                  paddingLeft: m.stripPadX,
                  paddingRight: m.stripPadX,
                  paddingTop: Math.round(m.stripPadY * 0.8),
                  paddingBottom: Math.round(m.stripPadY * 0.8),
                }}
                className="rounded-xl shadow-lg flex flex-col items-center justify-center shrink-0 border border-white/20"
              >
                {vm.centerPrimary && (
                  <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black leading-none whitespace-nowrap">
                    {vm.centerPrimary}
                  </span>
                )}
                {!isScoreOnly && vm.centerSecondary && (
                  <span style={{ fontSize: m.metaLabelPx }} className={`font-bold uppercase opacity-85 leading-none ${vm.centerPrimary ? 'mt-0.5' : ''}`}>
                    {vm.centerSecondary}
                  </span>
                )}
              </div>
            ) : <span className="w-1 shrink-0" />}

            {/* Pod 4: Secondary Team */}
            <div
              style={{
                background: theme.barBg,
                borderColor: vm.secondaryAccent,
                color: theme.primaryText,
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
                paddingTop: Math.round(m.stripPadY * 0.8),
                paddingBottom: Math.round(m.stripPadY * 0.8),
              }}
              className="rounded-xl border-b-2 border shadow-lg flex items-center justify-between gap-2.5 min-w-0"
            >
              <span
                key={`dc-b-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx }}
                className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0"
              >
                {vm.secondaryScore}
              </span>
              <div className="flex items-center gap-2 min-w-0 justify-end text-right">
                <div className="min-w-0">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                    {teamBDisplay}
                  </span>
                  {!isScoreOnly && vm.rightPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx), color: theme.secondaryText }} className="font-mono font-semibold truncate block mt-0.5 leading-tight">
                      {vm.rightPlayerLine}
                    </span>
                  )}
                </div>
                <ObsTeamBadge
                  logoUrl={vm.secondaryLogo}
                  shortName={vm.secondaryShort}
                  accentColor={vm.secondaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Detached Telemetry Pod */}
        {config.mode === 'full' && (
          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{ background: theme.subStripBg, borderColor: theme.subStripBorder, color: theme.secondaryText }}
            className="rounded-xl border shadow-lg max-w-[96%]"
          />
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 11: T20 NEON RIBBON — vibrant magenta/indigo gradient wing ribbon
  // -----------------------------------------------------------------------
  if (styleId === 'ipl_neon_ribbon') {
    const leftSub = vm.isCricket ? vm.leftPlayerLine : vm.primarySub;
    const rightSub = vm.isCricket ? vm.rightPlayerLine : vm.secondarySub;
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col overflow-hidden rounded-2xl border border-fuchsia-400/50 shadow-[0_0_32px_rgba(217,70,239,0.38)]`}>
        <div
          style={{
            background: 'linear-gradient(90deg, #311042 0%, #1E1B4B 50%, #0F172A 100%)',
            color: '#FFFFFF',
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="flex items-center justify-between min-w-0"
        >
          <div
            style={{ gap: m.sectionGapPx }}
            className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
          >
            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <ObsTeamBadge
                  logoUrl={vm.primaryLogo}
                  shortName={vm.primaryShort}
                  accentColor={vm.primaryAccent}
                  sizePx={m.logoMdPx}
                  showLogo={config.showTeamLogos}
                />
                <div className="min-w-0 flex-1">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase tracking-wide truncate block leading-none">
                    {teamADisplay}
                  </span>
                  {!isScoreOnly && leftSub && (
                    <span style={{ fontSize: m.metaLabelPx }} className="font-mono text-fuchsia-200/90 block mt-0.5 truncate">
                      {leftSub}
                    </span>
                  )}
                </div>
              </div>
              <span
                key={`inr-a-${pulseKey}`}
                style={{
                  fontSize: m.scoreFontPx,
                  background: 'linear-gradient(135deg, #EC4899 0%, #9333EA 100%)',
                  paddingLeft: m.scorePillPadX,
                  paddingRight: m.scorePillPadX,
                  paddingTop: m.scorePillPadY,
                  paddingBottom: m.scorePillPadY,
                }}
                className="obs-score-pop rounded-lg font-mono tabular-nums font-black text-white shadow-[0_0_16px_rgba(236,72,153,0.55)] leading-none shrink-0"
              >
                {vm.primaryScore}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-3 py-1 rounded-xl bg-black/45 border border-fuchsia-400/35 shrink-0">
              {vm.centerPrimary ? (
                <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black text-amber-300 leading-none whitespace-nowrap">
                  {vm.centerPrimary}
                </span>
              ) : (
                <span style={{ fontSize: m.metaLabelPx }} className="font-display font-black uppercase text-fuchsia-300 leading-none">
                  {vm.sportLabel}
                </span>
              )}
              {!isScoreOnly && vm.centerSecondary && (
                <span style={{ fontSize: m.metaLabelPx }} className="font-bold uppercase tracking-wider text-slate-200 mt-0.5 leading-none whitespace-nowrap">
                  {vm.centerSecondary}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2.5 min-w-0">
              <span
                key={`inr-b-${pulseKey}`}
                style={{
                  fontSize: m.scoreFontPx,
                  background: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)',
                  paddingLeft: m.scorePillPadX,
                  paddingRight: m.scorePillPadX,
                  paddingTop: m.scorePillPadY,
                  paddingBottom: m.scorePillPadY,
                }}
                className="obs-score-pop rounded-lg font-mono tabular-nums font-black text-white shadow-[0_0_16px_rgba(6,182,212,0.45)] leading-none shrink-0"
              >
                {vm.secondaryScore}
              </span>
              <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
                <div className="min-w-0 flex-1 text-right">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase tracking-wide truncate block leading-none">
                    {teamBDisplay}
                  </span>
                  {!isScoreOnly && rightSub && (
                    <span style={{ fontSize: m.metaLabelPx }} className="font-mono text-cyan-200/90 block mt-0.5 truncate">
                      {rightSub}
                    </span>
                  )}
                </div>
                <ObsTeamBadge
                  logoUrl={vm.secondaryLogo}
                  shortName={vm.secondaryShort}
                  accentColor={vm.secondaryAccent}
                  sizePx={m.logoMdPx}
                  showLogo={config.showTeamLogos}
                />
              </div>
            </div>
          </div>

          {config.showLiveIndicator && (
            <div className="shrink-0">
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                fontPx={m.pillFontPx}
                padX={m.pillPadX}
                padY={m.pillPadY}
              />
            </div>
          )}
        </div>

        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(15, 10, 32, 0.94)', borderColor: 'rgba(217, 70, 239, 0.35)', color: '#E2E8F0' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 12: WORLD CUP CREST — angled royal wings + championship medallion
  // -----------------------------------------------------------------------
  if (styleId === 'world_cup_crest') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col items-center`}>
        <div className="w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center relative">
          <div
            style={{
              background: 'linear-gradient(90deg, #0B1E45 0%, #16377A 100%)',
              borderColor: '#38BDF8',
              paddingLeft: m.stripPadX,
              paddingRight: m.stripPadX * 1.4,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="min-w-0 flex items-center justify-between gap-2 rounded-l-2xl border-y-2 border-l-2 text-white shadow-xl"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-sky-200/90 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`wcc-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-amber-300 shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div
            style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
              paddingLeft: m.stripPadX,
              paddingRight: m.stripPadX,
              paddingTop: m.stripPadY * 1.15,
              paddingBottom: m.stripPadY * 1.15,
            }}
            className="z-10 -mx-3 rounded-full border-2 border-white shadow-[0_0_24px_rgba(245,158,11,0.65)] flex flex-col items-center justify-center text-slate-950 shrink-0 min-w-[78px]"
          >
            <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black leading-none whitespace-nowrap">
              {vm.centerPrimary || 'VS'}
            </span>
            {!isScoreOnly && vm.centerSecondary && (
              <span style={{ fontSize: m.metaLabelPx }} className="font-extrabold uppercase leading-none mt-0.5 whitespace-nowrap">
                {vm.centerSecondary}
              </span>
            )}
          </div>

          <div
            style={{
              background: 'linear-gradient(90deg, #16377A 0%, #0B1E45 100%)',
              borderColor: '#38BDF8',
              paddingLeft: m.stripPadX * 1.4,
              paddingRight: m.stripPadX,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="min-w-0 flex items-center justify-between gap-2 rounded-r-2xl border-y-2 border-r-2 text-white shadow-xl"
          >
            <span key={`wcc-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-amber-300 shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-sky-200/90 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
            </div>
          </div>
        </div>

        {config.mode === 'full' && (
          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{ background: '#07122B', borderColor: '#38BDF8', color: '#E0F2FE' }}
            className="w-[92%] rounded-b-xl border-x border-b shadow-lg"
          />
        )}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 13: PREMIER MATCHDAY BAR — European top-flight crisp divider bar
  // -----------------------------------------------------------------------
  if (styleId === 'premier_league_bar') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-lg overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.68)] border border-white/20`}>
        <div className="flex items-stretch min-w-0">
          {!isScoreOnly && vm.centerPrimary && (
            <div
              style={{ paddingLeft: m.stripPadX, paddingRight: m.stripPadX }}
              className="bg-[#38003C] text-[#00FF85] flex items-center justify-center font-mono tabular-nums font-black shrink-0 border-r border-white/15"
            >
              <span style={{ fontSize: m.metaFontPx }}>{vm.centerPrimary}</span>
            </div>
          )}

          <div className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch">
            <div
              style={{
                background: '#FFFFFF',
                color: '#1E002B',
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
                paddingTop: m.stripPadY,
                paddingBottom: m.stripPadY,
              }}
              className="min-w-0 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span style={{ background: vm.primaryAccent }} className="w-1.5 h-6 rounded-full shrink-0" />
                <ObsTeamBadge
                  logoUrl={vm.primaryLogo}
                  shortName={vm.primaryShort}
                  accentColor={vm.primaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
                <div className="min-w-0 flex-1">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                    {teamADisplay}
                  </span>
                  {!isScoreOnly && vm.leftPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-600 truncate block mt-0.5 leading-tight">
                      {vm.leftPlayerLine}
                    </span>
                  )}
                </div>
              </div>
              <span
                key={`pl-a-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx }}
                className="obs-score-pop font-mono tabular-nums font-black px-2.5 py-0.5 rounded bg-[#38003C] text-white shrink-0 leading-none"
              >
                {vm.primaryScore}
              </span>
            </div>

            <div className="w-px bg-slate-300 shrink-0" />

            <div
              style={{
                background: '#FFFFFF',
                color: '#1E002B',
                paddingLeft: m.stripPadX,
                paddingRight: m.stripPadX,
                paddingTop: m.stripPadY,
                paddingBottom: m.stripPadY,
              }}
              className="min-w-0 flex items-center justify-between gap-2"
            >
              <span
                key={`pl-b-${pulseKey}`}
                style={{ fontSize: m.scoreFontPx }}
                className="obs-score-pop font-mono tabular-nums font-black px-2.5 py-0.5 rounded bg-[#38003C] text-white shrink-0 leading-none"
              >
                {vm.secondaryScore}
              </span>
              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                <div className="min-w-0 flex-1 text-right">
                  <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                    {teamBDisplay}
                  </span>
                  {!isScoreOnly && vm.rightPlayerLine && (
                    <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-600 truncate block mt-0.5 leading-tight">
                      {vm.rightPlayerLine}
                    </span>
                  )}
                </div>
                <ObsTeamBadge
                  logoUrl={vm.secondaryLogo}
                  shortName={vm.secondaryShort}
                  accentColor={vm.secondaryAccent}
                  sizePx={m.logoSmPx}
                  showLogo={config.showTeamLogos}
                />
                <span style={{ background: vm.secondaryAccent }} className="w-1.5 h-6 rounded-full shrink-0" />
              </div>
            </div>
          </div>

          {config.showLiveIndicator && (
            <div className="bg-[#00FF85] px-2.5 flex items-center shrink-0">
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                compact
                fontPx={m.pillFontPx}
                padX={m.pillPadX}
                padY={m.pillPadY}
              />
            </div>
          )}
        </div>

        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: '#38003C', borderColor: 'rgba(0,255,133,0.35)', color: '#F8FAFC' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 14: PRO ARENA RAID DECK — fiery saffron & electric cyan combat plate
  // -----------------------------------------------------------------------
  if (styleId === 'pro_kabaddi_raid') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col overflow-hidden rounded-xl border-2 border-amber-400/70 shadow-[0_14px_38px_rgba(234,88,12,0.42)]`}>
        <div
          style={{
            background: 'linear-gradient(105deg, #7C2D12 0%, #1E293B 50%, #0E7490 100%)',
            color: '#FFFFFF',
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-amber-200/90 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span
              key={`pkr-a-${pulseKey}`}
              style={{ fontSize: m.scoreFontPx, transform: 'skewX(-10deg)' }}
              className="obs-score-pop px-3 py-1 rounded bg-amber-500 text-slate-950 font-mono tabular-nums font-black leading-none shrink-0"
            >
              <span style={{ transform: 'skewX(10deg)' }} className="inline-block">{vm.primaryScore}</span>
            </span>
          </div>

          <div className="px-3 py-1 rounded-lg bg-slate-950/90 border border-amber-400/50 flex flex-col items-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black text-amber-300 leading-none">
              {vm.centerPrimary || vm.sportLabel}
            </span>
            {!isScoreOnly && vm.centerSecondary && (
              <span style={{ fontSize: m.metaLabelPx }} className="font-bold uppercase text-cyan-200 mt-0.5 leading-none">
                {vm.centerSecondary}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span
              key={`pkr-b-${pulseKey}`}
              style={{ fontSize: m.scoreFontPx, transform: 'skewX(-10deg)' }}
              className="obs-score-pop px-3 py-1 rounded bg-cyan-400 text-slate-950 font-mono tabular-nums font-black leading-none shrink-0"
            >
              <span style={{ transform: 'skewX(10deg)' }} className="inline-block">{vm.secondaryScore}</span>
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-cyan-200/90 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: '#0F172A', borderColor: 'rgba(251,191,36,0.35)', color: '#FDE68A' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 15: OLYMPIC GOLD CLEAN — alabaster & metallic gold podium strip
  // -----------------------------------------------------------------------
  if (styleId === 'olympic_gold_clean') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-xl overflow-hidden border-2 border-amber-400/80 shadow-[0_14px_34px_rgba(0,0,0,0.45)] bg-slate-50 text-slate-900`}>
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={vm.primaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-600 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`ogc-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-slate-950 bg-amber-300/60 px-2.5 py-0.5 rounded leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-3 py-1 rounded-md bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 font-mono font-black flex flex-col items-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="leading-none">{vm.centerPrimary || 'LIVE'}</span>
            {!isScoreOnly && vm.centerSecondary && (
              <span style={{ fontSize: m.metaLabelPx }} className="uppercase leading-none mt-0.5">{vm.centerSecondary}</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span key={`ogc-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-slate-950 bg-amber-300/60 px-2.5 py-0.5 rounded leading-none shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-600 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={vm.secondaryAccent}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: '#F1F5F9', borderColor: '#CBD5E1', color: '#1E293B' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 16: CYBER GRID MATRIX — neon scanline HUD with holographic rails
  // -----------------------------------------------------------------------
  if (styleId === 'cyber_grid_matrix') {
    return wrapWithKabaddi(
      <div
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(6,182,212,0.08) 0px, rgba(6,182,212,0.08) 1px, rgba(2,6,23,0.94) 1px, rgba(2,6,23,0.94) 4px)',
          borderColor: '#22D3EE',
        }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-lg border text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.35)] overflow-hidden`}
      >
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-1 h-7 bg-cyan-400 shadow-[0_0_10px_#22D3EE] shrink-0" />
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-mono font-black uppercase tracking-wider truncate text-cyan-100 block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-cyan-200/80 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`cgm-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-cyan-300 shrink-0 leading-none">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-2.5 py-1 border border-cyan-400/50 bg-cyan-950/60 font-mono text-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="font-black text-emerald-300 block leading-none">
              {vm.centerPrimary || 'HUD'}
            </span>
            {!isScoreOnly && vm.centerSecondary && (
              <span style={{ fontSize: m.metaLabelPx }} className="text-cyan-200 uppercase block mt-0.5 leading-none">
                {vm.centerSecondary}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span key={`cgm-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-emerald-300 shrink-0 leading-none">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-mono font-black uppercase tracking-wider truncate text-emerald-100 block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-emerald-200/80 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <span className="w-1 h-7 bg-emerald-400 shadow-[0_0_10px_#34D399] shrink-0" />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(2, 6, 23, 0.96)', borderColor: 'rgba(34,211,238,0.35)', color: '#A5F3FC' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 17: ARCADE VERSUS DECK — retro fight-card wings + gold VS badge
  // -----------------------------------------------------------------------
  if (styleId === 'retro_arcade_pixel') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col bg-slate-950 border-2 border-yellow-400 shadow-[0_6px_0_#B45309] overflow-hidden`}>
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0 bg-rose-600/90 px-2.5 py-1 border border-yellow-300/60">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-mono font-black uppercase text-white truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-yellow-100/90 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`rap-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-yellow-300 shrink-0 leading-none">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-2.5 py-1 bg-yellow-400 text-slate-950 font-mono font-black border-2 border-white shrink-0 text-center">
            <span style={{ fontSize: m.metaFontPx }} className="leading-none block">{vm.centerPrimary || 'VS'}</span>
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0 bg-sky-600/90 px-2.5 py-1 border border-yellow-300/60">
            <span key={`rap-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-yellow-300 shrink-0 leading-none">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-mono font-black uppercase text-white truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-yellow-100/90 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: '#090D16', borderColor: 'rgba(250,204,21,0.45)', color: '#FEF08A' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 18: CHAMPIONS ARMOR SHIELD — metallic gunmetal deck + center seal
  // -----------------------------------------------------------------------
  if (styleId === 'champions_shield') {
    return wrapWithKabaddi(
      <div
        style={{ background: 'linear-gradient(180deg, #334155 0%, #0F172A 100%)', borderColor: '#94A3B8' }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-2xl border-2 text-slate-100 shadow-2xl overflow-hidden`}
      >
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`chs-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-white bg-slate-950/75 border border-slate-500/50 px-3 py-1 rounded-lg leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-gradient-to-b from-slate-200 to-slate-400 text-slate-950 border border-white flex flex-col items-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="font-mono font-black leading-none">{vm.centerPrimary || 'MATCH'}</span>
            {!isScoreOnly && vm.centerSecondary && (
              <span style={{ fontSize: m.metaLabelPx }} className="font-bold uppercase leading-none mt-0.5">{vm.centerSecondary}</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <span key={`chs-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-white bg-slate-950/75 border border-slate-500/50 px-3 py-1 rounded-lg leading-none shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(2, 6, 23, 0.85)', borderColor: 'rgba(148,163,184,0.3)', color: '#E2E8F0' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 19: STEALTH CARBON PRO — matte dark carbon weave + crimson/emerald LED
  // -----------------------------------------------------------------------
  if (styleId === 'stealth_carbon_pro') {
    return wrapWithKabaddi(
      <div
        style={{
          background: 'repeating-linear-gradient(45deg, #111827 0px, #111827 3px, #090D16 3px, #090D16 6px)',
          borderColor: 'rgba(255,255,255,0.18)',
        }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-xl border text-slate-100 shadow-2xl overflow-hidden`}
      >
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#F43F5E] shrink-0" />
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`scp-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-rose-400 shrink-0 leading-none">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-3 py-1 rounded bg-black/70 border border-white/15 font-mono text-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="font-bold text-slate-200 leading-none">{vm.centerPrimary || 'VS'}</span>
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span key={`scp-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-emerald-400 shrink-0 leading-none">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399] shrink-0" />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(5, 7, 12, 0.94)', borderColor: 'rgba(255,255,255,0.12)', color: '#CBD5E1' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 20: SUNSET BROADCAST ARC — warm saffron-to-crimson TV gradient bar
  // -----------------------------------------------------------------------
  if (styleId === 'sunset_gradient_arc') {
    return wrapWithKabaddi(
      <div
        style={{ background: 'linear-gradient(90deg, #EA580C 0%, #BE123C 50%, #7E22CE 100%)' }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-2xl border border-white/30 text-white shadow-[0_14px_36px_rgba(190,18,60,0.45)] overflow-hidden`}
      >
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-amber-100/90 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`sga-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop bg-white text-slate-950 px-3 py-0.5 rounded-full font-mono tabular-nums font-black leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-2.5 py-1 rounded-full bg-black/35 border border-white/25 font-mono text-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="font-black leading-none">{vm.centerPrimary || 'LIVE'}</span>
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span key={`sga-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop bg-white text-slate-950 px-3 py-0.5 rounded-full font-mono tabular-nums font-black leading-none shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-purple-100/90 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(15, 23, 42, 0.86)', borderColor: 'rgba(255,255,255,0.2)', color: '#F8FAFC' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 21: MINIMAL HAIRLINE STRIP — ultra-clean smoked hairline frame
  // -----------------------------------------------------------------------
  if (styleId === 'minimal_mono_line') {
    return wrapWithKabaddi(
      <div
        style={{ background: 'rgba(9, 12, 20, 0.78)', borderColor: 'rgba(255, 255, 255, 0.28)' }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-md border text-white backdrop-blur-md overflow-hidden`}
      >
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: Math.max(4, m.stripPadY * 0.8),
            paddingBottom: Math.max(4, m.stripPadY * 0.8),
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <span style={{ fontSize: m.teamNameFontPx }} className="font-sans font-bold uppercase tracking-wide truncate block leading-none">
                {teamADisplay}
              </span>
              {!isScoreOnly && vm.leftPlayerLine && (
                <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                  {vm.leftPlayerLine}
                </span>
              )}
            </div>
            <span key={`mml-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-bold leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="h-5 w-px bg-white/25 shrink-0" />
            <span style={{ fontSize: m.metaFontPx }} className="font-mono text-slate-300 shrink-0 leading-none">
              {vm.centerPrimary || 'VS'}
            </span>
            <span className="h-5 w-px bg-white/25 shrink-0" />
          </div>

          <div className="flex items-center justify-between gap-2 min-w-0">
            <span key={`mml-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-bold leading-none shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="min-w-0 flex-1 text-right">
              <span style={{ fontSize: m.teamNameFontPx }} className="font-sans font-bold uppercase tracking-wide truncate block leading-none">
                {teamBDisplay}
              </span>
              {!isScoreOnly && vm.rightPlayerLine && (
                <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                  {vm.rightPlayerLine}
                </span>
              )}
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(2, 6, 23, 0.72)', borderColor: 'rgba(255,255,255,0.16)', color: '#CBD5E1' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 22: STADIUM JUMBOTRON — floodlit arena LED scoreboard + big score tiles
  // -----------------------------------------------------------------------
  if (styleId === 'stadium_jumboscreen') {
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-xl bg-slate-950 border-2 border-sky-400/60 text-white shadow-[0_0_36px_rgba(56,189,248,0.3)] overflow-hidden`}>
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0 bg-[radial-gradient(circle_at_50%_0%,rgba(56,189,248,0.22),transparent_70%)]"
        >
          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase tracking-wider truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-sky-200/85 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`sjs-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop px-3 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-mono tabular-nums font-black leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-slate-900 border border-sky-400/40 text-center shrink-0">
            <span style={{ fontSize: m.metaFontPx }} className="font-mono font-black text-amber-300 block leading-none">
              {vm.centerPrimary || vm.sportLabel}
            </span>
            {!isScoreOnly && vm.centerSecondary && (
              <span style={{ fontSize: m.metaLabelPx }} className="text-sky-200 uppercase block mt-0.5 leading-none">
                {vm.centerSecondary}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <span key={`sjs-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop px-3 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-mono tabular-nums font-black leading-none shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase tracking-wider truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-sky-200/85 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: '#020617', borderColor: 'rgba(56,189,248,0.3)', color: '#BAE6FD' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 23: TACTICAL HEX NEXUS — hexagonal center hub linking armored wings
  // -----------------------------------------------------------------------
  if (styleId === 'tactical_hex_pod') {
    const hexClip = 'polygon(14% 0%, 86% 0%, 100% 50%, 86% 100%, 14% 100%, 0% 50%)';
    return wrapWithKabaddi(
      <div className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col items-center gap-1`}>
        <div className="w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
          <div
            style={{
              background: '#111827',
              borderColor: vm.primaryAccent,
              paddingLeft: m.stripPadX,
              paddingRight: m.stripPadX * 1.25,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="min-w-0 flex items-center justify-between gap-2 rounded-l-lg border-l-4 border-y border-slate-700 text-white shadow-xl"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-emerald-200/85 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`thp-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-white leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>

          <div
            style={{
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              clipPath: hexClip,
              paddingLeft: m.stripPadX * 1.25,
              paddingRight: m.stripPadX * 1.25,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="z-10 -mx-2 text-slate-950 font-mono font-black flex flex-col items-center shrink-0"
          >
            <span style={{ fontSize: m.metaFontPx }} className="leading-none">{vm.centerPrimary || 'NEXUS'}</span>
          </div>

          <div
            style={{
              background: '#111827',
              borderColor: vm.secondaryAccent,
              paddingLeft: m.stripPadX * 1.25,
              paddingRight: m.stripPadX,
              paddingTop: m.stripPadY,
              paddingBottom: m.stripPadY,
            }}
            className="min-w-0 flex items-center justify-between gap-2 rounded-r-lg border-r-4 border-y border-slate-700 text-white shadow-xl"
          >
            <span key={`thp-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx }} className="obs-score-pop font-mono tabular-nums font-black text-white leading-none shrink-0">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-emerald-200/85 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: '#0F172A', borderColor: 'rgba(16,185,129,0.35)', color: '#A7F3D0' }}
          className="w-[95%] rounded-lg border"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 24: ARENA SPOTLIGHT BAR — floodlit stage deck + crisp score tiles
  // -----------------------------------------------------------------------
  if (styleId === 'arena_spotlight_bar') {
    return wrapWithKabaddi(
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(30,41,59,0.96) 0%, rgba(15,23,42,0.98) 100%)',
          borderColor: 'rgba(255,255,255,0.22)',
        }}
        className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col rounded-2xl border-2 text-white shadow-[0_18px_46px_rgba(0,0,0,0.72)] overflow-hidden`}
      >
        <div
          style={{
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
            gap: m.sectionGapPx,
          }}
          className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center min-w-0"
        >
          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={vm.primaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`asb-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx, background: vm.primaryAccent }} className="obs-score-pop px-3 py-1 rounded-xl text-white font-mono tabular-nums font-black leading-none shrink-0 shadow-inner">
              {vm.primaryScore}
            </span>
          </div>

          <div className="flex flex-col items-center shrink-0 px-2">
            {config.showLiveIndicator && (
              <ObsLiveStatusPill
                label={vm.statusPillLabel}
                isLive={vm.showLiveDot}
                variant={vm.statusPillVariant}
                compact
                fontPx={m.pillFontPx}
                padX={m.pillPadX}
                padY={m.pillPadY}
              />
            )}
            {vm.centerPrimary && (
              <span style={{ fontSize: m.metaFontPx }} className="font-mono font-bold text-slate-200 mt-1 leading-none">
                {vm.centerPrimary}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <span key={`asb-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx, background: vm.secondaryAccent }} className="obs-score-pop px-3 py-1 rounded-xl text-white font-mono tabular-nums font-black leading-none shrink-0 shadow-inner">
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-black uppercase truncate block leading-none">
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="font-mono font-semibold text-slate-300 truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={vm.secondaryAccent} sizePx={m.logoMdPx} showLogo={config.showTeamLogos} />
            </div>
          </div>
        </div>
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{ background: 'rgba(2, 6, 23, 0.9)', borderColor: 'rgba(255,255,255,0.14)', color: '#E2E8F0' }}
          className="border-t"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // STYLE 25: CUSTOM DESIGNED SCOREBOARD — fully customizable admin designer
  // -----------------------------------------------------------------------
  const d = normalizeCustomScoreboardDesign(config.customScoreboardDesign);
  const fontFamilyClass =
    d.fontFamily === 'mono' ? 'font-mono' : d.fontFamily === 'sans' ? 'font-sans' : 'font-display';
  const fontWeightClass =
    d.fontWeight === 'black' ? 'font-black' : d.fontWeight === 'bold' ? 'font-bold' : 'font-extrabold';
  const customBg = d.showGradient
    ? `linear-gradient(90deg, ${hexToRgba(d.primaryColor, Math.min(1, d.backgroundOpacity * 0.42))} 0%, ${hexToRgba(
        d.backgroundColor,
        d.backgroundOpacity
      )} 32%, ${hexToRgba(d.backgroundColor, d.backgroundOpacity)} 68%, ${hexToRgba(
        d.secondaryColor,
        Math.min(1, d.backgroundOpacity * 0.42)
      )} 100%)`
    : hexToRgba(d.backgroundColor, d.backgroundOpacity);

  const glowShadow =
    d.glowIntensity > 0 ? `0 0 ${d.glowIntensity}px ${hexToRgba(d.glowColor, 0.65)}` : '';
  const dropShadow = d.showShadow ? '0 14px 36px rgba(0, 0, 0, 0.65)' : '';
  const combinedShadow = [glowShadow, dropShadow].filter(Boolean).join(', ') || 'none';
  const effectiveBorder = d.showBorders && d.borderWidth > 0 ? `${d.borderWidth}px solid ${d.borderColor}` : 'none';
  const clipPathCustom =
    d.layoutVariant === 'angled_ribbon'
      ? 'polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%)'
      : undefined;
  const resolvedRadius =
    d.layoutVariant === 'floating_pill'
      ? 9999
      : d.layoutVariant === 'angled_ribbon'
        ? 0
        : d.borderRadius;

  if (d.layoutVariant === 'compact_tower') {
    const bugW = isScoreOnly ? Math.round(350 * m.overallScale) : Math.round(480 * m.overallScale);
    return wrapWithKabaddi(
      <div
        style={{
          width: isPortrait ? '100%' : Math.min(1150, Math.max(240, bugW)),
          background: customBg,
          color: d.textColor,
          border: effectiveBorder,
          borderRadius: resolvedRadius,
          boxShadow: combinedShadow,
        }}
        className={`mx-auto overflow-hidden ${fontFamilyClass}`}
      >
        <div
          style={{
            background: hexToRgba(d.subStripColor, 0.92),
            borderColor: d.borderColor,
            fontSize: m.metaLabelPx,
          }}
          className="px-3 py-1 border-b flex items-center justify-between gap-2"
        >
          <span style={{ color: d.accentColor }} className={`${fontWeightClass} uppercase tracking-wider truncate`}>
            {vm.tournamentName || vm.sportLabel}
          </span>
          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={vm.statusPillLabel}
              isLive={vm.showLiveDot}
              variant={vm.statusPillVariant}
              compact
              fontPx={Math.max(8, m.pillFontPx - 1)}
              padX={6}
              padY={2}
            />
          )}
        </div>
        <div className="p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span style={{ background: d.primaryColor }} className="w-1.5 h-5 rounded-full shrink-0" />
              <ObsTeamBadge logoUrl={vm.primaryLogo} shortName={vm.primaryShort} accentColor={d.primaryColor} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className={`${fontWeightClass} uppercase truncate block leading-none`}>
                  {teamADisplay}
                </span>
                {!isScoreOnly && vm.leftPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="opacity-80 font-mono truncate block mt-0.5 leading-tight">
                    {vm.leftPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`cd-t-a-${pulseKey}`} style={{ fontSize: m.scoreFontPx, color: d.accentColor }} className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0">
              {vm.primaryScore}
            </span>
          </div>
          {d.showDivider && <div style={{ background: hexToRgba(d.borderColor, 0.35) }} className="h-px w-full" />}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span style={{ background: d.secondaryColor }} className="w-1.5 h-5 rounded-full shrink-0" />
              <ObsTeamBadge logoUrl={vm.secondaryLogo} shortName={vm.secondaryShort} accentColor={d.secondaryColor} sizePx={m.logoSmPx} showLogo={config.showTeamLogos} />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className={`${fontWeightClass} uppercase truncate block leading-none`}>
                  {teamBDisplay}
                </span>
                {!isScoreOnly && vm.rightPlayerLine && (
                  <span style={{ fontSize: Math.max(9, m.metaLabelPx) }} className="opacity-80 font-mono truncate block mt-0.5 leading-tight">
                    {vm.rightPlayerLine}
                  </span>
                )}
              </div>
            </div>
            <span key={`cd-t-b-${pulseKey}`} style={{ fontSize: m.scoreFontPx, color: d.textColor }} className="obs-score-pop font-mono tabular-nums font-black leading-none shrink-0">
              {vm.secondaryScore}
            </span>
          </div>
        </div>
        {d.showTelemetryBar && (
          <TelemetrySubRow
            vm={vm}
            config={config}
            theme={theme}
            m={m}
            isPortrait={isPortrait}
            style={{ background: hexToRgba(d.subStripColor, 0.92), borderColor: hexToRgba(d.borderColor, 0.35), color: d.textColor }}
            className="border-t"
          />
        )}
      </div>
    );
  }

  const customLeftSub = vm.isCricket ? vm.leftPlayerLine : vm.primarySub;
  const customRightSub = vm.isCricket ? vm.rightPlayerLine : vm.secondarySub;

  return wrapWithKabaddi(
    <div
      className={`${isScoreOnly ? 'inline-flex' : 'w-full flex'} flex-col ${
        d.layoutVariant === 'split_wings' ? 'gap-1.5' : ''
      } ${fontFamilyClass}`}
    >
      <div
        style={{
          background: customBg,
          color: d.textColor,
          border: effectiveBorder,
          borderRadius: resolvedRadius,
          boxShadow: combinedShadow,
          clipPath: clipPathCustom,
          paddingLeft: m.stripPadX,
          paddingRight: m.stripPadX,
          paddingTop: m.stripPadY,
          paddingBottom: m.stripPadY,
          gap: m.sectionGapPx,
        }}
        className="w-full flex items-center justify-between min-w-0 overflow-hidden"
      >
        <div
          style={{ gap: m.sectionGapPx }}
          className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
        >
          {/* Left Team */}
          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span style={{ background: d.primaryColor }} className="w-1.5 h-7 rounded-full shrink-0" />
              <ObsTeamBadge
                logoUrl={vm.primaryLogo}
                shortName={vm.primaryShort}
                accentColor={d.primaryColor}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
              <div className="min-w-0 flex-1">
                <span style={{ fontSize: m.teamNameFontPx }} className={`${fontWeightClass} uppercase tracking-wide truncate block leading-none`}>
                  {teamADisplay}
                </span>
                {!isScoreOnly && customLeftSub && (
                  <span style={{ fontSize: m.metaLabelPx }} className="opacity-80 font-mono block mt-0.5 truncate">
                    {customLeftSub}
                  </span>
                )}
              </div>
            </div>
            <span
              key={`cd-a-${pulseKey}`}
              style={{
                fontSize: m.scoreFontPx,
                background: hexToRgba(d.primaryColor, 0.24),
                borderColor: d.primaryColor,
                color: d.textColor,
                paddingLeft: m.scorePillPadX,
                paddingRight: m.scorePillPadX,
                paddingTop: m.scorePillPadY,
                paddingBottom: m.scorePillPadY,
              }}
              className="obs-score-pop rounded-lg border font-mono tabular-nums font-black leading-none shrink-0"
            >
              {vm.primaryScore}
            </span>
          </div>

          {/* Center Pod */}
          <div className="flex items-center gap-2 shrink-0">
            {d.showDivider && (
              <div style={{ background: hexToRgba(d.borderColor, 0.45) }} className="w-px h-7 shrink-0" />
            )}
            <div
              style={{
                background: hexToRgba(d.accentColor, 0.18),
                borderColor: d.accentColor,
                color: d.accentColor,
              }}
              className="px-3 py-1 rounded-lg border flex flex-col items-center justify-center shrink-0"
            >
              <span style={{ fontSize: m.metaFontPx }} className="font-mono tabular-nums font-black leading-none whitespace-nowrap">
                {vm.centerPrimary || 'VS'}
              </span>
              {!isScoreOnly && vm.centerSecondary && (
                <span style={{ fontSize: m.metaLabelPx, color: d.textColor }} className="font-bold uppercase opacity-85 mt-0.5 leading-none whitespace-nowrap">
                  {vm.centerSecondary}
                </span>
              )}
            </div>
            {d.showDivider && (
              <div style={{ background: hexToRgba(d.borderColor, 0.45) }} className="w-px h-7 shrink-0" />
            )}
          </div>

          {/* Right Team */}
          <div className="flex items-center justify-between gap-2.5 min-w-0">
            <span
              key={`cd-b-${pulseKey}`}
              style={{
                fontSize: m.scoreFontPx,
                background: hexToRgba(d.secondaryColor, 0.24),
                borderColor: d.secondaryColor,
                color: d.textColor,
                paddingLeft: m.scorePillPadX,
                paddingRight: m.scorePillPadX,
                paddingTop: m.scorePillPadY,
                paddingBottom: m.scorePillPadY,
              }}
              className="obs-score-pop rounded-lg border font-mono tabular-nums font-black leading-none shrink-0"
            >
              {vm.secondaryScore}
            </span>
            <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
              <div className="min-w-0 flex-1 text-right">
                <span style={{ fontSize: m.teamNameFontPx }} className={`${fontWeightClass} uppercase tracking-wide truncate block leading-none`}>
                  {teamBDisplay}
                </span>
                {!isScoreOnly && customRightSub && (
                  <span style={{ fontSize: m.metaLabelPx }} className="opacity-80 font-mono block mt-0.5 truncate">
                    {customRightSub}
                  </span>
                )}
              </div>
              <ObsTeamBadge
                logoUrl={vm.secondaryLogo}
                shortName={vm.secondaryShort}
                accentColor={d.secondaryColor}
                sizePx={m.logoMdPx}
                showLogo={config.showTeamLogos}
              />
              <span style={{ background: d.secondaryColor }} className="w-1.5 h-7 rounded-full shrink-0" />
            </div>
          </div>
        </div>

        {config.showLiveIndicator && (
          <div className="shrink-0">
            <ObsLiveStatusPill
              label={vm.statusPillLabel}
              isLive={vm.showLiveDot}
              variant={vm.statusPillVariant}
              fontPx={m.pillFontPx}
              padX={m.pillPadX}
              padY={m.pillPadY}
            />
          </div>
        )}
      </div>

      {d.showTelemetryBar && (
        <TelemetrySubRow
          vm={vm}
          config={config}
          theme={theme}
          m={m}
          isPortrait={isPortrait}
          style={{
            background: hexToRgba(d.subStripColor, Math.min(1, d.backgroundOpacity + 0.05)),
            borderColor: d.showBorders ? d.borderColor : 'transparent',
            color: d.textColor,
            borderRadius:
              d.layoutVariant === 'floating_pill'
                ? 9999
                : Math.max(0, d.borderRadius - 2),
          }}
          className={`${d.layoutVariant === 'split_wings' ? 'border w-[96%] mx-auto' : 'border-t'} overflow-hidden`}
        />
      )}
    </div>
  );
}
