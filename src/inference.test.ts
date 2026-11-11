import { describe, expect, it } from "vitest";
import { inferenceCall, inferenceProperty, inferenceSummary, readInference, inferenceDefinition, expandInferenceDefinitions, regressionSlopeSummary } from "./inference";
import { compileCollectionGraph, compileExpression, freeIdentifiers } from "./math";

const evaluate = (source: string) => compileExpression(source)(0).value.toNumber();
const test = (source: string, lists: Record<string, string[]> = {}) => {
  const call = inferenceCall(source);
  if (!call) throw new Error("Expected inference call.");
  return readInference(call, evaluate, lists);
};

describe("statistical inference", () => {
  it("does not create variable dependencies for object property or method names",()=>{
    expect(freeIdentifiers("u.test(2).p")).toEqual(["u"]);
    expect(freeIdentifiers("d.cdf(a)+p.x")).toEqual(["d","a","p"]);
  });
  it("expands named inference objects without replacing member names",()=>{
    const definition=inferenceDefinition("p=ttest([1,2,3])")!;
    expect(definition.target).toBe("p");
    expect(expandInferenceDefinitions("p.test(2).p",[definition])).toBe("ttest([1,2,3]).test(2).p");
    expect(evaluate(expandInferenceDefinitions("p.test(2).p",[definition]))).toBe(1);
    expect(()=>expandInferenceDefinitions("p",[definition,definition])).toThrow(/more than once/);
    expect(inferenceDefinition("p=ttest(")).toBeUndefined();
  });
  it("calculates slope uncertainty from residuals and n-2 degrees of freedom",()=>{
    const slope=regressionSlopeSummary([1,2,3,4,5],[2,4,5,4,5]);
    expect(slope.estimate).toBeCloseTo(0.6,12);
    expect(slope.dof).toBe(3);
    expect(slope.stderr).toBeCloseTo(Math.sqrt(2.4/3/10),12);
    expect(()=>regressionSlopeSummary([1,2,3],[1,2,3])).toThrow(/nonzero/);
  });
  it("calculates mean z tests and confidence intervals", () => {
    const z = test("ztest([1,2,3],0.5).test(2)");
    expect(z.estimate).toBe(2);
    expect(z.score).toBe(0);
    expect(z.p).toBe(1);
    expect(z.stderr).toBeCloseTo(0.5 / Math.sqrt(3), 12);
    expect(z.lower).toBeCloseTo(1.43420713296, 8);
    const two = test("ztest([1,2,3],1,[2,3,4],2)");
    expect(two.estimate).toBe(-1);
    expect(two.stderr).toBeCloseTo(Math.sqrt(5 / 3));
    expect(test("ztest(2,0.5,3).test(2)").lower).toBeCloseTo(z.lower!, 12);
    expect(test("ztest([2],0.5).test(2)").p).toBe(1);
  });
  it("calculates one-sample and Welch t tests without requiring equal lengths", () => {
    const t = test("ttest([1,2,3]).test(2)");
    expect(t.dof).toBe(2);
    expect(t.p).toBe(1);
    expect(t.lower).toBeCloseTo(-0.4841377117195, 6);
    const welch = test("ttest([1,2,3],[4,5,6,7])");
    expect(welch.estimate).toBe(-3.5);
    expect(welch.stderr).toBeCloseTo(Math.sqrt(0.75));
    expect(welch.dof).toBeCloseTo(4.95918367346939, 9);
    expect(test("ttest(2,1,3,5.5,sqrt(5/3),4)").p).toBeCloseTo(welch.p, 9);
  });
  it("supports one-sided null tests and matching confidence properties", () => {
    const z = test("ztest([1,2,3],1).test(0,1,0.9)");
    expect(z.p).toBe(z.pright);
    expect(z.pleft + z.pright).toBeCloseTo(1, 12);
    expect(z.p).toBeCloseTo(0.00026600275257, 10);
    expect(test("ztest([1,2,3],1).test(0,-1)").p).toBeCloseTo(z.pleft);
    expect(evaluate("ztest([1,2,3],1).conf(0.9).lower")).toBeCloseTo(z.lower!, 10);
    expect(evaluate("2+ttest([1,2,3]).test(2).p")).toBe(3);
  });
  it("preserves tiny right-tail p-values", () => {
    const z = test("ztest(8,1,2).test(0)");
    expect(z.p).toBeGreaterThan(0);
    expect(z.p).toBeLessThan(1e-28);
  });
  it("calculates one/two proportion tests with pooled testing error", () => {
    const one = test("zproptest(45,80)");
    expect(one.estimate).toBe(0.5625);
    expect(one.score).toBeCloseTo(1.11803398875);
    const two = test("zproptest(45,80,40,90)");
    expect(two.estimate).toBeCloseTo(0.1180555555556);
    expect(two.score).toBeCloseTo(1.5365907428821481, 12);
    expect(two.warnings.join(" ")).toMatch(/normal approximation/);
    expect(() => test("zproptest(0,10,0,10)")).toThrow(/zero/);
  });
  it("calculates goodness-of-fit and independence from expected counts", () => {
    const gof = test("chisqgof([30,20,25,25])");
    expect(gof.score).toBe(2);
    expect(gof.dof).toBe(3);
    expect(gof.p).toBeCloseTo(0.57240670447088, 10);
    expect(test("chisqgof([30,20,25,25],[0.25,0.25,0.25,0.25])").score).toBe(2);
    const chi = test("chisqtest([15,5,10,10],[15,15,15,15])");
    expect(chi.expected).toEqual([[12, 8, 10, 10], [18, 12, 15, 15]]);
    expect(chi.score).toBeCloseTo(3.125, 12);
    expect(chi.dof).toBe(3);
    expect(chi.p).toBeCloseTo(0.37275127480265524, 12);
    expect(() => inferenceProperty(chi, "estimate")).toThrow(/not available/);
    expect(inferenceSummary(chi)).toMatch(/χ²/);
  });
  it("supports named table lists and rejects invalid inputs explicitly", () => {
    expect(test("ttest(l)", { l: ["1", "2", "3"] }).estimate).toBe(2);
    for (const source of ["ttest([])", "ttest([1])", "ttest([1,1])", "ztest([1,2],0)", "zproptest(5,4)",
      "ttest([1,2]).conf(1)", "ttest([1,2]).test(0,2)", "chisqtest([1,2],[1])", "chisqgof([0,0])",
      "chisqgof([1,2],[0,1])", "zproptest(1,2).test(0)"]) expect(() => test(source)).toThrow();
    expect(inferenceCall("ttest(")).toBeUndefined();
    expect(inferenceCall("ttest([1,2]).conf(")).toBeUndefined();
  });
  it("keeps scalar inference inputs live at evaluation", () => {
    const scope = { a: 2 };
    const evaluator = compileExpression("2+ztest(a,1,10).estimate", scope);
    expect(evaluator(0).value.toNumber()).toBe(4);
    scope.a = 4;
    expect(evaluator(0).value.toNumber()).toBe(6);
  });
  it("graphs null distribution, shaded tails, and test score in both modes", () => {
    for (const fast of [false, true]) {
      const graph = compileCollectionGraph("ztest([1,2,3],1).test(2)", {}, {}, fast);
      if (graph?.kind !== "collection") throw new Error("Expected inference diagram.");
      expect(graph.graphs.map((graph) => graph.kind)).toEqual(["explicit", "inequality", "point"]);
      const shade = graph.graphs[1]!;
      if (shade.kind !== "inequality") throw new Error("Expected p shading.");
      expect(shade.evaluate(1, 0.1)).toBeLessThan(0);
      expect(shade.evaluate(1, -0.1)).toBeGreaterThan(0);
    }
  });
});
