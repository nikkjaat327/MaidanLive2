import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { ROLE_LABELS } from '../../constants/roles.ts';
import { authService } from '../../services/auth/authService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { DatabaseDiagnosticsData, UserSessionData } from '../../types/index.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function AdminSettingsPage() {
  const { adminUser, refreshAdmin } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // System & DB diagnostics
  const [diagnostics, setDiagnostics] = useState<DatabaseDiagnosticsData | null>(null);
  const [retryingMongo, setRetryingMongo] = useState(false);

  // 2FA TOTP Setup
  const [totpSetup, setTotpSetup] = useState<{
    manualSecret: string;
    otpAuthUri: string;
    qrDataUrl: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [saving2fa, setSaving2fa] = useState(false);

  // Active Sessions
  const [sessions, setSessions] = useState<UserSessionData[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const loadDiagnosticsAndSessions = useCallback(async () => {
    try {
      const [diagRes, sessRes] = await Promise.all([
        platformOpsService.getDiagnostics().catch(() => null),
        authService.listSessions('admin').catch(() => [] as UserSessionData[]),
      ]);
      if (diagRes) setDiagnostics(diagRes);
      setSessions(sessRes);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnosticsAndSessions();
  }, [loadDiagnosticsAndSessions]);

  async function handleRetryMongo() {
    try {
      setRetryingMongo(true);
      setError(null);
      const res = await platformOpsService.retryMongoConnection();
      setSuccess(
        `${res.message}${res.syncedRecords ? ` (${res.syncedRecords} SQLite records synced)` : ''}`
      );
      await loadDiagnosticsAndSessions();
    } catch (err) {
      setError(extractApiError(err, 'Failed to retry MongoDB connection.'));
    } finally {
      setRetryingMongo(false);
    }
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await authService.changeAdminPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Password updated successfully.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to change password.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleStart2FA() {
    try {
      setSaving2fa(true);
      setError(null);
      const res = await authService.setup2FA('admin');
      setTotpSetup(res);
    } catch (err) {
      setError(extractApiError(err, 'Failed to initialize 2FA setup.'));
    } finally {
      setSaving2fa(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving2fa(true);
      setError(null);
      await authService.verify2FA(totpCode.trim(), 'admin');
      setTotpSetup(null);
      setTotpCode('');
      await refreshAdmin();
      setSuccess('Two-factor authentication (TOTP) enabled for your account.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to verify 2FA code.'));
    } finally {
      setSaving2fa(false);
    }
  }

  async function handleDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving2fa(true);
      setError(null);
      await authService.disable2FA(disablePassword, 'admin');
      setDisablePassword('');
      await refreshAdmin();
      setSuccess('Two-factor authentication disabled.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to disable 2FA.'));
    } finally {
      setSaving2fa(false);
    }
  }

  async function handleRevokeSession(sessionId: string) {
    try {
      await authService.revokeSession(sessionId, 'admin');
      setSuccess('Session revoked.');
      await loadDiagnosticsAndSessions();
    } catch (err) {
      setError(extractApiError(err, 'Failed to revoke session.'));
    }
  }

  async function handleLogoutAll() {
    try {
      await authService.logoutAllSessions('admin');
      setSuccess('All active sessions revoked.');
      await loadDiagnosticsAndSessions();
    } catch (err) {
      setError(extractApiError(err, 'Failed to revoke all sessions.'));
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
          Security, Sessions &amp; System Diagnostics
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Dual-database health, MediaMTX endpoints, 2FA authenticator setup, and active device sessions.
        </p>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      {/* Active Account Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-base font-bold text-slate-900">Active Admin Session</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Name</p>
            <p className="font-medium text-slate-900 mt-0.5">{adminUser?.name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="font-medium text-slate-900 mt-0.5">{adminUser?.email}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Role</p>
            <p className="font-medium text-slate-900 mt-0.5">
              {adminUser ? ROLE_LABELS[adminUser.role] : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Dual Database Engine & MediaMTX Diagnostics */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#EA580C]" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Database Engine &amp; Broadcast Diagnostics
              </h2>
              <p className="text-xs text-slate-500">
                Automatic SQLite fallback preserves operations when MongoDB is unavailable.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={retryingMongo}
            onClick={handleRetryMongo}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retryingMongo ? 'animate-spin' : ''}`} />
            <span>{retryingMongo ? 'Connecting...' : 'Retry MongoDB'}</span>
          </button>
        </div>

        {diagnostics ? (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">Active Database Engine</p>
                <p className="font-mono text-sm font-bold text-slate-900 uppercase mt-1">
                  {diagnostics.database.engine}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Mongo: {diagnostics.database.mongoConnected ? 'Connected' : 'Fallback / Disconnected'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">SQLite Fallback Store</p>
                <p className="font-mono text-[11px] font-semibold text-slate-800 mt-1 break-all">
                  {diagnostics.database.sqlitePath}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Runtime: Node {diagnostics.nodeVersion} · Up {Math.floor(diagnostics.uptimeSeconds / 60)}m
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-slate-500">MediaMTX Endpoints</p>
                <p className="font-mono text-[11px] text-slate-800 mt-1 truncate">
                  RTMP: {diagnostics.mediamtx.rtmpBase}
                </p>
                <p className="font-mono text-[11px] text-slate-600 truncate">
                  HLS: {diagnostics.mediamtx.hlsBase}
                </p>
              </div>
            </div>

            {diagnostics.database.lastMongoError && (
              <p className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-mono text-[11px]">
                Last Mongo error: {diagnostics.database.lastMongoError}
              </p>
            )}

            {diagnostics.database.sqliteCounts && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  SQLite Collection Record Counts ({diagnostics.database.totalSqliteRecords} total)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(diagnostics.database.sqliteCounts).map(([col, count]) => (
                    <span
                      key={col}
                      className="px-2 py-1 rounded bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-700"
                    >
                      {col}: <strong>{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Loading diagnostics...</p>
        )}
      </div>

      {/* Personal 2FA (TOTP) Setup */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {adminUser?.totpEnabled ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            )}
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Two-Factor Authentication (TOTP)
              </h2>
              <p className="text-xs text-slate-500">
                Status:{' '}
                <strong className={adminUser?.totpEnabled ? 'text-emerald-600' : 'text-amber-600'}>
                  {adminUser?.totpEnabled ? 'Enabled & Active' : 'Not Configured'}
                </strong>
              </p>
            </div>
          </div>

          {!adminUser?.totpEnabled && !totpSetup && (
            <button
              type="button"
              disabled={saving2fa}
              onClick={handleStart2FA}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Enable 2FA</span>
            </button>
          )}
        </div>

        {totpSetup && (
          <form
            onSubmit={handleVerify2FA}
            className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <img
                src={totpSetup.qrDataUrl}
                alt="2FA Authenticator QR Code"
                className="w-36 h-36 rounded-lg border border-slate-200 bg-white p-1.5"
              />
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-slate-900">
                  Scan this QR code with Google Authenticator, Authy, or 1Password:
                </p>
                <p className="text-slate-600">
                  Manual secret:{' '}
                  <code className="px-2 py-0.5 rounded bg-slate-200 font-mono text-slate-900">
                    {totpSetup.manualSecret}
                  </code>
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="min-h-[40px] w-40 px-3 py-1.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    disabled={saving2fa || totpCode.length !== 6}
                    className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving2fa ? 'Verifying...' : 'Verify & Activate 2FA'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {adminUser?.totpEnabled && (
          <form onSubmit={handleDisable2FA} className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
            <input
              type="password"
              required
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Current password to disable 2FA"
              className="min-h-[40px] flex-1 min-w-[200px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={saving2fa}
              className="min-h-[40px] px-4 py-1.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
            >
              Disable 2FA
            </button>
          </form>
        )}
      </div>

      {/* Change Password */}
      <form
        onSubmit={handlePasswordUpdate}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <h2 className="text-base font-bold text-slate-900">Change Password</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="min-h-[42px] px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Updating...' : 'Update Password'}
        </button>
      </form>

      {/* Active Sessions Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="w-4 h-4 text-[#EA580C]" />
            <h2 className="text-base font-bold text-slate-900">Active Sessions</h2>
          </div>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={handleLogoutAll}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Revoke All Sessions</span>
            </button>
          )}
        </div>

        {loadingSessions ? (
          <div className="p-5 text-xs text-slate-500">Loading active sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-5 text-xs text-slate-500">No active tracked refresh sessions found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {s.userAgent || 'Browser / Device'}{' '}
                    <span className="font-mono text-[11px] text-slate-500">({s.ipAddress || 'unknown IP'})</span>
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    Last active: {new Date(s.lastActiveAt).toLocaleString()} · Expires:{' '}
                    {new Date(s.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeSession(s.id)}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded-md self-start sm:self-auto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Revoke</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
