import type { DashboardPayload } from "../shared/contracts";

interface Assets {
  fetch(request: Request): Promise<Response>;
}

interface WorkerDependencies {
  getDashboard: () => Promise<DashboardPayload>;
  assets: Assets;
}

interface Env {
  ASSETS: Assets;
}

export function createWorker({ getDashboard, assets }: WorkerDependencies) {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/v1/dashboard") {
        return new Response(JSON.stringify(await getDashboard()), {
          headers: {
            "access-control-allow-origin": "*",
            "cache-control": "public, max-age=15, must-revalidate",
            "content-type": "application/json"
          }
        });
      }

      return assets.fetch(request);
    }
  };
}

const getDashboard = async (): Promise<DashboardPayload> => {
  throw new Error("Dashboard dependencies are not configured");
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return createWorker({ getDashboard, assets: env.ASSETS }).fetch(request);
  }
};
