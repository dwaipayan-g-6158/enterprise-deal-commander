import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Express, Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { HttpError } from "./lib/http";
import type { AuthedRequest } from "./lib/auth";

/**
 * Proof that app.ts's error middleware turns each class of thrown value into
 * the right response — most importantly that a raw, uncaught ZodError comes
 * back as a legible 400 in the standard sendError envelope rather than an
 * unexplained 500 (src/app.ts, the branch added alongside the HttpError one).
 *
 * How this reaches the middleware matters, because the obvious route is closed.
 * The original version of this test minted a session cookie over a
 * Postgres-backed commanders row and POSTed a bad body to a real handler; after
 * the Catalyst migration every route that parses a body sits behind requireAuth,
 * which resolves identity through a Zoho Catalyst session no unit test can
 * manufacture. Rebuilding a replica middleware chain — the compromise
 * routes/index.rbac.test.ts makes for its own, different subject — would not
 * work here either: a replica of the error handler is not the error handler,
 * and this file's whole point is that app.ts's own branches behave.
 *
 * So the REAL middleware function is pulled off the real app's router stack and
 * invoked directly. `globalThis.__dirname` is set first because app.ts reads it
 * at module scope to locate the built SPA (the esbuild banner in build.mjs
 * supplies it in production); pointing it at a directory that does not exist
 * makes the static-hosting block a no-op, exactly as in local dev.
 */

type ErrorMiddleware = (err: unknown, req: Request, res: Response, next: NextFunction) => void;

interface CapturedResponse {
  status: number;
  body: { error?: { code?: string; message?: string; details?: unknown } };
}

let app: Express;
let errorMiddleware: ErrorMiddleware;
let server: ReturnType<Express["listen"]>;
let base: string;

/** The real 4-arity error handler registered by app.ts, found on the app's own router stack. */
function findErrorMiddleware(a: Express): ErrorMiddleware {
  const stack = (a as unknown as { router?: { stack: Array<{ handle?: unknown }> } }).router?.stack
    ?? (a as unknown as { _router?: { stack: Array<{ handle?: unknown }> } })._router?.stack
    ?? [];
  const layer = [...stack].reverse().find(
    (l) => typeof l.handle === "function" && (l.handle as { length: number }).length === 4,
  );
  if (!layer) throw new Error("app.ts registered no 4-arity error middleware");
  return layer.handle as ErrorMiddleware;
}

function runErrorMiddleware(err: unknown, actorRole?: "admin" | "reader"): CapturedResponse {
  const captured: CapturedResponse = { status: 0, body: {} };
  const req = {
    log: { warn: () => {}, error: () => {} },
    method: "POST",
    path: "/api/v2/playbooks",
    ...(actorRole
      ? { actor: { id: "test-actor", username: "test", displayName: "Test", role: actorRole } }
      : {}),
  } as unknown as AuthedRequest as unknown as Request;
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: CapturedResponse["body"]) {
      captured.body = body;
      return this;
    },
  } as unknown as Response;

  errorMiddleware(err, req, res, () => {
    throw new Error("error middleware called next() instead of responding");
  });
  return captured;
}

/** A genuine ZodError, produced the way a handler's own `.parse()` produces one. */
function realZodError(): ZodError {
  const schema = z.object({ playbook_name: z.string(), applicable_stage: z.string() });
  try {
    schema.parse({ applicable_stage: 42 });
  } catch (err) {
    return err as ZodError;
  }
  throw new Error("expected the schema to reject");
}

beforeAll(async () => {
  // Must be set BEFORE the import: app.ts reads it at module scope.
  (globalThis as { __dirname?: string }).__dirname = "/nonexistent-appsail-dist-for-tests";
  app = (await import("./app")).default;
  errorMiddleware = findErrorMiddleware(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("app.ts error middleware: raw ZodError -> 400", () => {
  it("answers a raw ZodError with 400 BAD_REQUEST and the issue list, not a 500", () => {
    const res = runErrorMiddleware(realZodError());

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("BAD_REQUEST");
    expect(res.body.error?.message).toBe("Invalid request");
    // The issues are what make the 400 legible — a bare "Invalid request" with
    // no details is barely better than the 500 this branch replaced.
    const details = res.body.error?.details as Array<{ path: unknown[] }> | undefined;
    expect(Array.isArray(details)).toBe(true);
    expect(details!.length).toBeGreaterThan(0);
    expect(details!.map((d) => d.path.join("."))).toContain("playbook_name");
  });

  it("passes an HttpError through with its own status and code", () => {
    const res = runErrorMiddleware(new HttpError(409, "STAGE_GUARDRAIL", "Blocked by a RED alert"));

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("STAGE_GUARDRAIL");
    expect(res.body.error?.message).toBe("Blocked by a RED alert");
  });

  it("masks anything else as an opaque 500 for a non-admin", () => {
    const res = runErrorMiddleware(new Error("connection reset by peer"));

    expect(res.status).toBe(500);
    expect(res.body.error?.code).toBe("INTERNAL_ERROR");
    expect(res.body.error?.message).toBe("An unexpected error occurred");
    // No stack, no message leak, for a reader or an unauthenticated caller.
    expect(res.body.error?.details).toBeUndefined();
    expect(runErrorMiddleware(new Error("boom"), "reader").body.error?.details).toBeUndefined();
  });

  it("gives an admin the diagnostic detail, including for a thrown non-Error", () => {
    const fromError = runErrorMiddleware(new Error("connection reset by peer"), "admin");
    expect(fromError.status).toBe(500);
    expect((fromError.body.error?.details as { message?: string }).message).toBe(
      "connection reset by peer",
    );

    // The Catalyst SDK rejects with a PLAIN OBJECT, not an Error — `String(err)`
    // on one yields "[object Object]", so without the structural branch the one
    // detail that identifies the failure is lost.
    const fromPlainObject = runErrorMiddleware(
      { statusCode: 400, code: "INVALID_INPUT", message: "Invalid column name key_lessons" },
      "admin",
    );
    expect(fromPlainObject.status).toBe(500);
    const thrown = (fromPlainObject.body.error?.details as { thrownValue?: { code?: string } })
      .thrownValue;
    expect(thrown?.code).toBe("INVALID_INPUT");
  });
});

describe("app.ts fallthrough handlers", () => {
  it("answers an unmatched /api path with a JSON 401, never leaking which routes exist", async () => {
    // Not a 404: routes/index.ts mounts requireAuth path-lessly, so the gate
    // closes BEFORE route matching and an unauthenticated caller cannot probe
    // the route table. app.ts's own /api 404 handler is only reachable behind a
    // resolved session. Either way the body is the sendError envelope, not HTML.
    const res = await fetch(`${base}/api/v1/definitely-not-a-route`);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHORIZED");
  });

  it("still serves the public health route above the gate", async () => {
    // The counterweight to the assertion above: the gate is path-less, so this
    // proves it is mounted BELOW healthRouter rather than in front of everything.
    const res = await fetch(`${base}/api/healthz`);
    expect(res.status).toBe(200);
  });

  it("answers a Catalyst-reserved prefix with a loud 404 instead of the SPA", async () => {
    // A gateway miss on /baas used to fall through to the SPA catch-all and get
    // served index.html, which the Catalyst Web SDK then crashed on — a blank
    // sign-in iframe and a sign-out that never ended the session.
    for (const prefix of ["/accounts", "/__catalyst", "/baas"]) {
      const res = await fetch(`${base}${prefix}/v1/anything`);
      expect(res.status, `${prefix} should 404`).toBe(404);
      const body = (await res.json()) as { error?: { message?: string } };
      expect(body.error?.message).toContain("Catalyst gateway did not intercept");
    }
  });
});
