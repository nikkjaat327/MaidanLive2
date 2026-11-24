import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  ImagePlus,
  Layers,
  Monitor,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tv,
  Video,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { BroadcastOverlayConfig, LiveStreamData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { useObsOverlay } from '../../hooks/useObsOverlay.ts';
import {
  DEFAULT_OVERLAY_CONFIG,
  OVERLAY_MODES,
  OVERLAY_POSITIONS,
  OVERLAY_SCALES,
  OVERLAY_SLIDER_BOUNDS,
  OVERLAY_THEMES,
  OverlayMode,
  OverlayPosition,
  OverlayScale,
  OverlayTheme,
  PRESET_SCALE_MULTIPLIERS,
  computeOverlayMetrics,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { computeCricketChaseState, formatCricketOvers, normalizeCricketDetails } from '../../utils/cricketScoring.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import { HotstarBroadcastOverlay } from '../../components/obs/HotstarBroadcastOverlay.tsx';
import { FloatingOverlayScorePanel } from '../../components/obs/FloatingOverlayScorePanel.tsx';
import { ScoreboardStyleSelector } from '../../components/obs/ScoreboardStyleSelector.tsx';
import { OBS_THEME_MAP } from '../../components/obs/obsTheme.ts';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import stadiumHeroImg from '../../assets/images/stadium_floodlight_hero_1795011087164.jpg';
import arenaTurfImg from '../../assets/images/arena_turf_empty_1795011087551.jpg';

type PreviewBackdrop = 'stadium' | 'turf' | 'checker' | 'custom';

const MODE_LABELS: Record<OverlayMode, string> = {
  full: 'Full Broadcast',
  compact: 'Compact Bar',
  score_only: 'Score Only',
  hidden: 'Hide Overlay',
};

const POSITION_LABELS: Record<OverlayPosition, string> = {
  'top-left': 'Top Left',
  'top-center': 'Top Center',
  'top-right': 'Top Right',
  'bottom-left': 'Bottom Left',
  'bottom-center': 'Bottom Center',
  'bottom-right': 'Bottom Right',
};

const SCALE_LABELS: Record<OverlayScale, string> = {
  small: `Small (${Math.round(PRESET_SCALE_MULTIPLIERS.small * 100)}%)`,
  medium: `Medium (${Math.round(PRESET_SCALE_MULTIPLIERS.medium * 100)}%)`,
  large: `Large (${Math.round(PRESET_SCALE_MULTIPLIERS.large * 100)}%)`,
};

type SliderFieldKey = keyof typeof OVERLAY_SLIDER_BOUNDS;

const SLIDER_FIELDS: Array<{
  key: SliderFieldKey;
  label: string;
  hint: string;
}> = [
  { key: 'customScale', label: 'Overall Bar Size', hint: 'Master multiplier on top of preset' },
  { key: 'textScale', label: 'Global Text Size', hint: 'Scales all names, stats & labels' },
  { key: 'scoreScale', label: 'Score Numbers', hint: 'Main runs/wickets or goals pill size' },
  { key: 'logoScale', label: 'Team Logos & Crest', hint: 'Team badges & MaidanLive shield' },
  { key: 'teamNameScale', label: 'Team Names', hint: 'Short & full team titles' },
  { key: 'metaScale', label: 'Stats & Sub-Strip Text', hint: 'CRR, batters, bowler & live pills' },
];

const TOGGLE_FIELDS: Array<{
  key: keyof Pick<
    BroadcastOverlayConfig,
    | 'showTournamentName'
    | 'showTeamLogos'
    | 'showRunRate'
    | 'showRequiredRunRate'
    | 'showTarget'
    | 'showRunsRequired'
    | 'showBallsRemaining'
    | 'showBatters'
    | 'showBowler'
    | 'showRecentOver'
    | 'showLiveIndicator'
    | 'showMatchStatus'
  >;
  label: string;
}> = [
  { key: 'showTournamentName', label: 'Tournament Name' },
  { key: 'showTeamLogos', label: 'Team Logos' },
  { key: 'showRunRate', label: 'Current Run Rate' },
  { key: 'showRequiredRunRate', label: 'Required Run Rate' },
  { key: 'showTarget', label: 'Target' },
  { key: 'showRunsRequired', label: 'Runs Required' },
  { key: 'showBallsRemaining', label: 'Balls Remaining' },
  { key: 'showBatters', label: 'Batters' },
  { key: 'showBowler', label: 'Bowler' },
  { key: 'showRecentOver', label: 'Recent Over' },
  { key: 'showLiveIndicator', label: 'Live Indicator' },
  { key: 'showMatchStatus', label: 'Match Status' },
];

export function BroadcastOverlayConfigPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('stadium');
  const [previewOrientation, setPreviewOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [customBackdropUrl, setCustomBackdropUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Responsive canvas scaling inside preview box (supports Landscape 16:9 & Portrait 9:16)
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(960);
  const sliderDebounceRef = useRef<number | null>(null);
  const sliderClearDraftRef = useRef<number | null>(null);
  const lastSliderEditAtRef = useRef<number>(0);
  const [sliderDraft, setSliderDraft] = useState<Partial<BroadcastOverlayConfig> | null>(null);

  const {
    stream,
    setStream,
    score,
    setScore,
    overlayConfig,
    setOverlayConfig,
    loading,
    error,
    connected,
    refetch,
  } = useObsOverlay(matchId);

  const [floatingControlsOpen, setFloatingControlsOpen] = useState(false);

  useEffect(() => {
    if (stream?.status === 'LIVE') {
      setFloatingControlsOpen(true);
    }
  }, [stream?.id, stream?.status]);

  useEffect(() => {
    liveStreamService
      .listStreams()
      .then((list) => {
        setStreams(list);
        if (!matchId && list.length > 0) {
          const liveFirst = list.find((s) => s.status === 'LIVE') || list[0];
          navigate(`/broadcast/overlay/${liveFirst.id}`, { replace: true });
        }
      })
      .catch(() => {});
  }, [matchId, navigate]);

  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const initialW = el.getBoundingClientRect().width;
    if (initialW > 0) {
      setPreviewWidth(initialW);
    }
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setPreviewWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stream?.id, previewOrientation]);

  useEffect(() => {
    return () => {
      if (sliderDebounceRef.current !== null) {
        window.clearTimeout(sliderDebounceRef.current);
      }
      if (sliderClearDraftRef.current !== null) {
        window.clearTimeout(sliderClearDraftRef.current);
      }
    };
  }, []);

  // Clean up object URL if uploaded
  useEffect(() => {
    return () => {
      if (customBackdropUrl && customBackdropUrl.startsWith('blob:')) {
        URL.revokeObjectURL(customBackdropUrl);
      }
    };
  }, [customBackdropUrl]);

  const effectiveOverlayConfig = useMemo(
    () => (sliderDraft ? normalizeOverlayConfig({ ...overlayConfig, ...sliderDraft }) : overlayConfig),
    [overlayConfig, sliderDraft]
  );

  const pendingSliderPatchRef = useRef<Partial<BroadcastOverlayConfig>>({});

  async function persistOverlayPatch(partial: Partial<BroadcastOverlayConfig>) {
    if (!matchId) return;
    const prev = overlayConfig;
    const apiPatch: Partial<BroadcastOverlayConfig> = { ...partial };
    if (partial.mode === 'hidden') apiPatch.visible = false;
    else if (partial.mode && partial.visible === undefined) apiPatch.visible = true;
    if (partial.visible === true && (partial.mode ?? effectiveOverlayConfig.mode) === 'hidden') {
      apiPatch.mode = 'full';
    }

    const next = normalizeOverlayConfig({ ...effectiveOverlayConfig, ...apiPatch });
    pendingSliderPatchRef.current = {};
    setSliderDraft(null);
    setOverlayConfig(next);
    setSaving(true);
    setActionError(null);
    try {
      const res = await liveStreamService.updateOverlayConfig(matchId, apiPatch);
      if (Date.now() - lastSliderEditAtRef.current >= 400) {
        setOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
      }
      setSaveNotice('Synced to live OBS sources');
      window.setTimeout(() => setSaveNotice(null), 2000);
    } catch (err) {
      setOverlayConfig(prev);
      setActionError(extractApiError(err, 'Failed to save overlay configuration.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleScoreboardOnYoutube(nextVal: boolean) {
    if (!matchId || !stream) return;
    const prevVal = stream.showScoreboardOnYoutube !== false;
    setStream((prev) => (prev ? { ...prev, showScoreboardOnYoutube: nextVal } : prev));
    setSaving(true);
    setActionError(null);
    try {
      const updated = await liveStreamService.updateStream(matchId, {
        showScoreboardOnYoutube: nextVal,
      });
      setStream((prev) =>
        prev ? { ...prev, showScoreboardOnYoutube: updated.showScoreboardOnYoutube } : updated
      );
      setSaveNotice(
        nextVal
          ? 'Scoreboard enabled on YouTube (OBS Overlay) + MaidanLive'
          : 'YouTube clean feed: scoreboard active on MaidanLive embedded video only'
      );
      window.setTimeout(() => setSaveNotice(null), 2600);
    } catch (err) {
      setStream((prev) => (prev ? { ...prev, showScoreboardOnYoutube: prevVal } : prev));
      setActionError(extractApiError(err, 'Failed to update Scoreboard on YouTube setting.'));
    } finally {
      setSaving(false);
    }
  }

  function handleSliderChange(key: SliderFieldKey, val: number) {
    if (!matchId) return;
    lastSliderEditAtRef.current = Date.now();
    const nextDraft = { ...(sliderDraft || {}), [key]: val };
    pendingSliderPatchRef.current = { ...pendingSliderPatchRef.current, [key]: val };
    setSliderDraft(nextDraft);
    const next = normalizeOverlayConfig({ ...overlayConfig, ...nextDraft });
    setOverlayConfig(next);

    if (sliderDebounceRef.current !== null) {
      window.clearTimeout(sliderDebounceRef.current);
    }
    if (sliderClearDraftRef.current !== null) {
      window.clearTimeout(sliderClearDraftRef.current);
    }

    sliderDebounceRef.current = window.setTimeout(async () => {
      sliderDebounceRef.current = null;
      const patchToSend = { ...pendingSliderPatchRef.current };
      pendingSliderPatchRef.current = {};
      if (Object.keys(patchToSend).length === 0) return;
      setSaving(true);
      setActionError(null);
      try {
        const res = await liveStreamService.updateOverlayConfig(matchId, patchToSend);
        if (Date.now() - lastSliderEditAtRef.current >= 350) {
          setOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
        }
        setSaveNotice('Synced slider sizes to live OBS');
        window.setTimeout(() => setSaveNotice(null), 1800);
      } catch (err) {
        setActionError(extractApiError(err, 'Failed to sync slider scale.'));
      } finally {
        setSaving(false);
        sliderClearDraftRef.current = window.setTimeout(() => {
          if (Date.now() - lastSliderEditAtRef.current >= 350) {
            setSliderDraft(null);
          }
        }, 400);
      }
    }, 160);
  }

  function handleResetSliders() {
    lastSliderEditAtRef.current = 0;
    if (sliderDebounceRef.current !== null) {
      window.clearTimeout(sliderDebounceRef.current);
      sliderDebounceRef.current = null;
    }
    if (sliderClearDraftRef.current !== null) {
      window.clearTimeout(sliderClearDraftRef.current);
      sliderClearDraftRef.current = null;
    }
    setSliderDraft(null);
    void persistOverlayPatch({
      customScale: 1,
      textScale: 1,
      scoreScale: 1,
      logoScale: 1,
      teamNameScale: 1,
      metaScale: 1,
    });
  }

  function handleUploadFrame(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customBackdropUrl && customBackdropUrl.startsWith('blob:')) {
      URL.revokeObjectURL(customBackdropUrl);
    }
    const url = URL.createObjectURL(file);
    setCustomBackdropUrl(url);
    setBackdrop('custom');
  }

  function copyUrl(key: string, value: string) {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const primaryObsPath = matchId ? `/broadcast/overlay/view/${matchId}` : '';
  const primaryObsUrl = `${origin}${primaryObsPath}`;
  const compactObsUrl = `${primaryObsUrl}?mode=compact`;
  const isPreviewPortrait = previewOrientation === 'portrait';
  const stageCanvasW = isPreviewPortrait ? 1080 : 1920;
  const stageCanvasH = isPreviewPortrait ? 1920 : 1080;
  const previewScale = Math.max(0.15, previewWidth / stageCanvasW);
  const previewMetrics = useMemo(
    () => computeOverlayMetrics(effectiveOverlayConfig, isPreviewPortrait),
    [effectiveOverlayConfig, isPreviewPortrait]
  );

  // Match summary helpers
  const sport = score?.sportType || stream?.gameName || 'Other';
  const stdStatus = stream ? resolveMatchStatus(stream, score) : 'UPCOMING';
  const scoreSummary = useMemo(() => {
    if (!score) return '0 - 0';
    if (sport === 'Cricket') {
      const d = normalizeCricketDetails(score.sportSpecificDetails as any);
      const chase = computeCricketChaseState(
        d,
        stream?.teamAName || 'Team A',
        stream?.teamBName || 'Team B'
      );
      const aText = `${d.teamARuns}/${d.teamAWickets} (${formatCricketOvers(d.teamABalls)})`;
      const bText = `${d.teamBRuns}/${d.teamBWickets} (${formatCricketOvers(d.teamBBalls)})`;
      return `${aText} vs ${bText}${chase.isSecondInnings && chase.target > 0 ? ` · Target ${chase.target}` : ''}`;
    }
    return `${score.teamAScore} - ${score.teamBScore}`;
  }, [score, sport, stream?.teamAName, stream?.teamBName]);

  const activeProvider =
    stream?.activeStreamingProvider || stream?.streamingProvider || 'youtube';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Broadcast Studio Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <Link
              to={matchId ? `/admin/scoreboard/${matchId}` : '/admin/scoreboard'}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Scoreboard</span>
            </Link>
            <Link
              to="/admin/live-streams"
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Radio className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Streams</span>
            </Link>
            <Link
              to={matchId ? `/admin/broadcast-studio/${matchId}` : '/admin/broadcast-studio'}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Video className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Multi-Cam OBS</span>
            </Link>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#EA580C] shrink-0" />
                <h1 className="font-display text-base sm:text-lg font-extrabold tracking-tight text-white truncate">
                  OBS BROADCAST OVERLAY STUDIO
                </h1>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Real-time Socket.IO television graphic controller for OBS Studio Browser Source
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {streams.length > 0 && (
              <select
                value={matchId || ''}
                onChange={(e) => navigate(`/broadcast/overlay/${e.target.value}`)}
                aria-label="Switch broadcast match"
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-slate-900 text-slate-100 border border-slate-700 rounded-lg max-w-[240px]"
              >
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.status}] {s.matchTitle || `${s.teamAName || 'Team A'} vs ${s.teamBName || 'Team B'}`}
                  </option>
                ))}
              </select>
            )}

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold border whitespace-nowrap ${
                connected
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              }`}
            >
              {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{connected ? 'Socket Live' : 'Reconnecting'}</span>
            </span>

            {stream && (
              <>
                <select
                  value={overlayConfig.visible ? overlayConfig.mode : 'hidden'}
                  disabled={saving}
                  onChange={(e) => {
                    const nextMode = e.target.value as OverlayMode;
                    persistOverlayPatch({
                      mode: nextMode,
                      visible: nextMode !== 'hidden',
                    });
                  }}
                  aria-label="Overlay visibility mode"
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-slate-900 text-slate-100 border border-slate-700 rounded-lg"
                >
                  {OVERLAY_MODES.map((m) => (
                    <option key={m} value={m}>
                      Mode: {MODE_LABELS[m]}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    persistOverlayPatch({
                      visible: !overlayConfig.visible,
                      mode:
                        !overlayConfig.visible && overlayConfig.mode === 'hidden'
                          ? 'full'
                          : overlayConfig.mode,
                    })
                  }
                  className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    overlayConfig.visible && overlayConfig.mode !== 'hidden'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                  }`}
                >
                  {overlayConfig.visible && overlayConfig.mode !== 'hidden' ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>SCOREBOARD ON</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>SCOREBOARD OFF</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <FeedbackBanner type="error" message={actionError || error} onDismiss={() => setActionError(null)} />
        {saveNotice && (
          <div className="px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {loading ? (
          <div className="p-10 rounded-xl border border-slate-800 bg-slate-900/70 text-sm text-slate-400">
            Loading OBS Broadcast Overlay Studio...
          </div>
        ) : !stream ? (
          <EmptyState
            icon={<Tv className="w-6 h-6" />}
            title="Match broadcast not found"
            description="Select an active or scheduled match stream to configure its OBS Broadcast Scoreboard Overlay."
            action={
              <Link
                to="/admin/live-streams"
                className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600"
              >
                <Radio className="w-4 h-4" />
                <span>Manage Live Streams</span>
              </Link>
            }
          />
        ) : (
          <>
            {/* SECTION A: MATCH INFORMATION */}
            <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex items-center -space-x-2 shrink-0">
                    <TeamAvatar
                      name={stream.teamAName || 'Team A'}
                      logoUrl={stream.teamALogo}
                      size="md"
                    />
                    <TeamAvatar
                      name={stream.teamBName || 'Team B'}
                      logoUrl={stream.teamBLogo}
                      size="md"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <span className="text-[#EA580C]">{sport}</span>
                      {stream.tournamentName && (
                        <>
                          <span>·</span>
                          <span className="truncate">{stream.tournamentName}</span>
                        </>
                      )}
                      <span>·</span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono ${
                          stream.status === 'LIVE'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {stream.status} ({stdStatus})
                      </span>
                    </div>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-white truncate mt-0.5">
                      {stream.matchTitle ||
                        `${stream.teamAName || 'Team A'} vs ${stream.teamBName || 'Team B'}`}
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t lg:border-t-0 lg:border-l border-slate-800 pt-3 lg:pt-0 lg:pl-6 shrink-0">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Live Score
                    </p>
                    <p className="font-mono tabular-nums text-sm font-bold text-white mt-0.5">
                      {scoreSummary}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Video Feed
                    </p>
                    <p className="font-mono text-xs font-semibold text-slate-200 uppercase mt-0.5">
                      {activeProvider}
                    </p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Match ID
                    </p>
                    <p className="font-mono text-xs text-slate-300 truncate mt-0.5 max-w-[180px]">
                      {stream.id}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN (7/12): 16:9 PREVIEW + QUICK LIVE CONTROLS BELOW MONITOR + OBS URL + OBS GUIDE */}
              <div className="xl:col-span-7 space-y-5">
                {/* SECTION B: LIVE 16:9 OVERLAY PREVIEW */}
                <div className="relative">
                <section className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-[#EA580C]" />
                      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                        {isPreviewPortrait
                          ? 'Live 9:16 Portrait Stage Preview (1080 x 1920)'
                          : 'Live 16:9 OBS Stage Preview (1920 x 1080)'}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5 mr-1">
                        <button
                          type="button"
                          onClick={() => setPreviewOrientation('landscape')}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            !isPreviewPortrait
                              ? 'bg-[#EA580C] text-white'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          <Monitor className="w-3 h-3" />
                          <span>16:9</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewOrientation('portrait')}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            isPreviewPortrait
                              ? 'bg-[#EA580C] text-white'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          <Smartphone className="w-3 h-3" />
                          <span>9:16</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setFloatingControlsOpen((prev) => !prev)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                          floatingControlsOpen
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        <span>{floatingControlsOpen ? 'Score Panel On' : 'Quick Score'}</span>
                      </button>
                      {(
                        [
                          { id: 'stadium', label: 'Stadium Feed' },
                          { id: 'turf', label: 'Turf Cam' },
                          { id: 'checker', label: 'Transparent' },
                        ] as const
                      ).map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() => setBackdrop(bg.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                            backdrop === bg.id
                              ? 'bg-[#EA580C] text-white border-[#EA580C]'
                              : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {bg.label}
                        </button>
                      ))}

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUploadFrame}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                          backdrop === 'custom'
                            ? 'bg-[#EA580C] text-white border-[#EA580C]'
                            : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                        <ImagePlus className="w-3 h-3" />
                        <span>Upload Frame</span>
                      </button>
                    </div>
                  </div>

                  {/* Simulated 16:9 Landscape or 9:16 Portrait Stage Container */}
                  {stream.showScoreboardOnYoutube === false && (
                    <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-[11px] font-medium text-amber-200">
                      <strong>Scoreboard on YouTube is UNCHECKED:</strong> Live OBS Browser Source stays blank so YouTube video stays clean; viewers see the scoreboard only inside MaidanLive&apos;s embedded video player.
                    </div>
                  )}
                  <div className={isPreviewPortrait ? 'py-4 bg-slate-950/90 flex justify-center' : ''}>
                    <div
                      ref={previewContainerRef}
                      className={`relative overflow-hidden ${
                        isPreviewPortrait
                          ? 'w-full max-w-[320px] aspect-[9/16] rounded-lg border border-slate-700'
                          : 'w-full aspect-video'
                      } ${backdrop === 'checker' ? 'obs-checkerboard' : 'bg-slate-950'}`}
                    >
                      {backdrop === 'stadium' && (
                        <img
                          src={stadiumHeroImg}
                          alt="Simulated stadium broadcast camera"
                          className="absolute inset-0 w-full h-full object-cover brightness-75"
                        />
                      )}
                      {backdrop === 'turf' && (
                        <img
                          src={arenaTurfImg}
                          alt="Simulated sports turf broadcast camera"
                          className="absolute inset-0 w-full h-full object-cover brightness-75"
                        />
                      )}
                      {backdrop === 'custom' && customBackdropUrl && (
                        <img
                          src={customBackdropUrl}
                          alt="Uploaded broadcast frame preview"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}

                      {/* Exact Scaled Reference Canvas (1920x1080 or 1080x1920) */}
                      <div
                        style={{
                          width: stageCanvasW,
                          height: stageCanvasH,
                          transform: `scale(${previewScale})`,
                          transformOrigin: 'top left',
                        }}
                        className="absolute top-0 left-0 pointer-events-none"
                      >
                        <HotstarBroadcastOverlay
                          stream={stream}
                          score={score}
                          config={effectiveOverlayConfig}
                          isPortrait={isPreviewPortrait}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {floatingControlsOpen && (
                  <FloatingOverlayScorePanel
                    stream={stream}
                    score={score}
                    overlayPosition={overlayConfig.position}
                    onScoreChange={setScore}
                    onRefresh={refetch}
                    onClose={() => setFloatingControlsOpen(false)}
                    positioning="absolute"
                  />
                )}
                </div>

                {/* SECTION D: OBS BROADCAST URL GENERATOR */}
                <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#EA580C]" />
                      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                        OBS Browser Source URLs
                      </h2>
                    </div>
                    <a
                      href={`${primaryObsPath}?controls=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] rounded-lg hover:bg-orange-600 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Overlay Preview in New Tab</span>
                    </a>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Primary OBS Overlay URL (Synced Live Settings)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={primaryObsUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-h-[40px] px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => copyUrl('primary', primaryObsUrl)}
                          className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg whitespace-nowrap shrink-0"
                        >
                          {copiedKey === 'primary' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy URL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        Compact Corner URL (Optional Override)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={compactObsUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-h-[38px] px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => copyUrl('compact', compactObsUrl)}
                          className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg whitespace-nowrap shrink-0"
                        >
                          {copiedKey === 'compact' ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* SECTION E: HOW TO ADD THIS SCOREBOARD TO OBS */}
                <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-[#EA580C]" />
                      <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                        HOW TO ADD THIS SCOREBOARD TO OBS
                      </h2>
                    </div>
                    <a
                      href="https://obsproject.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-orange-400 hover:text-orange-300 inline-flex items-center gap-1"
                    >
                      <span>obsproject.com</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
                    <li>
                      Open <strong className="text-white">OBS Studio</strong> (available at{' '}
                      <span className="font-mono text-orange-300">obsproject.com</span>) and select
                      your live match scene.
                    </li>
                    <li>
                      In the <strong className="text-white">Sources</strong> dock, click{' '}
                      <strong className="text-white">+</strong> and choose{' '}
                      <strong className="text-white">Browser</strong>.
                    </li>
                    <li>
                      Paste the <strong className="text-white">Primary OBS Overlay URL</strong> above
                      into the URL field.
                    </li>
                    <li>
                      Set <strong className="text-white">Width: 1920</strong> and{' '}
                      <strong className="text-white">Height: 1080</strong> (matches standard 16:9
                      canvas; background outside the score bar stays 100% transparent).
                    </li>
                    <li>
                      Keep this Browser Source <strong className="text-white">above</strong> your
                      camera/video feed. Score changes, chases, and show/hide toggles sync live via
                      Socket.IO without refreshing OBS.
                    </li>
                  </ol>
                </section>
              </div>

              {/* RIGHT COLUMN (5/12): OVERLAY CUSTOMIZATION CONTROLS */}
              <div className="xl:col-span-5 rounded-xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-[#EA580C]" />
                    <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
                      Overlay Customization
                    </h2>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => persistOverlayPatch(DEFAULT_OVERLAY_CONFIG)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-300 bg-slate-950 border border-slate-700 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Defaults</span>
                  </button>
                </div>

                {/* Scoreboard Destination (YouTube + Website vs Website Embedded Only) */}
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 cursor-pointer hover:border-slate-700">
                  <input
                    type="checkbox"
                    checked={stream.showScoreboardOnYoutube !== false}
                    disabled={saving || stream.status === 'ENDED'}
                    onChange={(e) => handleToggleScoreboardOnYoutube(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-600 text-[#EA580C] shrink-0"
                  />
                  <span className="leading-snug">
                    <strong className="text-white block">
                      Scoreboard on YouTube (OBS Broadcast Overlay)
                    </strong>
                    <span className="text-[11px] text-slate-400">
                      {stream.showScoreboardOnYoutube !== false
                        ? 'Checked: Shown on YouTube Live (via OBS Browser Source) & MaidanLive.'
                        : 'Unchecked: Hidden on YouTube Live — shown only inside MaidanLive embedded video.'}
                    </span>
                  </span>
                </label>

                {/* Scoreboard Style (10 Layouts) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Scoreboard Style (10 Distinct Layouts)
                    </label>
                    <span className="text-[10px] font-mono text-purple-300">
                      {overlayConfig.style || 'broadcast_classic'}
                    </span>
                  </div>
                  <ScoreboardStyleSelector
                    value={overlayConfig.style || 'broadcast_classic'}
                    disabled={saving}
                    darkSurface
                    onChange={(style) => persistOverlayPatch({ style })}
                  />
                </div>

                {/* Display Mode */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Display Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {OVERLAY_MODES.map((mode) => {
                      const active =
                        (overlayConfig.visible ? overlayConfig.mode : 'hidden') === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            persistOverlayPatch({
                              mode,
                              visible: mode !== 'hidden',
                            })
                          }
                          className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-[#EA580C] text-white border-[#EA580C]'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {MODE_LABELS[mode]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 6-Position Grid */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Screen Position (1920x1080 Safe Margin)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERLAY_POSITIONS.map((pos) => {
                      const active = overlayConfig.position === pos;
                      return (
                        <button
                          key={pos}
                          type="button"
                          disabled={saving}
                          onClick={() => persistOverlayPatch({ position: pos })}
                          className={`min-h-[38px] px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-[#EA580C] text-white border-[#EA580C]'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {POSITION_LABELS[pos]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Scale Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Graphic Scale Preset
                    </label>
                    <span className="text-[10px] font-mono text-slate-400">
                      Width {previewMetrics.barWidthPct}% · Scale {Math.round(previewMetrics.overallScale * 100)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERLAY_SCALES.map((sc) => {
                      const active = overlayConfig.scale === sc;
                      return (
                        <button
                          key={sc}
                          type="button"
                          disabled={saving}
                          onClick={() => persistOverlayPatch({ scale: sc })}
                          className={`min-h-[38px] px-2 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                            active
                              ? 'bg-[#EA580C] text-white border-[#EA580C]'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          {SCALE_LABELS[sc]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Granular Scrollable Size & Element Sliders */}
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#EA580C]" />
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Size &amp; Element Sliders
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleResetSliders}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-300 bg-slate-950 border border-slate-700 rounded hover:bg-slate-800"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset Sliders</span>
                    </button>
                  </div>

                  <div className="max-h-[340px] overflow-y-auto pr-1.5 space-y-3">
                    {SLIDER_FIELDS.map((field) => {
                      const bounds = OVERLAY_SLIDER_BOUNDS[field.key];
                      const currentVal = effectiveOverlayConfig[field.key];
                      const pct = Math.round(currentVal * 100);
                      return (
                        <div
                          key={field.key}
                          className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/90 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-slate-100 block truncate">
                                {field.label}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {field.hint}
                              </span>
                            </div>
                            <span className="font-mono text-xs font-bold text-[#FB923C] bg-[#EA580C]/15 border border-[#EA580C]/30 px-2 py-0.5 rounded shrink-0">
                              {pct}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={bounds.min}
                            max={bounds.max}
                            step={bounds.step}
                            value={currentVal}
                            aria-label={field.label}
                            onChange={(e) => handleSliderChange(field.key, Number(e.target.value))}
                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#EA580C]"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Theme Presets */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Broadcast Color Theme
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {OVERLAY_THEMES.map((themeKey: OverlayTheme) => {
                      const t = OBS_THEME_MAP[themeKey];
                      const active = overlayConfig.theme === themeKey;
                      return (
                        <button
                          key={themeKey}
                          type="button"
                          disabled={saving}
                          onClick={() => persistOverlayPatch({ theme: themeKey })}
                          className={`min-h-[42px] px-3 py-2 rounded-lg border flex items-center gap-2.5 text-left text-xs font-semibold transition-colors ${
                            active
                              ? 'border-[#EA580C] bg-[#EA580C]/15 text-white'
                              : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span
                            style={{ background: t.brandBg }}
                            className="w-4 h-4 rounded shrink-0 border border-white/25"
                          />
                          <span className="truncate">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Team Accent Color Pickers */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 truncate">
                      {stream.teamAName || 'Team A'} Accent
                    </label>
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
                      <input
                        type="color"
                        value={overlayConfig.teamAColor}
                        onChange={(e) => persistOverlayPatch({ teamAColor: e.target.value })}
                        className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer shrink-0"
                      />
                      <span className="font-mono text-xs text-slate-200">
                        {overlayConfig.teamAColor}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 truncate">
                      {stream.teamBName || 'Team B'} Accent
                    </label>
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
                      <input
                        type="color"
                        value={overlayConfig.teamBColor}
                        onChange={(e) => persistOverlayPatch({ teamBColor: e.target.value })}
                        className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer shrink-0"
                      />
                      <span className="font-mono text-xs text-slate-200">
                        {overlayConfig.teamBColor}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Granular Element Toggles */}
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#EA580C]" />
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Overlay Elements
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {TOGGLE_FIELDS.map((item) => {
                      const checked = overlayConfig[item.key];
                      return (
                        <label
                          key={item.key}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800/90 text-xs text-slate-200 cursor-pointer hover:border-slate-700"
                        >
                          <span className="font-medium truncate">{item.label}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving}
                            onChange={(e) =>
                              persistOverlayPatch({ [item.key]: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-slate-600 text-[#EA580C] shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
