import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

function getSafeNextPath(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw;
  }
  return '/profile';
}

export function CustomerRegisterPage() {
  const { customerUser, registerCustomer } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = getSafeNextPath(searchParams.get('next'));
  const rawNext = searchParams.get('next');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [favoriteSport, setFavoriteSport] = useState('');
  const [role, setRole] = useState<'SPECTATOR' | 'CAPTAIN'>('SPECTATOR');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (customerUser) {
    return <Navigate to={nextPath} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await registerCustomer({
        name,
        email,
        password,
        phone: phone.trim() || undefined,
        favoriteSport,
        role,
      });
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(extractApiError(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Create Player Account</h1>
          <p className="text-sm text-slate-500 mt-1">
            Join as a player or team captain to watch live matches, highlights, replays, and register squads.
          </p>
        </div>

        <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Account Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'SPECTATOR' as const, label: 'Player' },
                { val: 'CAPTAIN' as const, label: 'Team Captain' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setRole(opt.val)}
                  className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                    role === opt.val
                      ? 'bg-[#EA580C] text-white border-[#EA580C]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
            />
          </div>

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
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phone {role === 'CAPTAIN' ? '(Recommended)' : '(Optional)'}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 ..."
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Favorite Sport (Optional)
            </label>
            <select
              value={favoriteSport}
              onChange={(e) => setFavoriteSport(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Select sport</option>
              {SPORT_OPTIONS.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-sm text-slate-600 text-center">
          Already registered?{' '}
          <Link
            to={rawNext ? `/login?next=${encodeURIComponent(rawNext)}` : '/login'}
            className="font-semibold text-[#EA580C] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
