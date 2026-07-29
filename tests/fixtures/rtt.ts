export const rttAccessTokenFixture = {
  token: "access-token",
  validUntil: "2026-07-30T13:00:00.000Z"
};

export const rttLocationFixture = {
  services: [
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-29T12:32:00" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: {
        numberOfVehicles: 10,
        platform: { planned: "10", actual: "8" }
      }
    },
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-29T12:37:00" }
      },
      scheduleMetadata: { operator: { code: "LO" } },
      locationMetadata: {
        platform: { planned: "9", actual: null }
      }
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
      locationMetadata: {
        numberOfVehicles: 10,
        platform: { planned: "8", actual: "7" }
      }
    },
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-28T12:15:00" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: {
        platform: { planned: "7", actual: "6" }
      }
    },
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-28T12:25:00" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: {
        platform: { planned: "5", actual: null }
      }
    }
  ]
};

export const rttReverseLocationFixture = {
  services: [
    {
      temporalData: {
        departure: { scheduleAdvertised: "2026-07-28T12:10:00" }
      },
      scheduleMetadata: { operator: { code: "LM" } },
      locationMetadata: { numberOfVehicles: 8 }
    }
  ]
};
