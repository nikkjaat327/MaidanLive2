import { useEffect } from 'react';
import {
  Camera,
  CheckCircle2,
  Keyboard,
  Mic,
  Radio,
  SlidersHorizontal,
  Volume2,
  X,
} from 'lucide-react';
import type { ObsAudioMeterSnapshot } from '../../types/obs.ts';

interface ControlRoomReadinessStripProps {
  obsConnected: boolean;
  bridgeOnline: boolean;
  onlineCameraCount: number;
  totalCameraCount: number;
  audioMeter?: ObsAudioMeterSnapshot | null;
  streamTargetReady: boolean;
  streamTargetLabel: string;
  hotkeysEnabled: boolean;
  onToggleHotkeys: () => void;
  shortcutsHelpOpen: boolean;
  onToggleShortcutsHelp: () => void;
  quickScorerOpen: boolean;
  onToggleQuickScorer: () => void;
  canQuickScore: boolean;
  onJumpToSettings: () => void;
  onJumpToCameras: () => void;
  onJumpToWorkflow: () => void;
}

function getAudioReadiness(meter?: ObsAudioMeterSnapshot | null) {
  if (!meter || !meter.primaryInputName) {
    return {
      ok: false,
      label: 'No Input',
      toneClass: 'text-slate-400',
      dotClass: 'bg-slate-500',
    };
  }
  if (meter.muted) {
    return {
      ok: false,
      label: `${meter.primaryInputName} · Muted`,
      toneClass: 'text-amber-300',
      dotClass: 'bg-amber-400',
    };
  }
  const db = Number.isFinite(meter.peakDb) ? Math.round(meter.peakDb) : -60;
  if (db > -3) {
    return {
      ok: false,
      label: `${db} dB Peaking`,
      toneClass: 'text-red-300',
      dotClass: 'bg-red-500 animate-pulse',
    };
  }
  if (db < -42) {
    return {
      ok: false,
      label: `${db} dB Low`,
      toneClass: 'text-amber-300',
      dotClass: 'bg-amber-400',
    };
  }
  return {
    ok: true,
    label: `${db} dB Optimal`,
    toneClass: 'text-emerald-300',
    dotClass: 'bg-emerald-400',
  };
}

export function ControlRoomReadinessStrip({
  obsConnected,
  bridgeOnline,
  onlineCameraCount,
  totalCameraCount,
  audioMeter,
  streamTargetReady,
  streamTargetLabel,
  hotkeysEnabled,
  onToggleHotkeys,
  shortcutsHelpOpen,
  onToggleShortcutsHelp,
  quickScorerOpen,
  onToggleQuickScorer,
  canQuickScore,
  onJumpToSettings,
  onJumpToCameras,
  onJumpToWorkflow,
}: ControlRoomReadinessStripProps) {
  const audioStatus = getAudioReadiness(audioMeter);
  const camsReady = onlineCameraCount > 0;

  useEffect(() => {
    if (!shortcutsHelpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleShortcutsHelp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutsHelpOpen, onToggleShortcutsHelp]);

  return (
    <>
      <div className="rounded-xl bg-[#0B101B] border border-slate-800/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Left: 4 Inline Pre-Live Readiness Signals (Zero-Pill Inline Discipline) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Pre-Live Readiness
          </span>

          <button
            type="button"
            onClick={onJumpToSettings}
            className="inline-flex items-center gap-1.5 hover:opacity-85 transition-opacity"
            title="Inspect OBS Studio & Bridge connection"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                obsConnected
                  ? 'bg-emerald-400'
                  : bridgeOnline
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-400">OBS</span>
            <span
              className={`font-semibold ${
                obsConnected
                  ? 'text-emerald-300'
                  : bridgeOnline
                    ? 'text-amber-300'
                    : 'text-slate-300'
              }`}
            >
              {obsConnected ? 'Connected' : bridgeOnline ? 'Bridge Ready' : 'Offline'}
            </span>
          </button>

          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            ·
          </span>

          <button
            type="button"
            onClick={onJumpToCameras}
            className="inline-flex items-center gap-1.5 hover:opacity-85 transition-opacity"
            title="Inspect connected cameras"
          >
            <Camera className={`w-3.5 h-3.5 ${camsReady ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-slate-400">Cameras</span>
            <span className="font-mono tabular-nums font-semibold text-slate-200">
              {onlineCameraCount}/{totalCameraCount}
            </span>
          </button>

          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            ·
          </span>

          <span
            className="inline-flex items-center gap-1.5"
            title={
              audioMeter?.primaryInputName
                ? `Primary audio input: ${audioMeter.primaryInputName}`
                : 'Audio peak meter telemetry'
            }
          >
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400">Audio</span>
            <span className={`w-1.5 h-1.5 rounded-full ${audioStatus.dotClass}`} />
            <span className={`font-mono tabular-nums font-semibold ${audioStatus.toneClass}`}>
              {audioStatus.label}
            </span>
          </span>

          <span aria-hidden="true" className="text-slate-700 hidden sm:inline">
            ·
          </span>

          <button
            type="button"
            onClick={onJumpToWorkflow}
            className="inline-flex items-center gap-1.5 hover:opacity-85 transition-opacity"
            title="Configure YouTube Live or MediaMTX output"
          >
            {streamTargetReady ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Radio className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-slate-400">Target</span>
            <span
              className={`font-semibold truncate max-w-[160px] ${
                streamTargetReady ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {streamTargetLabel}
            </span>
          </button>
        </div>

        {/* Right: Quick Scorer Drawer & Keyboard Shortcuts */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={onToggleHotkeys}
            aria-pressed={hotkeysEnabled}
            title="Toggle single-key broadcast shortcuts (1-6 scenes, Space transition, M mute, S scoreboard, L scorer)"
            className={`min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
              hotkeysEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-[#121826] border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Hotkeys {hotkeysEnabled ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleShortcutsHelp}
            title="View Control Room keyboard shortcuts (?)"
            className="min-h-[32px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#121826] border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 text-[11px] font-semibold transition-colors"
          >
            <span className="font-mono text-orange-400">?</span>
            <span className="hidden md:inline">Shortcuts</span>
          </button>

          {canQuickScore && (
            <button
              type="button"
              onClick={onToggleQuickScorer}
              aria-pressed={quickScorerOpen}
              className={`min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                quickScorerOpen
                  ? 'bg-[#EA580C] border-orange-400 text-white shadow-lg shadow-orange-500/25'
                  : 'bg-[#121826] border-orange-500/45 text-orange-300 hover:bg-orange-500/15 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Quick Scorer</span>
              <kbd className="hidden lg:inline px-1 py-0.2 rounded bg-black/30 font-mono text-[10px]">
                L
              </kbd>
            </button>
          )}
        </div>
      </div>

      {/* Shortcuts Cheatsheet Modal */}
      {shortcutsHelpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Control Room Keyboard Shortcuts"
          onClick={(e) => {
            if (e.target === e.currentTarget) onToggleShortcutsHelp();
          }}
          className="fixed inset-0 z-[105] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#0B101B] border border-slate-700 text-slate-100 shadow-2xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-[#EA580C]" />
                <h3 className="font-display text-sm font-bold text-white">
                  Control Room Shortcuts
                </h3>
              </div>
              <button
                type="button"
                onClick={onToggleShortcutsHelp}
                aria-label="Close shortcuts guide"
                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2.5 text-xs">
              {[
                { key: '1 – 6', desc: 'Switch to saved scene / OBS scene 1 through 6' },
                { key: 'Space', desc: 'Trigger OBS WebSocket v5 Scene Transition' },
                { key: 'M', desc: 'Mute / Unmute primary OBS audio input' },
                { key: 'S', desc: 'Toggle scoreboard overlay visibility' },
                { key: 'L', desc: 'Open / Close Quick Live Scorer drawer' },
                { key: '⌘K / Ctrl+K', desc: 'Open global Admin Command Palette' },
                { key: '?', desc: 'Toggle this shortcuts reference' },
              ].map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/80 last:border-none"
                >
                  <span className="text-slate-300">{row.desc}</span>
                  <kbd className="px-2 py-1 rounded bg-[#121826] border border-slate-700 font-mono text-[11px] font-semibold text-orange-300 shrink-0">
                    {row.key}
                  </kbd>
                </div>
              ))}
              <p className="text-[11px] text-slate-400 pt-1 inline-flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Single-key hotkeys automatically pause while typing inside any input.</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
