import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { computeOverlayMetrics, resolveScoreboardTeamName } from '../../utils/overlayConfig.ts';
import { FootballDetails, createInitialFootballDetails } from '../../utils/footballScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';

interface FootballObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
  isPortrait?: boolean;
}

const HALF_ABBR: Record<FootballDetails['half'], string> = {
  '1st Half': '1H',
  'Half Time': 'HT',
  '2nd Half': '2H',
  'Extra Time': 'ET',
  Penalties: 'PEN',
  'Full Time': 'FT',
};

export function FootballObsOverlay({
  stream,
  score,
  config,
  theme,
  isPortrait = false,
}: FootballObsOverlayProps) {
  const m = computeOverlayMetrics(config, isPortrait);
  const d: FootballDetails = {
    ...createInitialFootballDetails(),
    ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
  };

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

  const clock = `${String(d.timerMinutes ?? 0).padStart(2, '0')}:${String(d.timerSeconds ?? 0).padStart(2, '0')}`;
  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const showPenalties = d.half === 'Penalties' || d.teamAPenalties > 0 || d.teamBPenalties > 0;
  const hasCards =
    d.teamAYellowCards > 0 || d.teamARedCards > 0 || d.teamBYellowCards > 0 || d.teamBRedCards > 0;

  if (config.mode === 'score_only') {
    return (
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
        <span
          className="font-mono tabular-nums font-bold shrink-0"
          style={{ color: theme.accentPrimary, fontSize: m.metaFontPx }}
        >
          {HALF_ABBR[d.half] || d.half} {clock}
        </span>
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
    );
  }

  const barRadiusClass = isPortrait && m.barWidthPct >= 98 ? 'rounded-none border-x-0' : 'rounded-lg';

  return (
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
          {config.showMatchStatus && (
            <div
              style={{ borderColor: theme.divider }}
              className="flex items-center gap-2 pr-3 border-r font-mono tabular-nums shrink-0"
            >
              <span
                style={{ color: theme.accentPrimary, fontSize: m.metaFontPx }}
                className="font-extrabold uppercase"
              >
                {HALF_ABBR[d.half] || d.half}
              </span>
              <span style={{ fontSize: m.teamNameFontPx }} className="font-bold">
                {clock}
              </span>
              {d.extraTimeMinutes > 0 && (
                <span style={{ fontSize: m.metaLabelPx }} className="font-bold text-amber-300">
                  +{d.extraTimeMinutes}&apos;
                </span>
              )}
            </div>
          )}

          <div
            style={{ gap: m.sectionGapPx }}
            className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
          >
            <div className="flex items-center gap-2.5 min-w-0 justify-end">
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

            <div className="flex items-center gap-2.5 min-w-0 justify-start">
              <span
                style={{ fontSize: m.teamNameFontPx }}
                className="font-display font-extrabold uppercase tracking-wide truncate"
              >
                {displayB}
              </span>
              <ObsTeamBadge
                logoUrl={stream.teamBLogo}
                shortName={shortB}
                accentColor={config.teamBColor}
                sizePx={m.logoSmPx}
                showLogo={config.showTeamLogos}
              />
            </div>
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

      {config.mode === 'full' && (showPenalties || hasCards || resultDeclared || (config.showTournamentName && stream.tournamentName)) && (
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
            {resultDeclared && (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-300 uppercase truncate">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                {score?.resultDescription || score?.winnerTeamName}
              </span>
            )}
            {showPenalties && (
              <span className="font-mono tabular-nums font-bold text-amber-300 shrink-0">
                PENS {shortA} {d.teamAPenalties} - {d.teamBPenalties} {shortB}
              </span>
            )}
          </div>
          {hasCards && (
            <div style={{ fontSize: m.metaLabelPx }} className="flex items-center gap-3 font-mono tabular-nums shrink-0">
              {(d.teamAYellowCards > 0 || d.teamARedCards > 0) && (
                <span>
                  {shortA}: YC {d.teamAYellowCards} · RC {d.teamARedCards}
                </span>
              )}
              {(d.teamBYellowCards > 0 || d.teamBRedCards > 0) && (
                <span>
                  {shortB}: YC {d.teamBYellowCards} · RC {d.teamBRedCards}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
