export const rttAccessTokenFixture = {
  token: "access-token"
};

export const rttLocationFixture = {
  services: [
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-29T12:32:00" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: { numberOfVehicles: 10 }
    },
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-29T12:37:00" }
      },
      scheduleMetadata: { operator: { code: "LO" } },
      locationMetadata: {}
    },
    {
      temporalData: {
        departure: { scheduleAdvertised: "not-a-date" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: { numberOfVehicles: 8 }
    }
  ]
};

export const rttDashboardLocationFixture = {
  services: [
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-28T12:10:00" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: { numberOfVehicles: 10 }
    }
  ]
};
