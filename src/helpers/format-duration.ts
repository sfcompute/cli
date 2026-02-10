import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

export function formatDuration(ms: number) {
  const d = dayjs.duration(ms);

  const years = Math.floor(d.asYears());
  const weeks = Math.floor(d.asWeeks()) % 52;
  const days = d.days();
  const hours = d.hours();
  const minutes = d.minutes();
  const seconds = d.seconds();
  const milliseconds = d.milliseconds();

  let result = "";

  if (years > 0) result += `${years}y`;
  if (weeks > 0) result += `${weeks}w`;
  if (days > 0) result += `${days}d`;
  if (hours > 0) result += `${hours}h`;
  if (minutes > 0) result += `${minutes}m`;
  if (seconds > 0) result += `${seconds}s`;
  if (milliseconds > 0) result += `${milliseconds}ms`;

  return result || "0ms";
}
