import { extractYouTubeVideoId } from '../../src/utils/youtube.ts';

export interface YouTubeStreamVerification {
  validId: boolean;
  videoId: string | null;
  available: boolean;
  embeddable: boolean;
  processingStatus: 'READY' | 'PROCESSING' | 'UNAVAILABLE' | 'UNKNOWN';
  liveBroadcastStatus: 'LIVE' | 'UPCOMING' | 'VOD' | 'UNKNOWN';
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
  embedUrl?: string;
  statusCode?: number;
  message: string;
}

export async function verifyYouTubeStream(rawInput: string): Promise<YouTubeStreamVerification> {
  const parsed = extractYouTubeVideoId(rawInput);
  if (!parsed.valid || !parsed.videoId) {
    return {
      validId: false,
      videoId: null,
      available: false,
      embeddable: false,
      processingStatus: 'UNAVAILABLE',
      liveBroadcastStatus: 'UNKNOWN',
      message: parsed.error || 'Invalid YouTube Video ID or URL.',
    };
  }

  const videoId = parsed.videoId;
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(oembedUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };

      // Best-effort watch metadata probe to distinguish live vs VOD without guessing
      let liveBroadcastStatus: 'LIVE' | 'UPCOMING' | 'VOD' | 'UNKNOWN' = 'UNKNOWN';
      try {
        const watchCtrl = new AbortController();
        const watchTimer = setTimeout(() => watchCtrl.abort(), 3500);
        const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          method: 'GET',
          signal: watchCtrl.signal,
          headers: { 'User-Agent': 'MaidanLiveVerifier/1.0' },
        });
        clearTimeout(watchTimer);
        if (watchRes.ok) {
          const html = await watchRes.text();
          if (html.includes('"isLiveNow":true') || html.includes('"isLive":true')) {
            liveBroadcastStatus = 'LIVE';
          } else if (html.includes('"isUpcoming":true')) {
            liveBroadcastStatus = 'UPCOMING';
          } else if (html.includes('"videoId":"' + videoId + '"')) {
            liveBroadcastStatus = 'VOD';
          }
        }
      } catch {
        // Keep UNKNOWN if watch HTML cannot be probed
      }

      return {
        validId: true,
        videoId,
        available: true,
        embeddable: true,
        processingStatus: 'READY',
        liveBroadcastStatus,
        title: data.title,
        authorName: data.author_name,
        thumbnailUrl: data.thumbnail_url || thumbnailUrl,
        embedUrl,
        statusCode: response.status,
        message:
          liveBroadcastStatus === 'LIVE'
            ? 'YouTube live broadcast verified and embeddable.'
            : 'YouTube video is available and embeddable.',
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        validId: true,
        videoId,
        available: false,
        embeddable: false,
        processingStatus: 'UNAVAILABLE',
        liveBroadcastStatus: 'UNKNOWN',
        thumbnailUrl,
        embedUrl,
        statusCode: response.status,
        message: 'Video owner has disabled embedding or the video is private.',
      };
    }

    if (response.status === 404 || response.status === 400) {
      return {
        validId: true,
        videoId,
        available: false,
        embeddable: false,
        processingStatus: 'UNAVAILABLE',
        liveBroadcastStatus: 'UNKNOWN',
        thumbnailUrl,
        embedUrl,
        statusCode: response.status,
        message: 'YouTube video was not found or is unavailable.',
      };
    }

    return {
      validId: true,
      videoId,
      available: false,
      embeddable: false,
      processingStatus: 'UNKNOWN',
      liveBroadcastStatus: 'UNKNOWN',
      thumbnailUrl,
      embedUrl,
      statusCode: response.status,
      message: `Unable to verify video availability (HTTP ${response.status}).`,
    };
  } catch {
    return {
      validId: true,
      videoId,
      available: false,
      embeddable: false,
      processingStatus: 'UNKNOWN',
      liveBroadcastStatus: 'UNKNOWN',
      thumbnailUrl,
      embedUrl,
      message: 'Could not reach YouTube to verify video availability.',
    };
  }
}
