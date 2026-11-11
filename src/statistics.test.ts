import { describe, expect, it } from "vitest";
import { expandCollections } from "./collections";
import { compileExpression, compileFastGraphExpression, compileGraphExpression } from "./math";
import { fiveNumberSummary, meanAbsoluteDeviation, pairedStatistic, quantile, quartile } from "./statistics";
import { statisticalPlotShapes, statisticsSummary } from "./statisticalPlots";

const evaluate = (text: string): number => compileExpression(text)(0).value.toNumber();
const numbers = (text: string): number[] => expandCollections(text, evaluate).items.map(evaluate);
const shapes = (text: string) => statisticalPlotShapes(text, evaluate, {}, "sample")!;

describe("descriptive statistics", () => {
  it("uses interpolated quantiles and median-of-halves quartiles without mutating input", () => {
    const values = [10, 1, 5, 3, 7];
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 1)).toBe(10);
    expect(quantile(values, 0.375)).toBe(4);
    expect(fiveNumberSummary(values)).toEqual([1, 2, 5, 8.5, 10]);
    expect(quartile(values, 1)).toBe(2);
    expect(quartile(values, 1.5)).toBe(3.5);
    expect(fiveNumberSummary([4])).toEqual([4, 4, 4, 4, 4]);
    expect(values).toEqual([10, 1, 5, 3, 7]);
    expect(quantile([-1e308, 1e308], 0.5)).toBe(0);
  });
  it("calculates mean absolute deviation rather than median absolute deviation", () => {
    expect(meanAbsoluteDeviation([1, 5, 5, 10])).toBeCloseTo(2.375);
    expect(meanAbsoluteDeviation([2, 2])).toBe(0);
    expect(meanAbsoluteDeviation([-1e308, 1e308])).toBe(1e308);
  });
  it("calculates sample/population covariance and correlations", () => {
    expect(pairedStatistic("cov", [1, 2, 3], [2, 4, 6])).toBeCloseTo(2);
    expect(pairedStatistic("covp", [1, 2, 3], [2, 4, 6])).toBeCloseTo(4 / 3);
    expect(pairedStatistic("covp", [1], [2])).toBe(0);
    expect(pairedStatistic("corr", [1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
    expect(pairedStatistic("corr", [-1e308, 0, 1e308], [-1e308, 0, 1e308])).toBeCloseTo(1);
    expect(pairedStatistic("spearman", [1, 2, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9486832981);
    expect(pairedStatistic("spearman", [1, 2, 3, -100], [1, 2, 3])).toBeCloseTo(1);
    expect(pairedStatistic("cov", [1, 2, 3], [2, 4])).toBeCloseTo(1);
  });
  it("rejects domain errors, undefined correlations, and numeric overflow", () => {
    expect(() => quantile([], 0.5)).toThrow(/nonempty/);
    expect(() => quantile([1], 2)).toThrow(/between 0 and 1/);
    expect(() => quartile([1], 5)).toThrow(/between 0 and 4/);
    expect(() => pairedStatistic("corr", [1, 1], [1, 2])).toThrow(/constant/);
    expect(() => pairedStatistic("cov", [1], [2])).toThrow(/at least two/);
    expect(() => pairedStatistic("cov", [1e308, -1e308], [1e308, -1e308])).toThrow(/numeric range/);
  });
  it("preserves structured arguments and supports list-valued quantile parameters", () => {
    expect(numbers("quantile([1,2,3,4], [0,0.5,1])")).toEqual([1, 2.5, 4]);
    expect(numbers("quartile([1,2,3,4,5], [0,1,2,3,4])")).toEqual([1, 1.5, 3, 4.5, 5]);
    expect(numbers("mad([1,5,5,10])+cov([1,2,3],[2,4,6])")[0]).toBeCloseTo(4.375);
    expect(() => numbers("cov(1,[2,3])")).toThrow(/requires a list/);
    expect(() => numbers("quantile([1,2])")).toThrow(/2 arguments/);
    expect(() => numbers("mad([1,2],3)")).toThrow(/1 argument/);
    expect(() => numbers("quantile([],[])")).toThrow(/nonempty/);
    expect(expandCollections("corr([1,2],[3,4])", evaluate).approximate).toBe(true);
  });
  it("wires every new function into precise and fast graphs", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      for (const text of ["quantile([1,2,3],0.5)", "quartile([1,2,3],2)", "mad([1,2,3])",
        "cov([1,2,3],[2,4,6])", "covp([1,2,3],[2,4,6])",
        "corr([1,2,3],[2,4,6])", "spearman([1,2,3],[2,4,6])"]) {
        const graph = compile(text);
        if (graph.kind !== "explicit") throw new Error("Expected scalar graph.");
        const result = graph.evaluate(0);
        expect(typeof result === "number" ? Number.isFinite(result) : !result.exact).toBe(true);
      }
    }
  });
});

describe("statistical plots", () => {
  it("bins around multiples of the width and preserves total count", () => {
    const bars = shapes("histogram([-0.5,0,0.49,0.5,1])");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ kind: "polygon", vertices: [[-0.5,0],[0.5,0],[0.5,3],[-0.5,3]] });
    expect(bars[1]).toEqual({ kind: "polygon", vertices: [[0.5,0],[1.5,0],[1.5,2],[0.5,2]] });
    expect(shapes("histogram([0,1,2],1,0,1)")[0]).toEqual({
      kind: "polygon", vertices: [[0,0],[1,0],[1,1],[0,1]],
    });
  });
  it("normalizes relative heights and density area to one", () => {
    for (const mode of [1, 2]) {
      const bars = shapes(`histogram([0,0,2],2,${mode})`);
      const total = bars.reduce((sum, shape) => {
        if (shape.kind !== "polygon") throw new Error("Expected bar.");
        return sum + shape.vertices[2]![1] * (mode === 2 ? 2 : 1);
      }, 0);
      expect(total).toBeCloseTo(1);
    }
  });
  it("stacks exact dots within bins and optionally centers them", () => {
    expect(shapes("dotplot([0.1,0.2,1],1)")).toEqual([
      { kind: "point", point: [0.1,1] }, { kind: "point", point: [0.2,2] }, { kind: "point", point: [1,1] },
    ]);
    expect(shapes("dotplot([0.1,0.2],1,1)")).toEqual([
      { kind: "point", point: [0,1] }, { kind: "point", point: [0,2] },
    ]);
  });
  it("uses Moore-McCabe quartiles with configurable position, height, and outliers", () => {
    const box = shapes("boxplot([1,2,3,4,5,6,100],2,4,1)");
    expect(box[0]).toEqual({ kind: "polygon", vertices: [[2,0],[6,0],[6,4],[2,4]] });
    expect(box.at(-1)).toEqual({ kind: "point", point: [100,2] });
    expect(box[3]).toEqual({ kind: "line", start: [6,2], end: [6,2] });
    expect(shapes("boxplot([2])")).toHaveLength(6);
  });
  it("rejects invalid lists, options, and non-finite geometry", () => {
    for (const text of ["histogram([])", "dotplot(2)", "histogram([1],0)", "histogram([1],1,3)",
      "boxplot([1],0,-1)", "histogram([1e308],1e-100)", "dotplot([1], [2])", "stats([1],2)"]) {
      expect(() => shapes(text)).toThrow();
    }
  });
  it("produces graphs from named lists and shows summary statistics", () => {
    const lists = { l: ["1", "2", "3", "4", "5"] };
    expect(statisticalPlotShapes("histogram(l)", evaluate, lists, "sample")).toHaveLength(5);
    expect(statisticsSummary("stats(l)", evaluate, lists, "population")).toContain("n = 5");
    expect(statisticsSummary("stats([2])", evaluate, {}, "sample")).toContain("sample SD undefined");
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      for (const text of ["histogram([1,2])", "dotplot([1,2])", "boxplot([1,2])", "stats([1,2])"]) {
        expect(compile(text).kind).toBe("collection");
      }
    }
  });
});
