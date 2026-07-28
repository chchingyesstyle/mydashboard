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

export function resolveLondonDeparture(time: string, generatedAt: string): string {
  const generated = new Date(generatedAt);
  const { year, month, day, hour, minute } = partsFor(generated);
  const [serviceHour, serviceMinute] = time.split(":").map(Number);
  const serviceMinutes = serviceHour * 60 + serviceMinute;
  const generatedMinutes = Number(hour) * 60 + Number(minute);
  const localDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (serviceMinutes < generatedMinutes - 120) {
    localDate.setUTCDate(localDate.getUTCDate() + 1);
  }

  const date = localDate.toISOString().slice(0, 10);
  const [serviceYear, serviceMonth, serviceDay] = date.split("-");

  return `${date}T${time}:00${offsetFor(serviceYear, serviceMonth, serviceDay, time)}`;
}
