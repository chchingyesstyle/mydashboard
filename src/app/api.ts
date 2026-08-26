import {
  ROUTES,
  type DashboardPayload,
  type RouteId
} from "../shared/contracts";

const DASHBOARD_ENDPOINT = "/api/v1/dashboard";

export interface DashboardLoad {
  payload: DashboardPayload;
  changed: boolean;
}

interface RouteState {
  etag: string | null;
  payload: DashboardPayload | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDashboardPayload(
  value: unknown,
  routeId: RouteId
): value is DashboardPayload {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }

  const route = value.route;
  if (!isRecord(route) || !isRecord(route.origin) || !isRecord(route.destination)) {
    return false;
  }

  const expected = ROUTES[routeId];
  return route.origin.name === expected.origin.name
    && route.origin.crs === expected.origin.crs
    && route.destination.name === expected.destination.name
    && route.destination.crs === expected.destination.crs
    && isRecord(value.departures)
    && isRecord(value.weather);
}

export function createDashboardClient(fetcher: typeof fetch): {
  load(routeId: RouteId): Promise<DashboardLoad>;
} {
  const stateByRoute: Record<RouteId, RouteState> = {
    "WFJ-EUS": { etag: null, payload: null },
    "EUS-WFJ": { etag: null, payload: null },
    "WFJ-ALL": { etag: null, payload: null }
  };

  return {
    async load(routeId: RouteId): Promise<DashboardLoad> {
      const state = stateByRoute[routeId];
      const headers: Record<string, string> = {};
      if (state.etag !== null) {
        headers["If-None-Match"] = state.etag;
      }
      const response = await fetcher(
        `${DASHBOARD_ENDPOINT}?route=${encodeURIComponent(routeId)}`,
        { headers }
      );

      if (response.status === 304) {
        if (state.payload === null) {
          throw new Error("Dashboard returned 304 without a cached payload");
        }
        return { payload: state.payload, changed: false };
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
      if (!isDashboardPayload(value, routeId)) {
        throw new Error("Malformed dashboard payload");
      }

      state.etag = response.headers.get("ETag");
      state.payload = value;
      return { payload: value, changed: true };
    }
  };
}
