import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import { KabaddiDetails, createInitialKabaddiDetails } from '../../utils/kabaddiScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';

interface KabaddiObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
}

export function KabaddiObsOverlay({ stream, score, config, theme }: KabaddiObsOverlayProps) {
  const d: KabaddiDetails = {
    ...createInitialKabaddiDetails(),
    ...((score?.sportSpecificDetails || {}) as Partial<KabaddiDetails>),
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

  if (config.mode === 'score_only') {
    return (
      <div
        style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
        className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border shadow-xl backdrop-blur-md"
      >
        <span className="font-display font-extrabold text-sm uppercase">{shortA}</span>
        <span
          key={pulseKey}
          style={{ background: theme.scorePillBg, color: theme.scorePillText }}
          className="obs-score-pop font-mono tabular-nums font-extrabold text-base px-2.5 py-0.5 rounded"
        >
          {scoreA} - {scoreB}
        </span>
        <span className="font-display font-extrabold text-sm uppercase">{shortB}</span>
        <span className="font-mono tabular-nums text-xs" style={{ color: theme.accentPrimary }}>
          {clock}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
      className="inline-flex flex-col rounded-lg border shadow-[0_18px_46px_rgba(0,0,0,0.65)] overflow-hidden backdrop-blur-md max-w-[860px]"
    >
      <div className="flex items-stretch">
        <ObsBrandMark theme={theme} compact={config.mode === 'compact'} />
        <div className="flex items-center gap-3 px-3.5 py-2">
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
            className="obs-score-pop flex items-center gap-2.5 px-3 py-1 rounded-md font-mono tabular-nums font-extrabold text-xl leading-none"
          >
            <span>{scoreA}</span>
            {config.showMatchStatus && (
              <span className="flex flex-col items-center px-1.5 text-[10px] leading-tight opacity-90">
                <span style={{ color: theme.accentPrimary }}>{clock}</span>
                <span className="text-[8px] uppercase tracking-wider opacity-80">{d.half}</span>
              </span>
            )}
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

      {config.mode === 'full' && (
        <div
          style={{
            background: theme.subStripBg,
            borderColor: theme.subStripBorder,
            color: theme.secondaryText,
          }}
          className="flex items-center justify-between gap-4 px-3.5 py-1.5 border-t text-[10px] font-mono tabular-nums"
        >
          <span>
            {shortA}: R {d.teamA.raidPoints} · T {d.teamA.tacklePoints} · B {d.teamA.bonusPoints} · AO{' '}
            {d.teamA.allOutPoints}
          </span>
          {resultDeclared ? (
            <span className="inline-flex items-center gap-1 font-sans font-bold text-emerald-300 uppercase">
              <Trophy className="w-3 h-3" />
              {score?.resultDescription || score?.winnerTeamName}
            </span>
          ) : d.superRaidNote ? (
            <span className="font-sans font-bold text-amber-300 uppercase">{d.superRaidNote}</span>
          ) : config.showTournamentName && stream.tournamentName ? (
            <span style={{ color: theme.accentPrimary }} className="font-sans font-bold uppercase">
              {stream.tournamentName}
            </span>
          ) : null}
          <span>
            {shortB}: R {d.teamB.raidPoints} · T {d.teamB.tacklePoints} · B {d.teamB.bonusPoints} · AO{' '}
            {d.teamB.allOutPoints}
          </span>
        </div>
      )}
    </div>
  );
}
