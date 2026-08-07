/**
 * Corporate email-domain allowlist — who is allowed to become a user of this
 * app at all.
 *
 * Enforced at BOTH points where a `commanders` row can come into existence,
 * because either one alone is only cosmetic:
 *   - routes/users.ts's POST /users — the admin-driven invite.
 *   - lib/auth.ts's resolveCommander — auto-provisioning on first Catalyst
 *     sign-in, which otherwise hands a reader row to any identity that can
 *     authenticate against the Catalyst project, invited or not.
 *
 * Deliberately NOT enforced on an already-claimed row: an existing user keeps
 * working even if their address is off-domain. Re-checking on every request
 * would mean tightening this list could instantly lock out everyone who
 * already has an account — including the last admin, with no way back in.
 * Removing an off-domain account is an admin action in the Users tab.
 */

/**
 * Fallback when ALLOWED_EMAIL_DOMAINS is unset. This app is internal to
 * Zoho Corp, so shipping locked to the corporate domain with no configuration
 * required is the safe default.
 */
const DEFAULT_ALLOWED_DOMAINS: readonly string[] = ["zohocorp.com"];

/**
 * The active allowlist, read from the environment on EVERY call rather than
 * memoized at module load — same reason as isSuperAdminEmail (lib/auth.ts):
 * it keeps tests able to set the var per-case, and avoids depending on import
 * order relative to whenever AppSail populates the environment.
 *
 * Accepts "zohocorp.com, @zoho.com" — a leading @ is tolerated because it is
 * the natural way to write a domain and silently rejecting every address
 * would be a miserable way to find out.
 *
 * Fails CLOSED: a value that parses to nothing (empty, whitespace, ",,,")
 * falls back to the default rather than being treated as "no restriction".
 */
export function allowedEmailDomains(): string[] {
  const parsed = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@+/, ""))
    .filter((domain) => domain.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_DOMAINS];
}

/**
 * Exact domain match — never a suffix match.
 *
 * `endsWith("zohocorp.com")` would be the obvious implementation and is
 * exactly the bug worth avoiding: it also accepts "evil-notzohocorp.com" and
 * "zohocorp.com.attacker.example". Subdomains ("in.zohocorp.com") are
 * likewise NOT matched unless listed explicitly, so widening the rule is
 * always a deliberate act.
 */
export function isAllowedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  // at < 1 covers both "no @ at all" (-1) and an empty local part ("@x.com").
  if (at < 1 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return allowedEmailDomains().includes(domain);
}

/** Human-readable allowlist for error messages and UI copy: "@zohocorp.com". */
export function formatAllowedDomains(): string {
  return allowedEmailDomains()
    .map((domain) => `@${domain}`)
    .join(", ");
}
