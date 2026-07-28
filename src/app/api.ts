import type { DashboardPayload } from "../shared/contracts";

const DASHBOARD_ENDPOINT = "/api/v1/dashboard";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDashboardPayload(value: unknown): value is DashboardPayload {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }

  const route = value.route;
  if (!isRecord(route) || !isRecord(route.origin) || !isRecord(route.destination)) {
    return false;
  }

  return route.origin.crs === "WFJ"
    && route.destination.crs === "EUS"
    && isRecord(value.departures)
    && isRecord(value.weather);
}

export function createDashboardClient(fetcher: typeof fetch): {
  load(): Promise<DashboardPayload | null>;
} {
  let etag: string | null = null;

  return {
    async load(): Promise<DashboardPayload | null> {
      const headers: Record<string, string> = {};
      if (etag !== null) {
        headers["If-None-Match"] = etag;
      }
      const response = await fetcher(DASHBOARD_ENDPOINT, { headers });

      if (response.status === 304) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Dashboard request failed with status ${response.status}`);
      }

      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw new Error("Malformed dashboard payload");
      }
      if (!isDashboardPayload(value)) {
        throw new Error("Malformed dashboard payload");
      }

      etag = response.headers.get("ETag");
      return value;
    }
  };
}
