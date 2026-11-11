import { describe, expect, it } from "vitest";
import { actionDefinition, actionUpdateSource, evaluateActions, expandActions } from "./actions";
import { expandNamedPoints } from "./geometry";
import { compileExpression } from "./math";

describe("parsed actions", () => {
  const scope = { a: 2, b: 3 };
  const evaluate = (source: string) => compileExpression(source, scope)(0).value.toNumber();
  it("evaluates simultaneous updates from the original state", () => {
    expect(evaluateActions("a -> b, b -> a", evaluate, new Set(["a", "b"]))).toEqual([
      { target: "a", values: [3], list: false }, { target: "b", values: [2], list: false },
    ]);
    expect(scope).toEqual({ a: 2, b: 3 });
    expect(evaluateActions("a = a+1", evaluate, new Set(["a"]))[0]!.values).toEqual([3]);
  });
  it("supports list replacement, concatenation, and elementwise operations", () => {
    const list = { l: ["1", "2", "3"] };
    expect(evaluateActions("l -> l+1", evaluate, new Set(["l"]), list)[0]).toEqual(
      { target: "l", values: [2,3,4], list: true });
    expect(evaluateActions("l → join(l,4)", evaluate, new Set(["l"]), list)[0]!.values).toEqual([1,2,3,4]);
    expect(evaluateActions("l -> []", evaluate, new Set(["l"]), list)[0]!.values).toEqual([]);
  });
  it("expands reusable named actions safely", () => {
    const action = actionDefinition("u = a->a+1,b->a")!;
    expect(action.target).toBe("u");
    expect(expandActions("u", [action])).toBe("a->a+1,b->a");
    expect(expandActions("u", [action, { target: "v", source: "u" }])).toBe(action.source);
    expect(() => expandActions("u", [action, action])).toThrow(/more than once/);
    expect(() => expandActions("u", [{ target: "u", source: "u" }])).toThrow(/Circular/);
    expect(actionDefinition("a=1")).toBeUndefined();
  });
  it("updates named points and point lists without rewriting assignment targets",()=>{
    const points={p:["1","2"]} satisfies Record<string,[string,string]>;
    const updates=evaluateActions("p->p+(2,3)",evaluate,new Set(["p"]),{},"sample",(source)=>expandNamedPoints(source,points));
    expect(updates[0]!.points).toEqual([[3,5]]);
    expect(actionUpdateSource(updates[0]!)).toBe("p=(3,5)");
    const list=evaluateActions("l->2*[(1,2),(3,4)]",evaluate,new Set(["l"]))[0]!;
    expect(actionUpdateSource(list)).toBe("l=[(2,4),(6,8)]");
    expect(()=>evaluateActions("l->[1,(2,3)]",evaluate,new Set(["l"]))).toThrow(/not both/);
  });
  it("rejects duplicate targets, unavailable variables, and invalid results before changes", () => {
    for (const source of ["a->1,a->2", "c->1", "x->1", "a->sqrt(-1)", "a->", "a+1"]) {
      expect(() => evaluateActions(source, evaluate, new Set(["a", "b", "x"]))).toThrow();
    }
    expect(scope).toEqual({ a: 2, b: 3 });
  });
});
