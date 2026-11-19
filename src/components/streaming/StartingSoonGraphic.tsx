import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Radio, Trophy } from 'lucide-react';
import { LiveStreamData } from '../../types/index.ts';

interface StartingSoonGraphicProps {
  stream: LiveStreamData;
  onShowPreview?: () => void;
}

function formatCountdown(targetIso?: string | null): string | null {
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) return 'Starting shortly';
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  const secs = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

export function StartingSoonGraphic({ stream, onShowPreview }: StartingSoonGraphicProps) {
  const [countdown, setCountdown] = useState<string | null>(() =>
    formatCountdown(stream.matchDate)
  );

  useEffect(() => {
    if (!stream.matchDate) {
      setCountdown(null);
      return;
    }
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(stream.matchDate));
    }, 1000);
    return () => window.clearInterval(id);
  }, [stream.matchDate]);

  return (
    <div className="absolute inset-0 z-20 bg-slate-950/95 text-white flex flex-col items-center justify-center p-4 sm:p-8 text-center">
      <div className="max-w-xl w-full space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[11px] font-bold uppercase tracking-widest">
          <Radio className="w-3.5 h-3.5" />
          <span>Starting Soon</span>
          {stream.gameName && <span>· {stream.gameName}</span>}
        </div>

        {stream.tournamentName && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-300 font-medium">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>{stream.tournamentName}</span>
          </div>
        )}

        {/* Teams VS Row */}
        <div className="flex items-center justify-center gap-4 sm:gap-8 py-2">
          <div className="flex flex-col items-center gap-2 min-w-0 flex-1">
            {stream.teamALogo && (
              <img
                src={stream.teamALogo}
                alt={stream.teamAName || 'Team A'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover bg-slate-800 border border-white/15"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="text-sm sm:text-lg font-bold truncate max-w-full">
              {stream.teamAName || 'Team A'}
            </span>
          </div>

          <div className="shrink-0 px-3 py-1.5 rounded bg-slate-800/90 border border-slate-700 text-xs font-black tracking-widest text-slate-300">
            VS
          </div>

          <div className="flex flex-col items-center gap-2 min-w-0 flex-1">
            {stream.teamBLogo && (
              <img
                src={stream.teamBLogo}
                alt={stream.teamBName || 'Team B'}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover bg-slate-800 border border-white/15"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="text-sm sm:text-lg font-bold truncate max-w-full">
              {stream.teamBName || 'Team B'}
            </span>
          </div>
        </div>

        {/* Countdown */}
        {countdown && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="font-mono tabular-nums text-sm sm:text-base font-bold text-emerald-300">
              {countdown}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
          {stream.matchDate && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(stream.matchDate).toLocaleString()}
            </span>
          )}
          {stream.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {stream.location}
            </span>
          )}
        </div>

        {onShowPreview && (
          <div className="pt-1">
            <button
              type="button"
              onClick={onShowPreview}
              className="px-3.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-medium text-white border border-white/15 transition-colors cursor-pointer"
            >
              Open YouTube Stream Preview
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
