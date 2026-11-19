import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, Settings, Trash2 } from 'lucide-react';
import { NotificationData, NotificationPreferences } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';

const DEFAULT_PREFS: NotificationPreferences = {
  matchStart: true,
  matchLive: true,
  matchDelayed: true,
  matchResumed: true,
  followedTeams: true,
  favoritePlayers: true,
  scoreUpdates: false,
  matchResults: true,
  tournamentUpdates: true,
  browserPushEnabled: false,
};

type FilterTab = 'all' | 'unread' | 'read';

export function NotificationsPage() {
  const { customerUser, customerLoading, refreshNotifications, updateCustomerUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    ...DEFAULT_PREFS,
    ...(customerUser?.notificationPreferences || {}),
  });
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (customerUser?.notificationPreferences) {
      setPrefs({ ...DEFAULT_PREFS, ...customerUser.notificationPreferences });
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

  async function handleDeleteNotification(id: string) {
    try {
      await platformOpsService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      refreshNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Unable to remove notification.'));
    }
  }

  async function handleTogglePreference(key: keyof NotificationPreferences) {
    if (!customerUser) return;
    let nextVal = !prefs[key];

    if (key === 'browserPushEnabled' && nextVal) {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setError('Browser notifications are not supported in this browser.');
        return;
      }
      const perm = await window.Notification.requestPermission();
      if (perm !== 'granted') {
        setError('Browser notification permission was not granted.');
        return;
      }
    }

    const updatedPrefs = { ...prefs, [key]: nextVal };
    try {
      setSavingPrefs(true);
      setError(null);
      const saved = await platformOpsService.updateNotificationPreferences(updatedPrefs);
      setPrefs({ ...DEFAULT_PREFS, ...saved });
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
          description="Receive live kickoff alerts, match delay notices, and updates from teams, players, and tournaments you follow."
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
  const visibleNotifications = notifications.filter((n) => {
    if (filterTab === 'unread') return !n.isRead;
    if (filterTab === 'read') return n.isRead;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time match start, weather delay, followed team, and result alerts.
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
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center gap-2">
            {[
              { id: 'all' as const, label: `All (${notifications.length})` },
              { id: 'unread' as const, label: `Unread (${unreadCount})` },
              { id: 'read' as const, label: `Read (${notifications.length - unreadCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  filterTab === tab.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {visibleNotifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {filterTab === 'unread'
                  ? 'You are all caught up — zero unread notifications.'
                  : 'No notifications yet. Follow teams, players, or tournaments for live alerts.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleNotifications.map((n) => (
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

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          title="Mark as read"
                          className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Read</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteNotification(n.id)}
                        title="Delete notification"
                        aria-label="Delete notification"
                        className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preferences Card */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-600" />
            <span>Alert Preferences</span>
          </h2>
          <div className="space-y-2.5 text-xs">
            {[
              { key: 'matchLive' as const, label: 'Followed match goes LIVE' },
              { key: 'matchStart' as const, label: 'Upcoming match scheduled' },
              { key: 'matchDelayed' as const, label: 'Match delayed / weather alerts' },
              { key: 'matchResumed' as const, label: 'Match resumed alerts' },
              { key: 'matchResults' as const, label: 'Official match results' },
              { key: 'followedTeams' as const, label: 'Followed team updates' },
              { key: 'favoritePlayers' as const, label: 'Followed player updates' },
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
