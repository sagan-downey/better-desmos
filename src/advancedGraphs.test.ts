import { describe,it,expect } from "vitest";
import { compileGraphExpression,compileFastGraphExpression,freeIdentifiers } from "./math";
import { domainColor,fractalColor,commandArguments } from "./advancedGraphs";

describe("advanced graph commands",()=>{
  it("colors phase, magnitude, zero, and rejects nonfinite values",()=>{
    expect(domainColor({re:0,im:0})).toEqual([0,0,0]);
    expect(domainColor({re:0,im:1})[0]).toBe(90);
    expect(domainColor({re:-1,im:0})[0]).toBe(180);
    expect(domainColor({re:4,im:0})[2]).toBeGreaterThan(domainColor({re:1,im:0})[2]);
    expect(()=>domainColor({re:Infinity,im:0})).toThrow();
  });
  for(const compile of [compileGraphExpression,compileFastGraphExpression]){
    it(`compiles complex and fractal planes with ${compile.name}`,()=>{
      const graph=compile("domaincolor(z^2-1)");
      if(graph.kind!=="plane")throw new Error("Expected plane");
      expect(graph.evaluate(1,0)).toEqual([0,0,0]);
      expect(graph.evaluate(0,0)[0]).toBe(180);
      const mandel=compile("mandelbrot(100)");
      if(mandel.kind!=="plane")throw new Error("Expected fractal");
      expect(mandel.evaluate(0,0)).toEqual([0,0,0]);
      expect(mandel.evaluate(2,2)[2]).toBe(0.95);
      const julia=compile("julia(0,0,50)");
      if(julia.kind!=="plane")throw new Error("Expected Julia");
      expect(julia.evaluate(0,0)).toEqual([0,0,0]);
      expect(julia.evaluate(2,0)[2]).toBe(0.95);
    });
  }
  it("transforms points, polygons, and numerical trajectories",()=>{
    const graph=compileGraphExpression("transform(0,-1,1,0,(2,3))");
    if(graph.kind!=="point")throw new Error("Expected transformed point");
    expect(graph.evaluate()).toEqual([-3,2]);
    const polygon=compileGraphExpression("transform(2,0,0,3,polygon((0,0),(1,0),(0,1)))");
    if(polygon.kind!=="polygon")throw new Error("Expected polygon");
    expect(polygon.evaluate()).toEqual([[0,0],[2,0],[0,3]]);
    const trajectory=compileGraphExpression("trajectory(-y,x,1,0,-4,4)");
    if(trajectory.kind!=="parametric")throw new Error("Expected trajectory");
    for(const t of [-4,-1.23,0,2.1,4]){
      expect(trajectory.evaluate(t)[0]).toBeCloseTo(Math.cos(t),7);
      expect(trajectory.evaluate(t)[1]).toBeCloseTo(Math.sin(t),7);
    }
  });
  it("rejects invalid counts, domains, and unsupported transformations",()=>{
    for(const source of ["mandelbrot(501)","mandelbrot(1.5)","julia(0,0)","transform(1,0,0,1,x^2)","trajectory(y,x,0,0,1,2)"])
      expect(()=>compileGraphExpression(source)).toThrow();
    expect(freeIdentifiers("domaincolor(z^2+a*i)")).toEqual(["a"]);
    expect(fractalColor(0,0,10)).toEqual([0,0,0]);
    expect(commandArguments("transform(1,0,0,1,(2,3))","transform")).toHaveLength(5);
    expect(()=>commandArguments("julia(1,,20)","julia")).toThrow();
  });
});
