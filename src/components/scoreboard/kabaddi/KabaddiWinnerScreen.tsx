import { Award, Clock, Shield, Trophy, X } from 'lucide-react';
import type { LiveScoreData, LiveStreamData } from '../../../types/index.ts';
import type { KabaddiCourtPlayer, KabaddiDetails } from '../../../utils/kabaddiScoring.ts';
import { TeamAvatar } from '../../common/TeamAvatar.tsx';

interface KabaddiWinnerScreenProps {
  open?: boolean;
  onClose?: () => void;
  stream: LiveStreamData;
  score: LiveScoreData | null;
  details: KabaddiDetails;
  inline?: boolean;
}

function formatDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso || !endIso) return '';
  const diffMs = Math.max(0, new Date(endIso).getTime() - new Date(startIso).getTime());
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function pickLeader(
  playersA: KabaddiCourtPlayer[],
  playersB: KabaddiCourtPlayer[],
  teamAName: string,
  teamBName: string,
  metric: 'raidPoints' | 'tacklePoints'
) {
  const all = [
    ...playersA.map((p) => ({ ...p, teamName: teamAName })),
    ...playersB.map((p) => ({ ...p, teamName: teamBName })),
  ];
  const sorted = all.sort((a, b) => (b.stats[metric] || 0) - (a.stats[metric] || 0));
  return sorted[0] && sorted[0].stats[metric] > 0 ? sorted[0] : null;
}

export function KabaddiWinnerScreen({
  open = true,
  onClose,
  stream,
  score,
  details,
  inline = false,
}: KabaddiWinnerScreenProps) {
  if (!inline && !open) return null;

  const teamAName = stream.teamAName || 'Team A';
  const teamBName = stream.teamBName || 'Team B';
  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;

  const isTie = score?.resultStatus === 'TIE' || score?.resultStatus === 'DRAW';
  const isForfeit = Boolean(details.forfeitTeam);
  const winnerSide =
    score?.winnerTeamId && stream.teamAId && score.winnerTeamId === stream.teamAId
      ? 'A'
      : score?.winnerTeamId && stream.teamBId && score.winnerTeamId === stream.teamBId
        ? 'B'
        : details.forfeitTeam === 'A'
          ? 'B'
          : details.forfeitTeam === 'B'
            ? 'A'
            : details.goldenRaidWinner
              ? details.goldenRaidWinner
              : scoreA > scoreB
                ? 'A'
                : scoreB > scoreA
                  ? 'B'
                  : '';

  const winnerName =
    score?.winnerTeamName ||
    (winnerSide === 'A' ? teamAName : winnerSide === 'B' ? teamBName : '');
  const winnerLogo =
    winnerSide === 'A' ? stream.teamALogo : winnerSide === 'B' ? stream.teamBLogo : '';

  const duration = formatDuration(details.clock.matchStartedAtIso, details.clock.matchEndedAtIso);
  const topRaider = pickLeader(
    details.courtPlayersA,
    details.courtPlayersB,
    teamAName,
    teamBName,
    'raidPoints'
  );
  const topDefender = pickLeader(
    details.courtPlayersA,
    details.courtPlayersB,
    teamAName,
    teamBName,
    'tacklePoints'
  );

  const cardBody = (
    <div className="bg-slate-950 text-white border border-amber-500/40 rounded-2xl overflow-hidden shadow-2xl w-full max-w-2xl">
      <div className="px-5 py-4 bg-gradient-to-r from-amber-600/25 via-orange-600/20 to-amber-600/25 border-b border-amber-500/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300 truncate">
              {stream.tournamentName ? `${stream.tournamentName}` : 'MaidanLive Kabaddi Final Result'}
              {stream.roundName ? ` · ${stream.roundName}` : ''}
            </p>
            <h3 className="font-display text-lg font-extrabold text-white truncate">
              {isTie
                ? 'Match Tied'
                : isForfeit
                  ? 'Match Decided by Forfeit'
                  : 'Official Match Winner'}
            </h3>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Winner Screen"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="p-5 sm:p-6 space-y-5">
        {/* Winner Headline */}
        <div className="flex flex-col items-center text-center space-y-2">
          {!isTie && winnerName && (
            <div className="flex flex-col items-center gap-2">
              <TeamAvatar name={winnerName} logoUrl={winnerLogo} size="lg" />
              <p className="font-display text-2xl sm:text-3xl font-black text-amber-300">
                {winnerName}
              </p>
            </div>
          )}
          <p className="text-sm font-semibold text-emerald-300">
            {score?.resultDescription ||
              (isTie
                ? `Scores tied ${scoreA} – ${scoreB}`
                : `${winnerName} won ${score?.winningMargin ? `by ${score.winningMargin}` : ''}`)}
          </p>
        </div>

        {/* Final Score Comparison */}
        <div className="grid grid-cols-3 items-center gap-3 p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <TeamAvatar name={teamAName} logoUrl={stream.teamALogo} size="sm" />
            <span className="font-bold text-sm truncate">{teamAName}</span>
          </div>
          <div className="text-center font-mono tabular-nums">
            <p className="text-2xl sm:text-3xl font-black">
              {scoreA} <span className="text-slate-600">–</span> {scoreB}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400">
              {details.isTieBreaker
                ? `Tie-Breaker ${details.tieBreakerScoreA}-${details.tieBreakerScoreB}`
                : 'Final Score'}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 min-w-0">
            <span className="font-bold text-sm truncate text-right">{teamBName}</span>
            <TeamAvatar name={teamBName} logoUrl={stream.teamBLogo} size="sm" />
          </div>
        </div>

        {/* Highlights: Duration, Top Raider, Top Defender */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
            <p className="inline-flex items-center gap-1.5 text-slate-400 font-semibold">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Match Duration</span>
            </p>
            <p className="font-mono font-bold text-white text-sm">
              {duration || `${details.rules.halfDurationMinutes * details.rules.halvesCount} mins regulation`}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
            <p className="inline-flex items-center gap-1.5 text-slate-400 font-semibold">
              <Award className="w-3.5 h-3.5 text-orange-400" />
              <span>Top Raider</span>
            </p>
            <p className="font-bold text-white text-sm truncate">
              {topRaider ? `${topRaider.name} (${topRaider.stats.raidPoints} pts)` : 'Match Totals Logged'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
            <p className="inline-flex items-center gap-1.5 text-slate-400 font-semibold">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Top Defender</span>
            </p>
            <p className="font-bold text-white text-sm truncate">
              {topDefender ? `${topDefender.name} (${topDefender.stats.tacklePoints} pts)` : 'Match Totals Logged'}
            </p>
          </div>
        </div>

        {onClose && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-5 rounded-xl bg-[#EA580C] hover:bg-orange-600 text-white font-bold text-xs uppercase tracking-wider"
            >
              Return to Scoreboard
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) return cardBody;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kabaddi Official Winner Screen"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      {cardBody}
    </div>
  );
}
