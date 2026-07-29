import type {
  Departure,
  RouteConfig,
  TrainStatus
} from "../../shared/contracts";
import { DEFAULT_ROUTE } from "../../shared/contracts";
import { resolveLondonDeparture } from "../time";

const DARWIN_DEPARTURES_BASE_URL =
  "https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepartureBoard";

type DarwinService = Record<string, unknown>;

function malformedResponse(): never {
  throw new Error("Darwin departures response was malformed");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isTime(value: string | null): value is string {
  return value !== null && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function finalDestinationFrom(
  value: unknown
): Departure["finalDestination"] {
  if (!Array.isArray(value)) return null;

  for (const location of value) {
    if (typeof location !== "object" || location === null) continue;
    const record = location as Record<string, unknown>;
    const name = stringValue(record.locationName);
    const crs = stringValue(record.crs);
    if (
      name !== null &&
      name.trim().length > 0 &&
      crs !== null &&
      crs.trim().length > 0
    ) {
      return { name, crs };
    }
  }
  return null;
}

function statusFor(service: DarwinService, expectedDisplay: string | null): TrainStatus {
  if (service.isCancelled === true) return "cancelled";
  if (expectedDisplay === "On time") return "on_time";
  if (isTime(expectedDisplay)) return "delayed";
  return "unknown";
}

function departureFrom(service: DarwinService, generatedAt: string): Departure {
  const scheduledTime = stringValue(service.std);
  if (!isTime(scheduledTime)) malformedResponse();

  const expectedDisplay = stringValue(service.etd) ?? "Unknown";
  const status = statusFor(service, expectedDisplay);
  const scheduledDeparture = resolveLondonDeparture(scheduledTime, generatedAt);
  const reason = status === "cancelled"
    ? stringValue(service.cancelReason)
    : stringValue(service.delayReason);

  return {
    id: stringValue(service.serviceID) ?? malformedResponse(),
    scheduledDeparture,
    expectedDeparture: status === "on_time"
      ? scheduledDeparture
      : isTime(expectedDisplay)
        ? resolveLondonDeparture(expectedDisplay, generatedAt)
        : null,
    expectedDisplay,
    platform: stringValue(service.platform),
    operator: stringValue(service.operator) ?? malformedResponse(),
    operatorCode: stringValue(service.operatorCode) ?? malformedResponse(),
    finalDestination: finalDestinationFrom(service.destination),
    coachCount: null,
    status,
    isCancelled: status === "cancelled",
    reason
  };
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
    .test(value) &&
    !Number.isNaN(Date.parse(value));
}

export function normalizeDarwin(
  response: unknown,
  destinationCrs: string = DEFAULT_ROUTE.destination.crs
): Departure[] {
  if (typeof response !== "object" || response === null) malformedResponse();

  const board = response as Record<string, unknown>;
  const generatedAt = stringValue(board.generatedAt);
  if (
    !generatedAt ||
    !isIsoTimestamp(generatedAt) ||
    stringValue(board.filtercrs) !== destinationCrs ||
    !Array.isArray(board.trainServices)
  ) {
    malformedResponse();
  }

  return board.trainServices
    .filter((service): service is DarwinService => typeof service === "object" && service !== null)
    .map((service) => departureFrom(service, generatedAt))
    .sort((first, second) => first.scheduledDeparture.localeCompare(second.scheduledDeparture));
}

export async function fetchDepartures(
  fetcher: typeof fetch,
  now: Date,
  apiKey: string,
  route: RouteConfig = DEFAULT_ROUTE
): Promise<Departure[]> {
  void now;
  if (apiKey.length === 0) {
    throw new Error("Darwin API key is not configured");
  }

  const url = new URL(
    `${DARWIN_DEPARTURES_BASE_URL}/${encodeURIComponent(route.origin.crs)}`
  );
  url.search = new URLSearchParams({
    numRows: "150",
    filterCrs: route.destination.crs,
    filterType: "to",
    timeOffset: "0",
    timeWindow: "120"
  }).toString();

  const response = await fetcher(url, {
    headers: { "x-apikey": apiKey },
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error("Darwin departures request failed");
  }

  try {
    return normalizeDarwin(await response.json(), route.destination.crs);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Darwin departures response was malformed"
    ) {
      throw error;
    }
    throw new Error("Darwin departures response was malformed");
  }
}
