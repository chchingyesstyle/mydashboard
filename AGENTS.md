# Project Instructions

These instructions apply to the entire repository.

## Product Scope

- Build and maintain the public dashboard at `https://dashboard.cchk.uk`.
- Show every direct train from Watford Junction (`WFJ`) to London Euston (`EUS`), including London Overground.
- Show current weather conditions at Watford Junction only. Do not add hourly or daily forecasts unless requested.
- Keep the public `/api/v1/dashboard` response suitable for both the web frontend and a future Seeed Studio reTerminal E1001 ESP32 client.
- Treat `docs/superpowers/specs/2026-07-28-watford-euston-dashboard-design.md` as the current product and architecture specification.

## Architecture and Data

- Use a Vite and TypeScript frontend served by a Cloudflare Worker.
- Keep rail and weather providers behind focused adapters. Provider-specific fields must not leak into the public API contract.
- Use Huxley 2 Community Edition temporarily for rail data. Replace only the rail adapter when the official Darwin Consumer key becomes available.
- Use Open-Meteo for current weather conditions.
- Preserve the versioned `/api/v1/dashboard` contract unless an explicit requirement calls for a breaking change.
- Do not build ESP32 firmware unless explicitly requested. Maintain compatibility through compact JSON, stable enums, ISO 8601 timestamps, `ETag`, and CORS support.

## Security and Deployment

- Never commit or print credentials from `.bashrc`, Cloudflare, GitHub, Darwin, or any other provider.
- Keep provider credentials in Cloudflare Worker secrets. Do not expose them to browser code or API responses.
- Deploy through Cloudflare Workers and verify the production API and page at `dashboard.cchk.uk`.
- Push intended source changes to `https://github.com/chchingyesstyle/mydashboard`.

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
