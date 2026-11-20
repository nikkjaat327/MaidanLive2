import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import {
  VolleyballDetails,
  createInitialVolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import type { ObsThemeTokens } from './obsTheme.ts';
import { ObsBrandMark, ObsLiveStatusPill, ObsTeamBadge } from './ObsBrandMark.tsx';

interface VolleyballObsOverlayProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  theme: ObsThemeTokens;
}

export function VolleyballObsOverlay({
  stream,
  score,
  config,
  theme,
}: VolleyballObsOverlayProps) {
  const d: VolleyballDetails = {
    ...createInitialVolleyballDetails(),
    ...((score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>),
  };

  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;

  const prevKey = useRef(`${scoreA}-${scoreB}-${d.currentSet}`);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    const next = `${scoreA}-${scoreB}-${d.currentSet}`;
    if (prevKey.current !== next) {
      prevKey.current = next;
      setPulseKey((k) => k + 1);
    }
  }, [scoreA, scoreB, d.currentSet]);

  const stdStatus = resolveMatchStatus(stream, score);
  const resultDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');
  const completedSets = (d.setScores || []).filter((s) => s.winner === 'A' || s.winner === 'B');

  if (config.mode === 'score_only') {
    return (
      <div
        style={{ background: theme.barBg, borderColor: theme.barBorder, color: theme.primaryText }}
        className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border shadow-xl backdrop-blur-md"
      >
        <span style={{ color: theme.accentPrimary }} className="font-mono tabular-nums text-xs font-bold">
          SET {d.currentSet}
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
          {config.showMatchStatus && (
            <span
              style={{ color: theme.accentPrimary, borderColor: theme.divider }}
              className="font-mono tabular-nums text-xs font-extrabold pr-2.5 border-r"
            >
              SET {d.currentSet}/{d.bestOfSets}
            </span>
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
            {d.servingTeam === 'A' && !resultDeclared && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Serving" />
            )}
            <span style={{ color: theme.mutedText }} className="font-mono text-xs font-bold">
              S{d.teamASetsWon}
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
            <span style={{ color: theme.mutedText }} className="font-mono text-xs font-bold">
              S{d.teamBSetsWon}
            </span>
            {d.servingTeam === 'B' && !resultDeclared && (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Serving" />
            )}
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

      {config.mode === 'full' && (completedSets.length > 0 || resultDeclared || (config.showTournamentName && stream.tournamentName)) && (
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
          </div>
          {completedSets.length > 0 && (
            <div className="flex items-center gap-2 font-mono tabular-nums text-[10px]">
              {completedSets.map((s) => (
                <span key={s.set}>
                  S{s.set}: {s.teamA}-{s.teamB}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
