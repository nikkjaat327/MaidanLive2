import { extractYouTubeVideoId } from '../../src/utils/youtube.ts';

export interface YouTubeVerificationResult {
  validId: boolean;
  videoId: string | null;
  available: boolean;
  embeddable: boolean;
  title?: string;
  authorName?: string;
  statusCode?: number;
  message: string;
}

export async function verifyYouTubeVideoAvailability(rawInput: string): Promise<YouTubeVerificationResult> {
  const parsed = extractYouTubeVideoId(rawInput);
  if (!parsed.valid || !parsed.videoId) {
    return {
      validId: false,
      videoId: null,
      available: false,
      embeddable: false,
      message: parsed.error || 'Invalid YouTube Video ID or URL.',
    };
  }

  const videoId = parsed.videoId;
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
      const data = (await response.json()) as { title?: string; author_name?: string };
      return {
        validId: true,
        videoId,
        available: true,
        embeddable: true,
        title: data.title,
        authorName: data.author_name,
        statusCode: response.status,
        message: 'YouTube video is available and embeddable.',
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        validId: true,
        videoId,
        available: false,
        embeddable: false,
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
        statusCode: response.status,
        message: 'YouTube video was not found or is unavailable.',
      };
    }

    return {
      validId: true,
      videoId,
      available: false,
      embeddable: false,
      statusCode: response.status,
      message: `Unable to verify video availability (HTTP ${response.status}).`,
    };
  } catch {
    return {
      validId: true,
      videoId,
      available: false,
      embeddable: false,
      message: 'Could not reach YouTube to verify video availability.',
    };
  }
}
