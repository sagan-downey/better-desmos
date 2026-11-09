import { describe, expect, it } from "vitest";
import { dynamicLabel, expandNamedPoints, pointSources } from "./geometry";
import { compileExpression, compileCollectionGraph, compileFastGraphExpression, compileGraphExpression } from "./math";

describe("named points, polygons and labels", () => {
  it("recognizes only complete tuples and preserves ordinary scalar grouping", () => {
    expect(pointSources("(1,2)")).toEqual(["1", "2"]);
    expect(pointSources("((1,2))")).toEqual(["1", "2"]);
    expect(pointSources("(a+b)*(c+d)")).toBeUndefined();
    expect(pointSources("(1+2)")).toBeUndefined();
    expect(pointSources("(1,2)+(3,4)")).toBeUndefined();
    expect(() => pointSources("(1,)")).toThrow(/two coordinates/);
  });
  it("expands point names and coordinate access without replacing subscripted or local identifiers", () => {
    const points = { p: ["a+1", "b"], p_1: ["1/3", "2/3"] } satisfies Record<string, [string, string]>;
    expect(expandNamedPoints("p", points)).toBe("(a+1,b)");
    expect(expandNamedPoints("p.x+p_1.y", points)).toBe("(a+1)+(2/3)");
    expect(expandNamedPoints("p_2+exp(1)", points)).toBe("p_2+exp(1)");
    expect(expandNamedPoints("p for p=[1,2]", points)).toBe("p for p=[1,2]");
    expect(compileExpression(expandNamedPoints("p_1.x+p_1.y", points))(0).value.toString()).toBe("1");
  });
  it("keeps polygon vertex sliders live in both math modes", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const variables = { a: 2 };
      const graph = compile("polygon((0,0),(a,0),(a,a),(0,a))", variables);
      if (graph.kind !== "polygon") throw Error("Expected polygon");
      expect(graph.evaluate()).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]]);
      variables.a = 3;
      expect(graph.evaluate()[2]).toEqual([3, 3]);
    }
  });
  it("accepts a list of point vertices and named-list coordinates", () => {
    const graph = compileGraphExpression("polygon([(0,0),(2,0),(0,2)])");
    expect(graph.kind === "polygon" && graph.evaluate()).toEqual([[0, 0], [2, 0], [0, 2]]);
    const broadcast = compileCollectionGraph("polygon((l,m))", {}, { l: ["0", "2", "0"], m: ["0", "0", "2"] });
    expect(broadcast?.kind === "polygon" && broadcast.evaluate()).toEqual([[0, 0], [2, 0], [0, 2]]);
    const points = compileCollectionGraph("l", {}, { l: ["((1,2))", "((3,4))"] });
    expect(points?.kind === "collection" && points.graphs.map((point) => point.kind === "point" && point.evaluate()))
      .toEqual([[1, 2], [3, 4]]);
  });
  it("rejects missing vertices, coordinate-dependent vertices and domain errors", () => {
    for (const source of ["polygon((0,0),(1,1))", "polygon(1,2,3)", "polygon((x,0),(1,0),(0,1))"]) {
      expect(() => compileGraphExpression(source)).toThrow();
    }
    const graph = compileGraphExpression("polygon((sqrt(-1),0),(1,0),(0,1))");
    expect(() => graph.kind === "polygon" && graph.evaluate()).toThrow(/sqrt/);
  });
  it("formats dynamic labels using a safe callback without interpreting literal text", () => {
    const evaluate = (source: string) => compileExpression(source, { a: 2 })(0).value.toNumber();
    expect(dynamicLabel("A = ${a}; x = ${a^2}", evaluate)).toBe("A = 2; x = 4");
    expect(dynamicLabel("<script>hello</script>", evaluate)).toBe("<script>hello</script>");
    expect(() => dynamicLabel("${window.alert(1)}", evaluate)).toThrow();
    expect(() => dynamicLabel("${1/0}", evaluate)).toThrow();
  });
});
