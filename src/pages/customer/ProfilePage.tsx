import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.ts';
import { authService } from '../../services/auth/authService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { SPORT_OPTIONS } from '../../constants/sports.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';

export function ProfilePage() {
  const { customerUser, customerLoading, refreshCustomer, logoutCustomer } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [favoriteSport, setFavoriteSport] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (customerUser) {
      setName(customerUser.name || '');
      setPhone(customerUser.phone || '');
      setFavoriteSport(customerUser.favoriteSport || '');
    }
  }, [customerUser]);

  if (customerLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-sm text-slate-500">
        Loading your profile...
      </div>
    );
  }

  if (!customerUser) {
    return <Navigate to="/login" replace />;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await authService.updateCustomerProfile({ name, phone, favoriteSport });
      await refreshCustomer();
      setSuccess('Profile updated.');
    } catch (err) {
      setError(extractApiError(err, 'Failed to update profile.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Your Profile</h1>
          <p className="text-sm text-slate-500 mt-1">{customerUser.email}</p>
        </div>
        <button
          type="button"
          onClick={logoutCustomer}
          className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />

      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Phone (Optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98..."
            className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Favorite Sport</label>
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
          disabled={saving}
          className="min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
