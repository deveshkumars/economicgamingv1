import crypto from 'crypto';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export function cacheKey(namespace: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const raw = `${namespace}:${JSON.stringify(sorted)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function getCached(namespace: string, params: Record<string, string> = {}): unknown | null {
  const key = cacheKey(namespace, params);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(
  value: unknown,
  namespace: string,
  ttl: number,
  params: Record<string, string> = {},
): void {
  // Don't cache error-like values
  if (value && typeof value === 'object' && 'error' in (value as Record<string, unknown>)) return;
  const key = cacheKey(namespace, params);
  // Cache empty arrays with short TTL to allow retry
  const effectiveTtl = Array.isArray(value) && value.length === 0 ? Math.min(ttl, 300) : ttl;
  store.set(key, { value, expiresAt: Date.now() + effectiveTtl * 1000 });
}
