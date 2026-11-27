import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { computeOverlayMetrics, resolveScoreboardTeamName } from '../../utils/overlayConfig.ts';
import {
  computeEffectiveKabaddiClock,
  normalizeKabaddiDetails,
} from '../../utils/kabaddiScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';
import { KabaddiAnimations } from '../scoreboard/kabaddi/KabaddiAnimations.tsx';

interface KabaddiObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
  isPortrait?: boolean;
  serverClockOffsetMs?: number;
}

export function KabaddiObsOverlay({
  stream,
  score,
  config,
  theme,
  isPortrait = false,
  serverClockOffsetMs = 0,
}: KabaddiObsOverlayProps) {
  const m = computeOverlayMetrics(config, isPortrait);
  const d = normalizeKabaddiDetails(score?.sportSpecificDetails);
  const vis = d.viewerDisplaySettings;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const isClockTicking = Boolean(
    !d.matchCompleted &&
      (d.clock.status === 'RUNNING' ||
        d.clock.status === 'EXTRA_TIME' ||
        d.clock.status === 'BREAK' ||
        d.clock.raidRunning ||
        d.clock.timeoutActive ||
        d.doOrDie.active ||
        (d.lastAllOut?.triggeredAtIso &&
          Date.now() - Date.parse(d.lastAllOut.triggeredAtIso) <=
            (d.rules.allOutBannerDurationSec || 5) * 1000))
  );
  useEffect(() => {
    if (!isClockTicking) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isClockTicking]);
  const effectiveNowMs = nowMs + serverClockOffsetMs;
  const effClock = computeEffectiveKabaddiClock(d, effectiveNowMs);

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');
  const displayA = resolveScoreboardTeamName(nameA, shortA, isPortrait);
  const displayB = resolveScoreboardTeamName(nameB, shortB, isPortrait);

  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;

  const prevKey = useRef(`${scoreA}-${scoreB}`);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    const next = `${scoreA}-${scoreB}`;
    if (prevKey.current !== next) {
      prevKey.current = next;
      setPulseKey((k) => k + 1);
    }
  }, [scoreA, scoreB]);

  const clock = effClock.formattedClock;
  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');

  const obsAnimationBanner = (
    <KabaddiAnimations
      streamId={stream.id}
      teamAName={nameA}
      teamBName={nameB}
      doOrDie={d.doOrDie}
      doOrDieVisible={effClock.doOrDieVisible}
      doOrDieRemainingSec={effClock.doOrDieRemainingSec}
      lastAllOut={d.lastAllOut}
      allOutDurationSec={d.rules.allOutBannerDurationSec}
      timeoutActive={d.clock.timeoutActive}
      timeoutTeam={d.clock.timeoutTeam}
      timeoutRemainingSec={effClock.timeoutRemainingSec}
      displaySettings={vis}
      compact
      showTimer={false}
      scaleMultiplier={m.overallScale}
      nowMs={effectiveNowMs}
    />
  );

  if (config.mode === 'score_only') {
    return (
      <div className="inline-flex flex-col items-stretch gap-2 max-w-full">
        {obsAnimationBanner}
        <div
          style={{
            background: theme.barBg,
            borderColor: theme.barBorder,
            color: theme.primaryText,
            gap: Math.max(8, Math.round(m.sectionGapPx * 0.8)),
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
          }}
          className="inline-flex items-center rounded-lg border shadow-xl backdrop-blur-md max-w-full"
        >
          <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate max-w-[260px]">
            {displayA}
          </span>
          <span
            key={pulseKey}
            style={{
              background: theme.scorePillBg,
              color: theme.scorePillText,
              fontSize: m.scoreFontPx,
              paddingLeft: m.scorePillPadX,
              paddingRight: m.scorePillPadX,
              paddingTop: Math.max(3, Math.round(m.scorePillPadY * 0.6)),
              paddingBottom: Math.max(3, Math.round(m.scorePillPadY * 0.6)),
            }}
            className="obs-score-pop font-mono tabular-nums font-extrabold rounded leading-none shrink-0"
          >
            {scoreA} - {scoreB}
          </span>
          <span style={{ fontSize: m.teamNameFontPx }} className="font-display font-extrabold uppercase truncate max-w-[260px]">
            {displayB}
          </span>
          {config.showMatchStatus && vis.showMatchTimer && (
            <span
              className="font-mono tabular-nums font-bold shrink-0"
              style={{ color: theme.accentPrimary, fontSize: m.metaFontPx }}
            >
              {clock}
            </span>
          )}
        </div>
      </div>
    );
  }

  const barRadiusClass = isPortrait && m.barWidthPct >= 98 ? 'rounded-none border-x-0' : 'rounded-lg';

  return (
    <div className="w-full flex flex-col gap-2">
      {obsAnimationBanner}
      <div
        style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
        className={`w-full flex flex-col border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md ${barRadiusClass}`}
      >
      <div className="flex items-stretch min-w-0">
        {!isPortrait && (
          <ObsBrandMark
            theme={theme}
            compact={config.mode === 'compact'}
            iconPx={m.brandIconPx}
            fontPx={m.brandFontPx}
            padX={m.brandPadX}
            padY={m.brandPadY}
          />
        )}
        <div
          style={{
            gap: m.sectionGapPx,
            paddingLeft: m.stripPadX,
            paddingRight: m.stripPadX,
            paddingTop: m.stripPadY,
            paddingBottom: m.stripPadY,
          }}
          className={`flex-1 min-w-0 flex items-center justify-between ${
            isPortrait ? 'flex-wrap' : ''
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
            <ObsTeamBadge
              logoUrl={stream.teamALogo}
              shortName={shortA}
              accentColor={config.teamAColor}
              sizePx={m.logoSmPx}
              showLogo={config.showTeamLogos}
            />
            <span
              style={{ fontSize: m.teamNameFontPx }}
              className="font-display font-extrabold uppercase tracking-wide truncate"
            >
              {displayA}
            </span>
          </div>

          <div
            key={pulseKey}
            style={{
              background: theme.scorePillBg,
              color: theme.scorePillText,
              paddingLeft: m.scorePillPadX,
              paddingRight: m.scorePillPadX,
              paddingTop: m.scorePillPadY,
              paddingBottom: m.scorePillPadY,
            }}
            className="obs-score-pop flex items-center gap-3 rounded-md font-mono tabular-nums font-extrabold leading-none shrink-0"
          >
            <span style={{ fontSize: m.scoreFontPx }}>{vis.showScores ? scoreA : '•'}</span>
            {config.showMatchStatus && (vis.showMatchTimer || vis.showHalf) ? (
              <span className="flex flex-col items-center px-1.5 leading-tight opacity-90">
                {vis.showMatchTimer && (
                  <span style={{ color: theme.accentPrimary, fontSize: m.metaFontPx }}>
                    {clock}
                    {vis.showRaidTimer && d.clock.raidTimerEnabled && !d.matchCompleted
                      ? ` · R${effClock.raidRemainingSec}s`
                      : ''}
                  </span>
                )}
                {vis.showHalf && (
                  <span style={{ fontSize: m.metaLabelPx }} className="uppercase tracking-wider opacity-80">
                    {d.clock.halfLabel || d.half}
                  </span>
                )}
              </span>
            ) : (
              <span style={{ fontSize: m.metaFontPx }} className="px-1 opacity-60">
                -
              </span>
            )}
            <span style={{ fontSize: m.scoreFontPx }}>{vis.showScores ? scoreB : '•'}</span>
          </div>

          <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-start">
            {vis.showTeamNames && (
              <span
                style={{ fontSize: m.teamNameFontPx }}
                className="font-display font-extrabold uppercase tracking-wide truncate"
              >
                {displayB}
              </span>
            )}
            <ObsTeamBadge
              logoUrl={stream.teamBLogo}
              shortName={shortB}
              accentColor={config.teamBColor}
              sizePx={m.logoSmPx}
              showLogo={config.showTeamLogos && vis.showTeamLogos}
            />
          </div>

          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus}
              isLive={stream.status === 'LIVE' && !resultDeclared}
              variant={resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break'}
              fontPx={m.pillFontPx}
              padX={m.pillPadX}
              padY={m.pillPadY}
            />
          )}
        </div>
      </div>

      {config.mode === 'full' && (
        <div
          style={{
            background: theme.subStripBg,
            borderColor: theme.subStripBorder,
            color: theme.secondaryText,
            fontSize: m.metaFontPx,
            paddingLeft: m.subStripPadX,
            paddingRight: m.subStripPadX,
            paddingTop: m.subStripPadY,
            paddingBottom: m.subStripPadY,
          }}
          className={`flex items-center justify-between gap-4 border-t font-mono tabular-nums ${
            isPortrait ? 'flex-wrap' : ''
          }`}
        >
          <span className="truncate">
            {shortA}: R {d.teamA.raidPoints} · T {d.teamA.tacklePoints} · B {d.teamA.bonusPoints} · AO{' '}
            {d.teamA.allOutPoints}
            {vis.showPlayersOnCourtDots ? ` · Mat ${d.playersOnCourtA}/${d.rules.playersPerSide}` : ''}
          </span>
          {resultDeclared ? (
            <span className="inline-flex items-center gap-1 font-sans font-bold text-emerald-300 uppercase truncate">
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              {score?.resultDescription || score?.winnerTeamName}
            </span>
          ) : vis.showDoOrDieBanner && effClock.doOrDieVisible && d.doOrDie.team ? (
            <span className="font-sans font-black text-amber-300 uppercase truncate">
              DO OR DIE · {d.doOrDie.team === 'A' ? shortA : shortB}
            </span>
          ) : vis.showTimeoutBanner && d.clock.timeoutActive ? (
            <span className="font-sans font-bold text-sky-300 uppercase truncate">
              TIMEOUT · {d.clock.timeoutTeam === 'A' ? shortA : shortB} ({effClock.timeoutRemainingSec}s)
            </span>
          ) : d.superRaidNote ? (
            <span className="font-sans font-bold text-amber-300 uppercase truncate">{d.superRaidNote}</span>
          ) : vis.showTournamentLogo && config.showTournamentName && stream.tournamentName ? (
            <span style={{ color: theme.accentPrimary }} className="font-sans font-bold uppercase truncate">
              {stream.tournamentName}
            </span>
          ) : null}
          <span className="truncate">
            {shortB}: R {d.teamB.raidPoints} · T {d.teamB.tacklePoints} · B {d.teamB.bonusPoints} · AO{' '}
            {d.teamB.allOutPoints}
            {vis.showPlayersOnCourtDots ? ` · Mat ${d.playersOnCourtB}/${d.rules.playersPerSide}` : ''}
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
