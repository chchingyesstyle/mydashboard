# Compact Departure Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit more direct Watford Junction to London Euston departures on screen by compacting every departure row on desktop and phone layouts.

**Architecture:** Keep the existing departure markup and responsive grid. Apply the density change only through the existing CSS selectors, and use Playwright measurements of the rendered rows to lock in the intended compact size and absence of phone overflow.

**Tech Stack:** Vite, TypeScript, CSS, Playwright, Vitest.

## Global Constraints

- Keep every direct service and all currently visible departure information.
- Keep the departure time stronger than supporting fields.
- Apply the compact layout on both large screens and phones.
- Do not change weather, header, controls, Worker code, providers, or the public API.
- Preserve the current semantic markup and screen-reader text.

---

### Task 1: Define and implement compact departure dimensions

**Files:**
- Modify: `tests/e2e/dashboard.spec.ts: after the existing phone overflow test`
- Modify: `src/app/styles.css: .departure-list through the phone media query`

**Interfaces:**
- Consumes: the existing `.departure`, `.departure article`, `.departure-time`, `.departure-expected`, `.departure-platform`, `.departure-operator`, and `.departure-reason` selectors.
- Produces: a compact visual layout with no markup or API changes.

- [ ] **Step 1: Write the failing browser tests**

Add these tests after `places weather above departures without horizontal overflow on a phone`:

```ts
test("uses compact departure rows on a large screen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDashboard(page);

  const firstRow = await page.locator(".departure article").first().boundingBox();
  const time = await page.locator(".departure-time").first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)
  );

  expect(firstRow).not.toBeNull();
  expect(firstRow!.height).toBeLessThanOrEqual(70);
  expect(time).toBeLessThanOrEqual(36);
});

test("uses compact departure rows without phone overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);

  const firstRow = await page.locator(".departure article").first().boundingBox();
  const time = await page.locator(".departure-time").first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize)
  );
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));

  expect(firstRow).not.toBeNull();
  expect(firstRow!.height).toBeLessThanOrEqual(60);
  expect(time).toBeLessThanOrEqual(30);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
npx playwright test --grep "compact departure rows"
```

Expected: FAIL because the current large-screen time is 48px and the current row heights exceed the compact limits.

- [ ] **Step 3: Apply the minimal CSS density changes**

In `src/app/styles.css`, make only these selector changes:

```css
.departure-list {
  margin: clamp(0.5rem, 1vw, 0.75rem) 0 0;
}

.departure article {
  column-gap: clamp(0.5rem, 1.2vw, 1.25rem);
  row-gap: 0.15rem;
  padding: clamp(0.5rem, 1vw, 0.75rem) 0;
}

.departure-time {
  font-size: clamp(1.5rem, 2.4vw, 2.25rem);
}

.departure-expected,
.departure-platform,
.departure-operator {
  font-size: clamp(0.85rem, 1.1vw, 0.95rem);
  line-height: 1.3;
}

.departure-reason {
  font-size: 0.78rem;
  line-height: 1.35;
}

@media (max-width: 1023px) {
  .departure article {
    column-gap: 0.5rem;
    row-gap: 0.1rem;
    padding: 0.65rem 0;
  }

  .departure-operator {
    font-size: 0.82rem;
    line-height: 1.3;
  }

  .departure-reason {
    font-size: 0.76rem;
    line-height: 1.35;
  }
}

@media (max-width: 759px) {
  .departure-time {
    font-size: clamp(1.45rem, 7.5vw, 2rem);
  }
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run:

```bash
npx playwright test --grep "compact departure rows"
```

Expected: PASS for the desktop and phone compact-row tests.

- [ ] **Step 5: Run regression checks**

Run:

```bash
npm test && npm run typecheck && npm run test:e2e && npm run build && git diff --check
```

Expected: all unit tests, browser tests, TypeScript checking, build, and whitespace validation pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/styles.css tests/e2e/dashboard.spec.ts
git commit -m "feat: compact departure rows"
```
