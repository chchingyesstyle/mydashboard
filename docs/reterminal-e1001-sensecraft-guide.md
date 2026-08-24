# Building the E1001 dashboard in SenseCraft HMI

Follow this after the design in
`docs/superpowers/specs/2026-08-24-e1001-sensecraft-dashboard-design.md` has
been approved. This is a manual, no-code build in Seeed's SenseCraft HMI web
app — it does not touch this repository's code.

## 1. Sign in and create the canvas

1. Go to SenseCraft HMI and sign in (SenseCraft/SenseCAP, Google, or GitHub
   account).
2. From the Home page, open **Canvas Designer** in the left sidebar.
3. Click **+ New** (top-left) → **New Design**.
4. Name the project (e.g. "Watford-Euston Dashboard") and select
   **reTerminal E1001** as the target device when prompted. This sets the
   canvas to 800×480 monochrome.

## 2. Add the data source

1. In the left sidebar, open **Data Widgets** and add an
   **External Data Source** widget to the canvas.
2. In its configuration, enter the API URL:
   ```
   https://dashboard.cchk.uk/api/v1/dashboard
   ```
3. Set the fetch/refresh interval to **15 minutes**.
4. SenseCraft parses the response and shows it as an expandable tree. Leave
   this widget as the shared source — you'll pick individual fields from it
   per text element in the next steps, rather than checking every field
   here.

## 3. Build the header

1. Add a **Text Widget** (Basic Widgets) near the top-left. Set its content
   to the fixed label `Watford Junction → Euston` (this is static text, not
   bound to the API).
2. Add a second Text Widget next to it for weather. Bind it to the data
   source's `weather.temperatureC` and `weather.condition` fields (via the
   Inspector Panel's data-field picker), formatted as e.g. `12°C, Partly
   cloudy`.
3. Add a third small Text Widget below for `Updated {time}`, bound to the
   payload's `generatedAt` field.

## 4. Build each departure row (repeat 5 times)

SenseCraft has no loop/repeat construct, so build row 1 completely, then
duplicate it four times and rebind each copy's fields to the next array
index.

For row *N* (0-indexed `departures.services[N]`):

1. Add a Text Widget bound to `departures.services[N].scheduledDeparture`.
   Make this the largest font in the row (matches the design's
   time-first priority).
2. Add a Text Widget bound to `departures.services[N].expectedDisplay`,
   placed beside the time. This is the only status text shown — it already
   reads "On time", a delayed `HH:MM`, or the raw cancelled text from
   Darwin.
3. Add a Text Widget bound to `departures.services[N].platform`.
4. Add a Text Widget bound to `departures.services[N].operator`.
5. Add a Text Widget bound to `departures.services[N].coachCount`, formatted
   as e.g. `{value} coaches`.
6. Group the five widgets for this row (select all, use the group action in
   the top toolbar) so they move together.

To duplicate: select the completed row 0 group, copy it, paste it into the
next row's position, then re-open each pasted widget's Inspector Panel and
change its bound array index from `[0]` to `[1]`, `[2]`, `[3]`, `[4]`
respectively.

## 5. Preview and publish

1. Click **Preview** (top-right) to check the layout renders sensibly with
   live data, including what a `null` platform or coach count looks like —
   per the design's known limitations, this will likely show blank or `0`
   rather than "TBC".
2. Click **Apply**, then **Publish**, to push the design to your
   reTerminal E1001 over Wi-Fi (the device must already be connected to your
   2.4GHz Wi-Fi network — see the Seeed getting-started guide if it isn't
   paired yet).

## 6. Verify on-device

Confirm the physical panel shows the header, weather, and all five
departure rows with real data, and that it refreshes on its own after
15 minutes.
