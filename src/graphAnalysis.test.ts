import { describe,expect,it } from "vitest";
import { bracketedRoot,bracketedExtremum,polygonSignedDistance,segmentCrossings } from "./graphAnalysis";
import { compileGraphExpression,compileFastGraphExpression } from "./math";
describe("graph analysis",()=>{
  it.each(["(t,t^2){-2<=t<=3}","(t,t^2)","r=2cos(θ){0≤θ≤pi}","r={theta<1: 2, 3}","(log_2(8),0)","(int_{0}^{1} t dt,2)","r<cos(theta)"])("preserves native graph syntax: %s",(source)=>{
    expect(()=>compileGraphExpression(source)).not.toThrow();
    expect(()=>compileFastGraphExpression(source)).not.toThrow();
  });
  it("refines roots while rejecting asymptotes",()=>{
    expect(bracketedRoot(x=>x*x-2,1,2)).toBeCloseTo(Math.SQRT2,10);
    expect(bracketedRoot(x=>1/x,-1,1)).toBeUndefined();
    expect(bracketedRoot(x=>x*x+1,-1,1)).toBeUndefined();
  });
  it("refines local extrema in bounded brackets",()=>{
    expect(bracketedExtremum(x=>(x-1.25)**2,-1,3).x).toBeCloseTo(1.25,8);
    expect(bracketedExtremum(x=>4-(x-2)**2,0,4,true).y).toBeCloseTo(4,10);
  });
  it("clips polygon interiors using graph restrictions",()=>{
    const vertices:[number,number][]=[[0,0],[2,0],[2,2],[0,2]];
    expect(polygonSignedDistance(vertices,1,1)).toBe(-1);
    expect(polygonSignedDistance(vertices,3,1)).toBe(1);
    const graph=compileGraphExpression("polygon((0,0),(2,0),(2,2),(0,2)){x>=1}");
    expect(graph.kind).toBe("inequality");
    if(graph.kind==="inequality"){
      expect(()=>graph.evaluate(0.5,1)).toThrow();
      expect(Number(graph.evaluate(1.5,1))).toBeLessThan(0);
    }
  });
  it("finds geometric intersections for implicit and parameterized curves",()=>{
    expect(segmentCrossings([0,0,100,100],[0,100,100,0],100,100)).toEqual({points:[[50,50]],limited:false});
    expect(segmentCrossings([0,0,100,0],[0,1,100,1],100,100).points).toEqual([]);
    expect(segmentCrossings([-100,-100,-50,-50],[0,100,100,0],100,100).points).toEqual([]);
  });
});
