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

export const darwinFixture = {
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
      platform: null,
      delayReason: "A signalling fault"
    }),
    service({
      serviceID: "cancelled",
      serviceIdPercentEncoded: "cancelled",
      std: "12:20",
      isCancelled: true,
      etd: "Cancelled",
      cancelReason: "A shortage of train crew"
    }),
    service({
      serviceID: "unknown",
      serviceIdPercentEncoded: "unknown",
      std: "12:25",
      etd: "Delayed"
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
  filterType: "to",
  nrccMessages: null,
  platformAvailable: true,
  areServicesAvailable: true
};

export const reverseDarwinFixture = {
  ...darwinFixture,
  trainServices: [
    service({
      serviceID: "reverse-lnr",
      serviceIdPercentEncoded: "reverse-lnr",
      origin: [destination("EUS", "London Euston")],
      destination: [destination("WFJ", "Watford Junction")],
      std: "12:10"
    }),
    service({
      serviceID: "reverse-overground",
      serviceIdPercentEncoded: "reverse-overground",
      origin: [destination("EUS", "London Euston")],
      destination: [destination("WFJ", "Watford Junction")],
      std: "12:20",
      operator: "London Overground",
      operatorCode: "LO"
    }),
    service({
      serviceID: "reverse-other",
      serviceIdPercentEncoded: "reverse-other",
      origin: [destination("EUS", "London Euston")],
      destination: [destination("BHM", "Birmingham New Street")],
      std: "12:30"
    })
  ],
  locationName: "London Euston",
  crs: "EUS",
  filterLocationName: "Watford Junction",
  filtercrs: "WFJ"
};
