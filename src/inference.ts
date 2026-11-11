import { expandCollections, splitCollectionParts, type StatisticsMode } from "./collections";
import { makeDistribution, type Distribution } from "./probability";

export const INFERENCE_NAMES = ["ztest", "ttest", "zproptest", "chisqtest", "chisqgof"] as const;
export type InferenceName = typeof INFERENCE_NAMES[number];
export interface InferenceResult {
  name: InferenceName;
  estimate?: number;
  stderr?: number;
  dof?: number;
  score: number;
  pleft: number;
  pright: number;
  p: number;
  lower?: number;
  upper?: number;
  nullValue: number;
  tails: number;
  level: number;
  expected?: number[][];
  warnings: string[];
  distribution: Distribution;
}
export interface InferenceCall {
  name: InferenceName;
  args: string[];
  nullSource?: string;
  tailsSource?: string;
  levelSource?: string;
  property?: string;
}

export function inferenceDefinition(source:string):{target:string;source:string}|undefined{
  const match=/^\s*([a-z](?:_[a-z0-9]+)?)\s*=\s*(.+)$/i.exec(source);
  if(!match)return undefined;
  let call:InferenceCall|undefined;
  try{call=inferenceCall(match[2]!);}catch{return undefined;}
  if(!call||call.property)return undefined;
  const target=match[1]!.toLowerCase();
  if(["x","y","t","r","e","i"].includes(target))return undefined;
  return{target,source:match[2]!};
}

export function expandInferenceDefinitions(source:string,definitions:Array<{target:string;source:string}>):string{
  const expand=(body:string,path:Set<string>):string=>body.replace(/[a-z]+(?:_[a-z0-9]+)?/gi,(token,index:number)=>{
    if(body.slice(0,index).trimEnd().endsWith("."))return token;
    const name=token.toLowerCase(),matches=definitions.filter((definition)=>definition.target===name);
    if(!matches.length)return token;
    if(matches.length>1)throw new Error(`Inference "${name}" is defined more than once.`);
    if(path.has(name))throw new Error(`Circular inference definition involving "${name}".`);
    return expand(matches[0]!.source,new Set([...path,name]));
  });
  return expand(source,new Set());
}

export function regressionSlopeSummary(x:number[],y:number[]):{estimate:number;stderr:number;dof:number}{
  requireValid(x.length===y.length&&x.length>=3&&[...x,...y].every(Number.isFinite),
    "Slope inference requires at least three paired finite observations.");
  const sx=sample(x),sy=sample(y);
  const xx=x.reduce((sum,value)=>sum+(value-sx.mean)**2,0);
  const xy=x.reduce((sum,value,index)=>sum+(value-sx.mean)*(y[index]!-sy.mean),0);
  requireValid(xx>0&&Number.isFinite(xx)&&Number.isFinite(xy),"Slope inference needs varying, well-conditioned x values.");
  const estimate=xy/xx,intercept=sy.mean-estimate*sx.mean;
  const dof=x.length-2;
  const sse=y.reduce((sum,value,index)=>sum+(value-intercept-estimate*x[index]!)**2,0);
  const stderr=Math.sqrt(sse/dof/xx);
  requireValid(Number.isFinite(estimate)&&Number.isFinite(stderr)&&stderr>0,"Slope inference requires finite nonzero residual standard error.");
  return{estimate,stderr,dof};
}

function callEnd(source: string, start: number): number | undefined {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")" && --depth === 0) return index + 1;
  }
  return undefined;
}

export function inferenceCall(source: string): InferenceCall | undefined {
  const match = /^\s*(ztest|ttest|zproptest|chisqtest|chisqgof)\s*\(/i.exec(source);
  if (!match) return undefined;
  const name = match[1]!.toLowerCase();
  if (name !== "ztest" && name !== "ttest" && name !== "zproptest" && name !== "chisqtest" && name !== "chisqgof") return undefined;
  const start = match[0].lastIndexOf("(");
  const end = callEnd(source, start);
  if (end === undefined) return undefined;
  const result: InferenceCall = { name, args: splitCollectionParts(source.slice(start + 1, end - 1)) };
  let tail = source.slice(end).trim();
  while (/^\.(test|conf)\s*\(/i.test(tail)) {
    const method = /^\.(test|conf)\s*\(/i.exec(tail)!;
    const open = method[0].lastIndexOf("(");
    const close = callEnd(tail, open);
    if (close === undefined) return undefined;
    const options = splitCollectionParts(tail.slice(open + 1, close - 1));
    if (method[1]!.toLowerCase() === "test") {
      if (options.length > 3 || options.some((option) => !option)) throw new Error("Use .test(nullValue[, tails, confidenceLevel]).");
      [result.nullSource, result.tailsSource, result.levelSource] = options;
    } else {
      if (options.length !== 1 || !options[0]) throw new Error("Use .conf(confidenceLevel).");
      result.levelSource = options[0];
    }
    tail = tail.slice(close).trim();
  }
  if (tail) {
    const property = /^\.(estimate|stderr|dof|score|p|pleft|pright|lower|upper)\s*$/i.exec(tail);
    if (!property) return undefined;
    result.property = property[1]!.toLowerCase();
  }
  return result;
}

function requireValid(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function sample(values: number[], minimum = 2): { mean: number; variance: number; n: number } {
  requireValid(values.length >= minimum && values.every(Number.isFinite), `Inference samples require at least ${minimum} finite observation${minimum === 1 ? "" : "s"}.`);
  let mean = 0, squares = 0;
  for (const [index, value] of values.entries()) {
    const difference = value - mean;
    mean += difference / (index + 1);
    squares += difference * (value - mean);
  }
  const variance = values.length === 1 ? 0 : squares / (values.length - 1);
  requireValid(Number.isFinite(mean) && Number.isFinite(variance), "Sample statistics exceed the supported numeric range.");
  return { mean, variance, n: values.length };
}

export function readInference(
  call: InferenceCall, evaluate: (source: string) => number,
  lists: Record<string, string[]> = {}, mode: StatisticsMode = "sample",
): InferenceResult {
  const args = call.args.map((arg) => expandCollections(arg, evaluate, lists, mode));
  const scalar = (index: number): number => {
    const arg = args[index];
    requireValid(Boolean(arg) && !arg!.list && arg!.items.length === 1, "This inference argument must be a scalar.");
    const value = evaluate(arg!.items[0]!);
    requireValid(Number.isFinite(value), "Inference inputs must be finite.");
    return value;
  };
  const list = (index: number): number[] => {
    requireValid(Boolean(args[index]?.list), "This inference argument must be a numeric list.");
    const values = args[index]!.items.map(evaluate);
    requireValid(values.length > 0 && values.every(Number.isFinite), "Inference lists must be nonempty and finite.");
    return values;
  };
  const option = (source: string | undefined, fallback: number): number => {
    if (source === undefined) return fallback;
    const expanded = expandCollections(source, evaluate, lists, mode);
    requireValid(!expanded.list && expanded.items.length === 1, "Inference options must be scalar.");
    const value = evaluate(expanded.items[0]!);
    requireValid(Number.isFinite(value), "Inference options must be finite.");
    return value;
  };
  const nullValue = option(call.nullSource, call.name === "zproptest" && args.length === 2 ? 0.5 : 0);
  const tails = option(call.tailsSource, 0);
  const level = option(call.levelSource, 0.95);
  requireValid([-1, 0, 1].includes(tails), "Tails must be -1 (left), 0 (two-sided), or 1 (right).");
  requireValid(level > 0 && level < 1, "Confidence level must be strictly between 0 and 1.");
  let estimate: number | undefined, stderr: number | undefined, dof: number | undefined;
  let score: number, distribution: Distribution, expected: number[][] | undefined;
  let testError: number | undefined;
  const warnings: string[] = [];
  if (call.name === "ztest" || call.name === "ttest") {
    let first: { mean: number; variance: number; n: number };
    let second: typeof first | undefined;
    if (args[0]?.list) {
      first = sample(list(0), call.name === "ztest" ? 1 : 2);
      if (call.name === "ttest") {
        requireValid(args.length <= 2, "Use ttest(L) or ttest(L,M).");
        if (args.length === 2) second = sample(list(1));
      } else {
        requireValid(args.length === 2 || args.length === 4, "Use ztest(L,sigma) or ztest(L,sigma,M,sigma2).");
        const sigma = scalar(1);
        requireValid(sigma > 0, "Population standard deviation must be positive.");
        first.variance = sigma * sigma;
        if (args.length === 4) {
          second = sample(list(2),1);
          const sigma2 = scalar(3);
          requireValid(sigma2 > 0, "Population standard deviation must be positive.");
          second.variance = sigma2 * sigma2;
        }
      }
    } else {
      requireValid(args.length === 3 || args.length === 6, "Summary-statistic tests need (mean, SD, n), optionally twice.");
      const summary = (index: number) => {
        const mean = scalar(index), sd = scalar(index + 1), n = scalar(index + 2);
        const minimum = call.name === "ztest" ? 1 : 2;
        requireValid(sd > 0 && Number.isSafeInteger(n) && n >= minimum, `Summary SD must be positive and n an integer >= ${minimum}.`);
        return { mean, variance: sd * sd, n };
      };
      first = summary(0);
      if (args.length === 6) second = summary(3);
    }
    estimate = first.mean - (second?.mean ?? 0);
    const v1 = first.variance / first.n, v2 = second ? second.variance / second.n : 0;
    stderr = Math.sqrt(v1 + v2);
    requireValid(stderr > 0 && Number.isFinite(stderr), "Inference standard error must be finite and positive.");
    if (call.name === "ttest") {
      dof = second ? (v1 + v2) ** 2 / (v1 ** 2 / (first.n - 1) + v2 ** 2 / (second.n - 1)) : first.n - 1;
      distribution = makeDistribution("tdist", [dof]);
    } else distribution = makeDistribution("normaldist", []);
    if (first.n < 30 || (second && second.n < 30)) warnings.push("Small samples: check normality and sampling assumptions.");
    warnings.push("Assumes independent, representative observations.");
  } else if (call.name === "zproptest") {
    requireValid(args.length === 2 || args.length === 4, "Use zproptest(successes,n[,successes2,n2]).");
    const successes = scalar(0), n = scalar(1);
    requireValid(Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(successes) && successes >= 0 && successes <= n,
      "Successes and sample sizes must be integers with 0 <= successes <= n and n > 0.");
    const p1 = successes / n;
    if (args.length === 4) {
      const successes2 = scalar(2), n2 = scalar(3);
      requireValid(Number.isSafeInteger(n2) && n2 > 0 && Number.isSafeInteger(successes2) && successes2 >= 0 && successes2 <= n2,
        "Second successes and sample size are invalid.");
      const p2 = successes2 / n2, pooled = (successes + successes2) / (n + n2);
      requireValid(nullValue === 0, "Two-proportion pooled z-tests currently require a null difference of 0.");
      estimate = p1 - p2;
      stderr = Math.sqrt(p1 * (1 - p1) / n + p2 * (1 - p2) / n2);
      testError = Math.sqrt(pooled * (1 - pooled) * (1 / n + 1 / n2));
      if ([successes, n - successes, successes2, n2 - successes2].some((count) => count < 10)) warnings.push("Normal approximation may be poor: some success/failure counts are below 10.");
    } else {
      requireValid(nullValue > 0 && nullValue < 1, "Null proportion must be strictly between 0 and 1.");
      estimate = p1;
      stderr = Math.sqrt(p1 * (1 - p1) / n);
      testError = Math.sqrt(nullValue * (1 - nullValue) / n);
      if (n * nullValue < 10 || n * (1 - nullValue) < 10) warnings.push("Normal approximation may be poor: expected counts are below 10.");
    }
    requireValid(testError > 0, "Proportion test standard error is zero.");
    if (stderr === 0) warnings.push("Wald confidence interval is degenerate at boundary proportions; it is not an exact binomial interval.");
    distribution = makeDistribution("normaldist", []);
    warnings.push("Uses the normal approximation; assumes independent random samples.");
  } else {
    requireValid(nullValue === 0 && tails !== -1, "Chi-square tests use their expected counts and a right-tail alternative, not a scalar null hypothesis.");
    requireValid(call.levelSource === undefined, "Confidence intervals are not available for chi-square tests.");
    const observed = args.map((_, index) => list(index));
    if (call.name === "chisqgof") {
      requireValid(observed.length === 1 || observed.length === 2, "Use chisqgof(observed[,expectedWeights]).");
      const counts = observed[0]!;
      requireValid(counts.length >= 2 && counts.every((count) => count >= 0), "Goodness-of-fit needs at least two nonnegative observed counts.");
      const total = counts.reduce((sum, count) => sum + count, 0);
      const weights = observed[1] ?? counts.map(() => 1);
      requireValid(weights.length === counts.length && weights.every((weight) => weight > 0), "Expected weights must be positive and match observed counts.");
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
      requireValid(total > 0 && Number.isFinite(total) && Number.isFinite(weightTotal), "Chi-square totals must be finite and positive.");
      expected = [weights.map((weight) => weight / weightTotal * total)];
      score = counts.reduce((sum, count, index) => sum + (count - expected![0]![index]!) ** 2 / expected![0]![index]!, 0);
      dof = counts.length - 1;
    } else {
      requireValid(observed.length >= 2 && observed[0]!.length >= 2 &&
        observed.every((column) => column.length === observed[0]!.length && column.every((value) => value >= 0)),
      "Independence test requires at least two equal-length columns of nonnegative counts.");
      const columnTotals = observed.map((column) => column.reduce((sum, value) => sum + value, 0));
      const rowTotals = observed[0]!.map((_, row) => observed.reduce((sum, column) => sum + column[row]!, 0));
      const total = columnTotals.reduce((sum, value) => sum + value, 0);
      requireValid(Number.isFinite(total) && total > 0 && [...rowTotals, ...columnTotals].every((value) => value > 0),
        "Every row/column total must be positive and the total must be finite.");
      expected = columnTotals.map((column) => rowTotals.map((row) => row / total * column));
      score = observed.reduce((sum, column, c) => sum + column.reduce((subtotal, value, r) =>
        subtotal + (value - expected![c]![r]!) ** 2 / expected![c]![r]!, 0), 0);
      dof = (observed.length - 1) * (observed[0]!.length - 1);
    }
    requireValid(Number.isFinite(score) && score >= 0, "Chi-square score exceeds the supported range.");
    distribution = makeDistribution("chisqdist", [dof]);
    const p = distribution.survival(score);
    if (expected.some((column) => column.some((value) => value < 5))) warnings.push("Chi-square approximation may be poor: expected counts below 5.");
    warnings.push("Assumes independent observations; goodness-of-fit df does not adjust for fitted parameters.");
    return { name: call.name, dof, score, p, pleft: distribution.cdf(score), pright: p, nullValue, tails: 1, level, expected, warnings, distribution };
  }
  score = (estimate - nullValue) / (testError ?? stderr);
  requireValid(Number.isFinite(score), "Inference score exceeds the supported range.");
  const pleft = distribution.cdf(score), pright = distribution.survival(score);
  const p = tails < 0 ? pleft : tails > 0 ? pright : Math.min(1, 2 * Math.min(pleft, pright));
  const critical = distribution.inverse((1 + level) / 2);
  const lower = estimate - critical * stderr, upper = estimate + critical * stderr;
  requireValid([estimate, stderr, lower, upper].every(Number.isFinite), "Confidence interval exceeds the supported range.");
  return { name: call.name, estimate, stderr, dof, score, pleft, pright, p, lower, upper, nullValue, tails, level, warnings, distribution };
}

export function inferenceProperty(result: InferenceResult, property: string): number {
  const value = property === "estimate" ? result.estimate : property === "stderr" ? result.stderr :
    property === "dof" ? result.dof : property === "score" ? result.score : property === "p" ? result.p :
    property === "pleft" ? result.pleft : property === "pright" ? result.pright : property === "lower" ? result.lower : result.upper;
  if (value === undefined || !Number.isFinite(value)) throw new Error(`.${property} is not available for this test.`);
  return value;
}

export function rewriteInferenceProperties(
  source: string, replace: (call: InferenceCall) => string,
): string {
  let output = "", cursor = 0;
  const names = /\b(ztest|ttest|zproptest|chisqtest|chisqgof)\s*\(/gi;
  for (let match = names.exec(source); match; match = names.exec(source)) {
    const start = match.index;
    let end = callEnd(source, start + match[0].lastIndexOf("("));
    if (end === undefined) continue;
    while (/^\s*\.(test|conf)\s*\(/i.test(source.slice(end))) {
      const method = /^\s*\.(test|conf)\s*\(/i.exec(source.slice(end))!;
      const close = callEnd(source, end + method[0].lastIndexOf("("));
      if (close === undefined) break;
      end = close;
    }
    const property = /^\s*\.(estimate|stderr|dof|score|pleft|pright|lower|upper|p)\b/i.exec(source.slice(end));
    if (!property) continue;
    end += property[0].length;
    const call = inferenceCall(source.slice(start, end));
    if (!call) continue;
    output += source.slice(cursor, start) + replace(call);
    cursor = end;
    names.lastIndex = end;
  }
  return output + source.slice(cursor);
}

export function inferenceSummary(result: InferenceResult): string {
  const display = (value: number) => Number(value.toPrecision(8)).toString();
  return [
    result.estimate === undefined ? "" : `estimate ≈ ${display(result.estimate)}`,
    `${result.name === "ttest" ? "t" : result.name.startsWith("chisq") ? "χ²" : "z"} ≈ ${display(result.score)}`,
    result.dof === undefined ? "" : `df ≈ ${display(result.dof)}`,
    `p ≈ ${display(result.p)} (${result.tails < 0 ? "left" : result.tails > 0 ? "right" : "two-sided"})`,
    result.lower === undefined ? "" : `${display(result.level * 100)}% CI ≈ [${display(result.lower)}, ${display(result.upper!)}]`,
    ...result.warnings,
  ].filter(Boolean).join(" · ");
}
