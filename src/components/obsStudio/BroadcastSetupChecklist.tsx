import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
} from 'lucide-react';
import type { BroadcastCameraData, ObsControllerProfileData, ObsStudioMatchSummary } from '../../types/obs.ts';

interface BroadcastSetupChecklistProps {
  match: ObsStudioMatchSummary;
  profile: ObsControllerProfileData;
  cameras: BroadcastCameraData[];
  selectedCount: number;
  onOpenConnection: () => void;
  onOpenMapSources: () => void;
  onOpenCamerasTab: () => void;
  onOpenOverlayTab: () => void;
  onOpenGuide: () => void;
}

export function BroadcastSetupChecklist({
  match,
  profile,
  cameras,
  selectedCount,
  onOpenConnection,
  onOpenMapSources,
  onOpenCamerasTab,
  onOpenOverlayTab,
  onOpenGuide,
}: BroadcastSetupChecklistProps) {
  const obsConnected = profile.connectionStatus === 'CONNECTED';
  const bridgeReady =
    profile.connectionMode === 'direct_ws' ? obsConnected : Boolean(profile.agentOnline);
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const onlineCameras = useMemo(
    () =>
      enabledCameras.filter(
        (c) => c.status === 'CONNECTED' || c.status === 'ACTIVE'
      ),
    [enabledCameras]
  );
  const outputConfigured = Boolean(
    match.youtubeVideoId || match.activeStreamingProvider === 'mediamtx'
  );
  const allSetupReady = obsConnected && enabledCameras.length > 0 && outputConfigured;

  const [expanded, setExpanded] = useState<boolean>(() => !allSetupReady);

  const steps = [
    {
      num: 1,
      title: 'Bridge & OBS Studio',
      done: obsConnected,
      detail: obsConnected
        ? `Connected (${profile.activeObsScene || 'Ready'})`
        : bridgeReady
          ? 'Bridge online — open OBS Studio & enable WebSocket 4455'
          : 'Pair Windows Bridge or configure Direct WS',
      actionLabel: obsConnected ? 'Check' : 'Connect OBS',
      onAction: onOpenConnection,
    },
    {
      num: 2,
      title: 'Cameras & Source Map',
      done: enabledCameras.length > 0,
      detail:
        enabledCameras.length > 0
          ? `${enabledCameras.length} configured (${onlineCameras.length} online)`
          : 'Map OBS camera inputs or add smartphone QR cameras',
      actionLabel: obsConnected ? 'Map OBS Sources' : 'Add Cameras',
      onAction: obsConnected ? onOpenMapSources : onOpenCamerasTab,
    },
    {
      num: 3,
      title: 'Scoreboard & YouTube',
      done: outputConfigured,
      detail: match.youtubeVideoId
        ? `YouTube linked (${match.youtubeVideoId})`
        : match.activeStreamingProvider === 'mediamtx'
          ? 'MediaMTX Direct active'
          : 'Link YouTube Live ID & verify Scoreboard overlay',
      actionLabel: 'Overlay & Output',
      onAction: onOpenOverlayTab,
    },
    {
      num: 4,
      title: 'Switch & Go Live',
      done: Boolean(profile.obsStreamActive),
      detail: profile.obsStreamActive
        ? `Streaming live (${profile.obsStreamTimecode || 'Active'})`
        : selectedCount > 0
          ? `${selectedCount} camera(s) staged — click APPLY TO LIVE BROADCAST`
          : 'Select camera(s) below & click APPLY TO LIVE BROADCAST',
      actionLabel: undefined,
      onAction: undefined,
    },
  ];

  const completedSteps = steps.filter((s) => s.done).length;

  // Dynamic Contextual Next Step Banner
  const nextGuidance = useMemo(() => {
    if (!obsConnected) {
      return {
        tone: 'amber' as const,
        heading: !bridgeReady
          ? 'Next Step: Windows OBS Bridge connect karein (ya Direct WebSocket set karein)'
          : 'Next Step: OBS Studio open karke WebSocket Server (port 4455) ON karein',
        subtext:
          'Step 1 complete hone ke baad OBS ke saare scenes aur camera inputs yahan live dikhne lagenge.',
        ctaLabel: 'Open OBS Connection',
        onCta: onOpenConnection,
      };
    }
    if (enabledCameras.length === 0) {
      return {
        tone: 'orange' as const,
        heading: 'Next Step: Apne OBS sources ko Camera tiles ke roop me Map karein',
        subtext:
          'OBS connected hai! "Map OBS Sources" dabakar apne USB/HDMI/Browser camera inputs ko CAM 1, CAM 2, WIDE naam dein, ya mobile QR cameras jodein.',
        ctaLabel: 'Map OBS Sources',
        onCta: onOpenMapSources,
      };
    }
    if (!outputConfigured) {
      return {
        tone: 'sky' as const,
        heading: 'Next Step: YouTube Live ID link karein aur Scoreboard overlay check karein',
        subtext:
          'Cameras ready hain — YouTube video link karne ke baad spectators aur broadcast monitor live sync ho jaayenge.',
        ctaLabel: 'Link YouTube & Overlay',
        onCta: onOpenOverlayTab,
      };
    }
    if (!profile.obsStreamActive) {
      return {
        tone: 'emerald' as const,
        heading:
          selectedCount > 0
            ? `Ready: ${selectedCount} camera(s) staged — "APPLY TO LIVE BROADCAST" se OBS scene check karke Stream Start karein`
            : 'All Systems Connected: Left panel se cameras select karein aur live composition test karein',
        subtext:
          'Camera tiles par click karne se sirf Preview/Composition update hota hai — live viewers ko tabhi dikhega jab aap APPLY dabayenge.',
        ctaLabel: undefined,
        onCta: undefined,
      };
    }
    return {
      tone: 'live' as const,
      heading: `ON AIR · Program Scene "${profile.activeObsScene || 'Active'}" YouTube par live chal raha hai`,
      subtext:
        'Kisi bhi camera tile par click karke next split/PIP/single layout stage karein, aur APPLY TO LIVE BROADCAST se smoothly cut karein.',
      ctaLabel: undefined,
      onCta: undefined,
    };
  }, [
    obsConnected,
    bridgeReady,
    enabledCameras.length,
    outputConfigured,
    profile.obsStreamActive,
    profile.activeObsScene,
    selectedCount,
    onOpenConnection,
    onOpenMapSources,
    onOpenOverlayTab,
  ]);

  const bannerToneClasses =
    nextGuidance.tone === 'amber'
      ? 'border-amber-500/40 bg-amber-950/35 text-amber-100'
      : nextGuidance.tone === 'orange'
        ? 'border-[#EA580C]/50 bg-[#EA580C]/15 text-orange-50'
        : nextGuidance.tone === 'sky'
          ? 'border-sky-500/40 bg-sky-950/35 text-sky-100'
          : nextGuidance.tone === 'live'
            ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-100'
            : 'border-emerald-500/35 bg-slate-900 text-slate-100';

  return (
    <div className="space-y-2.5">
      {/* Contextual Next-Step Banner */}
      <div
        className={`rounded-xl border px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${bannerToneClasses}`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Compass className="w-4 h-4 text-[#EA580C] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-bold leading-snug">{nextGuidance.heading}</p>
            <p className="text-[11px] opacity-80 mt-0.5 leading-snug">{nextGuidance.subtext}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {nextGuidance.ctaLabel && nextGuidance.onCta && (
            <button
              type="button"
              onClick={nextGuidance.onCta}
              className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-xs font-semibold hover:bg-orange-600 whitespace-nowrap"
            >
              <span>{nextGuidance.ctaLabel}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenGuide}
            className="min-h-[32px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Step-by-Step Guide</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-300 text-xs font-mono font-semibold hover:bg-slate-800 whitespace-nowrap tabular-nums"
          >
            <span>Setup {completedSteps}/4</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsible 4-Step Setup Checklist */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 rounded-xl border border-slate-800 bg-slate-950 p-3">
          {steps.map((step) => (
            <div
              key={step.num}
              className={`rounded-lg border p-3 flex flex-col justify-between gap-2 ${
                step.done
                  ? 'border-emerald-500/35 bg-emerald-950/20'
                  : 'border-slate-800 bg-slate-900/80'
              }`}
            >
              <div className="flex items-start gap-2">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Step {step.num}
                  </p>
                  <p className="text-xs font-bold text-white mt-0.5">{step.title}</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">{step.detail}</p>
                </div>
              </div>
              {step.actionLabel && step.onAction && (
                <button
                  type="button"
                  onClick={step.onAction}
                  className="self-start text-[11px] font-semibold text-orange-400 hover:text-orange-300 whitespace-nowrap"
                >
                  {step.actionLabel} →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
