const METADATA_HOSTS = new Set(["169.254.169.254", "metadata.google.internal"]);

export type UrlDecision = { ok: true; url: URL } | { ok: false; reason: string };

export function evaluateUrl(raw: string, allowPrivate: boolean): UrlDecision {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_protocol" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_in_url" };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (METADATA_HOSTS.has(host) || isLinkLocal(host)) {
    return { ok: false, reason: "metadata_address_blocked" };
  }
  if (!allowPrivate && isPrivateHost(host) && !isLoopback(host)) {
    return { ok: false, reason: "private_address_blocked" };
  }
  return { ok: true, url };
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "::1" || host.startsWith("127.");
}

function isLinkLocal(host: string): boolean {
  return host.startsWith("169.254.");
}

function isPrivateHost(host: string): boolean {
  if (isLoopback(host) || host === "0.0.0.0" || host === "::") return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd"))) return true;
  const octets = host.split(".").map((part) => Number(part));
  const second = octets[1];
  if (
    octets.length === 4 &&
    octets[0] === 172 &&
    second !== undefined &&
    second >= 16 &&
    second <= 31
  ) {
    return true;
  }
  return false;
}
