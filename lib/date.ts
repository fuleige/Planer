const DAY_MS = 86_400_000;

export function dateInTimeZone(date: Date | string, timeZone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(typeof date === 'string' ? new Date(date) : date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function todayInTimeZone(timeZone = 'Asia/Shanghai') {
  return dateInTimeZone(new Date(), timeZone);
}

export function parseDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

export function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return formatDate(new Date(parseDate(date).getTime() + days * DAY_MS));
}

export function differenceInDays(later: string, earlier: string) {
  return Math.round((parseDate(later).getTime() - parseDate(earlier).getTime()) / DAY_MS);
}

export function minDate(...dates: Array<string | null | undefined>) {
  const validDates = dates.filter((date): date is string => Boolean(date));
  return validDates.length ? validDates.sort()[0] : null;
}

export function isBetween(date: string, from: string, to: string) {
  return date >= from && date <= to;
}
