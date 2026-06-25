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

app.use((req: Request, res: Response) => {
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
