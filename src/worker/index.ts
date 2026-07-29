import {
  DEFAULT_ROUTE,
  ROUTES,
  isRouteId,
  type DashboardPayload,
  type RouteConfig
} from "../shared/contracts";
import { createDashboardService } from "./dashboard";
import type { CacheStore } from "./provider-cache";

interface Assets {
  fetch(request: Request): Promise<Response>;
}

interface WorkerDependencies {
  getDashboard: (route: RouteConfig) => Promise<DashboardPayload>;
  assets: Assets;
}

interface Env {
  ASSETS: Assets;
  DARWIN_API_KEY: string;
  RTT_API_TOKEN?: string;
}

const API_PATH = "/api/v1/dashboard";
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "If-None-Match"
};
let productionDashboardService:
  ReturnType<typeof createDashboardService> | undefined;

function routeFor(url: URL): RouteConfig | null {
  const values = url.searchParams.getAll("route");
  if (values.length === 0) return DEFAULT_ROUTE;
  if (values.length !== 1 || !isRouteId(values[0])) return null;
  return ROUTES[values[0]];
}

async function etagFor(body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body)
  );
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
  return `"${hex}"`;
}

function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  return ifNoneMatch === etag || ifNoneMatch === `W/${etag}`;
}

export function createWorker({ getDashboard, assets }: WorkerDependencies) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === API_PATH) {
        if (request.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: CORS_HEADERS
          });
        }

        if (request.method !== "GET") {
          return new Response(null, {
            status: 405,
            headers: {
              ...CORS_HEADERS,
              allow: "GET, OPTIONS"
            }
          });
        }

        const route = routeFor(url);
        if (route === null) {
          return new Response(null, {
            status: 400,
            headers: CORS_HEADERS
          });
        }

        const body = JSON.stringify(await getDashboard(route));
        const etag = await etagFor(body);
        const headers = {
          ...CORS_HEADERS,
          "cache-control": "public, max-age=15, must-revalidate",
          etag
        };

        if (etagMatches(request.headers.get("if-none-match"), etag)) {
          return new Response(null, { status: 304, headers });
        }

        return new Response(body, {
          headers: {
            ...headers,
            "content-type": "application/json"
          }
        });
      }

      return assets.fetch(request);
    }
  };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    productionDashboardService ??= createDashboardService({
      fetcher: fetch,
      cache: (caches as CacheStorage & { readonly default: CacheStore }).default,
      now: () => new Date(),
      darwinApiKey: env.DARWIN_API_KEY,
      rttApiToken: env.RTT_API_TOKEN
    });
    return createWorker({
      getDashboard: productionDashboardService,
      assets: env.ASSETS
    }).fetch(request);
  }
};
