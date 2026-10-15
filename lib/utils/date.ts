const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

export const formatRelativeTime = (
  date: string,
  formatter: Intl.RelativeTimeFormat,
  now = Date.now(),
) => {
  const seconds = (new Date(date).getTime() - now) / 1000;
  const [unit, duration] = UNITS.find(
    ([, size]) => Math.abs(seconds) >= size,
  ) ?? ["second", 1];
  return formatter.format(
    Math.sign(seconds) * Math.round(Math.abs(seconds) / duration),
    unit,
  );
};
