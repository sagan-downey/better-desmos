import { expandCollections, splitCollectionParts, type StatisticsMode } from "./collections";
import { compileExpression, compileFastGraphExpression, freeIdentifiers } from "./math";
import { fitModel, type FitResult } from "./regression";

export interface RegressionSides {
  left: string;
  right: string;
}

export interface CustomRegressionResult extends FitResult {
  /** Model with the independent list replaced by x, when the model uses exactly one list. */
  graphSource?: string;
}

const NAME = /^[a-z](?:_[a-z0-9]+)?$/;
const MAX_ROWS = 2048;

/** Splits `left ~ right` at a single top-level tilde, or returns undefined when there is none. */
export function regressionSides(source: string): RegressionSides | undefined {
  if (!source.includes("~")) return undefined;
  const parts = splitCollectionParts(source, "~");
  if (parts.length !== 2) throw new Error("Use one ~ per regression, such as y_1 ~ m x_1 + b.");
  const [left, right] = parts as [string, string];
  if (!left || !right) throw new Error("Regressions need an expression on both sides of ~.");
  return { left, right };
}

/** Names in a regression that are not otherwise defined; these become fitted parameters. */
export function regressionParameters(sides: RegressionSides, known: Set<string>): string[] {
  const names = freeIdentifiers(`${sides.left}+${sides.right}`).map((name) => name.toLowerCase());
  if (names.includes("x") || names.includes("y")) {
    throw new Error("Regressions compare lists; use table columns or lists such as x_1 instead of x or y.");
  }
  return [...new Set(names.filter((name) => NAME.test(name) && !known.has(name)))].sort();
}

function listNamesIn(source: string, lists: Record<string, string[]>): string[] {
  return [...new Set((source.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? [])
    .map((name) => name.toLowerCase()).filter((name) => Object.hasOwn(lists, name)))];
}

export function fitCustomRegression(
  sides: RegressionSides,
  parameterNames: string[],
  variables: Record<string, number>,
  lists: Record<string, string[]>,
  statisticsMode: StatisticsMode = "population",
): CustomRegressionResult {
  if (!parameterNames.length) {
    throw new Error("Regressions need at least one unknown parameter, such as m and b in y_1 ~ m x_1 + b.");
  }
  const scalar = (item: string) => compileExpression(item, variables)(0).value.toNumber();
  const observedExpansion = expandCollections(sides.left, scalar, lists, statisticsMode);
  if (!observedExpansion.list) throw new Error("The left side of ~ must be a list, such as a table column.");
  if (observedExpansion.items.length > MAX_ROWS) throw new Error(`Regressions are limited to ${MAX_ROWS} rows.`);
  const observed = observedExpansion.items.map((item, index) => {
    const value = scalar(item);
    if (!Number.isFinite(value)) throw new Error(`Row ${index + 1} of the left side is not a finite number.`);
    return value;
  });

  const scope: Record<string, number> = { ...variables };
  for (const name of parameterNames) scope[name] = 1;
  const modelExpansion = expandCollections(sides.right, (item) => compileExpression(item, scope)(0).value.toNumber(),
    lists, statisticsMode);
  if (!modelExpansion.list) throw new Error("The right side of ~ must use a list, such as x_1.");
  if (modelExpansion.items.length !== observed.length) {
    throw new Error(`Both sides of ~ need the same number of rows (${observed.length} and ${modelExpansion.items.length}).`);
  }

  const fastRows = modelExpansion.items.map((item) => {
    const graph = compileFastGraphExpression(item, scope, statisticsMode);
    if (graph.kind !== "explicit") throw new Error("Each regression row must produce one number.");
    return graph.evaluate;
  });
  const assign = (parameters: Record<string, number>) => {
    for (const name of parameterNames) scope[name] = parameters[name]!;
  };
  const value = (result: number | { value: { toNumber(): number } }) =>
    typeof result === "number" ? result : result.value.toNumber();
  const evaluateRow = (row: (x: number) => number | { value: { toNumber(): number } }) => {
    try {
      return value(row(0));
    } catch {
      return Number.NaN;
    }
  };
  const coarse = fitModel({
    parameterNames, observed,
    model: (parameters, rowIndex) => {
      assign(parameters);
      return evaluateRow(fastRows[rowIndex]!);
    },
  });

  // The fast engine rounds to 10 significant digits, so finish with full-precision evaluation.
  const preciseRows = modelExpansion.items.map((item) => compileExpression(item, scope));
  let result = coarse;
  try {
    // The polish starts from the coarse fit and only accepts precise-SSE improvements.
    result = fitModel({
      parameterNames, observed, initial: coarse.parameters, maxIterations: 20, singleStart: true,
      model: (parameters, rowIndex) => {
        assign(parameters);
        return evaluateRow(preciseRows[rowIndex]!);
      },
    });
  } catch {
    // Keep the coarse fit when precise refinement leaves the model's domain.
  }

  const used = listNamesIn(sides.right, lists);
  const graphSource = used.length === 1
    ? sides.right.replace(/[a-z]+(?:_[a-z0-9]+)?/gi, (token, offset: number) =>
      token.toLowerCase() === used[0] && !/^\s*\[/.test(sides.right.slice(offset + token.length)) ? "(x)" : token)
    : undefined;
  return { ...result, graphSource };
}
