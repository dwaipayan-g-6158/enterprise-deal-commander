import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealCrossSells,
  productCatalog,
} from "@workspace/db";
import {
  ListCrossSellsParams,
  ListCrossSellsResponse,
  UpdateCrossSellsParams,
  UpdateCrossSellsBody,
  UpdateCrossSellsResponse,
} from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

async function ensureDeal(dealId: string) {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (rows.length === 0) throw notFound("Deal not found");
}

async function listPitched(dealId: string) {
  const rows = await db
    .select({
      productId: dealCrossSells.productId,
      productName: productCatalog.productName,
      productCategory: productCatalog.productCategory,
      isPitched: dealCrossSells.isPitched,
    })
    .from(dealCrossSells)
    .innerJoin(productCatalog, eq(dealCrossSells.productId, productCatalog.id))
    .where(eq(dealCrossSells.dealId, dealId));
  return rows.map((r) => ({
    productId: r.productId,
    productName: r.productName,
    productCategory: r.productCategory ?? null,
    isPitched: r.isPitched,
  }));
}

router.get(
  "/deals/:dealId/cross-sells",
  async (req: Request, res: Response) => {
    const { dealId } = ListCrossSellsParams.parse(req.params);
    await ensureDeal(dealId);
    const data = await listPitched(dealId);
    res.json(ListCrossSellsResponse.parse({ data }));
  },
);

router.put(
  "/deals/:dealId/cross-sells",
  async (req: Request, res: Response) => {
    const { dealId } = UpdateCrossSellsParams.parse(req.params);
    const parsed = UpdateCrossSellsBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid cross-sell payload", parsed.error.issues);
    }
    await ensureDeal(dealId);
    const actor = getActor(req);
    const productIds = Array.from(new Set(parsed.data.product_ids));

    if (productIds.length > 0) {
      const valid = await db
        .select({ id: productCatalog.id })
        .from(productCatalog)
        .where(eq(productCatalog.isActive, true));
      const validIds = new Set(valid.map((v) => v.id));
      for (const pid of productIds) {
        if (!validIds.has(pid)) {
          throw badRequest(`Unknown product id: ${pid}`);
        }
      }
    }

    await db.delete(dealCrossSells).where(eq(dealCrossSells.dealId, dealId));
    if (productIds.length > 0) {
      await db
        .insert(dealCrossSells)
        .values(productIds.map((productId) => ({ dealId, productId })));
    }

    await writeAudit({
      dealId,
      entityType: "cross_sell",
      fieldChanged: "pitched_products",
      newValue: String(productIds.length),
      changedBy: actor.displayName,
    });

    const data = await listPitched(dealId);
    res.json(UpdateCrossSellsResponse.parse({ data }));
  },
);

export default router;
