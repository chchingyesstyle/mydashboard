const RTT_BASE_URL = "https://data.rtt.io";

export interface CoachCount {
  scheduledDeparture: string;
  operatorCode: string;
  coachCount: number;
}

function malformedResponse(): never {
  throw new Error("RTT location response was malformed");
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function valueAt(object: Record<string, unknown>, keys: string[]): unknown {
  let value: unknown = object;
  for (const key of keys) {
    const next = record(value);
    if (next === null) return undefined;
    value = next[key];
  }
  return value;
}

function isScheduledDeparture(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value);
}

export function normalizeRttCoachCounts(response: unknown): CoachCount[] {
  const payload = record(response);
  if (payload === null || !Array.isArray(payload.services)) malformedResponse();

  return payload.services.flatMap((service): CoachCount[] => {
    const serviceRecord = record(service);
    if (serviceRecord === null) return [];

    const scheduledDeparture = valueAt(serviceRecord, [
      "temporalData", "departure", "scheduleAdvertised"
    ]);
    const operatorCode = valueAt(serviceRecord, [
      "scheduleMetadata", "operator", "code"
    ]);
    const coachCount = valueAt(serviceRecord, [
      "locationMetadata", "numberOfVehicles"
    ]);
    if (
      !isScheduledDeparture(scheduledDeparture) ||
      typeof operatorCode !== "string" ||
      operatorCode.length === 0 ||
      typeof coachCount !== "number" ||
      !Number.isInteger(coachCount) ||
      coachCount < 0
    ) {
      return [];
    }

    return [{ scheduledDeparture, operatorCode, coachCount }];
  }).sort((first, second) =>
    first.scheduledDeparture.localeCompare(second.scheduledDeparture) ||
    first.operatorCode.localeCompare(second.operatorCode)
  );
}

async function responseJson(response: Response, error: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(error);
  }
}

export async function fetchCoachCounts(
  fetcher: typeof fetch,
  refreshToken: string
): Promise<CoachCount[]> {
  if (refreshToken.length === 0) {
    throw new Error("RTT API token is not configured");
  }

  const accessTokenResponse = await fetcher(`${RTT_BASE_URL}/api/get_access_token`, {
    headers: { authorization: `Bearer ${refreshToken}` },
    signal: AbortSignal.timeout(7000)
  });
  if (!accessTokenResponse.ok) {
    throw new Error("RTT access-token request failed");
  }

  const accessTokenPayload = record(await responseJson(
    accessTokenResponse,
    "RTT access-token response was malformed"
  ));
  const accessToken = accessTokenPayload?.token;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error("RTT access-token response was malformed");
  }

  const locationUrl = new URL(`${RTT_BASE_URL}/rtt/location`);
  locationUrl.searchParams.set("code", "gb-nr:WFJ");
  locationUrl.searchParams.set("filterTo", "gb-nr:EUS");
  const locationResponse = await fetcher(locationUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(7000)
  });
  if (!locationResponse.ok) {
    throw new Error("RTT location request failed");
  }

  try {
    return normalizeRttCoachCounts(await responseJson(
      locationResponse,
      "RTT location response was malformed"
    ));
  } catch (error) {
    if (error instanceof Error && error.message === "RTT location response was malformed") {
      throw error;
    }
    throw new Error("RTT location response was malformed");
  }
}
