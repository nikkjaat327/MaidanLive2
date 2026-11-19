import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, ExternalLink, Trash2 } from 'lucide-react';
import { NotificationData } from '../../types/index.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { TableSkeleton } from '../../components/common/LoadingSkeleton.tsx';
import { resolveNotificationTarget } from '../../utils/notificationNav.ts';

type FilterTab = 'all' | 'unread' | 'read';

export function AdminNotificationsPage() {
  const navigate = useNavigate();
  const { refreshAdminNotifications } = useAuth();
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setError(null);
      const res = await platformOpsService.listNotifications('admin');
      setNotifications(res.notifications || []);
      refreshAdminNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Failed to load admin notifications.'));
    } finally {
      setLoading(false);
    }
  }, [refreshAdminNotifications]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function handleMarkRead(id: string) {
    try {
      await platformOpsService.markNotificationRead(id, 'admin');
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      refreshAdminNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Unable to mark notification as read.'));
    }
  }

  async function handleReadAll() {
    try {
      await platformOpsService.markAllNotificationsRead('admin');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      refreshAdminNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Unable to mark all notifications as read.'));
    }
  }

  async function handleDelete(id: string) {
    try {
      await platformOpsService.deleteNotification(id, 'admin');
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      refreshAdminNotifications();
    } catch (err) {
      setError(extractApiError(err, 'Unable to delete notification.'));
    }
  }

  function handleClick(n: NotificationData) {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
      platformOpsService
        .markNotificationRead(n.id, 'admin')
        .then(() => refreshAdminNotifications())
        .catch(() => {});
    }
    navigate(resolveNotificationTarget(n, 'admin'));
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const visible = notifications.filter((n) => {
    if (filterTab === 'unread') return !n.isRead;
    if (filterTab === 'read') return n.isRead;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Admin &amp; Organizer Notifications
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Team registrations, approved-team edit requests awaiting reapproval, and payment proof alerts.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleReadAll}
            className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Read All ({unreadCount})</span>
          </button>
        )}
      </div>

      <FeedbackBanner type="error" message={error} onDismiss={() => setError(null)} />

      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { id: 'all' as const, label: `All (${notifications.length})` },
          { id: 'unread' as const, label: `Unread (${unreadCount})` },
          { id: 'read' as const, label: `Read (${notifications.length - unreadCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterTab(tab.id)}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              filterTab === tab.id
                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title="No notifications"
          description="Operational alerts for captain registrations, team edits, and payment uploads appear here."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {visible.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(n);
                }
              }}
              className={`p-4 flex items-start justify-between gap-3 cursor-pointer transition-colors hover:bg-slate-50 ${
                !n.isRead ? 'bg-orange-50/45' : 'bg-white'
              }`}
            >
              <div className="min-w-0 space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  {!n.isRead && <span className="w-2 h-2 rounded-full bg-[#EA580C] shrink-0" />}
                  <p className="text-sm font-bold text-slate-900">{n.title}</p>
                </div>
                <p className="text-xs text-slate-600">{n.message}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>{new Date(n.createdAt).toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1 text-[#EA580C] font-semibold">
                    <span>Open Queue</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(n.id)}
                    className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Check className="w-3 h-3" />
                    <span>Read</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(n.id)}
                  aria-label="Delete notification"
                  className="min-h-[30px] min-w-[30px] inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
