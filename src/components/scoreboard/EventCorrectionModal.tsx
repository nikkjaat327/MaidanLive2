import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { ScoreHistoryItem } from '../../types/index.ts';
import { Modal } from '../common/Modal.tsx';

interface EventCorrectionModalProps {
  open: boolean;
  onClose: () => void;
  eventItem: ScoreHistoryItem | null;
  teamA: string;
  teamB: string;
  saving: boolean;
  onConfirmCorrection: (payload: {
    eventId: string;
    correctionReason: string;
    teamAScore?: number;
    teamBScore?: number;
    revertToBeforeEvent?: boolean;
  }) => Promise<void>;
}

export function EventCorrectionModal({
  open,
  onClose,
  eventItem,
  teamA,
  teamB,
  saving,
  onConfirmCorrection,
}: EventCorrectionModalProps) {
  const [reason, setReason] = useState('');
  const [revertDiff, setRevertDiff] = useState(true);
  const [overrideScores, setOverrideScores] = useState(false);
  const [teamAScore, setTeamAScore] = useState('');
  const [teamBScore, setTeamBScore] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open && eventItem) {
      setReason('');
      setRevertDiff(true);
      setOverrideScores(false);
      setTeamAScore(String(eventItem.previousScore?.teamAScore ?? 0));
      setTeamBScore(String(eventItem.previousScore?.teamBScore ?? 0));
      setLocalError(null);
    }
  }, [open, eventItem]);

  if (!eventItem) return null;

  async function handleSubmit() {
    if (!reason.trim()) {
      setLocalError('A correction reason is required for the audit log.');
      return;
    }
    setLocalError(null);
    await onConfirmCorrection({
      eventId: eventItem!._id,
      correctionReason: reason.trim(),
      revertToBeforeEvent: !overrideScores && revertDiff,
      ...(overrideScores
        ? {
            teamAScore: Math.max(0, Number(teamAScore) || 0),
            teamBScore: Math.max(0, Number(teamBScore) || 0),
          }
        : {}),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Correct Scoring Event"
      subtitle="Corrections preserve original history and record a permanent audit entry."
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
          <p className="font-semibold text-slate-900">Original Event: {eventItem.action}</p>
          <p className="text-slate-500 font-mono tabular-nums">
            Before: {eventItem.previousScore?.teamAScore ?? 0}-{eventItem.previousScore?.teamBScore ?? 0} → After: {eventItem.updatedScore?.teamAScore ?? 0}-{eventItem.updatedScore?.teamBScore ?? 0}
          </p>
        </div>

        {localError && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{localError}</span>
          </div>
        )}

        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
            <input
              type="radio"
              checked={!overrideScores}
              onChange={() => setOverrideScores(false)}
            />
            <span>Revert this event&apos;s score delta from current total</span>
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
            <input
              type="radio"
              checked={overrideScores}
              onChange={() => setOverrideScores(true)}
            />
            <span>Explicitly set corrected team totals</span>
          </label>
        </div>

        {overrideScores && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">{teamA} Total</label>
              <input
                type="number"
                min={0}
                value={teamAScore}
                onChange={(e) => setTeamAScore(e.target.value)}
                className="w-full min-h-[40px] px-3 font-mono text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">{teamB} Total</label>
              <input
                type="number"
                min={0}
                value={teamBScore}
                onChange={(e) => setTeamBScore(e.target.value)}
                className="w-full min-h-[40px] px-3 font-mono text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Correction Reason <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={280}
            placeholder="e.g. Umpire signalled 4 runs instead of 6 / wrong team selected"
            className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Correction'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
