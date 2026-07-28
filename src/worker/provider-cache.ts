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
  attemptedAt: string;
  updatedAt: string | null;
  value?: T;
}

const inFlightByCache = new WeakMap<
  CacheStore,
  Map<string, Promise<CachedResult<unknown>>>
>();

function cacheRequest(key: string): Request {
  return new Request(`https://dashboard-cache.invalid/${encodeURIComponent(key)}`);
}

function isTimestamp(value: unknown, now: Date): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value &&
    timestamp <= now.getTime();
}

function cacheRecord<T>(value: unknown, now: Date): CacheRecord<T> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const updatedAt = candidate.updatedAt;
  if (!isTimestamp(updatedAt, now) || !Object.hasOwn(candidate, "value")) {
    if (
      updatedAt !== null ||
      !isTimestamp(candidate.attemptedAt, now) ||
      Object.hasOwn(candidate, "value")
    ) {
      return undefined;
    }
    return { attemptedAt: candidate.attemptedAt, updatedAt: null };
  }

  const attemptedAt = candidate.attemptedAt ?? updatedAt;
  if (
    !isTimestamp(attemptedAt, now) ||
    Date.parse(attemptedAt) < Date.parse(updatedAt)
  ) {
    return undefined;
  }

  return {
    attemptedAt,
    updatedAt,
    value: candidate.value as T
  };
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
    return cacheRecord<T>(record, now);
  } catch {
    return undefined;
  }
}

async function writeRecord<T>(
  cache: CacheStore,
  request: Request,
  record: CacheRecord<T>,
  cacheForMs: number
): Promise<void> {
  await cache.put(request, new Response(JSON.stringify(record), {
    headers: {
      "cache-control": `max-age=${Math.floor(cacheForMs / 1000)}`,
      "content-type": "application/json"
    }
  }));
}

function hasValue<T>(
  record: CacheRecord<T>
): record is CacheRecord<T> & { updatedAt: string; value: T } {
  return record.updatedAt !== null && Object.hasOwn(record, "value");
}

async function loadOnce<T>(options: {
  cache: CacheStore;
  key: string;
  now: Date;
  freshForMs: number;
  staleForMs: number;
  load: () => Promise<T>;
}): Promise<CachedResult<T>> {
  const startedAt = Date.now();
  const request = cacheRequest(options.key);
  const record = await readRecord<T>(options.cache, request, options.now);
  const valueAge = record && hasValue(record)
    ? options.now.getTime() - Date.parse(record.updatedAt)
    : undefined;
  const attemptAge = record
    ? options.now.getTime() - Date.parse(record.attemptedAt)
    : undefined;

  if (record && attemptAge !== undefined && attemptAge < options.freshForMs) {
    if (hasValue(record) && valueAge !== undefined && valueAge <= options.staleForMs) {
      return {
        value: record.value,
        updatedAt: record.updatedAt,
        stale: valueAge >= options.freshForMs
      };
    }
    throw new Error("Provider refresh is temporarily rate limited");
  }

  let value: T;
  try {
    value = await options.load();
  } catch (error) {
    await writeRecord(
      options.cache,
      request,
      {
        attemptedAt: options.now.toISOString(),
        updatedAt: record && hasValue(record) ? record.updatedAt : null,
        ...(record && hasValue(record) ? { value: record.value } : {})
      },
      Math.max(options.freshForMs, options.staleForMs)
    );
    const completedAt = options.now.getTime() + Math.max(0, Date.now() - startedAt);
    if (
      record &&
      hasValue(record) &&
      completedAt - Date.parse(record.updatedAt) <= options.staleForMs
    ) {
      return {
        value: record.value,
        updatedAt: record.updatedAt,
        stale: true
      };
    }
    throw error;
  }

  const updatedAt = options.now.toISOString();
  await writeRecord(
    options.cache,
    request,
    { value, updatedAt, attemptedAt: updatedAt },
    Math.max(options.freshForMs, options.staleForMs)
  );
  return { value, updatedAt, stale: false };
}

export function loadWithFallback<T>(options: {
  cache: CacheStore;
  key: string;
  now: Date;
  freshForMs: number;
  staleForMs: number;
  load: () => Promise<T>;
}): Promise<CachedResult<T>> {
  let inFlight = inFlightByCache.get(options.cache);
  if (inFlight === undefined) {
    inFlight = new Map();
    inFlightByCache.set(options.cache, inFlight);
  }

  const pending = inFlight.get(options.key);
  if (pending !== undefined) {
    return pending as Promise<CachedResult<T>>;
  }

  const result = loadOnce(options);
  inFlight.set(options.key, result as Promise<CachedResult<unknown>>);
  void result.then(
    () => inFlight?.delete(options.key),
    () => inFlight?.delete(options.key)
  );
  return result;
}
