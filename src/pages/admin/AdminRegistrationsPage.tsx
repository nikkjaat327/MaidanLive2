import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import { TournamentRegistrationData } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

export function AdminRegistrationsPage() {
  const [registrations, setRegistrations] = useState<TournamentRegistrationData[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selected, setSelected] = useState<TournamentRegistrationData | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRegistrations = useCallback(async () => {
    try {
      setError(null);
      const list = await platformOpsService.listAdminRegistrations(
        statusFilter !== 'ALL' ? { status: statusFilter } : undefined
      );
      setRegistrations(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load tournament registrations.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  function openReview(reg: TournamentRegistrationData, initialDecision: 'APPROVED' | 'REJECTED') {
    setSelected(reg);
    setDecision(initialDecision);
    setReviewNotes(reg.reviewNotes || '');
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      setSubmitting(true);
      setError(null);
      await platformOpsService.reviewAdminRegistration(selected.id, {
        decision,
        reviewNotes: reviewNotes.trim(),
      });
      setSuccess(
        decision === 'APPROVED'
          ? `Approved "${selected.teamName}". Team & players synced into tournament.`
          : `Rejected registration for "${selected.teamName}".`
      );
      setSelected(null);
      await loadRegistrations();
    } catch (err) {
      setError(extractApiError(err, 'Failed to submit registration review.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Captain Registration Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review team rosters, age eligibility (&lt;18 minor guardian consent), and private captain verification documents.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st ? 'bg-[#EA580C] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="w-6 h-6" />}
          title="No registrations in this queue"
          description="Captain-submitted tournament team registrations will appear here for organizer review."
        />
      ) : (
        <div className="space-y-3">
          {registrations.map((reg) => {
            const tournamentTitle =
              typeof reg.tournamentId === 'object' && reg.tournamentId
                ? reg.tournamentId.name
                : reg.tournament?.name || 'Tournament';
            const minorCount = (reg.roster || []).filter((r) => r.isMinor).length;

            return (
              <div
                key={reg.id}
                className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        reg.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : reg.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-800'
                            : reg.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {reg.status}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="font-semibold text-slate-700">{tournamentTitle}</span>
                    {reg.feeAmount > 0 && (
                      <>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono text-slate-600">
                          Fee ₹{reg.feeAmount} ({reg.feeStatus})
                        </span>
                      </>
                    )}
                    {minorCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-semibold">
                        <ShieldAlert className="w-3 h-3" />
                        {minorCount} Minor{minorCount === 1 ? '' : 's'} (&lt;18)
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {reg.teamName}{' '}
                    {reg.teamShortName && (
                      <span className="text-xs font-mono text-slate-500">({reg.teamShortName})</span>
                    )}
                  </h3>

                  <p className="text-xs text-slate-600">
                    Captain: <strong>{reg.captainName}</strong>
                    {reg.captainPhone ? ` · ${reg.captainPhone}` : ''}
                    {reg.captainEmail ? ` · ${reg.captainEmail}` : ''}
                    {reg.city ? ` · ${reg.city}` : ''} ·{' '}
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" /> {(reg.roster || []).length} players
                    </span>
                  </p>

                  {reg.verificationDocUrl && (
                    <a
                      href={reg.verificationDocUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#EA580C] hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Inspect Organizer Verification Document</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {reg.reviewNotes && (
                    <p className="text-xs text-slate-500 italic">Review note: {reg.reviewNotes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openReview(reg, 'APPROVED')}
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{reg.status === 'PENDING' ? 'Inspect & Approve' : 'Inspect / Update'}</span>
                  </button>
                  {reg.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => openReview(reg, 'REJECTED')}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Review Registration: ${selected?.teamName || ''}`}
        subtitle="Only organizers & admins can view verification documents and guardian details."
        maxWidthClass="max-w-2xl"
      >
        {selected && (
          <form onSubmit={handleReviewSubmit} className="space-y-4">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <p>
                <strong>Captain:</strong> {selected.captainName} ({selected.captainPhone || 'No phone'} ·{' '}
                {selected.captainEmail || 'No email'})
              </p>
              {selected.verificationDocUrl && (
                <p>
                  <strong>Private Verification Doc:</strong>{' '}
                  <a
                    href={selected.verificationDocUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#EA580C] underline break-all"
                  >
                    {selected.verificationDocUrl}
                  </a>
                </p>
              )}
              {selected.verificationNotes && (
                <p>
                  <strong>Captain Notes:</strong> {selected.verificationNotes}
                </p>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Submitted Roster ({(selected.roster || []).length})
              </h4>
              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {(selected.roster || []).map((player, idx) => (
                  <div key={idx} className="p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <span className="font-semibold text-slate-900">{player.name}</span>{' '}
                      {player.jerseyNumber != null && (
                        <span className="font-mono text-slate-500">#{player.jerseyNumber}</span>
                      )}
                      {player.role && <span className="text-slate-500"> · {player.role}</span>}
                      <div className="text-slate-500">DOB: {player.dateOfBirth || '—'}</div>
                    </div>
                    {player.isMinor ? (
                      <div className="text-right">
                        <span className="inline-block px-2 py-0.5 rounded bg-orange-100 text-orange-800 font-semibold">
                          Minor · Consent {player.guardianConsent ? 'Signed' : 'Missing'}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Guardian: {player.guardianName || '—'} ({player.guardianPhone || '—'})
                        </div>
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                        Adult (18+)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Decision</label>
              <div className="flex gap-2">
                {(['APPROVED', 'REJECTED'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setDecision(opt)}
                    className={`flex-1 min-h-[42px] px-3 py-2 text-xs font-bold rounded-lg border ${
                      decision === opt
                        ? opt === 'APPROVED'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {opt === 'APPROVED' ? 'Approve & Add Team to Tournament' : 'Reject Registration'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Review Notes (Visible to Captain)
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Optional feedback, ID check remarks, or rejection reason..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Submit Review'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
