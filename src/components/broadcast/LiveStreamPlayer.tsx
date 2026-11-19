import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  PictureInPicture2,
  Play,
  Radio,
  RefreshCw,
  VideoOff,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { StreamingProvider } from '../../types/index.ts';
import { useLanguage } from '../../context/LanguageContext.tsx';

export type PlayerPlaybackSignal = 'ok' | 'buffering' | 'reconnecting' | 'error' | 'idle';

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
  videoDisabled?: boolean;
  onEnableVideo?: () => void;
  switchingBanner?: boolean;
  onPlaybackHealthChange?: (signal: PlayerPlaybackSignal) => void;
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
    videoDisabled = false,
    onEnableVideo,
    switchingBanner = false,
    onPlaybackHealthChange,
  }: LiveStreamPlayerProps) {
    const { t } = useLanguage();
    const [ytLoaded, setYtLoaded] = useState(false);
    const [posterUnlocked, setPosterUnlocked] = useState(!lowDataMode);
    const [mtxError, setMtxError] = useState<string | null>(null);
    const [mtxBuffering, setMtxBuffering] = useState(false);
    const [mtxReconnecting, setMtxReconnecting] = useState(false);
    const [mtxMode, setMtxMode] = useState<'hls' | 'webrtc'>('hls');
    const [mtxRetrySeed, setMtxRetrySeed] = useState(0);
    const [muted, setMuted] = useState(false);
    const [isOnline, setIsOnline] = useState(
      typeof navigator !== 'undefined' ? navigator.onLine : true
    );
    const [pipSupported, setPipSupported] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const autoRetryCountRef = useRef(0);
    const onHealthChangeRef = useRef(onPlaybackHealthChange);
    onHealthChangeRef.current = onPlaybackHealthChange;

    useEffect(() => {
      const onOnline = () => {
        setIsOnline(true);
        if (provider === 'mediamtx') {
          setMtxReconnecting(true);
          setMtxRetrySeed((s) => s + 1);
        }
      };
      const onOffline = () => setIsOnline(false);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }, [provider]);

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

    useEffect(() => {
      setPipSupported(
        Boolean(
          typeof document !== 'undefined' &&
            'pictureInPictureEnabled' in document &&
            document.pictureInPictureEnabled &&
            videoRef.current &&
            typeof videoRef.current.requestPictureInPicture === 'function'
        )
      );
    }, [provider, videoDisabled]);

    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.muted = muted;
      }
    }, [muted]);

    // MediaMTX HLS + WebRTC WHEP playback handler
    useEffect(() => {
      if (provider !== 'mediamtx' || videoDisabled) return;
      const videoEl = videoRef.current;
      if (!videoEl) return;

      setMtxError(null);
      setMtxBuffering(true);
      let hls: Hls | null = null;
      let pc: RTCPeerConnection | null = null;
      let retryTimer: number | null = null;
      let cancelled = false;

      const handlePlaying = () => {
        setMtxBuffering(false);
        setMtxReconnecting(false);
        autoRetryCountRef.current = 0;
      };
      const handleWaiting = () => setMtxBuffering(true);

      videoEl.addEventListener('playing', handlePlaying);
      videoEl.addEventListener('waiting', handleWaiting);

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
          setMtxBuffering(false);
          setMtxReconnecting(false);
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
          setMtxBuffering(false);
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
            setMtxBuffering(false);
            setMtxReconnecting(false);
            videoEl.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_ev, data) => {
            if (data.fatal) {
              setMtxBuffering(false);
              if (autoRetryCountRef.current < 2 && navigator.onLine) {
                autoRetryCountRef.current += 1;
                setMtxReconnecting(true);
                retryTimer = window.setTimeout(() => {
                  if (!cancelled) setMtxRetrySeed((s) => s + 1);
                }, 2500);
              } else {
                setMtxReconnecting(false);
                setMtxError(
                  'Custom MediaMTX stream is currently offline or waiting for broadcaster encoder.'
                );
              }
            }
          });
        } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = mediamtxPlaybackUrl;
          videoEl.play().catch(() => {});
          setMtxBuffering(false);
        } else {
          setMtxBuffering(false);
          setMtxError('This browser does not support HLS video playback.');
        }
      }

      startPlayback();

      return () => {
        cancelled = true;
        if (retryTimer) window.clearTimeout(retryTimer);
        videoEl.removeEventListener('playing', handlePlaying);
        videoEl.removeEventListener('waiting', handleWaiting);
        if (hls) {
          hls.destroy();
        }
        if (pc) {
          pc.close();
        }
      };
    }, [provider, mediamtxPlaybackUrl, mediamtxWebrtcUrl, mtxMode, mtxRetrySeed, videoDisabled]);

    // Emit unified playback health signal cleanly without re-creating playback connections
    useEffect(() => {
      if (videoDisabled) {
        onHealthChangeRef.current?.('idle');
        return;
      }
      if (!isOnline) {
        onHealthChangeRef.current?.('error');
        return;
      }
      if (provider === 'mediamtx') {
        if (mtxError) onHealthChangeRef.current?.('error');
        else if (mtxReconnecting) onHealthChangeRef.current?.('reconnecting');
        else if (mtxBuffering) onHealthChangeRef.current?.('buffering');
        else onHealthChangeRef.current?.('ok');
      } else {
        const validYt = Boolean(youtubeVideoId && VALID_YT_ID.test(youtubeVideoId));
        if (!validYt) onHealthChangeRef.current?.('error');
        else if (!posterUnlocked) onHealthChangeRef.current?.('idle');
        else if (!ytLoaded) onHealthChangeRef.current?.('buffering');
        else onHealthChangeRef.current?.('ok');
      }
    }, [
      videoDisabled,
      isOnline,
      provider,
      mtxError,
      mtxReconnecting,
      mtxBuffering,
      youtubeVideoId,
      posterUnlocked,
      ytLoaded,
    ]);

    async function handleTogglePip() {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (typeof videoEl.requestPictureInPicture === 'function') {
          await videoEl.requestPictureInPicture();
        }
      } catch {
        // Ignore PiP gesture failure
      }
    }

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

    if (videoDisabled) {
      return (
        <div className="relative w-full h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
          <VideoOff className="w-8 h-8 text-emerald-400 mb-2" />
          <p className="text-sm font-semibold">Score-Only Mode Enabled</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Video playback is paused to save mobile data while live scoreboard updates continue in real time.
          </p>
          {onEnableVideo && (
            <button
              type="button"
              onClick={onEnableVideo}
              className="mt-4 min-h-[40px] inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#EA580C] text-xs font-semibold text-white hover:bg-orange-600 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Video Stream</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="relative w-full h-full bg-slate-950 overflow-hidden">
        {!isOnline && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-red-950/95 border border-red-500/50 text-xs font-semibold text-red-200 shadow-lg">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Connection lost · Waiting to reconnect</span>
          </div>
        )}

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
              muted={muted}
              className="absolute inset-0 w-full h-full object-contain z-10"
            />
            {(mtxBuffering || mtxReconnecting) && !mtxError && (
              <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/60 text-white">
                <Loader2 className="w-6 h-6 animate-spin text-[#EA580C] mb-2" />
                <span className="text-xs font-semibold">
                  {mtxReconnecting ? 'Reconnecting stream...' : 'Buffering live stream...'}
                </span>
              </div>
            )}
            {mtxError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/92 text-center p-5 text-white">
                <Wifi className="w-7 h-7 text-amber-400 mb-2" />
                <p className="text-sm font-semibold">{mtxError}</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      autoRetryCountRef.current = 0;
                      setMtxRetrySeed((s) => s + 1);
                    }}
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

            {!mtxError && (
              <div className="absolute bottom-12 left-3 z-20 flex items-center gap-1.5">
                {mediamtxWebrtcUrl && (
                  <button
                    type="button"
                    onClick={() => setMtxMode((m) => (m === 'hls' ? 'webrtc' : 'hls'))}
                    className="px-2 py-1 rounded bg-slate-950/85 border border-white/15 text-[10px] font-semibold text-slate-200 hover:text-white"
                  >
                    Mode: {mtxMode === 'webrtc' ? 'WebRTC Ultra-Low' : 'HLS Adaptive'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  aria-label={muted ? 'Unmute video' : 'Mute video'}
                  className="p-1.5 rounded bg-slate-950/85 border border-white/15 text-slate-200 hover:text-white"
                >
                  {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                {pipSupported && (
                  <button
                    type="button"
                    onClick={handleTogglePip}
                    aria-label="Picture in picture"
                    className="p-1.5 rounded bg-slate-950/85 border border-white/15 text-slate-200 hover:text-white"
                  >
                    <PictureInPicture2 className="w-3.5 h-3.5" />
                  </button>
                )}
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
    prev.videoDisabled === next.videoDisabled &&
    prev.switchingBanner === next.switchingBanner
);
