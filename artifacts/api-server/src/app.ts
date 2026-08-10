import path from "node:path";
import fs from "node:fs";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders } from "./lib/security-headers";
import { HttpError, badRequest, sendError } from "./lib/http";
import type { AuthedRequest } from "./lib/auth";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Before the router and the static handler, so every response this server
// produces carries them — including API JSON and the SPA shell.
app.use(securityHeaders);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Single-origin hosting: this same server can also serve the built SPA
// (copied to dist/public alongside dist/index.mjs by scripts/build-single.ts).
// `__dirname` resolves to dist/ at runtime via the esbuild banner in build.mjs.
// In local dev this directory doesn't exist (the frontend runs as its own
// Vite process instead), so the block below is a no-op there.
const publicDir = path.join(globalThis.__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      setHeaders(res, filePath) {
        // login-iframe.css themes the Catalyst sign-in iframe and is fetched by
        // URL, so — unlike everything under assets/ — it can never be
        // content-hashed: the URL is baked into the css_url we hand Zoho. Under
        // the hour-long default a deployed theme change stayed invisible to
        // anyone who had already loaded it, which is indistinguishable from a
        // deploy that did not happen and cost real debugging time. Revalidate
        // instead; it is one ~50KB request per sign-in and usually a 304.
        if (path.basename(filePath) === "login-iframe.css") {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }
        // Vite content-hashes filenames under assets/ (e.g. index-BD1Hl3s0.css)
        // — safe to cache forever, since a new build produces new hashes.
        res.setHeader(
          "Cache-Control",
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        );
      },
    }),
  );
  // SPA fallback: any non-/api, non-file route serves index.html so
  // client-side routing (wouter) handles it. Express 5 requires named
  // wildcards.
  //
  // Catalyst's own AppSail gateway reserves `/accounts/*` (the embedded
  // sign-in/sign-out iframe's IAM endpoints), `/__catalyst/*` (the SDK
  // init script), and `/baas/*` (the platform API the Web SDK calls) and is
  // supposed to intercept those requests before they
  // ever reach this app. When the gateway misses (observed live), the
  // request used to fall through to this catch-all and get served our own
  // index.html instead of Zoho's real IAM page/logout handler — which the
  // Catalyst Web SDK's own onload handler then crashes on (it expects a
  // `#login_id` field to exist in whatever document the iframe loaded),
  // producing a blank/inputless sign-in form, and silently no-ops sign-out
  // since the real logout endpoint never actually runs. Excluding these
  // prefixes turns a gateway miss into a loud 404 instead of a silent,
  // hard-to-diagnose recursion of our own SPA inside the login iframe.
  //
  // `/baas` was originally left OUT of this list on the strength of a console
  // log line showing `/baas/v1/project/.../project-user/current` 401ing,
  // which was read as proof the gateway intercepts that prefix. It does not:
  // fetching any `/baas/*` path from the deployed app returns 200 with our
  // own index.html. (Measured against the live app; the service worker is not
  // responsible, since `/api/*` — excluded here — correctly returns a JSON
  // 404 for the identical kind of non-navigation fetch.)
  app.get("/{*splat}", (req, res, next) => {
    if (
      req.path.startsWith("/api") ||
      req.path.startsWith("/accounts") ||
      req.path.startsWith("/__catalyst") ||
      req.path.startsWith("/baas")
    ) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(["/accounts", "/__catalyst", "/baas"], (req: Request, res: Response) => {
  sendError(
    res,
    new HttpError(
      404,
      "NOT_FOUND",
      `Catalyst gateway did not intercept ${req.method} ${req.path}`,
    ),
  );
});

app.use("/api", (req: Request, res: Response) => {
  sendError(
    res,
    new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`),
  );
});

/**
 * Best-effort structural description of a thrown non-Error. Truncated so a
 * large rejection payload can't be echoed back wholesale, and tolerant of
 * circular references (JSON.stringify throws on those, and an error handler
 * that throws is worse than one that says nothing).
 */
function describeNonError(err: unknown): unknown {
  try {
    const json = JSON.stringify(err);
    if (json && json !== "{}") {
      return json.length > 2000 ? `${json.slice(0, 2000)}…[truncated]` : JSON.parse(json);
    }
  } catch {
    /* circular or non-serializable — fall through to the shallow view */
  }
  if (typeof err !== "object" || err === null) return String(err);
  // A JSON of "{}" means own enumerable properties are absent (getters on the
  // prototype, non-enumerable fields) — read them off directly instead.
  const shallow: Record<string, string> = {};
  for (const key of Object.getOwnPropertyNames(err)) {
    shallow[key] = String((err as Record<string, unknown>)[key]).slice(0, 500);
  }
  shallow["__proto"] = Object.getPrototypeOf(err)?.constructor?.name ?? "unknown";
  shallow["__string"] = String(err);
  return shallow;
}

/**
 * Diagnostic detail attached to a 500 — but only for a signed-in ADMIN.
 *
 * On AppSail there is no practical way to read a stack trace: the DevOps log
 * console lags several minutes behind and pages so badly it routinely shows a
 * stale window, which has already cost this migration real debugging time. A
 * masked "An unexpected error occurred" is then genuinely undiagnosable —
 * the failure has to be re-derived by bisecting HTTP endpoints from a browser.
 *
 * Readers and unauthenticated callers still get the opaque message, so this
 * widens the disclosure surface only to the operators of an internal tool who
 * can already read every deal in the system. The `stack` is capped so a deep
 * async trace can't turn an error response into a payload.
 */
function adminErrorDetail(req: Request, err: unknown): unknown {
  if ((req as AuthedRequest).actor?.role !== "admin") return undefined;
  // NOT redundant with the Error branch below: the Catalyst SDK rejects with a
  // PLAIN OBJECT, not an Error instance (confirmed live — `String(err)` on a
  // Data Store rejection yields "[object Object]"). Anything that reaches this
  // handler having thrown a non-Error therefore has to be serialized
  // structurally, or the one detail that identifies the failure is lost.
  if (!(err instanceof Error)) return { thrownValue: describeNonError(err) };
  return {
    name: err.name,
    message: err.message,
    stack: err.stack?.split("\n").slice(0, 12).join("\n"),
    // Catalyst SDK errors carry the platform's own code/status alongside the
    // message (e.g. a Data Store concurrency rejection) — plain `message`
    // alone can drop the part that identifies which limit was hit.
    ...(typeof err === "object" && err !== null
      ? {
          code: (err as { code?: unknown }).code,
          statusCode: (err as { statusCode?: unknown }).statusCode,
        }
      : {}),
  };
}

app.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof HttpError) {
      sendError(res, err);
      return;
    }
    if (err instanceof ZodError) {
      // Also fires for RESPONSE-schema validation failures (a `.parse()` on the
      // way OUT, after a DB write may have already succeeded) — without this,
      // that case was a silent, undiagnosable 400 instead of a logged one. Not
      // distinguishing request-vs-response here; every occurrence just needs to
      // be logged so it's diagnosable, matching the generic 500 fallback below.
      req.log?.warn({ err }, "Zod validation error");
      sendError(res, badRequest("Invalid request", err.issues));
      return;
    }
    req.log?.error({ err }, "Unhandled error");
    sendError(
      res,
      new HttpError(
        500,
        "INTERNAL_ERROR",
        "An unexpected error occurred",
        adminErrorDetail(req, err),
      ),
    );
  },
);

export default app;
