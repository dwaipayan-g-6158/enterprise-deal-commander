// Pipeline Simulation / Probabilistic Forecasting (V2 F20) — pure & isomorphic.
//
// Monte Carlo over the active pipeline: each deal either closes (adds its TCV)
// or doesn't, per its probability, across N iterations. Returns the percentile
// distribution of total closed revenue.

export interface SimDeal {
  calculatedTCV: number;
  /** 0–100; predictive score preferred, else win probability. */
  predictiveScore?: number | null;
  winProbabilityPct?: number | null;
}

export interface SimulationResult {
  iterations: number;
  totalDeals: number;
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  mean: number;
  weightedPipeline: number;
  worstCase: number;
  bestCase: number;
}

/** Resolve a deal's close probability (0–1): score → win% → 30% default. */
export function dealProbability(d: SimDeal): number {
  const pct = d.predictiveScore ?? d.winProbabilityPct ?? 30;
  return Math.max(0, Math.min(1, pct / 100));
}

export function runPipelineSimulation(
  deals: SimDeal[],
  iterations = 10000,
  rng: () => number = Math.random,
): SimulationResult {
  const probs = deals.map(dealProbability);
  const outcomes: number[] = new Array(iterations);

  for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (let d = 0; d < deals.length; d++) {
      if (rng() < probs[d]) total += deals[d].calculatedTCV;
    }
    outcomes[i] = total;
  }

  outcomes.sort((a, b) => a - b);
  const at = (p: number) =>
    outcomes[Math.min(iterations - 1, Math.floor(iterations * p))] ?? 0;

  const mean = outcomes.reduce((a, b) => a + b, 0) / (iterations || 1);
  const weightedPipeline = deals.reduce(
    (s, d, i) => s + d.calculatedTCV * probs[i],
    0,
  );

  return {
    iterations,
    totalDeals: deals.length,
    percentiles: { p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) },
    mean,
    weightedPipeline,
    worstCase: outcomes[0] ?? 0,
    bestCase: outcomes[outcomes.length - 1] ?? 0,
  };
}
