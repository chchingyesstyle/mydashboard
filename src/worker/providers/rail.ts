import type { Departure, TrainStatus } from "../../shared/contracts";
import { ROUTE } from "../../shared/contracts";
import { resolveLondonDeparture } from "../time";

const HUXLEY_DEPARTURES_URL =
  "https://national-rail-api.davwheat.dev/departures/WFJ/to/EUS/10";

type HuxleyService = Record<string, unknown>;

function malformedResponse(): never {
  throw new Error("Huxley departures response was malformed");
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

function statusFor(service: HuxleyService, expectedDisplay: string | null): TrainStatus {
  if (service.isCancelled === true) return "cancelled";
  if (expectedDisplay === "On time") return "on_time";
  if (isTime(expectedDisplay)) return "delayed";
  return "unknown";
}

function departureFrom(service: HuxleyService, generatedAt: string): Departure {
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

export function normalizeHuxley(response: unknown): Departure[] {
  if (typeof response !== "object" || response === null) malformedResponse();

  const board = response as Record<string, unknown>;
  const generatedAt = stringValue(board.generatedAt);
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt)) || !Array.isArray(board.trainServices)) {
    malformedResponse();
  }

  return board.trainServices
    .filter((service): service is HuxleyService => typeof service === "object" && service !== null)
    .filter(({ destination }) => hasEustonDestination(destination))
    .map((service) => departureFrom(service, generatedAt))
    .sort((first, second) => first.scheduledDeparture.localeCompare(second.scheduledDeparture));
}

export async function fetchDepartures(
  fetcher: typeof fetch,
  now: Date
): Promise<Departure[]> {
  void now;
  const response = await fetcher(HUXLEY_DEPARTURES_URL, {
    signal: AbortSignal.timeout(7000)
  });

  if (!response.ok) {
    throw new Error("Huxley departures request failed");
  }

  try {
    return normalizeHuxley(await response.json());
  } catch (error) {
    if (error instanceof Error && error.message === "Huxley departures response was malformed") {
      throw error;
    }
    throw new Error("Huxley departures response was malformed");
  }
}
