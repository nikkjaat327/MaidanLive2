import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function ServerWakeupBanner() {
  const [wakingUp, setWakingUp] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setWakingUp(Boolean(detail?.active));
    };
    window.addEventListener('maidanlive:server-wakeup', handler);
    return () => window.removeEventListener('maidanlive:server-wakeup', handler);
  }, []);

  if (!wakingUp) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 border-b border-amber-200 text-amber-950 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700 shrink-0" />
      <span>Connecting to live match server — waking up server instance…</span>
    </div>
  );
}
