import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { authService } from '../../services/auth/authService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

function getSafeNextPath(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/profile';
}

export function CustomerLoginPage() {
  const { customerUser, loginCustomer, authNotice, clearAuthNotice } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get('next'));
  const rawNext = searchParams.get('next');
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (customerUser) {
    return <Navigate to={nextPath} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      clearAuthNotice();
      const res = await loginCustomer(email, password, totpCode.trim() || undefined);
      if (res.requires2FA) {
        setRequires2FA(true);
        setNotice(res.message || 'Enter your 6-digit authenticator code.');
        return;
      }
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(extractApiError(err, 'Unable to sign in.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await authService.forgotPassword(email);
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
      setNotice(res.message);
      setMode('reset');
    } catch (err) {
      setError(extractApiError(err, 'Unable to request password reset.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      const res = await authService.resetPassword({ token: resetToken.trim(), newPassword });
      setNotice(res.message || 'Password reset complete. You can now sign in.');
      setMode('login');
      setPassword('');
    } catch (err) {
      setError(extractApiError(err, 'Password reset failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {mode === 'login'
              ? 'Sign In to MaidanLive'
              : mode === 'forgot'
                ? 'Forgot Password'
                : 'Reset Your Password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'login'
              ? 'Access your player profile, live streams, highlights, replays, and team registrations.'
              : 'Recover access to your MaidanLive player account securely.'}
          </p>
        </div>

        <FeedbackBanner type="info" message={authNotice} onDismiss={clearAuthNotice} />
        <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
        <FeedbackBanner type="success" message={notice} onDismiss={() => setNotice(null)} />

        {mode === 'login' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setMode('forgot');
                  }}
                  className="text-xs font-semibold text-[#EA580C] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
              />
            </div>

            {requires2FA && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <ShieldCheck className="w-4 h-4 text-[#EA580C]" />
                  <span>6-Digit Authenticator Code</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tracking-widest border border-slate-300 rounded-lg bg-white"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[46px] px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Account Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-700 disabled:opacity-60"
            >
              {loading ? 'Generating Reset Token...' : 'Request Reset Token'}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Back to Sign In
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1">
                <KeyRound className="w-4 h-4 text-[#EA580C]" />
                <span>Reset Token</span>
              </label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                New Password (min 6 chars)
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? 'Updating Password...' : 'Set New Password'}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </form>
        )}

        <p className="text-sm text-slate-600 text-center">
          New to MaidanLive?{' '}
          <Link
            to={rawNext ? `/register?next=${encodeURIComponent(rawNext)}` : '/register'}
            className="font-semibold text-[#EA580C] hover:underline"
          >
            Create a player account
          </Link>
        </p>
      </div>
    </div>
  );
}
