export function getEntityId(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const record = item as Record<string, unknown>;
  const raw = record.id ?? record._id ?? '';
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof (raw as { toString?: () => string }).toString === 'function') {
    const str = (raw as { toString: () => string }).toString();
    return str === '[object Object]' ? '' : str.trim();
  }
  return '';
}

export function resolveTeamId(teamRef: unknown): string {
  if (!teamRef) return '';
  if (typeof teamRef === 'string') return teamRef.trim();
  if (typeof teamRef === 'object') {
    return getEntityId(teamRef);
  }
  return '';
}

export function dedupeEntitiesById<T>(items: T[]): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seenIds = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = getEntityId(item);
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const record = item as Record<string, unknown>;
      if (record.id !== id) {
        result.push({ ...item, id } as T);
        continue;
      }
    }
    result.push(item);
  }

  return result;
}
