import {
  Check,
  Columns2,
  Grid2X2,
  LayoutGrid,
  PictureInPicture2,
  RefreshCw,
  Square,
  Unplug,
  Zap,
} from 'lucide-react';
import type { LiveStreamData } from '../../types/index.ts';
import type {
  BroadcastCameraData,
  ObsControllerProfileData,
  ObsStudioMatchSummary,
} from '../../types/obs.ts';
import {
  getLayoutSlotCount,
  LAYOUT_METADATA,
  MAX_CONTROL_ROOM_CAMERAS,
  type ObsLayoutType,
} from '../../utils/obsLayoutGeometry.ts';

interface ControlRoomRightPanelProps {
  cameras: BroadcastCameraData[];
  profile: ObsControllerProfileData;
  matchStream: LiveStreamData | ObsStudioMatchSummary | null;
  obsConnected: boolean;
  canManageCameras: boolean;
  stagedLayoutType: ObsLayoutType;
  stagedCameraIds: string[];
  stagedMainCameraId: string;
  applyingLayout: boolean;
  transitioningMode: 'cut' | 'fade' | null;
  refreshingCams: boolean;
  disconnectingAll: boolean;
  onSelectLayoutType: (layout: ObsLayoutType) => void;
  onSlotClick: (slotIdx: number, cameraId?: string) => void;
  onApplyToLive: () => void;
  onCutInstant: () => void;
  onFadeTransition: () => void;
  onRefreshCams: () => void;
  onDisconnectAll: () => void;
}

const ACTIVE_LAYOUT_OPTIONS: ObsLayoutType[] = [
  'SINGLE',
  'SPLIT_2_H',
  'PIP',
  'SPLIT_3',
  'GRID_4',
  'GRID_5',
  'GRID_6',
  'GRID_8',
  'MAIN_PLUS_SECONDARY',
  'DYNAMIC_GRID',
  'SPORT_BROADCAST',
];

const QUICK_LAYOUTS: Array<{
  type: ObsLayoutType;
  label: string;
  minCams: number;
  icon: typeof Square;
}> = [
  { type: 'SINGLE', label: 'Single', minCams: 1, icon: Square },
  { type: 'SPLIT_2_H', label: 'Split (2)', minCams: 2, icon: Columns2 },
  { type: 'PIP', label: 'PiP', minCams: 2, icon: PictureInPicture2 },
  { type: 'SPLIT_3', label: 'Triple (3)', minCams: 3, icon: LayoutGrid },
  { type: 'GRID_4', label: 'Quad (4)', minCams: 4, icon: Grid2X2 },
  { type: 'GRID_5', label: '5-Cam', minCams: 5, icon: LayoutGrid },
  { type: 'GRID_6', label: '6-Cam', minCams: 6, icon: LayoutGrid },
  { type: 'GRID_8', label: '8-Cam', minCams: 8, icon: LayoutGrid },
];

export function ControlRoomRightPanel({
  cameras,
  profile,
  matchStream,
  obsConnected,
  canManageCameras,
  stagedLayoutType,
  stagedCameraIds,
  stagedMainCameraId,
  applyingLayout,
  transitioningMode,
  refreshingCams,
  disconnectingAll,
  onSelectLayoutType,
  onSlotClick,
  onApplyToLive,
  onCutInstant,
  onFadeTransition,
  onRefreshCams,
  onDisconnectAll,
}: ControlRoomRightPanelProps) {
  const enabledCount = Math.min(
    MAX_CONTROL_ROOM_CAMERAS,
    cameras.filter((c) => c.enabled).length
  );
  const slotCount = getLayoutSlotCount(stagedLayoutType, Math.max(1, stagedCameraIds.length));
  const cameraMap = new Map(cameras.map((c) => [c.cameraId, c]));

  // Derive honest Broadcast Output telemetry (never hardcoded!)
  const fps = obsConnected && profile.obsStats ? Math.round(profile.obsStats.activeFps) : 0;
  const skipped =
    obsConnected && profile.obsStats ? profile.obsStats.outputSkippedFrames : 0;
  const isLiveStreamActive = Boolean(obsConnected && profile.obsStreamActive);

  let healthLabel = 'Offline';
  let healthClass = 'bg-slate-800 text-slate-300';
  let healthBars = 0;

  if (obsConnected) {
    if (!isLiveStreamActive) {
      healthLabel = 'Standby';
      healthClass = 'bg-sky-500/20 text-sky-300';
      healthBars = 3;
    } else if (skipped > 25) {
      healthLabel = 'Degraded';
      healthClass = 'bg-red-500/20 text-red-300';
      healthBars = 1;
    } else if (skipped > 5) {
      healthLabel = 'Fair';
      healthClass = 'bg-amber-500/20 text-amber-300';
      healthBars = 2;
    } else {
      healthLabel = 'Healthy';
      healthClass = 'bg-emerald-500/20 text-emerald-300';
      healthBars = 4;
    }
  }

  const outputProviderLabel =
    matchStream?.activeStreamingProvider === 'mediamtx'
      ? 'MediaMTX Live'
      : 'YouTube Live';

  return (
    <aside className="space-y-3">
      {/* ACTIVE LAYOUT + BROADCAST OUTPUT CARD */}
      <div className="rounded-xl border border-slate-800/90 bg-[#0B101B] p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-100">
          <LayoutGrid className="w-4 h-4 text-slate-300" />
          <span>Active Layout</span>
        </div>

        <select
          aria-label="Active staged layout"
          value={stagedLayoutType}
          onChange={(e) => onSelectLayoutType(e.target.value as ObsLayoutType)}
          className="w-full h-9 px-3 rounded-lg bg-[#121826] border border-slate-700/90 text-xs font-semibold text-white focus:outline-none focus:border-purple-500"
        >
          {ACTIVE_LAYOUT_OPTIONS.map((opt) => {
            const meta = LAYOUT_METADATA[opt];
            const disabled = opt !== 'SINGLE' && enabledCount < meta.minCameras;
            return (
              <option key={opt} value={opt} disabled={disabled}>
                {meta.label}
              </option>
            );
          })}
        </select>

        {/* Visual Numbered Slot Grid */}
        <div
          className={`grid gap-2 ${
            slotCount === 1
              ? 'grid-cols-1'
              : slotCount >= 7
                ? 'grid-cols-4'
                : slotCount === 3 || slotCount === 6
                  ? 'grid-cols-3'
                  : 'grid-cols-2'
          }`}
        >
          {Array.from({ length: slotCount }, (_, idx) => {
            const camId = stagedCameraIds[idx];
            const cam = camId ? cameraMap.get(camId) : null;
            const isMain = Boolean(camId && (stagedMainCameraId === camId || idx === 0));
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSlotClick(idx, camId)}
                title={cam ? `CAM ${cam.cameraNumber} (${cam.label || cam.name}) — click to set Primary` : `Slot ${idx + 1} empty`}
                className={`h-10 rounded-lg border font-mono text-xs font-bold flex flex-col items-center justify-center transition-all ${
                  cam
                    ? isMain
                      ? 'bg-purple-600/30 border-purple-400 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                      : 'bg-purple-950/40 border-purple-500/60 text-purple-100 hover:border-purple-400'
                    : 'bg-[#101624] border-slate-800 text-slate-500 hover:border-slate-700'
                }`}
              >
                <span>{cam ? `CAM ${cam.cameraNumber}` : idx + 1}</span>
                {cam && (
                  <span className="text-[9px] font-sans font-normal text-purple-200/80 truncate max-w-[90%]">
                    {isMain ? 'Primary' : cam.label || cam.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Purple Apply to Live CTA */}
        <button
          type="button"
          disabled={!obsConnected || stagedCameraIds.length === 0 || applyingLayout}
          onClick={onApplyToLive}
          className="w-full min-h-[38px] rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-lg shadow-purple-950/50 disabled:opacity-45 transition-all"
        >
          {applyingLayout ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          <span>{applyingLayout ? 'Applying to OBS...' : 'Apply to Live'}</span>
        </button>

        {/* Broadcast Output Telemetry Card (100% Honest, Derived from Real OBS Stats) */}
        <div className="rounded-xl bg-[#0F1522] border border-slate-800/90 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-200">
            <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
            <span>Broadcast Output</span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-100 truncate">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isLiveStreamActive
                    ? 'bg-emerald-400'
                    : obsConnected
                      ? 'bg-amber-400'
                      : 'bg-slate-600'
                }`}
              />
              <span>{outputProviderLabel}</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400 tabular-nums shrink-0">
              {obsConnected && fps > 0 ? `${fps} fps · ${skipped} drop` : obsConnected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Stream Health:</span>
              <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${healthClass}`}>
                {healthLabel}
              </span>
            </div>
            <div className="flex items-end gap-[2px] h-3">
              {[1, 2, 3, 4].map((lvl) => (
                <span
                  key={lvl}
                  className={`w-[3px] rounded-[1px] ${
                    lvl === 1 ? 'h-1' : lvl === 2 ? 'h-1.5' : lvl === 3 ? 'h-2.5' : 'h-3'
                  } ${healthBars >= lvl ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* QUICK LAYOUTS CARD */}
      <div className="rounded-xl border border-slate-800/90 bg-[#0B101B] p-3.5 space-y-2.5">
        <p className="text-xs font-bold text-slate-100">Quick Layouts</p>
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_LAYOUTS.map((ql) => {
            const Icon = ql.icon;
            const active = stagedLayoutType === ql.type;
            const disabled = ql.minCams > enabledCount;
            return (
              <button
                key={ql.type}
                type="button"
                disabled={disabled}
                onClick={() => onSelectLayoutType(ql.type)}
                title={
                  disabled
                    ? `Requires ${ql.minCams} enabled cameras`
                    : `Stage ${ql.label} layout`
                }
                className={`py-2 px-1 rounded-lg border flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all disabled:opacity-35 ${
                  active
                    ? 'border-purple-500 bg-purple-600/25 text-white shadow-[0_0_12px_rgba(147,51,234,0.28)]'
                    : 'border-slate-800 bg-[#101624] text-slate-300 hover:border-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-purple-300' : 'text-slate-400'}`} />
                <span className="truncate max-w-full">{ql.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIONS CARD */}
      <div className="rounded-xl border border-slate-800/90 bg-[#0B101B] p-3.5 space-y-2.5">
        <p className="text-xs font-bold text-slate-100">Actions</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!obsConnected || stagedCameraIds.length === 0 || transitioningMode !== null}
            onClick={onCutInstant}
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#121826] border border-slate-700/80 hover:border-purple-500 text-slate-100 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{transitioningMode === 'cut' ? 'Cutting...' : 'Cut (Instant)'}</span>
          </button>

          <button
            type="button"
            disabled={!obsConnected || stagedCameraIds.length === 0 || transitioningMode !== null}
            onClick={onFadeTransition}
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#121826] border border-slate-700/80 hover:border-purple-500 text-slate-100 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Columns2 className="w-3.5 h-3.5 text-purple-400" />
            <span>{transitioningMode === 'fade' ? 'Fading...' : 'Transition (0.5s)'}</span>
          </button>

          <button
            type="button"
            disabled={refreshingCams}
            onClick={onRefreshCams}
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#121826] border border-slate-700/80 hover:border-emerald-500/70 text-slate-100 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${refreshingCams ? 'animate-spin' : ''}`} />
            <span>{refreshingCams ? 'Refreshing...' : 'Refresh Cams'}</span>
          </button>

          <button
            type="button"
            disabled={!canManageCameras || disconnectingAll || cameras.length === 0}
            onClick={onDisconnectAll}
            title={canManageCameras ? 'Disconnect all active cameras' : 'Requires Manage Cameras permission'}
            className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#121826] border border-slate-700/80 hover:border-red-500/70 text-slate-100 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Unplug className="w-3.5 h-3.5 text-red-400" />
            <span>{disconnectingAll ? 'Disconnecting...' : 'Disconnect All'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
