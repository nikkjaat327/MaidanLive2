import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Flag } from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';

interface MatchReportModalProps {
  open: boolean;
  onClose: () => void;
  streamId: string;
  matchTitle: string;
}

const REPORT_CATEGORIES = [
  { value: 'STREAM_DOWN', label: 'Video Stream Not Playing / Down' },
  { value: 'WRONG_SCORE', label: 'Incorrect Scoreboard / Match Info' },
  { value: 'AUDIO_VIDEO_ISSUE', label: 'Audio / Video Sync or Quality Issue' },
  { value: 'CHAT_ABUSE', label: 'Chat Abuse / Spam Report' },
  { value: 'OTHER', label: 'Other Issue' },
] as const;

export function MatchReportModal({ open, onClose, streamId, matchTitle }: MatchReportModalProps) {
  const { customerUser } = useAuth();
  const [category, setCategory] = useState<string>('WRONG_SCORE');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState(customerUser?.name || '');
  const [reporterEmail, setReporterEmail] = useState(customerUser?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe the issue before submitting.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await platformOpsService.submitIssueReport(
        streamId,
        {
          category,
          description: description.trim(),
          reporterName: customerUser?.name || reporterName.trim() || undefined,
          reporterEmail: customerUser?.email || reporterEmail.trim() || undefined,
        },
        Boolean(customerUser)
      );
      setSubmitted(true);
      setDescription('');
    } catch (err) {
      setError(extractApiError(err, 'Unable to submit issue report.'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSubmitted(false);
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Report an Issue"
      subtitle={matchTitle}
      maxWidthClass="max-w-md"
    >
      {submitted ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-950">
              <p className="font-semibold">Issue report submitted</p>
              <p className="text-xs text-emerald-800 mt-1">
                Our broadcast operations team has received your report and will review it promptly.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {REPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {!customerUser && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Viewer"
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[40px] px-3 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Details <span className="text-red-600">*</span>
            </label>
            <textarea
              rows={3}
              maxLength={1000}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly explain what looks wrong or isn't working..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{submitting ? 'Submitting...' : 'Submit Report'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
