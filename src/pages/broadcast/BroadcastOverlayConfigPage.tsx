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
  Sparkles,
  Tv,
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
  OVERLAY_THEMES,
  OverlayMode,
  OverlayPosition,
  OverlayScale,
  OverlayTheme,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { computeCricketChaseState, formatCricketOvers, normalizeCricketDetails } from '../../utils/cricketScoring.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import { HotstarBroadcastOverlay } from '../../components/obs/HotstarBroadcastOverlay.tsx';
import { FloatingOverlayScorePanel } from '../../components/obs/FloatingOverlayScorePanel.tsx';
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
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

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
  const [customBackdropUrl, setCustomBackdropUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Responsive 16:9 canvas scaling inside preview box
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(960);

  const {
    stream,
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
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setPreviewWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [stream]);

  // Clean up object URL if uploaded
  useEffect(() => {
    return () => {
      if (customBackdropUrl && customBackdropUrl.startsWith('blob:')) {
        URL.revokeObjectURL(customBackdropUrl);
      }
    };
  }, [customBackdropUrl]);

  async function persistOverlayPatch(partial: Partial<BroadcastOverlayConfig>) {
    if (!matchId) return;
    const prev = overlayConfig;
    const next = normalizeOverlayConfig({ ...prev, ...partial });
    if (partial.mode === 'hidden') next.visible = false;
    else if (partial.mode && partial.visible === undefined) next.visible = true;
    if (partial.visible === true && next.mode === 'hidden') next.mode = 'full';

    setOverlayConfig(next);
    setSaving(true);
    setActionError(null);
    try {
      const res = await liveStreamService.updateOverlayConfig(matchId, next);
      setOverlayConfig(normalizeOverlayConfig(res.overlayConfig));
      setSaveNotice('Synced to live OBS sources');
      window.setTimeout(() => setSaveNotice(null), 2000);
    } catch (err) {
      setOverlayConfig(prev);
      setActionError(extractApiError(err, 'Failed to save overlay configuration.'));
    } finally {
      setSaving(false);
    }
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
  const previewScale = Math.max(0.2, previewWidth / 1920);

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
                        Live 16:9 OBS Stage Preview (1920 x 1080)
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
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

                  {/* 16:9 Simulated Video Container */}
                  <div
                    ref={previewContainerRef}
                    className={`relative w-full aspect-video overflow-hidden ${
                      backdrop === 'checker' ? 'obs-checkerboard' : 'bg-slate-950'
                    }`}
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

                    {/* Exact 1920x1080 Scaled Reference Canvas */}
                    <div
                      style={{
                        width: 1920,
                        height: 1080,
                        transform: `scale(${previewScale})`,
                        transformOrigin: 'top left',
                      }}
                      className="absolute top-0 left-0 pointer-events-none"
                    >
                      <HotstarBroadcastOverlay
                        stream={stream}
                        score={score}
                        config={overlayConfig}
                      />
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
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Graphic Scale
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {OVERLAY_SCALES.map((sc) => {
                      const active = overlayConfig.scale === sc;
                      return (
                        <button
                          key={sc}
                          type="button"
                          disabled={saving}
                          onClick={() => persistOverlayPatch({ scale: sc })}
                          className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
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
