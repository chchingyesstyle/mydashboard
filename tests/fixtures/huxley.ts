const destination = (crs: string, locationName: string) => ({
  locationName,
  crs,
  via: null,
  futureChangeTo: null,
  assocIsCancelled: false
});

const service = (overrides: Record<string, unknown>) => ({
  formation: null,
  origin: [destination("WFJ", "Watford Junction")],
  destination: [destination("EUS", "London Euston")],
  currentOrigins: null,
  currentDestinations: null,
  rsid: null,
  serviceIdPercentEncoded: "service-id",
  serviceIdGuid: "00000000-0000-0000-0000-000000000000",
  serviceIdUrlSafe: "service-id",
  sta: null,
  eta: null,
  std: "12:00",
  etd: "On time",
  platform: "9",
  operator: "LNR & WMR",
  operatorCode: "LM",
  isCircularRoute: false,
  isCancelled: false,
  filterLocationCancelled: false,
  serviceType: 0,
  length: 0,
  detachFront: false,
  isReverseFormation: false,
  cancelReason: null,
  delayReason: null,
  serviceID: "service-id",
  adhocAlerts: null,
  ...overrides
});

export const huxleyFixture = {
  trainServices: [
    service({
      serviceID: "overground",
      serviceIdPercentEncoded: "overground",
      std: "12:05",
      operator: "London Overground",
      operatorCode: "LO"
    }),
    service({ serviceID: "on-time", serviceIdPercentEncoded: "on-time", std: "12:10" }),
    service({
      serviceID: "delayed",
      serviceIdPercentEncoded: "delayed",
      std: "12:15",
      etd: "12:23",
      platform: null
    }),
    service({
      serviceID: "cancelled",
      serviceIdPercentEncoded: "cancelled",
      std: "12:20",
      isCancelled: true,
      etd: "Cancelled",
      cancelReason: "This service has been cancelled because of a shortage of train crew"
    }),
    service({
      serviceID: "other-destination",
      serviceIdPercentEncoded: "other-destination",
      destination: [destination("WAT", "Watford")]
    })
  ],
  busServices: null,
  ferryServices: null,
  generatedAt: "2026-07-28T11:55:00.000Z",
  locationName: "Watford Junction",
  crs: "WFJ",
  filterLocationName: "London Euston",
  filtercrs: "EUS",
  filterType: 0,
  nrccMessages: null,
  platformAvailable: true,
  areServicesAvailable: true
};
