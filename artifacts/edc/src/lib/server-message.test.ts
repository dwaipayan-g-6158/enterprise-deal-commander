import { describe, it, expect } from "vitest";
import { serverMessage } from "./server-message";

describe("serverMessage", () => {
  it("prefers the API's structured error.message (ApiError.data shape)", () => {
    const err = { data: { error: { message: "risk_weight_technical must be a positive number, got abc" } } };
    expect(serverMessage(err, "fallback")).toBe(
      "risk_weight_technical must be a positive number, got abc",
    );
  });

  it("falls back to a plain Error's message when there is no structured body", () => {
    expect(serverMessage(new Error("network down"), "fallback")).toBe("network down");
  });

  it("falls back to the caller-supplied fallback when neither is present", () => {
    expect(serverMessage({}, "fallback")).toBe("fallback");
    expect(serverMessage(null, "fallback")).toBe("fallback");
    expect(serverMessage(undefined, "fallback")).toBe("fallback");
  });

  it("prefers the structured message over the Error message when both exist", () => {
    const err = Object.assign(new Error("generic HTTP 400"), {
      data: { error: { message: "specific reason" } },
    });
    expect(serverMessage(err, "fallback")).toBe("specific reason");
  });

  it("ignores a structured body with a blank/missing message and falls through", () => {
    expect(serverMessage({ data: { error: {} } }, "fallback")).toBe("fallback");
    expect(serverMessage({ data: {} }, "fallback")).toBe("fallback");
  });
});
