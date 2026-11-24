import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Monitor, Smartphone, Sparkles, X } from 'lucide-react';
import { useBroadcastPreview } from '../../context/BroadcastPreviewContext.tsx';
import { HotstarBroadcastOverlay } from '../obs/HotstarBroadcastOverlay.tsx';
import { BroadcastBrandLogoBug } from '../obs/ObsBrandMark.tsx';
import { BroadcastSponsorAdBanner } from '../obs/BroadcastSponsorAdBanner.tsx';
import stadiumHeroImg from '../../assets/images/stadium_floodlight_hero_1795011087164.jpg';

export function FloatingScoreboardLogoPreview() {
  const location = useLocation();
  const { overlayPreview, closeOverlayPreview } = useBroadcastPreview();
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const prevRouteRef = useRef(`${location.pathname}${location.search}`);

  // Close automatically when user switches route or URL tab (?tab=...)
  useEffect(() => {
    const nextRoute = `${location.pathname}${location.search}`;
    if (prevRouteRef.current !== nextRoute) {
      prevRouteRef.current = nextRoute;
      if (overlayPreview.open) {
        closeOverlayPreview();
      }
    }
  }, [location.pathname, location.search, overlayPreview.open, closeOverlayPreview]);

  const isIsolatedRoute =
    location.pathname.startsWith('/broadcast/overlay/view') ||
    location.pathname.startsWith('/camera-connect');

  if (isIsolatedRoute || !overlayPreview.open || !overlayPreview.stream || !overlayPreview.config) {
    return null;
  }

  const isPortrait = orientation === 'portrait';
  const canvasW = isPortrait ? 1080 : 1920;
  const canvasH = isPortrait ? 1920 : 1080;
  const boxW = isPortrait ? 240 : 420;
  const boxH = Math.round((boxW * canvasH) / canvasW);
  const scale = boxW / canvasW;

  return (
    <aside
      data-floating-overlay-preview="true"
      aria-label="Live Scoreboard and Brand Logo Floating Preview"
      className="fixed bottom-4 right-4 z-[90] w-auto max-w-[calc(100vw-24px)] rounded-2xl border border-purple-500/40 bg-slate-950/95 text-white shadow-[0_24px_60px_rgba(0,0,0,0.85),0_0_24px_rgba(168,85,247,0.22)] backdrop-blur-md overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-white truncate">
              Live Style &amp; Logo Preview
            </p>
            <p className="text-[10px] font-mono text-slate-400 truncate">
              {overlayPreview.config.style} · {Math.round(overlayPreview.config.customScale * 100)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-0.5">
            <button
              type="button"
              onClick={() => setOrientation('landscape')}
              title="16:9 Landscape Preview"
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                !isPortrait ? 'bg-[#EA580C] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-2.5 h-2.5" />
              <span>16:9</span>
            </button>
            <button
              type="button"
              onClick={() => setOrientation('portrait')}
              title="9:16 Portrait Preview"
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                isPortrait ? 'bg-[#EA580C] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-2.5 h-2.5" />
              <span>9:16</span>
            </button>
          </div>

          <button
            type="button"
            onClick={closeOverlayPreview}
            aria-label="Close floating style preview"
            title="Close Preview"
            className="p-1 rounded-lg bg-slate-800 hover:bg-red-600 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scaled Live Broadcast Canvas */}
      <div className="p-2.5 bg-slate-950 flex justify-center">
        <div
          style={{ width: boxW, height: boxH }}
          className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shrink-0"
        >
          <img
            src={stadiumHeroImg}
            alt="Broadcast stage backdrop"
            className="absolute inset-0 w-full h-full object-cover brightness-75"
          />
          <div
            style={{
              width: canvasW,
              height: canvasH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className="absolute top-0 left-0 pointer-events-none"
          >
            <BroadcastBrandLogoBug
              config={overlayPreview.config}
              serverLogoUrl={overlayPreview.brandLogoUrl}
              variant="canvas"
              zIndex={24}
            />
            <BroadcastSponsorAdBanner
              config={overlayPreview.config}
              variant="canvas"
              zIndex={26}
            />
            <HotstarBroadcastOverlay
              stream={overlayPreview.stream}
              score={overlayPreview.score}
              config={overlayPreview.config}
              isPortrait={isPortrait}
              serverClockOffsetMs={overlayPreview.serverClockOffsetMs}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
