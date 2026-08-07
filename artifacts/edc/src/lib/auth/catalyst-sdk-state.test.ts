import { describe, it, expect } from "vitest";
import { isCatalystSdkReady } from "./catalyst-sdk-state";

describe("isCatalystSdkReady", () => {
  it("is ready only when auth.signIn is actually callable", () => {
    expect(isCatalystSdkReady({ auth: { signIn: () => {} } })).toBe(true);
  });

  // The regression this predicate exists for. When the platform-served
  // /__catalyst/sdk/init.js fails to load (it is intercepted by the Catalyst
  // AppSail gateway, so it 404s anywhere else — notably localhost), the CDN
  // Web SDK has still run and left a bare `auth` object behind with no
  // project config and no signIn. The old guard tested `!candidate.auth`,
  // which is falsy here, so it reported READY and let signIn() be called on
  // an uninitialized SDK — producing a blank, inputless sign-in card with no
  // error anywhere.
  it("is NOT ready when the CDN script loaded but init.js did not", () => {
    expect(isCatalystSdkReady({ auth: {} })).toBe(false);
  });

  it("is not ready when signIn is present but not a function", () => {
    expect(isCatalystSdkReady({ auth: { signIn: "nope" } })).toBe(false);
  });

  it("is not ready for a missing, empty, or non-object SDK handle", () => {
    expect(isCatalystSdkReady(undefined)).toBe(false);
    expect(isCatalystSdkReady(null)).toBe(false);
    expect(isCatalystSdkReady({})).toBe(false);
    expect(isCatalystSdkReady({ auth: null })).toBe(false);
    expect(isCatalystSdkReady("catalyst")).toBe(false);
  });
});
