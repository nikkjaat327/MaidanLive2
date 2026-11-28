import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  ImagePlus,
  Layers,
  Maximize2,
  Megaphone,
  Monitor,
  Move,
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
import type { BroadcastOverlayConfig, LiveStreamData, SponsorData } from '../../types/index.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { platformOpsService } from '../../services/platformOps/platformOpsService.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { offlineScoreService } from '../../services/scoreboard/offlineScoreService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import { getPublicWebOrigin } from '../../utils/appOrigin.ts';
import { useObsOverlay } from '../../hooks/useObsOverlay.ts';
import {
  DEFAULT_OBS_BOX,
  DEFAULT_OVERLAY_CONFIG,
  DEFAULT_VIEWER_LANDSCAPE_BOX,
  DEFAULT_VIEWER_PORTRAIT_BOX,
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
  SCOREBOARD_BOX_BOUNDS,
  type ScoreboardGeometryBox,
  clampScoreboardGeometryBox,
  computeOverlayMetrics,
  normalizeOverlayConfig,
} from '../../utils/overlayConfig.ts';
import { computeCricketChaseState, formatCricketOvers, normalizeCricketDetails } from '../../utils/cricketScoring.ts';
import { resolveMatchStatus } from '../../utils/matchStatus.ts';
import {
  resolveMatchTimeoutState,
  resolveTimeoutOverlayDecision,
} from '../../utils/matchTimeout.ts';
import { HotstarBroadcastOverlay } from '../../components/obs/HotstarBroadcastOverlay.tsx';
import { BroadcastBrandLogoBug } from '../../components/obs/ObsBrandMark.tsx';
import { BroadcastSponsorAdBanner } from '../../components/obs/BroadcastSponsorAdBanner.tsx';
import { TimeoutFullscreenSponsorAd } from '../../components/obs/TimeoutFullscreenSponsorAd.tsx';
import { JioHotstarFullScoreboard } from '../../components/obs/JioHotstarFullScoreboard.tsx';
import { FloatingOverlayScorePanel } from '../../components/obs/FloatingOverlayScorePanel.tsx';
import { ScoreboardStyleSelector } from '../../components/obs/ScoreboardStyleSelector.tsx';
import { FullScoreboardStyleSelector } from '../../components/obs/FullScoreboardStyleSelector.tsx';
import { CustomScoreboardDesigner } from '../../components/obs/CustomScoreboardDesigner.tsx';
import { HeaderYouTubePreviewControl } from '../../components/streaming/HeaderYouTubePreviewControl.tsx';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';
import { OBS_THEME_MAP } from '../../components/obs/obsTheme.ts';
import { TeamAvatar } from '../../components/common/TeamAvatar.tsx';
import { FeedbackBanner } from '../../components/common/FeedbackBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import stadiumHeroImg from '../../assets/images/stadium_floodlight_hero_1795011087164.jpg';
import arenaTurfImg from '../../assets/images/arena_turf_empty_1795011087551.jpg';
import {
  clearStickyMatchId,
  resolveStickyOrPreferredMatch,
  setStickyMatchId,
} from '../../utils/activeMatchSelection.ts';
import { useBroadcastEventQueue } from '../../hooks/useBroadcastEventQueue.ts';
import { BroadcastEventAnimationLayer } from '../../components/obs/BroadcastEventAnimationLayer.tsx';
import { EventAnimationStudioPanel } from '../../components/obs/EventAnimationStudioPanel.tsx';
import {
  BROADCAST_EVENT_META,
  BroadcastEventKey,
  EVENT_ANIMATION_BOUNDS,
  EventAnimationConfigMap,
  normalizeEventAnimationsConfig,
} from '../../utils/eventAnimations.ts';

type PreviewBackdrop = 'stadium' | 'turf' | 'checker' | 'custom';
type GeometryBoxTarget = 'obsBox' | 'viewerLandscapeBox' | 'viewerPortraitBox';

function getDefaultBoxForTarget(target: GeometryBoxTarget): ScoreboardGeometryBox {
  if (target === 'viewerLandscapeBox') return DEFAULT_VIEWER_LANDSCAPE_BOX;
  if (target === 'viewerPortraitBox') return DEFAULT_VIEWER_PORTRAIT_BOX;
  return DEFAULT_OBS_BOX;
}

const GEOMETRY_BOX_TABS: Array<{ id: GeometryBoxTarget; label: string; hint: string }> = [
  { id: 'obsBox', label: 'OBS Output', hint: '1920x1080 Browser Source canvas' },
  { id: 'viewerLandscapeBox', label: 'Viewer Landscape', hint: 'Desktop & landscape player' },
  { id: 'viewerPortraitBox', label: 'Viewer Portrait', hint: 'Mobile 9:16 & portrait player' },
];

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
  { key: 'showMatchStatus', label: 'Match Status / Timer' },
];

export function BroadcastOverlayConfigPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [streams, setStreams] = useState<LiveStreamData[]>([]);
  const [sponsors, setSponsors] = useState<SponsorData[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { closeOverlayPreview } = useBroadcastPreview();

  const [backdrop, setBackdrop] = useState<PreviewBackdrop>('stadium');
  const [previewOrientation, setPreviewOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [customBackdropUrl, setCustomBackdropUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Responsive canvas scaling inside preview box (supports Landscape 16:9 & Portrait 9:16)
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [previewWidth, setPreviewWidth] = useState(580);
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
    brandLogoUrl,
    serverClockOffsetMs,
    loading,
    error,
    notFound: overlayNotFound,
    clearError: clearOverlayError,
    connected,
    refetch,
  } = useObsOverlay(matchId);
  const [streamsLoading, setStreamsLoading] = useState(true);

  const location = useLocation();
  const [floatingControlsOpen, setFloatingControlsOpen] = useState(false);
  const [selectedEventKey, setSelectedEventKey] = useState<BroadcastEventKey>('SUPER_RAID');
  const [stagePickActive, setStagePickActive] = useState<boolean>(false);
  const [pinPreview, setPinPreview] = useState<boolean>(true);
  const [eventAnimationsDraft, setEventAnimationsDraft] = useState<EventAnimationConfigMap | null>(
    null
  );
  const [activeBoxTarget, setActiveBoxTarget] = useState<GeometryBoxTarget>('obsBox');
  const [boxDraft, setBoxDraft] = useState<
    Partial<Record<GeometryBoxTarget, ScoreboardGeometryBox>>
  >({});
  const boxDragRef = useRef<{
    target: GeometryBoxTarget;
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
    widthPct: number;
    box: ScoreboardGeometryBox;
  } | null>(null);

  useEffect(() => {
    setEventAnimationsDraft(null);
    setBoxDraft({});
  }, [matchId]);

  useEffect(() => {
    if (stream?.status === 'LIVE') {
      setFloatingControlsOpen(true);
    }
  }, [stream?.id, stream?.status]);

  useEffect(() => {
    const sport = String(score?.sportType || stream?.gameName || '').toLowerCase();
    if (sport.includes('cricket')) setSelectedEventKey('SIX');
    else if (sport.includes('football') || sport.includes('soccer')) setSelectedEventKey('GOAL');
    else if (sport.includes('volley') || sport.includes('badminton')) setSelectedEventKey('SET_WIN');
    else if (sport.includes('kabaddi')) setSelectedEventKey('SUPER_RAID');
  }, [stream?.id, stream?.gameName, score?.sportType]);

  useEffect(() => {
    closeOverlayPreview();
  }, [closeOverlayPreview]);

  useEffect(() => {
    if (matchId && streams.some((s) => s.id === matchId)) {
      setStickyMatchId(matchId);
    }
  }, [matchId, streams]);

  useEffect(() => {
    setStreamsLoading(true);
    liveStreamService
      .listStreams()
      .then((list) => {
        setStreams(list);
        const hasExact = Boolean(matchId && list.some((s) => s.id === matchId));
        if (list.length > 0 && (!matchId || !hasExact)) {
          clearStickyMatchId();
          clearOverlayError();
          const targetId = resolveStickyOrPreferredMatch(undefined, list);
          if (targetId) {
            setStickyMatchId(targetId);
            navigate(`/broadcast/overlay/${targetId}${location.search}`, { replace: true });
          }
        } else if (list.length === 0 && matchId) {
          clearStickyMatchId();
          clearOverlayError();
          navigate(`/broadcast/overlay${location.search}`, { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setStreamsLoading(false));
  }, [matchId, navigate, location.search, clearOverlayError]);

  useEffect(() => {
    if (!overlayNotFound || loading || streamsLoading) return;
    if (streams.length > 0) {
      const hasExact = Boolean(matchId && streams.some((s) => s.id === matchId));
      if (!hasExact) {
        clearStickyMatchId();
        clearOverlayError();
        const targetId = resolveStickyOrPreferredMatch(undefined, streams);
        if (targetId) {
          setStickyMatchId(targetId);
          navigate(`/broadcast/overlay/${targetId}${location.search}`, { replace: true });
        }
      }
    } else if (matchId) {
      clearStickyMatchId();
      clearOverlayError();
      navigate(`/broadcast/overlay${location.search}`, { replace: true });
    }
  }, [
    overlayNotFound,
    loading,
    streamsLoading,
    streams,
    matchId,
    navigate,
    location.search,
    clearOverlayError,
  ]);

  useEffect(() => {
    platformOpsService
      .listSponsors()
      .then((items) => setSponsors(items))
      .catch(() => {
        platformOpsService
          .listPublicSponsors()
          .then((items) => setSponsors(items))
          .catch(() => {});
      });
  }, []);

  useEffect(() => {
    if (loading || streamsLoading || !stream) return;
    const el = previewContainerRef.current;
    if (!el) return;
    const measure = () => {
      const nextW = el.getBoundingClientRect().width;
      if (nextW > 0) {
        setPreviewWidth(nextW);
      }
    };
    measure();
    const rafId = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', measure);
      };
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setPreviewWidth(entry.contentRect.width);
        }
      }
    });
    ro.observe(el);
    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [loading, streamsLoading, stream?.id, previewOrientation]);

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

  const effectiveOverlayConfig = useMemo(() => {
    const hasBoxDraft =
      Boolean(boxDraft.obsBox) ||
      Boolean(boxDraft.viewerLandscapeBox) ||
      Boolean(boxDraft.viewerPortraitBox);
    if (!sliderDraft && !eventAnimationsDraft && !hasBoxDraft) return overlayConfig;
    return normalizeOverlayConfig({
      ...overlayConfig,
      ...(sliderDraft || {}),
      ...(eventAnimationsDraft ? { eventAnimations: eventAnimationsDraft } : {}),
      ...(boxDraft.obsBox ? { obsBox: boxDraft.obsBox } : {}),
      ...(boxDraft.viewerLandscapeBox
        ? { viewerLandscapeBox: boxDraft.viewerLandscapeBox }
        : {}),
      ...(boxDraft.viewerPortraitBox
        ? { viewerPortraitBox: boxDraft.viewerPortraitBox }
        : {}),
    });
  }, [overlayConfig, sliderDraft, eventAnimationsDraft, boxDraft]);

  const activeBoxDraft = useMemo(
    () =>
      clampScoreboardGeometryBox(
        boxDraft[activeBoxTarget] || effectiveOverlayConfig[activeBoxTarget],
        getDefaultBoxForTarget(activeBoxTarget)
      ),
    [activeBoxTarget, boxDraft, effectiveOverlayConfig]
  );

  const updateActiveBoxDraft = (patch: Partial<ScoreboardGeometryBox>) => {
    const next = clampScoreboardGeometryBox(
      { ...activeBoxDraft, ...patch },
      getDefaultBoxForTarget(activeBoxTarget)
    );
    setBoxDraft((prev) => ({ ...prev, [activeBoxTarget]: next }));
  };

  useEffect(() => {
    const handlePointerMove = (ev: PointerEvent) => {
      const drag = boxDragRef.current;
      const container = previewContainerRef.current;
      if (!drag || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dxPct = ((ev.clientX - drag.startClientX) / rect.width) * 100;
      const dyPct = ((ev.clientY - drag.startClientY) / rect.height) * 100;
      const next = clampScoreboardGeometryBox(
        {
          ...drag.box,
          xPct: drag.startXPct + dxPct,
          yPct: drag.startYPct + dyPct,
        },
        getDefaultBoxForTarget(drag.target)
      );
      setBoxDraft((prev) => ({ ...prev, [drag.target]: next }));
    };
    const handlePointerUp = () => {
      boxDragRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, []);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const timeoutInfo = useMemo(
    () => resolveMatchTimeoutState(stream, score, nowMs + serverClockOffsetMs),
    [stream, score, nowMs, serverClockOffsetMs]
  );
  const timeoutDecision = useMemo(
    () => resolveTimeoutOverlayDecision(effectiveOverlayConfig, timeoutInfo),
    [effectiveOverlayConfig, timeoutInfo]
  );

  useEffect(() => {
    if (!timeoutInfo.isTimeout) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [timeoutInfo.isTimeout]);

  const pendingSliderPatchRef = useRef<Partial<BroadcastOverlayConfig>>({});

  const {
    activeItem: activeEventItem,
    isExiting: isEventExiting,
    triggerLocalPreview,
  } = useBroadcastEventQueue({
    matchId,
    overlayConfig: effectiveOverlayConfig,
  });

  async function persistOverlayPatch(
    partial: Partial<BroadcastOverlayConfig>,
    customNotice?: string
  ) {
    if (!matchId) return;
    const prev = overlayConfig;
    const apiPatch: Partial<BroadcastOverlayConfig> = { ...partial };
    if (partial.mode === 'hidden') apiPatch.visible = false;
    else if (partial.mode && partial.visible === undefined) apiPatch.visible = true;
    if (partial.visible === true && (partial.mode ?? effectiveOverlayConfig.mode) === 'hidden') {
      apiPatch.mode = 'full';
    }
    if (partial.customScoreboardDesign) {
      apiPatch.customScoreboardDesign = {
        ...effectiveOverlayConfig.customScoreboardDesign,
        ...partial.customScoreboardDesign,
      };
    }
    if (partial.eventAnimations) {
      apiPatch.eventAnimations = normalizeEventAnimationsConfig({
        ...effectiveOverlayConfig.eventAnimations,
        ...partial.eventAnimations,
      });
    }
    if (partial.obsBox) {
      apiPatch.obsBox = clampScoreboardGeometryBox(
        { ...effectiveOverlayConfig.obsBox, ...partial.obsBox },
        DEFAULT_OBS_BOX
      );
    }
    if (partial.viewerLandscapeBox) {
      apiPatch.viewerLandscapeBox = clampScoreboardGeometryBox(
        { ...effectiveOverlayConfig.viewerLandscapeBox, ...partial.viewerLandscapeBox },
        DEFAULT_VIEWER_LANDSCAPE_BOX
      );
    }
    if (partial.viewerPortraitBox) {
      apiPatch.viewerPortraitBox = clampScoreboardGeometryBox(
        { ...effectiveOverlayConfig.viewerPortraitBox, ...partial.viewerPortraitBox },
        DEFAULT_VIEWER_PORTRAIT_BOX
      );
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
        const synced = normalizeOverlayConfig(res.overlayConfig);
        setOverlayConfig(synced);
      }
      if (partial.eventAnimations) {
        setEventAnimationsDraft(null);
      }
      if (partial.obsBox || partial.viewerLandscapeBox || partial.viewerPortraitBox) {
        setBoxDraft((prevDraft) => {
          const updated = { ...prevDraft };
          if (partial.obsBox) delete updated.obsBox;
          if (partial.viewerLandscapeBox) delete updated.viewerLandscapeBox;
          if (partial.viewerPortraitBox) delete updated.viewerPortraitBox;
          return updated;
        });
      }
      setSaveNotice(customNotice || 'Synced to live OBS sources');
      window.setTimeout(() => setSaveNotice(null), 2400);
    } catch (err) {
      setOverlayConfig(prev);
      setActionError(extractApiError(err, 'Failed to save overlay configuration.'));
    } finally {
      setSaving(false);
    }
  }

  function handleToggleOneClickSponsorAd() {
    const currentlyVisible = Boolean(effectiveOverlayConfig.sponsorAdVisible);
    if (currentlyVisible) {
      void persistOverlayPatch({ sponsorAdVisible: false });
      return;
    }
    const matchedSponsor =
      sponsors.find((s) => s.id === effectiveOverlayConfig.sponsorAdId) ||
      sponsors.find((s) => s.isActive !== false) ||
      sponsors[0] ||
      null;
    const adName =
      (effectiveOverlayConfig.sponsorAdName || '').trim() ||
      matchedSponsor?.name ||
      'Official Broadcast Partner';
    const adTagline =
      (effectiveOverlayConfig.sponsorAdTagline || '').trim() ||
      matchedSponsor?.tagline ||
      matchedSponsor?.sponsorshipType ||
      'Live Match Sponsor';
    const adLogoUrl =
      (effectiveOverlayConfig.sponsorAdLogoUrl || '').trim() || matchedSponsor?.logoUrl || '';
    const adCta =
      (effectiveOverlayConfig.sponsorAdCta || '').trim() ||
      matchedSponsor?.ctaText ||
      'SPONSORED';
    void persistOverlayPatch({
      sponsorAdVisible: true,
      sponsorAdId: effectiveOverlayConfig.sponsorAdId || matchedSponsor?.id || '',
      sponsorAdName: adName,
      sponsorAdTagline: adTagline,
      sponsorAdLogoUrl: adLogoUrl,
      sponsorAdCta: adCta,
      sponsorAdPosition: effectiveOverlayConfig.sponsorAdPosition || 'top-right',
    });
  }

  async function handleTriggerTeamTimeout(side: 'A' | 'B' | 'END') {
    if (!matchId || !stream) return;
    const activeSport = score?.sportType || stream.gameName || 'Other';
    setSaving(true);
    setActionError(null);
    try {
      if (activeSport === 'Kabaddi') {
        const res = await scoreboardService.controlKabaddiClock(
          stream.id,
          side === 'END' ? { type: 'END_TIMEOUT' } : { type: 'START_TIMEOUT', team: side }
        );
        if (res?.score) setScore(res.score);
      } else {
        const nextStatus =
          side === 'END'
            ? 'LIVE'
            : `${side === 'A' ? stream.teamAName || 'TEAM A' : stream.teamBName || 'TEAM B'} TIMEOUT`;
        const res = await offlineScoreService.submitScorePatch(
          stream.id,
          {
            matchStatus: nextStatus,
            action: side === 'END' ? 'Resumed Live' : `Timeout (${side})`,
            allowLockedOverride: true,
          },
          score
        );
        if (res?.score) setScore(res.score);
      }
      setSaveNotice(side === 'END' ? 'Timeout ended — resumed live' : 'Team Timeout started');
      window.setTimeout(() => setSaveNotice(null), 2200);
      refetch();
    } catch (err) {
      setActionError(extractApiError(err, 'Failed to update timeout state.'));
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

  const origin = getPublicWebOrigin();
  const primaryObsPath = matchId ? `/broadcast/overlay/view/${matchId}` : '';
  const primaryObsUrl = `${origin}${primaryObsPath}`;
  const compactObsUrl = `${primaryObsUrl}?mode=compact`;
  const isPreviewPortrait = previewOrientation === 'portrait';
  const stageCanvasW = isPreviewPortrait ? 1080 : 1920;
  const stageCanvasH = isPreviewPortrait ? 1920 : 1080;
  const previewScale = Math.max(0.15, previewWidth / stageCanvasW);
  const previewOverlayConfig = useMemo<BroadcastOverlayConfig>(() => {
    const targetPreviewBox =
      activeBoxTarget === 'obsBox'
        ? effectiveOverlayConfig.obsBox
        : activeBoxTarget === 'viewerLandscapeBox'
          ? effectiveOverlayConfig.viewerLandscapeBox
          : effectiveOverlayConfig.viewerPortraitBox;
    return {
      ...effectiveOverlayConfig,
      obsBox: targetPreviewBox,
      visible: true,
      mode:
        effectiveOverlayConfig.mode === 'hidden'
          ? 'full'
          : effectiveOverlayConfig.mode || 'full',
    };
  }, [effectiveOverlayConfig, activeBoxTarget]);
  const previewMetrics = useMemo(
    () => computeOverlayMetrics(previewOverlayConfig, isPreviewPortrait),
    [previewOverlayConfig, isPreviewPortrait]
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

  function handleStageClickPick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!stagePickActive || !previewContainerRef.current) return;
    const rect = previewContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const rawX = ((e.clientX - rect.left) / rect.width) * 100;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100;
    const xPct = Math.round(
      Math.min(EVENT_ANIMATION_BOUNDS.xPct.max, Math.max(EVENT_ANIMATION_BOUNDS.xPct.min, rawX))
    );
    const yPct = Math.round(
      Math.min(EVENT_ANIMATION_BOUNDS.yPct.max, Math.max(EVENT_ANIMATION_BOUNDS.yPct.min, rawY))
    );
    const currentMap = normalizeEventAnimationsConfig(effectiveOverlayConfig.eventAnimations);
    const targetRule = currentMap[selectedEventKey];
    const nextMap: EventAnimationConfigMap = {
      ...currentMap,
      [selectedEventKey]: {
        ...targetRule,
        positionPreset: 'custom',
        xPct,
        yPct,
      },
    };
    setEventAnimationsDraft(nextMap);
    setStagePickActive(false);
    const meta = BROADCAST_EVENT_META[selectedEventKey];
    triggerLocalPreview(
      {
        streamId: matchId || '',
        eventId: `pick-${selectedEventKey}-${Date.now()}`,
        eventKey: selectedEventKey,
        sportType: meta.sport,
        teamSide: 'A',
        teamName: stream?.teamAName || 'HOME SQUAD',
        teamColor: effectiveOverlayConfig.teamAColor,
        subtitle: (targetRule.customSubtitle || '').trim() || meta.defaultSubtitle,
        pointsLabel: (targetRule.customBadgeText || '').trim() || meta.badge,
        triggeredAtIso: new Date().toISOString(),
        manualOverride: true,
        previewStyleId: targetRule.styleId,
      },
      true,
      { sticky: pinPreview, replayEntry: false }
    );
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 rounded-xl overflow-x-clip">
      {/* Top Broadcast Studio Header (non-sticky so OBS Stage Preview sticks cleanly at top: 10px) */}
      <header className="relative z-30 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-md">
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
            <HeaderYouTubePreviewControl tone="dark" compact />

            {streams.length > 0 && (
              <select
                value={matchId && streams.some((s) => s.id === matchId) ? matchId : ''}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setStickyMatchId(e.target.value);
                  navigate(`/broadcast/overlay/${e.target.value}${location.search}`);
                }}
                aria-label="Switch broadcast match"
                className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-slate-900 text-slate-100 border border-slate-700 rounded-lg max-w-[240px]"
              >
                {(!matchId || !streams.some((s) => s.id === matchId)) && (
                  <option value="">Select broadcast match...</option>
                )}
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
                      <span>Scoreboard Show in OBS/YouTube</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Scoreboard Hidden in OBS/YouTube</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <FeedbackBanner
          type="error"
          message={
            actionError ||
            (overlayNotFound && (streamsLoading || streams.length === 0 || !streams.some((s) => s.id === matchId))
              ? null
              : error)
          }
          onDismiss={() => {
            setActionError(null);
            clearOverlayError();
          }}
        />
        <FeedbackBanner type="success" message={saveNotice} onDismiss={() => setSaveNotice(null)} />

        {loading || streamsLoading ? (
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN (6/12): STICKY LIVE 16:9 / 9:16 OBS STAGE PREVIEW (sticks at top while scrolling customization) */}
              <div className="lg:col-span-6">
                {/* SECTION B: LIVE 16:9 OVERLAY PREVIEW */}
                <div className="lg:sticky lg:top-3 z-20 space-y-4">
                <section className="rounded-xl border border-slate-800 bg-slate-900/95 overflow-hidden shadow-2xl">
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
                  {(!overlayConfig.visible || overlayConfig.mode === 'hidden') && (
                    <div className="px-4 py-1.5 bg-slate-800/80 border-b border-slate-700/70 text-[11px] font-medium text-slate-300">
                      OBS/YouTube output is currently hidden — live stage preview continues showing the scoreboard for styling.
                    </div>
                  )}
                  <div className={isPreviewPortrait ? 'py-4 bg-slate-950/90 flex justify-center' : ''}>
                    <div
                      ref={previewContainerRef}
                      onClick={handleStageClickPick}
                      className={`relative overflow-hidden ${
                        stagePickActive ? 'cursor-crosshair ring-2 ring-cyan-400/80' : ''
                      } ${
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
                        <BroadcastBrandLogoBug
                          config={previewOverlayConfig}
                          serverLogoUrl={brandLogoUrl}
                          variant="canvas"
                          zIndex={24}
                        />
                        <BroadcastSponsorAdBanner
                          config={previewOverlayConfig}
                          variant="canvas"
                          zIndex={26}
                          suppress={timeoutDecision.isAnyTakeoverActive}
                        />
                        {!timeoutDecision.isAnyTakeoverActive && (
                          <HotstarBroadcastOverlay
                            stream={stream}
                            score={score}
                            config={previewOverlayConfig}
                            isPortrait={isPreviewPortrait}
                            serverClockOffsetMs={serverClockOffsetMs}
                          />
                        )}
                        <JioHotstarFullScoreboard
                          stream={stream}
                          score={score}
                          config={previewOverlayConfig}
                          timeoutInfo={timeoutInfo}
                          isPortrait={isPreviewPortrait}
                          variant="canvas"
                          serverClockOffsetMs={serverClockOffsetMs}
                          zIndex={31}
                          visible={timeoutDecision.showFullScoreboard}
                        />
                        <TimeoutFullscreenSponsorAd
                          stream={stream}
                          score={score}
                          config={previewOverlayConfig}
                          timeoutInfo={timeoutInfo}
                          variant="canvas"
                          isPortrait={isPreviewPortrait}
                          zIndex={32}
                          visible={timeoutDecision.showFullscreenSponsorAd}
                        />
                        <BroadcastEventAnimationLayer
                          activeItem={activeEventItem}
                          isExiting={isEventExiting}
                          overlayConfig={previewOverlayConfig}
                          variant="canvas"
                          isPortrait={isPreviewPortrait}
                          zIndex={42}
                          stagePositionGuide={{
                            eventKey: selectedEventKey,
                            rule: normalizeEventAnimationsConfig(
                              previewOverlayConfig.eventAnimations
                            )[selectedEventKey],
                            active: stagePickActive,
                          }}
                        />
                      </div>

                      {/* Interactive Drag Handle for Active Geometry Box */}
                      {activeBoxDraft.enabled && !stagePickActive && (
                        <div
                          style={{
                            left: `${activeBoxDraft.xPct}%`,
                            top: `${activeBoxDraft.yPct}%`,
                            width: `${activeBoxDraft.widthPct}%`,
                          }}
                          className="absolute z-40 pointer-events-none border-2 border-dashed border-cyan-400/90 rounded-lg bg-cyan-400/5"
                        >
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              boxDragRef.current = {
                                target: activeBoxTarget,
                                startClientX: e.clientX,
                                startClientY: e.clientY,
                                startXPct: activeBoxDraft.xPct,
                                startYPct: activeBoxDraft.yPct,
                                widthPct: activeBoxDraft.widthPct,
                                box: activeBoxDraft,
                              };
                            }}
                            title="Drag to move scoreboard box"
                            className="pointer-events-auto -top-6 left-1 absolute inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow cursor-grab active:cursor-grabbing"
                          >
                            <Move className="w-3 h-3" />
                            <span>
                              Drag {GEOMETRY_BOX_TABS.find((t) => t.id === activeBoxTarget)?.label}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {floatingControlsOpen && (
                  <FloatingOverlayScorePanel
                    stream={stream}
                    score={score}
                    overlayPosition={overlayConfig.position}
                    overlayConfig={overlayConfig}
                    onOverlayConfigChange={setOverlayConfig}
                    onScoreChange={setScore}
                    onRefresh={refetch}
                    onClose={() => setFloatingControlsOpen(false)}
                    positioning="fixed"
                  />
                )}
                </div>
              </div>

              {/* RIGHT COLUMN (6/12): OVERLAY CUSTOMIZATION + PRO EVENT ANIMATIONS STUDIO */}
              <div className="lg:col-span-6 space-y-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-5">
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

                {/* Scoreboard Style (25 Layouts + Custom Designer) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Scoreboard Style (25 Layouts + Custom Designer)
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

                {/* Brand Logo Position/Size & Custom Scoreboard Builder */}
                <CustomScoreboardDesigner
                  config={effectiveOverlayConfig}
                  serverLogoUrl={brandLogoUrl}
                  disabled={saving}
                  darkSurface
                  onChange={(patch) => void persistOverlayPatch(patch)}
                />

                {/* Live Sponsor Advertisement (1-Button Toggle across OBS + MaidanLive) */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          Live Sponsor Advertisement
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          1-click live sponsor banner on OBS Browser Source &amp; player
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleToggleOneClickSponsorAd}
                      className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-extrabold uppercase tracking-wider border transition-colors shrink-0 ${
                        effectiveOverlayConfig.sponsorAdVisible
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                          : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      <Megaphone className="w-3.5 h-3.5" />
                      <span>
                        {effectiveOverlayConfig.sponsorAdVisible ? 'Sponsor Ad ON' : 'Show Sponsor Ad'}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
                    <span className="font-mono truncate">
                      Staged: <strong className="text-amber-300">{effectiveOverlayConfig.sponsorAdName || 'Default Sponsor'}</strong>
                      {' · '}
                      {effectiveOverlayConfig.sponsorAdPosition || 'top-right'}
                      {' · '}
                      {effectiveOverlayConfig.sponsorAdDurationSeconds}s
                    </span>
                    <Link
                      to={matchId ? `/admin/broadcast-studio/${matchId}?tab=ads` : '/admin/sponsors'}
                      className="font-bold text-[#FB923C] hover:underline whitespace-nowrap"
                    >
                      Configure Ads &amp; Timing in Sponsor Studio →
                    </Link>
                  </div>
                </div>

                {/* Timeout & Full-Screen JioHotstar Scoreboard Controls */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-indigo-500/35 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Maximize2 className="w-4 h-4 text-sky-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          Timeout Ad &amp; JioHotstar Full Scoreboard
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          Auto full-screen sponsor ad on timeout, or trigger full scoreboard anytime
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void persistOverlayPatch({
                          fullScoreboardVisible: !effectiveOverlayConfig.fullScoreboardVisible,
                          ...(effectiveOverlayConfig.fullScoreboardVisible
                            ? {}
                            : { timeoutFullscreenSponsorAdActive: false }),
                        })
                      }
                      className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider border transition-colors ${
                        effectiveOverlayConfig.fullScoreboardVisible
                          ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-400 shadow-lg shadow-sky-500/25'
                          : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border-sky-500/40'
                      }`}
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>
                        {effectiveOverlayConfig.fullScoreboardVisible
                          ? 'Full Scoreboard ON'
                          : 'Show Full Scoreboard'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void persistOverlayPatch({
                          timeoutFullscreenSponsorAdActive:
                            !effectiveOverlayConfig.timeoutFullscreenSponsorAdActive,
                          ...(effectiveOverlayConfig.timeoutFullscreenSponsorAdActive
                            ? {}
                            : { fullScoreboardVisible: false }),
                        })
                      }
                      className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider border transition-colors ${
                        effectiveOverlayConfig.timeoutFullscreenSponsorAdActive
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25'
                          : 'bg-slate-900 hover:bg-slate-800 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>
                        {effectiveOverlayConfig.timeoutFullscreenSponsorAdActive
                          ? 'Fullscreen Ad ON'
                          : 'Show Fullscreen Ad'}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300">
                    <span className="font-mono truncate">
                      On Timeout: <strong className="text-sky-300">{effectiveOverlayConfig.timeoutDisplayMode || 'fullscreen_ad'}</strong>
                      {' · '}
                      {(effectiveOverlayConfig.timeoutAdLayout || 'fullscreen_card').replace('_', ' ')} ({effectiveOverlayConfig.timeoutAdPosition || 'center'})
                    </span>
                    <Link
                      to={matchId ? `/admin/broadcast-studio/${matchId}?tab=ads` : '/admin/sponsors'}
                      className="font-bold text-orange-300 hover:underline whitespace-nowrap"
                    >
                      Configure Timeout Ad Layout →
                    </Link>
                  </div>

                  {/* 20 Full Scoreboard Designs */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-sky-300">
                        Full Scoreboard Designs (20 Sport Layouts)
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">
                        {effectiveOverlayConfig.fullScoreboardStyle}
                      </span>
                    </div>
                    <FullScoreboardStyleSelector
                      value={effectiveOverlayConfig.fullScoreboardStyle}
                      matchSport={sport}
                      disabled={saving}
                      darkSurface
                      compact
                      onChange={(fullScoreboardStyle) =>
                        void persistOverlayPatch({ fullScoreboardStyle })
                      }
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleTriggerTeamTimeout('A')}
                      className="flex-1 min-h-[32px] px-2.5 py-1 rounded-lg bg-orange-600/20 hover:bg-orange-600/35 border border-orange-500/40 text-orange-200 text-[11px] font-bold inline-flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{stream.teamAName || 'Team A'} Timeout</span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleTriggerTeamTimeout('B')}
                      className="flex-1 min-h-[32px] px-2.5 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600/35 border border-sky-500/40 text-sky-200 text-[11px] font-bold inline-flex items-center justify-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{stream.teamBName || 'Team B'} Timeout</span>
                    </button>
                    {timeoutInfo.isTimeout && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleTriggerTeamTimeout('END')}
                        className="min-h-[32px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                      >
                        Resume Live
                      </button>
                    )}
                  </div>
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

                {/* Scoreboard Geometry & Position (OBS vs Viewer) */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Scoreboard Geometry &amp; Position (OBS vs Viewer)
                      </label>
                    </div>
                    {boxDraft[activeBoxTarget] && (
                      <span className="text-[10px] font-mono text-amber-300">
                        Unsaved draft
                      </span>
                    )}
                  </div>

                  {/* 3 Independent Target Tabs */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {GEOMETRY_BOX_TABS.map((tab) => {
                      const active = activeBoxTarget === tab.id;
                      const tabCfg = effectiveOverlayConfig[tab.id];
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setActiveBoxTarget(tab.id);
                            if (tab.id === 'viewerPortraitBox') {
                              setPreviewOrientation('portrait');
                            } else if (tab.id === 'viewerLandscapeBox') {
                              setPreviewOrientation('landscape');
                            }
                          }}
                          className={`min-h-[40px] px-2 py-1.5 rounded-lg border text-left transition-colors ${
                            active
                              ? 'bg-cyan-500/15 border-cyan-400 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-bold truncate">{tab.label}</span>
                            {tabCfg?.enabled && (
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400 block truncate">
                            {tab.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                    <label className="flex items-center justify-between gap-2 text-xs text-slate-100 cursor-pointer">
                      <span>
                        <strong className="block">Enable Custom Box</strong>
                        <span className="text-[10px] text-slate-400">
                          Overrides preset margins for{' '}
                          {GEOMETRY_BOX_TABS.find((t) => t.id === activeBoxTarget)?.label} only.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={activeBoxDraft.enabled}
                        onChange={(e) => updateActiveBoxDraft({ enabled: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-600 text-cyan-500 shrink-0"
                      />
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(
                        [
                          {
                            key: 'xPct',
                            label: 'X %',
                            bounds: SCOREBOARD_BOX_BOUNDS.xPct,
                            unit: '%',
                          },
                          {
                            key: 'yPct',
                            label: 'Y %',
                            bounds: SCOREBOARD_BOX_BOUNDS.yPct,
                            unit: '%',
                          },
                          {
                            key: 'widthPct',
                            label: 'Width %',
                            bounds: SCOREBOARD_BOX_BOUNDS.widthPct,
                            unit: '%',
                          },
                          {
                            key: 'heightPx',
                            label: 'Height px (0 = Auto)',
                            bounds: SCOREBOARD_BOX_BOUNDS.heightPx,
                            unit: 'px',
                          },
                          {
                            key: 'scale',
                            label: 'Scale',
                            bounds: SCOREBOARD_BOX_BOUNDS.scale,
                            unit: 'x',
                          },
                        ] as const
                      ).map((field) => {
                        const val = activeBoxDraft[field.key];
                        return (
                          <div
                            key={field.key}
                            className={`p-2 rounded border border-slate-800/90 bg-slate-900/70 space-y-1.5 ${
                              field.key === 'scale' ? 'sm:col-span-2' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-slate-200">
                                {field.label}
                              </span>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={field.bounds.min}
                                  max={field.bounds.max}
                                  step={field.bounds.step}
                                  value={val}
                                  onChange={(e) =>
                                    updateActiveBoxDraft({
                                      [field.key]: Number(e.target.value),
                                    })
                                  }
                                  aria-label={`${activeBoxTarget} ${field.label} number`}
                                  className="w-16 px-1.5 py-0.5 text-right font-mono text-[11px] bg-slate-950 border border-slate-700 rounded text-cyan-300"
                                />
                                <span className="text-[10px] font-mono text-slate-400">
                                  {field.unit}
                                </span>
                              </div>
                            </div>
                            <input
                              type="range"
                              min={field.bounds.min}
                              max={field.bounds.max}
                              step={field.bounds.step}
                              value={val}
                              onChange={(e) =>
                                updateActiveBoxDraft({
                                  [field.key]: Number(e.target.value),
                                })
                              }
                              aria-label={`${activeBoxTarget} ${field.label}`}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          const def = getDefaultBoxForTarget(activeBoxTarget);
                          setBoxDraft((prevDraft) => {
                            const updated = { ...prevDraft };
                            delete updated[activeBoxTarget];
                            return updated;
                          });
                          void persistOverlayPatch(
                            { [activeBoxTarget]: def },
                            `Reset ${
                              GEOMETRY_BOX_TABS.find((t) => t.id === activeBoxTarget)?.label
                            } geometry box to default`
                          );
                        }}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Target Default</span>
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          persistOverlayPatch(
                            { [activeBoxTarget]: activeBoxDraft },
                            `Saved ${
                              GEOMETRY_BOX_TABS.find((t) => t.id === activeBoxTarget)?.label
                            } box geometry`
                          )
                        }
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Box Settings</span>
                      </button>
                    </div>
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

              <EventAnimationStudioPanel
                streamId={stream.id}
                sportType={sport}
                teamAName={stream.teamAName}
                teamBName={stream.teamBName}
                teamColorOverride={effectiveOverlayConfig.teamAColor}
                eventAnimations={normalizeEventAnimationsConfig(
                  effectiveOverlayConfig.eventAnimations
                )}
                hasUnsavedChanges={eventAnimationsDraft !== null}
                saving={saving}
                selectedEventKey={selectedEventKey}
                onSelectEventKey={setSelectedEventKey}
                stagePickActive={stagePickActive}
                onToggleStagePick={setStagePickActive}
                pinPreview={pinPreview}
                onTogglePinPreview={setPinPreview}
                onLocalConfigChange={(nextMap) => {
                  setEventAnimationsDraft(normalizeEventAnimationsConfig(nextMap));
                }}
                onDiscardUnsaved={() => {
                  setEventAnimationsDraft(null);
                  setSaveNotice('Discarded unsaved event animation edits.');
                  window.setTimeout(() => setSaveNotice(null), 2200);
                }}
                onSaveEventAnimations={async (nextMap, notice) => {
                  await persistOverlayPatch({ eventAnimations: nextMap }, notice);
                }}
                onPreviewOnStage={(payload, nextMap, options) => {
                  if (nextMap) {
                    setEventAnimationsDraft(normalizeEventAnimationsConfig(nextMap));
                  }
                  triggerLocalPreview(payload, true, {
                    sticky: options?.sticky ?? pinPreview,
                    replayEntry: options?.replayEntry ?? true,
                    durationMsOverride: options?.durationMsOverride,
                  });
                }}
                onTriggerLiveBroadcast={async (payload) => {
                  setActionError(null);
                  try {
                    await liveStreamService.triggerEventAnimation(stream.id, payload);
                    setSaveNotice(
                      `Triggered live "${BROADCAST_EVENT_META[payload.eventKey].label}" animation on OBS & viewer players!`
                    );
                    window.setTimeout(() => setSaveNotice(null), 2600);
                  } catch (err) {
                    setActionError(
                      extractApiError(err, 'Failed to trigger live event animation.')
                    );
                  }
                }}
              />
              </div>
            </div>

            {/* SECTION D & E BELOW STICKY STAGE WORKSPACE SO PREVIEW STAYS PINNED THROUGHOUT CUSTOMIZATION */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
          </>
        )}
      </main>
    </div>
  );
}
