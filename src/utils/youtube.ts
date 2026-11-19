const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export interface YouTubeParseResult {
  valid: boolean;
  videoId: string | null;
  embedUrl: string | null;
  watchUrl: string | null;
  thumbnailUrl: string | null;
  error?: string;
}

export function extractYouTubeVideoId(rawInput: string): YouTubeParseResult {
  const input = (rawInput || '').trim();

  if (!input) {
    return {
      valid: false,
      videoId: null,
      embedUrl: null,
      watchUrl: null,
      thumbnailUrl: null,
      error: 'Please enter a YouTube Video ID or URL.',
    };
  }

  // Case 1: Direct 11-character Video ID
  if (YOUTUBE_ID_REGEX.test(input)) {
    return buildValidResult(input);
  }

  // Case 2: URL parsing (enforce https/http only, reject javascript:/data:/unrelated domains)
  let normalized = input;
  if (!/^https?:\/\//i.test(normalized)) {
    if (/^(www\.)?(youtube\.com|m\.youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    } else {
      return {
        valid: false,
        videoId: null,
        embedUrl: null,
        watchUrl: null,
        thumbnailUrl: null,
        error: 'Invalid YouTube Video ID or URL. Only youtube.com and youtu.be links are allowed.',
      };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      valid: false,
      videoId: null,
      embedUrl: null,
      watchUrl: null,
      thumbnailUrl: null,
      error: 'Malformed URL. Please enter a valid YouTube URL or 11-character Video ID.',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      videoId: null,
      embedUrl: null,
      watchUrl: null,
      thumbnailUrl: null,
      error: 'Unsupported URL protocol.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(host)) {
    return {
      valid: false,
      videoId: null,
      embedUrl: null,
      watchUrl: null,
      thumbnailUrl: null,
      error: `Domain "${host}" is not a valid YouTube host.`,
    };
  }

  let candidateId: string | null = null;

  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const segments = parsed.pathname.split('/').filter(Boolean);
    candidateId = segments[0] || null;
  } else {
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] === 'watch') {
      candidateId = parsed.searchParams.get('v');
    } else if (segments[0] === 'live' || segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'v') {
      candidateId = segments[1] || null;
    } else if (parsed.searchParams.get('v')) {
      candidateId = parsed.searchParams.get('v');
    }
  }

  if (!candidateId || !YOUTUBE_ID_REGEX.test(candidateId)) {
    return {
      valid: false,
      videoId: null,
      embedUrl: null,
      watchUrl: null,
      thumbnailUrl: null,
      error: 'Could not extract a valid 11-character YouTube Video ID from that URL.',
    };
  }

  return buildValidResult(candidateId);
}

function buildValidResult(videoId: string): YouTubeParseResult {
  return {
    valid: true,
    videoId,
    embedUrl: `https://www.youtube.com/embed/${videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}
