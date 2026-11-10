import { describe, it, expect } from "vitest";
import { fitLogistic, fitModel } from './regression';

const xs = Array.from({ length: 21 }, (_, i) => i / 2 - 5);

describe('fitModel', () => {
  it('recovers the exact least-squares linear answer to 1e-9', () => {
    const x = [0, 1, 2, 3, 4];
    const result = fitModel({
      parameterNames: ['a', 'b'],
      observed: [1, 2, 2, 4, 4],
      model: ({ a, b }, i) => a * x[i] + b,
    });
    expect(Math.abs(result.parameters.a - 0.8)).toBeLessThan(1e-9);
    expect(Math.abs(result.parameters.b - 1)).toBeLessThan(1e-9);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it.each([undefined, { a: 1000, b: -700 }])('matches analytic noisy linear least squares with initial %j', initial => {
    const x = [-7, -2, -0.25, 1.5, 8, 11];
    const observed = [2, 3, -4, 8, 6, -2];
    const meanX = x.reduce((sum, value) => sum + value, 0) / x.length;
    const meanY = observed.reduce((sum, value) => sum + value, 0) / x.length;
    const slope = x.reduce((sum, value, i) => sum + (value - meanX) * (observed[i] - meanY), 0) /
      x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
    const intercept = meanY - slope * meanX;
    const result = fitModel({
      parameterNames: ['a', 'b'], observed, initial,
      model: ({ a, b }, i) => a * x[i] + b,
    });
    expect(Math.abs(result.parameters.a - slope)).toBeLessThan(1e-9);
    expect(Math.abs(result.parameters.b - intercept)).toBeLessThan(1e-9);
    expect(result.converged).toBe(true);
  });

  it('recovers a quadratic', () => {
    const result = fitModel({
      parameterNames: ['a', 'b', 'c'],
      observed: xs.map(x => 2.5 * x * x - 1.3 * x + 0.7),
      model: ({ a, b, c }, i) => a * xs[i] ** 2 + b * xs[i] + c,
    });
    expect(result.parameters.a).toBeCloseTo(2.5, 9);
    expect(result.parameters.b).toBeCloseTo(-1.3, 9);
    expect(result.parameters.c).toBeCloseTo(0.7, 9);
    expect(result.converged).toBe(true);
  });

  it('recovers exponential parameters', () => {
    const result = fitModel({
      parameterNames: ['a', 'b'],
      observed: xs.map(x => 2.4 * Math.exp(0.35 * x)),
      model: ({ a, b }, i) => a * Math.exp(b * xs[i]),
    });
    expect(result.parameters.a).toBeCloseTo(2.4, 8);
    expect(result.parameters.b).toBeCloseTo(0.35, 8);
    expect(result.rmse).toBeLessThan(1e-8);
    expect(result.converged).toBe(true);
  });

  it('recovers a sinusoid from a decent initial guess', () => {
    const result = fitModel({
      parameterNames: ['a', 'b', 'c'],
      observed: xs.map(x => 3 * Math.sin(1.4 * x + 0.3)),
      initial: { a: 2.7, b: 1.3, c: 0.2 },
      model: ({ a, b, c }, i) => a * Math.sin(b * xs[i] + c),
    });
    expect(result.parameters.a).toBeCloseTo(3, 8);
    expect(result.parameters.b).toBeCloseTo(1.4, 8);
    expect(result.parameters.c).toBeCloseTo(0.3, 8);
    expect(result.rSquared).toBeCloseTo(1, 12);
  });

  it('reports observed-minus-predicted residuals and least-squares statistics', () => {
    const observed = [1, 2, 2, 4, 4];
    const result = fitModel({
      parameterNames: ['a', 'b'],
      observed,
      model: ({ a, b }, i) => a * i + b,
    });
    const expectedResiduals = [0, 0.2, -0.6, 0.6, -0.2];
    result.residuals.forEach((value, i) => expect(value).toBeCloseTo(expectedResiduals[i], 9));
    expect(result.rmse).toBeCloseTo(0.4, 10);
    expect(result.rSquared).toBeCloseTo(1 - 0.8 / 7.2, 10);
  });

  it('handles constant observations and an exact fit', () => {
    const result = fitModel({ parameterNames: ['a'], observed: [1, 1, 1], model: ({ a }) => a });
    expect(result.rSquared).toBe(1);
    expect(result.rmse).toBe(0);
    expect(result.residuals).toEqual([0, 0, 0]);
    expect(result.converged).toBe(true);
  });

  it('reports zero rSquared for an inexact constant-data fit', () => {
    const result = fitModel({ parameterNames: ['a'], observed: [2, 2, 2], model: () => 1 });
    expect(result.rSquared).toBe(0);
    expect(result.rmse).toBe(1);
  });

  it('recognizes constant decimal observations without spurious variance', () => {
    const result = fitModel({ parameterNames: ['a'], observed: Array(10).fill(0.3), model: () => 0.2 });
    expect(result.rSquared).toBe(0);
    expect(result.rmse).toBeCloseTo(0.1, 12);
  });

  it('regularizes singular systems and unused parameters', () => {
    const result = fitModel({
      parameterNames: ['a', 'b', 'unused'], observed: [5, 5, 5, 5],
      model: ({ a, b }) => a + b,
    });
    expect(result.parameters.a + result.parameters.b).toBeCloseTo(5, 9);
    expect(result.rmse).toBeLessThan(1e-9);
    expect(Number.isFinite(result.parameters.unused)).toBe(true);
  });

  it('uses fallback starts when the first starting point is outside the domain', () => {
    const result = fitModel({
      parameterNames: ['a'], observed: [2, 2],
      initial: { a: 10 }, model: ({ a }) => Math.log(-a),
    });
    expect(result.parameters.a).toBeCloseTo(-Math.exp(2), 8);
    expect(result.rmse).toBeLessThan(1e-9);
  });

  it('can use one-sided derivatives at a domain boundary', () => {
    const result = fitModel({
      parameterNames: ['a'], observed: [2], initial: { a: 0 },
      model: ({ a }) => a >= 0 ? a : NaN,
    });
    expect(result.parameters.a).toBeCloseTo(2, 9);
  });

  it('preserves accuracy with differently scaled parameters', () => {
    const result = fitModel({
      parameterNames: ['a', 'b'], observed: xs.map(x => 2e-6 * x * 1e6 + 4),
      model: ({ a, b }, i) => a * xs[i] * 1e6 + b,
    });
    expect(result.parameters.a).toBeCloseTo(2e-6, 12);
    expect(result.parameters.b).toBeCloseTo(4, 9);
  });

  it('is deterministic and does not mutate input data or initial guesses', () => {
    const observed = Object.freeze([1, 3, 5]);
    const initial = Object.freeze({ a: 1, b: 0 });
    const options = {
      parameterNames: ['a', 'b'], observed: [...observed], initial,
      model: ({ a, b }: Record<string, number>, i: number) => a * i + b,
    };
    expect(fitModel(options)).toEqual(fitModel(options));
    expect(options.observed).toEqual(observed);
    expect(initial).toEqual({ a: 1, b: 0 });
  });

  it('bounds evaluation counts even with a huge requested iteration limit', () => {
    let calls = 0;
    const result = fitModel({
      parameterNames: ['a'], observed: [Math.PI], maxIterations: 1e9,
      model: ({ a }) => { calls++; return Math.sin(a); },
    });
    expect(calls).toBeLessThanOrEqual(250_000);
    expect(result.iterations).toBeLessThanOrEqual(2000);
    expect(Number.isFinite(result.rmse)).toBe(true);
  });

  it('returns a finite unconverged fit when the iteration limit is reached', () => {
    const result = fitModel({
      parameterNames: ['a'], observed: [5], maxIterations: 1,
      model: ({ a }) => Math.exp(a),
    });
    expect(result.iterations).toBe(1);
    expect(result.converged).toBe(false);
    expect(Number.isFinite(result.rmse)).toBe(true);
  });

  it('rejects missing parameters', () => {
    expect(() => fitModel({ parameterNames: [], observed: [1], model: () => 1 }))
      .toThrow(/at least one parameter/);
  });

  it('rejects duplicate parameters', () => {
    expect(() => fitModel({ parameterNames: ['a', 'a'], observed: [1, 2], model: () => 1 }))
      .toThrow(/unique/);
  });

  it('rejects fewer observations than parameters', () => {
    expect(() => fitModel({ parameterNames: ['a', 'b'], observed: [1], model: () => 1 }))
      .toThrow(/at least as many observations/);
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite observations (%s)', value => {
    expect(() => fitModel({ parameterNames: ['a'], observed: [value], model: () => 1 }))
      .toThrow(/observations must be finite/);
  });

  it.each([() => NaN, () => Infinity, () => { throw new Error('domain'); }])(
    'rejects a model undefined at every start', model => {
      expect(() => fitModel({ parameterNames: ['a'], observed: [1], model }))
        .toThrow('Regression model is undefined at the starting parameters');
    },
  );

  it('rejects non-finite sum of squared residuals', () => {
    expect(() => fitModel({ parameterNames: ['a'], observed: [1e308], model: () => -1e308 }))
      .toThrow('Regression failed to produce a finite fit');
  });

  it('rejects invalid iteration limits, tolerances, and initial values', () => {
    const options = { parameterNames: ['a'], observed: [1], model: () => 1 };
    expect(() => fitModel({ ...options, maxIterations: 0 })).toThrow(/maxIterations/);
    expect(() => fitModel({ ...options, tolerance: NaN })).toThrow(/tolerance/);
    expect(() => fitModel({ ...options, initial: { a: Infinity } })).toThrow(/parameters must be finite/);
  });
});

describe('fitLogistic', () => {
  it.each([0.8, -0.8])('recovers noise-free logistic parameters with b = %s', b => {
    const ys = xs.map(x => 12 / (1 + 3 * Math.exp(-b * x)));
    const result = fitLogistic(xs, ys);
    expect(result.parameters.a).toBeCloseTo(3, 7);
    expect(result.parameters.b).toBeCloseTo(b, 7);
    expect(result.parameters.c).toBeCloseTo(12, 7);
    expect(result.rmse).toBeLessThan(1e-8);
    expect(result.converged).toBe(true);
  });

  it('fits a negative-valued logistic curve', () => {
    const result = fitLogistic(xs, xs.map(x => -8 / (1 + 2 * Math.exp(-0.7 * x))));
    expect(result.parameters.a).toBeCloseTo(2, 7);
    expect(result.parameters.b).toBeCloseTo(0.7, 7);
    expect(result.parameters.c).toBeCloseTo(-8, 7);
  });

  it('rejects unequal lengths, non-finite x values, and insufficient rows', () => {
    expect(() => fitLogistic([1], [1, 2])).toThrow(/matching/);
    expect(() => fitLogistic([1, NaN, 3], [1, 2, 3])).toThrow(/x observations must be finite/);
    expect(() => fitLogistic([1, 2, 3], [1, Infinity, 3])).toThrow(/observations must be finite/);
    expect(() => fitLogistic([1, 2], [1, 2])).toThrow(/at least as many observations/);
  });
});
