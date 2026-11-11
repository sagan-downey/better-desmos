import library from "jstat";

const { jStat } = library;
export const DISTRIBUTION_NAMES = ["normaldist", "tdist", "chisqdist", "uniformdist", "binomialdist", "poissondist", "geodist", "discretedist"] as const;
export type DistributionName = typeof DISTRIBUTION_NAMES[number];
export const PROBABILITY_KERNELS = ["normalpdf", "normalcdf", "normalinv", "tpdf", "tcdf", "tinv",
  "chipdf", "chicdf", "chiinv", "uniformpdf", "uniformcdf", "uniforminv",
  "binomialpdf", "binomialcdf", "binomialinv", "poissonpdf", "poissoncdf", "poissoninv",
  "geopdf", "geocdf", "geoinv", "discretepdf", "discretecdf", "discreteinv",
  "normalprob", "tprob", "chiprob", "uniformprob", "binomialprob", "poissonprob", "geoprob", "discreteprob",
  ...["normal", "t", "chi", "uniform", "binomial", "poisson", "geo", "discrete"]
    .flatMap((prefix) => ["mean", "median", "variance", "stdev"].map((property) => `${prefix}${property}`)),
];

export function isProbabilityKernel(name: string): boolean {
  return PROBABILITY_KERNELS.some((kernel) => kernel === name);
}

function domain(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Probability result is infinite or exceeds the supported numeric range.");
  return value;
}
function probability(p: number): void {
  domain(Number.isFinite(p) && p >= 0 && p <= 1, "Probability must be between 0 and 1.");
}

function gammaProbabilities(shape: number, x: number): [number, number] {
  if (x <= 0) return [0, 1];
  if (!Number.isFinite(x)) return [1, 0];
  const factor = Math.exp(shape * Math.log(x) - x - jStat.gammaln(shape));
  if (x < shape + 1) {
    let term = 1 / shape, sum = term;
    for (let index = 1; index <= 10_000; index += 1) {
      term *= x / (shape + index);
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * 1e-14) {
        const lower = Math.max(0, Math.min(1, sum * factor));
        return [lower, 1 - lower];
      }
    }
  } else {
    const tiny = 1e-300;
    let b = x + 1 - shape, c = 1 / tiny, d = 1 / b, result = d;
    for (let index = 1; index <= 10_000; index += 1) {
      const a = -index * (index - shape);
      b += 2;
      d = a * d + b;
      if (Math.abs(d) < tiny) d = tiny;
      c = b + a / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      result *= delta;
      if (Math.abs(delta - 1) <= 1e-14) {
        const upper = Math.max(0, Math.min(1, result * factor));
        return [1 - upper, upper];
      }
    }
  }
  throw new Error("Probability calculation did not converge within its work limit.");
}

function normalTail(z: number): number {
  return gammaProbabilities(0.5, z * z / 2)[1] / 2;
}

function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let value = d;
  for (let index = 1; index <= 10000; index += 1) {
    for (const [phase,term] of [
      index * (b - index) * x / ((a + 2 * index - 1) * (a + 2 * index)),
      -(a + index) * (a + b + index) * x / ((a + 2 * index) * (a + 2 * index + 1)),
    ].entries()) {
      d = 1 + term * d;
      if (Math.abs(d) < tiny) d = tiny;
      c = 1 + term / c;
      if (Math.abs(c) < tiny) c = tiny;
      d = 1 / d;
      const delta = d * c;
      value *= delta;
      if (phase === 1 && Math.abs(delta - 1) <= 1e-14) return value;
    }
  }
  throw new Error("Probability calculation did not converge within its work limit.");
}

function regularizedBeta(x: number, a: number, b: number, logX = Math.log(x)): number {
  if (x <= 0 && logX === -Infinity) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(jStat.gammaln(a + b) - jStat.gammaln(a) - jStat.gammaln(b) + a * logX + b * Math.log1p(-x));
  const value = x < (a + 1) / (a + b + 2) ? factor * betaFraction(a,b,x) / a :
    1 - factor * betaFraction(b,a,1 - x) / b;
  return Math.max(0, Math.min(1,value));
}

function tTail(z: number, df: number): number {
  if (!Number.isFinite(z)) return 0;
  const ratio = Math.abs(z) / Math.sqrt(df);
  const logX = ratio > 1e150 ? -2 * Math.log(ratio) : -Math.log1p(ratio * ratio);
  return regularizedBeta(Math.exp(logX),df / 2,0.5,logX) / 2;
}

export interface Distribution {
  name: DistributionName;
  parameters: number[];
  values?: number[];
  weights?: number[];
  discrete: boolean;
  pdf(x: number): number;
  cdf(x: number): number;
  survival(x: number): number;
  inverse(p: number): number;
  mean(): number;
  variance(): number;
  support(): [number, number];
}

export function makeDistribution(name: DistributionName, parameters: number[], values?: number[], weights?: number[]): Distribution {
  domain(parameters.every(Number.isFinite), "Distribution parameters must be finite.");
  const counts: Record<DistributionName, [number, number]> = {
    normaldist: [0, 2], tdist: [1, 3], chisqdist: [1, 1], uniformdist: [0, 2],
    binomialdist: [2, 2], poissondist: [1, 1], geodist: [1, 1], discretedist: [0, 0],
  };
  const [minArgs, maxArgs] = counts[name];
  domain(parameters.length >= minArgs && parameters.length <= maxArgs, `${name} requires ${minArgs === maxArgs ? minArgs : `${minArgs} to ${maxArgs}`} arguments.`);
  let pdf: (x: number) => number, cdf: (x: number) => number, survival: (x: number) => number;
  let inverse: (p: number) => number, mean: () => number, variance: () => number;
  let support: () => [number, number];
  let discrete = false;
  if (name === "normaldist") {
    const m = parameters[0] ?? 0, s = parameters[1] ?? 1;
    domain(s > 0, "Normal standard deviation must be positive.");
    pdf = (x) => jStat.normal.pdf(x, m, s);
    cdf = (x) => { const z = (x - m) / s; return z < 0 ? normalTail(z) : 1 - normalTail(z); };
    survival = (x) => { const z = (x - m) / s; return z < 0 ? 1 - normalTail(z) : normalTail(z); };
    inverse = (p) => p === 0 ? -Infinity : p === 1 ? Infinity : jStat.normal.inv(p, m, s);
    mean = () => m; variance = () => s * s; support = () => [-Infinity, Infinity];
  } else if (name === "tdist") {
    const df = parameters[0]!, shift = parameters[1] ?? 0, scale = parameters[2] ?? 1;
    domain(df > 0 && scale > 0, "t distribution degrees of freedom and scale must be positive.");
    pdf = (x) => {
      const z = (x - shift) / scale;
      return df === 1 ? 1 / (Math.PI * (1 + z * z) * scale) :
        Math.exp(jStat.gammaln((df + 1) / 2) - jStat.gammaln(df / 2) -
          Math.log(df * Math.PI) / 2 - (df + 1) / 2 * Math.log1p(z * z / df)) / scale;
    };
    cdf = (x) => {
      const z = (x - shift) / scale;
      return z < 0 ? (df === 1 ? Math.atan(-1 / z) / Math.PI : tTail(z,df)) :
        1 - (df === 1 ? (z === 0 ? 0.5 : Math.atan(1 / z) / Math.PI) : tTail(z,df));
    };
    survival = (x) => {
      const z = (x - shift) / scale;
      return z >= 0 ? (df === 1 ? (z === 0 ? 0.5 : Math.atan(1 / z) / Math.PI) : tTail(z,df)) :
        1 - (df === 1 ? Math.atan(-1 / z) / Math.PI : tTail(z,df));
    };
    inverse = (p) => p === 0 ? -Infinity : p === 1 ? Infinity : shift + scale * (df === 1 ? Math.tan(Math.PI * (p - 0.5)) : jStat.studentt.inv(p, df));
    mean = () => { domain(df > 1, "t distribution mean is undefined for df <= 1."); return shift; };
    variance = () => { domain(df > 2, "t distribution variance is not finite for df <= 2."); return scale * scale * df / (df - 2); };
    support = () => [-Infinity, Infinity];
  } else if (name === "chisqdist") {
    const df = parameters[0]!;
    domain(df > 0, "Chi-square degrees of freedom must be positive.");
    pdf = (x) => x < 0 ? 0 : x === 0 ? df === 2 ? 0.5 : df > 2 ? 0 : Infinity : jStat.chisquare.pdf(x, df);
    cdf = (x) => gammaProbabilities(df / 2, x / 2)[0];
    survival = (x) => gammaProbabilities(df / 2, x / 2)[1];
    inverse = (p) => p === 0 ? 0 : p === 1 ? Infinity : jStat.chisquare.inv(p, df);
    mean = () => df; variance = () => 2 * df; support = () => [0, Infinity];
  } else if (name === "uniformdist") {
    const a = parameters[0] ?? 0, b = parameters[1] ?? 1;
    domain(b > a && Number.isFinite(b - a), "Uniform upper bound must exceed its lower bound with a finite range.");
    pdf = (x) => x < a || x > b ? 0 : 1 / (b - a);
    cdf = (x) => x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
    survival = (x) => x <= a ? 1 : x >= b ? 0 : (b - x) / (b - a);
    inverse = (p) => a * (1 - p) + b * p;
    mean = () => a / 2 + b / 2; variance = () => (b - a) ** 2 / 12; support = () => [a, b];
  } else if (name === "discretedist") {
    domain(Boolean(values?.length) && values!.length <= 2048 && values!.every(Number.isFinite), "Discrete distribution needs 1–2048 finite values.");
    const source = values!;
    const rawWeights = weights ?? source.map(() => 1);
    domain(rawWeights.length === source.length && rawWeights.every((weight) => Number.isFinite(weight) && weight >= 0),
      "Discrete weights must be nonnegative and match the value list length.");
    const maxWeight = Math.max(...rawWeights);
    domain(maxWeight > 0, "At least one discrete weight must be positive.");
    const scaledTotal = rawWeights.reduce((total, weight) => total + weight / maxWeight, 0);
    const probabilities = rawWeights.map((weight) => weight / maxWeight / scaledTotal);
    const outcomes = new Map<number, number>();
    source.forEach((value, index) => {
      if (probabilities[index]! > 0) outcomes.set(value, (outcomes.get(value) ?? 0) + probabilities[index]!);
    });
    const sorted = [...outcomes].sort(([a], [b]) => a - b);
    pdf = (x) => outcomes.get(x) ?? 0;
    cdf = (x) => Math.min(1, sorted.reduce((total, [value, weight]) => total + (value <= x ? weight : 0), 0));
    survival = (x) => Math.min(1, sorted.reduce((total, [value, weight]) => total + (value > x ? weight : 0), 0));
    inverse = (p) => {
      let sum = 0;
      for (const [value, weight] of sorted) { sum += weight; if (sum >= p) return value; }
      return sorted.at(-1)![0];
    };
    mean = () => sorted.reduce((total, [value, weight]) => total + value * weight, 0);
    variance = () => { const m = mean(); return sorted.reduce((total, [value, weight]) => total + (value - m) ** 2 * weight, 0); };
    support = () => [sorted[0]![0], sorted.at(-1)![0]];
    discrete = true;
  } else {
    discrete = true;
    let lower = 0, upper = Infinity;
    if (name === "binomialdist") {
      const n = parameters[0]!, p = parameters[1]!;
      domain(Number.isSafeInteger(n) && n >= 0 && n <= 100_000, "Binomial trials must be an integer from 0 to 100000.");
      probability(p);
      upper = n;
      pdf = (x) => !Number.isInteger(x) || x < 0 || x > n ? 0 :
        p === 0 ? Number(x === 0) : p === 1 ? Number(x === n) :
          Math.exp(jStat.gammaln(n + 1) - jStat.gammaln(x + 1) - jStat.gammaln(n - x + 1) + x * Math.log(p) + (n - x) * Math.log1p(-p));
      cdf = (x) => x < 0 ? 0 : x >= n ? 1 : p === 0 ? 1 : p === 1 ? 0 : regularizedBeta(1 - p,n - Math.floor(x),Math.floor(x) + 1);
      mean = () => n * p; variance = () => n * p * (1 - p);
    } else if (name === "poissondist") {
      const m = parameters[0]!;
      domain(m > 0 && m <= 10_000, "Poisson mean must be positive and no larger than 10000.");
      pdf = (x) => !Number.isInteger(x) || x < 0 ? 0 : Math.exp(x * Math.log(m) - m - jStat.gammaln(x + 1));
      cdf = (x) => x < 0 ? 0 : gammaProbabilities(Math.floor(x) + 1, m)[1];
      mean = () => m; variance = () => m;
    } else {
      const p = parameters[0]!;
      probability(p);
      domain(p > 0, "Geometric probability must be positive; p = 0 has no finite outcomes.");
      lower = 1;
      pdf = (x) => !Number.isInteger(x) || x < 1 ? 0 : p === 1 ? Number(x === 1) : Math.exp((x - 1) * Math.log1p(-p)) * p;
      cdf = (x) => x < 1 ? 0 : p === 1 ? 1 : -Math.expm1(Math.floor(x) * Math.log1p(-p));
      mean = () => 1 / p; variance = () => (1 - p) / (p * p);
    }
    survival = name === "binomialdist" ? (x) => {
      const n = parameters[0]!, p = parameters[1]!;
      return x < 0 ? 1 : x >= n ? 0 : p === 0 ? 0 : p === 1 ? 1 : regularizedBeta(p,Math.floor(x) + 1,n - Math.floor(x));
    } : name === "poissondist" ? (x) => x < 0 ? 1 : gammaProbabilities(Math.floor(x) + 1, parameters[0]!)[0] :
      (x) => x < 1 ? 1 : parameters[0] === 1 ? 0 : Math.exp(Math.floor(x) * Math.log1p(-parameters[0]!));
    support = () => [lower, upper];
    inverse = (p) => {
      if (p === 0) return lower;
      if (p === 1) return upper;
      let low = lower, high = Number.isFinite(upper) ? upper : Math.max(lower + 1, Math.ceil(mean()));
      let iterations = 0;
      while (cdf(high) < p) {
        high *= 2;
        if (++iterations > 64 || !Number.isSafeInteger(high)) throw new Error("Discrete inverse CDF exceeds the supported range.");
      }
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (cdf(middle) >= p) high = middle;
        else low = middle + 1;
      }
      return low;
    };
  }
  return {
    name, parameters, values, weights, discrete,
    pdf: (x) => { domain(Number.isFinite(x), "PDF input must be finite."); return finite(pdf(x)); },
    cdf: (x) => { domain(!Number.isNaN(x), "CDF input must be a number."); return x === -Infinity ? 0 : x === Infinity ? 1 : finite(cdf(x)); },
    survival: (x) => { domain(!Number.isNaN(x), "Probability bound must be a number."); return x === -Infinity ? 1 : x === Infinity ? 0 : finite(survival(x)); },
    inverse: (p) => { probability(p); return inverse(p); },
    mean: () => finite(mean()), variance: () => finite(variance()), support,
  };
}

export function distributionProbability(distribution: Distribution, lower: number, upper: number): number {
  domain(!Number.isNaN(lower) && !Number.isNaN(upper) && lower <= upper, "Probability lower bound must not exceed the upper bound.");
  const mass = distribution.discrete && Number.isFinite(lower) ? distribution.pdf(lower) : 0;
  const left = distribution.cdf(lower) - mass;
  const value = left > 0.5
    ? distribution.survival(lower) + mass - distribution.survival(upper)
    : distribution.cdf(upper) - left;
  return finite(Math.max(0, Math.min(1, value)));
}

export function probabilityKernel(name: string, args: number[]): number {
  const prefix = name.replace(/(?:pdf|cdf|inv|prob|mean|median|variance|stdev)$/, "");
  const mapping: Record<string, DistributionName> = { normal: "normaldist", t: "tdist", chi: "chisqdist", uniform: "uniformdist",
    binomial: "binomialdist", poisson: "poissondist", geo: "geodist", discrete: "discretedist" };
  const distributionName = mapping[prefix];
  if (!distributionName) throw new Error(`Unknown probability function "${name}".`);
  const property = /(?:mean|median|variance|stdev)$/.exec(name)?.[0];
  domain((property !== undefined || args.length > 0) && args.every(Number.isFinite), "Probability arguments must be finite.");
  const interval = name.endsWith("prob");
  let parameters = args.slice(property ? 0 : interval ? 2 : 1), values: number[] | undefined, weights: number[] | undefined;
  if (distributionName === "discretedist") {
    domain(parameters.length > 0 && parameters.length % 2 === 0, "Discrete probability arguments must contain value/weight pairs.");
    values = parameters.filter((_, index) => index % 2 === 0);
    weights = parameters.filter((_, index) => index % 2 === 1);
    parameters = [];
  }
  const distribution = makeDistribution(distributionName, parameters, values, weights);
  const input = args[0]!;
  const result = property === "mean" ? distribution.mean() : property === "median" ? distribution.inverse(0.5) :
    property === "variance" ? distribution.variance() : property === "stdev" ? Math.sqrt(distribution.variance()) :
    interval ? distributionProbability(distribution, input, args[1]!) :
    name.endsWith("pdf") ? distribution.pdf(distribution.discrete && distributionName !== "discretedist" ? Math.round(input) : input) :
    name.endsWith("cdf") ? distribution.cdf(input) : distribution.inverse(input);
  return finite(result);
}
