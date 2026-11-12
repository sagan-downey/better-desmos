import { describe, expect, it } from "vitest";
import { compileGraphExpression } from "./math";
import { detectRestrictionEndpoints } from "./restrictionEndpoints";

describe("automatic restriction endpoints", () => {
  it("finds open and closed explicit endpoints with finite one-sided limits", () => {
    const openSource = "y=x^2 {x<2}";
    const open = detectRestrictionEndpoints(openSource, compileGraphExpression(openSource));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ x: 2, closed: false });
    expect(open[0]!.y).toBeCloseTo(4, 6);

    const closedSource = "y=x^2 {x<=2}";
    const closed = detectRestrictionEndpoints(closedSource, compileGraphExpression(closedSource));
    expect(closed).toEqual([{ x: 2, y: 4, closed: true }]);
  });

  it("reports finite holes but rejects divergent one-sided limits", () => {
    const holeSource = "y=x^2 {x!=1}";
    const hole = detectRestrictionEndpoints(holeSource, compileGraphExpression(holeSource));
    expect(hole).toEqual([{ x: 1, y: expect.closeTo(1, 6), closed: false }]);

    const divergentSource = "y=1/(x-1) {x!=1}";
    expect(detectRestrictionEndpoints(divergentSource, compileGraphExpression(divergentSource))).toEqual([]);
  });

  it("supports sideways and parametric graph parameter restrictions", () => {
    const sidewaysSource = "x=y^2 {y<2}";
    const sideways = detectRestrictionEndpoints(sidewaysSource, compileGraphExpression(sidewaysSource));
    expect(sideways).toHaveLength(1);
    expect(sideways[0]!.x).toBeCloseTo(4, 10);
    expect(sideways[0]).toMatchObject({ y: 2, closed: false });

    const parametricSource = "(t,t^2){-2<=t<=3}";
    const parametric = detectRestrictionEndpoints(parametricSource, compileGraphExpression(parametricSource));
    expect(parametric).toEqual([
      { x: -2, y: 4, closed: true },
      { x: 3, y: 9, closed: true },
    ]);

    const curvedRestriction = "y=x^2 {y<4}";
    const curved = detectRestrictionEndpoints(curvedRestriction, compileGraphExpression(curvedRestriction));
    expect(curved).toHaveLength(2);
    expect(curved.map(({ x, closed }) => [x, closed])).toEqual([[-2, false], [2, false]]);

    const parametricRestriction = "(t,t^2){x<0.5}";
    const restrictedCurve = detectRestrictionEndpoints(
      parametricRestriction,
      compileGraphExpression(parametricRestriction),
    );
    expect(restrictedCurve).toHaveLength(2);
    expect(restrictedCurve[0]).toEqual({ x: 0, y: 0, closed: true });
    expect(restrictedCurve[1]!.x).toBeCloseTo(0.5, 8);
    expect(restrictedCurve[1]!.y).toBeCloseTo(0.25, 8);
    expect(restrictedCurve[1]!.closed).toBe(false);
  });

  it("does not mistake continuous piecewise joins for endpoints", () => {
    const source = "y={x<0:x,x>=0:x^2}";
    expect(detectRestrictionEndpoints(source, compileGraphExpression(source))).toEqual([]);
  });

  it("uses live scalar slider values and accepts slider bounds", () => {
    const variables = { a: 2 };
    const source = "y=x {x<a}";
    const graph = compileGraphExpression(source, variables);
    const options = { variables, sliderBounds: { a: { min: -5, max: 5 } } };
    const first = detectRestrictionEndpoints(source, graph, options);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ x: 2, closed: false });
    expect(first[0]!.y).toBeCloseTo(2, 10);

    variables.a = 3;
    const second = detectRestrictionEndpoints(source, graph, options);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ x: 3, closed: false });
    expect(second[0]!.y).toBeCloseTo(3, 10);
  });

  it("bounds search work and ignores graph kinds without a single parameter", () => {
    const source = "y=x {x<1}";
    const implicit = compileGraphExpression("x^2+y^2=1");
    const manyConditions = `y=x {${Array.from({ length: 40 }, (_, index) => `x<${index}`).join(" and ")}}`;
    expect(detectRestrictionEndpoints(source, implicit)).toEqual([]);
    expect(detectRestrictionEndpoints(manyConditions, compileGraphExpression(manyConditions)).length).toBeLessThanOrEqual(1);
  });
});
