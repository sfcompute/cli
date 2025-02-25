import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import {
  isValidRFC1123Subdomain,
  sanitizeToRFC1123Subdomain,
} from "./utils.ts";

Deno.test("isValidRFC1123Subdomain - valid subdomains", () => {
  const validSubdomains = [
    "example.com",
    "sub.domain.com",
    "a.com",
    "a.b.c",
    "valid-hyphenated-host.com",
    "test-subdomain.example.com",
    "multiple.subdomains.example.org",
    "123.com",
    "123.example.com",
    "sub-123.example.net",
    "xn--80akhbyknj4f.xn--p1ai", // IDN domain
    "xn--fiqs8s.example.cn", // Punycode domain
    "my-subdomain.example-site.co.uk",
    "a-very-long-hostname-that-is-allowed-under-rfc1123.com",
    `${"a".repeat(63)}.example.com`, // Max length label
  ];

  for (const subdomain of validSubdomains) {
    assertEquals(isValidRFC1123Subdomain(subdomain), true);
  }
});

Deno.test("isValidRFC1123Subdomain - invalid subdomains", () => {
  const invalidSubdomains = [
    "",
    " ",
    null,
    undefined,
    "UPPERCASE.com",
    "_invalid.example.com", // underscore not allowed
    "-invalid.example.com", // cannot start with hyphen
    "invalid-.example.com", // cannot end with hyphen
    "-example.com", // Cannot start with a hyphen
    "example-.com", // Cannot end with a hyphen
    "inv@lid.example.com", // @ not allowed
    "ex@mple.com", // Invalid character @
    `${"a".repeat(64)}.example.com`, // Label too long
    "example..com", // Empty label
    "example.com.", // Trailing dot (technically valid DNS but not RFC 1123 subdomain)
    ".example.com", // Leading dot
    " space.com", // Leading space is not allowed
    "example .com", // Space inside is not allowed
    "a".repeat(254), // Total length too long
  ];

  for (const subdomain of invalidSubdomains) {
    // @ts-ignore - Testing with null/undefined
    assertEquals(isValidRFC1123Subdomain(subdomain), false);
  }
});

Deno.test("sanitizeToRFC1123Subdomain - sanitize invalid inputs", () => {
  const testCases = [
    { input: "UPPERCASE.com", expected: "uppercase.com" },
    { input: "_invalid.example.com", expected: "xinvalid.example.com" },
    { input: "-invalid.example.com", expected: "xinvalid.example.com" },
    { input: "invalid-.example.com", expected: "invalidx.example.com" },
    { input: "inv@lid.example.com", expected: "inv-lid.example.com" },
    { input: "example..com", expected: "example.com" },
    { input: "example.com.", expected: "example.com.x" },
    { input: ".example.com", expected: "x.example.com" },
    { input: "a b c.com", expected: "a-b-c.com" },
    { input: "---test---", expected: "xtestx" },
    { input: "", expected: "" },
    { input: "   ", expected: "x" },
  ];

  for (const { input, expected } of testCases) {
    assertEquals(sanitizeToRFC1123Subdomain(input), expected);
  }
});

Deno.test("sanitizeToRFC1123Subdomain - truncate long inputs", () => {
  // Create a string longer than 253 characters
  const longInput = `${"a".repeat(300)}.example.com`;
  const result = sanitizeToRFC1123Subdomain(longInput);

  assertEquals(result.length <= 253, true);
  assertEquals(isValidRFC1123Subdomain(result), true);

  // Create a label longer than 63 characters
  const longLabel = `${"a".repeat(100)}.example.com`;
  const labelResult = sanitizeToRFC1123Subdomain(longLabel);

  const labels = labelResult.split(".");
  for (const label of labels) {
    assertEquals(label.length <= 63, true);
  }
  assertEquals(isValidRFC1123Subdomain(labelResult), true);
});
