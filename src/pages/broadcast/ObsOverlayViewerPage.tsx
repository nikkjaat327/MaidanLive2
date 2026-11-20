import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useObsOverlay } from '../../hooks/useObsOverlay.ts';
import { useAuth } from '../../hooks/useAuth.ts';
import { authService } from '../../services/auth/authService.ts';
import { applyOverlayQueryParams } from '../../utils/overlayConfig.ts';
import { HotstarBroadcastOverlay } from '../../components/obs/HotstarBroadcastOverlay.tsx';
import { DraggableObsScorePanel } from '../../components/obs/DraggableObsScorePanel.tsx';

export function ObsOverlayViewerPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const location = useLocation();
  const { adminUser, adminLoading } = useAuth();
  const { stream, score, setScore, overlayConfig, loading, refetch } = useObsOverlay(matchId);

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const obsForced = searchParams.get('obs') === '1' || searchParams.get('controls') === '0';
  const isAdminAuthenticated =
    !adminLoading && Boolean(adminUser) && Boolean(authService.getAdminToken());
  const canShowAdminControls = isAdminAuthenticated && !obsForced;

  const [controlsOpen, setControlsOpen] = useState<boolean>(true);

  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: typeof window !== 'undefined' ? window.innerWidth : 1920,
    h: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  // Enforce true transparent canvas and zero scrollbars/padding on OBS Browser Source route
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-obs-overlay-view', 'true');
    return () => {
      root.removeAttribute('data-obs-overlay-view');
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      setViewport({
        w: window.innerWidth || 1920,
        h: window.innerHeight || 1080,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const effectiveConfig = useMemo(
    () => applyOverlayQueryParams(overlayConfig, location.search),
    [overlayConfig, location.search]
  );

  const scale = useMemo(() => {
    const sw = viewport.w / 1920;
    const sh = viewport.h / 1080;
    return Math.max(0.2, Math.min(sw, sh));
  }, [viewport]);

  if (loading || !stream) {
    return <div className="w-screen h-screen bg-transparent overflow-hidden" />;
  }

  const launcherCorner =
    effectiveConfig.position === 'bottom-right' ? 'bottom-4 left-4' : 'bottom-4 right-4';

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden relative flex items-center justify-center">
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="shrink-0 relative bg-transparent overflow-hidden"
      >
        <HotstarBroadcastOverlay stream={stream} score={score} config={effectiveConfig} />
      </div>

      {canShowAdminControls && (
        controlsOpen ? (
          <DraggableObsScorePanel
            stream={stream}
            score={score}
            overlayPosition={effectiveConfig.position}
            onScoreChange={setScore}
            onRefresh={refetch}
            onClose={() => setControlsOpen(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setControlsOpen(true)}
            className={`fixed ${launcherCorner} z-50 pointer-events-auto min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-700/90 bg-slate-950/90 hover:bg-slate-900 text-xs font-semibold text-white shadow-xl backdrop-blur-md whitespace-nowrap`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Admin Score Controls</span>
          </button>
        )
      )}
    </div>
  );
}
