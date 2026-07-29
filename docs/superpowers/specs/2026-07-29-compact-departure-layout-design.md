# Compact Departure Layout Design

## Goal

Show more Watford Junction to London Euston departures at once on both large
screens and phones without hiding service information.

## Scope

- Compact the visible departure-row typography, padding, and grid gaps.
- Keep the departure time visually strongest.
- Retain the expected status, platform, operator, cancellation state, and
  disruption reason in every row.
- Do not change the weather panel, header, refresh control, API contract, or
  provider behaviour.

## Layout

The departure list keeps its existing grid structure and responsive breakpoints.
Only its density changes:

- On desktop, reduce the departure time from its current large display scale to
  a smaller scale while keeping it larger than every supporting field.
- Reduce expected-status, platform, and operator text by one modest type step.
- Reduce row padding, column gaps, and list top margin.
- On phone, apply the same smaller time scale and reduce the three-row layout's
  padding and gaps; retain the existing stacking and right-aligned platform.
- Keep disruption reasons visible and allow wrapping rather than clipping.

## Accessibility

Visible text remains text; screen-reader labels and semantic departure markup do
not change. The compact layout must not introduce horizontal scrolling at the
existing desktop or phone test widths.

## Verification

- Add an end-to-end check that a desktop departure row uses compact dimensions.
- Add an end-to-end check that a phone departure row uses compact dimensions
  without horizontal overflow.
- Run unit tests, TypeScript checking, browser tests, and the production build.
