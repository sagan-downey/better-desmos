import { describe, expect, it } from "vitest";
import { compileGraphExpression, compileFastGraphExpression, freeIdentifiers, expandUserFunctions } from "./math";
import { interpolateSolution, solveDifferentialEquation } from "./differentialEquations";

describe("differential equations and fields",()=>{
  it("integrates exponential growth forwards and backwards with dense interpolation",()=>{
    const points=solveDifferentialEquation((_x,y)=>y,0,1,-2,2);
    for(const x of [-2,-1.234,0,0.735,2])
      expect(interpolateSolution(points,x)).toBeCloseTo(Math.exp(x),7);
    expect(points[0]!.x).toBe(-2);
    expect(points.at(-1)!.x).toBe(2);
  });
  it("preserves equilibrium and integrates an x-dependent slope",()=>{
    const equilibrium=solveDifferentialEquation((_x,y)=>y*(1-y),0,1,-5,5);
    expect(interpolateSolution(equilibrium,3.2)).toBe(1);
    const polynomial=solveDifferentialEquation(x=>2*x,1,1,-3,3);
    expect(interpolateSolution(polynomial,-2.35)).toBeCloseTo(2.35**2,10);
  });
  it("rejects invalid intervals, nonfinite slopes, and singular solutions",()=>{
    expect(()=>solveDifferentialEquation(()=>0,2,1,-1,1)).toThrow("start <= x0");
    expect(()=>solveDifferentialEquation(()=>0,0,1,1,1)).toThrow();
    expect(()=>solveDifferentialEquation(()=>0,0,1,0,10001)).toThrow("10000");
    expect(()=>solveDifferentialEquation(()=>Infinity,0,1,-1,1)).toThrow("finite");
    expect(()=>solveDifferentialEquation((_x,y)=>y*y,0,1,0,2)).toThrow();
  });
  for(const compile of [compileGraphExpression,compileFastGraphExpression]){
    it(`compiles fields and solutions using ${compile.name}`,()=>{
      const field=compile("vectorfield(-y,a*x)",{a:2});
      expect(field.kind).toBe("vectorfield");
      if(field.kind!=="vectorfield")throw new Error("Expected field");
      expect(field.evaluate(3,4)).toEqual([-4,6]);
      expect(field.arrows).toBe(true);
      const slope=compile("slopefield(x-y)");
      if(slope.kind!=="vectorfield")throw new Error("Expected slope field");
      expect(slope.evaluate(3,4)).toEqual([1,-1]);
      expect(slope.arrows).toBe(false);
      const solution=compile("ode(y,0,1,-1,1)");
      if(solution.kind!=="parametric")throw new Error("Expected solution curve");
      expect(solution.evaluate(0.7)[1]).toBeCloseTo(Math.exp(0.7),7);
      expect(()=>solution.evaluate(2)).toThrow("outside");
    });
  }
  it("validates command arguments and retains slider identifiers",()=>{
    expect(freeIdentifiers("vectorfield(-y,a*x)")).toEqual(expect.arrayContaining(["x","y","a"]));
    expect(freeIdentifiers("ode(a*y,0,b,-1,1)")).not.toContain("ode");
    for(const source of ["vectorfield(x)","slopefield(x,y)","ode(y,0,1)","ode(y,x,1,-1,1)","vectorfield(x=1,y)"])
      expect(()=>compileGraphExpression(source)).toThrow();
  });
  it("supports live field parameters, zero vectors, and restrictions",()=>{
    const variables={a:1};
    const field=compileGraphExpression("vectorfield(a*x,y){x>0}",variables);
    if(field.kind!=="vectorfield")throw new Error("Expected restricted field");
    expect(field.evaluate(2,0)).toEqual([2,0]);
    variables.a=3;
    expect(field.evaluate(2,0)).toEqual([6,0]);
    expect(()=>field.evaluate(-1,0)).toThrow();
    const zero=compileGraphExpression("vectorfield(0,0)");
    if(zero.kind!=="vectorfield")throw new Error("Expected zero field");
    expect(zero.evaluate(1,1)).toEqual([0,0]);
  });
  it("expands user functions and solves a nonautonomous initial-value problem",()=>{
    const source=expandUserFunctions("ode(f(x,y),0,1,-2,2)",[{name:"f",parameter:"u",parameters:["u","v"],body:"u-v"}]);
    const graph=compileGraphExpression(source);
    if(graph.kind!=="parametric")throw new Error("Expected solution");
    for(const x of [-2,-0.83,0,1.27,2])
      expect(graph.evaluate(x)[1]).toBeCloseTo(x-1+2*Math.exp(-x),6);
  });
});
