/**
 * Validate an untrusted post-login redirect target, returning it only when it is
 * a same-site absolute path. Anything else — absent, not rooted at a single
 * "/", protocol-relative ("//host"), backslash-tricked ("/\\host", which
 * browsers fold toward "//host"), or carrying a scheme ("https://evil") — is
 * replaced by the fallback, closing the open-redirect hole where an attacker
 * supplies `?redirect=https://evil.com` and the app would navigate off-site.
 *
 * Tab/CR/LF are stripped first because browsers remove them from URLs before
 * resolving, so `"/\t/evil"` would otherwise collapse to "//evil".
 *
 * @param raw - The untrusted redirect value (e.g. from a query param)
 * @param fallback - The safe in-app path to fall back to
 * @returns The sanitized same-site path, or the fallback
 */
export function sanitizeRedirect(raw: string | null | undefined, fallback: string): string {
  if (!raw) {
    return fallback;
  }
  const cleaned = raw.replace(/[\t\n\r]/g, "").trim();
  if (!cleaned.startsWith("/") || cleaned.startsWith("//") || cleaned.startsWith("/\\")) {
    return fallback;
  }
  return cleaned;
}
