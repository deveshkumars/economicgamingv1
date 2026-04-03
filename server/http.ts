/**
 * HTTP client with retry logic, mirroring the Python http_client.py
 */

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson<T = unknown>(
  url: string,
  params?: Record<string, string>,
  headers?: Record<string, string>,
  retries = 2,
  timeout = 15000,
): Promise<T> {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    }
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(u.toString(), {
        headers: { Accept: 'application/json', ...headers },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (res.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const text = await res.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch (e) {
      clearTimeout(timer);
      lastError = e as Error;
      if ((e as Error).name === 'AbortError' && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      if (attempt < retries && !(e instanceof SyntaxError)) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
    }
  }
  throw lastError || new Error('Request failed');
}

export async function postJson<T = unknown>(
  url: string,
  body: unknown,
  params?: Record<string, string>,
  headers?: Record<string, string>,
  retries = 2,
  timeout = 15000,
): Promise<T> {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
    }
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(u.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const text = await res.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch (e) {
      clearTimeout(timer);
      lastError = e as Error;
      if (attempt < retries && !(e instanceof SyntaxError)) {
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }
    }
  }
  throw lastError || new Error('Request failed');
}

export async function fetchText(
  url: string,
  params?: Record<string, string>,
  headers?: Record<string, string>,
  timeout = 30000,
): Promise<string> {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) u.searchParams.set(k, v);
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(u.toString(), { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}
