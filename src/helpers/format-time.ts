import {
  format,
  isSameDay,
  isSameMinute,
  isSameYear,
  startOfDay,
} from "date-fns";
import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import duration from "dayjs/plugin/duration";
import { formatDateRange } from "little-date";

dayjs.extend(utc);
dayjs.extend(duration);

const shortenAmPm = (text: string): string => {
  const shortened = (text || "").replace(/ AM/g, "am").replace(/ PM/g, "pm");
  const withoutDoubleZero = shortened.includes("m")
    ? shortened.replace(/:00/g, "")
    : shortened;
  return withoutDoubleZero;
};

const removeLeadingZero = (text: string): string => text.replace(/^0/, "");

const formatTime = (date: Date, locale?: string): string => {
  return removeLeadingZero(
    shortenAmPm(
      date.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }) || "",
    ),
  );
};

const createFormatTime =
  (locale?: string) =>
  (date: Date): string =>
    formatTime(date, locale);

export const formatDate = (
  date: Date,
  {
    today = new Date(),
    showToday = true,
    forceIncludeTime = false,
  }: {
    showToday?: boolean;
    forceIncludeTime?: boolean;
    today?: Date;
  } = {},
): string => {
  const thisYear = isSameYear(date, today);
  const thisDay = isSameDay(date, today);
  const formatTimeWithLocale = createFormatTime("en-US");

  const timeSuffix =
    !isSameMinute(startOfDay(date), date) || forceIncludeTime
      ? `, ${formatTimeWithLocale(date)}`
      : "";

  const yearSuffix = thisYear ? "" : `, ${format(date, "yyyy")}`;

  // If it's today and we have time, just show the time
  if (thisDay && timeSuffix) {
    if (showToday) {
      return `Today, ${formatTimeWithLocale(date)}`;
    }
    return formatTimeWithLocale(date);
  }

  // Standard date format
  return `${format(date, "LLL d")}${timeSuffix}${yearSuffix}`;
};

export const formatNullableDateRange = (
  startDate: Dayjs | null | undefined,
  endDate: Dayjs | null | undefined,
): string => {
  let startEnd = "";
  if (startDate && endDate) {
    startEnd = formatDateRange(startDate.toDate(), endDate.toDate(), {
      includeTime: true,
      separator: "→",
    });
    if (startEnd.includes("'")) {
      startEnd = formatDateRange(startDate.toDate(), endDate.toDate(), {
        includeTime: false,
        separator: "→",
      });
    }
  } else if (startDate) {
    startEnd = `${formatDate(startDate.toDate())} → ?`;
  } else {
    startEnd = "Not available";
  }

  if (startDate) {
    const thisDay = isSameDay(startDate.toDate(), new Date());
    if (thisDay) {
      startEnd = `Today, ${startEnd}`;
    }
  }

  return startEnd;
};

/**
 * Formats a dayjs date in UTC timezone.
 * This is needed because formatDate() uses toLocaleTimeString() which always
 * formats in local timezone. This function formats directly in UTC using dayjs.
 *
 * Only shows the date if UTC falls on a different calendar day than local
 * (e.g., "Today, 8pm PST Feb 6, 4am UTC"). If same day, just shows time
 * (e.g., "Today, 10am PST 6pm UTC").
 */
export const formatDateAsUTC = (date: Dayjs): string => {
  const utcDate = date.utc();
  const localDate = date;

  // Format time: "4pm" or "4:30pm"
  const timeStr =
    utcDate.minute() === 0 ? utcDate.format("ha") : utcDate.format("h:mma");

  // Only show date if UTC and local fall on different calendar days
  const sameCalendarDay =
    utcDate.date() === localDate.date() &&
    utcDate.month() === localDate.month() &&
    utcDate.year() === localDate.year();

  if (sameCalendarDay) {
    return `${timeStr} UTC`;
  }

  return `${utcDate.format("MMM D")}, ${timeStr} UTC`;
};

/**
 * Formats a duration in milliseconds to a compact string like "1d2h30m".
 */
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