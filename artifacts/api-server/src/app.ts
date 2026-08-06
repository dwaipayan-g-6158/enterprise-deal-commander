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
import { HttpError, badRequest, sendError } from "./lib/http";

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
  // sign-in/sign-out iframe's IAM endpoints) and `/__catalyst/*` (the SDK
  // init script) and is supposed to intercept those requests before they
  // ever reach this app. When the gateway misses (observed live), the
  // request used to fall through to this catch-all and get served our own
  // index.html instead of Zoho's real IAM page/logout handler — which the
  // Catalyst Web SDK's own onload handler then crashes on (it expects a
  // `#login_id` field to exist in whatever document the iframe loaded),
  // producing a blank/inputless sign-in form, and silently no-ops sign-out
  // since the real logout endpoint never actually runs. Excluding these
  // prefixes turns a gateway miss into a loud 404 instead of a silent,
  // hard-to-diagnose recursion of our own SPA inside the login iframe.
  app.get("/{*splat}", (req, res, next) => {
    if (
      req.path.startsWith("/api") ||
      req.path.startsWith("/accounts") ||
      req.path.startsWith("/__catalyst")
    ) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(["/accounts", "/__catalyst"], (req: Request, res: Response) => {
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
      new HttpError(500, "INTERNAL_ERROR", "An unexpected error occurred"),
    );
  },
);

export default app;
