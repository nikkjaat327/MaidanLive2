import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { authService } from '../../services/auth/authService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function AdminLoginPage() {
  const { adminUser, adminLoading, loginAdmin, bootstrapSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [checkingSetup, setCheckingSetup] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [requiresSetupKey, setRequiresSetupKey] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authService
      .getAdminSetupStatus()
      .then((res) => {
        setNeedsSetup(res.needsSetup);
        setRequiresSetupKey(res.requiresSetupKey);
      })
      .catch(() => {
        setNeedsSetup(false);
      })
      .finally(() => setCheckingSetup(false));
  }, []);

  if (!adminLoading && adminUser) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);
      if (needsSetup) {
        await bootstrapSuperAdmin({
          name,
          email,
          password,
          setupKey: requiresSetupKey ? setupKey : undefined,
        });
      } else {
        await loginAdmin(email, password);
      }
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(extractApiError(err, 'Authentication failed.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {checkingSetup
              ? 'MaidanLive Admin Portal'
              : needsSetup
                ? 'Initialize Super Admin'
                : 'Admin Portal Sign In'}
          </h1>
          <p className="text-sm text-slate-500">
            {needsSetup
              ? 'No Super Admin exists in the database yet. Create the primary Super Admin account to lock setup and unlock broadcast controls.'
              : 'Restricted to authorized administrators, tournament organizers, and scorers.'}
          </p>
        </div>

        <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

        {checkingSetup ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Checking initialization status...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {needsSetup && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Super Admin Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={needsSetup ? 8 : 1}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? 'Minimum 8 characters' : ''}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {needsSetup && requiresSetupKey && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Server Setup Key
                </label>
                <input
                  type="password"
                  required
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  placeholder="Configured ADMIN_SETUP_KEY"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[46px] px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting
                ? 'Please wait...'
                : needsSetup
                  ? 'Create Super Admin & Continue'
                  : 'Sign In to Admin Portal'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
