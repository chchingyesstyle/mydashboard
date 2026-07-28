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

function isCacheRecord<T>(value: unknown): value is CacheRecord<T> {
  return typeof value === "object" && value !== null &&
    Object.hasOwn(value, "value") &&
    typeof (value as CacheRecord<T>).updatedAt === "string" &&
    !Number.isNaN(Date.parse((value as CacheRecord<T>).updatedAt));
}

async function readRecord<T>(cache: CacheStore, request: Request): Promise<CacheRecord<T> | undefined> {
  const response = await cache.match(request);
  if (!response) return undefined;

  try {
    const record: unknown = await response.json();
    return isCacheRecord<T>(record) ? record : undefined;
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
  const record = await readRecord<T>(options.cache, request);
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
