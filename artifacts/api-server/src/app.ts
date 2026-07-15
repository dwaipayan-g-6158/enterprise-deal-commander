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
import router from "./routes";
import { logger } from "./lib/logger";
import { HttpError, sendError } from "./lib/http";

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
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

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
    req.log?.error({ err }, "Unhandled error");
    sendError(
      res,
      new HttpError(500, "INTERNAL_ERROR", "An unexpected error occurred"),
    );
  },
);

export default app;
