import * as dns from "dns";

/**
 * Validates an IP address to prevent SSRF attacks.
 * Blocks private IPs, loopback addresses, link-local addresses, and cloud metadata endpoints.
 */
export function isIpSafe(ip: string): { safe: boolean; reason?: string } {
  // Block loopback addresses
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("127.")) {
    return { safe: false, reason: "Loopback addresses are not allowed" };
  }

  // Check IPv4
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ip.match(ipv4Regex);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    // Validate octets are in valid range 0-255
    if (a > 255 || b > 255 || c > 255 || d > 255) {
      return { safe: false, reason: "Invalid IP format" };
    }
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return { safe: false, reason: "Private IP addresses are not allowed" };
    }
    // Link-local 169.254.0.0/16 (AWS metadata)
    if (a === 169 && b === 254) {
      return {
        safe: false,
        reason: "Link-local addresses (cloud metadata endpoints) are not allowed",
      };
    }
    return { safe: true };
  }

  // Check IPv6
  if (ip.includes(":")) {
    const lowerIp = ip.toLowerCase();
    // Block fc00::/7 (unique local addresses)
    if (lowerIp.startsWith("fc") || lowerIp.startsWith("fd")) {
      return { safe: false, reason: "IPv6 private addresses are not allowed" };
    }
    // Block fe80::/10 (link-local)
    if (lowerIp.startsWith("fe80")) {
      return { safe: false, reason: "IPv6 link-local addresses are not allowed" };
    }
    // Block ff00::/8 (multicast)
    if (lowerIp.startsWith("ff")) {
      return { safe: false, reason: "IPv6 multicast addresses are not allowed" };
    }
    // Block IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
    if (lowerIp.includes("::ffff:")) {
      return { safe: false, reason: "IPv4-mapped IPv6 addresses are not allowed" };
    }
    // Block IPv4-compatible IPv6 addresses (::x.x.x.x)
    if (lowerIp.match(/^::[\d.]+$/)) {
      return { safe: false, reason: "IPv4-compatible IPv6 addresses are not allowed" };
    }
    return { safe: true };
  }

  return { safe: true };
}

/**
 * Validates a URL to prevent SSRF attacks.
 * Blocks private IPs, loopback addresses, link-local addresses, and cloud metadata endpoints.
 */
export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http and https
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { safe: false, reason: "Only HTTP and HTTPS protocols are allowed" };
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost
    if (hostname === "localhost") {
      return { safe: false, reason: "Loopback addresses are not allowed" };
    }

    // If hostname looks like an IP address, validate it
    if (hostname.match(/^[\d.:]+$/)) {
      return isIpSafe(hostname);
    }

    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }
}

/**
 * Resolves a hostname to IP addresses and validates all IPs to prevent DNS rebinding attacks.
 */
export async function resolveAndValidateHostname(
  hostname: string
): Promise<{ safe: boolean; reason?: string }> {
  try {
    // Resolve both IPv4 and IPv6 addresses
    const addresses: string[] = [];

    try {
      const ipv4Addresses = await dns.promises.resolve4(hostname);
      addresses.push(...ipv4Addresses);
    } catch {
      // IPv4 resolution may fail if only IPv6 is available
    }

    try {
      const ipv6Addresses = await dns.promises.resolve6(hostname);
      addresses.push(...ipv6Addresses);
    } catch {
      // IPv6 resolution may fail if only IPv4 is available
    }

    // If no addresses resolved, treat as DNS failure
    if (addresses.length === 0) {
      return { safe: false, reason: "DNS resolution failed" };
    }

    // Validate all resolved IP addresses
    for (const ip of addresses) {
      const ipCheck = isIpSafe(ip);
      if (!ipCheck.safe) {
        return {
          safe: false,
          reason: `Hostname resolves to blocked IP: ${ipCheck.reason}`,
        };
      }
    }

    return { safe: true };
  } catch (error) {
    // DNS resolution errors are treated as unsafe
    return {
      safe: false,
      reason: error instanceof Error ? error.message : "DNS resolution failed",
    };
  }
}
