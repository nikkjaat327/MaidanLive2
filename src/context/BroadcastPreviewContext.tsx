import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BroadcastOverlayConfig, LiveScoreData, LiveStreamData } from '../types/index.ts';
import { extractYouTubeVideoId } from '../utils/youtube.ts';

export interface YouTubeFloatingPreviewState {
  open: boolean;
  videoId: string;
  rawInput: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface OverlayFloatingPreviewPayload {
  matchId: string;
  stream: LiveStreamData;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig;
  brandLogoUrl?: string;
  serverClockOffsetMs?: number;
  sourceTabKey?: string;
}

export interface OverlayFloatingPreviewState {
  open: boolean;
  matchId: string;
  stream: LiveStreamData | null;
  score: LiveScoreData | null;
  config: BroadcastOverlayConfig | null;
  brandLogoUrl?: string;
  serverClockOffsetMs: number;
  sourceTabKey?: string;
  updatedAt: number;
}

export interface OverlayPreviewPosition {
  x: number;
  y: number;
}

interface BroadcastPreviewContextValue {
  youtubePreview: YouTubeFloatingPreviewState;
  openYouTubePreview: (input: string) => { valid: boolean; videoId: string | null; error?: string };
  setYouTubeInputDraft: (input: string) => void;
  updateYouTubeGeometry: (
    patch: Partial<Pick<YouTubeFloatingPreviewState, 'x' | 'y' | 'width' | 'height'>>
  ) => void;
  closeYouTubePreview: () => void;
  overlayPreview: OverlayFloatingPreviewState;
  overlayPreviewPosition: OverlayPreviewPosition | null;
  updateOverlayPreviewPosition: (pos: OverlayPreviewPosition) => void;
  resetOverlayPreviewPosition: () => void;
  triggerOverlayPreview: (payload: OverlayFloatingPreviewPayload) => void;
  closeOverlayPreview: () => void;
}

const YT_STORAGE_KEY = 'maidanlive_header_yt_floating_preview_v1';
const OVERLAY_POS_STORAGE_KEY = 'maidanlive_floating_overlay_preview_pos_v1';

function loadSavedOverlayPreviewPosition(): OverlayPreviewPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(OVERLAY_POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OverlayPreviewPosition>;
    if (typeof parsed.x === 'number' && Number.isFinite(parsed.x) && typeof parsed.y === 'number' && Number.isFinite(parsed.y)) {
      return { x: Math.round(parsed.x), y: Math.round(parsed.y) };
    }
    return null;
  } catch {
    return null;
  }
}

function getDefaultYouTubeState(): YouTubeFloatingPreviewState {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const width = Math.min(480, Math.max(300, Math.round(vw * 0.34)));
  const height = Math.round((width * 9) / 16) + 46;
  const base: YouTubeFloatingPreviewState = {
    open: false,
    videoId: '',
    rawInput: '',
    width,
    height,
    x: Math.max(16, vw - width - 20),
    y: Math.max(72, vh - height - 24),
  };
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(YT_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<YouTubeFloatingPreviewState>;
    const w = typeof parsed.width === 'number' ? Math.max(280, Math.min(vw - 24, parsed.width)) : width;
    const h = typeof parsed.height === 'number' ? Math.max(195, Math.min(vh - 24, parsed.height)) : height;
    const x =
      typeof parsed.x === 'number' ? Math.max(8, Math.min(vw - w - 8, parsed.x)) : base.x;
    const y =
      typeof parsed.y === 'number' ? Math.max(8, Math.min(vh - h - 8, parsed.y)) : base.y;
    const videoId = typeof parsed.videoId === 'string' ? parsed.videoId : '';
    return {
      open: Boolean(parsed.open && videoId),
      videoId,
      rawInput: typeof parsed.rawInput === 'string' ? parsed.rawInput : '',
      width: w,
      height: h,
      x,
      y,
    };
  } catch {
    return base;
  }
}

const DEFAULT_OVERLAY_PREVIEW_STATE: OverlayFloatingPreviewState = {
  open: false,
  matchId: '',
  stream: null,
  score: null,
  config: null,
  brandLogoUrl: '',
  serverClockOffsetMs: 0,
  sourceTabKey: undefined,
  updatedAt: 0,
};

const BroadcastPreviewContext = createContext<BroadcastPreviewContextValue | null>(null);

export const TAB_SWITCH_EVENT = 'maidanlive:tab-changed';

export function dispatchTabChangedEvent(tabKey?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TAB_SWITCH_EVENT, { detail: { tabKey } }));
}

export function BroadcastPreviewProvider({ children }: { children: ReactNode }) {
  const [youtubePreview, setYoutubePreview] = useState<YouTubeFloatingPreviewState>(() =>
    getDefaultYouTubeState()
  );
  const [overlayPreview, setOverlayPreview] = useState<OverlayFloatingPreviewState>(
    DEFAULT_OVERLAY_PREVIEW_STATE
  );
  const [overlayPreviewPosition, setOverlayPreviewPosition] = useState<OverlayPreviewPosition | null>(
    () => loadSavedOverlayPreviewPosition()
  );
  const overlayPreviewRef = useRef(overlayPreview);
  overlayPreviewRef.current = overlayPreview;

  useEffect(() => {
    try {
      localStorage.setItem(YT_STORAGE_KEY, JSON.stringify(youtubePreview));
    } catch {
      // Ignore storage quota / private mode
    }
  }, [youtubePreview]);

  const updateOverlayPreviewPosition = useCallback((pos: OverlayPreviewPosition) => {
    const clean = { x: Math.round(pos.x), y: Math.round(pos.y) };
    setOverlayPreviewPosition(clean);
    try {
      localStorage.setItem(OVERLAY_POS_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const resetOverlayPreviewPosition = useCallback(() => {
    setOverlayPreviewPosition(null);
    try {
      localStorage.removeItem(OVERLAY_POS_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const setYouTubeInputDraft = useCallback((rawInput: string) => {
    setYoutubePreview((prev) => ({ ...prev, rawInput }));
  }, []);

  const openYouTubePreview = useCallback((input: string) => {
    const trimmed = (input || '').trim();
    const parsed = extractYouTubeVideoId(trimmed);
    if (!parsed.valid || !parsed.videoId) {
      setYoutubePreview((prev) => ({ ...prev, rawInput: input }));
      return { valid: false, videoId: null, error: parsed.error };
    }
    setYoutubePreview((prev) => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const w = Math.max(280, Math.min(vw - 16, prev.width || 480));
      const h = Math.max(195, Math.min(vh - 16, prev.height || 316));
      const x = Math.max(8, Math.min(vw - w - 8, prev.x || vw - w - 20));
      const y = Math.max(8, Math.min(vh - h - 8, prev.y || 76));
      return {
        open: true,
        videoId: parsed.videoId!,
        rawInput: trimmed,
        width: w,
        height: h,
        x,
        y,
      };
    });
    return { valid: true, videoId: parsed.videoId };
  }, []);

  const updateYouTubeGeometry = useCallback(
    (patch: Partial<Pick<YouTubeFloatingPreviewState, 'x' | 'y' | 'width' | 'height'>>) => {
      setYoutubePreview((prev) => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
        const width = Math.round(
          Math.max(280, Math.min(vw - 16, patch.width ?? prev.width))
        );
        const height = Math.round(
          Math.max(195, Math.min(vh - 16, patch.height ?? prev.height))
        );
        const x = Math.round(Math.max(8, Math.min(vw - width - 8, patch.x ?? prev.x)));
        const y = Math.round(Math.max(8, Math.min(vh - height - 8, patch.y ?? prev.y)));
        return { ...prev, width, height, x, y };
      });
    },
    []
  );

  const closeYouTubePreview = useCallback(() => {
    setYoutubePreview((prev) => ({ ...prev, open: false }));
  }, []);

  const triggerOverlayPreview = useCallback((payload: OverlayFloatingPreviewPayload) => {
    setOverlayPreview({
      open: true,
      matchId: payload.matchId,
      stream: payload.stream,
      score: payload.score,
      config: payload.config,
      brandLogoUrl: payload.brandLogoUrl,
      serverClockOffsetMs: payload.serverClockOffsetMs ?? 0,
      sourceTabKey: payload.sourceTabKey,
      updatedAt: Date.now(),
    });
  }, []);

  const closeOverlayPreview = useCallback(() => {
    setOverlayPreview((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  // Automatically close floating scoreboard/logo preview when switching tabs via custom event or tab click
  useEffect(() => {
    const onTabSwitch = (ev: Event) => {
      const nextKey = (ev as CustomEvent<{ tabKey?: string }>).detail?.tabKey;
      const cur = overlayPreviewRef.current;
      if (!cur.open) return;
      if (!nextKey || !cur.sourceTabKey || nextKey !== cur.sourceTabKey) {
        setOverlayPreview((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
    };

    const onDocumentClick = (ev: MouseEvent) => {
      if (!overlayPreviewRef.current.open) return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-floating-overlay-preview="true"]')) return;
      const tabEl = target.closest('[role="tab"], [data-tab-trigger="true"]');
      if (tabEl) {
        setOverlayPreview((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
    };

    window.addEventListener(TAB_SWITCH_EVENT, onTabSwitch);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener(TAB_SWITCH_EVENT, onTabSwitch);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, []);

  return (
    <BroadcastPreviewContext.Provider
      value={{
        youtubePreview,
        openYouTubePreview,
        setYouTubeInputDraft,
        updateYouTubeGeometry,
        closeYouTubePreview,
        overlayPreview,
        overlayPreviewPosition,
        updateOverlayPreviewPosition,
        resetOverlayPreviewPosition,
        triggerOverlayPreview,
        closeOverlayPreview,
      }}
    >
      {children}
    </BroadcastPreviewContext.Provider>
  );
}

export function useBroadcastPreview() {
  const ctx = useContext(BroadcastPreviewContext);
  if (!ctx) {
    throw new Error('useBroadcastPreview must be used within BroadcastPreviewProvider');
  }
  return ctx;
}
