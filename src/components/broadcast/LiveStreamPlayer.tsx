import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Wifi,
} from 'lucide-react';
import { StreamingProvider } from '../../types/index.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';

interface LiveStreamPlayerProps {
  provider: StreamingProvider;
  youtubeVideoId: string;
  mediamtxPlaybackUrl?: string;
  mediamtxWebrtcUrl?: string;
  title?: string;
  autoplay?: boolean;
  startSeconds?: number | null;
  jumpKey?: number;
  lowDataMode?: boolean;
  switchingBanner?: boolean;
}

const VALID_YT_ID = /^[a-zA-Z0-9_-]{11}$/;

export const LiveStreamPlayer = React.memo(
  function LiveStreamPlayer({
    provider,
    youtubeVideoId,
    mediamtxPlaybackUrl = '',
    mediamtxWebrtcUrl = '',
    title = 'MaidanLive Broadcast',
    autoplay = false,
    startSeconds = null,
    jumpKey = 0,
    lowDataMode = false,
    switchingBanner = false,
  }: LiveStreamPlayerProps) {
    const { t } = useLanguage();
    const [ytLoaded, setYtLoaded] = useState(false);
    const [posterUnlocked, setPosterUnlocked] = useState(!lowDataMode);
    const [mtxError, setMtxError] = useState<string | null>(null);
    const [mtxMode, setMtxMode] = useState<'hls' | 'webrtc'>('hls');
    const [mtxRetrySeed, setMtxRetrySeed] = useState(0);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
      if (!lowDataMode) {
        setPosterUnlocked(true);
      } else {
        setPosterUnlocked(false);
      }
    }, [lowDataMode]);

    // Reset YouTube loaded spinner only when videoId / start jump changes
    useEffect(() => {
      setYtLoaded(false);
    }, [youtubeVideoId, startSeconds, jumpKey]);

    // MediaMTX HLS + WebRTC WHEP playback handler
    useEffect(() => {
      if (provider !== 'mediamtx') return;
      const videoEl = videoRef.current;
      if (!videoEl) return;

      setMtxError(null);
      let hls: Hls | null = null;
      let pc: RTCPeerConnection | null = null;
      let cancelled = false;

      async function startWebrtc() {
        if (!mediamtxWebrtcUrl || typeof RTCPeerConnection === 'undefined') {
          return false;
        }
        try {
          pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          });
          pc.addTransceiver('video', { direction: 'recvonly' });
          pc.addTransceiver('audio', { direction: 'recvonly' });
          pc.ontrack = (ev) => {
            if (videoEl && ev.streams[0]) {
              videoEl.srcObject = ev.streams[0];
              videoEl.play().catch(() => {});
            }
          };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          const res = await fetch(mediamtxWebrtcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp' },
            body: offer.sdp || '',
          });
          if (!res.ok) throw new Error('WebRTC WHEP endpoint unavailable');
          const answerSdp = await res.text();
          if (!cancelled && pc) {
            await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
          }
          return true;
        } catch {
          if (pc) {
            pc.close();
            pc = null;
          }
          return false;
        }
      }

      async function startPlayback() {
        if (!videoEl) return;
        videoEl.srcObject = null;

        if (mtxMode === 'webrtc' && mediamtxWebrtcUrl) {
          const ok = await startWebrtc();
          if (ok || cancelled) return;
          // Fall back automatically to HLS if WebRTC fails
          setMtxMode('hls');
        }

        if (!mediamtxPlaybackUrl) {
          setMtxError('MediaMTX playback URL is not configured yet.');
          return;
        }

        if (Hls.isSupported()) {
          hls = new Hls({
            lowLatencyMode: true,
            backBufferLength: 30,
          });
          hls.loadSource(mediamtxPlaybackUrl);
          hls.attachMedia(videoEl);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoEl.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_ev, data) => {
            if (data.fatal) {
              setMtxError(
                'Custom MediaMTX stream is currently offline or waiting for broadcaster encoder.'
              );
            }
          });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = mediamtxPlaybackUrl;
          videoEl.play().catch(() => {});
        } else {
          setMtxError('This browser does not support HLS video playback.');
        }
      }

      startPlayback();

      return () => {
        cancelled = true;
        if (hls) {
          hls.destroy();
        }
        if (pc) {
          pc.close();
        }
      };
    }, [provider, mediamtxPlaybackUrl, mediamtxWebrtcUrl, mtxMode, mtxRetrySeed]);

    const startParam =
      typeof startSeconds === 'number' && Number.isFinite(startSeconds) && startSeconds >= 0
        ? `&start=${Math.floor(startSeconds)}`
        : '';
    const shouldAutoplay = autoplay || startParam !== '';
    const validYouTube = Boolean(youtubeVideoId && VALID_YT_ID.test(youtubeVideoId));
    const embedSrc = validYouTube
      ? `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1${
          shouldAutoplay ? '&autoplay=1' : ''
        }${startParam}`
      : '';
    const iframeKey = `yt-${youtubeVideoId}-${startSeconds ?? 'live'}-${jumpKey}`;

    return (
      <div className="relative w-full h-full bg-slate-950 overflow-hidden">
        {provider === 'youtube' ? (
          !validYouTube ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-white">
              <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
              <p className="text-sm font-semibold">YouTube video stream unavailable</p>
              <p className="text-xs text-slate-400 mt-1">
                A valid 11-character YouTube Video ID is required to play this broadcast.
              </p>
            </div>
          ) : !posterUnlocked ? (
            <button
              type="button"
              onClick={() => setPosterUnlocked(true)}
              className="absolute inset-0 w-full h-full group flex flex-col items-center justify-center bg-slate-950 text-white cursor-pointer"
            >
              <img
                src={`https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg`}
                alt={title}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-65 transition-opacity"
              />
              <div className="relative z-10 flex flex-col items-center gap-2.5 px-4">
                <span className="h-14 w-14 rounded-full bg-[#EA580C] text-white flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                </span>
                <span className="px-3 py-1 rounded-lg bg-slate-950/90 border border-white/15 text-xs font-semibold">
                  {t('broadcast.lowDataWatch')}
                </span>
              </div>
            </button>
          ) : (
            <>
              {!ytLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-300 z-0">
                  <Loader2 className="w-6 h-6 animate-spin text-[#EA580C] mb-2" />
                  <span className="text-xs font-medium">Loading live YouTube feed...</span>
                </div>
              )}
              <iframe
                key={iframeKey}
                src={embedSrc}
                title={title}
                onLoad={() => setYtLoaded(true)}
                className="absolute inset-0 w-full h-full border-0 z-10"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </>
          )
        ) : (
          <div className="relative w-full h-full bg-black">
            <video
              ref={videoRef}
              controls
              playsInline
              autoPlay
              className="absolute inset-0 w-full h-full object-contain z-10"
            />
            {mtxError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/92 text-center p-5 text-white">
                <Wifi className="w-7 h-7 text-amber-400 mb-2" />
                <p className="text-sm font-semibold">{mtxError}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMtxRetrySeed((s) => s + 1)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EA580C] text-xs font-semibold text-white hover:bg-orange-700"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Stream</span>
                  </button>
                  {validYouTube && (
                    <a
                      href={`https://www.youtube.com/watch?v=${youtubeVideoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/10 text-xs font-semibold text-white hover:bg-white/20"
                    >
                      <span>Open YouTube Backup</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {mediamtxWebrtcUrl && !mtxError && (
              <div className="absolute bottom-12 left-3 z-20 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMtxMode((m) => (m === 'hls' ? 'webrtc' : 'hls'))}
                  className="px-2 py-1 rounded bg-slate-950/85 border border-white/15 text-[10px] font-semibold text-slate-200 hover:text-white"
                >
                  Mode: {mtxMode === 'webrtc' ? 'WebRTC Ultra-Low' : 'HLS Adaptive'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live provider switching notification */}
        {switchingBanner && (
          <div className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-950/90 border border-orange-500/60 text-xs font-semibold text-orange-300 shadow-xl">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>{t('broadcast.switching')}</span>
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.provider === next.provider &&
    prev.youtubeVideoId === next.youtubeVideoId &&
    prev.mediamtxPlaybackUrl === next.mediamtxPlaybackUrl &&
    prev.mediamtxWebrtcUrl === next.mediamtxWebrtcUrl &&
    prev.title === next.title &&
    prev.autoplay === next.autoplay &&
    prev.startSeconds === next.startSeconds &&
    prev.jumpKey === next.jumpKey &&
    prev.lowDataMode === next.lowDataMode &&
    prev.switchingBanner === next.switchingBanner
);
