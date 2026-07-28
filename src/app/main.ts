import { createDashboardClient } from "./api";
import { renderDashboard } from "./render";
import type { DashboardPayload } from "../shared/contracts";
import "./styles.css";

const REFRESH_INTERVAL_MS = 30_000;
const CLOCK_INTERVAL_MS = 1_000;

function renderLoading(root: HTMLElement): void {
  const loading = document.createElement("p");
  loading.className = "loading-state";
  loading.setAttribute("role", "status");
  loading.textContent = "Loading live departures and current weather…";
  root.replaceChildren(loading);
}

function formatLondonClock(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
}

export function startDashboardApp(
  root: HTMLElement,
  fetcher: typeof fetch = window.fetch.bind(window)
): void {
  const client = createDashboardClient(fetcher);
  let lastPayload: DashboardPayload | null = null;
  let refreshInFlight = false;

  const updateClock = (): void => {
    const clock = root.querySelector<HTMLTimeElement>("[data-dashboard-clock]");
    if (clock === null) {
      return;
    }

    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = formatLondonClock(now);
  };

  const updateFullscreenControl = (): void => {
    const control = root.querySelector<HTMLButtonElement>(
      "[data-dashboard-fullscreen]"
    );
    if (control === null) {
      return;
    }

    const isFullscreen = document.fullscreenElement !== null;
    control.setAttribute(
      "aria-label",
      isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
    );
    const label = control.querySelector("span");
    if (label !== null) {
      label.textContent = isFullscreen ? "Exit fullscreen" : "Fullscreen";
    }
  };

  const setConnectionNotice = (message: string | null): void => {
    let notice = root.querySelector<HTMLElement>("[data-dashboard-connection]");
    if (notice === null && message !== null) {
      notice = document.createElement("p");
      notice.className = "connection-notice";
      notice.dataset.dashboardConnection = "";
      notice.setAttribute("role", "status");
      root.insertBefore(notice, root.firstChild);
    }
    if (notice === null) {
      return;
    }

    notice.hidden = message === null;
    notice.textContent = message;
  };

  const refresh = async (disableControl: boolean): Promise<void> => {
    if (refreshInFlight) {
      return;
    }

    refreshInFlight = true;
    const refreshControl = root.querySelector<HTMLButtonElement>(
      "[data-dashboard-refresh]"
    );
    if (disableControl && refreshControl !== null) {
      refreshControl.disabled = true;
    }

    try {
      const payload = await client.load();
      if (payload !== null) {
        lastPayload = payload;
        renderDashboard(root, payload);
        updateClock();
        updateFullscreenControl();
      }
      setConnectionNotice(null);
    } catch {
      setConnectionNotice(
        lastPayload === null
          ? "Unable to connect. Retrying automatically."
          : "Connection lost. Showing the last updated data."
      );
    } finally {
      refreshInFlight = false;
      if (refreshControl !== null) {
        refreshControl.disabled = false;
      }
    }
  };

  const toggleFullscreen = async (): Promise<void> => {
    if (document.fullscreenElement === null) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
    updateFullscreenControl();
  };

  const handleClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest("[data-dashboard-refresh]") !== null) {
      void refresh(true);
      return;
    }
    if (target.closest("[data-dashboard-fullscreen]") !== null) {
      void toggleFullscreen();
    }
  };

  renderLoading(root);
  root.addEventListener("click", handleClick);
  document.addEventListener("fullscreenchange", updateFullscreenControl);
  void refresh(false);
  const refreshTimer = window.setInterval(() => {
    void refresh(false);
  }, REFRESH_INTERVAL_MS);
  const clockTimer = window.setInterval(updateClock, CLOCK_INTERVAL_MS);

  window.addEventListener("pagehide", () => {
    window.clearInterval(refreshTimer);
    window.clearInterval(clockTimer);
    root.removeEventListener("click", handleClick);
    document.removeEventListener("fullscreenchange", updateFullscreenControl);
  }, { once: true });
}

const root = document.querySelector<HTMLElement>("#app");
if (root !== null) {
  startDashboardApp(root);
}
