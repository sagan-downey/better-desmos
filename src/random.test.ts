import { afterEach, describe, expect, it } from "vitest";
import { expandCollections } from "./collections";
import { rewriteRandom } from "./randomSyntax";
import { getRandomSeed, setRandomSeed } from "./random";
import { rewriteDistributions } from "./distributionSyntax";
import { compileCollectionGraph, compileExpression } from "./math";

const evaluate = (source: string) => compileExpression(source)(0).value.toNumber();
const values = (source: string) => expandCollections(rewriteDistributions(rewriteRandom(source, evaluate), evaluate), evaluate).items.map(evaluate);
afterEach(() => setRandomSeed(1));

describe("seeded random sampling", () => {
  it("stays fixed across redraws and rerandomizes reproducibly", () => {
    setRandomSeed(42);
    const first = values("random(20)");
    expect(values("random(20)")).toEqual(first);
    expect(first).toHaveLength(20);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(first).size).toBe(20);
    setRandomSeed(43);
    expect(values("random(20)")).not.toEqual(first);
    setRandomSeed(42);
    expect(values("random(20)")).toEqual(first);
    expect(getRandomSeed()).toBe(42);
  });
  it("supports distinct random calls and expression scopes", () => {
    expect(evaluate("random()-random()")).not.toBe(0);
    expect(rewriteRandom("random()", evaluate, {}, "sample", "one")).not.toBe(
      rewriteRandom("random()", evaluate, {}, "sample", "two"));
  });
  it("samples lists with replacement and shuffles without dropping values", () => {
    const sample = values("random([2,3,5],40)");
    expect(sample.every((value) => [2,3,5].includes(value))).toBe(true);
    expect(values("shuffle([1,2,3,4,5])").sort()).toEqual([1,2,3,4,5]);
    expect(values("random([2,3,5])")).toHaveLength(1);
    const named = expandCollections(rewriteRandom("random(l,4)", evaluate), evaluate, { l: ["7", "8"] });
    expect(named.items.map(evaluate).every((value) => [7,8].includes(value))).toBe(true);
  });
  it("samples continuous and discrete distributions", () => {
    const normal = values("normaldist(2,3).random(2000)");
    expect(normal).toHaveLength(2000);
    const mean = normal.reduce((sum, value) => sum + value, 0) / normal.length;
    expect(Math.abs(mean - 2)).toBeLessThan(0.25);
    const binomial = values("binomialdist(5,0.5).random(20)");
    expect(binomial.every((value) => Number.isInteger(value) && value >= 0 && value <= 5)).toBe(true);
    expect(values("discretedist([1,2],[0,1]).random(10)")).toEqual(Array(10).fill(2));
    expect(compileCollectionGraph("normaldist().random(5)", {})?.kind).toBe("list");
  });
  it("rejects invalid seeds, empty lists, and unsupported sample sizes", () => {
    for (const seed of [-1, 0.1, Infinity, 2 ** 32]) expect(() => setRandomSeed(seed)).toThrow(/seed/);
    for (const source of ["random(0)", "random(2049)", "random(1.5)", "random([])", "shuffle([])",
      "random(1,2)", "normaldist().random(0)", "normaldist().random(1,2)"]) expect(() => values(source)).toThrow();
  });
});
