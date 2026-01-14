import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isIpSafe, isUrlSafe, resolveAndValidateHostname } from "@/lib/services/upstream-ssrf-validator";
import * as dns from "dns";

// Mock DNS module for hostname resolution tests
vi.mock("dns", () => ({
  default: {},
  promises: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

describe("upstream-ssrf-validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isIpSafe", () => {
    describe("IPv4 - Safe addresses", () => {
      it("should allow public IPv4 addresses", () => {
        const result = isIpSafe("8.8.8.8");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow Cloudflare DNS", () => {
        const result = isIpSafe("1.1.1.1");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow public IP 93.184.216.34", () => {
        const result = isIpSafe("93.184.216.34");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("IPv4 - Loopback addresses", () => {
      it("should block 127.0.0.1", () => {
        const result = isIpSafe("127.0.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("should block 127.0.0.2", () => {
        const result = isIpSafe("127.0.0.2");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("should block 127.255.255.255", () => {
        const result = isIpSafe("127.255.255.255");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });
    });

    describe("IPv4 - Private addresses", () => {
      it("should block 10.0.0.0/8 - 10.0.0.1", () => {
        const result = isIpSafe("10.0.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should block 10.0.0.0/8 - 10.255.255.255", () => {
        const result = isIpSafe("10.255.255.255");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should block 172.16.0.0/12 - 172.16.0.1", () => {
        const result = isIpSafe("172.16.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should block 172.16.0.0/12 - 172.31.255.255", () => {
        const result = isIpSafe("172.31.255.255");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should allow 172.15.255.255 (outside private range)", () => {
        const result = isIpSafe("172.15.255.255");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow 172.32.0.1 (outside private range)", () => {
        const result = isIpSafe("172.32.0.1");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should block 192.168.0.0/16 - 192.168.0.1", () => {
        const result = isIpSafe("192.168.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should block 192.168.0.0/16 - 192.168.255.255", () => {
        const result = isIpSafe("192.168.255.255");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should allow 192.167.1.1 (outside private range)", () => {
        const result = isIpSafe("192.167.1.1");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow 192.169.1.1 (outside private range)", () => {
        const result = isIpSafe("192.169.1.1");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("IPv4 - Link-local addresses (AWS metadata)", () => {
      it("should block 169.254.0.0", () => {
        const result = isIpSafe("169.254.0.0");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Link-local addresses (cloud metadata endpoints) are not allowed");
      });

      it("should block 169.254.169.254 (AWS metadata)", () => {
        const result = isIpSafe("169.254.169.254");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Link-local addresses (cloud metadata endpoints) are not allowed");
      });

      it("should block 169.254.255.255", () => {
        const result = isIpSafe("169.254.255.255");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Link-local addresses (cloud metadata endpoints) are not allowed");
      });

      it("should allow 169.253.1.1 (outside link-local range)", () => {
        const result = isIpSafe("169.253.1.1");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow 169.255.1.1 (outside link-local range)", () => {
        const result = isIpSafe("169.255.1.1");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("IPv4 - Invalid formats", () => {
      it("should block invalid IP with octet > 255", () => {
        const result = isIpSafe("256.1.1.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Invalid IP format");
      });

      it("should block invalid IP with multiple octets > 255", () => {
        const result = isIpSafe("300.400.500.600");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Invalid IP format");
      });

      it("should block invalid IP 192.168.1.256", () => {
        const result = isIpSafe("192.168.1.256");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Invalid IP format");
      });
    });

    describe("IPv6 - Safe addresses", () => {
      it("should allow public IPv6 address", () => {
        const result = isIpSafe("2001:4860:4860::8888");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow Cloudflare IPv6", () => {
        const result = isIpSafe("2606:4700:4700::1111");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow full IPv6 address", () => {
        const result = isIpSafe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("IPv6 - Loopback addresses", () => {
      it("should block ::1 (IPv6 loopback)", () => {
        const result = isIpSafe("::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });
    });

    describe("IPv6 - Private addresses", () => {
      it("should block fc00::/7 - fc00::1", () => {
        const result = isIpSafe("fc00::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 private addresses are not allowed");
      });

      it("should block fc00::/7 - fd00::1", () => {
        const result = isIpSafe("fd00::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 private addresses are not allowed");
      });

      it("should block fc00::/7 - FC00::1 (uppercase)", () => {
        const result = isIpSafe("FC00::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 private addresses are not allowed");
      });

      it("should block fc00::/7 - FD00::1 (uppercase)", () => {
        const result = isIpSafe("FD00::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 private addresses are not allowed");
      });
    });

    describe("IPv6 - Link-local addresses", () => {
      it("should block fe80::/10 - fe80::1", () => {
        const result = isIpSafe("fe80::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 link-local addresses are not allowed");
      });

      it("should block fe80::/10 - FE80::1 (uppercase)", () => {
        const result = isIpSafe("FE80::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 link-local addresses are not allowed");
      });
    });

    describe("IPv6 - Multicast addresses", () => {
      it("should block ff00::/8 - ff00::1", () => {
        const result = isIpSafe("ff00::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 multicast addresses are not allowed");
      });

      it("should block ff00::/8 - ff02::1", () => {
        const result = isIpSafe("ff02::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 multicast addresses are not allowed");
      });

      it("should block ff00::/8 - FF00::1 (uppercase)", () => {
        const result = isIpSafe("FF00::1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv6 multicast addresses are not allowed");
      });
    });

    describe("IPv6 - IPv4-mapped and IPv4-compatible addresses", () => {
      it("should block IPv4-mapped IPv6 ::ffff:192.168.1.1", () => {
        const result = isIpSafe("::ffff:192.168.1.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv4-mapped IPv6 addresses are not allowed");
      });

      it("should block IPv4-mapped IPv6 ::FFFF:192.168.1.1 (uppercase)", () => {
        const result = isIpSafe("::FFFF:192.168.1.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv4-mapped IPv6 addresses are not allowed");
      });

      it("should block IPv4-compatible IPv6 ::192.168.1.1", () => {
        const result = isIpSafe("::192.168.1.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv4-compatible IPv6 addresses are not allowed");
      });

      it("should block IPv4-compatible IPv6 ::127.0.0.1", () => {
        const result = isIpSafe("::127.0.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("IPv4-compatible IPv6 addresses are not allowed");
      });
    });

    describe("Edge cases", () => {
      it("should allow non-IP hostname-like strings", () => {
        const result = isIpSafe("example.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow empty string", () => {
        const result = isIpSafe("");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });
  });

  describe("isUrlSafe", () => {
    describe("Safe URLs", () => {
      it("should allow https://api.openai.com", () => {
        const result = isUrlSafe("https://api.openai.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow http://example.com", () => {
        const result = isUrlSafe("http://example.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow https://api.anthropic.com/v1/messages", () => {
        const result = isUrlSafe("https://api.anthropic.com/v1/messages");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow URL with port", () => {
        const result = isUrlSafe("https://example.com:8080/api");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow URL with query parameters", () => {
        const result = isUrlSafe("https://example.com/api?key=value&foo=bar");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow URL with public IP", () => {
        const result = isUrlSafe("https://8.8.8.8/api");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("Unsafe protocols", () => {
      it("should block ftp:// protocol", () => {
        const result = isUrlSafe("ftp://example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Only HTTP and HTTPS protocols are allowed");
      });

      it("should block file:// protocol", () => {
        const result = isUrlSafe("file:///etc/passwd");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Only HTTP and HTTPS protocols are allowed");
      });

      it("should block gopher:// protocol", () => {
        const result = isUrlSafe("gopher://example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Only HTTP and HTTPS protocols are allowed");
      });

      it("should block data:// protocol", () => {
        const result = isUrlSafe("data:text/plain,hello");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Only HTTP and HTTPS protocols are allowed");
      });
    });

    describe("Localhost and loopback", () => {
      it("should block http://localhost", () => {
        const result = isUrlSafe("http://localhost");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("should block https://localhost:3000", () => {
        const result = isUrlSafe("https://localhost:3000");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("should block http://LOCALHOST (case insensitive)", () => {
        const result = isUrlSafe("http://LOCALHOST");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("should block http://127.0.0.1", () => {
        const result = isUrlSafe("http://127.0.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });

      it("should block http://127.0.0.2", () => {
        const result = isUrlSafe("http://127.0.0.2");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Loopback addresses are not allowed");
      });
    });

    describe("Private IP addresses", () => {
      it("should block http://10.0.0.1", () => {
        const result = isUrlSafe("http://10.0.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should block http://192.168.1.1", () => {
        const result = isUrlSafe("http://192.168.1.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });

      it("should block http://172.16.0.1", () => {
        const result = isUrlSafe("http://172.16.0.1");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Private IP addresses are not allowed");
      });
    });

    describe("Link-local addresses (cloud metadata)", () => {
      it("should block http://169.254.169.254 (AWS metadata)", () => {
        const result = isUrlSafe("http://169.254.169.254");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Link-local addresses (cloud metadata endpoints) are not allowed");
      });

      it("should block http://169.254.169.254/latest/meta-data/", () => {
        const result = isUrlSafe("http://169.254.169.254/latest/meta-data/");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Link-local addresses (cloud metadata endpoints) are not allowed");
      });
    });

    describe("IPv6 addresses in URLs", () => {
      it("should allow public IPv6 in URL", () => {
        const result = isUrlSafe("http://[2001:4860:4860::8888]");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      // Note: IPv6 addresses in URLs are parsed with brackets by URL constructor,
      // so they don't match the /^[\d.:]+$/ regex and aren't validated by isIpSafe.
      // This is a limitation of the current implementation.
      it("should allow private IPv6 in URL (current behavior - not validated)", () => {
        const result = isUrlSafe("http://[fc00::1]");
        // Current implementation doesn't validate IPv6 in URLs due to brackets
        expect(result.safe).toBe(true);
      });

      it("should allow link-local IPv6 in URL (current behavior - not validated)", () => {
        const result = isUrlSafe("http://[fe80::1]");
        // Current implementation doesn't validate IPv6 in URLs due to brackets
        expect(result.safe).toBe(true);
      });

      it("should allow IPv6 loopback in URL (current behavior - not validated)", () => {
        const result = isUrlSafe("http://[::1]");
        // Current implementation doesn't validate IPv6 in URLs due to brackets
        expect(result.safe).toBe(true);
      });
    });

    describe("Invalid URLs", () => {
      it("should block invalid URL format", () => {
        const result = isUrlSafe("not a url");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });

      it("should block empty string", () => {
        const result = isUrlSafe("");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });

      it("should block malformed URL", () => {
        const result = isUrlSafe("http://");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("Invalid URL format");
      });
    });
  });

  describe("resolveAndValidateHostname", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe("Safe hostnames", () => {
      it("should allow hostname resolving to public IPv4", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("api.openai.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(dns.promises.resolve4).toHaveBeenCalledWith("api.openai.com");
      });

      it("should allow hostname resolving to multiple public IPs", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8", "1.1.1.1"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("example.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it("should allow hostname resolving to public IPv6", async () => {
        vi.mocked(dns.promises.resolve4).mockRejectedValue(new Error("No IPv4"));
        vi.mocked(dns.promises.resolve6).mockResolvedValue(["2001:4860:4860::8888"]);

        const result = await resolveAndValidateHostname("ipv6.example.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
        expect(dns.promises.resolve6).toHaveBeenCalledWith("ipv6.example.com");
      });

      it("should allow hostname resolving to both IPv4 and IPv6", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8"]);
        vi.mocked(dns.promises.resolve6).mockResolvedValue(["2001:4860:4860::8888"]);

        const result = await resolveAndValidateHostname("dual-stack.example.com");
        expect(result.safe).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe("Unsafe hostnames", () => {
      it("should block hostname resolving to private IPv4", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["192.168.1.1"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("internal.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toContain("Hostname resolves to blocked IP");
        expect(result.reason).toContain("Private IP addresses are not allowed");
      });

      it("should block hostname resolving to loopback", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["127.0.0.1"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("localhost.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toContain("Hostname resolves to blocked IP");
        expect(result.reason).toContain("Loopback addresses are not allowed");
      });

      it("should block hostname resolving to link-local (AWS metadata)", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["169.254.169.254"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("metadata.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toContain("Hostname resolves to blocked IP");
        expect(result.reason).toContain("Link-local addresses");
      });

      it("should block hostname resolving to private IPv6", async () => {
        vi.mocked(dns.promises.resolve4).mockRejectedValue(new Error("No IPv4"));
        vi.mocked(dns.promises.resolve6).mockResolvedValue(["fc00::1"]);

        const result = await resolveAndValidateHostname("internal-v6.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toContain("Hostname resolves to blocked IP");
        expect(result.reason).toContain("IPv6 private addresses are not allowed");
      });

      it("should block if any resolved IP is unsafe (mixed safe/unsafe)", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8", "192.168.1.1"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("mixed.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toContain("Hostname resolves to blocked IP");
      });
    });

    describe("DNS resolution failures", () => {
      it("should block when DNS resolution fails completely", async () => {
        vi.mocked(dns.promises.resolve4).mockRejectedValue(new Error("DNS lookup failed"));
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("DNS lookup failed"));

        const result = await resolveAndValidateHostname("nonexistent.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("DNS resolution failed");
      });

      it("should block when both IPv4 and IPv6 resolution fail", async () => {
        vi.mocked(dns.promises.resolve4).mockRejectedValue(new Error("NXDOMAIN"));
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("NXDOMAIN"));

        const result = await resolveAndValidateHostname("invalid.test");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("DNS resolution failed");
      });

      it("should handle DNS timeout errors", async () => {
        vi.mocked(dns.promises.resolve4).mockRejectedValue(new Error("ETIMEDOUT"));
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("ETIMEDOUT"));

        const result = await resolveAndValidateHostname("timeout.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("DNS resolution failed");
      });

      it("should handle generic DNS errors", async () => {
        // When both resolve4 and resolve6 fail, addresses array is empty
        // and the function returns "DNS resolution failed" before the outer catch
        const error = new Error("DNS server error");
        vi.mocked(dns.promises.resolve4).mockRejectedValue(error);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(error);

        const result = await resolveAndValidateHostname("error.example.com");
        expect(result.safe).toBe(false);
        // The function returns "DNS resolution failed" when addresses array is empty
        expect(result.reason).toBe("DNS resolution failed");
      });

      it("should handle non-Error exceptions", async () => {
        vi.mocked(dns.promises.resolve4).mockRejectedValue("string error");
        vi.mocked(dns.promises.resolve6).mockRejectedValue("string error");

        const result = await resolveAndValidateHostname("weird-error.example.com");
        expect(result.safe).toBe(false);
        expect(result.reason).toBe("DNS resolution failed");
      });
    });

    describe("Edge cases", () => {
      it("should handle hostname with uppercase letters", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("API.EXAMPLE.COM");
        expect(result.safe).toBe(true);
        expect(dns.promises.resolve4).toHaveBeenCalledWith("API.EXAMPLE.COM");
      });

      it("should handle hostname with subdomain", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("api.v1.example.com");
        expect(result.safe).toBe(true);
      });

      it("should handle hostname with many subdomains", async () => {
        vi.mocked(dns.promises.resolve4).mockResolvedValue(["8.8.8.8"]);
        vi.mocked(dns.promises.resolve6).mockRejectedValue(new Error("No IPv6"));

        const result = await resolveAndValidateHostname("a.b.c.d.e.example.com");
        expect(result.safe).toBe(true);
      });
    });
  });
});
