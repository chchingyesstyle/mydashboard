import { createDashboardClient } from "./api";
import { renderDashboard, updateStaleAges } from "./render";
import { toggleTheme, updateThemeControl } from "./theme";
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
  let refreshTimer: number | null = null;
  let clockTimer: number | null = null;
  let active = false;

  const updateClock = (): void => {
    const now = new Date();
    const clock = root.querySelector<HTMLTimeElement>("[data-dashboard-clock]");
    if (clock !== null) {
      clock.dateTime = now.toISOString();
      clock.textContent = formatLondonClock(now);
    }
    updateStaleAges(root, now);
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
    const themeControl = target.closest<HTMLButtonElement>(
      "[data-dashboard-theme]"
    );
    if (themeControl !== null) {
      toggleTheme();
      updateThemeControl(themeControl);
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

  const stop = (): void => {
    if (!active) {
      return;
    }
    active = false;
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (clockTimer !== null) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
    root.removeEventListener("click", handleClick);
    document.removeEventListener("fullscreenchange", updateFullscreenControl);
  };

  const start = (): void => {
    if (active) {
      return;
    }
    active = true;
    root.addEventListener("click", handleClick);
    document.addEventListener("fullscreenchange", updateFullscreenControl);
    updateClock();
    updateFullscreenControl();
    void refresh(false);
    refreshTimer = window.setInterval(() => {
      void refresh(false);
    }, REFRESH_INTERVAL_MS);
    clockTimer = window.setInterval(updateClock, CLOCK_INTERVAL_MS);
  };

  const handlePageHide = (event: PageTransitionEvent): void => {
    stop();
    if (!event.persisted) {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    }
  };

  const handlePageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      start();
    }
  };

  renderLoading(root);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  start();
}

const root = document.querySelector<HTMLElement>("#app");
if (root !== null) {
  startDashboardApp(root);
}
