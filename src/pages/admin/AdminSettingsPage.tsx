import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.ts';
import { ROLE_LABELS } from '../../constants/roles.ts';
import { authService } from '../../services/auth/authService.ts';
import { extractApiError, publicApi } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function AdminSettingsPage() {
  const { adminUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; dbMode: string } | null>(null);

  useEffect(() => {
    publicApi
      .get<{ ok: boolean; dbMode: string }>('/health')
      .then((res) => setHealth(res.data))
      .catch(() => setHealth(null));
  }, []);

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

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Administrative account security and backend connection information.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Active Session</h2>
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
        {health && (
          <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
            Database mode: <span className="font-mono text-slate-700">{health.dbMode}</span>
          </p>
        )}
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      <form
        onSubmit={handlePasswordUpdate}
        className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
      >
        <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
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
    </div>
  );
}
