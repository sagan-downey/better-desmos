import { describe, expect, it } from "vitest";
import { compileComplexExpression,complexExpressionIsReal, setAngleMode } from "./math";
import { complex, div, formatComplex } from "./complex";
const value=(text:string)=>compileComplexExpression(text)(0);
describe("complex arithmetic",()=>{
  it("uses parsed arithmetic and principal branches",()=>{
    expect(value("(2+3i)*(1-2i)")).toEqual({re:8,im:-1});
    expect(value("i^2")).toEqual({re:-1,im:0});
    expect(value("sqrt(-4)")).toEqual({re:0,im:2});
    expect(value("ln(-1)").im).toBeCloseTo(Math.PI,12);
    expect(value("exp(pi*i)+1").re).toBeCloseTo(0,12);
    expect(value("real(2+3i)+imag(2+3i)")).toEqual({re:5,im:0});
    expect(value("conj(2+3i)")).toEqual({re:2,im:-3});
    expect(value("abs(3+4i)").re).toBe(5);
  });
  it("evaluates analytic functions and live complex variables",()=>{
    expect(value("sin(i)").im).toBeCloseTo(Math.sinh(1),12);
    expect(value("cos(i)").re).toBeCloseTo(Math.cosh(1),12);
    expect(value("asin(sin(0.3+0.2i))").re).toBeCloseTo(0.3,12);
    const scope={z:complex(2,3)},f=compileComplexExpression("z^2",{},scope);
    expect(f(0)).toEqual({re:-5,im:12});scope.z=complex(1,2);
    expect(f(0)).toEqual({re:-3,im:4});
    try{setAngleMode("degrees");expect(value("sin(90)").re).toBeCloseTo(1);expect(value("arg(i)").re).toBe(90);}
    finally{setAngleMode("radians");}
  });
  it("supports piecewise equality and bounded numerical calculus",()=>{
    expect(value("{i=i:2i,0}")).toEqual({re:0,im:2});
    expect(value("sum_{n=1}^{3} n*i")).toEqual({re:0,im:6});
    expect(value("int_{0}^{1} t*i dt").im).toBeCloseTo(0.5,10);
  });
  it("reports undefined domains and never executes input",()=>{
    for(const text of ["ln(0)","1/0","arg(0)","floor(i)","{i>0:1,0}","alert(1)"])expect(()=>value(text)).toThrow();
    expect(div(complex(1,1),complex(1,-1))).toEqual({re:0,im:1});
    expect(formatComplex(complex(2,-3))).toBe("2 - 3i");
  });
  it("keeps scaled arithmetic and inverse branches stable",()=>{
    expect(div(complex(1e308,1e308),complex(1e308,1e308))).toEqual({re:1,im:0});
    expect(compileComplexExpression("ln(z)",{}, {z:complex(1e308,1e308)})(0).re).toBeCloseTo(Math.log(1e308)+Math.log(2)/2,10);
    expect(value("asinh(-10^12)").re).toBeCloseTo(Math.asinh(-1e12),10);
    expect(value("asin(-10^12)").re).toBeCloseTo(-Math.PI/2,12);
  });
  it("checks both integral components and reports nonconvergence",()=>{
    const integral=value("int_{0}^{pi} exp(i*t) dt");
    expect(integral.re).toBeCloseTo(0,10);expect(integral.im).toBeCloseTo(2,10);
    const derivative=compileComplexExpression("d/dx(exp(i*x))")(0.3);
    expect(derivative.re).toBeCloseTo(-Math.sin(0.3),10);
    expect(derivative.im).toBeCloseTo(Math.cos(0.3),10);
    expect(()=>value("int_{0}^{1} i/(t-0.3) dt")).toThrow(/converge/);
    expect(()=>value("sum_{n=0}^{10000} i")).toThrow(/10000/);
  });
  it("classifies real component expressions without sampling away complex values",()=>{
    const scope={z:complex(2,3)};
    expect(complexExpressionIsReal("1+real(z*x)",{},scope)).toBe(true);
    expect(complexExpressionIsReal("sin(imag(z*x))",{},scope)).toBe(true);
    expect(complexExpressionIsReal("z*x",{},scope)).toBe(false);
    expect(complexExpressionIsReal("{x=0:0,i*x}")).toBe(false);
  });
});
