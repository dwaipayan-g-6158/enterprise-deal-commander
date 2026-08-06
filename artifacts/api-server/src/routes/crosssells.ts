import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealCrossSellsRepo,
  createProductCatalogRepo,
  type CatalystApp,
} from "@workspace/db/catalyst";
import {
  ListCrossSellsParams,
  ListCrossSellsResponse,
  UpdateCrossSellsParams,
  UpdateCrossSellsBody,
  UpdateCrossSellsResponse,
} from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { writeAudit } from "../lib/catalyst/audit";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

async function ensureDeal(catalystApp: CatalystApp, dealId: string) {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) throw notFound("Deal not found");
}

async function listPitched(catalystApp: CatalystApp, dealId: string) {
  const [links, catalog] = await Promise.all([
    createDealCrossSellsRepo(catalystApp).list(dealId),
    createProductCatalogRepo(catalystApp).listAll(),
  ]);
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  return links
    .map((l) => {
      const product = catalogById.get(l.productId);
      if (!product) return null; // mirrors the original innerJoin drop
      return {
        productId: l.productId,
        productName: product.productName,
        productCategory: product.productCategory ?? null,
        code: product.code ?? null,
        suite: product.suite ?? null,
        isPitched: l.isPitched,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

router.get(
  "/deals/:dealId/cross-sells",
  async (req: Request, res: Response) => {
    const { dealId } = ListCrossSellsParams.parse(req.params);
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const data = await listPitched(catalystApp, dealId);
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
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);
    const productIds = Array.from(new Set(parsed.data.product_ids));

    if (productIds.length > 0) {
      const active = await createProductCatalogRepo(catalystApp).listActive();
      const validIds = new Set(active.map((v) => v.id));
      for (const pid of productIds) {
        if (!validIds.has(pid)) {
          throw badRequest(`Unknown product id: ${pid}`);
        }
      }
    }

    await createDealCrossSellsRepo(catalystApp).replaceSet(dealId, productIds);

    await writeAudit(catalystApp, {
      dealId,
      entityType: "cross_sell",
      fieldChanged: "pitched_products",
      newValue: String(productIds.length),
      changedBy: actor.displayName,
    });

    const data = await listPitched(catalystApp, dealId);
    res.json(UpdateCrossSellsResponse.parse({ data }));
  },
);

export default router;
