import type { Departure, TrainStatus } from "../../shared/contracts";
import { ROUTE } from "../../shared/contracts";
import { resolveLondonDeparture } from "../time";

const DARWIN_DEPARTURES_URL =
  "https://api1.raildata.org.uk/1010-live-departure-board-dep1_2/LDBWS/api/20220120/GetDepartureBoard/WFJ";

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

function hasEustonDestination(destination: unknown): boolean {
  return Array.isArray(destination) && destination.some(
    (location) => typeof location === "object" && location !== null &&
      (location as Record<string, unknown>).crs === ROUTE.destination.crs
  );
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

export function normalizeDarwin(response: unknown): Departure[] {
  if (typeof response !== "object" || response === null) malformedResponse();

  const board = response as Record<string, unknown>;
  const generatedAt = stringValue(board.generatedAt);
  if (
    !generatedAt ||
    !isIsoTimestamp(generatedAt) ||
    !Array.isArray(board.trainServices)
  ) {
    malformedResponse();
  }

  return board.trainServices
    .filter((service): service is DarwinService => typeof service === "object" && service !== null)
    .filter(({ destination }) => hasEustonDestination(destination))
    .map((service) => departureFrom(service, generatedAt))
    .sort((first, second) => first.scheduledDeparture.localeCompare(second.scheduledDeparture));
}

export async function fetchDepartures(
  fetcher: typeof fetch,
  now: Date,
  apiKey: string
): Promise<Departure[]> {
  void now;
  if (apiKey.length === 0) {
    throw new Error("Darwin API key is not configured");
  }

  const url = new URL(DARWIN_DEPARTURES_URL);
  url.search = new URLSearchParams({
    numRows: "150",
    filterCrs: ROUTE.destination.crs,
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
    return normalizeDarwin(await response.json());
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
