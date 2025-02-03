import parseDurationLibrary from "parse-duration";

export const parseDurationArgument = (rawDuration: string | undefined) => {
  if (rawDuration === undefined) {
    return undefined;
  }
  const duration = rawDuration?.replaceAll("_", "").replace(/\s+/g, "");
  if (
    duration.length === 0 ||
    duration.startsWith("-") ||
    duration.includes(".")
  ) {
    return undefined;
  }

  // For backwards compatibility, we want to support users passing in seconds directly.
  // Some of the CLI use to support seconds directly, now we support durations strings.
  const attemptedParseAsNumber = Number.parseInt(duration);

  if (
    !Number.isNaN(attemptedParseAsNumber) &&
    duration === attemptedParseAsNumber.toString()
  ) {
    return attemptedParseAsNumber;
  }

  if (Number.isNaN(attemptedParseAsNumber)) {
    // Ensure it's a positive integer and matches exactly
    if (duration !== attemptedParseAsNumber.toString()) {
      return undefined;
    }
  }

  const parsed = parseDurationLibrary(duration.toLowerCase());
  if (parsed == null || parsed === undefined) {
    return undefined;
  }

  // Convert from milliseconds to seconds
  return parsed / 1000;
};
