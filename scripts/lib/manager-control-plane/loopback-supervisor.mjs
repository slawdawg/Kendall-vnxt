/**
 * Parse and validate the uncredentialed loopback supervisor base URL shared by
 * manager-to-supervisor integrations.
 */
export function parseLoopbackSupervisorUrl(supervisorUrl) {
  let parsed;
  try {
    parsed = new URL(requiredString(supervisorUrl, "supervisorUrl", 2048));
  } catch (error) {
    throw new TypeError("supervisorUrl must be an absolute loopback HTTP(S) URL.", { cause: error });
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new TypeError("supervisorUrl must use a loopback host: localhost, 127.0.0.1, or ::1.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError("supervisorUrl must be an uncredentialed loopback HTTP(S) base URL.");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new TypeError("supervisorUrl must not include an application path.");
  }
  return parsed;
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${field} must be a non-empty bounded string.`);
  }
  return value;
}
