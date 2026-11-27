import { useEffect, useMemo, useRef } from 'react';
import { Mic, MicOff, Volume2 } from 'lucide-react';
import type { ObsAudioMeterSnapshot } from '../../types/obs.ts';

interface ObsAudioPeakMeterProps {
  audioMeter?: ObsAudioMeterSnapshot | null;
  obsConnected: boolean;
  primaryAudioInput?: string;
  availableAudioInputs?: string[];
  theme?: 'light' | 'dark';
  compact?: boolean;
  selectingInput?: boolean;
  togglingMute?: boolean;
  onSelectPrimaryInput?: (inputName: string) => void;
  onToggleMute?: (inputName: string, nextMuted: boolean) => void;
}

const MIN_DB = -60;

function dbToNorm(db: number): number {
  const num = Number(db);
  if (!Number.isFinite(num) || num <= MIN_DB) return 0;
  if (num >= 0) return 1;
  return (num - MIN_DB) / (0 - MIN_DB);
}

function formatDb(db: number | undefined, obsConnected: boolean): string {
  if (!obsConnected || db === undefined || !Number.isFinite(db) || db <= MIN_DB) {
    return '-inf dB';
  }
  return `${db.toFixed(1)} dB`;
}

function getBadgeStyle(
  status: string,
  obsConnected: boolean,
  theme: 'light' | 'dark'
): { label: string; className: string } {
  if (!obsConnected || status === 'OFFLINE') {
    return {
      label: 'OFFLINE',
      className:
        theme === 'dark'
          ? 'bg-slate-800 text-slate-300 border-slate-700'
          : 'bg-slate-100 text-slate-600 border-slate-300',
    };
  }
  switch (status) {
    case 'MUTED':
      return {
        label: 'MUTED',
        className:
          theme === 'dark'
            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            : 'bg-amber-50 text-amber-800 border-amber-300',
      };
    case 'CLIPPING':
      return {
        label: 'CLIPPING',
        className:
          theme === 'dark'
            ? 'bg-red-500/20 text-red-300 border-red-500/45'
            : 'bg-red-50 text-red-700 border-red-300',
      };
    case 'OPTIMAL':
      return {
        label: 'BROADCAST READY',
        className:
          theme === 'dark'
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/45'
            : 'bg-emerald-50 text-emerald-700 border-emerald-300',
      };
    case 'LOW':
      return {
        label: 'LOW SIGNAL',
        className:
          theme === 'dark'
            ? 'bg-amber-500/15 text-amber-200 border-amber-500/35'
            : 'bg-amber-50 text-amber-700 border-amber-300',
      };
    case 'SILENT':
    default:
      return {
        label: 'SILENT',
        className:
          theme === 'dark'
            ? 'bg-slate-800 text-slate-300 border-slate-700'
            : 'bg-slate-100 text-slate-600 border-slate-300',
      };
  }
}

export function ObsAudioPeakMeter({
  audioMeter,
  obsConnected,
  primaryAudioInput = '',
  availableAudioInputs = [],
  theme = 'light',
  compact = false,
  selectingInput = false,
  togglingMute = false,
  onSelectPrimaryInput,
  onToggleMute,
}: ObsAudioPeakMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const meterConnected = Boolean(obsConnected && (audioMeter ? audioMeter.obsConnected !== false : true));

  const effectivePrimaryInput =
    audioMeter?.primaryInputName || primaryAudioInput || availableAudioInputs[0] || '';

  const selectableInputs = useMemo(() => {
    const merged = new Set<string>();
    if (effectivePrimaryInput) merged.add(effectivePrimaryInput);
    for (const item of audioMeter?.availableAudioInputs || []) {
      if (item && item.trim()) merged.add(item.trim());
    }
    for (const item of availableAudioInputs) {
      if (item && item.trim()) merged.add(item.trim());
    }
    return Array.from(merged);
  }, [effectivePrimaryInput, audioMeter?.availableAudioInputs, availableAudioInputs]);

  const peakDb = meterConnected && audioMeter ? Number(audioMeter.peakDb ?? MIN_DB) : MIN_DB;
  const peakHoldDb =
    meterConnected && audioMeter ? Number(audioMeter.peakHoldDb ?? peakDb) : MIN_DB;
  const leftDb =
    meterConnected && audioMeter
      ? Number(audioMeter.channelsDb?.[0] ?? peakDb)
      : MIN_DB;
  const rightDb =
    meterConnected && audioMeter
      ? Number(audioMeter.channelsDb?.[1] ?? audioMeter.channelsDb?.[0] ?? peakDb)
      : MIN_DB;
  const muted = Boolean(meterConnected && audioMeter?.muted);
  const clipping = Boolean(meterConnected && !muted && audioMeter?.clipping);
  const status = meterConnected ? audioMeter?.status || 'SILENT' : 'OFFLINE';
  const badge = getBadgeStyle(status, meterConnected, theme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssWidth = Math.max(180, canvas.clientWidth || 320);
    const cssHeight = compact ? 36 : 46;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const padL = 20;
    const padR = 8;
    const trackW = Math.max(60, cssWidth - padL - padR);
    const barH = compact ? 9 : 11;
    const chOffsets = [
      { label: 'L', y: 3, db: leftDb },
      { label: 'R', y: compact ? 15 : 18, db: rightDb },
    ];

    const sweetStart = padL + trackW * dbToNorm(-20);
    const warnStart = padL + trackW * dbToNorm(-6);
    const clipStart = padL + trackW * dbToNorm(-1.5);
    const holdX = padL + trackW * dbToNorm(peakHoldDb);

    for (const ch of chOffsets) {
      ctx.fillStyle = theme === 'dark' ? '#8b9ab0' : '#475569';
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.label, 4, ch.y + barH / 2);

      // Track background
      ctx.fillStyle = theme === 'dark' ? '#080e1a' : '#e2e8f0';
      ctx.fillRect(padL, ch.y, trackW, barH);

      // Subtle sweet-spot & danger zone guides
      ctx.fillStyle =
        theme === 'dark' ? 'rgba(34, 197, 94, 0.14)' : 'rgba(22, 163, 74, 0.16)';
      ctx.fillRect(sweetStart, ch.y, Math.max(1, warnStart - sweetStart), barH);

      ctx.fillStyle =
        theme === 'dark' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(217, 119, 6, 0.16)';
      ctx.fillRect(warnStart, ch.y, Math.max(1, clipStart - warnStart), barH);

      ctx.fillStyle =
        theme === 'dark' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(220, 38, 38, 0.18)';
      ctx.fillRect(clipStart, ch.y, Math.max(1, padL + trackW - clipStart), barH);

      const levelNorm = meterConnected ? dbToNorm(ch.db) : 0;
      const fillW = Math.max(0, Math.round(trackW * levelNorm));
      if (fillW > 0) {
        if (muted) {
          ctx.fillStyle = theme === 'dark' ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.55)';
        } else {
          const grad = ctx.createLinearGradient(padL, 0, padL + trackW, 0);
          grad.addColorStop(0, '#0ea5e9');
          grad.addColorStop(0.62, '#22c55e');
          grad.addColorStop(0.89, '#f59e0b');
          grad.addColorStop(0.97, '#ef4444');
          grad.addColorStop(1, '#ef4444');
          ctx.fillStyle = grad;
        }
        ctx.fillRect(padL, ch.y, fillW, barH);
      }

      if (meterConnected && peakHoldDb > MIN_DB + 0.5) {
        ctx.fillStyle = clipping
          ? '#ef4444'
          : muted
            ? '#94a3b8'
            : theme === 'dark'
              ? '#f8fafc'
              : '#0f172a';
        ctx.fillRect(Math.min(padL + trackW - 2, Math.max(padL, holdX - 1)), ch.y, 2, barH);
      }
    }

    // Scale ruler ticks
    const tickY = compact ? 28 : 34;
    ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = theme === 'dark' ? '#64748b' : '#64748b';
    ctx.textBaseline = 'top';
    for (const dbTick of [-60, -40, -20, -12, -6, -3, 0]) {
      const tx = padL + trackW * dbToNorm(dbTick);
      ctx.fillStyle = theme === 'dark' ? '#334155' : '#cbd5e1';
      ctx.fillRect(tx, tickY - 2, 1, 3);
      ctx.fillStyle = dbTick >= -3 ? '#ef4444' : dbTick >= -20 && dbTick <= -6 ? '#16a34a' : '#64748b';
      ctx.textAlign = dbTick === 0 ? 'right' : dbTick === -60 ? 'left' : 'center';
      ctx.fillText(String(dbTick), tx, tickY + 1);
    }
  }, [leftDb, rightDb, peakHoldDb, meterConnected, muted, clipping, compact, theme]);

  const wrapperClass =
    theme === 'dark'
      ? 'rounded-xl border border-slate-800/90 bg-[#0B101B] p-3 space-y-2.5 text-slate-100'
      : 'rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5 text-slate-900';

  const statusHelperText = !meterConnected
    ? 'Connect OBS Studio to inspect pre-live audio levels.'
    : audioMeter?.label ||
      (effectivePrimaryInput
        ? `Monitoring "${effectivePrimaryInput}" (optimal peak -20 to -6 dB).`
        : 'Waiting for OBS audio meter events...');

  return (
    <div className={wrapperClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Volume2
            className={`w-4 h-4 shrink-0 ${
              clipping
                ? 'text-red-500'
                : status === 'OPTIMAL'
                  ? 'text-emerald-500'
                  : 'text-[#EA580C]'
            }`}
          />
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">
              Primary OBS Audio Peak Meter
            </p>
            {!compact && (
              <p
                className={`text-[11px] truncate ${
                  clipping
                    ? 'text-red-500 font-semibold'
                    : theme === 'dark'
                      ? 'text-slate-400'
                      : 'text-slate-500'
                }`}
                title={statusHelperText}
              >
                {statusHelperText}
              </p>
            )}
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border shrink-0 ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Controls & Numeric Peak Readouts */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {selectableInputs.length > 0 ? (
            <select
              aria-label="Primary OBS audio input"
              value={effectivePrimaryInput}
              disabled={!meterConnected || selectingInput || !onSelectPrimaryInput}
              onChange={(e) => onSelectPrimaryInput?.(e.target.value)}
              className={`min-h-[30px] max-w-[220px] flex-1 px-2 py-1 rounded-lg border text-[11px] font-semibold truncate disabled:opacity-60 ${
                theme === 'dark'
                  ? 'bg-[#121826] border-slate-700 text-slate-100'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}
            >
              {selectableInputs.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`text-[11px] font-mono truncate ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              {meterConnected ? 'Auto-detecting primary OBS input...' : 'No active audio input'}
            </span>
          )}

          {onToggleMute && effectivePrimaryInput && (
            <button
              type="button"
              disabled={!meterConnected || togglingMute}
              onClick={() => onToggleMute(effectivePrimaryInput, !muted)}
              title={muted ? `Unmute ${effectivePrimaryInput}` : `Mute ${effectivePrimaryInput}`}
              className={`min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold shrink-0 disabled:opacity-45 ${
                muted
                  ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                  : theme === 'dark'
                    ? 'bg-[#121826] text-slate-200 border-slate-700 hover:border-slate-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {muted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              <span>{togglingMute ? '...' : muted ? 'Muted' : 'Mute'}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums shrink-0">
          <span>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>Peak </span>
            <strong
              className={
                clipping
                  ? 'text-red-500'
                  : status === 'OPTIMAL'
                    ? 'text-emerald-500'
                    : theme === 'dark'
                      ? 'text-white'
                      : 'text-slate-900'
              }
            >
              {formatDb(peakDb, meterConnected)}
            </strong>
          </span>
          <span>
            <span className={theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}>Hold </span>
            <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}>
              {formatDb(peakHoldDb, meterConnected)}
            </strong>
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        aria-label="Primary OBS audio peak level meter"
        className={`w-full block rounded-lg border ${
          compact ? 'h-[36px]' : 'h-[46px]'
        } ${theme === 'dark' ? 'border-slate-800 bg-[#080e1a]' : 'border-slate-200 bg-white'}`}
      />
    </div>
  );
}
