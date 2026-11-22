import { useEffect, useRef, useState } from 'react';
import { Flame, PauseCircle, ShieldAlert, X } from 'lucide-react';
import type {
  KabaddiAllOutBanner,
  KabaddiDoOrDieState,
  KabaddiViewerDisplaySettings,
} from '../../../utils/kabaddiScoring.ts';

interface KabaddiAnimationsProps {
  streamId: string;
  teamAName: string;
  teamBName: string;
  doOrDie: KabaddiDoOrDieState;
  doOrDieVisible: boolean;
  doOrDieRemainingSec: number;
  lastAllOut: KabaddiAllOutBanner | null;
  allOutDurationSec?: number;
  timeoutActive: boolean;
  timeoutTeam: 'A' | 'B' | '';
  timeoutRemainingSec: number;
  displaySettings: KabaddiViewerDisplaySettings;
  onClearDoOrDie?: () => void;
  compact?: boolean;
  showTimer?: boolean;
  scaleMultiplier?: number;
}

export function KabaddiAnimations({
  streamId,
  teamAName,
  teamBName,
  doOrDie,
  doOrDieVisible,
  doOrDieRemainingSec,
  lastAllOut,
  allOutDurationSec = 6,
  timeoutActive,
  timeoutTeam,
  timeoutRemainingSec,
  displaySettings,
  onClearDoOrDie,
  compact = false,
  showTimer = true,
  scaleMultiplier = 1,
}: KabaddiAnimationsProps) {
  const [activeAllOut, setActiveAllOut] = useState<KabaddiAllOutBanner | null>(null);
  const initialHydratedRef = useRef(false);
  const seenAllOutIdsRef = useRef<Set<string>>(new Set());
  const durationMs = Math.max(2, allOutDurationSec || 6) * 1000;

  // Prevent replay of historical All-Out events on page reload / socket reconnect
  useEffect(() => {
    const evtId = lastAllOut?.eventId;
    if (!evtId) return;

    const storageKey = `maidanlive_kbd_ao_seen_${streamId}`;
    let storedSeen: string[] = [];
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) storedSeen = JSON.parse(raw);
    } catch {
      storedSeen = [];
    }

    if (!initialHydratedRef.current) {
      initialHydratedRef.current = true;
      const ageMs = lastAllOut?.triggeredAtIso
        ? Date.now() - new Date(lastAllOut.triggeredAtIso).getTime()
        : 999_999;
      if (storedSeen.includes(evtId) || ageMs > durationMs) {
        seenAllOutIdsRef.current.add(evtId);
        return;
      }
    }

    if (seenAllOutIdsRef.current.has(evtId) || storedSeen.includes(evtId)) {
      return;
    }

    seenAllOutIdsRef.current.add(evtId);
    try {
      const updated = Array.from(new Set([...storedSeen, evtId])).slice(-20);
      window.sessionStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // ignore storage failure
    }

    if (!displaySettings.showAllOutAnimation) return;
    setActiveAllOut(lastAllOut);
    const timer = window.setTimeout(() => {
      setActiveAllOut(null);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [lastAllOut, streamId, displaySettings.showAllOutAnimation, durationMs]);

  const animClass = displaySettings.enableAnimations ? 'animate-pulse' : '';
  const dodTeamName = doOrDie.team === 'A' ? teamAName : teamBName;
  const timeoutTeamName = timeoutTeam === 'A' ? teamAName : timeoutTeam === 'B' ? teamBName : '';

  const showDod = displaySettings.showDoOrDieBanner && doOrDieVisible && Boolean(doOrDie.team);
  const showTo = displaySettings.showTimeoutBanner && timeoutActive;

  if (!showDod && !activeAllOut && !showTo) {
    return null;
  }

  const clampedScale = Math.max(0.65, Math.min(1.85, scaleMultiplier || 1));
  const scaledTitlePx = compact ? Math.round(12 * clampedScale) : undefined;
  const scaledSubPx = compact ? Math.round(11 * clampedScale) : undefined;
  const scaledPadX = compact ? Math.round(14 * clampedScale) : undefined;
  const scaledPadY = compact ? Math.round(8 * clampedScale) : undefined;

  return (
    <div className="space-y-2 w-full">
      {showDod && (
        <div
          role="status"
          aria-live="polite"
          style={
            compact
              ? {
                  paddingLeft: scaledPadX,
                  paddingRight: scaledPadX,
                  paddingTop: scaledPadY,
                  paddingBottom: scaledPadY,
                  fontSize: scaledTitlePx,
                }
              : undefined
          }
          className={`flex items-center justify-between gap-3 rounded-xl border border-amber-400/80 bg-gradient-to-r from-amber-900/90 via-red-800/90 to-amber-900/90 backdrop-blur-md ${
            compact ? 'text-xs' : 'px-4 py-2.5 text-sm'
          } text-amber-100 shadow-xl`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Flame className={`w-4 h-4 text-amber-400 shrink-0 ${animClass}`} />
            <div className="min-w-0">
              <p className="font-display font-extrabold uppercase tracking-wider text-amber-300 truncate">
                DO OR DIE RAID · {dodTeamName}
              </p>
              {!compact && (
                <p className="text-[11px] text-amber-100/90">
                  Score or be tackled — banner clears automatically on next scoring event
                </p>
              )}
            </div>
          </div>
          {(showTimer && doOrDieRemainingSec > 0) || onClearDoOrDie ? (
            <div className="flex items-center gap-2 shrink-0">
              {showTimer && doOrDieRemainingSec > 0 && (
                <span className="font-mono tabular-nums font-extrabold px-2 py-0.5 rounded bg-slate-950/75 border border-amber-400/50 text-amber-300 text-xs">
                  {doOrDieRemainingSec}s
                </span>
              )}
              {onClearDoOrDie && (
                <button
                  type="button"
                  onClick={onClearDoOrDie}
                  aria-label="Clear Do-or-Die indicator"
                  className="p-1 rounded hover:bg-white/10 text-amber-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : null}
        </div>
      )}

      {activeAllOut && (
        <div
          role="alert"
          style={
            compact
              ? {
                  paddingLeft: scaledPadX,
                  paddingRight: scaledPadX,
                  paddingTop: scaledPadY,
                  paddingBottom: scaledPadY,
                  fontSize: scaledTitlePx,
                }
              : undefined
          }
          className={`flex items-center justify-between gap-3 rounded-xl border-2 border-red-400 bg-gradient-to-r from-red-700/95 via-orange-600/95 to-red-700/95 backdrop-blur-md ${
            compact ? 'text-xs' : 'px-4 py-3 text-sm'
          } text-white shadow-2xl ${displaySettings.enableAnimations ? 'transition-all duration-300 animate-pulse' : ''}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <ShieldAlert className="w-5 h-5 text-yellow-200 shrink-0" />
            <div className="min-w-0">
              <p className="font-display font-black uppercase tracking-widest text-yellow-100">
                ALL-OUT! +{activeAllOut.pointsAwarded} BONUS POINTS
              </p>
              <p style={compact ? { fontSize: scaledSubPx } : undefined} className="text-xs text-white/95 truncate">
                {activeAllOut.awardingTeam === 'A' ? teamAName : teamBName} inflicted All-Out on{' '}
                {activeAllOut.affectedTeam === 'A' ? teamAName : teamBName}
              </p>
            </div>
          </div>
          {onClearDoOrDie !== undefined && (
            <button
              type="button"
              onClick={() => setActiveAllOut(null)}
              aria-label="Dismiss All-Out banner"
              className="p-1 rounded hover:bg-black/20 text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {showTo && (
        <div
          role="status"
          style={
            compact
              ? {
                  paddingLeft: scaledPadX,
                  paddingRight: scaledPadX,
                  paddingTop: scaledPadY,
                  paddingBottom: scaledPadY,
                  fontSize: scaledTitlePx,
                }
              : undefined
          }
          className={`flex items-center justify-between gap-3 rounded-xl border border-sky-400/60 bg-sky-950/85 backdrop-blur-md ${
            compact ? 'text-xs' : 'px-4 py-2 text-sm'
          } text-sky-100 shadow-lg`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <PauseCircle className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-semibold truncate">
              OFFICIAL TIMEOUT · {timeoutTeamName || 'Match'}
            </span>
          </div>
          {showTimer && (
            <span className="font-mono tabular-nums font-bold px-2 py-0.5 rounded bg-slate-900 border border-sky-400/40 text-sky-300 text-xs shrink-0">
              {String(timeoutRemainingSec).padStart(2, '0')}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}
