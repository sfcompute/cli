import {
  format,
  isSameDay,
  isSameMinute,
  isSameYear,
  startOfDay,
} from "date-fns";
import { formatDateRange } from "little-date";
import type { Dayjs } from "dayjs";

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

const createFormatTime = (locale?: string) => (date: Date): string =>
  formatTime(date, locale);

export const formatDate = (date: Date): string => {
  const today = new Date();
  const thisYear = isSameYear(date, today);
  const thisDay = isSameDay(date, today);
  const formatTimeWithLocale = createFormatTime("en-US");

  const timeSuffix = !isSameMinute(startOfDay(date), date)
    ? `, ${formatTimeWithLocale(date)}`
    : "";

  const yearSuffix = thisYear ? "" : `, ${format(date, "yyyy")}`;

  // If it's today and we have time, just show the time
  if (thisDay && timeSuffix) {
    return `Today, ${formatTimeWithLocale(date)}`;
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
