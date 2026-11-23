import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Layers,
  Laptop,
  Play,
  Plus,
  Radio,
  Server,
  SlidersHorizontal,
  StopCircle,
  Tv,
  Youtube,
} from 'lucide-react';
import type { LiveScoreData, StreamingProvider } from '../../types/index.ts';
import type {
  BroadcastCameraData,
  ObsControllerProfileData,
  ObsStudioMatchSummary,
} from '../../types/obs.ts';
import {
  deriveControlRoomSteps,
  deriveSeparatedBroadcastStatuses,
  hasStreamOutputReady,
  isMatchPubliclyLive,
} from '../../utils/broadcastWorkflow.ts';
import { extractYouTubeVideoId } from '../../utils/youtube.ts';
import type { YouTubeVerification } from '../../services/liveStream/liveStreamService.ts';
import { LiveStreamPlayer } from '../broadcast/LiveStreamPlayer.tsx';

interface ControlRoomWorkflowPanelProps {
  match: ObsStudioMatchSummary;
  profile: ObsControllerProfileData;
  cameras: BroadcastCameraData[];
  score?: LiveScoreData | null;
  scoreboardOverlayUrl: string;
  isBroadcasterRole?: boolean;

  // Step 5 YouTube / Output controls
  ytInputDraft: string;
  ytProviderDraft: StreamingProvider;
  onChangeYtInputDraft: (val: string) => void;
  onChangeYtProviderDraft: (provider: StreamingProvider) => void;
  savingYtOutput: boolean;
  verifyingYtOutput: boolean;
  ytVerification: YouTubeVerification | null;
  onSaveYouTubeOutput: (e?: React.FormEvent, verifyAfterSave?: boolean) => Promise<void> | void;

  // Step 6 & 7 Broadcast Lifecycle controls
  activatingBroadcast: boolean;
  endingBroadcast: boolean;
  onActivateBroadcast: () => Promise<void> | void;
  onRequestEndBroadcast: () => void;
  onOpenNextMatchSetup: () => void;

  // Navigation / Quick actions across steps 1-4
  onEditMatchSetup: () => void;
  onOpenConnection: () => void;
  onOpenMapSources: () => void;
  onOpenCamerasTab: () => void;
  onOpenOverlayTab: () => void;
  onOpenGuide: () => void;
}

function toneBadgeClasses(tone: 'slate' | 'amber' | 'sky' | 'emerald' | 'red') {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'red':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'amber':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'sky':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function ControlRoomWorkflowPanel({
  match,
  profile,
  cameras,
  score,
  scoreboardOverlayUrl,
  isBroadcasterRole = false,
  ytInputDraft,
  ytProviderDraft,
  onChangeYtInputDraft,
  onChangeYtProviderDraft,
  savingYtOutput,
  verifyingYtOutput,
  ytVerification,
  onSaveYouTubeOutput,
  activatingBroadcast,
  endingBroadcast,
  onActivateBroadcast,
  onRequestEndBroadcast,
  onOpenNextMatchSetup,
  onEditMatchSetup,
  onOpenConnection,
  onOpenMapSources,
  onOpenCamerasTab,
  onOpenOverlayTab,
  onOpenGuide,
}: ControlRoomWorkflowPanelProps) {
  const obsConnected = profile.connectionStatus === 'CONNECTED';
  const enabledCameras = useMemo(() => cameras.filter((c) => c.enabled), [cameras]);
  const onlineCameras = useMemo(
    () => enabledCameras.filter((c) => c.status === 'CONNECTED' || c.status === 'ACTIVE'),
    [enabledCameras]
  );

  const statuses = useMemo(
    () => deriveSeparatedBroadcastStatuses({ match, profile, score }),
    [match, profile, score]
  );

  const steps = useMemo(
    () => deriveControlRoomSteps({ match, profile, cameras }),
    [match, profile, cameras]
  );

  const isEnded = match.status === 'ENDED';
  const isPublicLive = isMatchPubliclyLive(match);
  const outputReady = hasStreamOutputReady(match);

  // Default expanded if match is still in preparation / not yet publicly live
  const [workflowExpanded, setWorkflowExpanded] = useState<boolean>(() => !isPublicLive);
  const [showPlayerPreview, setShowPlayerPreview] = useState(false);
  const [copiedOverlay, setCopiedOverlay] = useState(false);

  const parsedDraftYt = ytInputDraft.trim() ? extractYouTubeVideoId(ytInputDraft) : null;

  function handleCopyOverlayUrl() {
    if (!scoreboardOverlayUrl) return;
    navigator.clipboard?.writeText(scoreboardOverlayUrl).catch(() => {});
    setCopiedOverlay(true);
    window.setTimeout(() => setCopiedOverlay(false), 1800);
  }

  return (
    <div className="space-y-3">
      {/* 1. Separated Status Matrix (OBS vs YouTube vs Match vs MaidanLive Visibility) */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 sm:px-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#EA580C]" />
            <span className="font-display text-xs font-bold uppercase tracking-wider text-slate-900">
              Broadcast Status Matrix
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenGuide}
              className="min-h-[30px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Control Room Guide</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkflowExpanded((v) => !v)}
              className="min-h-[30px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-900 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              <span>{workflowExpanded ? 'Collapse Workflow Steps' : 'Show 7-Step Workflow'}</span>
              {workflowExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* OBS Status */}
          <div className={`rounded-lg border px-3 py-2 ${toneBadgeClasses(statuses.obsStatus.tone)}`}>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                OBS Status
              </span>
              <Laptop className="w-3.5 h-3.5 opacity-80" />
            </div>
            <p className="text-xs font-bold mt-0.5">{statuses.obsStatus.label}</p>
            <p className="text-[11px] opacity-80 truncate mt-0.5" title={statuses.obsStatus.detail}>
              {statuses.obsStatus.detail}
            </p>
          </div>

          {/* YouTube / Direct Output Status */}
          <div
            className={`rounded-lg border px-3 py-2 ${toneBadgeClasses(statuses.youtubeStatus.tone)}`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                YouTube Output
              </span>
              {match.activeStreamingProvider === 'mediamtx' ? (
                <Server className="w-3.5 h-3.5 opacity-80" />
              ) : (
                <Youtube className="w-3.5 h-3.5 opacity-80" />
              )}
            </div>
            <p className="text-xs font-bold mt-0.5">{statuses.youtubeStatus.label}</p>
            <p
              className="text-[11px] opacity-80 truncate mt-0.5"
              title={statuses.youtubeStatus.detail}
            >
              {statuses.youtubeStatus.detail}
            </p>
          </div>

          {/* Match / Scoreboard Status */}
          <div className={`rounded-lg border px-3 py-2 ${toneBadgeClasses(statuses.matchStatus.tone)}`}>
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                Match Status
              </span>
              <SlidersHorizontal className="w-3.5 h-3.5 opacity-80" />
            </div>
            <p className="text-xs font-bold mt-0.5">{statuses.matchStatus.label}</p>
            <p className="text-[11px] opacity-80 truncate mt-0.5" title={statuses.matchStatus.detail}>
              {statuses.matchStatus.detail}
            </p>
          </div>

          {/* MaidanLive Broadcast Visibility */}
          <div
            className={`rounded-lg border px-3 py-2 ${toneBadgeClasses(statuses.workflowStatus.tone)}`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                MaidanLive Portal
              </span>
              <Radio className="w-3.5 h-3.5 opacity-80" />
            </div>
            <p className="text-xs font-bold mt-0.5">{statuses.workflowStatus.label}</p>
            <p className="text-[11px] opacity-80 truncate mt-0.5">
              {statuses.workflowStatus.isPubliclyPublished
                ? 'Published to Player Portal viewers'
                : isEnded
                  ? 'Archived · final score saved'
                  : 'Unpublished draft · safe to prep'}
            </p>
          </div>
        </div>

        {/* 7-Step Horizontal Pipeline Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1">
          {steps.map((step) => {
            const stateClasses =
              step.state === 'completed'
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                : step.state === 'current'
                  ? 'border-[#EA580C] bg-orange-50 text-slate-900 ring-1 ring-[#EA580C]/20'
                  : step.state === 'blocked'
                    ? 'border-amber-200 bg-amber-50/50 text-amber-900'
                    : 'border-slate-200 bg-slate-50 text-slate-600';

            const handleStepClick = () => {
              if (step.stepNumber === 1) onEditMatchSetup();
              else if (step.stepNumber === 3) onOpenConnection();
              else if (step.stepNumber === 4) {
                if (obsConnected) onOpenMapSources();
                else onOpenCamerasTab();
              } else {
                setWorkflowExpanded(true);
              }
            };

            return (
              <button
                key={step.stepNumber}
                type="button"
                onClick={handleStepClick}
                title={step.detail}
                className={`text-left rounded-lg border px-2.5 py-2 transition-colors hover:border-slate-400 ${stateClasses}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold uppercase opacity-75">
                    Step {step.stepNumber}
                  </span>
                  {step.state === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : step.state === 'blocked' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <Circle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        step.state === 'current' ? 'text-[#EA580C]' : 'text-slate-400'
                      }`}
                    />
                  )}
                </div>
                <p className="text-[11px] font-bold truncate mt-0.5">{step.shortTitle}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Expanded Control Room Workflow Workspace (Steps 1-4 quick bar + Step 5 YouTube + Step 6 Activate + Step 7 End / Next) */}
      {workflowExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Steps 1-4 Prep Summary + Scoreboard Overlay / Scorer Quick Access */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-slate-900">
                Steps 1–4 · Match &amp; Studio Readiness
              </h3>
              <button
                type="button"
                onClick={onEditMatchSetup}
                className="min-h-[28px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit Match Setup</span>
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    1–2. Match Initialized ({match.gameName || 'Sport'})
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {match.teamAName || 'Team A'} vs {match.teamBName || 'Team B'} ·{' '}
                    {isPublicLive ? 'Public' : isEnded ? 'Ended' : 'Unpublished Draft'}
                  </p>
                </div>
                {!isBroadcasterRole && (
                  <Link
                    to={`/admin/scoreboard/${match.id}`}
                    className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Scorer</span>
                  </Link>
                )}
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    3–4. OBS Bridge, Scenes &amp; Cameras
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {obsConnected
                      ? `OBS Connected (${profile.obsScenes.length} scenes · ${onlineCameras.length}/${enabledCameras.length} cams online)`
                      : 'Connect Windows Bridge or OBS WebSocket 4455'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenConnection}
                    className="min-h-[30px] px-2.5 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    OBS Setup
                  </button>
                  <button
                    type="button"
                    onClick={obsConnected ? onOpenMapSources : onOpenCamerasTab}
                    className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200 text-[11px] font-semibold text-[#EA580C] hover:bg-orange-100"
                  >
                    <Camera className="w-3 h-3" />
                    <span>{obsConnected ? 'Map Sources' : 'Cameras'}</span>
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">OBS Browser Source Scoreboard URL</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyOverlayUrl}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#EA580C] hover:underline"
                    >
                      {copiedOverlay ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedOverlay ? 'Copied' : 'Copy URL'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onOpenOverlayTab}
                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                    >
                      Customize →
                    </button>
                  </div>
                </div>
                <p className="font-mono text-[10px] text-slate-500 break-all">
                  {scoreboardOverlayUrl}
                </p>
              </div>
            </div>
          </div>

          {/* Center Column: Step 5 — Dedicated YouTube Live Connection */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#EA580C]">
                  Step 5 · YouTube Live Connection
                </p>
                <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">
                  Connect Ongoing Broadcast Output
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPlayerPreview((v) => !v)}
                className="min-h-[30px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 shrink-0"
              >
                {showPlayerPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPlayerPreview ? 'Hide Embed' : 'Preview Embed'}</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              1. Start streaming from OBS Studio to YouTube Live. 2. Paste the YouTube Live URL or
              11-char ID below without restarting OBS.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSaveYouTubeOutput(e, true);
              }}
              className="space-y-2.5"
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeYtProviderDraft('youtube')}
                  className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    ytProviderDraft === 'youtube'
                      ? 'border-[#EA580C] bg-orange-50 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Youtube className="w-3.5 h-3.5 text-red-600" />
                  <span>YouTube Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeYtProviderDraft('mediamtx')}
                  className={`min-h-[36px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    ytProviderDraft === 'mediamtx'
                      ? 'border-[#EA580C] bg-orange-50 text-slate-900'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>MediaMTX Direct</span>
                </button>
              </div>

              {ytProviderDraft === 'youtube' && (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={ytInputDraft}
                    onChange={(e) => onChangeYtInputDraft(e.target.value)}
                    placeholder="https://youtube.com/live/... or 11-char Video ID"
                    className="w-full min-h-[38px] px-3 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#EA580C]"
                  />
                  {ytInputDraft.trim() && parsedDraftYt && (
                    <p
                      className={`text-[11px] font-mono ${
                        parsedDraftYt.valid ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {parsedDraftYt.valid
                        ? `Extracted Video ID: ${parsedDraftYt.videoId}`
                        : parsedDraftYt.error}
                    </p>
                  )}
                </div>
              )}

              {ytVerification && (
                <div
                  className={`p-2 rounded-lg text-[11px] border ${
                    ytVerification.available
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {ytVerification.available
                    ? `Verified: "${ytVerification.title || ytVerification.videoId}"`
                    : ytVerification.message}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={
                    savingYtOutput ||
                    verifyingYtOutput ||
                    (ytProviderDraft === 'youtube' && Boolean(parsedDraftYt && !parsedDraftYt.valid))
                  }
                  className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  <Tv className="w-3.5 h-3.5 text-[#EA580C]" />
                  <span>
                    {savingYtOutput || verifyingYtOutput
                      ? 'Verifying & Saving...'
                      : ytProviderDraft === 'mediamtx'
                        ? 'Save MediaMTX Output'
                        : 'Verify & Connect YouTube'}
                  </span>
                </button>
              </div>
            </form>

            {showPlayerPreview && (
              <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-slate-800 bg-black">
                <LiveStreamPlayer
                  provider={match.activeStreamingProvider}
                  youtubeVideoId={match.youtubeVideoId || ''}
                  title={match.matchTitle}
                />
              </div>
            )}
          </div>

          {/* Right Column: Step 6 (Activate Broadcast) & Step 7 (End / Initialize Next Match) */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Steps 6–7 · Launch &amp; Lifecycle
                </p>
                <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">
                  Activate or Finish Match
                </h3>
              </div>

              {!isEnded && !isPublicLive && (
                <div className="space-y-2">
                  {!outputReady && (
                    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                      Link a valid YouTube Video ID (or switch to MediaMTX) in Step 5 before
                      activating on the Player Portal.
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={activatingBroadcast || !outputReady}
                    onClick={onActivateBroadcast}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#EA580C] text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-45"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>
                      {activatingBroadcast
                        ? 'Activating Broadcast...'
                        : 'Activate MaidanLive Broadcast'}
                    </span>
                  </button>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Publishes stream to Player Portal viewers and pushes Live notification while
                    applying your privacy &amp; scoreboard defaults.
                  </p>
                </div>
              )}

              {isPublicLive && (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-medium flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-red-600" />
                      <span>LIVE on Player Portal</span>
                    </span>
                    <Link
                      to={`/live/${match.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:underline"
                    >
                      <span>Watch</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                  <button
                    type="button"
                    disabled={endingBroadcast}
                    onClick={onRequestEndBroadcast}
                    className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    <span>{endingBroadcast ? 'Ending...' : 'End MaidanLive Broadcast'}</span>
                  </button>
                </div>
              )}

              {!isPublicLive && !isEnded && (
                <button
                  type="button"
                  disabled={endingBroadcast}
                  onClick={onRequestEndBroadcast}
                  className="w-full min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-[11px] font-semibold hover:bg-slate-100"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Close / Discard Draft</span>
                </button>
              )}

              {isEnded && (
                <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-700">
                  Broadcast ended cleanly. Final scores and match history are preserved.
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onOpenNextMatchSetup}
                className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5 text-[#EA580C]" />
                <span>Initialize Next Match</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
