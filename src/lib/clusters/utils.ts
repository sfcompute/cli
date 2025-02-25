/**
 * Validates if a string is a valid RFC 1123 subdomain.
 *
 * According to RFC 1123, a valid subdomain must:
 * - Consist of lowercase alphanumeric characters, '-' or '.'
 * - Start and end with an alphanumeric character
 * - Each label (parts between dots) must start and end with alphanumeric characters
 *
 * @param subdomain The string to validate
 * @returns True if the string is a valid RFC 1123 subdomain, false otherwise
 */
export function isValidRFC1123Subdomain(subdomain: string): boolean {
  if (!subdomain || typeof subdomain !== "string") {
    return false;
  }

  // Check for consecutive dots which would create empty labels
  if (subdomain.includes("..")) {
    return false;
  }

  // RFC 1123 compliant regex
  // - Starts with alphanumeric
  // - Can contain alphanumerics and hyphens in the middle
  // - Ends with alphanumeric
  // - Labels separated by dots must follow the same pattern
  const regex =
    /^[a-z0-9]([-.a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-.a-z0-9]*[a-z0-9])?)*$/;

  // Check length constraints (DNS limits labels to 63 chars, full name to 253)
  if (subdomain.length > 253) {
    return false;
  }

  // Check if any label exceeds 63 characters or ends with a hyphen
  const labels = subdomain.split(".");
  for (const label of labels) {
    if (label.length > 63) {
      return false;
    }
    // Explicitly check for labels ending with hyphens
    if (label.endsWith("-")) {
      return false;
    }
  }

  return regex.test(subdomain);
}

/**
 * Sanitizes a string to make it a valid RFC 1123 subdomain.
 *
 * @param input The string to sanitize
 * @returns A sanitized version of the input that conforms to RFC 1123 subdomain rules
 */
export function sanitizeToRFC1123Subdomain(input: string): string {
  if (!input) return "";

  // Convert to lowercase
  let result = input.toLowerCase();

  // Replace invalid characters with hyphens
  result = result.replace(/[^a-z0-9.-]/g, "-");

  // Replace multiple consecutive hyphens with a single hyphen
  result = result.replace(/-+/g, "-");

  // Replace multiple consecutive dots with a single dot
  result = result.replace(/\.+/g, ".");

  // Remove leading and trailing hyphens from each label
  result = result
    .split(".")
    .map((label) => {
      // If the label consists only of hyphens, replace with "x"
      if (/^-+$/.test(label)) {
        return "x";
      }

      // Handle leading and trailing hyphens
      const trimmed = label.replace(/^-+|-+$/g, "");

      // If the label is empty after trimming, return "x"
      if (!trimmed) {
        return "x";
      }

      // If the original label had leading hyphens, add "x" prefix
      const needsPrefix = label.startsWith("-");
      // If the original label had trailing hyphens, add "x" suffix
      const needsSuffix = label.endsWith("-");

      return (needsPrefix ? "x" : "") + trimmed + (needsSuffix ? "x" : "");
    })
    .join(".");

  // Ensure it starts and ends with alphanumeric
  if (!/^[a-z0-9]/.test(result)) {
    result = `x${result}`;
  }

  if (!/[a-z0-9]$/.test(result)) {
    result = `${result}x`;
  }

  // Truncate if necessary (253 chars max, each label 63 chars max)
  const labels = result.split(".");
  const truncatedLabels = labels.map((label) => label.substring(0, 63));
  result = truncatedLabels.join(".");

  return result.substring(0, 253);
}
