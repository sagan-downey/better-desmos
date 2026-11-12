import { describe, expect, it } from "vitest";
import {
  compileComplexExpression, compileExpression, compileFastGraphExpression,
  compileGraphExpression, expandUserFunctions, freeIdentifiers,
  type UserFunctionDefinition,
} from "./math";

const arithmetic: UserFunctionDefinition[] = [{
  name: "f", parameter: "n", body: "f(n-1)+2",
  baseCases: [{ arguments: [1], body: "3" }],
}];
const fibonacci: UserFunctionDefinition[] = [{
  name: "f", parameter: "n", body: "f(n-1)+f(n-2)",
  baseCases: [{ arguments: [0], body: "0" }, { arguments: [1], body: "1" }],
}];
const evaluate = (source: string, definitions = arithmetic) =>
  compileExpression(expandUserFunctions(source, definitions))(0).value.toNumber();

describe("recursive user functions", () => {
  it("evaluates numeric and graph arguments in precise and fast engines", () => {
    expect(evaluate("f(1)")).toBe(3);
    expect(evaluate("f(5)")).toBe(11);
    const source = expandUserFunctions("f(x)", arithmetic);
    const graph = compileGraphExpression(source);
    const fast = compileFastGraphExpression(source);
    expect(graph.kind).toBe("explicit");
    expect(fast.kind).toBe("explicit");
    if (graph.kind === "explicit" && fast.kind === "explicit") {
      const value = graph.evaluate(5);
      expect(typeof value === "number" ? value : value.value.toNumber()).toBe(11);
      expect(fast.evaluate(5)).toBe(11);
    }
    expect(compileComplexExpression(source)(5)).toMatchObject({ re: 11, im: 0 });
  });

  it("memoizes branching recurrences and supports mutual recursion", () => {
    expect(evaluate("f(30)", fibonacci)).toBe(832040);
    expect(compileComplexExpression(expandUserFunctions("f(20)", fibonacci))(0).re).toBe(6765);
    const mutual: UserFunctionDefinition[] = [
      { name: "f", parameter: "n", body: "g(n-1)+1", baseCases: [{ arguments: [0], body: "0" }] },
      { name: "g", parameter: "n", body: "f(n-1)+1", baseCases: [{ arguments: [0], body: "0" }] },
    ];
    expect(evaluate("f(9)", mutual)).toBe(9);
  });

  it("supports sliders, complex values, lexical parameters, and multiargument bases", () => {
    const definitions: UserFunctionDefinition[] = [{
      name: "f", parameter: "n", parameters: ["n", "z"], body: "f(n-1,z)+a*z",
      baseCases: [{ arguments: [0, 2], body: "a" }],
    }];
    const source = expandUserFunctions("f(x,2)", definitions);
    const sliders = { a: 3 };
    const scalar = compileExpression(source, sliders);
    expect(scalar(2).value.toNumber()).toBe(15);
    sliders.a = 4;
    expect(scalar(2).value.toNumber()).toBe(20);
    expect(freeIdentifiers(source).sort()).toEqual(["a", "x"]);
    const complexDefs: UserFunctionDefinition[] = [{
      name: "f", parameter: "n", body: "f(n-1)+i",
      baseCases: [{ arguments: [0], body: "1" }],
    }];
    expect(compileComplexExpression(expandUserFunctions("f(2)", complexDefs))(0)).toEqual({ re: 1, im: 2 });
    expect(evaluate("f(f(1))")).toBe(7);
  });

  it("preserves scoped bindings, including recursive calls inside integrals", () => {
    const scoped: UserFunctionDefinition[] = [
      { name: "f", parameter: "n", body: "sum_{n=1}^{2} n+f(n-1)", baseCases: [{ arguments: [0], body: "0" }] },
    ];
    expect(evaluate("f(1)", scoped)).toBe(3);
    const integral: UserFunctionDefinition[] = [
      { name: "f", parameter: "n", body: "int_{0}^{1} f(n-1) dt", baseCases: [{ arguments: [0], body: "2" }] },
    ];
    expect(evaluate("f(2)", integral)).toBeCloseTo(2);
    const external: UserFunctionDefinition[] = [
      { name: "f", parameter: "n", body: "f(n-1)+m", baseCases: [{ arguments: [0], body: "m" }] },
    ];
    const source = expandUserFunctions("sum_{m=1}^{3} f(1)", external);
    expect(compileExpression(source)(0).value.toNumber()).toBe(12);
    expect(compileComplexExpression(source)(0).re).toBe(12);
    const captured: UserFunctionDefinition[] = [
      { name: "f", parameter: "n", body: "m+n", baseCases: [{ arguments: [0], body: "m" }] },
      { name: "g", parameter: "t", body: "sum_{m=1}^{2} f(t)" },
    ];
    expect(evaluate("g(1)", captured)).toBe(5);
  });

  it("reports missing bases, cycles, unreachable bases, and malformed definitions", () => {
    expect(() => expandUserFunctions("f(1)", [{ name: "f", parameter: "n", body: "f(n-1)" }])).toThrow(/base case/i);
    expect(() => evaluate("f(2)", [{ name: "f", parameter: "n", body: "f(n)", baseCases: [{ arguments: [0], body: "1" }] }])).toThrow(/converge/i);
    expect(() => evaluate("f(-1)")).toThrow(/depth limit/i);
    expect(() => expandUserFunctions("f(1)", [{ ...arithmetic[0]!, baseCases: [{ arguments: [1, 2], body: "0" }] }])).toThrow(/base case/i);
    expect(() => expandUserFunctions("f(1)", [{ ...arithmetic[0]!, baseCases: [{ arguments: [1], body: "0" }, { arguments: [1], body: "1" }] }])).toThrow(/duplicate base/i);
    const branching: UserFunctionDefinition[] = [{
      name: "f", parameter: "n", parameters: ["n", "z"],
      body: "{n=0:0,f(n-1,2*z)+f(n-1,2*z+1)}",
      baseCases: [{ arguments: [0, 0], body: "0" }],
    }];
    expect(() => evaluate("f(13,0)", branching)).toThrow(/work limit/i);
  });
});
