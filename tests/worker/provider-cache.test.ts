import { describe, expect, it } from "vitest";
import { loadWithFallback, type CacheStore } from "../../src/worker/provider-cache";

class MemoryCacheStore implements CacheStore {
  private readonly responses = new Map<string, Response>();
  writes = 0;

  async match(request: Request): Promise<Response | undefined> {
    return this.responses.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.responses.set(request.url, response.clone());
    this.writes += 1;
  }
}

const railOptions = {
  key: "rail",
  freshForMs: 30_000,
  staleForMs: 5 * 60_000
};

const weatherOptions = {
  key: "weather",
  freshForMs: 10 * 60_000,
  staleForMs: 30 * 60_000
};

async function save<T>(
  cache: CacheStore,
  options: { key: string; freshForMs: number; staleForMs: number },
  now: Date,
  value: T
) {
  return loadWithFallback({ cache, now, load: async () => value, ...options });
}

describe("provider cache", () => {
  it("loads and stores a missing value", async () => {
    const cache = new MemoryCacheStore();
    const now = new Date("2026-07-28T12:00:00.000Z");
    let loads = 0;

    const result = await loadWithFallback({
      cache,
      now,
      load: async () => {
        loads += 1;
        return ["12:12"];
      },
      ...railOptions
    });

    expect(result).toEqual({ value: ["12:12"], updatedAt: now.toISOString(), stale: false });
    expect(loads).toBe(1);
    expect(cache.writes).toBe(1);
    const cached = await cache.match(new Request("https://dashboard-cache.invalid/rail"));
    expect(cached?.headers.get("cache-control")).toBe("max-age=300");
  });

  it("uses a 29-second-old rail value without refreshing upstream", async () => {
    const cache = new MemoryCacheStore();
    const updatedAt = new Date("2026-07-28T12:00:00.000Z");
    await save(cache, railOptions, updatedAt, ["12:12"]);
    let loads = 0;

    const result = await loadWithFallback({
      cache,
      now: new Date("2026-07-28T12:00:29.000Z"),
      load: async () => {
        loads += 1;
        return ["12:13"];
      },
      ...railOptions
    });

    expect(result).toEqual({ value: ["12:12"], updatedAt: updatedAt.toISOString(), stale: false });
    expect(loads).toBe(0);
  });

  it("refreshes a 31-second-old rail value", async () => {
    const cache = new MemoryCacheStore();
    await save(cache, railOptions, new Date("2026-07-28T12:00:00.000Z"), ["12:12"]);
    const now = new Date("2026-07-28T12:00:31.000Z");

    const result = await loadWithFallback({
      cache,
      now,
      load: async () => ["12:13"],
      ...railOptions
    });

    expect(result).toEqual({ value: ["12:13"], updatedAt: now.toISOString(), stale: false });
  });

  it("returns a 31-second-old rail value as stale when its refresh fails", async () => {
    const cache = new MemoryCacheStore();
    const updatedAt = new Date("2026-07-28T12:00:00.000Z");
    await save(cache, railOptions, updatedAt, ["12:12"]);

    const result = await loadWithFallback({
      cache,
      now: new Date("2026-07-28T12:00:31.000Z"),
      load: async () => Promise.reject(new Error("rail unavailable")),
      ...railOptions
    });

    expect(result).toEqual({ value: ["12:12"], updatedAt: updatedAt.toISOString(), stale: true });
  });

  it("does not return a rail value older than five minutes when refresh fails", async () => {
    const cache = new MemoryCacheStore();
    await save(cache, railOptions, new Date("2026-07-28T12:00:00.000Z"), ["12:12"]);

    await expect(loadWithFallback({
      cache,
      now: new Date("2026-07-28T12:05:00.001Z"),
      load: async () => Promise.reject(new Error("rail unavailable")),
      ...railOptions
    })).rejects.toThrow("rail unavailable");
  });

  it("uses a nine-minute-old weather value without refreshing upstream", async () => {
    const cache = new MemoryCacheStore();
    const updatedAt = new Date("2026-07-28T12:00:00.000Z");
    await save(cache, weatherOptions, updatedAt, { temperatureC: 21.4 });
    let loads = 0;

    const result = await loadWithFallback({
      cache,
      now: new Date("2026-07-28T12:09:00.000Z"),
      load: async () => {
        loads += 1;
        return { temperatureC: 22 };
      },
      ...weatherOptions
    });

    expect(result).toEqual({
      value: { temperatureC: 21.4 },
      updatedAt: updatedAt.toISOString(),
      stale: false
    });
    expect(loads).toBe(0);
  });

  it("does not return weather older than 30 minutes when refresh fails", async () => {
    const cache = new MemoryCacheStore();
    await save(cache, weatherOptions, new Date("2026-07-28T12:00:00.000Z"), { temperatureC: 21.4 });

    await expect(loadWithFallback({
      cache,
      now: new Date("2026-07-28T12:30:00.001Z"),
      load: async () => Promise.reject(new Error("weather unavailable")),
      ...weatherOptions
    })).rejects.toThrow("weather unavailable");
  });

  it("replaces malformed cached JSON with a fresh provider value", async () => {
    const cache = new MemoryCacheStore();
    await cache.put(
      new Request("https://dashboard-cache.invalid/weather"),
      new Response("not json")
    );
    const now = new Date("2026-07-28T12:00:00.000Z");

    const result = await loadWithFallback({
      cache,
      now,
      load: async () => ({ temperatureC: 21.4 }),
      ...weatherOptions
    });

    expect(result).toEqual({
      value: { temperatureC: 21.4 },
      updatedAt: now.toISOString(),
      stale: false
    });
  });

  it("replaces a cache record with a parseable but non-canonical timestamp", async () => {
    const cache = new MemoryCacheStore();
    await cache.put(
      new Request("https://dashboard-cache.invalid/weather"),
      new Response(JSON.stringify({
        value: { temperatureC: 20 },
        updatedAt: "2026-07-28T12:00:00+00:00"
      }))
    );
    const now = new Date("2026-07-28T12:00:01.000Z");
    let loads = 0;

    const result = await loadWithFallback({
      cache,
      now,
      load: async () => {
        loads += 1;
        return { temperatureC: 21.4 };
      },
      ...weatherOptions
    });

    expect(result).toEqual({
      value: { temperatureC: 21.4 },
      updatedAt: now.toISOString(),
      stale: false
    });
    expect(loads).toBe(1);
  });

  it("does not return a future-dated cache record when refresh fails", async () => {
    const cache = new MemoryCacheStore();
    await cache.put(
      new Request("https://dashboard-cache.invalid/weather"),
      new Response(JSON.stringify({
        value: { temperatureC: 20 },
        updatedAt: "2026-07-28T12:01:00.000Z"
      }))
    );

    await expect(loadWithFallback({
      cache,
      now: new Date("2026-07-28T12:00:00.000Z"),
      load: async () => Promise.reject(new Error("weather unavailable")),
      ...weatherOptions
    })).rejects.toThrow("weather unavailable");
  });
});
