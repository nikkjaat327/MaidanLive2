import {
  Camera,
  Home,
  LayoutGrid,
  Radio,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tv,
  Wifi,
  X,
} from 'lucide-react';
import type { ObsControllerProfileData } from '../../types/obs.ts';

export type ControlRoomNavId =
  | 'dashboard'
  | 'control_room'
  | 'match_control'
  | 'scoreboard'
  | 'cameras'
  | 'layouts'
  | 'graphics'
  | 'streaming'
  | 'settings';

interface ControlRoomSidebarProps {
  activeNav: ControlRoomNavId;
  onSelectNav: (nav: ControlRoomNavId) => void;
  profile: ObsControllerProfileData | null;
  obsConnected: boolean;
  isBroadcasterRole: boolean;
  activeAdsCount: number;
  cameraCount: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const NAV_ITEMS: Array<{
  id: ControlRoomNavId;
  label: string;
  icon: typeof Home;
  hideForBroadcaster?: boolean;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'control_room', label: 'Control Room', icon: Radio },
  { id: 'match_control', label: 'Match Control', icon: SlidersHorizontal },
  { id: 'scoreboard', label: 'Scoreboard', icon: Tv },
  { id: 'cameras', label: 'Cameras', icon: Camera },
  { id: 'layouts', label: 'Layouts', icon: LayoutGrid },
  { id: 'graphics', label: 'Graphics', icon: Sparkles },
  { id: 'streaming', label: 'Streaming', icon: Wifi },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function ControlRoomSidebar({
  activeNav,
  onSelectNav,
  profile,
  obsConnected,
  isBroadcasterRole,
  activeAdsCount,
  cameraCount,
  mobileOpen = false,
  onCloseMobile,
}: ControlRoomSidebarProps) {
  const bridgeOnline = Boolean(profile?.agentOnline);
  const mediamtxRunning = Boolean(profile?.mediamtxState?.running);
  const visibleItems = NAV_ITEMS.filter(
    (item) => !(isBroadcasterRole && item.hideForBroadcaster)
  );

  const renderSidebarInner = () => (
    <div className="flex flex-col justify-between h-full w-full bg-[#090D16] border-r border-slate-800/90 p-3 select-none">
      <div className="space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectNav(item.id);
                onCloseMobile?.();
              }}
              className={`w-full min-h-[38px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-all ${
                active
                  ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-950/50'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'cameras' && cameraCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {cameraCount}
                </span>
              )}
              {item.id === 'graphics' && activeAdsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono font-bold">
                  {activeAdsCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Real System Status Card matching reference screenshot */}
      <div className="space-y-3 pt-4">
        <div className="rounded-xl bg-[#0F1522] border border-slate-800/90 p-3 space-y-2.5 text-[11px]">
          <div className="flex items-start gap-2">
            <span
              className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                bridgeOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]' : 'bg-slate-600'
              }`}
            />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold text-slate-200 truncate">OBS Bridge</p>
              <p className={bridgeOnline ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {bridgeOnline ? 'Connected' : profile?.connectionMode === 'direct_ws' ? 'Direct WS' : 'Offline'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <span
              className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                obsConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]' : 'bg-amber-500/70'
              }`}
            />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold text-slate-200 truncate">OBS Studio</p>
              <p className="text-slate-400 font-mono text-[10px] truncate">
                {obsConnected
                  ? profile?.obsVersion
                    ? `v${profile.obsVersion.replace(/^v/i, '')}`
                    : 'Connected'
                  : 'Disconnected'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <span
              className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                mediamtxRunning ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]' : 'bg-slate-600'
              }`}
            />
            <div className="min-w-0 leading-tight">
              <p className="font-semibold text-slate-200 truncate">MediaMTX</p>
              <p className={mediamtxRunning ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                {mediamtxRunning ? 'Running' : 'Standby'}
              </p>
            </div>
          </div>
        </div>

        <p className="px-1 text-[10px] font-mono text-slate-500">
          {profile?.bridgeVersion ? `v${profile.bridgeVersion.replace(/^v/i, '')}` : 'v1.6.0'}
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Rail */}
      <aside className="hidden lg:flex w-48 xl:w-52 shrink-0">{renderSidebarInner()}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-60 max-w-[80vw] h-full flex flex-col bg-[#090D16]">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Studio Navigation
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close studio menu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{renderSidebarInner()}</div>
          </div>
        </div>
      )}
    </>
  );
}
