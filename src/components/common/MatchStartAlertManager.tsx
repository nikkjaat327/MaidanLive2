import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Radio, X } from 'lucide-react';
import { LiveStreamData } from '../../types/index.ts';
import { getSocketClient } from '../../services/socket/socketClient.ts';
import {
  getStoredMatchReminders,
  markReminderNotified,
  useMatchReminders,
} from '../../utils/viewerPreferences.ts';

interface ActiveMatchAlert {
  id: string;
  matchId: string;
  title: string;
  sport: string;
  reason: string;
}

function sendBrowserAlert(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission === 'granted') {
    try {
      new window.Notification(title, { body });
    } catch {
      // Ignore notification errors in restricted contexts
    }
  }
}

export function MatchStartAlertManager() {
  const { reminders } = useMatchReminders();
  const [alerts, setAlerts] = useState<ActiveMatchAlert[]>([]);

  useEffect(() => {
    if (reminders.length === 0) return;
    const socket = getSocketClient();

    const handleLiveStarted = (stream: LiveStreamData) => {
      const targetId = stream?.id || stream?._id;
      if (!targetId) return;
      const stored = getStoredMatchReminders();
      const matched = stored.find((item) => item.matchId === targetId && !item.notifiedLiveAt);
      if (!matched) return;

      markReminderNotified(targetId, 'live');
      const alertItem: ActiveMatchAlert = {
        id: `${targetId}-live-${Date.now()}`,
        matchId: targetId,
        title: matched.title,
        sport: matched.sport,
        reason: 'Match is LIVE now',
      };
      setAlerts((prev) => [alertItem, ...prev.filter((a) => a.matchId !== targetId)].slice(0, 3));
      sendBrowserAlert(`LIVE NOW · ${matched.sport}`, `${matched.title} just went live on MaidanLive.`);
    };

    const joinFeed = () => {
      socket.emit('feed:join');
    };
    if (socket.connected) joinFeed();

    socket.on('connect', joinFeed);
    socket.on('live:started', handleLiveStarted);

    return () => {
      socket.off('connect', joinFeed);
      socket.off('live:started', handleLiveStarted);
    };
  }, [reminders.length]);

  useEffect(() => {
    if (reminders.length === 0) return;

    const checkUpcomingWindow = () => {
      const now = Date.now();
      const stored = getStoredMatchReminders();
      for (const item of stored) {
        if (!item.matchDate || item.notifiedUpcomingAt || item.notifiedLiveAt) continue;
        const startMs = new Date(item.matchDate).getTime();
        if (!Number.isFinite(startMs)) continue;
        const diffMin = Math.round((startMs - now) / 60000);
        if (diffMin >= -2 && diffMin <= 10) {
          markReminderNotified(item.matchId, 'upcoming');
          const reason =
            diffMin <= 0 ? 'Scheduled to start right now' : `Starts in ${diffMin} min`;
          setAlerts((prev) =>
            [
              {
                id: `${item.matchId}-upcoming-${Date.now()}`,
                matchId: item.matchId,
                title: item.title,
                sport: item.sport,
                reason,
              },
              ...prev.filter((a) => a.matchId !== item.matchId),
            ].slice(0, 3)
          );
          sendBrowserAlert(`Match Starting Soon · ${item.sport}`, `${item.title} · ${reason}`);
        }
      }
    };

    checkUpcomingWindow();
    const timer = window.setInterval(checkUpcomingWindow, 30_000);
    return () => window.clearInterval(timer);
  }, [reminders.length]);

  if (alerts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 md:bottom-5 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm z-40 space-y-2 pointer-events-none"
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="pointer-events-auto bg-white border border-orange-200 rounded-xl shadow-lg p-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
              <BellRing className="w-4 h-4 text-[#EA580C]" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#EA580C]">
                {alert.sport} · {alert.reason}
              </p>
              <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                {alert.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              to={`/live/${alert.matchId}`}
              onClick={() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
              className="min-h-[38px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold whitespace-nowrap"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Watch</span>
            </Link>
            <button
              type="button"
              onClick={() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
              aria-label="Dismiss match alert"
              className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
