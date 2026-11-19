import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Flag } from 'lucide-react';
import { MatchReportData } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';

const REPORT_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'] as const;

export function AdminReportsPage() {
  const [reports, setReports] = useState<MatchReportData[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] = useState<MatchReportData | null>(null);
  const [nextStatus, setNextStatus] = useState<MatchReportData['status']>('IN_REVIEW');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      setError(null);
      const list = await platformOpsService.listAdminReports(statusFilter || undefined);
      setReports(list);
    } catch (err) {
      setError(extractApiError(err, 'Failed to load issue reports.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  function openTriageModal(rep: MatchReportData) {
    setSelectedReport(rep);
    setNextStatus(rep.status === 'OPEN' ? 'IN_REVIEW' : rep.status);
    setResolutionNotes(rep.resolutionNotes || '');
  }

  async function handleSaveTriage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedReport) return;
    try {
      setSaving(true);
      setError(null);
      await platformOpsService.updateAdminReport(selectedReport.id, {
        status: nextStatus,
        resolutionNotes: resolutionNotes.trim(),
      });
      setSelectedReport(null);
      setSuccess('Issue report updated.');
      await loadReports();
    } catch (err) {
      setError(extractApiError(err, 'Failed to update report.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Viewer Issue Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Triage stream playback outages, wrong score alerts, audio issues, and chat abuse reports submitted by viewers.
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Statuses</option>
          {REPORT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {loading ? (
        <TableSkeleton rows={4} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<Flag className="w-6 h-6" />}
          title="No issue reports found"
          description={
            statusFilter
              ? `No reports currently marked as ${statusFilter.replace(/_/g, ' ')}.`
              : 'Viewer-submitted stream or score issue reports will appear here.'
          }
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Category &amp; Stream</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Reporter</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {reports.map((rep) => {
                const streamObj =
                  typeof rep.liveStreamId === 'object' && rep.liveStreamId
                    ? rep.liveStreamId
                    : rep.stream;
                const streamId =
                  typeof rep.liveStreamId === 'object' && rep.liveStreamId
                    ? rep.liveStreamId._id
                    : rep.stream?.id || String(rep.liveStreamId || '');
                const streamLabel =
                  streamObj?.matchTitle ||
                  (streamObj?.teamAName && streamObj?.teamBName
                    ? `${streamObj.teamAName} vs ${streamObj.teamBName}`
                    : 'Match Stream');

                return (
                  <tr key={rep.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 px-4">
                      <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-red-700 font-semibold text-[11px]">
                        {rep.category.replace(/_/g, ' ')}
                      </span>
                      <div className="mt-1 text-xs font-medium text-slate-900">{streamLabel}</div>
                      {streamId && (
                        <Link
                          to={`/admin/scoreboard/${streamId}`}
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline mt-0.5"
                        >
                          <span>Score Control</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 max-w-sm">
                      <p className="break-words">{rep.description}</p>
                      {rep.resolutionNotes && (
                        <p className="mt-1 text-emerald-800 bg-emerald-50 px-2 py-1 rounded">
                          Resolution: {rep.resolutionNotes}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="font-medium text-slate-800">{rep.reporterName || 'Viewer'}</div>
                      {rep.reporterEmail && <div className="text-slate-500">{rep.reporterEmail}</div>}
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(rep.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-semibold ${
                          rep.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rep.status === 'IN_REVIEW'
                              ? 'bg-amber-100 text-amber-800'
                              : rep.status === 'DISMISSED'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {rep.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openTriageModal(rep)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Triage</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(selectedReport)}
        onClose={() => setSelectedReport(null)}
        title="Triage Viewer Issue Report"
      >
        {selectedReport && (
          <form onSubmit={handleSaveTriage} className="space-y-4">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-semibold text-slate-900">
                Category: {selectedReport.category.replace(/_/g, ' ')}
              </div>
              <p className="text-slate-700">{selectedReport.description}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as MatchReportData['status'])}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {REPORT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Resolution Notes
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe what action was taken (e.g., corrected score, verified stream link)..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Update Report'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
