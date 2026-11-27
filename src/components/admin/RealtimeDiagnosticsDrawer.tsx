import { useState } from 'react';
import { Activity, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { Modal } from '../common/Modal.tsx';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  clearDiagTraces,
  measureSocketRtt,
  setDeepTracingEnabled,
  useRealtimeDiagnostics,
} from '../../utils/realtimeDiagnostics.ts';

interface RealtimeDiagnosticsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function RealtimeDiagnosticsDrawer({ open, onClose }: RealtimeDiagnosticsDrawerProps) {
  const diag = useRealtimeDiagnostics();
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);

  async function handlePing() {
    try {
      setPinging(true);
      setPingError(null);
      await measureSocketRtt(getSocketClient());
    } catch (err: any) {
      setPingError(err?.message || 'Ping failed');
    } finally {
      setPinging(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Real-Time Sync & Latency Diagnostics"
      subtitle="Inspect WebSocket transport, MongoDB server timing, and live Admin-to-Viewer/OBS delivery."
      maxWidthClass="max-w-3xl"
    >
      <div className="space-y-4">
        {/* Top Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500">Socket Status</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              {diag.socketConnected ? (
                <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{diag.socketConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500 uppercase">
              {diag.transport} · Reconnects: {diag.reconnectCount}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500">WS Ping RTT</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900">
              {diag.lastPingRttMs !== null ? `${diag.lastPingRttMs} ms` : '—'}
            </div>
            <button
              type="button"
              onClick={handlePing}
              disabled={pinging || !diag.socketConnected}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-500 disabled:opacity-45"
            >
              <RefreshCw className={`w-3 h-3 ${pinging ? 'animate-spin' : ''}`} />
              <span>{pinging ? 'Pinging...' : 'Measure RTT'}</span>
            </button>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500">API / DB Latency</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900">
              {diag.lastApiLatencyMs !== null ? `${diag.lastApiLatencyMs} ms` : '—'}
            </div>
            <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
              Server DB: {diag.lastServerDbMs !== null ? `${diag.lastServerDbMs} ms` : 'Enable trace'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] font-medium text-slate-500">Socket Delivery</div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900">
              {diag.lastSocketDeliveryMs !== null ? `${diag.lastSocketDeliveryMs} ms` : '—'}
            </div>
            <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
              OBS Ack: {diag.lastObsDeliveryMs !== null ? `${diag.lastObsDeliveryMs} ms` : '—'}
            </div>
          </div>
        </div>

        {pingError && (
          <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">
            {pingError}
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
          <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={diag.deepTracingEnabled}
              onChange={(e) => setDeepTracingEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Attach per-click server timing trace (x-maidan-diag)</span>
          </label>

          <button
            type="button"
            onClick={() => clearDiagTraces()}
            disabled={diag.traces.length === 0}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-45"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Log</span>
          </button>
        </div>

        {/* Recent Traced Events Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
              <span>Recent Scoring &amp; Sync Events</span>
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {diag.traces.length} recorded
            </span>
          </div>

          {diag.traces.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Trigger any score button to inspect local optimistic update, API round-trip, MongoDB latency, and socket propagation timing.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] text-slate-500">
                    <th className="py-2 px-3 font-semibold">Action</th>
                    <th className="py-2 px-2 font-semibold text-right">UI</th>
                    <th className="py-2 px-2 font-semibold text-right">API</th>
                    <th className="py-2 px-2 font-semibold text-right">DB</th>
                    <th className="py-2 px-2 font-semibold text-right">Socket</th>
                    <th className="py-2 px-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {diag.traces.map((t) => (
                    <tr key={t.traceId} className="hover:bg-slate-50/60">
                      <td className="py-2 px-3 font-sans text-slate-800 max-w-[200px] truncate" title={t.action}>
                        {t.action}
                      </td>
                      <td className="py-2 px-2 text-right text-emerald-700">
                        {t.uiOptimisticMs !== null ? `${t.uiOptimisticMs}ms` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-800">
                        {t.apiLatencyMs !== null ? `${t.apiLatencyMs}ms` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-600">
                        {t.serverDbMs !== null ? `${t.serverDbMs}ms` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right text-indigo-600">
                        {t.socketDeliveryMs !== null ? `${t.socketDeliveryMs}ms` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-sans font-semibold">
                        <span
                          className={
                            t.status === 'synced'
                              ? 'text-emerald-600'
                              : t.status === 'error'
                                ? 'text-red-600'
                                : t.status === 'queued'
                                  ? 'text-amber-600'
                                  : 'text-slate-500'
                          }
                        >
                          {t.status === 'synced'
                            ? 'Synced'
                            : t.status === 'queued'
                              ? 'Offline Queue'
                              : t.status === 'error'
                                ? 'Rolled Back'
                                : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
