import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  Check,
  Clock,
  ExternalLink,
  GripHorizontal,
  LocateFixed,
  Lock,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Tv,
  Undo2,
  X,
} from 'lucide-react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../../types/index.ts';
import type { SportOption } from '../../constants/sports.ts';
import { normalizeOverlayConfig, type OverlayPosition } from '../../utils/overlayConfig.ts';
import { liveStreamService } from '../../services/liveStream/liveStreamService.ts';
import { offlineScoreService } from '../../services/scoreboard/offlineScoreService.ts';
import { scoreboardService } from '../../services/scoreboard/scoreboardService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import {
  CricketDetails,
  computeCricketChaseState,
  formatCricketOvers,
  isCricketScoringLocked,
  normalizeCricketDetails,
} from '../../utils/cricketScoring.ts';
import {
  VolleyballDetails,
  isVolleyballScoringLocked,
  normalizeVolleyballDetails,
} from '../../utils/volleyballScoring.ts';
import { deriveShortTeamName } from '../../utils/matchResultValidation.ts';
import { STANDARD_MATCH_STATUSES } from '../../utils/matchStatus.ts';
import { resolveMatchTimeoutState } from '../../utils/matchTimeout.ts';

export type FloatingDockCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
type ResizeDirection = 'e' | 's' | 'w' | 'se' | 'sw';

interface PanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const GEOMETRY_STORAGE_KEY = 'maidanlive_quick_score_panel_geometry';
const EDGE_MARGIN = 12;
const MIN_PANEL_WIDTH = 290;
const MIN_PANEL_HEIGHT = 250;
const DEFAULT_PANEL_WIDTH = 392;
const DEFAULT_PANEL_HEIGHT = 510;

interface FloatingOverlayScorePanelProps {
  stream: LiveStreamData;
  score: LiveScoreData | null;
  overlayPosition?: OverlayPosition;
  overlayConfig?: BroadcastOverlayConfig;
  onOverlayConfigChange?: (config: BroadcastOverlayConfig) => void;
  onScoreChange: (score: LiveScoreData) => void;
  onRefresh?: () => void;
  onClose?: () => void;
  positioning?: 'fixed' | 'absolute';
  defaultTab?: 'manual' | 'events';
}

function clampPanelGeometry(g: PanelGeometry): PanelGeometry {
  if (typeof window === 'undefined') return g;
  const maxW = Math.max(MIN_PANEL_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
  const maxH = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - EDGE_MARGIN * 2);
  const width = Math.round(Math.min(maxW, Math.max(Math.min(MIN_PANEL_WIDTH, maxW), g.width)));
  const height = Math.round(Math.min(maxH, Math.max(Math.min(MIN_PANEL_HEIGHT, maxH), g.height)));
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
  return {
    x: Math.round(Math.min(maxX, Math.max(EDGE_MARGIN, g.x))),
    y: Math.round(Math.min(maxY, Math.max(EDGE_MARGIN, g.y))),
    width,
    height,
  };
}

function getDefaultPanelGeometry(overlayPosition?: OverlayPosition): PanelGeometry {
  if (typeof window === 'undefined') {
    return { x: 24, y: 24, width: DEFAULT_PANEL_WIDTH, height: DEFAULT_PANEL_HEIGHT };
  }
  const width = Math.min(DEFAULT_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, window.innerWidth - EDGE_MARGIN * 2));
  const height = Math.min(DEFAULT_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, window.innerHeight - EDGE_MARGIN * 2));
  const dockLeft = overlayPosition === 'bottom-right';
  const rawX = dockLeft ? EDGE_MARGIN : window.innerWidth - width - EDGE_MARGIN;
  const rawY = window.innerHeight - height - EDGE_MARGIN;
  return clampPanelGeometry({ x: rawX, y: rawY, width, height });
}

function loadSavedPanelGeometry(overlayPosition?: OverlayPosition): {
  geometry: PanelGeometry;
  isCustom: boolean;
} {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(GEOMETRY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PanelGeometry>;
        if (
          typeof parsed.x === 'number' &&
          typeof parsed.y === 'number' &&
          typeof parsed.width === 'number' &&
          typeof parsed.height === 'number'
        ) {
          return {
            geometry: clampPanelGeometry(parsed as PanelGeometry),
            isCustom: true,
          };
        }
      }
    } catch {
      // Ignore storage errors
    }
  }
  return { geometry: getDefaultPanelGeometry(overlayPosition), isCustom: false };
}

function savePanelGeometry(g: PanelGeometry) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GEOMETRY_STORAGE_KEY, JSON.stringify(g));
  } catch {
    // Ignore storage errors
  }
}

function clearSavedPanelGeometry() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(GEOMETRY_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function makeClientEventId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function FloatingOverlayScorePanel({
  stream,
  score,
  overlayPosition,
  overlayConfig,
  onOverlayConfigChange,
  onScoreChange,
  onRefresh,
  onClose,
  positioning = 'fixed',
  defaultTab = 'manual',
}: FloatingOverlayScorePanelProps) {
  const [activeTab, setActiveTab] = useState<'manual' | 'events'>(defaultTab);
  const initialSaved = useMemo(() => loadSavedPanelGeometry(overlayPosition), [overlayPosition]);
  const [geometry, setGeometry] = useState<PanelGeometry>(initialSaved.geometry);
  const [hasCustomGeometry, setHasCustomGeometry] = useState<boolean>(initialSaved.isCustom);
  const [isInteracting, setIsInteracting] = useState(false);
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  const interactionRef = useRef<{
    mode: 'none' | 'drag' | 'resize';
    dir: ResizeDirection;
    pointerId: number;
    startX: number;
    startY: number;
    orig: PanelGeometry;
  }>({
    mode: 'none',
    dir: 'se',
    pointerId: -1,
    startX: 0,
    startY: 0,
    orig: initialSaved.geometry,
  });

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const sport: SportOption = score?.sportType || (stream.gameName as SportOption) || 'Other';
  const nameA = stream.teamAName || 'Team A';
  const nameB = stream.teamBName || 'Team B';
  const shortA = deriveShortTeamName(nameA, 'TMA');
  const shortB = deriveShortTeamName(nameB, 'TMB');

  const cricketDetails = useMemo(
    () =>
      normalizeCricketDetails(
        (score?.sportSpecificDetails || {}) as Partial<CricketDetails>
      ),
    [score?.sportSpecificDetails]
  );

  const cricketLock = useMemo(() => isCricketScoringLocked(cricketDetails), [cricketDetails]);
  const volleyballLock = useMemo(
    () =>
      sport === 'Volleyball'
        ? isVolleyballScoringLocked(score?.sportSpecificDetails, score?.resultStatus)
        : { locked: false, reason: '' },
    [sport, score?.sportSpecificDetails, score?.resultStatus]
  );
  const cricketChase = useMemo(
    () => computeCricketChaseState(cricketDetails, nameA, nameB),
    [cricketDetails, nameA, nameB]
  );
  const timeoutInfo = useMemo(() => resolveMatchTimeoutState(stream, score), [stream, score]);
  const normalizedOverlay = useMemo(
    () => (overlayConfig ? normalizeOverlayConfig(overlayConfig) : null),
    [overlayConfig]
  );

  // Manual draft state synced with live score
  const [manualTeamAScore, setManualTeamAScore] = useState<number>(score?.teamAScore ?? 0);
  const [manualTeamBScore, setManualTeamBScore] = useState<number>(score?.teamBScore ?? 0);
  const [cricketSide, setCricketSide] = useState<'A' | 'B'>(cricketDetails.battingTeam || 'A');
  const [manualRuns, setManualRuns] = useState<number>(
    cricketDetails.battingTeam === 'B' ? cricketDetails.teamBRuns : cricketDetails.teamARuns
  );
  const [manualWickets, setManualWickets] = useState<number>(
    cricketDetails.battingTeam === 'B' ? cricketDetails.teamBWickets : cricketDetails.teamAWickets
  );
  const [manualBalls, setManualBalls] = useState<number>(
    cricketDetails.battingTeam === 'B' ? cricketDetails.teamBBalls : cricketDetails.teamABalls
  );
  const [manualTarget, setManualTarget] = useState<number>(cricketDetails.target || 0);

  useEffect(() => {
    setManualTeamAScore(score?.teamAScore ?? 0);
    setManualTeamBScore(score?.teamBScore ?? 0);
  }, [score?.teamAScore, score?.teamBScore]);

  useEffect(() => {
    const active = cricketDetails.battingTeam || 'A';
    setCricketSide(active);
    setManualRuns(active === 'B' ? cricketDetails.teamBRuns : cricketDetails.teamARuns);
    setManualWickets(active === 'B' ? cricketDetails.teamBWickets : cricketDetails.teamAWickets);
    setManualBalls(active === 'B' ? cricketDetails.teamBBalls : cricketDetails.teamABalls);
    setManualTarget(cricketDetails.target || 0);
  }, [cricketDetails]);

  function handleSelectCricketSide(side: 'A' | 'B') {
    setCricketSide(side);
    setManualRuns(side === 'B' ? cricketDetails.teamBRuns : cricketDetails.teamARuns);
    setManualWickets(side === 'B' ? cricketDetails.teamBWickets : cricketDetails.teamAWickets);
    setManualBalls(side === 'B' ? cricketDetails.teamBBalls : cricketDetails.teamABalls);
  }

  async function submitPatch(payload: {
    teamAScore?: number;
    teamBScore?: number;
    matchStatus?: string;
    sportSpecificDetails?: Record<string, unknown>;
    action: string;
    allowLockedOverride?: boolean;
  }) {
    try {
      setBusy(true);
      setFeedback(null);
      const res = await offlineScoreService.submitScorePatch(stream.id, payload, score);
      if (res.score) onScoreChange(res.score);
      onRefresh?.();
      setFeedback({
        type: 'success',
        text: res.queued ? `Cached offline (${payload.action})` : payload.action,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: extractApiError(err, 'Failed to adjust score.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitEvent(
    action: Record<string, unknown>,
    successFallback: string,
    sportTypeOverride?: string
  ) {
    try {
      setBusy(true);
      setFeedback(null);
      const res = await offlineScoreService.submitScoreEvent(
        stream.id,
        {
          clientEventId: makeClientEventId('overlay'),
          sportType: sportTypeOverride || sport,
          action,
        },
        score
      );
      if (res.score) onScoreChange(res.score);
      onRefresh?.();
      setFeedback({
        type: 'success',
        text: res.queued
          ? `Cached offline (${successFallback})`
          : res.historyItem?.action || successFallback,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: extractApiError(err, 'Failed to record score event.'),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    try {
      setBusy(true);
      setFeedback(null);
      const res = await scoreboardService.undoScore(stream.id);
      onScoreChange(res.score);
      onRefresh?.();
      setFeedback({ type: 'success', text: `Undid: ${res.undoneAction}` });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Nothing to undo.') });
    } finally {
      setBusy(false);
    }
  }

  async function handleTimeoutAction(side: 'A' | 'B' | 'END') {
    try {
      setBusy(true);
      setFeedback(null);
      if (sport === 'Kabaddi') {
        const res = await scoreboardService.controlKabaddiClock(
          stream.id,
          side === 'END' ? { type: 'END_TIMEOUT' } : { type: 'START_TIMEOUT', team: side }
        );
        if (res?.score) onScoreChange(res.score);
      } else {
        const nextStatus =
          side === 'END'
            ? 'LIVE'
            : `${side === 'A' ? nameA : nameB} TIMEOUT`;
        const res = await offlineScoreService.submitScorePatch(
          stream.id,
          {
            matchStatus: nextStatus,
            action: side === 'END' ? 'Resumed Live' : `Timeout (${side === 'A' ? shortA : shortB})`,
            allowLockedOverride: true,
          },
          score
        );
        if (res.score) onScoreChange(res.score);
      }
      onRefresh?.();
      setFeedback({
        type: 'success',
        text: side === 'END' ? 'Timeout ended — Match Live' : `${side === 'A' ? shortA : shortB} Timeout Active`,
      });
    } catch (err) {
      setFeedback({ type: 'error', text: extractApiError(err, 'Failed to update timeout.') });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleTakeover(target: 'full_scoreboard' | 'fullscreen_ad') {
    if (!normalizedOverlay || !onOverlayConfigChange) return;
    const prev = normalizedOverlay;
    const patch: Partial<BroadcastOverlayConfig> =
      target === 'full_scoreboard'
        ? {
            fullScoreboardVisible: !prev.fullScoreboardVisible,
            ...(!prev.fullScoreboardVisible ? { timeoutFullscreenSponsorAdActive: false } : {}),
          }
        : {
            timeoutFullscreenSponsorAdActive: !prev.timeoutFullscreenSponsorAdActive,
            ...(!prev.timeoutFullscreenSponsorAdActive ? { fullScoreboardVisible: false } : {}),
          };
    const next = normalizeOverlayConfig({ ...prev, ...patch });
    onOverlayConfigChange(next);
    try {
      setBusy(true);
      setFeedback(null);
      const res = await liveStreamService.updateOverlayConfig(stream.id, patch);
      if (res?.overlayConfig) {
        onOverlayConfigChange(normalizeOverlayConfig(res.overlayConfig));
      }
      setFeedback({
        type: 'success',
        text:
          target === 'full_scoreboard'
            ? next.fullScoreboardVisible
              ? 'Full Scoreboard ON'
              : 'Full Scoreboard OFF'
            : next.timeoutFullscreenSponsorAdActive
              ? 'Fullscreen Timeout Ad ON'
              : 'Fullscreen Timeout Ad OFF',
      });
    } catch (err) {
      onOverlayConfigChange(prev);
      setFeedback({ type: 'error', text: extractApiError(err, 'Failed to toggle takeover.') });
    } finally {
      setBusy(false);
    }
  }

  async function applyManualCricketScore(next: {
    side?: 'A' | 'B';
    runs?: number;
    wickets?: number;
    balls?: number;
    target?: number;
    label?: string;
  }) {
    const side = next.side ?? cricketSide;
    const runs = Math.max(0, Math.floor(next.runs ?? manualRuns));
    const wickets = Math.max(0, Math.min(10, Math.floor(next.wickets ?? manualWickets)));
    const balls = Math.max(0, Math.floor(next.balls ?? manualBalls));
    const target = Math.max(0, Math.floor(next.target ?? manualTarget));

    setManualRuns(runs);
    setManualWickets(wickets);
    setManualBalls(balls);
    setManualTarget(target);

    const updatedDetails: CricketDetails = {
      ...cricketDetails,
      battingTeam: side,
      ...(side === 'A'
        ? {
            teamARuns: runs,
            teamAWickets: wickets,
            teamABalls: balls,
            teamAOvers: formatCricketOvers(balls),
          }
        : {
            teamBRuns: runs,
            teamBWickets: wickets,
            teamBBalls: balls,
            teamBOvers: formatCricketOvers(balls),
          }),
      ...(target > 0 ? { target } : {}),
    };

    const teamAScore = side === 'A' ? runs : cricketDetails.teamARuns;
    const teamBScore = side === 'B' ? runs : cricketDetails.teamBRuns;

    await submitPatch({
      teamAScore,
      teamBScore,
      sportSpecificDetails: updatedDetails as unknown as Record<string, unknown>,
      action:
        next.label ||
        `Manual adjustment: ${side === 'A' ? shortA : shortB} ${runs}/${wickets} (${formatCricketOvers(balls)} ov)`,
      allowLockedOverride: true,
    });
  }

  async function applyManualGenericScore(nextA: number, nextB: number, actionLabel?: string) {
    const safeA = Math.max(0, Math.floor(nextA));
    const safeB = Math.max(0, Math.floor(nextB));
    setManualTeamAScore(safeA);
    setManualTeamBScore(safeB);

    await submitPatch({
      teamAScore: safeA,
      teamBScore: safeB,
      action: actionLabel || `Manual score: ${shortA} ${safeA} - ${safeB} ${shortB}`,
      allowLockedOverride: true,
    });
  }

  useEffect(() => {
    const syncViewport = () => {
      setGeometry((prev) =>
        hasCustomGeometry ? clampPanelGeometry(prev) : getDefaultPanelGeometry(overlayPosition)
      );
    };
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [hasCustomGeometry, overlayPosition]);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('button, input, select, a, label')) {
      return;
    }
    e.preventDefault();
    interactionRef.current = {
      mode: 'drag',
      dir: 'se',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      orig: geometryRef.current,
    };
    setIsInteracting(true);
  }, []);

  const handleResizePointerDown = useCallback(
    (dir: ResizeDirection) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      interactionRef.current = {
        mode: 'resize',
        dir,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        orig: geometryRef.current,
      };
      setIsInteracting(true);
    },
    []
  );

  useEffect(() => {
    if (!isInteracting) return;

    const onPointerMove = (e: PointerEvent) => {
      const st = interactionRef.current;
      if (st.mode === 'none' || e.pointerId !== st.pointerId) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (st.mode === 'drag') {
        const next = clampPanelGeometry({
          ...st.orig,
          x: st.orig.x + dx,
          y: st.orig.y + dy,
        });
        geometryRef.current = next;
        setGeometry(next);
        setHasCustomGeometry(true);
        return;
      }

      const maxW = Math.max(MIN_PANEL_WIDTH, window.innerWidth - EDGE_MARGIN * 2);
      const maxH = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - EDGE_MARGIN * 2);
      let nextX = st.orig.x;
      let nextY = st.orig.y;
      let nextW = st.orig.width;
      let nextH = st.orig.height;

      if (st.dir === 'e' || st.dir === 'se') {
        nextW = Math.max(MIN_PANEL_WIDTH, Math.min(maxW, st.orig.width + dx));
      }
      if (st.dir === 'w' || st.dir === 'sw') {
        const proposedW = Math.max(MIN_PANEL_WIDTH, Math.min(maxW, st.orig.width - dx));
        const deltaW = st.orig.width - proposedW;
        nextX = Math.max(EDGE_MARGIN, st.orig.x + deltaW);
        nextW = st.orig.x + st.orig.width - nextX;
      }
      if (st.dir === 's' || st.dir === 'se' || st.dir === 'sw') {
        nextH = Math.max(MIN_PANEL_HEIGHT, Math.min(maxH, st.orig.height + dy));
      }

      const clamped = clampPanelGeometry({ x: nextX, y: nextY, width: nextW, height: nextH });
      geometryRef.current = clamped;
      setGeometry(clamped);
      setHasCustomGeometry(true);
    };

    const stopInteraction = (e: PointerEvent) => {
      const st = interactionRef.current;
      if (st.mode === 'none' || e.pointerId !== st.pointerId) return;
      st.mode = 'none';
      setIsInteracting(false);
      savePanelGeometry(geometryRef.current);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopInteraction);
    window.addEventListener('pointercancel', stopInteraction);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopInteraction);
      window.removeEventListener('pointercancel', stopInteraction);
    };
  }, [isInteracting]);

  function handleResetGeometry() {
    clearSavedPanelGeometry();
    setHasCustomGeometry(false);
    setGeometry(getDefaultPanelGeometry(overlayPosition));
  }

  return (
    <aside
      aria-label="Quick Score Control Panel"
      data-quick-score-panel="true"
      style={{
        transform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`,
        width: geometry.width,
        height: geometry.height,
      }}
      className={`${
        positioning === 'absolute' ? 'absolute z-40' : 'fixed z-[80]'
      } top-0 left-0 pointer-events-auto flex flex-col overflow-hidden rounded-xl border ${
        isInteracting
          ? 'border-[#EA580C] shadow-[0_24px_56px_rgba(0,0,0,0.8)]'
          : 'border-slate-700/90 shadow-2xl'
      } bg-slate-950/95 text-slate-100 backdrop-blur-md transition-[border-color] duration-150`}
    >
      {/* Draggable Broadcast Control Header */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={(e) => {
          if (e.target instanceof Element && e.target.closest('button, input, select, a, label')) {
            return;
          }
          handleResetGeometry();
        }}
        title="Drag to move · Resize from edges/corners · Double-click to reset"
        className={`shrink-0 px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/85 flex items-center justify-between gap-2 select-none touch-none ${
          isInteracting ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
          <div className="min-w-0">
            <h3 className="font-display text-xs font-bold text-white truncate">
              Quick Score Controls
            </h3>
            <p className="text-[10px] text-slate-400 truncate">
              {shortA} vs {shortB} · {sport} · Drag &amp; resize
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={handleUndo}
            title="Undo last score action"
            className="min-h-[30px] px-2 py-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
          >
            <Undo2 className="w-3 h-3" />
            <span>Undo</span>
          </button>

          {hasCustomGeometry && (
            <button
              type="button"
              onClick={handleResetGeometry}
              title="Reset panel position and size"
              aria-label="Reset floating panel position and size"
              className="min-h-[30px] w-7 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 inline-flex items-center justify-center"
            >
              <LocateFixed className="w-3.5 h-3.5" />
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Minimize floating control panel"
              aria-label="Close floating control panel"
              className="min-h-[30px] w-7 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 inline-flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3">
        {/* Segmented Mode Switcher + Status Dropdown */}
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'manual'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Manual Adjust
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('events')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'events'
                  ? 'bg-[#EA580C] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Quick Events
            </button>
          </div>

          <select
            value={
              STANDARD_MATCH_STATUSES.includes((score?.matchStatus || 'LIVE').toUpperCase() as any)
                ? (score?.matchStatus || 'LIVE').toUpperCase()
                : ''
            }
            disabled={busy || volleyballLock.locked}
            onChange={(e) => {
              if (!e.target.value) return;
              submitPatch({
                matchStatus: e.target.value,
                action: `Status -> ${e.target.value}`,
                allowLockedOverride: sport !== 'Volleyball',
              });
            }}
            aria-label="Match status"
            className="min-h-[32px] px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-700 bg-slate-900 text-slate-200 max-w-[130px]"
          >
            <option value="">{score?.matchStatus || 'LIVE'}</option>
            {STANDARD_MATCH_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>

        {/* Inline Feedback */}
        {feedback && (
          <div
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-between gap-2 ${
              feedback.type === 'error'
                ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            <span className="truncate">{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-[10px] opacity-80 hover:opacity-100 shrink-0"
            >
              Hide
            </button>
          </div>
        )}

        {/* Quick Broadcast Takeover & Timeout Strip */}
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg border border-slate-800 bg-slate-900/80">
          {normalizedOverlay && onOverlayConfigChange && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleTakeover('full_scoreboard')}
                className={`min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border transition-colors ${
                  normalizedOverlay.fullScoreboardVisible
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Maximize2 className="w-3 h-3" />
                <span>{normalizedOverlay.fullScoreboardVisible ? 'Hide Full Score' : 'Full Scoreboard'}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleToggleTakeover('fullscreen_ad')}
                className={`min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border transition-colors ${
                  normalizedOverlay.timeoutFullscreenSponsorAdActive
                    ? 'bg-amber-600 text-white border-amber-400'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Tv className="w-3 h-3" />
                <span>{normalizedOverlay.timeoutFullscreenSponsorAdActive ? 'End Ad' : 'Timeout Ad'}</span>
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => handleTimeoutAction('A')}
            className={`min-h-[28px] px-2 py-1 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 border ${
              timeoutInfo.isTimeout && timeoutInfo.teamSide === 'A'
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-slate-800 text-amber-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>{shortA} TO</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleTimeoutAction('B')}
            className={`min-h-[28px] px-2 py-1 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 border ${
              timeoutInfo.isTimeout && timeoutInfo.teamSide === 'B'
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-slate-800 text-sky-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>{shortB} TO</span>
          </button>
          {timeoutInfo.isTimeout && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleTimeoutAction('END')}
              className="min-h-[28px] px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400"
            >
              Resume
            </button>
          )}
        </div>

        {/* MANUAL ADJUSTMENTS TAB */}
        {activeTab === 'manual' && sport === 'Cricket' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                {(['A', 'B'] as const).map((side) => {
                  const label = side === 'A' ? shortA : shortB;
                  const runs = side === 'A' ? cricketDetails.teamARuns : cricketDetails.teamBRuns;
                  const wk = side === 'A' ? cricketDetails.teamAWickets : cricketDetails.teamBWickets;
                  return (
                    <button
                      key={side}
                      type="button"
                      onClick={() => handleSelectCricketSide(side)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums font-semibold transition-colors whitespace-nowrap ${
                        cricketSide === side
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label} {runs}/{wk}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {formatCricketOvers(manualBalls)} ov
              </span>
            </div>

            {/* Runs / Wickets / Balls Manual Grid */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/90 space-y-1.5">
                <span className="block text-[10px] font-semibold text-slate-400">Runs</span>
                <input
                  type="number"
                  min={0}
                  value={manualRuns}
                  onChange={(e) => setManualRuns(Math.max(0, Number(e.target.value) || 0))}
                  aria-label="Manual runs"
                  className="w-full min-h-[32px] px-2 py-1 text-sm font-mono tabular-nums font-bold bg-slate-950 border border-slate-700 rounded text-white text-center"
                />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      applyManualCricketScore({
                        runs: Math.max(0, manualRuns - 1),
                        label: `${cricketSide === 'A' ? shortA : shortB} -1 run`,
                      })
                    }
                    className="min-h-[28px] rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center justify-center"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      applyManualCricketScore({
                        runs: manualRuns + 1,
                        label: `${cricketSide === 'A' ? shortA : shortB} +1 run`,
                      })
                    }
                    className="min-h-[28px] rounded bg-[#EA580C] hover:bg-orange-600 text-xs font-mono font-bold text-white flex items-center justify-center"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/90 space-y-1.5">
                <span className="block text-[10px] font-semibold text-slate-400">Wickets</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={manualWickets}
                  onChange={(e) =>
                    setManualWickets(Math.max(0, Math.min(10, Number(e.target.value) || 0)))
                  }
                  aria-label="Manual wickets"
                  className="w-full min-h-[32px] px-2 py-1 text-sm font-mono tabular-nums font-bold bg-slate-950 border border-slate-700 rounded text-white text-center"
                />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={busy || manualWickets <= 0}
                    onClick={() =>
                      applyManualCricketScore({
                        wickets: Math.max(0, manualWickets - 1),
                        label: `${cricketSide === 'A' ? shortA : shortB} -1 wicket`,
                      })
                    }
                    className="min-h-[28px] rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center justify-center disabled:opacity-40"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || manualWickets >= 10}
                    onClick={() =>
                      applyManualCricketScore({
                        wickets: Math.min(10, manualWickets + 1),
                        label: `${cricketSide === 'A' ? shortA : shortB} +1 wicket`,
                      })
                    }
                    className="min-h-[28px] rounded bg-red-600 hover:bg-red-500 text-xs font-mono font-bold text-white flex items-center justify-center disabled:opacity-40"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/90 space-y-1.5">
                <span className="block text-[10px] font-semibold text-slate-400">Legal Balls</span>
                <input
                  type="number"
                  min={0}
                  value={manualBalls}
                  onChange={(e) => setManualBalls(Math.max(0, Number(e.target.value) || 0))}
                  aria-label="Manual legal balls"
                  className="w-full min-h-[32px] px-2 py-1 text-sm font-mono tabular-nums font-bold bg-slate-950 border border-slate-700 rounded text-white text-center"
                />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={busy || manualBalls <= 0}
                    onClick={() =>
                      applyManualCricketScore({
                        balls: Math.max(0, manualBalls - 1),
                        label: 'Adjusted -1 ball',
                      })
                    }
                    className="min-h-[28px] rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center justify-center disabled:opacity-40"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      applyManualCricketScore({
                        balls: manualBalls + 1,
                        label: 'Adjusted +1 ball',
                      })
                    }
                    className="min-h-[28px] rounded bg-sky-600 hover:bg-sky-500 text-xs font-mono font-bold text-white flex items-center justify-center"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              {cricketChase.isSecondInnings ? (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Target</span>
                  <input
                    type="number"
                    min={0}
                    value={manualTarget}
                    onChange={(e) => setManualTarget(Math.max(0, Number(e.target.value) || 0))}
                    className="w-16 min-h-[30px] px-1.5 py-0.5 text-xs font-mono tabular-nums bg-slate-950 border border-slate-700 rounded text-white text-center"
                  />
                </label>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Quick manual override syncs live
                </span>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => applyManualCricketScore({})}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Score</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'manual' && sport !== 'Cricket' && (
          <div className="space-y-2.5">
            {volleyballLock.locked && (
              <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center gap-1.5 text-[11px] text-amber-200 font-semibold">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Match Completed &amp; Locked. Open Full Scorer to reopen.</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  {
                    side: 'A' as const,
                    label: shortA,
                    value: manualTeamAScore,
                    setter: setManualTeamAScore,
                    accent: 'bg-[#EA580C] hover:bg-orange-600',
                  },
                  {
                    side: 'B' as const,
                    label: shortB,
                    value: manualTeamBScore,
                    setter: setManualTeamBScore,
                    accent: 'bg-sky-600 hover:bg-sky-500',
                  },
                ] as const
              ).map((tm) => (
                <div
                  key={tm.side}
                  className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/90 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                    <span className="truncate">{tm.label}</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    disabled={busy || volleyballLock.locked}
                    value={tm.value}
                    onChange={(e) => tm.setter(Math.max(0, Number(e.target.value) || 0))}
                    aria-label={`${tm.label} score`}
                    className="w-full min-h-[36px] px-2 py-1 text-base font-mono tabular-nums font-bold bg-slate-950 border border-slate-700 rounded text-white text-center disabled:opacity-50"
                  />
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      disabled={busy || volleyballLock.locked || tm.value <= 0}
                      onClick={() =>
                        applyManualGenericScore(
                          tm.side === 'A' ? Math.max(0, manualTeamAScore - 1) : manualTeamAScore,
                          tm.side === 'B' ? Math.max(0, manualTeamBScore - 1) : manualTeamBScore,
                          `${tm.label} -1`
                        )
                      }
                      className="min-h-[30px] rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 disabled:opacity-40"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      disabled={busy || volleyballLock.locked}
                      onClick={() =>
                        applyManualGenericScore(
                          tm.side === 'A' ? manualTeamAScore + 1 : manualTeamAScore,
                          tm.side === 'B' ? manualTeamBScore + 1 : manualTeamBScore,
                          `${tm.label} +1`
                        )
                      }
                      className={`min-h-[30px] rounded text-xs font-mono font-bold text-white disabled:opacity-40 ${tm.accent}`}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      disabled={busy || volleyballLock.locked}
                      onClick={() =>
                        applyManualGenericScore(
                          tm.side === 'A' ? manualTeamAScore + 2 : manualTeamAScore,
                          tm.side === 'B' ? manualTeamBScore + 2 : manualTeamBScore,
                          `${tm.label} +2`
                        )
                      }
                      className="min-h-[30px] rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-100 disabled:opacity-40"
                    >
                      +2
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                disabled={busy || volleyballLock.locked}
                onClick={() => applyManualGenericScore(manualTeamAScore, manualTeamBScore)}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Score</span>
              </button>
            </div>
          </div>
        )}

        {/* QUICK LIVE EVENTS TAB */}
        {activeTab === 'events' && sport === 'Cricket' && (
          <div className="space-y-2">
            {cricketLock.locked && (
              <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                {cricketLock.reason} — use Manual Adjust to edit or Switch to Scorer Console.
              </p>
            )}
            <div className="grid grid-cols-6 gap-1.5">
              {[0, 1, 2, 3, 4, 6].map((runs) => (
                <button
                  key={runs}
                  type="button"
                  disabled={busy || cricketLock.locked}
                  onClick={() =>
                    submitEvent(
                      {
                        type: 'RUNS',
                        runs,
                        striker: cricketDetails.batsman1 || undefined,
                        nonStriker: cricketDetails.batsman2 || undefined,
                        bowler: cricketDetails.bowler || undefined,
                      },
                      `+${runs} run${runs === 1 ? '' : 's'}`
                    )
                  }
                  className={`min-h-[36px] rounded-lg border font-mono tabular-nums text-xs font-bold disabled:opacity-40 ${
                    runs === 4
                      ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500'
                      : runs === 6
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700'
                  }`}
                >
                  {runs === 0 ? '0' : `+${runs}`}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={busy || cricketLock.locked}
                onClick={() =>
                  submitEvent(
                    {
                      type: 'WIDE',
                      extraRuns: 0,
                      striker: cricketDetails.batsman1 || undefined,
                      nonStriker: cricketDetails.batsman2 || undefined,
                      bowler: cricketDetails.bowler || undefined,
                    },
                    'Wide +1'
                  )
                }
                className="min-h-[34px] rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-mono text-xs font-bold disabled:opacity-40"
              >
                Wd
              </button>
              <button
                type="button"
                disabled={busy || cricketLock.locked}
                onClick={() =>
                  submitEvent(
                    {
                      type: 'NO_BALL',
                      extraRuns: 0,
                      batRuns: 0,
                      striker: cricketDetails.batsman1 || undefined,
                      nonStriker: cricketDetails.batsman2 || undefined,
                      bowler: cricketDetails.bowler || undefined,
                    },
                    'No Ball +1'
                  )
                }
                className="min-h-[34px] rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-mono text-xs font-bold disabled:opacity-40"
              >
                NB
              </button>
              <button
                type="button"
                disabled={busy || cricketLock.locked}
                onClick={() =>
                  submitEvent(
                    {
                      type: 'WICKET',
                      wicketType: 'CAUGHT',
                      dismissedPlayer: cricketDetails.batsman1 || undefined,
                      striker: cricketDetails.batsman1 || undefined,
                      nonStriker: cricketDetails.batsman2 || undefined,
                      bowler: cricketDetails.bowler || undefined,
                    },
                    'Wicket'
                  )
                }
                className="min-h-[34px] rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-40"
              >
                Wicket
              </button>
              <button
                type="button"
                disabled={busy || cricketLock.locked}
                onClick={() => submitEvent({ type: 'CHANGE_STRIKER' }, 'Swapped striker')}
                className="min-h-[34px] inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold disabled:opacity-40"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Strike</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'events' && sport === 'Football' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submitEvent({ type: 'GOAL', team: 'A', delta: 1 }, `${shortA} Goal`, 'Football')}
              className="min-h-[38px] rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold"
            >
              +1 Goal ({shortA})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => submitEvent({ type: 'GOAL', team: 'B', delta: 1 }, `${shortB} Goal`, 'Football')}
              className="min-h-[38px] rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              +1 Goal ({shortB})
            </button>
          </div>
        )}

        {activeTab === 'events' && sport === 'Kabaddi' && (
          <div className="grid grid-cols-2 gap-2">
            {(['A', 'B'] as const).map((side) => {
              const label = side === 'A' ? shortA : shortB;
              return (
                <div key={side} className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-400">{label}</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        submitEvent(
                          { type: 'ADD_POINTS', team: side, category: 'raidPoints', points: 1 },
                          `${label} +1 Raid`,
                          'Kabaddi'
                        )
                      }
                      className="min-h-[32px] rounded bg-[#EA580C] hover:bg-orange-600 text-white text-[11px] font-bold"
                    >
                      +1 Raid
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        submitEvent(
                          { type: 'ADD_POINTS', team: side, category: 'tacklePoints', points: 1 },
                          `${label} +1 Tackle`,
                          'Kabaddi'
                        )
                      }
                      className="min-h-[32px] rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold"
                    >
                      +1 Tackle
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        submitEvent(
                          { type: 'ADD_POINTS', team: side, category: 'bonusPoints', points: 1 },
                          `${label} +1 Bonus`,
                          'Kabaddi'
                        )
                      }
                      className="min-h-[32px] rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold"
                    >
                      +1 Bonus
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        submitEvent(
                          { type: 'ADD_POINTS', team: side, category: 'superRaids', points: 3 },
                          `${label} +3 Super`,
                          'Kabaddi'
                        )
                      }
                      className="min-h-[32px] rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold"
                    >
                      +3 Super
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'events' && sport === 'Volleyball' && (() => {
          const vd = normalizeVolleyballDetails(
            (score?.sportSpecificDetails || {}) as Partial<VolleyballDetails>
          );
          const disabled = busy || volleyballLock.locked;
          return (
            <div className="space-y-2">
              {volleyballLock.locked && (
                <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center gap-1.5 text-[11px] text-amber-200 font-semibold">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Match Completed &amp; Locked. Open Full Scorer to reopen.</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => submitEvent({ type: 'POINT', team: 'A', delta: 1 }, `${shortA} +1`, 'Volleyball')}
                  className="flex-1 min-h-[36px] rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold whitespace-nowrap disabled:opacity-40"
                >
                  +1 {shortA}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => submitEvent({ type: 'POINT', team: 'B', delta: 1 }, `${shortB} +1`, 'Volleyball')}
                  className="flex-1 min-h-[36px] rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold whitespace-nowrap disabled:opacity-40"
                >
                  +1 {shortB}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    submitEvent(
                      { type: 'SET_SERVING_TEAM', team: vd.servingTeam === 'A' ? 'B' : 'A' },
                      'Switched Serve',
                      'Volleyball'
                    )
                  }
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-40"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{vd.servingTeam === 'A' ? shortA : shortB}</span>
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    submitEvent(
                      { type: 'SET_ADVANTAGE', team: vd.advantageTeam === 'A' ? null : 'A' },
                      `Advantage ${shortA}`,
                      'Volleyball'
                    )
                  }
                  className={`flex-1 min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold whitespace-nowrap disabled:opacity-40 ${
                    vd.advantageTeam === 'A'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  ADV {shortA}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    submitEvent(
                      { type: 'SET_ADVANTAGE', team: vd.advantageTeam === 'B' ? null : 'B' },
                      `Advantage ${shortB}`,
                      'Volleyball'
                    )
                  }
                  className={`flex-1 min-h-[32px] px-2 rounded-lg border text-[11px] font-semibold whitespace-nowrap disabled:opacity-40 ${
                    vd.advantageTeam === 'B'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  ADV {shortB}
                </button>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 px-1.5 whitespace-nowrap">
                  S{vd.currentSet}/{vd.bestOfSets}
                  {vd.isDeuce && !vd.advantageTeam ? ' DEUCE' : ''}
                </span>
              </div>
            </div>
          );
        })()}

        {activeTab === 'events' && sport === 'Other' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => applyManualGenericScore((score?.teamAScore ?? 0) + 1, score?.teamBScore ?? 0, `${shortA} +1`)}
              className="min-h-[36px] rounded-lg bg-[#EA580C] hover:bg-orange-600 text-white text-xs font-bold"
            >
              +1 {shortA}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => applyManualGenericScore(score?.teamAScore ?? 0, (score?.teamBScore ?? 0) + 1, `${shortB} +1`)}
              className="min-h-[36px] rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
            >
              +1 {shortB}
            </button>
          </div>
        )}

        {/* Footer link to full Scorer Console */}
        <div className="pt-2 border-t border-slate-800/90 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="truncate">Live sync to overlay · {geometry.width}×{geometry.height}</span>
          <Link
            to={`/admin/scoreboard/${stream.id}`}
            className="inline-flex items-center gap-1 font-semibold text-orange-400 hover:text-orange-300 whitespace-nowrap"
          >
            <span>Full Scorer</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Edge & Corner Resize Handles */}
      <div
        onPointerDown={handleResizePointerDown('e')}
        title="Resize width"
        aria-hidden="true"
        className="absolute top-3 bottom-4 right-0 w-2 cursor-ew-resize touch-none z-20 hover:bg-[#EA580C]/25 transition-colors"
      />
      <div
        onPointerDown={handleResizePointerDown('w')}
        title="Resize width"
        aria-hidden="true"
        className="absolute top-3 bottom-4 left-0 w-2 cursor-ew-resize touch-none z-20 hover:bg-[#EA580C]/25 transition-colors"
      />
      <div
        onPointerDown={handleResizePointerDown('s')}
        title="Resize height"
        aria-hidden="true"
        className="absolute left-3 right-3 bottom-0 h-2 cursor-ns-resize touch-none z-20 hover:bg-[#EA580C]/25 transition-colors"
      />
      <div
        onPointerDown={handleResizePointerDown('sw')}
        title="Drag corner to resize"
        aria-hidden="true"
        className="absolute left-0 bottom-0 w-3.5 h-3.5 cursor-nesw-resize touch-none z-30"
      />
      <div
        onPointerDown={handleResizePointerDown('se')}
        title="Drag corner to resize"
        aria-label="Resize Quick Score Controls panel"
        className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize touch-none z-30 flex items-end justify-end p-0.5 text-slate-400 hover:text-orange-400"
      >
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M11 5L5 11M11 9L9 11" strokeLinecap="round" />
        </svg>
      </div>
    </aside>
  );
}
