import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Settings } from 'lucide-react';
import { NotificationData, NotificationPreferences } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';

const DEFAULT_PREFS: NotificationPreferences = {
  matchStart: true,
  matchLive: true,
  followedTeams: true,
  scoreUpdates: false,
  matchResults: true,
  tournamentUpdates: true,
  browserPushEnabled: false,
};

export function NotificationsPage() {
  const { customerUser, customerLoading, refreshNotifications, updateCustomerUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    customerUser?.notificationPreferences || DEFAULT_PREFS
  );
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (customerUser?.notificationPreferences) {
      setPrefs(customerUser.notificationPreferences);
    }
  }, [customerUser?.notificationPreferences]);

  useEffect(() => {
    if (!customerUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    platformOpsService
      .listNotifications()
      .then((res) => setNotifications(res.notifications || []))
      .catch((err) => setError(extractApiError(err, 'Failed to load notifications.')))
      .finally(() => setLoading(false));
  }, [customerUser]);

  async function handleMarkRead(id: string) {
    try {
      await platformOpsService.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      refreshNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Unable to mark notification as read.'));
    }
  }

  async function handleMarkAllRead() {
    try {
      await platformOpsService.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Unable to mark notifications as read.'));
    }
  }

  async function handleTogglePreference(key: keyof NotificationPreferences) {
    if (!customerUser) return;
    let nextVal = !prefs[key];

    // Browser Notification API requires explicit user-triggered permission request
    if (key === 'browserPushEnabled' && nextVal) {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setError('Browser notifications are not supported in this browser.');
        return;
      }
      const perm = await window.Notification.requestPermission();
      if (perm !== 'granted') {
        nextVal = false;
        setError('Browser notification permission was not granted.');
        return;
      }
    }

    const updatedPrefs = { ...prefs, [key]: nextVal };
    try {
      setSavingPrefs(true);
      setError(null);
      const saved = await platformOpsService.updateNotificationPreferences(updatedPrefs);
      setPrefs(saved);
      updateCustomerUser({ ...customerUser, notificationPreferences: saved });
      setSuccess('Notification preferences updated.');
      window.setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError(extractApiError(err, 'Failed to save preferences.'));
    } finally {
      setSavingPrefs(false);
    }
  }

  if (customerLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
          Loading notifications...
        </div>
      </div>
    );
  }

  if (!customerUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title="Sign in for match notifications"
          description="Receive live kickoff alerts, final match results, and updates from teams you follow."
          action={
            <Link
              to="/login"
              className="min-h-[42px] inline-flex items-center px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              Sign In
            </Link>
          }
        />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time match start, followed team, and result alerts.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="min-h-[40px] inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All Read ({unreadCount})</span>
          </button>
        )}
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />
      {success && <FeedbackBanner type="success" message={success} onDismiss={() => setSuccess(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No notifications yet. Follow teams or stay tuned for upcoming live broadcasts.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex items-start justify-between gap-3 ${
                    !n.isRead ? 'bg-emerald-50/40' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />}
                      <p className="text-sm font-bold text-slate-900">{n.title}</p>
                    </div>
                    <p className="text-xs text-slate-600">{n.message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>{new Date(n.createdAt).toLocaleString()}</span>
                      {n.link && (
                        <Link to={n.link} className="text-emerald-700 font-semibold hover:underline">
                          View Match
                        </Link>
                      )}
                    </div>
                  </div>

                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(n.id)}
                      title="Mark as read"
                      className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Read</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preferences Card */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-600" />
            <span>Alert Preferences</span>
          </h2>
          <div className="space-y-2.5 text-xs">
            {[
              { key: 'matchLive' as const, label: 'Followed team goes LIVE' },
              { key: 'matchStart' as const, label: 'Upcoming match scheduled' },
              { key: 'matchResults' as const, label: 'Official match results' },
              { key: 'followedTeams' as const, label: 'Followed team updates' },
              { key: 'tournamentUpdates' as const, label: 'Tournament announcements' },
              { key: 'browserPushEnabled' as const, label: 'Browser desktop alerts (explicit opt-in)' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-3 py-1 cursor-pointer"
              >
                <span className="text-slate-700 font-medium">{item.label}</span>
                <input
                  type="checkbox"
                  disabled={savingPrefs}
                  checked={Boolean(prefs[item.key])}
                  onChange={() => handleTogglePreference(item.key)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
