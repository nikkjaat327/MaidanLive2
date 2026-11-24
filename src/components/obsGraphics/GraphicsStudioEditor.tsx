import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Circle,
  ClipboardPaste,
  Clock,
  Copy,
  CopyPlus,
  Eye,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Maximize,
  Pause,
  Play,
  Plus,
  QrCode,
  Radio,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Shapes,
  Sparkles,
  Square,
  Star,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ActiveBroadcastGraphicSlot,
  BroadcastAdDesignData,
  BroadcastGraphicsAssetData,
  BroadcastGraphicsStateData,
  GraphicsAnimationStyle,
  GraphicsDesignGroupMeta,
  GraphicsDesignType,
  GraphicsElement,
  GraphicsLayoutPresetId,
  GraphicsScope,
} from '../../types/broadcastGraphics.ts';
import { broadcastGraphicsService } from '../../services/obs/broadcastGraphicsService.ts';
import { extractApiError } from '../../services/api/httpClient.ts';
import {
  BROADCAST_GRAPHICS_TEMPLATES,
  GRAPHICS_DURATION_PRESETS,
  GRAPHICS_ENTRY_ANIMATIONS,
  GRAPHICS_EXIT_ANIMATIONS,
  GRAPHICS_LAYOUT_PRESETS,
  GRAPHICS_RESOLUTION_PRESETS,
  createDefaultElement,
  makeElementId,
} from '../../utils/broadcastGraphicsTemplates.ts';
import { generateDesignThumbnailDataUrl } from './canvasThumbnail.ts';
import { CanvasPreviewBg, GraphicsCanvas } from './GraphicsCanvas.tsx';
import { GraphicsLayersPanel } from './GraphicsLayersPanel.tsx';
import { GraphicsPropertiesPanel } from './GraphicsPropertiesPanel.tsx';
import { GraphicsTimelinePanel } from './GraphicsTimelinePanel.tsx';
import { ObsGraphicsLayer, ScaledGraphicsPreviewFrame } from './ObsGraphicsLayer.tsx';
import { ConfirmDialog } from '../common/ConfirmDialog.tsx';
import { Modal } from '../common/Modal.tsx';

interface SponsorItem {
  id: string;
  name: string;
  logoUrl: string;
  sponsorshipType: string;
  tagline?: string;
}

interface GraphicsStudioEditorProps {
  matchId: string;
  tournamentId?: string | null;
  initialDesign?: BroadcastAdDesignData | null;
  graphicsState?: BroadcastGraphicsStateData | null;
  designs: BroadcastAdDesignData[];
  sponsors: SponsorItem[];
  obsConnected: boolean;
  bridgeOnline: boolean;
  socketConnected: boolean;
  onBackToLibrary: () => void;
  onRefreshDesigns: () => Promise<void> | void;
  onGraphicsStateChange: (next: BroadcastGraphicsStateData) => void;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (msg: string) => void;
}

type LeftRailTab = 'elements' | 'templates' | 'assets' | 'layers';

function cloneElements(els: GraphicsElement[]): GraphicsElement[] {
  return els.map((e) => ({
    ...e,
    ...(e.crop ? { crop: { ...e.crop } } : {}),
    ...(e.gradient
      ? {
          gradient: {
            ...e.gradient,
            ...(e.gradient.stops ? { stops: e.gradient.stops.map((s) => ({ ...s })) } : {}),
          },
        }
      : {}),
    ...(e.gradientText
      ? {
          gradientText: {
            ...e.gradientText,
            ...(e.gradientText.stops
              ? { stops: e.gradientText.stops.map((s) => ({ ...s })) }
              : {}),
          },
        }
      : {}),
    animation: { ...e.animation },
  }));
}

async function optimizeImageBeforeUpload(file: File): Promise<{
  file: File;
  width: number;
  height: number;
}> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return { file, width: 0, height: 0 };
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const origW = img.naturalWidth || 0;
      const origH = img.naturalHeight || 0;
      const maxDim = 1920;
      if (origW <= maxDim && origH <= maxDim && file.size <= 1_800_000) {
        URL.revokeObjectURL(objectUrl);
        resolve({ file, width: origW, height: origH });
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(origW, origH, 1));
      const targetW = Math.max(1, Math.round(origW * scale));
      const targetH = Math.max(1, Math.round(origH * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve({ file, width: origW, height: origH });
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const outputMime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob || blob.size >= file.size) {
            resolve({ file, width: origW, height: origH });
            return;
          }
          const ext = outputMime === 'image/jpeg' ? '.jpg' : '.webp';
          const cleanBase = file.name.replace(/\.[^.]+$/, '');
          const optimized = new File([blob], `${cleanBase}${ext}`, { type: outputMime });
          resolve({ file: optimized, width: targetW, height: targetH });
        },
        outputMime,
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ file, width: 0, height: 0 });
    };
    img.src = objectUrl;
  });
}

export const GraphicsStudioEditor: React.FC<GraphicsStudioEditorProps> = ({
  matchId,
  tournamentId,
  initialDesign,
  graphicsState,
  designs,
  sponsors,
  obsConnected,
  bridgeOnline,
  socketConnected,
  onBackToLibrary,
  onRefreshDesigns,
  onGraphicsStateChange,
  onNotifySuccess,
  onNotifyError,
}) => {
  const [designId, setDesignId] = useState<string | null>(initialDesign?.id || null);
  const [designName, setDesignName] = useState(
    initialDesign?.name || 'New Broadcast Sponsor Graphic'
  );
  const [designType, setDesignType] = useState<GraphicsDesignType>(
    initialDesign?.designType || 'banner'
  );
  const [scope, setScope] = useState<GraphicsScope>(
    initialDesign?.scope || (tournamentId ? 'tournament' : 'match')
  );
  const [layoutPreset, setLayoutPreset] = useState<GraphicsLayoutPresetId>(
    initialDesign?.layoutPreset || 'bottom_banner'
  );
  const [canvasWidth, setCanvasWidth] = useState(initialDesign?.canvasWidth || 1920);
  const [canvasHeight, setCanvasHeight] = useState(initialDesign?.canvasHeight || 1080);
  const [entryAnimation, setEntryAnimation] = useState<GraphicsAnimationStyle>(
    initialDesign?.entryAnimation || 'slide-bottom'
  );
  const [exitAnimation, setExitAnimation] = useState<GraphicsAnimationStyle>(
    initialDesign?.exitAnimation || 'fade-out'
  );
  const [defaultDurationSeconds, setDefaultDurationSeconds] = useState<number>(
    initialDesign?.defaultDurationSeconds ?? 10
  );
  const [timelineEnabled, setTimelineEnabled] = useState<boolean>(
    initialDesign?.timelineEnabled ?? false
  );
  const [totalDurationSeconds, setTotalDurationSeconds] = useState<number>(
    initialDesign?.totalDurationSeconds ?? 10
  );
  const [groups, setGroups] = useState<GraphicsDesignGroupMeta[]>(
    initialDesign?.groups || []
  );

  const initialElements = useMemo(
    () =>
      initialDesign?.elements?.length
        ? cloneElements(initialDesign.elements)
        : cloneElements(BROADCAST_GRAPHICS_TEMPLATES[0].elements),
    [initialDesign]
  );

  const [elements, setElements] = useState<GraphicsElement[]>(initialElements);
  const [history, setHistory] = useState<GraphicsElement[][]>([initialElements]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialElements[0] ? [initialElements[0].id] : []
  );
  const [clipboardElements, setClipboardElements] = useState<GraphicsElement[]>([]);

  // Canvas & Studio view state
  const [leftTab, setLeftTab] = useState<LeftRailTab>('elements');
  const [previewBg, setPreviewBg] = useState<CanvasPreviewBg>('stadium');
  const [customBgUrl, setCustomBgUrl] = useState<string>('');
  const [showGrid, setShowGrid] = useState(true);
  const [gridSpacing, setGridSpacing] = useState(20);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showSafeMargins, setShowSafeMargins] = useState(true);
  const [showScoreboardSafeZone, setShowScoreboardSafeZone] = useState(true);
  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');

  // Assets
  const [assets, setAssets] = useState<BroadcastGraphicsAssetData[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [pickerTargetElementId, setPickerTargetElementId] = useState<string | null>(null);
  const [deleteAssetTarget, setDeleteAssetTarget] = useState<BroadcastGraphicsAssetData | null>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);
  const assetUploadRef = useRef<HTMLInputElement | null>(null);
  const replaceAssetInputRef = useRef<HTMLInputElement | null>(null);
  const replaceAssetIdRef = useRef<string | null>(null);

  // Isolated Preview Player & Timeline state
  const [savingDesign, setSavingDesign] = useState(false);
  const [pushingLive, setPushingLive] = useState(false);
  const [livePreviewOpen, setLivePreviewOpen] = useState(false);
  const [fullscreenStage, setFullscreenStage] = useState(false);
  const [previewReplayKey, setPreviewReplayKey] = useState(0);
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'entry' | 'exit' | 'full'>('full');
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);

  useEffect(() => {
    if (!previewPlaying) return;
    const totalMs = Math.max(1000, totalDurationSeconds * 1000);
    const id = window.setInterval(() => {
      setPlayheadMs((prev) => {
        const cur = prev ?? 0;
        const next = cur + 50;
        if (next >= totalMs) {
          setPreviewPlaying(false);
          return totalMs;
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [previewPlaying, totalDurationSeconds]);

  const loadAssets = useCallback(async () => {
    try {
      setLoadingAssets(true);
      const list = await broadcastGraphicsService.listAssets({
        matchId,
        tournamentId: tournamentId || undefined,
      });
      setAssets(list);
    } catch {
      // ignore initial asset fetch hiccup
    } finally {
      setLoadingAssets(false);
    }
  }, [matchId, tournamentId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // History helpers
  const commitElements = useCallback(
    (next: GraphicsElement[]) => {
      const cloned = cloneElements(next);
      setElements(cloned);
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const updated = [...sliced, cloned].slice(-40);
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    },
    [historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const targetIdx = historyIndex - 1;
    setHistoryIndex(targetIdx);
    setElements(cloneElements(history[targetIdx]));
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const targetIdx = historyIndex + 1;
    setHistoryIndex(targetIdx);
    setElements(cloneElements(history[targetIdx]));
  }, [history, historyIndex]);

  const updateElement = useCallback(
    (id: string, patch: Partial<GraphicsElement>, commit = true) => {
      const next = elements.map((el) => (el.id === id ? { ...el, ...patch } : el));
      if (commit) commitElements(next);
      else setElements(next);
    },
    [elements, commitElements]
  );

  const addElement = (
    type: GraphicsElement['type'],
    opts?: {
      shapeKind?: GraphicsElement['shapeKind'];
      src?: string;
      iconName?: string;
      layerName?: string;
    }
  ) => {
    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex || 0), 0);
    const newEl = createDefaultElement(type, {
      canvasWidth,
      canvasHeight,
      zIndex: maxZ + 1,
      shapeKind: opts?.shapeKind,
      src: opts?.src,
      iconName: opts?.iconName,
      layerName: opts?.layerName,
      matchId,
      tournamentId: tournamentId || undefined,
    });
    commitElements([...elements, newEl]);
    setSelectedIds([newEl.id]);
  };

  const handleCopySelected = useCallback(() => {
    if (!selectedIds.length) return;
    const picked = elements.filter((el) => selectedIds.includes(el.id));
    if (picked.length > 0) {
      setClipboardElements(cloneElements(picked));
    }
  }, [elements, selectedIds]);

  const handlePasteClipboard = useCallback(() => {
    if (!clipboardElements.length) return;
    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex || 0), 0);
    const pasted = clipboardElements.map((el, idx) => ({
      ...cloneElements([el])[0],
      id: makeElementId(el.type),
      layerName: `${el.layerName} Copy`,
      groupId: undefined,
      x: el.x + 28,
      y: el.y + 28,
      zIndex: maxZ + idx + 1,
    }));
    commitElements([...elements, ...pasted]);
    setSelectedIds(pasted.map((p) => p.id));
  }, [clipboardElements, elements, commitElements]);

  const duplicateIds = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex || 0), 0);
      const copies: GraphicsElement[] = [];
      elements.forEach((el) => {
        if (ids.includes(el.id)) {
          copies.push({
            ...cloneElements([el])[0],
            id: makeElementId(el.type),
            layerName: `${el.layerName} Copy`,
            groupId: undefined,
            x: el.x + 24,
            y: el.y + 24,
            zIndex: maxZ + copies.length + 1,
          });
        }
      });
      if (copies.length > 0) {
        commitElements([...elements, ...copies]);
        setSelectedIds(copies.map((c) => c.id));
      }
    },
    [elements, commitElements]
  );

  const deleteIds = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const remaining = elements.filter((el) => !ids.includes(el.id));
      commitElements(remaining);
      setSelectedIds(remaining[0] ? [remaining[0].id] : []);
    },
    [elements, commitElements]
  );

  const applyLayoutPreset = (presetId: GraphicsLayoutPresetId) => {
    setLayoutPreset(presetId);
    const meta = GRAPHICS_LAYOUT_PRESETS.find((p) => p.id === presetId);
    if (!meta || elements.length === 0) return;

    const targetRect = meta.rect(canvasWidth, canvasHeight);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    const curW = Math.max(1, maxX - minX);
    const curH = Math.max(1, maxY - minY);
    const scaleX = targetRect.width / curW;
    const scaleY = targetRect.height / curH;

    const next = elements.map((el) => ({
      ...el,
      x: Math.round(targetRect.x + (el.x - minX) * scaleX),
      y: Math.round(targetRect.y + (el.y - minY) * scaleY),
      width: Math.max(20, Math.round(el.width * scaleX)),
      height: Math.max(4, Math.round(el.height * scaleY)),
    }));
    commitElements(next);
    onNotifySuccess(`Applied "${meta.label}" layout composition.`);
  };

  const loadTemplate = (
    tpl: Pick<
      BroadcastAdDesignData,
      | 'name'
      | 'designType'
      | 'layoutPreset'
      | 'defaultDurationSeconds'
      | 'entryAnimation'
      | 'exitAnimation'
      | 'canvasWidth'
      | 'canvasHeight'
      | 'elements'
      | 'groups'
      | 'timelineEnabled'
      | 'totalDurationSeconds'
    >
  ) => {
    const cloned = cloneElements(tpl.elements).map((el) => ({
      ...el,
      id: makeElementId(el.type),
    }));
    setDesignName(tpl.name);
    setDesignType(tpl.designType);
    setLayoutPreset(tpl.layoutPreset);
    setDefaultDurationSeconds(tpl.defaultDurationSeconds);
    setEntryAnimation(tpl.entryAnimation);
    setExitAnimation(tpl.exitAnimation);
    setCanvasWidth(tpl.canvasWidth || 1920);
    setCanvasHeight(tpl.canvasHeight || 1080);
    setGroups(tpl.groups || []);
    if (typeof tpl.timelineEnabled === 'boolean') setTimelineEnabled(tpl.timelineEnabled);
    if (typeof tpl.totalDurationSeconds === 'number') {
      setTotalDurationSeconds(tpl.totalDurationSeconds);
    }
    commitElements(cloned);
    setSelectedIds(cloned[0] ? [cloned[0].id] : []);
    onNotifySuccess(`Loaded template "${tpl.name}".`);
  };

  const handleUploadAssetFile = async (rawFile: File, targetElementId?: string | null) => {
    try {
      setUploadingAsset(true);
      const { file, width, height } = await optimizeImageBeforeUpload(rawFile);
      const uploaded = await broadcastGraphicsService.uploadAsset({
        file,
        name: file.name.replace(/\.[^.]+$/, ''),
        assetType: targetElementId ? 'logo' : 'promo',
        scope,
        matchId,
        tournamentId: tournamentId || undefined,
        width: width || undefined,
        height: height || undefined,
      });
      await loadAssets();

      if (targetElementId) {
        updateElement(targetElementId, { src: uploaded.url, assetId: uploaded.id }, true);
        setPickerTargetElementId(null);
        onNotifySuccess('Image replaced while preserving element size & position.');
      } else {
        addElement('image', { src: uploaded.url, layerName: uploaded.name });
        onNotifySuccess(`Uploaded "${uploaded.name}" and added to canvas.`);
      }
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to upload image asset.'));
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleUploadCustomBackground = async (rawFile: File) => {
    try {
      setUploadingAsset(true);
      const { file, width, height } = await optimizeImageBeforeUpload(rawFile);
      const uploaded = await broadcastGraphicsService.uploadAsset({
        file,
        name: `Stage BG: ${file.name}`,
        assetType: 'background',
        scope,
        matchId,
        tournamentId: tournamentId || undefined,
        width: width || undefined,
        height: height || undefined,
      });
      setCustomBgUrl(uploaded.url);
      setPreviewBg('custom');
      await loadAssets();
      onNotifySuccess('Uploaded custom preview stage background frame.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to upload stage background frame.'));
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleReplaceExistingAssetFile = async (assetId: string, rawFile: File) => {
    try {
      setUploadingAsset(true);
      const { file, width, height } = await optimizeImageBeforeUpload(rawFile);
      const updated = await broadcastGraphicsService.replaceAsset(assetId, file, {
        width: width || undefined,
        height: height || undefined,
      });
      await loadAssets();
      const hasRef = elements.some((el) => el.assetId === assetId);
      if (hasRef) {
        commitElements(
          elements.map((el) => (el.assetId === assetId ? { ...el, src: updated.url } : el))
        );
      }
      onNotifySuccess('Asset image replaced seamlessly.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to replace asset.'));
    } finally {
      setUploadingAsset(false);
    }
  };

  const handleDeleteAsset = async () => {
    if (!deleteAssetTarget) return;
    try {
      setDeletingAsset(true);
      await broadcastGraphicsService.deleteAsset(deleteAssetTarget.id);
      setDeleteAssetTarget(null);
      await loadAssets();
      onNotifySuccess('Asset removed from library.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to delete asset.'));
    } finally {
      setDeletingAsset(false);
    }
  };

  const handleSaveDesign = async (mode: 'save' | 'save_new' | 'save_template') => {
    try {
      setSavingDesign(true);
      const thumbnailDataUrl = await generateDesignThumbnailDataUrl(
        elements,
        canvasWidth,
        canvasHeight
      );

      const payload = {
        name:
          mode === 'save_new'
            ? `${designName.trim() || 'Graphic'} (Copy)`
            : mode === 'save_template'
              ? `${designName.trim() || 'Graphic'} Template`
              : designName.trim() || 'Untitled Broadcast Graphic',
        designType,
        isTemplate: mode === 'save_template',
        scope,
        tournamentId: scope === 'global' ? null : tournamentId || null,
        matchId: scope === 'match' ? matchId : null,
        canvasWidth,
        canvasHeight,
        layoutPreset,
        elements,
        groups,
        entryAnimation,
        exitAnimation,
        defaultDurationSeconds,
        timelineEnabled,
        totalDurationSeconds,
        thumbnailDataUrl,
      };

      let saved: BroadcastAdDesignData;
      if (mode === 'save' && designId) {
        saved = await broadcastGraphicsService.updateDesign(designId, payload);
      } else {
        saved = await broadcastGraphicsService.saveDesign(payload);
        if (mode !== 'save_template') {
          setDesignId(saved.id);
        }
      }

      await onRefreshDesigns();
      onNotifySuccess(
        mode === 'save_template'
          ? `Saved "${saved.name}" as a reusable template.`
          : `Saved "${saved.name}" to Broadcast Ads Library.`
      );
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to save broadcast graphic.'));
    } finally {
      setSavingDesign(false);
    }
  };

  const handleApplyLive = async () => {
    try {
      setPushingLive(true);
      const nextState = await broadcastGraphicsService.applyLive(matchId, {
        designId,
        name: designName.trim() || 'Live Broadcast Graphic',
        canvasWidth,
        canvasHeight,
        elements,
        groups,
        entryAnimation,
        exitAnimation,
        durationSeconds: defaultDurationSeconds,
        overlapPolicy: graphicsState?.overlapPolicy,
      });
      onGraphicsStateChange(nextState);
      onNotifySuccess(
        `Applied "${designName}" LIVE to OBS Broadcast (${
          defaultDurationSeconds === 0 ? 'Permanent' : `${defaultDurationSeconds}s`
        }).`
      );
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to apply graphics live.'));
    } finally {
      setPushingLive(false);
    }
  };

  const handleHideLive = async () => {
    try {
      const next = await broadcastGraphicsService.hideLive(matchId);
      onGraphicsStateChange(next);
      onNotifySuccess('Hid latest live graphic from OBS broadcast.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to hide live graphic.'));
    }
  };

  const handleClearLive = async () => {
    try {
      const next = await broadcastGraphicsService.clearLive(matchId);
      onGraphicsStateChange(next);
      onNotifySuccess('Cleared all active graphics from OBS broadcast.');
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to clear live graphics.'));
    }
  };

  const handlePauseToggle = async () => {
    try {
      const next = await broadcastGraphicsService.pauseAnimations(
        matchId,
        !graphicsState?.animationsPaused
      );
      onGraphicsStateChange(next);
    } catch (err) {
      onNotifyError(extractApiError(err, 'Failed to pause/resume animations.'));
    }
  };

  const activeSlots = graphicsState?.activeSlots || [];

  const simulatedSlot: ActiveBroadcastGraphicSlot[] = useMemo(
    () => [
      {
        instanceId: `sim_${previewReplayKey}_${previewPhase}`,
        designId,
        name: designName,
        canvasWidth,
        canvasHeight,
        elements,
        groups,
        entryAnimation,
        exitAnimation,
        durationSeconds: 0,
        startedAt: new Date().toISOString(),
        expiresAt: null,
        visible: true,
        triggerSource: 'live_edit',
      },
    ],
    [
      previewReplayKey,
      previewPhase,
      designId,
      designName,
      canvasWidth,
      canvasHeight,
      elements,
      groups,
      entryAnimation,
      exitAnimation,
    ]
  );

  const customSavedTemplates = useMemo(
    () => designs.filter((d) => d.isTemplate),
    [designs]
  );

  const openIsolatedPreview = (phase: 'entry' | 'exit' | 'full') => {
    setPreviewPhase(phase);
    setPreviewReplayKey((k) => k + 1);
    setPreviewPlaying(phase === 'full');
    if (phase === 'full') setPlayheadMs(0);
    else setPlayheadMs(null);
    setLivePreviewOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* STUDIO TOP CONTROL BAR */}
      <section className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBackToLibrary}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Saved Ads Library</span>
            </button>

            <input
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder="Graphic Title (e.g. Hydration Partner Banner)"
              className="min-h-[36px] px-3 text-sm font-bold text-slate-900 border border-slate-300 rounded-lg bg-white w-60 sm:w-72"
            />

            <div className="flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap shrink-0">
              <span>OBS: {obsConnected ? 'Connected' : 'Standby'}</span>
              <span aria-hidden="true">·</span>
              <span>Bridge: {bridgeOnline ? 'Online' : 'Offline'}</span>
              <span aria-hidden="true">·</span>
              <span>Socket: {socketConnected ? 'Synced' : 'Reconnecting'}</span>
            </div>
          </div>

          {/* Undo/Redo + Copy/Paste + Isolated Preview + Save + Live Broadcast Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
              className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-35 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={handleRedo}
              title="Redo (Ctrl+Y)"
              className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-35 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>Redo</span>
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={handleCopySelected}
              title="Copy Selected (Ctrl+C)"
              className="min-h-[34px] px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-35 inline-flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={clipboardElements.length === 0}
              onClick={handlePasteClipboard}
              title="Paste (Ctrl+V)"
              className="min-h-[34px] px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-35 inline-flex items-center gap-1"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setTimelineEnabled((v) => !v)}
              title="Toggle Timeline Sequencing Mode (Simple Mode vs Timeline)"
              className={`min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                timelineEnabled
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{timelineEnabled ? 'Timeline: On' : 'Simple Mode'}</span>
            </button>

            <button
              type="button"
              onClick={() => openIsolatedPreview('full')}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Studio</span>
            </button>

            <button
              type="button"
              disabled={savingDesign || elements.length === 0}
              onClick={() => handleSaveDesign('save')}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingDesign ? 'Saving...' : designId ? 'Save Changes' : 'Save Ad'}</span>
            </button>

            {designId && (
              <button
                type="button"
                disabled={savingDesign}
                onClick={() => handleSaveDesign('save_new')}
                className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                <span>Save As New</span>
              </button>
            )}

            <button
              type="button"
              disabled={savingDesign || elements.length === 0}
              onClick={() => handleSaveDesign('save_template')}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Save Template</span>
            </button>

            <button
              type="button"
              disabled={pushingLive || elements.length === 0}
              onClick={handleApplyLive}
              className="min-h-[34px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white shadow-xs disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{pushingLive ? 'Applying...' : 'APPLY LIVE'}</span>
            </button>

            {activeSlots.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handlePauseToggle}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-amber-50 text-xs font-semibold text-amber-800 whitespace-nowrap shrink-0"
                >
                  {graphicsState?.animationsPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Live</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause Live</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleHideLive}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-bold text-white whitespace-nowrap shrink-0"
                >
                  <Square className="w-3 h-3" />
                  <span>Hide Live</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearLive}
                  className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear ({activeSlots.length})</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Design Metadata Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-slate-200 text-xs">
          <label className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Resolution</span>
            <select
              value={`${canvasWidth}x${canvasHeight}`}
              onChange={(e) => {
                const found = GRAPHICS_RESOLUTION_PRESETS.find((r) => r.id === e.target.value);
                if (found) {
                  setCanvasWidth(found.width);
                  setCanvasHeight(found.height);
                }
              }}
              className="w-full min-h-[32px] px-2 border border-slate-300 rounded-md bg-white font-semibold"
            >
              {GRAPHICS_RESOLUTION_PRESETS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">
              Layout Position Preset
            </span>
            <select
              value={layoutPreset}
              onChange={(e) => applyLayoutPreset(e.target.value as GraphicsLayoutPresetId)}
              className="w-full min-h-[32px] px-2 border border-slate-300 rounded-md bg-white font-semibold"
            >
              {GRAPHICS_LAYOUT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">
              Ad Category &amp; Scope
            </span>
            <div className="flex gap-1">
              <select
                value={designType}
                onChange={(e) => setDesignType(e.target.value as GraphicsDesignType)}
                className="flex-1 min-h-[32px] px-1.5 border border-slate-300 rounded-md bg-white font-semibold"
              >
                <option value="banner">Banner</option>
                <option value="lower_third">Lower Third</option>
                <option value="logo">Logo</option>
                <option value="qr">QR Promo</option>
                <option value="side_ad">Side Ad</option>
                <option value="full_banner">Full Bar</option>
                <option value="event_promo">Event Slate</option>
                <option value="custom">Custom</option>
              </select>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as GraphicsScope)}
                className="w-24 min-h-[32px] px-1.5 border border-slate-300 rounded-md bg-white font-semibold"
              >
                <option value="match">Match</option>
                <option value="tournament">Tournament</option>
                <option value="global">Global</option>
              </select>
            </div>
          </label>

          <label className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Default Duration</span>
            <div className="flex gap-1">
              <select
                value={
                  GRAPHICS_DURATION_PRESETS.some((p) => p.seconds === defaultDurationSeconds)
                    ? String(defaultDurationSeconds)
                    : 'custom'
                }
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setDefaultDurationSeconds(Number(e.target.value));
                  }
                }}
                className="flex-1 min-h-[32px] px-1.5 border border-slate-300 rounded-md bg-white font-semibold"
              >
                {GRAPHICS_DURATION_PRESETS.map((p) => (
                  <option key={p.seconds} value={String(p.seconds)}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
              <input
                type="number"
                min={0}
                max={3600}
                value={defaultDurationSeconds}
                onChange={(e) =>
                  setDefaultDurationSeconds(Math.max(0, Number(e.target.value) || 0))
                }
                title="Seconds (0 = Permanent)"
                className="w-14 min-h-[32px] px-1.5 font-mono tabular-nums border border-slate-300 rounded-md"
              />
            </div>
          </label>

          <label className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Slot Entry Motion</span>
            <select
              value={entryAnimation}
              onChange={(e) => setEntryAnimation(e.target.value as GraphicsAnimationStyle)}
              className="w-full min-h-[32px] px-2 border border-slate-300 rounded-md bg-white font-semibold"
            >
              {GRAPHICS_ENTRY_ANIMATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase text-slate-500">Slot Exit Motion</span>
            <select
              value={exitAnimation}
              onChange={(e) => setExitAnimation(e.target.value as GraphicsAnimationStyle)}
              className="w-full min-h-[32px] px-2 border border-slate-300 rounded-md bg-white font-semibold"
            >
              {GRAPHICS_EXIT_ANIMATIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* MAIN STUDIO WORKBENCH: LEFT TOOLS + CENTER CANVAS + RIGHT INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT TOOLBOX */}
        <aside className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg text-[11px] font-bold">
            {(
              [
                { id: 'elements', label: 'Add', icon: Plus },
                { id: 'templates', label: 'Presets', icon: LayoutTemplate },
                { id: 'assets', label: 'Assets', icon: ImageIcon },
                { id: 'layers', label: 'Layers', icon: Layers },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLeftTab(t.id)}
                  className={`py-1.5 px-1 rounded-md flex flex-col items-center gap-0.5 transition-colors ${
                    leftTab === t.id
                      ? 'bg-[#EA580C] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {leftTab === 'elements' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Insert Elements
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => addElement('text')}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Type className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Text</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('image')}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Image Ad</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('logo')}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Sponsor Logo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('qr')}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>QR Code</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('icon', { iconName: 'trophy' })}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Star className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Vector Icon</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('shape', { shapeKind: 'rounded_rect' })}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Shapes className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Card Box</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('shape', { shapeKind: 'ellipse' })}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Circle className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Circle / Oval</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('shape', { shapeKind: 'container' })}
                    className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Layers className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Container</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addElement('shape', { shapeKind: 'line' })}
                    className="col-span-2 min-h-[36px] flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 font-semibold text-slate-800"
                  >
                    <Square className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                    <span>Divider / Accent Line</span>
                  </button>
                </div>
              </div>

              {sponsors.length > 0 && (
                <div className="space-y-1.5 border-t border-slate-200 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Quick Insert Match Sponsors ({sponsors.length})
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {sponsors.map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          if (sp.logoUrl) {
                            addElement('logo', { src: sp.logoUrl, layerName: sp.name });
                          } else {
                            addElement('text', { layerName: sp.name });
                          }
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 text-left text-xs"
                      >
                        {sp.logoUrl ? (
                          <img
                            src={sp.logoUrl}
                            alt={sp.name}
                            className="w-7 h-7 rounded object-contain bg-slate-100 border border-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded bg-slate-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {sp.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-slate-900 truncate">{sp.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{sp.sponsorshipType}</p>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-[#EA580C] shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {leftTab === 'templates' && (
            <div className="space-y-2 max-h-[540px] overflow-y-auto pr-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Built-In Broadcast Templates ({BROADCAST_GRAPHICS_TEMPLATES.length})
              </p>
              {BROADCAST_GRAPHICS_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.templateId}
                  type="button"
                  onClick={() => loadTemplate(tpl)}
                  className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40 space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">{tpl.name}</span>
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                      {tpl.defaultDurationSeconds === 0 ? 'Perm' : `${tpl.defaultDurationSeconds}s`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">{tpl.description}</p>
                </button>
              ))}

              {customSavedTemplates.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 pt-2">
                    Custom Saved Templates ({customSavedTemplates.length})
                  </p>
                  {customSavedTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => loadTemplate(tpl)}
                      className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#EA580C] hover:bg-orange-50/40"
                    >
                      <span className="text-xs font-bold text-slate-900 block truncate">
                        {tpl.name}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {tpl.elements.length} layers · {tpl.canvasWidth}×{tpl.canvasHeight}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {leftTab === 'assets' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={uploadingAsset}
                  onClick={() => assetUploadRef.current?.click()}
                  className="flex-1 min-h-[34px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingAsset ? 'Optimizing & Uploading...' : 'Upload Image'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadAssets()}
                  className="min-h-[34px] px-2.5 rounded-lg border border-slate-300 hover:bg-slate-50"
                  title="Refresh Assets"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAssets ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <input
                ref={assetUploadRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadAssetFile(f);
                  e.target.value = '';
                }}
              />
              <input
                ref={replaceAssetInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  const id = replaceAssetIdRef.current;
                  if (f && id) handleReplaceExistingAssetFile(id, f);
                  replaceAssetIdRef.current = null;
                  e.target.value = '';
                }}
              />

              {assets.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-300 rounded-lg">
                  Upload sponsor logos, transparent banners, or promo artwork (auto-resized up to 1920px, max 5 MB).
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[440px] overflow-y-auto pr-0.5">
                  {assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-1.5 space-y-1.5"
                    >
                      <div className="aspect-video rounded bg-slate-900 overflow-hidden flex items-center justify-center">
                        <img
                          src={asset.url}
                          alt={asset.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="text-[11px] font-semibold text-slate-900 truncate" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            addElement('image', { src: asset.url, layerName: asset.name })
                          }
                          className="flex-1 py-1 rounded bg-slate-900 text-white text-[10px] font-bold hover:bg-slate-800"
                        >
                          Insert
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            replaceAssetIdRef.current = asset.id;
                            replaceAssetInputRef.current?.click();
                          }}
                          title="Replace asset image"
                          className="p-1 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteAssetTarget(asset)}
                          title="Delete asset"
                          className="p-1 rounded border border-slate-300 bg-white text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {leftTab === 'layers' && (
            <GraphicsLayersPanel
              elements={elements}
              groups={groups}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              onUpdateElements={(next) => commitElements(next)}
              onUpdateGroups={setGroups}
              onDuplicateIds={duplicateIds}
              onDeleteIds={deleteIds}
            />
          )}
        </aside>

        {/* CENTER INTERACTIVE STAGE */}
        <main className="lg:col-span-6">
          <GraphicsCanvas
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            elements={elements}
            groups={groups}
            selectedIds={selectedIds}
            matchId={matchId}
            tournamentId={tournamentId}
            previewBg={previewBg}
            customBgUrl={customBgUrl}
            showGrid={showGrid}
            gridSpacing={gridSpacing}
            snapToGrid={snapToGrid}
            showSafeMargins={showSafeMargins}
            showScoreboardSafeZone={showScoreboardSafeZone}
            zoomMode={zoomMode}
            timelinePlayheadMs={timelineEnabled ? playheadMs : null}
            onChangePreviewBg={setPreviewBg}
            onChangeShowGrid={setShowGrid}
            onChangeGridSpacing={setGridSpacing}
            onChangeSnapToGrid={setSnapToGrid}
            onChangeShowSafeMargins={setShowSafeMargins}
            onChangeShowScoreboardSafeZone={setShowScoreboardSafeZone}
            onChangeZoomMode={setZoomMode}
            onUploadCustomBg={handleUploadCustomBackground}
            onSelectElements={setSelectedIds}
            onElementsLiveChange={setElements}
            onElementsCommit={(next) => commitElements(next)}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onCopySelected={handleCopySelected}
            onPasteClipboard={handlePasteClipboard}
            onDuplicateSelected={() => duplicateIds(selectedIds)}
            onDeleteSelected={() => deleteIds(selectedIds)}
          />
        </main>

        {/* RIGHT INSPECTOR */}
        <aside className="lg:col-span-3">
          <GraphicsPropertiesPanel
            elements={elements}
            selectedIds={selectedIds}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            onUpdateElement={updateElement}
            onUpdateElementsBatch={(next) => commitElements(next)}
            onOpenAssetPickerForElement={(id) => setPickerTargetElementId(id)}
            onDeleteSelected={() => deleteIds(selectedIds)}
          />
        </aside>
      </div>

      {/* TOGGLEABLE BOTTOM TIMELINE DOCK (Hidden / Simple Mode by Default) */}
      {timelineEnabled && (
        <GraphicsTimelinePanel
          elements={elements}
          selectedIds={selectedIds}
          totalDurationSeconds={totalDurationSeconds}
          playheadMs={playheadMs}
          isPlaying={previewPlaying}
          onSelectElements={setSelectedIds}
          onChangeTotalDurationSeconds={setTotalDurationSeconds}
          onChangePlayheadMs={(ms) => {
            setPreviewPlaying(false);
            setPlayheadMs(ms);
          }}
          onTogglePlay={() => {
            if (playheadMs === null || playheadMs >= totalDurationSeconds * 1000) {
              setPlayheadMs(0);
            }
            setPreviewPlaying((p) => !p);
          }}
          onStopPlayback={() => {
            setPreviewPlaying(false);
            setPlayheadMs(null);
          }}
          onReplayPlayback={() => {
            setPlayheadMs(0);
            setPreviewPlaying(true);
          }}
          onElementsLiveChange={setElements}
          onElementsCommit={(next) => commitElements(next)}
        />
      )}

      {/* ASSET PICKER / IMAGE REPLACE MODAL */}
      <Modal
        open={Boolean(pickerTargetElementId)}
        onClose={() => setPickerTargetElementId(null)}
        title="Select or Upload Image Asset"
        subtitle="Replaces the image inside the selected graphic element while keeping its exact size, coordinates, and animation intact."
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#EA580C] hover:bg-orange-600 text-xs font-bold text-white cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingAsset ? 'Optimizing & Uploading...' : 'Upload New Image File'}</span>
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && pickerTargetElementId) {
                  handleUploadAssetFile(f, pickerTargetElementId);
                }
                e.target.value = '';
              }}
            />
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => {
                  if (pickerTargetElementId) {
                    updateElement(
                      pickerTargetElementId,
                      { src: asset.url, assetId: asset.id },
                      true
                    );
                    setPickerTargetElementId(null);
                  }
                }}
                className="p-2 rounded-lg border border-slate-200 hover:border-[#EA580C] text-left space-y-1 bg-slate-50"
              >
                <div className="aspect-video rounded bg-slate-900 overflow-hidden flex items-center justify-center">
                  <img src={asset.url} alt={asset.name} className="w-full h-full object-contain" />
                </div>
                <p className="text-xs font-semibold text-slate-900 truncate">{asset.name}</p>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* ISOLATED ANIMATION PREVIEW & 1920x1080 SIMULATION MODAL */}
      <Modal
        open={livePreviewOpen}
        onClose={() => {
          setPreviewPlaying(false);
          setLivePreviewOpen(false);
          setFullscreenStage(false);
        }}
        title={`Isolated Animation Preview · ${designName}`}
        subtitle="Preview entry, continuous loop, timeline sequence, and exit transitions safely before pushing live to OBS."
        maxWidthClass={fullscreenStage ? 'max-w-[96vw]' : 'max-w-5xl'}
      >
        <div className="space-y-4">
          <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 border border-slate-700">
            <ScaledGraphicsPreviewFrame
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              className="w-full h-full"
            >
              <ObsGraphicsLayer
                key={`${previewReplayKey}_${previewPhase}`}
                activeSlotsOverride={simulatedSlot}
                animationsPausedOverride={
                  previewPhase === 'full' ? !previewPlaying && playheadMs !== null : false
                }
                previewPhase={previewPhase}
                timelinePlayheadMs={timelineEnabled && previewPhase === 'full' ? playheadMs : null}
                canvasWidth={canvasWidth}
                canvasHeight={canvasHeight}
                matchId={matchId}
                tournamentId={tournamentId}
              />
            </ScaledGraphicsPreviewFrame>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => openIsolatedPreview('entry')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  previewPhase === 'entry'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                Preview Entry
              </button>
              <button
                type="button"
                onClick={() => openIsolatedPreview('full')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  previewPhase === 'full'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                Preview Full Motion
              </button>
              <button
                type="button"
                onClick={() => openIsolatedPreview('exit')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  previewPhase === 'exit'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                Preview Exit
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewReplayKey((k) => k + 1);
                  if (previewPhase === 'full') {
                    setPlayheadMs(0);
                    setPreviewPlaying(true);
                  }
                }}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Replay</span>
              </button>
              <button
                type="button"
                onClick={() => setFullscreenStage((v) => !v)}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                <Maximize className="w-3.5 h-3.5" />
                <span>{fullscreenStage ? 'Standard Size' : 'Expand 16:9'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewPlaying(false);
                  setLivePreviewOpen(false);
                }}
                className="min-h-[36px] px-4 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreviewPlaying(false);
                  setLivePreviewOpen(false);
                  handleApplyLive();
                }}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#EA580C] hover:bg-orange-600 rounded-lg"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>APPLY LIVE NOW</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Asset Delete Confirm */}
      <ConfirmDialog
        open={Boolean(deleteAssetTarget)}
        title={`Delete Asset "${deleteAssetTarget?.name || ''}"?`}
        message="This removes the uploaded media file from your Asset Library."
        confirmLabel="Delete Asset"
        variant="danger"
        loading={deletingAsset}
        onConfirm={handleDeleteAsset}
        onClose={() => setDeleteAssetTarget(null)}
      />
    </div>
  );
};

export default GraphicsStudioEditor;
