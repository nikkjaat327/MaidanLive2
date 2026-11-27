import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MediaLayoutState,
  resolveMediaLayoutMode,
} from '../utils/mediaPlayerUtils.ts';

export const EXIT_FULLSCREEN_EVENT = 'maidanlive:exit-fullscreen';

function canUseNativeFullscreen(el: HTMLElement | null): boolean {
  if (!el || typeof document === 'undefined') return false;
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  const node = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const enabled =
    typeof document.fullscreenEnabled === 'boolean'
      ? document.fullscreenEnabled
      : Boolean(doc.webkitFullscreenEnabled);
  return (
    enabled &&
    (typeof el.requestFullscreen === 'function' ||
      typeof node.webkitRequestFullscreen === 'function')
  );
}

async function tryLockLandscapeOrientation(): Promise<void> {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return;
  try {
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (mode: string) => Promise<void> })
      | undefined;
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Expected on desktop browsers and iOS Safari where orientation lock is restricted
  }
}

function tryUnlockOrientation(): void {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return;
  try {
    const orientation = screen.orientation as
      | (ScreenOrientation & { unlock?: () => void })
      | undefined;
    if (orientation && typeof orientation.unlock === 'function') {
      orientation.unlock();
    }
  } catch {
    // Safe no-op when unlock is unsupported
  }
}

export interface UseImmersivePlayerOptions {
  autoHideMs?: number;
  initiallyVisible?: boolean;
  onFullscreenFallbackNotice?: (notice: string | null) => void;
}

export function useImmersivePlayer(options: UseImmersivePlayerOptions = {}) {
  const {
    autoHideMs = 3000,
    initiallyVisible = true,
    onFullscreenFallbackNotice,
  } = options;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  const lockHintTimerRef = useRef<number | null>(null);
  const autoHidePausedRef = useRef(false);

  const [controlsVisible, setControlsVisible] = useState(initiallyVisible);
  const [touchLocked, setTouchLocked] = useState(false);
  const [lockedHintVisible, setLockedHintVisible] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isExpandedFallback, setIsExpandedFallback] = useState(false);

  const [dimensions, setDimensions] = useState<{
    cw: number;
    ch: number;
    vw: number;
    vh: number;
  }>(() => ({
    cw: 0,
    ch: 0,
    vw: typeof window !== 'undefined' ? window.innerWidth : 1280,
    vh: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));

  const isFullscreenActive = isNativeFullscreen || isExpandedFallback;

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const scheduleAutoHide = useCallback(() => {
    clearAutoHideTimer();
    if (autoHidePausedRef.current) return;
    autoHideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, autoHideMs);
  }, [autoHideMs, clearAutoHideTimer]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    scheduleAutoHide();
  }, [scheduleAutoHide]);

  const hideControls = useCallback(() => {
    clearAutoHideTimer();
    setControlsVisible(false);
  }, [clearAutoHideTimer]);

  const toggleControls = useCallback(() => {
    setControlsVisible((prev) => {
      if (prev) {
        clearAutoHideTimer();
        return false;
      }
      scheduleAutoHide();
      return true;
    });
  }, [clearAutoHideTimer, scheduleAutoHide]);

  const notifyUserInteraction = useCallback(() => {
    if (controlsVisible) {
      scheduleAutoHide();
    }
  }, [controlsVisible, scheduleAutoHide]);

  const pauseAutoHide = useCallback(() => {
    autoHidePausedRef.current = true;
    clearAutoHideTimer();
  }, [clearAutoHideTimer]);

  const resumeAutoHide = useCallback(() => {
    autoHidePausedRef.current = false;
    if (controlsVisible) {
      scheduleAutoHide();
    }
  }, [controlsVisible, scheduleAutoHide]);

  const showLockedHintBriefly = useCallback(() => {
    setLockedHintVisible(true);
    if (lockHintTimerRef.current !== null) {
      window.clearTimeout(lockHintTimerRef.current);
    }
    lockHintTimerRef.current = window.setTimeout(() => {
      setLockedHintVisible(false);
    }, 2400);
  }, []);

  const toggleTouchLock = useCallback(() => {
    setTouchLocked((prev) => {
      const next = !prev;
      if (next) {
        clearAutoHideTimer();
        setControlsVisible(false);
        showLockedHintBriefly();
      } else {
        setLockedHintVisible(false);
        setControlsVisible(true);
        scheduleAutoHide();
      }
      return next;
    });
  }, [clearAutoHideTimer, scheduleAutoHide, showLockedHintBriefly]);

  // Initial mount: show briefly for autoHideMs then hide cleanly
  useEffect(() => {
    if (initiallyVisible) {
      scheduleAutoHide();
    }
    return () => {
      clearAutoHideTimer();
      if (lockHintTimerRef.current !== null) {
        window.clearTimeout(lockHintTimerRef.current);
      }
    };
  }, [initiallyVisible, scheduleAutoHide, clearAutoHideTimer]);

  // Observe both container dimensions and viewport/orientation changes (zero iframe remount)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      const el = stageRef.current;
      const rect = el?.getBoundingClientRect();
      setDimensions({
        cw: rect ? Math.round(rect.width) : 0,
        ch: rect ? Math.round(rect.height) : 0,
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
    };

    syncViewport();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && stageRef.current) {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        setDimensions({
          cw: Math.round(width),
          ch: Math.round(height),
          vw: window.innerWidth,
          vh: window.innerHeight,
        });
      });
      ro.observe(stageRef.current);
    }

    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
    };
  }, []);

  // Sync html data attribute for global app-nav hiding + scroll lock during fullscreen
  useEffect(() => {
    if (isFullscreenActive) {
      document.documentElement.dataset.broadcastFullscreen = 'true';
    } else {
      delete document.documentElement.dataset.broadcastFullscreen;
    }
    return () => {
      delete document.documentElement.dataset.broadcastFullscreen;
    };
  }, [isFullscreenActive]);

  // Listen to native fullscreenchange & Android Capacitor hardware back exit event
  useEffect(() => {
    const onFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const fsEl = document.fullscreenElement || doc.webkitFullscreenElement || null;
      const active = Boolean(fsEl && fsEl === stageRef.current);
      setIsNativeFullscreen(active);
      if (!active) {
        tryUnlockOrientation();
      }
      // Show controls briefly after entering/exiting fullscreen
      showControlsTemporarily();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, [showControlsTemporarily]);

  const exitFullscreen = useCallback(async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (isNativeFullscreen || doc.fullscreenElement || doc.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } catch {
        setIsNativeFullscreen(false);
      }
    }
    setIsExpandedFallback(false);
    tryUnlockOrientation();
    onFullscreenFallbackNotice?.(null);
    showControlsTemporarily();
  }, [isNativeFullscreen, onFullscreenFallbackNotice, showControlsTemporarily]);

  const enterFullscreen = useCallback(async () => {
    const el = stageRef.current as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void })
      | null;

    if (canUseNativeFullscreen(el) && el) {
      try {
        onFullscreenFallbackNotice?.(null);
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        await tryLockLandscapeOrientation();
        showControlsTemporarily();
        return;
      } catch {
        // Fall through cleanly to Expanded Theater Fallback
      }
    }

    setIsExpandedFallback(true);
    await tryLockLandscapeOrientation();
    onFullscreenFallbackNotice?.(
      'Expanded Broadcast View active (native fullscreen/orientation lock is limited in this browser; rotate device if needed).'
    );
    showControlsTemporarily();
  }, [onFullscreenFallbackNotice, showControlsTemporarily]);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreenActive) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [isFullscreenActive, exitFullscreen, enterFullscreen]);

  // Escape key + Capacitor Android back button exit event handling
  useEffect(() => {
    if (!isFullscreenActive) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpandedFallback) {
        exitFullscreen();
      }
    };
    const onBackEvent = () => {
      exitFullscreen();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(EXIT_FULLSCREEN_EVENT, onBackEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(EXIT_FULLSCREEN_EVENT, onBackEvent);
    };
  }, [isFullscreenActive, isExpandedFallback, exitFullscreen]);

  const layout: MediaLayoutState = useMemo(
    () =>
      resolveMediaLayoutMode({
        containerWidth: dimensions.cw,
        containerHeight: dimensions.ch,
        viewportWidth: dimensions.vw,
        viewportHeight: dimensions.vh,
        isFullscreen: isFullscreenActive,
      }),
    [dimensions.cw, dimensions.ch, dimensions.vw, dimensions.vh, isFullscreenActive]
  );

  return {
    stageRef,
    controlsVisible,
    touchLocked,
    lockedHintVisible,
    isNativeFullscreen,
    isExpandedFallback,
    isFullscreenActive,
    stageWidth: dimensions.cw,
    stageHeight: dimensions.ch,
    layout,
    showControlsTemporarily,
    hideControls,
    toggleControls,
    notifyUserInteraction,
    pauseAutoHide,
    resumeAutoHide,
    toggleTouchLock,
    showLockedHintBriefly,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
