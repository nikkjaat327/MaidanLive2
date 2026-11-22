import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { computeOverlayMetrics } from '../../utils/overlayConfig.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';

interface GenericObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
  isPortrait?: boolean;
}

export function GenericObsOverlay({
  stream,
  score,
  config,
  theme,
  isPortrait = false,
}: GenericObsOverlayProps) {
  const m = computeOverlayMetrics(config, isPortrait);
  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

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

  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const sportLabel = score?.sportType || stream.gameName || 'MATCH';
  const isScoreOnly = config.mode === 'score_only';
  const barRadiusClass = isPortrait && !isScoreOnly && m.barWidthPct >= 98 ? 'rounded-none border-x-0' : 'rounded-lg';

  return (
    <div
      style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
      className={`${
        isScoreOnly ? 'inline-flex max-w-full' : 'w-full flex'
      } flex-col border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md ${barRadiusClass}`}
    >
      <div className="flex items-stretch min-w-0">
        {!isScoreOnly && !isPortrait && (
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
            isPortrait && !isScoreOnly ? 'flex-wrap' : ''
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
              {config.mode === 'full' && !isPortrait ? nameA : shortA}
            </span>
          </div>

          <div
            key={pulseKey}
            style={{
              background: theme.scorePillBg,
              color: theme.scorePillText,
              fontSize: m.scoreFontPx,
              paddingLeft: m.scorePillPadX,
              paddingRight: m.scorePillPadX,
              paddingTop: m.scorePillPadY,
              paddingBottom: m.scorePillPadY,
            }}
            className="obs-score-pop flex items-center gap-2.5 rounded-md font-mono tabular-nums font-extrabold leading-none shrink-0"
          >
            <span>{scoreA}</span>
            <span className="opacity-50 text-[0.75em]">-</span>
            <span>{scoreB}</span>
          </div>

          <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-start">
            <span
              style={{ fontSize: m.teamNameFontPx }}
              className="font-display font-extrabold uppercase tracking-wide truncate"
            >
              {config.mode === 'full' && !isPortrait ? nameB : shortB}
            </span>
            <ObsTeamBadge
              logoUrl={stream.teamBLogo}
              shortName={shortB}
              accentColor={config.teamBColor}
              sizePx={m.logoSmPx}
              showLogo={config.showTeamLogos}
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

      {config.mode === 'full' && (resultDeclared || (config.showTournamentName && stream.tournamentName) || (config.showMatchStatus && score?.matchStatus)) && (
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
          className={`flex items-center justify-between gap-4 border-t ${isPortrait ? 'flex-wrap' : ''}`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            {config.showTournamentName && stream.tournamentName && (
              <span style={{ color: theme.accentPrimary }} className="font-display font-bold uppercase tracking-wider truncate">
                {stream.tournamentName}
              </span>
            )}
            <span style={{ color: theme.mutedText }} className="uppercase font-semibold shrink-0">
              {sportLabel}
            </span>
          </div>
          {resultDeclared ? (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-300 uppercase truncate">
              <Trophy className="w-3.5 h-3.5 shrink-0" />
              {score?.resultDescription || score?.winnerTeamName}
            </span>
          ) : (
            config.showMatchStatus &&
            score?.matchStatus && (
              <span className="font-semibold uppercase truncate">{score.matchStatus}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
