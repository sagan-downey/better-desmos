import { describe, expect, it } from "vitest";
import { connectContourSegments, dashedSegments, inequalityLineStyle, lineDash } from "./graphAppearance";

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
  it("uses dotted boundaries for strict inequalities without overriding inclusive appearance",()=>{
    for(const relation of ["<",">"] as const)for(const style of ["solid","dashed","dotted"] as const)
      expect(inequalityLineStyle(relation,style)).toBe("dotted");
    for(const relation of ["<=",">="] as const)for(const style of ["solid","dashed","dotted"] as const)
      expect(inequalityLineStyle(relation,style)).toBe(style);
  });
  it("connects unordered contour segments before creating visible dots",()=>{
    const segments=[4,0,6,0,2,0,0,0,4,0,2,0,6,0,8,0,20,0,22,0];
    const connected=connectContourSegments(segments);
    expect(connected).toEqual([0,0,2,0,2,0,4,0,4,0,6,0,6,0,8,0,20,0,22,0]);
    expect(dashedSegments(connected,lineDash("dotted",2))).toEqual([0,0,2,0,20,0,22,0]);
    expect(connectContourSegments([0,0,0,0])).toEqual([]);
  });
});
