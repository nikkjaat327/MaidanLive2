export function sanitizeText(value: unknown, maxLen = 300): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeImageUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/src/assets/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function isValidGoogleMapsUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    const validHosts = [
      'maps.google.com',
      'www.google.com',
      'google.com',
      'maps.app.goo.gl',
      'goo.gl',
      'maps.google.co.in',
      'www.google.co.in',
    ];
    if (validHosts.includes(host) || /^maps\.google\.[a-z.]+$/.test(host) || /^(www\.)?google\.[a-z.]+$/.test(host)) {
      if (host.includes('google.') && !host.startsWith('maps.')) {
        return parsed.pathname.includes('/maps') || parsed.searchParams.has('q') || parsed.searchParams.has('query');
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function sanitizeGoogleMapsUrl(value: unknown): { valid: boolean; url: string } {
  if (typeof value !== 'string') return { valid: true, url: '' };
  const trimmed = value.trim().slice(0, 600);
  if (!trimmed) return { valid: true, url: '' };
  if (!isValidGoogleMapsUrl(trimmed)) {
    return { valid: false, url: '' };
  }
  return { valid: true, url: trimmed };
}
