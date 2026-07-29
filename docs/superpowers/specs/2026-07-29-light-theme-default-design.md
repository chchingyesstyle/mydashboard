# Light Theme Default Design

## Goal

Make the dashboard light by default while allowing each user to switch to, and
keep, a dark theme.

## Scope

- Make the first-visit dashboard palette light.
- Retain the existing dark palette as a selectable alternative.
- Add one compact header theme control alongside Refresh and Fullscreen.
- Persist a user's selected theme in browser local storage.
- Apply a saved dark theme before the dashboard content renders.
- Do not change dashboard data, the public API, providers, Worker behaviour,
  route content, or layout density.

## Theme Behaviour

- Without a stored preference, the document renders in light mode.
- The control reads `Dark mode` in light mode and switches to dark mode.
- The control reads `Light mode` in dark mode and switches to light mode.
- The control exposes the action in its accessible name and whether dark mode
  is active through its pressed state.
- A successfully selected theme is stored locally and used on later visits.
- If browser storage is unavailable, light remains the default and toggling
  still works for the open page.

## Presentation

The existing CSS colour variables become the light palette. A
`data-theme=\"dark\"` document attribute activates the present dark colours.
Both palettes preserve the existing dashboard structure, compact departure
layout, control sizing, status colours, focus treatment, and responsive
breakpoints. The document colour-scheme follows the active theme so native
browser controls match it.

## Verification

- Add focused application coverage for the default light state, theme control
  semantics, toggling, and stored preference.
- Add browser coverage that a first visit is light, switching to dark works,
  and the preference remains after reload.
- Run unit tests, TypeScript checking, browser tests, and the production build.
