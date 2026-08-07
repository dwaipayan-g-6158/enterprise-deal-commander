import { describe, it, expect, afterEach } from "vitest";
import { allowedEmailDomains, isAllowedEmailDomain, formatAllowedDomains } from "./email-domain";

const ORIGINAL = process.env.ALLOWED_EMAIL_DOMAINS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOWED_EMAIL_DOMAINS;
  else process.env.ALLOWED_EMAIL_DOMAINS = ORIGINAL;
});

describe("allowedEmailDomains", () => {
  it("defaults to zohocorp.com when unset", () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    expect(allowedEmailDomains()).toEqual(["zohocorp.com"]);
  });

  it("parses a comma-separated list, tolerating spaces, case and a leading @", () => {
    process.env.ALLOWED_EMAIL_DOMAINS = " @ZohoCorp.com , zoho.com ";
    expect(allowedEmailDomains()).toEqual(["zohocorp.com", "zoho.com"]);
  });

  // Fail closed: a misconfigured var must not read as "no restriction at all".
  it.each(["", "   ", ",,,", " , @ , "])("falls back to the default for %o", (raw) => {
    process.env.ALLOWED_EMAIL_DOMAINS = raw;
    expect(allowedEmailDomains()).toEqual(["zohocorp.com"]);
  });

  it("re-reads the environment on every call", () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "one.example";
    expect(allowedEmailDomains()).toEqual(["one.example"]);
    process.env.ALLOWED_EMAIL_DOMAINS = "two.example";
    expect(allowedEmailDomains()).toEqual(["two.example"]);
  });
});

describe("isAllowedEmailDomain", () => {
  it("accepts an address on the allowed domain, whatever its case or padding", () => {
    for (const email of ["a@zohocorp.com", "A.B@ZOHOCORP.COM", " a@zohocorp.com "]) {
      expect(isAllowedEmailDomain(email)).toBe(true);
    }
  });

  // The whole point of matching exactly rather than with endsWith().
  it.each([
    "a@notzohocorp.com",
    "a@evil-zohocorp.com",
    "a@zohocorp.com.attacker.example",
    "a@zohocorp.co",
  ])("rejects the look-alike domain in %o", (email) => {
    expect(isAllowedEmailDomain(email)).toBe(false);
  });

  it("rejects a subdomain that is not listed explicitly", () => {
    expect(isAllowedEmailDomain("a@in.zohocorp.com")).toBe(false);
    process.env.ALLOWED_EMAIL_DOMAINS = "in.zohocorp.com";
    expect(isAllowedEmailDomain("a@in.zohocorp.com")).toBe(true);
    // ...and listing the subdomain does not re-admit the parent.
    expect(isAllowedEmailDomain("a@zohocorp.com")).toBe(false);
  });

  it("rejects an off-domain address", () => {
    expect(isAllowedEmailDomain("someone@gmail.com")).toBe(false);
  });

  it("matches on the LAST @, so a quoted local part cannot smuggle a domain in", () => {
    expect(isAllowedEmailDomain('"a@zohocorp.com"@gmail.com')).toBe(false);
    expect(isAllowedEmailDomain('"a@gmail.com"@zohocorp.com')).toBe(true);
  });

  it.each(["", "notanemail", "zohocorp.com", "@zohocorp.com", "a@"])(
    "rejects the malformed address %o",
    (email) => {
      expect(isAllowedEmailDomain(email)).toBe(false);
    },
  );

  it("honours a multi-domain allowlist", () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "zohocorp.com,zoho.com";
    expect(isAllowedEmailDomain("a@zoho.com")).toBe(true);
    expect(isAllowedEmailDomain("a@zohocorp.com")).toBe(true);
    expect(isAllowedEmailDomain("a@gmail.com")).toBe(false);
  });
});

describe("formatAllowedDomains", () => {
  it("renders each domain with an @ for use in error and UI copy", () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    expect(formatAllowedDomains()).toBe("@zohocorp.com");
    process.env.ALLOWED_EMAIL_DOMAINS = "zohocorp.com,zoho.com";
    expect(formatAllowedDomains()).toBe("@zohocorp.com, @zoho.com");
  });
});
