import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Eye,
  FileText,
  History,
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
import { PaymentProofViewerModal } from '../../components/common/PaymentProofViewerModal.tsx';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';

export function AdminRegistrationsPage() {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'ALL';
  const highlightedId = searchParams.get('highlight') || '';

  const [registrations, setRegistrations] = useState<TournamentRegistrationData[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selected, setSelected] = useState<TournamentRegistrationData | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [viewerDoc, setViewerDoc] = useState<{
    title: string;
    urlPath: string;
    fileName: string;
    mimeType: string;
  } | null>(null);

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
    const requiresPay =
      (reg.paymentType === 'ENTRY_FEE' || reg.paymentType === 'SECURITY_DEPOSIT' || reg.feeAmount > 0) &&
      reg.paymentStatus !== 'PAYMENT_APPROVED';
    setDecision(requiresPay && initialDecision === 'APPROVED' ? 'REJECTED' : initialDecision);
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
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Captain Registration Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review team registrations, edited teams awaiting reapproval, payment status, and verification documents.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {(['ALL', 'PENDING', 'PENDING_REAPPROVAL', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                statusFilter === st ? 'bg-[#EA580C] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st.replace(/_/g, ' ')}
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
            const requiresPayment =
              reg.paymentType === 'ENTRY_FEE' ||
              reg.paymentType === 'SECURITY_DEPOSIT' ||
              reg.feeAmount > 0;
            const paymentApproved = !requiresPayment || reg.paymentStatus === 'PAYMENT_APPROVED';
            const isHighlighted = highlightedId === reg.id;

            return (
              <div
                key={reg.id}
                className={`bg-white rounded-xl p-4 sm:p-5 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isHighlighted ? 'border-[#EA580C] ring-2 ring-orange-200' : 'border-slate-200'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        reg.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : reg.status === 'PENDING_REAPPROVAL'
                            ? 'bg-orange-100 text-orange-800'
                            : reg.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : reg.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {reg.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="font-semibold text-slate-700">{tournamentTitle}</span>
                    {requiresPayment && (
                      <>
                        <span className="text-slate-500">·</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold ${
                            paymentApproved
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          <CreditCard className="w-3 h-3" />
                          <span>
                            {reg.paymentType === 'SECURITY_DEPOSIT' ? 'Deposit' : 'Fee'} ₹{reg.feeAmount}:{' '}
                            {(reg.paymentStatus || 'PAYMENT_PENDING').replace(/_/g, ' ')}
                          </span>
                        </span>
                      </>
                    )}
                    {(reg.editCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                        <History className="w-3 h-3" />
                        <span>
                          Post-approval edits: {reg.editCount}/{reg.maxEditsAfterApproval || 2}
                        </span>
                      </span>
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

                  <div className="flex flex-wrap items-center gap-3">
                    {reg.verificationDocMeta?.fileId && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewerDoc({
                            title: `Verification Document · ${reg.teamName}`,
                            urlPath: `/v1/documents/${reg.verificationDocMeta!.fileId}`,
                            fileName: reg.verificationDocMeta!.fileName,
                            mimeType: reg.verificationDocMeta!.mimeType,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Inspect Document ({reg.verificationDocMeta.fileName})</span>
                      </button>
                    )}
                    {!reg.verificationDocMeta?.fileId && reg.verificationDocUrl && (
                      <a
                        href={reg.verificationDocUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#EA580C] hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Inspect Document Link</span>
                      </a>
                    )}
                    {reg.paymentProofMeta?.fileId && (
                      <button
                        type="button"
                        onClick={() =>
                          setViewerDoc({
                            title: `Payment Proof · ${reg.teamName}`,
                            urlPath: `/v1/payments/${reg.id}/proof`,
                            fileName: reg.paymentProofMeta!.fileName,
                            mimeType: reg.paymentProofMeta!.mimeType,
                          })
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Payment Proof</span>
                      </button>
                    )}
                  </div>

                  {reg.reviewNotes && (
                    <p className="text-xs text-slate-500 italic">Review note: {reg.reviewNotes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {requiresPayment && !paymentApproved && (
                    <Link
                      to={`/admin/payments?registrationId=${reg.id}`}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Verify Payment First</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => openReview(reg, 'APPROVED')}
                    className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {reg.status === 'PENDING_REAPPROVAL'
                        ? 'Inspect & Reapprove'
                        : reg.status === 'PENDING'
                          ? 'Inspect & Approve'
                          : 'Inspect / Update'}
                    </span>
                  </button>
                  {(reg.status === 'PENDING' || reg.status === 'PENDING_REAPPROVAL') && (
                    <button
                      type="button"
                      onClick={() => openReview(reg, 'REJECTED')}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
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

      {viewerDoc && (
        <PaymentProofViewerModal
          open={Boolean(viewerDoc)}
          onClose={() => setViewerDoc(null)}
          title={viewerDoc.title}
          fileUrlPath={viewerDoc.urlPath}
          fileName={viewerDoc.fileName}
          mimeTypeHint={viewerDoc.mimeType}
          portal="admin"
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Review Registration: ${selected?.teamName || ''}`}
        subtitle="Only organizers & admins can view verification documents, payment status, and edit history."
        maxWidthClass="max-w-2xl"
      >
        {selected && (() => {
          const needsPayment =
            (selected.paymentType === 'ENTRY_FEE' ||
              selected.paymentType === 'SECURITY_DEPOSIT' ||
              selected.feeAmount > 0) &&
            selected.paymentStatus !== 'PAYMENT_APPROVED';

          return (
            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <p>
                  <strong>Captain:</strong> {selected.captainName} ({selected.captainPhone || 'No phone'} ·{' '}
                  {selected.captainEmail || 'No email'})
                </p>
                {selected.verificationDocMeta?.fileId && (
                  <p className="flex items-center gap-2">
                    <strong>Verification Doc:</strong>
                    <button
                      type="button"
                      onClick={() =>
                        setViewerDoc({
                          title: `Verification Doc · ${selected.teamName}`,
                          urlPath: `/v1/documents/${selected.verificationDocMeta!.fileId}`,
                          fileName: selected.verificationDocMeta!.fileName,
                          mimeType: selected.verificationDocMeta!.mimeType,
                        })
                      }
                      className="text-[#EA580C] font-semibold underline"
                    >
                      Open {selected.verificationDocMeta.fileName}
                    </button>
                  </p>
                )}
                {selected.verificationNotes && (
                  <p>
                    <strong>Captain Notes:</strong> {selected.verificationNotes}
                  </p>
                )}
                {needsPayment && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-medium flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Payment approval required before team approval (Current:{' '}
                      {(selected.paymentStatus || 'PAYMENT_PENDING').replace(/_/g, ' ')}).
                    </span>
                    <Link
                      to={`/admin/payments?registrationId=${selected.id}`}
                      className="text-xs font-bold text-[#EA580C] underline"
                    >
                      Go to Payment Verification →
                    </Link>
                  </div>
                )}
              </div>

              {(selected.editHistory || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Post-Approval Edit History ({selected.editCount || 0}/{selected.maxEditsAfterApproval || 2})
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {(selected.editHistory || []).map((ed, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-orange-50/70 border border-orange-200 text-xs">
                        <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                          <span>Edit #{ed.editNumber} by {ed.editedByName}</span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(ed.editedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-700 mt-0.5">{ed.changesSummary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Submitted Roster ({(selected.roster || []).length})
                </h4>
                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {(selected.roster || []).map((player, idx) => (
                    <div key={idx} className="p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <TeamAvatar name={player.name} logoUrl={player.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900">{player.name}</span>{' '}
                          {player.jerseyNumber != null && (
                            <span className="font-mono text-slate-500">#{player.jerseyNumber}</span>
                          )}
                          {player.role && <span className="text-slate-500"> · {player.role}</span>}
                          <div className="text-slate-500">DOB: {player.dateOfBirth || '—'}</div>
                        </div>
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
                      disabled={opt === 'APPROVED' && needsPayment}
                      onClick={() => setDecision(opt)}
                      className={`flex-1 min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-lg border disabled:opacity-45 ${
                        decision === opt
                          ? opt === 'APPROVED'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {opt === 'APPROVED'
                        ? selected.status === 'PENDING_REAPPROVAL'
                          ? 'Reapprove & Sync Team'
                          : 'Approve & Add Team'
                        : 'Reject Registration'}
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
                  className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || (decision === 'APPROVED' && needsPayment)}
                  className="min-h-[36px] px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Submit Review'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
