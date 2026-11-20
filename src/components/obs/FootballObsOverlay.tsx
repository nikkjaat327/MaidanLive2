import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
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
}

const HALF_ABBR: Record<FootballDetails['half'], string> = {
  '1st Half': '1H',
  'Half Time': 'HT',
  '2nd Half': '2H',
  'Extra Time': 'ET',
  Penalties: 'PEN',
  'Full Time': 'FT',
};

export function FootballObsOverlay({ stream, score, config, theme }: FootballObsOverlayProps) {
  const d: FootballDetails = {
    ...createInitialFootballDetails(),
    ...((score?.sportSpecificDetails || {}) as Partial<FootballDetails>),
  };

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

  const clock = `${String(d.timerMinutes ?? 0).padStart(2, '0')}:${String(d.timerSeconds ?? 0).padStart(2, '0')}`;
  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const showPenalties = d.half === 'Penalties' || d.teamAPenalties > 0 || d.teamBPenalties > 0;
  const hasCards =
    d.teamAYellowCards > 0 || d.teamARedCards > 0 || d.teamBYellowCards > 0 || d.teamBRedCards > 0;

  if (config.mode === 'score_only') {
    return (
      <div
        style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
        className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border shadow-xl backdrop-blur-md"
      >
        <span className="font-mono tabular-nums text-xs font-bold" style={{ color: theme.accentPrimary }}>
          {HALF_ABBR[d.half] || d.half} {clock}
        </span>
        <span className="font-display font-extrabold text-sm uppercase">{shortA}</span>
        <span
          key={pulseKey}
          style={{ background: theme.scorePillBg, color: theme.scorePillText }}
          className="obs-score-pop font-mono tabular-nums font-extrabold text-base px-2.5 py-0.5 rounded"
        >
          {scoreA} - {scoreB}
        </span>
        <span className="font-display font-extrabold text-sm uppercase">{shortB}</span>
        {config.showLiveIndicator && (
          <ObsLiveStatusPill
            label={resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus}
            isLive={stream.status === 'LIVE' && !resultDeclared}
            variant={resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break'}
            compact
          />
        )}
      </div>
    );
  }

  return (
    <div
      style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
      className="inline-flex flex-col rounded-lg border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md max-w-[820px]"
    >
      <div className="flex items-stretch">
        <ObsBrandMark theme={theme} compact={config.mode === 'compact'} />
        <div className="flex items-center gap-3 px-3.5 py-2">
          {config.showMatchStatus && (
            <div
              style={{ borderColor: theme.divider }}
              className="flex items-center gap-1.5 pr-2.5 border-r font-mono tabular-nums"
            >
              <span style={{ color: theme.accentPrimary }} className="text-xs font-extrabold uppercase">
                {HALF_ABBR[d.half] || d.half}
              </span>
              <span className="text-sm font-bold">{clock}</span>
              {d.extraTimeMinutes > 0 && (
                <span className="text-[11px] font-bold text-amber-300">+{d.extraTimeMinutes}&apos;</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <ObsTeamBadge
              logoUrl={stream.teamALogo}
              shortName={shortA}
              accentColor={config.teamAColor}
              size="sm"
              showLogo={config.showTeamLogos}
            />
            <span className="font-display font-extrabold text-sm uppercase tracking-wide">
              {config.mode === 'compact' ? shortA : nameA}
            </span>
          </div>

          <div
            key={pulseKey}
            style={{ background: theme.scorePillBg, color: theme.scorePillText }}
            className="obs-score-pop flex items-center gap-2 px-3 py-1 rounded-md font-mono tabular-nums font-extrabold text-xl leading-none"
          >
            <span>{scoreA}</span>
            <span className="opacity-50 text-sm">-</span>
            <span>{scoreB}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-display font-extrabold text-sm uppercase tracking-wide">
              {config.mode === 'compact' ? shortB : nameB}
            </span>
            <ObsTeamBadge
              logoUrl={stream.teamBLogo}
              shortName={shortB}
              accentColor={config.teamBColor}
              size="sm"
              showLogo={config.showTeamLogos}
            />
          </div>

          {config.showLiveIndicator && (
            <ObsLiveStatusPill
              label={resultDeclared ? 'FINAL' : stdStatus === 'LIVE' ? 'LIVE' : stdStatus}
              isLive={stream.status === 'LIVE' && !resultDeclared}
              variant={resultDeclared ? 'final' : stdStatus === 'LIVE' ? 'live' : 'break'}
              compact={config.mode === 'compact'}
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
          }}
          className="flex items-center justify-between gap-4 px-3.5 py-1.5 border-t text-[11px]"
        >
          <div className="flex items-center gap-3">
            {config.showTournamentName && stream.tournamentName && (
              <span style={{ color: theme.accentPrimary }} className="font-display font-bold uppercase tracking-wider">
                {stream.tournamentName}
              </span>
            )}
            {resultDeclared && (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-300 uppercase">
                <Trophy className="w-3 h-3" />
                {score?.resultDescription || score?.winnerTeamName}
              </span>
            )}
            {showPenalties && (
              <span className="font-mono tabular-nums font-bold text-amber-300">
                PENS {shortA} {d.teamAPenalties} - {d.teamBPenalties} {shortB}
              </span>
            )}
          </div>
          {hasCards && (
            <div className="flex items-center gap-3 font-mono tabular-nums text-[10px]">
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
