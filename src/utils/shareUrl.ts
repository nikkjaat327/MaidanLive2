const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function getPublicAppOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (
        (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        !LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase())
      ) {
        return parsed.origin.replace(/\/+$/, '');
      }
    } catch {
      // Fall through to window.location.origin
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }

  return 'https://maidanlive.app';
}

export function buildPageUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicAppOrigin()}${cleanPath}`;
}

export function buildTournamentUrl(id: string): string {
  return buildPageUrl(`/tournaments/${encodeURIComponent(id)}`);
}

export function buildMatchUrl(id: string, isReplay = false): string {
  const base = buildPageUrl(`/live/${encodeURIComponent(id)}`);
  return isReplay ? `${base}?mode=replay` : base;
}

export function buildTeamUrl(id: string): string {
  return buildPageUrl(`/teams/${encodeURIComponent(id)}`);
}

export function buildPlayerUrl(id: string): string {
  return buildPageUrl(`/players/${encodeURIComponent(id)}`);
}
