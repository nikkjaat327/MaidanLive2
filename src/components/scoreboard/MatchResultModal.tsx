import { useEffect, useState } from 'react';
import { AlertTriangle, Award, CheckCircle2, Trophy } from 'lucide-react';
import { LiveScoreData, LiveStreamData, PlayerData } from '../../types/index.ts';
import { Modal } from '../common/Modal.tsx';
import { formatCricketOvers } from '../../utils/cricketScoring.ts';
import { MatchResultType, validateMatchResult } from '../../utils/matchResultValidation.ts';

interface MatchResultModalProps {
  open: boolean;
  onClose: () => void;
  stream: LiveStreamData;
  score: LiveScoreData | null;
  players?: PlayerData[];
  saving: boolean;
  onConfirmSubmit: (payload: {
    resultType: MatchResultType;
    winningMargin: string;
    resultDescription: string;
    mvpPlayerId?: string;
    mvpPlayerName?: string;
    finalSummary?: string;
    confirmCorrection: boolean;
  }) => Promise<void>;
}

export function MatchResultModal({
  open,
  onClose,
  stream,
  score,
  players = [],
  saving,
  onConfirmSubmit,
}: MatchResultModalProps) {
  const sport = score?.sportType || stream.gameName || 'Other';
  const teamA = stream.teamAName || 'Team A';
  const teamB = stream.teamBName || 'Team B';
  const alreadyDeclared = Boolean(score?.resultStatus && score.resultStatus !== 'NOT_DECLARED');

  const [resultType, setResultType] = useState<MatchResultType>('');
  const [winningMargin, setWinningMargin] = useState('');
  const [resultDescription, setResultDescription] = useState('');
  const [mvpPlayerId, setMvpPlayerId] = useState('');
  const [mvpPlayerName, setMvpPlayerName] = useState('');
  const [finalSummary, setFinalSummary] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setResultType((score?.resultType as MatchResultType) || '');
      setWinningMargin(score?.winningMargin || '');
      setResultDescription(score?.resultDescription || '');
      setMvpPlayerId(score?.mvpPlayerId || '');
      setMvpPlayerName(score?.mvpPlayerName || '');
      setFinalSummary(score?.finalSummary || '');
      setConfirmStep(false);
      setLocalError(null);
    }
  }, [
    open,
    score?.resultType,
    score?.winningMargin,
    score?.resultDescription,
    score?.mvpPlayerId,
    score?.mvpPlayerName,
    score?.finalSummary,
  ]);

  const details = (score?.sportSpecificDetails || {}) as Record<string, any>;
  const scoreA = score?.teamAScore ?? 0;
  const scoreB = score?.teamBScore ?? 0;

  const renderFinalScorePreview = () => {
    if (sport === 'Cricket') {
      return `${teamA} ${details.teamARuns ?? scoreA}/${details.teamAWickets ?? 0} (${formatCricketOvers(details.teamABalls ?? 0)} ov) vs ${teamB} ${details.teamBRuns ?? scoreB}/${details.teamBWickets ?? 0} (${formatCricketOvers(details.teamBBalls ?? 0)} ov)${
        details.isSuperOver
          ? ` · Super Over: ${details.superOverTeamARuns ?? 0}/${details.superOverTeamAWickets ?? 0} vs ${details.superOverTeamBRuns ?? 0}/${details.superOverTeamBWickets ?? 0}`
          : ''
      }`;
    }
    if (sport === 'Volleyball') {
      return `${teamA} ${details.teamASetsWon ?? 0} sets vs ${teamB} ${details.teamBSetsWon ?? 0} sets (Current Set ${details.currentSet ?? 1}: ${scoreA}-${scoreB})`;
    }
    if (sport === 'Football' && (details.teamAPenalties > 0 || details.teamBPenalties > 0)) {
      return `${teamA} ${scoreA} - ${scoreB} ${teamB} (Pens: ${details.teamAPenalties}-${details.teamBPenalties})`;
    }
    if (sport === 'Kabaddi' && details.isTieBreaker) {
      return `${teamA} ${scoreA} - ${scoreB} ${teamB} (Tie-Breaker: ${details.tieBreakerScoreA ?? 0}-${details.tieBreakerScoreB ?? 0})`;
    }
    return `${teamA} ${scoreA} - ${scoreB} ${teamB}`;
  };

  const options: Array<{ value: MatchResultType; label: string }> = [
    { value: 'TEAM_A_WON', label: `${teamA} Won` },
    { value: 'TEAM_B_WON', label: `${teamB} Won` },
  ];

  if (sport === 'Football' || sport === 'Other') {
    options.push({ value: 'DRAW', label: 'Match Drawn' });
  }
  if (sport === 'Cricket' || sport === 'Kabaddi' || sport === 'Other') {
    options.push({ value: 'TIE', label: 'Match Tied' });
  }
  options.push({ value: 'NO_RESULT', label: 'No Result' });
  options.push({ value: 'ABANDONED', label: 'Match Abandoned' });

  const validation = validateMatchResult({
    sportType: sport,
    resultType,
    teamAName: teamA,
    teamBName: teamB,
    teamAScore: scoreA,
    teamBScore: scoreB,
    sportSpecificDetails: details,
  });

  function handleNextStep() {
    if (!resultType) {
      setLocalError('Select an official match outcome before continuing.');
      return;
    }
    if (!validation.valid) {
      setLocalError(validation.error || 'Selected result conflicts with current match scores.');
      return;
    }
    setLocalError(null);
    setConfirmStep(true);
  }

  async function handleFinalDeclare() {
    if (!validation.valid || !resultType) return;
    await onConfirmSubmit({
      resultType,
      winningMargin: winningMargin.trim(),
      resultDescription: resultDescription.trim(),
      mvpPlayerId: mvpPlayerId || undefined,
      mvpPlayerName: mvpPlayerName.trim() || undefined,
      finalSummary: finalSummary.trim() || undefined,
      confirmCorrection: alreadyDeclared,
    });
  }

  const eligiblePlayers = players.filter(
    (p) =>
      !stream.teamAId ||
      !stream.teamBId ||
      (typeof p.teamId === 'object'
        ? p.teamId?._id === stream.teamAId || p.teamId?._id === stream.teamBId
        : p.teamId === stream.teamAId || p.teamId === stream.teamBId)
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={alreadyDeclared ? 'Correct Official Match Result' : 'Declare Match Winner / Result'}
      subtitle="Admins must explicitly confirm the final outcome. Tournament bracket advancement occurs ONLY after confirmation."
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-lg bg-slate-900 text-white space-y-1">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            {sport} · Final Score Preview
          </p>
          <p className="font-mono tabular-nums text-xs sm:text-sm font-semibold text-emerald-300">
            {renderFinalScorePreview()}
          </p>
        </div>

        {alreadyDeclared && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">
                Currently declared: {score?.resultDescription || score?.winnerTeamName}
              </p>
              <p className="mt-0.5">
                Submitting a new outcome will overwrite the official result and record a correction in the audit log.
              </p>
            </div>
          </div>
        )}

        {localError && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {localError}
          </div>
        )}

        {!confirmStep ? (
          <>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Select Match Outcome <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setResultType(opt.value);
                      setLocalError(null);
                    }}
                    className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg border text-left transition-colors ${
                      resultType === opt.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {(resultType === 'TEAM_A_WON' || resultType === 'TEAM_B_WON') && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Winning Margin (Optional)
                </label>
                <input
                  type="text"
                  value={winningMargin}
                  onChange={(e) => setWinningMargin(e.target.value)}
                  maxLength={120}
                  placeholder={
                    sport === 'Cricket'
                      ? 'e.g. by 18 runs or by 4 wickets'
                      : sport === 'Volleyball'
                        ? 'e.g. 3-1 in sets'
                        : 'e.g. by 2 goals or 34-28'
                  }
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {eligiblePlayers.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    MVP / Player of the Match
                  </label>
                  <select
                    value={mvpPlayerId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setMvpPlayerId(pid);
                      const found = eligiblePlayers.find((p) => (p.id || p._id) === pid);
                      if (found) setMvpPlayerName(found.name);
                    }}
                    className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Select MVP (Optional) --</option>
                    {eligiblePlayers.map((p) => (
                      <option key={p.id || p._id} value={p.id || p._id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={eligiblePlayers.length > 0 ? '' : 'sm:col-span-2'}>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  MVP Name (Optional)
                </label>
                <input
                  type="text"
                  value={mvpPlayerName}
                  onChange={(e) => setMvpPlayerName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. R. Sharma"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Custom Result Summary (Optional)
              </label>
              <input
                type="text"
                value={resultDescription}
                onChange={(e) => setResultDescription(e.target.value)}
                maxLength={300}
                placeholder="Leave blank to auto-format from selected winner & margin"
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Final Broadcast Note (Optional)
              </label>
              <textarea
                rows={2}
                value={finalSummary}
                onChange={(e) => setFinalSummary(e.target.value)}
                maxLength={500}
                placeholder="Short summary displayed on the post-match broadcast graphic"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
              >
                <Trophy className="w-4 h-4" />
                <span>Review &amp; Confirm</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {alreadyDeclared ? 'Confirm Result Correction' : 'Confirm Official Match Result'}
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {resultDescription.trim() ||
                  (validation.winnerName
                    ? winningMargin.trim()
                      ? `${validation.winnerName} won ${winningMargin.trim()}`
                      : `${validation.winnerName} won the match`
                    : resultType === 'DRAW'
                      ? 'Match Drawn'
                      : resultType === 'TIE'
                        ? 'Match Tied'
                        : resultType === 'ABANDONED'
                          ? 'Match Abandoned'
                          : 'No Result')}
              </p>
              {mvpPlayerName.trim() && (
                <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                  <Award className="w-3.5 h-3.5" />
                  MVP: {mvpPlayerName.trim()}
                </p>
              )}
              <p className="text-xs text-slate-600">
                This will immediately broadcast to viewers, update tournament fixtures/points table, and log in audit history.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmStep(false)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleFinalDeclare}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>
                  {saving
                    ? 'Publishing...'
                    : alreadyDeclared
                      ? 'Confirm & Update Result'
                      : 'Confirm & Publish Result'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
