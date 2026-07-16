export function readCookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== "string" || typeof name !== "string" || !name) return "";
  let found = false;
  let value = "";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0 || trimmed.slice(0, separator) !== name) continue;
    if (found) return "";
    found = true;
    try {
      value = decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      return "";
    }
  }
  return value;
}
