/** Statistics and parameters from the best finite least-squares fit. */
export interface FitResult {
  parameters: Record<string, number>;
  residuals: number[];
  rSquared: number;
  rmse: number;
  /** Iterations performed by the winning starting point. */
  iterations: number;
  converged: boolean;
}

export interface FitOptions {
  parameterNames: string[];
  model: (parameters: Record<string, number>, rowIndex: number) => number;
  observed: number[];
  initial?: Record<string, number>;
  maxIterations?: number;
  tolerance?: number;
  /** Only start from `initial`, e.g. when refining an existing fit. */
  singleStart?: boolean;
}

interface Evaluation {
  predictions: number[];
  residuals: number[];
  sse: number;
}

interface Candidate {
  values: number[];
  evaluation: Evaluation;
  iterations: number;
  converged: boolean;
}

function solve(matrix: number[][], right: number[]): number[] | undefined {
  const size = right.length;
  const rows = matrix.map((row, i) => [...row, right[i]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (!Number.isFinite(rows[pivot][column]) || Math.abs(rows[pivot][column]) < 1e-15) {
      return undefined;
    }
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = column + 1; row < size; row++) {
      const factor = rows[row][column] / rows[column][column];
      for (let k = column + 1; k <= size; k++) rows[row][k] -= factor * rows[column][k];
      rows[row][column] = 0;
    }
  }
  const result = Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row--) {
    let value = rows[row][size];
    for (let column = row + 1; column < size; column++) value -= rows[row][column] * result[column];
    result[row] = value / rows[row][row];
    if (!Number.isFinite(result[row])) return undefined;
  }
  return result;
}

/**
 * Deterministic Levenberg–Marquardt fitting with central numeric derivatives.
 * Unspecified parameters start at 1; several fallback starts help escape invalid
 * domains and poor local minima. The model should be pure and deterministic.
 */
export function fitModel(options: FitOptions): FitResult {
  const { parameterNames: names, observed, model } = options;
  const count = names.length;
  if (count === 0) throw new Error('Regression requires at least one parameter');
  if (new Set(names).size !== count) throw new Error('Regression parameter names must be unique');
  if (observed.length < count) throw new Error('Regression requires at least as many observations as parameters');
  if (!observed.every(Number.isFinite)) throw new Error('Regression observations must be finite');
  const requestedIterations = options.maxIterations ?? 200;
  const tolerance = options.tolerance ?? 1e-10;
  if (!Number.isFinite(requestedIterations) || requestedIterations < 1) {
    throw new Error('Regression maxIterations must be a positive finite number');
  }
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new Error('Regression tolerance must be a positive finite number');
  }
  const maxIterations = Math.min(2000, Math.floor(requestedIterations));
  const initial = names.map(name => options.initial?.[name] ?? 1);
  if (!initial.every(Number.isFinite)) throw new Error('Initial regression parameters must be finite');
  const starts = options.singleStart ? [initial] : [initial, ...[0.1, -1, 0, 10].map(value => names.map(() => value))];
  // Bound both calls per data set and scalar model calls, even for costly models.
  const scalarBudget = Math.max(250_000, observed.length * 10);
  let scalarCalls = 0;
  let vectorCalls = 0;
  let sawDefinedStart = false;
  const exhausted = () => vectorCalls >= 10_000 || scalarCalls + observed.length > scalarBudget;
  const evaluate = (values: number[]): Evaluation | undefined => {
    if (exhausted() || !values.every(Number.isFinite)) return undefined;
    vectorCalls++;
    const parameters = Object.fromEntries(names.map((name, i) => [name, values[i]]));
    const predictions: number[] = [];
    const residuals: number[] = [];
    let sse = 0;
    for (let row = 0; row < observed.length; row++) {
      let prediction: number;
      try {
        scalarCalls++;
        prediction = model(parameters, row);
      } catch {
        return undefined;
      }
      if (!Number.isFinite(prediction)) return undefined;
      predictions.push(prediction);
      const residual = observed[row] - prediction;
      residuals.push(residual);
      sse += residual * residual;
    }
    return { predictions, residuals, sse };
  };

  let best: Candidate | undefined;
  for (const start of starts) {
    if (exhausted()) break;
    let values = [...start];
    let current = evaluate(values);
    if (!current) continue;
    sawDefinedStart = true;
    if (!Number.isFinite(current.sse)) continue;
    let damping = 1e-3;
    let iterations = 0;
    let converged = current.sse === 0;

    while (!converged && iterations < maxIterations && !exhausted()) {
      iterations++;
      const columns: number[][] = [];
      for (let parameter = 0; parameter < count; parameter++) {
        const step = Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(values[parameter]));
        const plus = [...values];
        const minus = [...values];
        plus[parameter] += step;
        minus[parameter] -= step;
        const high = evaluate(plus);
        const low = evaluate(minus);
        if ((!high && !low) || exhausted()) break;
        // A one-sided derivative keeps fits usable at a model's domain boundary.
        const column = observed.map((_, row) => high && low
          ? (high.predictions[row] - low.predictions[row]) / (2 * step)
          : high
            ? (high.predictions[row] - current!.predictions[row]) / step
            : (current!.predictions[row] - low!.predictions[row]) / step);
        if (!column.every(Number.isFinite)) break;
        columns.push(column);
      }
      if (columns.length !== count) break;
      const normal = Array.from({ length: count }, () => Array<number>(count).fill(0));
      const gradient = Array<number>(count).fill(0);
      for (let j = 0; j < count; j++) {
        for (let row = 0; row < observed.length; row++) {
          gradient[j] += columns[j][row] * current.residuals[row];
        }
        for (let k = 0; k <= j; k++) {
          let product = 0;
          for (let row = 0; row < observed.length; row++) product += columns[j][row] * columns[k][row];
          normal[j][k] = product;
          normal[k][j] = product;
        }
      }
      // Diagonal scaling is algebraically equivalent to adding lambda * diag(J'J),
      // but avoids fragile absolute pivot thresholds when parameters have different units.
      const scales = normal.map((row, j) => row[j] > 0 ? Math.sqrt(row[j]) : 1);
      const right = gradient.map((value, j) => value / scales[j]);
      if (!right.every(Number.isFinite) || !scales.every(Number.isFinite)) break;
      if (Math.max(...right.map(Math.abs)) <= tolerance * Math.max(1, Math.sqrt(current.sse))) {
        converged = true;
        break;
      }

      let accepted = false;
      for (let attempt = 0; attempt < 20 && !exhausted(); attempt++) {
        const matrix = normal.map((row, j) => row.map((value, k) =>
          value / scales[j] / scales[k] + (j === k ? damping : 0)));
        const scaledDelta = solve(matrix, right);
        if (!scaledDelta) {
          damping *= 10;
          continue;
        }
        const delta = scaledDelta.map((value, j) => value / scales[j]);
        const trialValues = values.map((value, j) => value + delta[j]);
        const trial = evaluate(trialValues);
        // Near a noisy optimum, a useful final correction can change SSE by less
        // than one rounding unit. Permit that correction only for a tiny step.
        const roundingPlateau = trial && damping <= 1e-3 &&
          Math.abs(trial.sse - current.sse) <= 4 * Number.EPSILON * current.sse &&
          delta.every((value, j) => Math.abs(value) <= Math.sqrt(Number.EPSILON) *
            Math.max(1, Math.abs(values[j])));
        if (trial && Number.isFinite(trial.sse) && (trial.sse < current.sse || roundingPlateau)) {
          const smallStep = delta.every((value, j) =>
            Math.abs(value) <= tolerance * Math.max(1, Math.abs(values[j])));
          values = trialValues;
          current = trial;
          converged = (smallStep && damping <= 1e-3) || current.sse === 0;
          damping = Math.max(1e-15, damping / 10);
          accepted = true;
          break;
        }
        // Only declare a stalled fit converged for a small, lightly damped step;
        // arbitrarily large damping would otherwise make every failed fit converge.
        // Below sqrt(epsilon) relative change, SSE can no longer distinguish parameter values.
        if (trial && damping <= 1e-3 && delta.every((value, j) =>
          Math.abs(value) <= Math.max(tolerance, Math.sqrt(Number.EPSILON)) * Math.max(1, Math.abs(values[j])))) {
          converged = true;
          break;
        }
        damping *= 10;
      }
      if (!accepted) break;
    }
    if (!best || current.sse < best.evaluation.sse ||
      (current.sse === best.evaluation.sse && converged && !best.converged)) {
      best = { values, evaluation: current, iterations, converged };
    }
    const dataScale = observed.reduce((scale, value) => Math.max(scale, Math.abs(value)), 1);
    if (best.converged && Math.sqrt(best.evaluation.sse / observed.length) <= tolerance * dataScale) break;
  }
  if (!best) {
    throw new Error(sawDefinedStart
      ? 'Regression failed to produce a finite fit'
      : 'Regression model is undefined at the starting parameters');
  }
  // Welford's update preserves exactly zero variance for constant decimal data.
  let mean = observed[0];
  let sst = 0;
  for (let row = 1; row < observed.length; row++) {
    const difference = observed[row] - mean;
    mean += difference / (row + 1);
    sst += difference * (observed[row] - mean);
  }
  const { sse, residuals } = best.evaluation;
  const rSquared = sst === 0 ? (sse === 0 ? 1 : 0) : 1 - sse / sst;
  const rmse = Math.sqrt(sse / observed.length);
  if (!Number.isFinite(rSquared) || !Number.isFinite(rmse)) {
    throw new Error('Regression failed to produce a finite fit');
  }
  return {
    parameters: Object.fromEntries(names.map((name, i) => [name, best.values[i]])),
    residuals,
    rSquared,
    rmse,
    iterations: best.iterations,
    converged: best.converged,
  };
}

/** Fit y = c / (1 + a * exp(-b * x)), using a logit-based starting guess. */
export function fitLogistic(xs: number[], ys: number[]): FitResult {
  if (xs.length !== ys.length) throw new Error('Logistic regression requires matching x and y observations');
  if (!xs.every(Number.isFinite)) throw new Error('Logistic regression x observations must be finite');
  if (!ys.every(Number.isFinite)) throw new Error('Regression observations must be finite');
  let extreme = 0;
  for (const value of ys) if (Math.abs(value) > Math.abs(extreme)) extreme = value;
  const c = extreme === 0 ? 1 : extreme * 1.1;
  const transformed = ys.flatMap((y, row) => {
    const ratio = c / y - 1;
    return ratio > 0 && Number.isFinite(ratio) ? [{ x: xs[row], y: Math.log(ratio) }] : [];
  });
  let a = 1;
  let b = 1;
  if (transformed.length >= 2) {
    const meanX = transformed.reduce((sum, point) => sum + point.x / transformed.length, 0);
    const meanY = transformed.reduce((sum, point) => sum + point.y / transformed.length, 0);
    let covariance = 0;
    let variance = 0;
    for (const point of transformed) {
      covariance += (point.x - meanX) * (point.y - meanY);
      variance += (point.x - meanX) ** 2;
    }
    if (variance > 0) {
      b = -covariance / variance;
      a = Math.exp(Math.max(-50, Math.min(50, meanY + b * meanX)));
    }
  }
  return fitModel({
    parameterNames: ['a', 'b', 'c'],
    observed: ys,
    initial: { a, b, c },
    model: (parameters, row) => {
      const { a, b, c } = parameters;
      if (a === 0) return c;
      const exponent = -b * xs[row];
      if (exponent > 0) {
        const inverse = Math.exp(-exponent);
        return c * inverse / (inverse + a);
      }
      return c / (1 + a * Math.exp(exponent));
    },
  });
}
