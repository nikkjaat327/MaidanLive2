import { getPublicWebOrigin } from './appOrigin.ts';

export function getPublicAppOrigin(): string {
  return getPublicWebOrigin();
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
