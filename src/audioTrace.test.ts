import { describe,expect,it } from "vitest";
import { traceFrequency,tracePoints } from "./audioTrace";
describe("audio trace mapping",()=>{
  it("maps increasing y to increasing pitch and clips outside viewport",()=>{
    expect(traceFrequency(-10,-10,10)).toBe(220);
    expect(traceFrequency(10,-10,10)).toBe(1760);
    expect(traceFrequency(100,-10,10)).toBe(1760);
    expect(traceFrequency(0,-10,10)).toBeGreaterThan(traceFrequency(-1,-10,10));
  });
  it("samples exact endpoints and represents nonfinite gaps",()=>{
    const points=tracePoints(x=>x===0?NaN:x*x,-1,1,3);
    expect(points).toEqual([{x:-1,y:1},undefined,{x:1,y:1}]);
    expect(()=>tracePoints(()=>1,2,1)).toThrow();
    expect(()=>traceFrequency(1,0,0)).toThrow();
  });
});
