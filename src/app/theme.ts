export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "dashboard-theme";

export function activeTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The active page still changes when browser storage is unavailable.
  }
}

export function toggleTheme(): Theme {
  const next = activeTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function updateThemeControl(control: HTMLButtonElement): void {
  const darkActive = activeTheme() === "dark";
  control.setAttribute(
    "aria-label",
    darkActive ? "Switch to light mode" : "Switch to dark mode"
  );
  control.setAttribute("aria-pressed", String(darkActive));
  const label = control.querySelector("span");
  if (label !== null) {
    label.textContent = darkActive ? "Light mode" : "Dark mode";
  }
}
