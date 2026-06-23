import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dealsRouter from "./deals";
import gatesRouter from "./gates";
import blockersRouter from "./blockers";
import crossSellsRouter from "./crosssells";
import intelligenceRouter from "./intelligence";
import dispositionsRouter from "./dispositions";
import interventionsRouter from "./interventions";
import auditRouter from "./audit";
import batSignalRouter from "./batsignal";
import sharedRouter from "./shared";
import lookupsRouter from "./lookups";

const router: IRouter = Router();

router.use(healthRouter);

router.use("/v1", authRouter);
router.use("/v1", sharedRouter);
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

export default router;
