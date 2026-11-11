import { describe, expect, it } from "vitest";
import { traceContour, tracePolyline, traceRegion, type TraceBounds } from "./regionTrace";
import { compileFastGraphExpression, compileGraphExpression } from "./math";

const bounds: TraceBounds = [-2, 2, -2, 2];
describe("numerical contour audio tracing", () => {
  it("traces both halves of a circle as one closed branch", () => {
    const result = traceContour((x, y) => x*x + y*y - 1, bounds, 32);
    expect(result.paths).toHaveLength(1);
    const path = result.paths[0]!;
    expect(path.length).toBeGreaterThan(30);
    expect(path.at(-1)).toEqual(path[0]);
    for (const point of path) expect(point.x*point.x + point.y*point.y).toBeCloseTo(1, 8);
    expect(Math.max(...path.map((point) => point.y))).toBeCloseTo(1);
    expect(Math.min(...path.map((point) => point.y))).toBeCloseTo(-1);
    const samples = tracePolyline(path);
    expect(samples).toHaveLength(201);
    expect(samples[0]).toEqual(samples.at(-1));
  });
  it("keeps disconnected branches separate", () => {
    const result = traceContour((_, y) => y*y - 1, bounds, 32);
    expect(result.paths).toHaveLength(2);
    for (const path of result.paths) {
      expect(path[0]!.x).toBe(-2); expect(path.at(-1)!.x).toBe(2);
      expect(new Set(path.map((point) => point.y)).size).toBe(1);
    }
  });
  it("keeps a circle connected in an unaligned desktop viewport in both engines", () => {
    const viewport: TraceBounds = [-595/96,595/96,-535/96,535/96];
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const graph = compile("x^2+y^2=4");
      if (graph.kind !== "implicit") throw new Error("Expected an implicit graph.");
      const trace = traceContour((x,y) => Number(graph.evaluate(x,y)), viewport);
      expect(trace.gaps).toBe(0);
      expect(trace.paths).toHaveLength(1);
      expect(trace.paths[0]!.at(-1)).toEqual(trace.paths[0]![0]);
    }
  });
  it("handles vertical boundaries, saddle cells, missing contours, and explicit limits", () => {
    const vertical = traceContour((x) => x, bounds, 32);
    expect(vertical.paths).toHaveLength(1);
    expect(vertical.paths[0]!.every((point) => point.x === 0)).toBe(true);
    const saddle = traceContour((x, y) => x*y - 0.15, bounds, 31);
    expect(saddle.paths).toHaveLength(2);
    expect(traceContour(() => 1, bounds).paths).toEqual([]);
    expect(() => traceContour(() => 1, bounds, 1000)).toThrow();
    expect(() => traceContour(() => 1, [1, 1, 0, 1])).toThrow();
    expect(() => traceContour(() => { throw new Error("unexpected evaluator failure"); }, bounds)).toThrow("unexpected evaluator failure");
  });
  it("does not turn asymptotes or undefined strips into false branches", () => {
    const asymptote = traceContour((x) => 1/(x - 0.03), bounds, 32);
    expect(asymptote.paths).toEqual([]);
    expect(asymptote.gaps).toBeGreaterThan(0);
    expect(traceContour((x) => 1e-12/(x - 0.03), bounds, 32).paths).toEqual([]);
    expect(traceContour((x, y) => 1e-20*(x*x+y*y-1), bounds, 32).paths).toHaveLength(1);
    const broken = traceContour((x, y) => Math.abs(x) < 0.3 ? NaN : y - 0.2, bounds, 32);
    expect(broken.paths).toHaveLength(2);
    for (const path of broken.paths) expect(path.every((point) => point.x <= -0.3) || path.every((point) => point.x >= 0.3)).toBe(true);
    expect(broken.gaps).toBeGreaterThan(0);
  });
});
describe("region chords and path sampling", () => {
  it("sonifies only shaded samples with bounded voices", () => {
    const samples = traceRegion((x, y) => x*x + y*y - 1, "<", bounds, 5);
    expect(samples[0]).toBeUndefined(); expect(samples[4]).toBeUndefined();
    expect(samples[2]!.region).toBe(true);
    expect(samples[2]!.voices).toHaveLength(5);
    expect(samples[2]!.voices!.every((y) => y*y < 1)).toBe(true);
    expect(samples[2]!.voices![0]).toBeCloseTo(-0.984375);
    expect(samples[2]!.voices!.at(-1)).toBeCloseTo(0.984375);
    expect(traceRegion(() => NaN, "<", bounds, 2)).toEqual([undefined, undefined]);
  });
  it("honors all inequality directions", () => {
    for (const relation of ["<", "<=", ">", ">="] as const) {
      const points = traceRegion((_, y) => y, relation, bounds, 2);
      expect(points.every((point) => point?.voices?.every((y) => relation.startsWith("<") ? y < 0 : y > 0))).toBe(true);
    }
  });
  it("uses safe compiled implicit and polygon graphs without UI dependencies", () => {
    const implicit = compileFastGraphExpression("x^2+y^2=1");
    if (implicit.kind !== "implicit") throw new Error("Expected an implicit graph.");
    expect(traceContour((x, y) => Number(implicit.evaluate(x, y)), bounds, 24).paths).toHaveLength(1);
    const polygon = compileFastGraphExpression("polygon((-1,-1),(1,-1),(0,1)){x>0}");
    if (polygon.kind !== "inequality") throw new Error("Expected a restricted polygon inequality.");
    const points = traceRegion((x, y) => { try { return Number(polygon.evaluate(x, y)); } catch { return NaN; } }, polygon.relation, bounds, 9);
    expect(points[0]).toBeUndefined();expect(points[3]).toBeUndefined();expect(points[5]).toBeDefined();
  });
  it("resamples length uniformly and rejects invalid geometry", () => {
    expect(tracePolyline([{x:0,y:0},{x:2,y:0},{x:2,y:2}], 5)).toEqual([{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1},{x:2,y:2}]);
    expect(tracePolyline([{x:1,y:1},{x:1,y:1}])).toEqual([{x:1,y:1}]);
    expect(() => tracePolyline([])).toThrow();
    expect(() => tracePolyline([{x:NaN,y:0}])).toThrow();
    expect(() => traceRegion(() => 0, "<", bounds, 4096)).toThrow();
  });
});
