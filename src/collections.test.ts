import { describe, expect, it } from "vitest";
import { expandCollections, MAX_COLLECTION_ITEMS } from "./collections";
import { compileExpression, compileGraphExpression, compileFastGraphExpression, compileCollectionGraph, expandUserFunctions } from "./math";

const evaluate = (source: string) => compileExpression(source)(0).value.toNumber();
const numbers = (source: string, lists: Record<string, string[]> = {}) =>
  expandCollections(source, evaluate, lists).items.map(evaluate);

describe("collections and multi-input functions", () => {
  it("broadcasts scalars and zips equal-length lists through arithmetic and calls", () => {
    expect(numbers("2[1,2,3]+[4,5,6]")).toEqual([6, 9, 12]);
    expect(numbers("sin([0,pi/2,pi])").slice(0, 2)).toEqual([0, 1]);
    expect(() => numbers("[1,2]+[1,2,3]")).toThrow(/same length/);
    expect(numbers("[]+1")).toEqual([]);
    expect(numbers("[2]+1")).toEqual([3]);
  });

  it("generates ascending, descending, fractional and empty ranges", () => {
    expect(numbers("[1...4]")).toEqual([1, 2, 3, 4]);
    expect(numbers("[1,3...7]")).toEqual([1, 3, 5, 7]);
    expect(numbers("[3,2...0]")).toEqual([3, 2, 1, 0]);
    expect(numbers("[0,0.25…1]")).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(numbers("[4...1]")).toEqual([]);
    expect(() => numbers("[1,1...3]")).toThrow(/zero/);
    expect(() => numbers(`[1...${MAX_COLLECTION_ITEMS + 1}]`)).toThrow(/limited/);
  });

  it("indexes and filters named lists without changing one-based indexing", () => {
    const lists = { l: ["-2", "0", "3", "4"] };
    expect(numbers("l[3]", lists)).toEqual([3]);
    expect(expandCollections("l[3]", evaluate, lists).list).toBe(false);
    expect(numbers("l[1,3]", lists)).toEqual([-2, 3]);
    expect(numbers("l [3]", lists)).toEqual([3]);
    expect(numbers("l[1,3][2]", lists)).toEqual([3]);
    expect(numbers("l[2...4]", lists)).toEqual([0, 3, 4]);
    expect(numbers("l[l>0]", lists)).toEqual([3, 4]);
    expect(numbers("l[l!=0]", lists)).toEqual([-2, 3, 4]);
    expect(numbers("l[l≥0]", lists)).toEqual([0, 3, 4]);
    expect(() => numbers("l[0]", lists)).toThrow(/integer between/);
    expect(() => numbers("l[5]", lists)).toThrow(/integer between/);
    expect(() => numbers("l[1.5]", lists)).toThrow(/integer between/);
  });

  it("preserves exact list arithmetic and explicitly flags numerical reductions", () => {
    const sum = compileGraphExpression("total([1/3,2/3])");
    if (sum.kind !== "explicit") throw Error("Expected scalar");
    const result = sum.evaluate(0);
    expect(typeof result !== "number" && result.exact).toBe(true);
    expect(typeof result !== "number" && result.value.toString()).toBe("1");
    const stdev = compileGraphExpression("stdev([1,2,3])");
    if (stdev.kind !== "explicit") throw Error("Expected scalar");
    const approximate = stdev.evaluate(0);
    expect(typeof approximate !== "number" && approximate.exact).toBe(false);
    expect(numbers("[1/3,2/3...1]")).toEqual([1 / 3, 2 / 3, 1]);
  });

  it("uses sample statistics only when requested and provides explicit population functions", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      for (const [source, mode, expected] of [
        ["stdev(1,2,3)", "sample", 1], ["stdev([1,2,3])", "sample", 1],
        ["variance([1,2,3])", "sample", 1], ["stdevp([1,2,3])", "sample", Math.sqrt(2 / 3)],
        ["var([1,2,3])", "sample", 1], ["varp(1,2,3)", "sample", 2 / 3],
        ["stdev(1,2,3)", "population", Math.sqrt(2 / 3)],
      ] as const) {
        const graph = compile(source, {}, mode);
        if (graph.kind !== "explicit") throw Error("Expected scalar");
        const result = graph.evaluate(0);
        expect(typeof result === "number" ? result : result.value.toNumber()).toBeCloseTo(expected);
      }
      expect(() => compile("stdev([1])", {}, "sample")).toThrow(/at least two/);
      const singleton = compile("stdev(1)", {}, "sample");
      expect(() => singleton.kind === "explicit" && singleton.evaluate(0)).toThrow(/at least two/);
    }
  });

  it("supports reductions and deterministic list operations", () => {
    expect(numbers("mean([1,2,3])+total([4,5])")).toEqual([11]);
    expect(numbers("length([])")).toEqual([0]);
    expect(numbers("join([1,2],[3])")).toEqual([1, 2, 3]);
    expect(numbers("reverse([1,2,3])")).toEqual([3, 2, 1]);
    expect(numbers("sort([3,-1,2])")).toEqual([-1, 2, 3]);
    expect(numbers("unique([1,2,1])")).toEqual([1, 2]);
    expect(numbers("median([4,1,2,3])")).toEqual([2.5]);
    expect(numbers("min([4,1,2])")).toEqual([1]);
    expect(numbers("max([4,1,2])")).toEqual([4]);
    expect(numbers("sum([])")).toEqual([0]);
    expect(numbers("product([])")).toEqual([1]);
    expect(numbers("variance([1,2,3])")[0]).toBeCloseTo(2 / 3);
    expect(numbers("stdev([1,2,3])")[0]).toBeCloseTo(Math.sqrt(2 / 3));
    expect(() => numbers("mean([])")).toThrow(/nonempty/);
  });

  it("generates Cartesian products using locally bound for variables", () => {
    expect(numbers("a^2 for a=[1...3]")).toEqual([1, 4, 9]);
    expect(numbers("a+b for a=[1,2],b=[10,20]")).toEqual([11, 21, 12, 22]);
    expect(expandCollections("(a,b) for a=[1,2],b=[3,4]", evaluate).items).toHaveLength(4);
    expect(() => numbers("a for a=2")).toThrow(/requires a list/);
    expect(() => numbers("a for a=[1],a=[2]")).toThrow(/distinct/);
    expect(() => numbers("a for a=[1...100],b=[1...100]")).toThrow(/limited/);
  });

  it("compiles lists, fixed point lists, and curve families in both modes", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const list = compile("[1...3]");
      expect(list.kind === "list" && list.evaluate()).toEqual([1, 2, 3]);
      const points = compile("([1,2],[3,4])");
      if (points.kind !== "collection") throw Error("Expected points");
      expect(points.graphs.map((point) => point.kind === "point" && point.evaluate())).toEqual([[1, 3], [2, 4]]);
      const curves = compile("y=[1,2]x");
      if (curves.kind !== "collection") throw Error("Expected curves");
      expect(curves.graphs.map((graph) => {
        if (graph.kind !== "explicit") throw Error("Expected explicit");
        const result = graph.evaluate(3);
        return typeof result === "number" ? result : result.value.toNumber();
      })).toEqual([3, 6]);
    }
    const graph = compileCollectionGraph("l*x", {}, { l: ["1", "2"] });
    expect(graph?.kind).toBe("collection");
  });

  it("substitutes multiple parameters simultaneously and preserves nested commas", () => {
    const functions = [
      { name: "f", parameter: "x", parameters: ["x", "y"], body: "x+2y" },
      { name: "g_1", parameter: "a", parameters: ["a", "b"], body: "f(b,a)" },
    ];
    expect(evaluate(expandUserFunctions("f(2,3)", functions))).toBe(8);
    expect(evaluate(expandUserFunctions("g_1(2,3)", functions))).toBe(7);
    expect(evaluate(expandUserFunctions("f({1<2:3,4},5)", functions))).toBe(13);
    expect(() => expandUserFunctions("f(1)", functions)).toThrow(/2 arguments/);
    expect(() => expandUserFunctions("f(1,)", functions)).toThrow(/requires/);
    expect(() => expandUserFunctions("f(1,2)", [{ name: "f", parameter: "x", parameters: ["x", "x"], body: "x" }])).toThrow(/distinct/);
  });

  it("rejects invalid brackets and unsafe text instead of evaluating JavaScript", () => {
    for (const source of ["[1,2)", "[1,]", "[window.alert(1)]", "l[0]", "[1...1/0]"]) {
      expect(() => numbers(source, { l: ["1"] })).toThrow();
    }
  });
});
