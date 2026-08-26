# Project Instructions

These instructions apply to the entire repository.

## Product Scope

- Build and maintain the public dashboard at `https://dashboard.cchk.uk`.
- Show every direct train in both directions between Watford Junction (`WFJ`)
  and London Euston (`EUS`), including London Overground.
- Show weather for the selected departure station: Watford Junction for
  `WFJ-EUS` and London Euston for `EUS-WFJ`. The web frontend still only
  shows current conditions, today's minimum and maximum temperatures, and
  next-six-hour rain chance — the API's `dailyForecast` (7 days) and
  `hourlyForecast` (12 hours) fields exist for the E1001's forecast
  screens and aren't rendered on the web app; don't wire them in there
  without an explicit product decision to do so.
- Keep the public `/api/v1/dashboard` response suitable for both the web frontend and the `firmware/e1001/` Seeed Studio reTerminal E1001 ESP32 client.
- The `WFJ-ALL` route (unfiltered Watford Junction departures, `destination.crs` `""` as the no-filter sentinel) exists only for the E1001's off-peak display and is not part of the web app's route switcher — don't add it there.
- Treat `docs/superpowers/specs/2026-07-28-watford-euston-dashboard-design.md`
  as the base product specification and
  `docs/superpowers/specs/2026-07-28-darwin-pressure-accessibility-design.md`
  as its current data and accessibility extension. Treat
  `docs/superpowers/specs/2026-07-28-pressure-two-decimal-design.md` as the
  current pressure-presentation requirement. Treat
  `docs/superpowers/specs/2026-07-29-bidirectional-route-switch-design.md` as
  the current route and origin-weather extension. Treat
  `docs/superpowers/specs/2026-08-24-e1001-firmware-dashboard-design.md` and
  `docs/superpowers/specs/2026-08-24-e1001-two-column-agile-design.md` as the
  current specification for the `firmware/e1001/` reTerminal E1001 client.

## Architecture and Data

- Use a Vite and TypeScript frontend served by a Cloudflare Worker.
- Keep rail and weather providers behind focused adapters. Provider-specific fields must not leak into the public API contract.
- Use the subscribed National Rail Darwin Live Departure Board JSON API for
  rail data and keep its Consumer key in the `DARWIN_API_KEY` Worker secret.
- Use Open-Meteo for current weather conditions, including mean sea-level
  pressure, today's minimum and maximum temperatures, and the next-six-hour
  rain chance. Do not request additional forecast series.
- Use Realtime Trains only to enrich Darwin departures with coach counts. Keep
  its refresh token in the `RTT_API_TOKEN` Worker secret, cache coach counts
  separately per route for five minutes, and reuse the Worker-only access
  token until shortly before its `validUntil`.
- Display mean sea-level pressure with exactly two decimal places in the web
  dashboard, for example `1016.80 hPa`, while keeping
  `weather.pressureMslHpa` numeric or `null` in the public API.
- Use Octopus Energy's public Agile tariff API (`E-1R-AGILE-24-10-01-A`, no
  authentication required) to populate the `electricity` panel. Convert its
  UTC timestamps to Europe/London local time before returning them, matching
  how departure times are already presented. This panel does not affect the
  top-level `status` roll-up and is not shown in the browser UI.
- Preserve the versioned `/api/v1/dashboard` contract unless an explicit requirement calls for a breaking change.
- The `firmware/e1001/` reTerminal E1001 client now exists (PlatformIO/C++,
  see its own README). Treat further ESP32 firmware changes as in scope
  there; still do not start unrelated new firmware/device work without it
  being explicitly requested. Maintain the API's compact JSON, stable enums,
  ISO 8601 timestamps, `ETag`, and CORS support for its sake.

## Security and Deployment

- Never commit or print credentials from `.bashrc`, Cloudflare, GitHub, Darwin, or any other provider.
- Keep provider credentials in Cloudflare Worker secrets. Do not expose them to browser code or API responses.
- Send the Darwin Consumer key only in the upstream `x-apikey` header. The
  Darwin Consumer secret is not used by this product.
- Deploy through Cloudflare Workers and verify the production API and page at `dashboard.cchk.uk`.
- Push intended source changes to `https://github.com/chchingyesstyle/mydashboard`.
- Keep the `cchk.uk` Cloudflare zone's minimum TLS version at 1.2. The
  reTerminal E1001 firmware's ESP32 TLS stack cannot negotiate TLS 1.3;
  raising the zone minimum back above 1.2 breaks that client.

## Behavioral Guidelines

These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Do not assume or hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them. Do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

### 2. Simplicity First

Write the minimum code that solves the problem. Nothing speculative.

- Add no features beyond what was asked.
- Add no abstractions for single-use code.
- Add no flexibility or configurability that was not requested.
- Add no error handling for impossible scenarios.
- If 200 lines could be 50, rewrite them.
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what is necessary. Clean up only changes introduced by the current work.

When editing existing code:

- Do not improve adjacent code, comments, or formatting.
- Do not refactor code that is not broken.
- Match the existing style, even if another style is preferable.
- Mention unrelated dead code without deleting it.

When current changes create unused code:

- Remove imports, variables, and functions made unused by the current changes.
- Do not remove pre-existing dead code unless asked.
- Ensure every changed line traces directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria and loop until they are verified.

Transform tasks into verifiable goals:

- "Add validation" means write tests for invalid inputs, then make them pass.
- "Fix the bug" means write a test that reproduces it, then make it pass.
- "Refactor X" means ensure tests pass before and after.

For multi-step tasks, state a brief plan:

1. `[Step]` → verify: `[check]`
2. `[Step]` → verify: `[check]`
3. `[Step]` → verify: `[check]`

Strong success criteria support independent iteration. Weak criteria such as "make it work" require clarification.

These guidelines are working when diffs contain fewer unnecessary changes, rewrites caused by overcomplication decrease, and clarifying questions come before implementation mistakes.
