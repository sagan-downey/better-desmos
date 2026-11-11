import { describe, expect, it } from "vitest";
import { distributionProbability, makeDistribution } from "./probability";
import { compileExpression, compileFastGraphExpression, compileGraphExpression } from "./math";
import { distributionDefinition, expandDistributionDefinitions, readDistribution, rewriteDistributions } from "./distributionSyntax";

const evaluate = (source: string): number => compileExpression(source)(0).value.toNumber();

describe("probability distributions", () => {
  it("evaluates continuous PDFs and CDFs against known values", () => {
    const normal = makeDistribution("normaldist", []);
    expect(normal.pdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(normal.cdf(0)).toBe(0.5);
    expect(distributionProbability(normal, -1, 1)).toBeCloseTo(0.682689492137, 10);
    expect(normal.inverse(0.975)).toBeCloseTo(1.95996398454, 8);
    const t = makeDistribution("tdist", [1]);
    expect(t.pdf(0)).toBeCloseTo(1 / Math.PI, 12);
    expect(t.cdf(1)).toBeCloseTo(0.75, 8);
    expect(makeDistribution("tdist", [10, 2, 3]).cdf(2)).toBeCloseTo(0.5);
    const chi = makeDistribution("chisqdist", [2]);
    expect(chi.pdf(0)).toBe(0.5);
    expect(chi.cdf(2)).toBeCloseTo(1 - Math.exp(-1), 12);
    const uniform = makeDistribution("uniformdist", [2, 6]);
    expect(uniform.pdf(3)).toBe(0.25);
    expect(uniform.cdf(4)).toBe(0.5);
    expect(uniform.inverse(0.25)).toBe(3);
  });
  it("preserves tail probabilities without subtracting near-one values", () => {
    const normal = makeDistribution("normaldist", []);
    expect(normal.survival(8) / 6.22096057427178e-16).toBeCloseTo(1, 9);
    expect(distributionProbability(normal, 8, 9) / 6.21983198586583e-16).toBeCloseTo(1, 8);
    expect(makeDistribution("chisqdist", [2]).survival(100) / Math.exp(-50)).toBeCloseTo(1, 10);
    expect(normal.cdf(-Infinity)).toBe(0);
    expect(normal.cdf(Infinity)).toBe(1);
    expect(distributionProbability(normal, -Infinity, Infinity)).toBe(1);
    expect(makeDistribution("tdist",[2]).survival(1e8) / 5e-17).toBeCloseTo(1,10);
    expect(makeDistribution("tdist",[1]).cdf(-1e20) * Math.PI * 1e20).toBeCloseTo(1,12);
    expect(makeDistribution("binomialdist",[100,0.5]).survival(99) / (2 ** -100)).toBeCloseTo(1,10);
  });
  it("evaluates discrete mass functions and endpoint parameters", () => {
    const binomial = makeDistribution("binomialdist", [5, 0.5]);
    expect(binomial.pdf(2)).toBeCloseTo(0.3125, 12);
    expect(binomial.cdf(2)).toBeCloseTo(0.5, 8);
    expect(binomial.pdf(1.5)).toBe(0);
    expect(makeDistribution("binomialdist", [5, 0]).pdf(0)).toBe(1);
    expect(makeDistribution("binomialdist", [5, 1]).cdf(4)).toBe(0);
    expect(makeDistribution("poissondist", [2]).pdf(0)).toBeCloseTo(Math.exp(-2), 12);
    const geometric = makeDistribution("geodist", [0.5]);
    expect(geometric.pdf(1)).toBe(0.5);
    expect(geometric.cdf(3)).toBe(0.875);
    expect(geometric.inverse(0.75)).toBe(2);
    expect(makeDistribution("geodist", [1]).pdf(1)).toBe(1);
    expect(distributionProbability(binomial, 1, 2)).toBeCloseTo(0.46875, 8);
    expect(distributionProbability(binomial, 1.5, 2)).toBeCloseTo(0.3125, 8);
  });
  it("avoids factorial overflow at large parameters", () => {
    const poisson = makeDistribution("poissondist", [1000]);
    expect(poisson.pdf(1000)).toBeCloseTo(0.01261461135, 8);
    expect(poisson.cdf(1000)).toBeCloseTo(0.5084093671685, 7);
    const binomial = makeDistribution("binomialdist", [1000, 0.5]);
    expect(binomial.pdf(500)).toBeCloseTo(0.0252250181784, 8);
  });
  it("normalizes weighted outcomes and combines duplicates", () => {
    const d = makeDistribution("discretedist", [], [3, 1, 3], [1, 2, 3]);
    expect(d.pdf(3)).toBeCloseTo(2 / 3);
    expect(d.cdf(2)).toBeCloseTo(1 / 3);
    expect(d.inverse(0.1)).toBe(1);
    expect(d.inverse(0.9)).toBe(3);
    expect(d.mean()).toBeCloseTo(7 / 3);
    expect(d.support()).toEqual([1, 3]);
    expect(makeDistribution("discretedist", [], [1, 2], [1e308, 1e308]).cdf(1)).toBe(0.5);
  });
  it("validates domains and reports undefined or infinite results", () => {
    for (const [name, params] of [
      ["normaldist", [0, 0]], ["tdist", [0]], ["chisqdist", [-1]], ["uniformdist", [2, 1]],
      ["binomialdist", [1.5, 0.5]], ["poissondist", [0]], ["geodist", [0]],
    ] as const) expect(() => makeDistribution(name, [...params])).toThrow();
    expect(() => makeDistribution("discretedist", [], [1, 2], [0, 0])).toThrow(/positive/);
    expect(() => makeDistribution("discretedist", [], [1, 2], [1])).toThrow(/match/);
    expect(() => makeDistribution("tdist", [1]).mean()).toThrow(/undefined/);
    expect(() => makeDistribution("tdist", [2]).variance()).toThrow(/finite/);
    expect(() => makeDistribution("normaldist", []).inverse(-0.1)).toThrow(/between/);
    expect(() => distributionProbability(makeDistribution("normaldist", []), 2, 1)).toThrow(/lower bound/);
    expect(() => evaluate("normaldist().inversecdf(1)")).toThrow(/infinite/);
  });
  it("round-trips central inverse probabilities", () => {
    for (const d of [makeDistribution("normaldist", [3, 2]), makeDistribution("tdist", [8]),
      makeDistribution("chisqdist", [5]), makeDistribution("uniformdist", [])]) {
      for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) expect(d.cdf(d.inverse(p))).toBeCloseTo(p, 6);
    }
    for (const d of [makeDistribution("binomialdist", [10, 0.4]), makeDistribution("poissondist", [5])]) {
      const result = d.inverse(0.7);
      expect(d.cdf(result)).toBeGreaterThanOrEqual(0.7);
      expect(d.cdf(result - 1)).toBeLessThan(0.7);
    }
  });
});

describe("parsed distribution syntax", () => {
  it("supports properties, scalar methods, arithmetic, and list broadcasting", () => {
    expect(evaluate("normaldist().cdf(0)")).toBe(0.5);
    expect(evaluate("normaldist(2,3).mean")).toBe(2);
    expect(evaluate("normaldist(2,3).variance")).toBe(9);
    expect(evaluate("uniformdist(2,6).median")).toBe(4);
    expect(evaluate("2+normaldist().cdf(-1,1)")).toBeCloseTo(2.6826894921);
    expect(evaluate("discretedist([1,2],[1,3]).cdf(1)")).toBe(0.25);
    const graph = compileGraphExpression("normaldist().cdf([0,1])");
    expect(graph.kind).toBe("list");
    if (graph.kind === "list") expect(graph.evaluate()[0]).toBe(0.5);
  });

  describe("polar inequalities", () => {
    it("shades radial bounds in both graph modes", () => {
      for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
        const graph = compile("r<2");
        if (graph.kind !== "inequality") throw new Error("Expected polar shading.");
        const value = (x: number, y: number) => {
          const result = graph.evaluate(x, y);
          return typeof result === "number" ? result : result.toNumber();
        };
        expect(value(0,0)).toBe(-2);
        expect(value(1,1)).toBeLessThan(0);
        expect(value(2,2)).toBeGreaterThan(0);
      }
    });
    it("supports angular bounds and theta-dependent curves", () => {
      const graph = compileGraphExpression("r<=2cos(theta)");
      if (graph.kind !== "inequality") throw new Error("Expected polar shading.");
      const result = graph.evaluate(1,0);
      expect(typeof result === "number" ? result : result.toNumber()).toBeCloseTo(-1);
      const quadrant = compileGraphExpression("r<2{0<=theta<=pi/2}");
      if (quadrant.kind !== "inequality") throw new Error("Expected restricted polar shading.");
      expect(() => quadrant.evaluate(-1,0)).toThrow();
    });
  });
  it("graphs continuous distributions and discrete points in both modes", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const normal = compile("normaldist()");
      if (normal.kind !== "explicit") throw new Error("Expected PDF.");
      const value = normal.evaluate(0);
      expect(typeof value === "number" ? value : value.value.toNumber()).toBeCloseTo(0.3989422804);
      const binomial = compile("binomialdist(5,0.5)");
      expect(binomial.kind).toBe("collection");
      if (binomial.kind === "collection") expect(binomial.graphs).toHaveLength(6);
      expect(compile("binomialdist(5,0.5).pdf(x)").kind).toBe("explicit");
    }
  });
  it("keeps symbolic parameters live and expands named distribution definitions", () => {
    const scope = { a: 2 };
    const f = compileExpression("normaldist(a,1).mean", scope);
    expect(f(0).value.toNumber()).toBe(2);
    scope.a = 5;
    expect(f(0).value.toNumber()).toBe(5);
    const definition = distributionDefinition("d = normaldist(a,2)")!;
    expect(evaluate(expandDistributionDefinitions("d.cdf(0)", [{ target: "d", source: "normaldist()" }]))).toBe(0.5);
    expect(definition.target).toBe("d");
    expect(distributionDefinition("d = normaldist(")).toBeUndefined();
    expect(() => expandDistributionDefinitions("d", [{ target: "d", source: "d" }])).toThrow(/Circular/);
    expect(readDistribution("discretedist(l)", evaluate, { l: ["1", "2"] }).pdf(1)).toBe(0.5);
    expect(() => rewriteDistributions("normaldist().foo(1)", evaluate)).toThrow(/Unsupported/);
  });
});
