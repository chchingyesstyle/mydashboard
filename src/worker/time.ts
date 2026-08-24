const londonDateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  timeZone: "Europe/London",
  year: "numeric"
});

const londonOffset = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  timeZoneName: "longOffset"
});

function partsFor(date: Date) {
  return Object.fromEntries(
    londonDateTime
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
}

function offsetFor(year: string, month: string, day: string, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const offset = londonOffset
    .formatToParts(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), hour, minute)))
    .find(({ type }) => type === "timeZoneName")?.value;

  return offset === "GMT" ? "+00:00" : offset?.replace("GMT", "") ?? "+00:00";
}

function serviceTimestamp(localDate: Date, time: string): string {
  const date = localDate.toISOString().slice(0, 10);
  const [year, month, day] = date.split("-");
  return `${date}T${time}:00${offsetFor(year, month, day, time)}`;
}

export function resolveLondonDeparture(time: string, generatedAt: string): string {
  const generated = new Date(generatedAt);
  const { year, month, day } = partsFor(generated);
  const localDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const candidates = [-1, 0, 1].map((dayOffset) => {
    const candidateDate = new Date(localDate);
    candidateDate.setUTCDate(candidateDate.getUTCDate() + dayOffset);
    const timestamp = serviceTimestamp(candidateDate, time);
    const epoch = Date.parse(timestamp);
    return {
      timestamp,
      epoch,
      distance: Math.abs(epoch - generated.getTime())
    };
  });

  candidates.sort((first, second) => {
    const distance = first.distance - second.distance;
    if (distance !== 0) {
      return distance;
    }
    return Number(second.epoch >= generated.getTime()) -
      Number(first.epoch >= generated.getTime());
  });
  return candidates[0].timestamp;
}

const londonInstant = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/London"
});

export function toLondonIso(utcIso: string): string {
  const instant = new Date(utcIso);
  const parts = Object.fromEntries(
    londonInstant
      .formatToParts(instant)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  const offset = londonOffset
    .formatToParts(instant)
    .find(({ type }) => type === "timeZoneName")?.value;
  const offsetSuffix = offset === "GMT" ? "+00:00" : offset?.replace("GMT", "") ?? "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offsetSuffix}`;
}
