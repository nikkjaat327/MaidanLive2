import { ArrowRightLeft, Check, Layers, Loader2, Plus } from 'lucide-react';
import type { BroadcastSceneData, ObsControllerProfileData } from '../../types/obs.ts';

interface ControlRoomSceneBarProps {
  profile: ObsControllerProfileData;
  scenes: BroadcastSceneData[];
  obsConnected: boolean;
  switchingKey: string | null;
  applyingLayout: boolean;
  triggeringTransition?: boolean;
  onSwitchObsScene: (sceneName: string) => void;
  onApplySavedScene: (scene: BroadcastSceneData) => void;
  onTriggerSceneTransition?: () => void;
  onAddSceneClick: () => void;
}

export function ControlRoomSceneBar({
  profile,
  scenes,
  obsConnected,
  switchingKey,
  applyingLayout,
  triggeringTransition = false,
  onSwitchObsScene,
  onApplySavedScene,
  onTriggerSceneTransition,
  onAddSceneClick,
}: ControlRoomSceneBarProps) {
  const obsScenes = profile.obsScenes || [];

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#0B101B] p-2.5 flex flex-wrap items-center gap-2">
      {/* Purple Live Layouts Badge */}
      <div className="min-h-[38px] px-3.5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 text-white text-xs font-bold inline-flex items-center gap-2 shrink-0 shadow-md shadow-purple-950/40">
        <Layers className="w-4 h-4" />
        <span>Live Layouts</span>
      </div>

      {/* Scene Pills */}
      <div className="flex-1 flex flex-wrap items-center gap-2 min-w-0">
        {obsScenes.slice(0, 6).map((sceneName, idx) => {
          const active = obsConnected && profile.activeObsScene === sceneName;
          const isPreview =
            obsConnected &&
            Boolean(profile.studioModeEnabled) &&
            profile.previewObsScene === sceneName &&
            !active;
          const busy = switchingKey === `scene:${sceneName}`;
          const friendly = profile.sceneLabels?.[sceneName]?.trim() || sceneName;
          return (
            <button
              key={sceneName}
              type="button"
              disabled={!obsConnected || switchingKey !== null}
              onClick={() => onSwitchObsScene(sceneName)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-left inline-flex items-center gap-2.5 transition-all disabled:opacity-45 ${
                active
                  ? 'border-purple-500 bg-purple-600/20 text-white shadow-[0_0_12px_rgba(147,51,234,0.28)]'
                  : isPreview
                    ? 'border-emerald-500/70 bg-emerald-600/15 text-emerald-100'
                    : 'border-slate-800 bg-[#101624] text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <div className="min-w-0 leading-tight">
                <p className="text-[11px] font-bold truncate max-w-[130px]">
                  Scene {idx + 1}{isPreview ? ' (PVW)' : ''}
                </p>
                <p className="text-[10px] text-slate-400 truncate max-w-[130px]">
                  {busy ? 'Switching...' : friendly}
                </p>
              </div>
              {active && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
            </button>
          );
        })}

        {obsScenes.length === 0 &&
          scenes.slice(0, 6).map((sc, idx) => {
            const active = obsConnected && profile.activeObsScene === sc.obsSceneName;
            return (
              <button
                key={sc.id}
                type="button"
                disabled={!obsConnected || applyingLayout}
                onClick={() => onApplySavedScene(sc)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-left inline-flex items-center gap-2.5 transition-all disabled:opacity-45 ${
                  active
                    ? 'border-purple-500 bg-purple-600/20 text-white'
                    : 'border-slate-800 bg-[#101624] text-slate-300 hover:border-slate-700 hover:text-white'
                }`}
              >
                <div className="min-w-0 leading-tight">
                  <p className="text-[11px] font-bold truncate max-w-[130px]">
                    Scene {idx + 1}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate max-w-[130px]">{sc.name}</p>
                </div>
                {active && <Check className="w-3.5 h-3.5 text-purple-300 shrink-0" />}
              </button>
            );
          })}

        {obsScenes.length === 0 && scenes.length === 0 && (
          <span className="text-[11px] text-slate-500 px-2">
            Connect OBS Studio or save a staged layout preset to populate Live Scenes.
          </span>
        )}
      </div>

      {/* Trigger Studio Mode Scene Transition */}
      {onTriggerSceneTransition && (
        <button
          type="button"
          disabled={!obsConnected || triggeringTransition || switchingKey !== null}
          onClick={onTriggerSceneTransition}
          title={
            profile.studioModeEnabled && profile.previewObsScene
              ? `Transition Preview (${profile.previewObsScene}) to Program via OBS Studio Mode`
              : 'Trigger OBS Studio Mode Scene Transition'
          }
          className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-45 shadow-md shadow-orange-950/40"
        >
          {triggeringTransition ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <ArrowRightLeft className="w-3.5 h-3.5" />
          )}
          <span>{triggeringTransition ? 'Transitioning...' : 'Trigger Scene Transition'}</span>
        </button>
      )}

      {/* Add Scene */}
      <button
        type="button"
        onClick={onAddSceneClick}
        className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-700/90 bg-[#101624] hover:border-purple-500/70 hover:text-white text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>Add Scene</span>
      </button>
    </div>
  );
}
