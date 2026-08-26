// Simple rectangular test polygons (not the real UK boundary shapes) so
// point-in-polygon tests are easy to reason about. "coversWatford" spans
// roughly lat 51-52 / lon -1 to 0, which contains Watford Junction
// (51.6635, -0.3969). "coversScotland" is well outside that box.
const coversWatfordPolygon =
  "51,-1 52,-1 52,0 51,0 51,-1";
const coversScotlandPolygon =
  "58,-3 59,-3 59,-2 58,-2 58,-3";

function warning(overrides: {
  event: string;
  severity: string;
  status?: string;
  msgType?: string;
  onset: string;
  expires: string;
  headline: string;
  polygon?: string;
  areaDesc?: string;
}) {
  return {
    alert: {
      identifier: "test-id",
      status: overrides.status ?? "Actual",
      msgType: overrides.msgType ?? "Update",
      scope: "Public",
      info: [
        {
          language: "en-GB",
          event: overrides.event,
          severity: overrides.severity,
          certainty: "Possible",
          urgency: "Immediate",
          onset: overrides.onset,
          expires: overrides.expires,
          headline: overrides.headline,
          area: [
            {
              areaDesc: overrides.areaDesc ?? "London & South East England",
              polygon: [overrides.polygon ?? coversWatfordPolygon]
            }
          ]
        }
      ]
    }
  };
}

export const meteoalarmActiveYellowCoveringWatford = warning({
  event: "Yellow thunderstorm warning",
  severity: "Moderate",
  onset: "2026-08-26T02:00:00+00:00",
  expires: "2026-08-26T21:00:00+00:00",
  headline: "A small risk of flooding and disruption from thunderstorms."
});

export const meteoalarmActiveAmberCoveringWatford = warning({
  event: "Amber rain warning",
  severity: "Severe",
  onset: "2026-08-26T02:00:00+00:00",
  expires: "2026-08-26T21:00:00+00:00",
  headline: "Heavy rain may cause flooding and travel disruption."
});

export const meteoalarmActiveRedCoveringWatford = warning({
  event: "Red wind warning",
  severity: "Extreme",
  onset: "2026-08-26T02:00:00+00:00",
  expires: "2026-08-26T21:00:00+00:00",
  headline: "Danger to life from extremely strong winds."
});

export const meteoalarmActiveYellowNotCoveringWatford = warning({
  event: "Yellow snow warning",
  severity: "Moderate",
  onset: "2026-08-26T02:00:00+00:00",
  expires: "2026-08-26T21:00:00+00:00",
  headline: "Snow may cause travel disruption in Scotland.",
  polygon: coversScotlandPolygon,
  areaDesc: "Scotland"
});

export const meteoalarmExpiredYellowCoveringWatford = warning({
  event: "Yellow fog warning",
  severity: "Moderate",
  onset: "2026-08-25T02:00:00+00:00",
  expires: "2026-08-25T09:00:00+00:00",
  headline: "Fog patches may cause travel disruption."
});

export const meteoalarmCancelledYellowCoveringWatford = warning({
  event: "Yellow ice warning",
  severity: "Moderate",
  msgType: "Cancel",
  onset: "2026-08-26T02:00:00+00:00",
  expires: "2026-08-26T21:00:00+00:00",
  headline: "Ice warning has been cancelled."
});

export const meteoalarmTestYellowCoveringWatford = warning({
  event: "Yellow wind warning",
  severity: "Moderate",
  status: "Test",
  onset: "2026-08-26T02:00:00+00:00",
  expires: "2026-08-26T21:00:00+00:00",
  headline: "This is a test message."
});

export function meteoalarmFeed(warnings: ReturnType<typeof warning>[]): { warnings: ReturnType<typeof warning>[] } {
  return { warnings };
}
