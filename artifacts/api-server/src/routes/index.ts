import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { authPublicRouter, authSessionRouter } from "./auth";
import sharedRouter from "./shared";
import usersRouter from "./users";
import dealsRouter from "./deals";
import gatesRouter from "./gates";
import blockersRouter from "./blockers";
import crossSellsRouter from "./crosssells";
import intelligenceRouter from "./intelligence";
import dispositionsRouter from "./dispositions";
import interventionsRouter from "./interventions";
import auditRouter from "./audit";
import batSignalRouter from "./batsignal";
import lookupsRouter from "./lookups";
import settingsAuditRouter from "./settings-audit";
import v2Router from "./v2";
import { cacheInvalidationMiddleware } from "../lib/cache-middleware";
import { requireAuth } from "../lib/auth";
import { requireWriteRole } from "../lib/rbac";

const router: IRouter = Router();

/* ======================= PUBLIC — no cookie required ======================
 * Everything registered above the gate is reachable unauthenticated. Adding
 * anything here is a deliberate decision; routes/index.rbac.test.ts pins this
 * exact set and fails if it grows.
 * ========================================================================= */
router.use(healthRouter); // GET /api/healthz
router.use(cacheInvalidationMiddleware); // GET is a no-op; only hooks res "finish"
router.use("/v1", authPublicRouter); // POST /auth/login, POST /auth/logout
router.use("/v1", sharedRouter); // GET /share/:token (Bat-Signal)

/* ============================== THE GATE =================================
 * Path-less `.use` matches every remaining path (router@2 Layer "/" fast-path
 * with end:false). These two lines are the ENTIRE authorization surface of
 * the application:
 *
 *   requireAuth      401 unless the cookie maps to an ACTIVE commanders row.
 *                    Role is read from that row, not from the token, so a
 *                    demotion or deactivation takes effect on the next
 *                    request instead of in up to 7 days.
 *   requireWriteRole 403 unless admin / safe method / exact allowlist hit.
 *
 * Do not reorder. Do not add a router above this line without a review that
 * covers both authentication AND write authorization. The pre-RBAC code had a
 * live instance of exactly that bug: routes/settings-audit.ts never called
 * requireAuth and was protected only because dealsRouter's path-less
 * `.use(requireAuth)` happened to be mounted earlier at the same "/v1" prefix.
 * ========================================================================= */
router.use(requireAuth);
router.use(requireWriteRole);

/* ============================= PROTECTED ================================= */
router.use("/v1", authSessionRouter); // GET /auth/me, POST /auth/dashboard-visit
router.use("/v1", usersRouter);
router.use("/v1", dealsRouter);
router.use("/v1", gatesRouter);
router.use("/v1", blockersRouter);
router.use("/v1", crossSellsRouter);
router.use("/v1", intelligenceRouter);
router.use("/v1", dispositionsRouter);
router.use("/v1", interventionsRouter);
router.use("/v1", auditRouter);
router.use("/v1", batSignalRouter);
router.use("/v1", lookupsRouter);
router.use("/v1", settingsAuditRouter); // now genuinely protected, not accidentally
router.use("/v2", v2Router);

export default router;
