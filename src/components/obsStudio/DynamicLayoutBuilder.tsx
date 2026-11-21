import { useEffect, useMemo, useState } from 'react';
import { Check, Grid2x2, Layers, LayoutGrid, Play, Plus, Tv } from 'lucide-react';
import {
  computeObsLayoutBoxes,
  LAYOUT_METADATA,
  ObsLayoutType,
} from '../../utils/obsLayoutGeometry.ts';
import type { BroadcastCameraData } from '../../types/obs.ts';

interface DynamicLayoutBuilderProps {
  cameras: BroadcastCameraData[];
  obsConnected: boolean;
  activeLayoutType: ObsLayoutType;
  activeObsScene: string;
  preferredMainCameraId?: string;
  applying: boolean;
  onApplyLayout: (payload: {
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
    sceneName?: string;
    includeScoreboardOverlay: boolean;
  }) => Promise<void>;
  onSaveAsScene: (payload: {
    name: string;
    obsSceneName: string;
    layoutType: ObsLayoutType;
    cameraIds: string[];
    mainCameraId?: string;
    includeScoreboardOverlay: boolean;
  }) => Promise<void>;
}

const LAYOUT_TYPES = Object.keys(LAYOUT_METADATA) as ObsLayoutType[];

export function DynamicLayoutBuilder({
  cameras,
  obsConnected,
  activeLayoutType,
  activeObsScene,
  preferredMainCameraId,
  applying,
  onApplyLayout,
  onSaveAsScene,
}: DynamicLayoutBuilderProps) {
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);

  const [layoutType, setLayoutType] = useState<ObsLayoutType>(activeLayoutType || 'SINGLE');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mainCameraId, setMainCameraId] = useState<string>('');
  const [customSceneName, setCustomSceneName] = useState<string>('');
  const [includeScoreboardOverlay, setIncludeScoreboardOverlay] = useState<boolean>(true);
  const [savingScene, setSavingScene] = useState(false);

  // Sync default selection when cameras list loads or changes
  useEffect(() => {
    if (enabledCameras.length === 0) {
      setSelectedIds([]);
      setMainCameraId('');
      return;
    }
    setSelectedIds((prev) => {
      const valid = prev.filter((id) => enabledCameras.some((c) => c.cameraId === id));
      if (valid.length > 0) return valid;
      const defaultTake =
        layoutType === 'SINGLE'
          ? 1
          : layoutType === 'SPLIT_2_H' || layoutType === 'SPLIT_2_V'
            ? 2
            : layoutType === 'SPLIT_3'
              ? 3
              : layoutType === 'GRID_4'
                ? 4
                : enabledCameras.length;
      return enabledCameras.slice(0, defaultTake).map((c) => c.cameraId);
    });
    setMainCameraId((prev) =>
      prev && enabledCameras.some((c) => c.cameraId === prev)
        ? prev
        : enabledCameras[0].cameraId
    );
  }, [enabledCameras, layoutType]);

  // Sync main camera when promoted externally from the multiview preview grid
  useEffect(() => {
    if (!preferredMainCameraId) return;
    if (!enabledCameras.some((c) => c.cameraId === preferredMainCameraId)) return;
    setMainCameraId(preferredMainCameraId);
    setSelectedIds((prev) =>
      prev.includes(preferredMainCameraId) ? prev : [preferredMainCameraId, ...prev]
    );
  }, [preferredMainCameraId, enabledCameras]);

  function handleLayoutSelect(nextType: ObsLayoutType) {
    setLayoutType(nextType);
    const meta = LAYOUT_METADATA[nextType];
    if (enabledCameras.length > 0) {
      const targetCount =
        nextType === 'SINGLE'
          ? 1
          : nextType === 'SPLIT_2_H' || nextType === 'SPLIT_2_V'
            ? 2
            : nextType === 'SPLIT_3'
              ? 3
              : nextType === 'GRID_4'
                ? 4
                : enabledCameras.length;
      setSelectedIds(enabledCameras.slice(0, Math.min(targetCount, enabledCameras.length)).map((c) => c.cameraId));
    }
    if (!customSceneName.trim()) {
      setCustomSceneName('');
    } else if (meta) {
      setCustomSceneName(meta.defaultSceneName);
    }
  }

  function toggleCamera(cameraId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(cameraId)) {
        const next = prev.filter((id) => id !== cameraId);
        if (mainCameraId === cameraId && next.length > 0) {
          setMainCameraId(next[0]);
        }
        return next;
      }
      if (!mainCameraId) setMainCameraId(cameraId);
      return [...prev, cameraId];
    });
  }

  const boxes = useMemo(
    () => computeObsLayoutBoxes(layoutType, selectedIds, mainCameraId, 1920, 1080),
    [layoutType, selectedIds, mainCameraId]
  );

  const cameraLookup = useMemo(
    () => new Map(cameras.map((c) => [c.cameraId, c])),
    [cameras]
  );

  const meta = LAYOUT_METADATA[layoutType];
  const resolvedSceneName =
    customSceneName.trim() ||
    (layoutType === 'DYNAMIC_GRID' ? `MULTI CAM ${Math.max(1, boxes.length)}X` : meta.defaultSceneName);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-[#EA580C]" />
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
              Dynamic Multi-Camera Layout Builder
            </h2>
            <p className="text-[11px] text-slate-400">
              Combine any 1, 2, 3, 4, 5, 6, 8+ cameras into live 1920×1080 OBS compositions without restarting YouTube.
            </p>
          </div>
        </div>

        <span className="font-mono text-[11px] px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
          OBS Program: <strong className="text-white">{activeObsScene || 'None'}</strong>
        </span>
      </div>

      {/* Layout Mode Picker */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {LAYOUT_TYPES.map((type) => {
          const item = LAYOUT_METADATA[type];
          const active = layoutType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleLayoutSelect(type)}
              className={`p-2.5 rounded-lg border text-left transition-colors ${
                active
                  ? 'border-[#EA580C] bg-[#EA580C]/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold truncate">{item.shortLabel}</span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {item.recommendedCameras}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{item.label}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Proportional 16:9 Canvas Blueprint */}
        <div className="lg:col-span-7 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Grid2x2 className="w-3.5 h-3.5 text-[#EA580C]" />
              1920×1080 OBS Canvas Blueprint ({boxes.length} active slots)
            </span>
            <span className="font-mono text-slate-300">{resolvedSceneName}</span>
          </div>

          <div className="relative w-full aspect-video rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
            {boxes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 p-4 text-center">
                Select one or more enabled cameras on the right to preview the OBS layout grid.
              </div>
            ) : (
              boxes.map((box) => {
                const cam = cameraLookup.get(box.cameraId);
                const leftPct = (box.x / 1920) * 100;
                const topPct = (box.y / 1080) * 100;
                const widthPct = (box.width / 1920) * 100;
                const heightPct = (box.height / 1080) * 100;
                const isMain = box.role === 'main';

                return (
                  <div
                    key={`${box.cameraId}-${box.slotIndex}`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${widthPct}%`,
                      height: `${heightPct}%`,
                    }}
                    className={`absolute p-1 transition-all`}
                  >
                    <div
                      className={`w-full h-full rounded border flex flex-col justify-between p-2 ${
                        isMain
                          ? 'border-[#EA580C] bg-[#EA580C]/15'
                          : 'border-slate-700 bg-slate-900/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-950/90 text-white">
                          CAM {cam?.cameraNumber || box.slotIndex + 1}
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">
                          {box.width}×{box.height}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-white truncate">
                          {cam?.label || cam?.name || box.cameraId}
                        </p>
                        {cam?.status && (
                          <p className="font-mono text-[9px] text-slate-400 uppercase">
                            {cam.status}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {includeScoreboardOverlay && boxes.length > 0 && (
              <div className="absolute bottom-2.5 left-3 right-3 h-7 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 flex items-center justify-between pointer-events-none">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-300">
                  <Tv className="w-3 h-3" />
                  MaidanLive Scoreboard Overlay Layer (Top)
                </span>
                <span className="font-mono text-[9px] text-emerald-200">1920×1080 Transparent</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Camera Assignment & OBS Execution */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Assign Cameras ({selectedIds.length} selected of {enabledCameras.length} enabled)
            </span>
            {enabledCameras.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(enabledCameras.map((c) => c.cameraId))}
                className="text-[11px] font-semibold text-orange-400 hover:text-orange-300"
              >
                Select All ({enabledCameras.length})
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {enabledCameras.length === 0 ? (
              <div className="p-3 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-400">
                No enabled cameras yet. Add cameras in the "Cameras &amp; Smartphone Setup" tab.
              </div>
            ) : (
              enabledCameras.map((cam) => {
                const selected = selectedIds.includes(cam.cameraId);
                const isMain = mainCameraId === cam.cameraId;
                return (
                  <div
                    key={cam.cameraId}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs ${
                      selected
                        ? 'border-[#EA580C]/70 bg-[#EA580C]/10 text-white'
                        : 'border-slate-800 bg-slate-950 text-slate-300'
                    }`}
                  >
                    <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleCamera(cam.cameraId)}
                        className="w-4 h-4 rounded border-slate-600 text-[#EA580C] shrink-0"
                      />
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        #{cam.cameraNumber}
                      </span>
                      <span className="font-semibold truncate">{cam.label || cam.name}</span>
                    </label>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {(layoutType === 'MAIN_PLUS_SECONDARY' ||
                        layoutType === 'SPLIT_3' ||
                        layoutType === 'SINGLE' ||
                        layoutType === 'SPORT_BROADCAST') &&
                        selected && (
                          <button
                            type="button"
                            onClick={() => setMainCameraId(cam.cameraId)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isMain
                                ? 'bg-[#EA580C] text-white border-[#EA580C]'
                                : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            {isMain ? 'MAIN' : 'Set Main'}
                          </button>
                        )}
                      {selected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Target OBS Scene Name (Auto-created in OBS if needed)
              </label>
              <input
                type="text"
                value={customSceneName}
                onChange={(e) => setCustomSceneName(e.target.value)}
                placeholder={resolvedSceneName}
                className="w-full min-h-[38px] px-3 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeScoreboardOverlay}
                onChange={(e) => setIncludeScoreboardOverlay(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-[#EA580C]"
              />
              <span>Include Live Scoreboard Browser Source Layer</span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!obsConnected || selectedIds.length === 0 || applying}
                onClick={() =>
                  onApplyLayout({
                    layoutType,
                    cameraIds: selectedIds,
                    mainCameraId,
                    sceneName: resolvedSceneName,
                    includeScoreboardOverlay,
                  })
                }
                className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 disabled:opacity-40 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{applying ? 'Applying in OBS...' : 'Apply Layout Live in OBS'}</span>
              </button>

              <button
                type="button"
                disabled={selectedIds.length === 0 || savingScene}
                onClick={async () => {
                  try {
                    setSavingScene(true);
                    await onSaveAsScene({
                      name: `${meta.shortLabel} (${selectedIds.length} Cams)`,
                      obsSceneName: resolvedSceneName,
                      layoutType,
                      cameraIds: selectedIds,
                      mainCameraId,
                      includeScoreboardOverlay,
                    });
                  } finally {
                    setSavingScene(false);
                  }
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-950 border border-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{savingScene ? 'Saving...' : 'Save Preset'}</span>
              </button>
            </div>

            {!obsConnected && (
              <p className="text-[11px] text-amber-300">
                Connect OBS Studio first in the "OBS Connection &amp; Agent" tab before taking layouts live.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
