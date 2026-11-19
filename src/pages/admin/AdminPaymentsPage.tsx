import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  History,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { DepositRefundStatus, TournamentRegistrationData } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { PaymentProofViewerModal } from '../../components/common/PaymentProofViewerModal.tsx';

const PAYMENT_STATUS_FILTERS = [
  'ALL',
  'PROOF_SUBMITTED',
  'UNDER_VERIFICATION',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_PENDING',
] as const;

export function AdminPaymentsPage() {
  const [searchParams] = useSearchParams();
  const highlightedRegId = searchParams.get('registrationId') || '';

  const [payments, setPayments] = useState<TournamentRegistrationData[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [viewerTarget, setViewerTarget] = useState<TournamentRegistrationData | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TournamentRegistrationData | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<TournamentRegistrationData | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      setError(null);
      const list = await platformOpsService.listAdminPayments(
        statusFilter !== 'ALL' ? { paymentStatus: statusFilter } : undefined
      );
      setPayments(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load payment verification queue.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  async function handleVerify(
    reg: TournamentRegistrationData,
    decision: 'UNDER_VERIFICATION' | 'APPROVE'
  ) {
    try {
      setProcessingId(reg.id);
      setError(null);
      const res = await platformOpsService.verifyAdminPayment(reg.id, { decision });
      setSuccess(res.message);
      await loadPayments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update payment status.'));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setError('Please enter a mandatory rejection reason so the captain knows what to correct.');
      return;
    }
    try {
      setProcessingId(rejectTarget.id);
      setError(null);
      const res = await platformOpsService.verifyAdminPayment(rejectTarget.id, {
        decision: 'REJECT',
        rejectionReason: rejectReason.trim(),
      });
      setSuccess(res.message);
      setRejectTarget(null);
      setRejectReason('');
      await loadPayments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to reject payment proof.'));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRefundChange(
    reg: TournamentRegistrationData,
    refundStatus: DepositRefundStatus
  ) {
    try {
      setProcessingId(reg.id);
      setError(null);
      await platformOpsService.updateDepositRefundStatus(reg.id, { refundStatus });
      setSuccess(`Updated ${reg.teamName} deposit refund status to ${refundStatus.replace(/_/g, ' ')}.`);
      await loadPayments();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update deposit refund status.'));
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Payment &amp; Security Deposit Verification
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Inspect protected payment proofs, approve or reject team payments, and manage refundable security deposits.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPayments}
          className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {PAYMENT_STATUS_FILTERS.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-lg border transition-colors ${
              statusFilter === st
                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {st === 'ALL' ? 'All Payments' : st.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="w-6 h-6" />}
          title="No payment records match this filter"
          description="Captains registering for tournaments with Entry Fees or Refundable Security Deposits will appear here."
        />
      ) : (
        <div className="space-y-3">
          {payments.map((reg) => {
            const tournamentTitle =
              typeof reg.tournamentId === 'object' && reg.tournamentId
                ? reg.tournamentId.name
                : reg.tournament?.name || 'Tournament';
            const isDeposit = reg.paymentType === 'SECURITY_DEPOSIT';
            const pStatus = reg.paymentStatus || 'PAYMENT_PENDING';
            const isHighlighted = highlightedRegId === reg.id;

            return (
              <div
                key={reg.id}
                className={`bg-white rounded-xl p-4 sm:p-5 border transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isHighlighted ? 'border-[#EA580C] ring-2 ring-orange-200' : 'border-slate-200'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        pStatus === 'PAYMENT_APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : pStatus === 'PAYMENT_REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : pStatus === 'PROOF_SUBMITTED' || pStatus === 'UNDER_VERIFICATION'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {pStatus.replace(/_/g, ' ')}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-semibold ${
                        isDeposit
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isDeposit ? 'Refundable Security Deposit' : 'Entry Fee'} · ₹{reg.feeAmount}
                    </span>
                    {isDeposit && reg.refundStatus && (
                      <span className="px-2 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Refund: {reg.refundStatus.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className="text-slate-500">·</span>
                    <span className="font-semibold text-slate-700">{tournamentTitle}</span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900">
                    {reg.teamName}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      (Team Status: {reg.status.replace(/_/g, ' ')})
                    </span>
                  </h3>

                  <p className="text-xs text-slate-600">
                    Captain: <strong>{reg.captainName}</strong>
                    {reg.captainPhone ? ` · ${reg.captainPhone}` : ''}
                    {reg.paymentSubmittedAt
                      ? ` · Submitted ${new Date(reg.paymentSubmittedAt).toLocaleString()}`
                      : ' · Proof not uploaded yet'}
                  </p>

                  {reg.paymentReferenceNote && (
                    <p className="text-xs text-slate-600">
                      Reference / UTR Note: <span className="font-mono">{reg.paymentReferenceNote}</span>
                    </p>
                  )}
                  {reg.paymentRejectionReason && (
                    <p className="text-xs font-medium text-red-700">
                      Rejection Reason: {reg.paymentRejectionReason}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {reg.paymentProofMeta?.fileId && (
                    <button
                      type="button"
                      onClick={() => setViewerTarget(reg)}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Proof</span>
                    </button>
                  )}

                  {reg.paymentProofMeta?.fileId &&
                    pStatus === 'PROOF_SUBMITTED' && (
                      <button
                        type="button"
                        disabled={processingId === reg.id}
                        onClick={() => handleVerify(reg, 'UNDER_VERIFICATION')}
                        className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Mark Reviewing</span>
                      </button>
                    )}

                  {reg.paymentProofMeta?.fileId && pStatus !== 'PAYMENT_APPROVED' && (
                    <button
                      type="button"
                      disabled={processingId === reg.id}
                      onClick={() => handleVerify(reg, 'APPROVE')}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve Payment</span>
                    </button>
                  )}

                  {pStatus !== 'PAYMENT_REJECTED' && pStatus !== 'PAYMENT_APPROVED' && (
                    <button
                      type="button"
                      disabled={processingId === reg.id}
                      onClick={() => {
                        setRejectTarget(reg);
                        setRejectReason('');
                      }}
                      className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>
                  )}

                  {isDeposit && pStatus === 'PAYMENT_APPROVED' && (
                    <select
                      aria-label="Deposit refund status"
                      disabled={processingId === reg.id}
                      value={reg.refundStatus || 'HELD'}
                      onChange={(e) =>
                        handleRefundChange(reg, e.target.value as DepositRefundStatus)
                      }
                      className="min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800"
                    >
                      <option value="HELD">Deposit Held</option>
                      <option value="REFUND_INITIATED">Refund Initiated</option>
                      <option value="REFUNDED">Deposit Refunded</option>
                      <option value="FORFEITED">Deposit Forfeited</option>
                    </select>
                  )}

                  {(reg.paymentHistory || []).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setHistoryTarget(reg)}
                      className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewerTarget && (
        <PaymentProofViewerModal
          open={Boolean(viewerTarget)}
          onClose={() => setViewerTarget(null)}
          title={`Payment Proof · ${viewerTarget.teamName}`}
          fileUrlPath={`/v1/payments/${viewerTarget.id}/proof`}
          fileName={viewerTarget.paymentProofMeta?.fileName || `${viewerTarget.teamName}-payment`}
          mimeTypeHint={viewerTarget.paymentProofMeta?.mimeType || ''}
          portal="admin"
        />
      )}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={`Reject Payment · ${rejectTarget?.teamName || ''}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <p className="text-xs text-slate-600">
            Specify why this payment screenshot or receipt cannot be approved. The captain will receive this feedback and can re-upload a corrected proof.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rejection Reason *
            </label>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Transaction reference mismatch / blurry receipt image / partial amount"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(processingId)}
              className="min-h-[34px] px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title={`Payment & Deposit Timeline · ${historyTarget?.teamName || ''}`}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
          {(historyTarget?.paymentHistory || []).map((item, idx) => (
            <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-900 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#EA580C]" />
                  {item.action.replace(/_/g, ' ')}
                </span>
                <span className="text-[11px] text-slate-500">
                  {new Date(item.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-slate-600">
                By <strong>{item.actorName || 'System'}</strong> · Status:{' '}
                <span className="font-semibold">{item.status.replace(/_/g, ' ')}</span>
              </p>
              {item.notes && <p className="text-slate-700 italic">{item.notes}</p>}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
