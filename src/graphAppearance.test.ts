import { describe, expect, it } from "vitest";
import { dashedSegments, lineDash } from "./graphAppearance";

describe("graph styles", () => {
  it("preserves solid geometry and scales dash patterns by line width", () => {
    const geometry = [0,0,10,0];
    expect(dashedSegments(geometry, [])).toBe(geometry);
    expect(lineDash()).toEqual([]);
    expect(lineDash("dashed", 4)).toEqual([12,8]);
    expect(lineDash("dotted", 3)).toEqual([3,9]);
  });
  it("preserves dash phase across connected spatial-color segments", () => {
    expect(dashedSegments([0,0,5,0,5,0,10,0,10,0,20,0], [6,4])).toEqual(
      [0,0,5,0,5,0,6,0,10,0,16,0]);
  });
  it("restarts dashes across disconnected graph branches", () => {
    expect(dashedSegments([0,0,5,0,10,0,20,0], [6,4])).toEqual([0,0,5,0,10,0,16,0]);
    expect(dashedSegments([0,0,0,0], [6,4])).toEqual([]);
  });
});
