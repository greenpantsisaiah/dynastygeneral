/**
 * Rubric dispatcher. Maps position to the right rubric function.
 * Falls back to a neutral rubric for positions we don't yet model
 * (K, DST, etc.).
 */

import { evaluateRb } from "./rb";
import { evaluateQb } from "./qb";
import { evaluateWr } from "./wr";
import { evaluateTe } from "./te";
import { neutralRubric } from "../util";
import type { EvaluationContext, RubricOutput } from "../types";

export function dispatchRubric(
  position: string | null | undefined,
  ctx: EvaluationContext,
): RubricOutput {
  switch ((position ?? "").toUpperCase()) {
    case "RB":
      return evaluateRb(ctx);
    case "QB":
      return evaluateQb(ctx);
    case "WR":
      return evaluateWr(ctx);
    case "TE":
      return evaluateTe(ctx);
    default:
      return neutralRubric();
  }
}
