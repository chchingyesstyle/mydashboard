# Light Theme Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the dashboard in a light theme by default and let users select a remembered dark theme.

**Architecture:** Keep theme state browser-only. A small theme module owns the document attribute, persisted preference, and control semantics; the header and click handler consume it. CSS variables provide both palettes without changing the dashboard data contract or layout.

**Tech Stack:** Vite, TypeScript, DOM APIs, localStorage, Vitest, Testing Library, Playwright, CSS.

## Global Constraints

- The first visit must render in light mode.
- Store a selected theme in browser local storage under `dashboard-theme`.
- Retain the existing dark appearance behind `data-theme=\"dark\"`.
- Do not change the Worker, rail/weather providers, public API, dashboard data, or responsive layout.
- Keep the header control keyboard-accessible and expose both its action and dark-mode state.
- Keep all existing direct-departure and current-weather content visible.

---

## File Structure

- Create: `src/app/theme.ts` — browser-only theme selection, persistence, and
  control-label helpers.
- Modify: `index.html` — apply a saved dark preference before the app module
  runs, preventing a flash of the default light palette.
- Modify: `src/app/render.ts` — render the theme control using the current
  document theme.
- Modify: `src/app/main.ts` — handle the theme-control click.
- Modify: `src/app/styles.css` — introduce accessible light variables as
  defaults and scope the present palette to dark mode.
- Modify: `tests/app/render.test.ts` — cover theme control semantics and
  runtime toggling/persistence.
- Modify: `tests/e2e/dashboard.spec.ts` — cover first-visit light mode and
  a saved dark choice after reload.

### Task 1: Add focused theme state and control tests

**Files:**
- Create: `src/app/theme.ts`
- Modify: `tests/app/render.test.ts`

**Interfaces:**
- Produces `Theme = \"light\" | \"dark\"`.
- Produces `activeTheme(): Theme`, `setTheme(theme: Theme): void`,
  `toggleTheme(): Theme`, and
  `updateThemeControl(control: HTMLButtonElement): void`.
- Uses the document element's `data-theme` attribute and
  `localStorage["dashboard-theme"]`.

- [ ] **Step 1: Write the failing unit tests**

  Add a `describe("theme controls")` block that clears
  `document.documentElement.dataset.theme` and `localStorage` in
  `afterEach`, then asserts the default and dark-state semantics:

  ```ts
  it("defaults to light and labels the switch to dark mode", () => {
    const control = document.createElement("button");

    updateThemeControl(control);

    expect(activeTheme()).toBe("light");
    expect(control.getAttribute("aria-label")).toBe("Switch to dark mode");
    expect(control.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches to dark mode and persists the selection", () => {
    const control = document.createElement("button");

    expect(toggleTheme()).toBe("dark");
    updateThemeControl(control);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("dashboard-theme")).toBe("dark");
    expect(control.getAttribute("aria-label")).toBe("Switch to light mode");
    expect(control.getAttribute("aria-pressed")).toBe("true");
  });
  ```

- [ ] **Step 2: Run the new test to verify it fails**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: FAIL because `src/app/theme.ts` and its exported theme helpers
  do not exist.

- [ ] **Step 3: Implement the minimal theme module**

  Create `src/app/theme.ts`:

  ```ts
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
  ```

- [ ] **Step 4: Run the unit test to verify it passes**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: PASS, including the new default and persistence assertions.

- [ ] **Step 5: Commit the testable theme module**

  ```bash
  git add src/app/theme.ts tests/app/render.test.ts
  git commit -m "feat: add theme preference helpers"
  ```

### Task 2: Render and operate the theme control

**Files:**
- Modify: `src/app/render.ts`
- Modify: `src/app/main.ts`
- Modify: `tests/app/render.test.ts`

**Interfaces:**
- Consumes `updateThemeControl(control)` from `src/app/theme.ts`.
- Consumes `toggleTheme(): Theme` from `src/app/theme.ts`.
- Produces a button with `data-dashboard-theme` in the existing header
  controls.

- [ ] **Step 1: Write the failing render and runtime tests**

  Add a rendered-header expectation and a runtime click test:

  ```ts
  expect(getByRole(root, "button", {
    name: "Switch to dark mode"
  })).toBeTruthy();

  getByRole(root, "button", { name: "Switch to dark mode" }).click();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("dashboard-theme")).toBe("dark");
  expect(getByRole(root, "button", {
    name: "Switch to light mode"
  })).toBeTruthy();
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: FAIL because no theme button is rendered or handled.

- [ ] **Step 3: Render the compact theme control**

  In `renderHeader` in `src/app/render.ts`, import
  `updateThemeControl`, create a `button` before Refresh, set
  `type = "button"` and `dataset.dashboardTheme = ""`, append a text
  `span`, call `updateThemeControl(theme)`, and append it to
  `.dashboard-controls`. Do not add an icon or change existing controls.

- [ ] **Step 4: Handle a theme click**

  In `src/app/main.ts`, import `toggleTheme` and `updateThemeControl`.
  At the top of `handleClick`, resolve
  `target.closest<HTMLButtonElement>("[data-dashboard-theme]")`. When it
  exists, call `toggleTheme()`, call `updateThemeControl(themeControl)`,
  and return. Keep Refresh and Fullscreen handling unchanged.

- [ ] **Step 5: Run the focused test to verify it passes**

  Run: `npm test -- tests/app/render.test.ts`

  Expected: PASS; the rendered button switches themes, persists its value, and
  immediately receives its opposite action label.

- [ ] **Step 6: Commit the interactive control**

  ```bash
  git add src/app/render.ts src/app/main.ts tests/app/render.test.ts
  git commit -m "feat: add dashboard theme control"
  ```

### Task 3: Supply the light default and saved-theme bootstrap

**Files:**
- Modify: `index.html`
- Modify: `src/app/styles.css`

**Interfaces:**
- Consumes the `dashboard-theme` local-storage value written by
  `setTheme(theme)`.
- Uses an absent `data-theme` attribute for light and
  `data-theme="dark"` for dark.

- [ ] **Step 1: Add the pre-module dark-theme bootstrap**

  Place this non-module script in `index.html` immediately before the app
  module script:

  ```html
  <script>
    try {
      if (localStorage.getItem("dashboard-theme") === "dark") {
        document.documentElement.dataset.theme = "dark";
      }
    } catch {}
  </script>
  ```

  Update `meta[name="theme-color"]` to the selected light page background
  colour. The browser only needs the dark pre-application path; a stored
  `"light"` value is represented by the default, absent attribute.

- [ ] **Step 2: Replace the global palette with light defaults and dark scope**

  In `src/app/styles.css`, set `:root` to `color-scheme: light` and
  define the light values:

  ```css
  :root {
    color-scheme: light;
    color: oklch(0.25 0.018 255);
    background: oklch(0.97 0.005 255);
    --surface: oklch(0.995 0.003 255);
    --text: oklch(0.25 0.018 255);
    --text-muted: oklch(0.46 0.025 253);
    --line: oklch(0.74 0.018 253 / 72%);
    --amber: oklch(0.55 0.13 76);
    --amber-soft: oklch(0.55 0.13 76 / 12%);
    --red: oklch(0.54 0.15 25);
    --red-soft: oklch(0.54 0.15 25 / 10%);
    --blue-gray: oklch(0.48 0.065 239);
  }
  ```

  Add a `:root[data-theme="dark"]` block containing the current dark
  `color-scheme`, colour, background, and custom-property values. Change
  the `body` gradient and solid background to use variables so each palette
  applies consistently. Retain all existing spacing, type scales, breakpoints,
  focus outline, status selectors, and reduced-motion rule.

- [ ] **Step 3: Run the build and manually inspect both palettes**

  Run: `npm run build`

  Expected: PASS. Use the built local dashboard at desktop and 390px widths;
  confirm text, status text, focus outlines, delayed/cancelled rows, and
  weather measurements remain legible in both light and dark modes.

- [ ] **Step 4: Commit the palette and bootstrap**

  ```bash
  git add index.html src/app/styles.css
  git commit -m "feat: make light theme the dashboard default"
  ```

### Task 4: Verify browser persistence and the full project

**Files:**
- Modify: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes the rendered button names `Switch to dark mode` and
  `Switch to light mode`.
- Verifies `document.documentElement.dataset.theme` and
  `localStorage["dashboard-theme"]`.

- [ ] **Step 1: Write the failing browser test**

  Add an end-to-end test after the existing control accessibility test:

  ```ts
  test("defaults to light and remembers a selected dark theme", async ({ page }) => {
    await openDashboard(page);

    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", {
      name: "Switch to light mode"
    })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
  ```

- [ ] **Step 2: Run the new browser test to verify it fails**

  Run: `npm run test:e2e -- --grep "defaults to light"`

  Expected: FAIL until Tasks 2 and 3 are complete.

- [ ] **Step 3: Run the new browser test to verify it passes**

  Run: `npm run test:e2e -- --grep "defaults to light"`

  Expected: PASS; no stored preference shows light, the button switches to
  dark, and reload retains dark.

- [ ] **Step 4: Run the full verification suite**

  ```bash
  npm test
  npm run typecheck
  npm run test:e2e
  npm run build
  git diff --check
  ```

  Expected: every command exits successfully.

- [ ] **Step 5: Commit browser coverage**

  ```bash
  git add tests/e2e/dashboard.spec.ts
  git commit -m "test: cover dashboard theme preference"
  ```
