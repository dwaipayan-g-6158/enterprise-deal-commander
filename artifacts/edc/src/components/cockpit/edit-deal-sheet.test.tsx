// @vitest-environment jsdom
//
// The only DOM test in this package (see vitest.config.ts for why the default
// environment stays "node"). It earns the harness because the bug it guards is
// purely a component-lifecycle bug that no pure unit test can reach:
//
// EditDealSheet is mounted UNCONDITIONALLY by deal-cockpit.tsx — not behind an
// `open &&` guard — so it never unmounts. React Hook Form reads `defaultValues`
// only on the first render, so the auto-save -> invalidate -> refetch -> new
// `deal` prop cycle never reached the form, and the close handler's bare
// `reset()` restored that mount-time snapshot. Re-opening therefore showed
// pre-edit values, and because buildPayload() sends every field on every save,
// the NEXT auto-save wrote them back over the server's good data.
import { useState } from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Deal } from "@workspace/api-client-react";

// ---------------------------------------------------------------- DOM stubs
// Radix primitives reach for browser APIs jsdom doesn't implement. Kept inline
// rather than in a setupFiles entry, which would also run for the node-env
// suites where `window` doesn't exist.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= function () {};
Element.prototype.releasePointerCapture ??= function () {};
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as never;

// ------------------------------------------------------------------- mocks
const mutateAsync = vi.fn(async () => ({ data: {} }));

vi.mock("@workspace/api-client-react", () => {
  const list = <T,>(data: T[]) => () => ({ data: { data } });
  return {
    useUpdateDeal: () => ({ mutateAsync, isPending: false }),
    useCreateCompetitor: () => ({ mutateAsync: vi.fn() }),
    useCreateComplianceDriver: () => ({ mutateAsync: vi.fn() }),
    useListPipelineStages: list([{ id: 1, stageName: "Discovery" }]),
    useListPricingModels: list([{ id: 1, modelName: "Subscription" }]),
    useListServicesTiers: list([{ id: 1, tierName: "Standard" }]),
    useListCompetitors: list([{ id: 7, name: "Incumbent Co" }]),
    useListComplianceDrivers: list([{ id: 3, name: "PCI" }]),
    useListTeamMembers: list([
      { id: 1, name: "Ada", can_be_am: true, can_be_tl: false },
      { id: 2, name: "Grace", can_be_am: false, can_be_tl: true },
    ]),
    useListProductCatalog: list([]),
    getListCompetitorsQueryKey: () => ["competitors"],
    getListComplianceDriversQueryKey: () => ["compliance-drivers"],
  };
});

// The real hook needs a QueryClientProvider and only invalidates caches this
// test doesn't read; what matters here is that it resolves before the form is
// re-baselined.
vi.mock("./use-invalidate", () => ({ useCockpitInvalidate: () => async () => {} }));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

// Imported after the mocks so the component picks them up.
const { EditDealSheet } = await import("./edit-deal-sheet");

// ----------------------------------------------------------------- fixtures
function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "deal-1",
    dealName: "Project Atlas",
    accountName: "Acme Corp",
    accountManager: "Ada",
    technicalLead: "Grace",
    salesStageId: 1,
    salesStage: "Discovery",
    productRevenue: 100_000,
    servicesRevenue: 20_000,
    pricingModelId: 1,
    servicesTierId: 1,
    contractTermYears: 3,
    isPerpetualTerm: false,
    dealCurrency: "USD",
    committed: false,
    calculatedTCV: 320_000,
    normalizedTCV: 320_000,
    healthStatus: "GREEN",
    productsOfInterest: [],
    complianceDrivers: [],
    ...overrides,
  } as Deal;
}

/** Mirrors deal-cockpit.tsx: the sheet is rendered unconditionally, with the
 *  page owning `open`. Reproducing that is the whole point — mounting it only
 *  while open would hide the bug. */
function Harness({ deal }: { deal: Deal }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open-sheet</button>
      <EditDealSheet deal={deal} open={open} onOpenChange={setOpen} />
    </>
  );
}

const openSheet = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText("open-sheet"));
  });
};

const closeSheet = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await vi.advanceTimersByTimeAsync(0);
  });
};

const productRevenueInput = () =>
  screen.getByLabelText("Product Revenue") as HTMLInputElement;

const dealNameInput = () =>
  document.querySelector('input[name="deal_name"]') as HTMLInputElement;

/** Type into a field and let the 1s auto-save debounce elapse. */
const typeAndAutosave = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};

const lastPayload = () =>
  (mutateAsync.mock.calls.at(-1)?.[0] as unknown as { data: Record<string, unknown> }).data;

// -------------------------------------------------------------------- tests
describe("EditDealSheet auto-save", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mutateAsync.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the auto-saved value when the sheet is closed and re-opened", async () => {
    render(<Harness deal={makeDeal()} />);

    await openSheet();
    expect(productRevenueInput().value).toBe("100000");

    await typeAndAutosave(productRevenueInput(), "500000");
    expect(lastPayload().product_revenue).toBe(500_000);

    await closeSheet();
    await openSheet();

    // Before the fix the close handler's bare reset() restored the mount-time
    // defaultValues and this read "100000".
    expect(productRevenueInput().value).toBe("500000");
  });

  it("does not write stale values back over a later edit", async () => {
    render(<Harness deal={makeDeal()} />);

    await openSheet();
    await typeAndAutosave(productRevenueInput(), "500000");
    await closeSheet();
    await openSheet();

    await typeAndAutosave(dealNameInput(), "Project Atlas II");

    // The regression that made this a data-loss bug rather than a display one:
    // buildPayload() sends every field, so a reverted form silently undid the
    // previous save on the next keystroke.
    expect(lastPayload().deal_name).toBe("Project Atlas II");
    expect(lastPayload().product_revenue).toBe(500_000);
  });

  it("picks up a deal changed elsewhere while the sheet was closed", async () => {
    const { rerender } = render(<Harness deal={makeDeal()} />);

    rerender(<Harness deal={makeDeal({ productRevenue: 750_000 })} />);
    await openSheet();

    expect(productRevenueInput().value).toBe("750000");
  });

  it("hands authority back to the server once it reflects the save", async () => {
    // The deal prop stays stale for a beat after a save — Catalyst's Data Store
    // reads lag its writes by a second or two — so a just-saved edit outranks it.
    // That precedence has to be temporary, or a change made elsewhere could never
    // reach the form again.
    const { rerender } = render(<Harness deal={makeDeal()} />);

    await openSheet();
    await typeAndAutosave(productRevenueInput(), "500000");
    await closeSheet();

    rerender(<Harness deal={makeDeal({ productRevenue: 500_000 })} />); // caught up
    await openSheet();
    expect(productRevenueInput().value).toBe("500000");
    await closeSheet();

    rerender(<Harness deal={makeDeal({ productRevenue: 900_000 })} />); // changed elsewhere
    await openSheet();
    expect(productRevenueInput().value).toBe("900000");
  });

  it("flushes a pending auto-save instead of dropping it on close", async () => {
    render(<Harness deal={makeDeal()} />);

    await openSheet();
    await act(async () => {
      fireEvent.change(productRevenueInput(), { target: { value: "900000" } });
      await vi.advanceTimersByTimeAsync(200); // still inside the 1s debounce
    });
    await closeSheet();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(lastPayload().product_revenue).toBe(900_000);
  });

  it("does not save when the sheet is opened and closed without an edit", async () => {
    render(<Harness deal={makeDeal()} />);

    await openSheet();
    await closeSheet();

    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
