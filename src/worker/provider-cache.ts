export interface CacheStore {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface CachedResult<T> {
  value: T;
  updatedAt: string;
  stale: boolean;
}

interface CacheRecord<T> {
  value: T;
  updatedAt: string;
}

function cacheRequest(key: string): Request {
  return new Request(`https://dashboard-cache.invalid/${encodeURIComponent(key)}`);
}

function isCacheRecord<T>(value: unknown, now: Date): value is CacheRecord<T> {
  if (typeof value !== "object" || value === null || !Object.hasOwn(value, "value")) {
    return false;
  }

  const updatedAt = (value as CacheRecord<T>).updatedAt;
  if (typeof updatedAt !== "string") return false;

  const timestamp = Date.parse(updatedAt);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === updatedAt &&
    timestamp <= now.getTime();
}

async function readRecord<T>(
  cache: CacheStore,
  request: Request,
  now: Date
): Promise<CacheRecord<T> | undefined> {
  const response = await cache.match(request);
  if (!response) return undefined;

  try {
    const record: unknown = await response.json();
    return isCacheRecord<T>(record, now) ? record : undefined;
  } catch {
    return undefined;
  }
}

export async function loadWithFallback<T>(options: {
  cache: CacheStore;
  key: string;
  now: Date;
  freshForMs: number;
  staleForMs: number;
  load: () => Promise<T>;
}): Promise<CachedResult<T>> {
  const request = cacheRequest(options.key);
  const record = await readRecord<T>(options.cache, request, options.now);
  const age = record ? options.now.getTime() - Date.parse(record.updatedAt) : undefined;

  if (record && age !== undefined && age < options.freshForMs) {
    return { ...record, stale: false };
  }

  let value: T;
  try {
    value = await options.load();
  } catch (error) {
    if (record && age !== undefined && age <= options.staleForMs) {
      return { ...record, stale: true };
    }
    throw error;
  }

  const updatedAt = options.now.toISOString();
  await options.cache.put(request, new Response(JSON.stringify({ value, updatedAt }), {
    headers: {
      "cache-control": `max-age=${Math.floor(options.staleForMs / 1000)}`,
      "content-type": "application/json"
    }
  }));
  return { value, updatedAt, stale: false };
}
