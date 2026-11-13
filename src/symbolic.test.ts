import { describe,it,expect,afterEach } from "vitest";
import { resultCommand,compileExpression,setAngleMode } from "./math";

afterEach(()=>setAngleMode("radians"));
describe("exact form and matrix results",()=>{
  it("simplifies exact rational arithmetic without decimal approximation",()=>{
    expect(resultCommand("simplify(1/3+1/6)")).toBe("(1/2)");
    expect(resultCommand("simplify(x*1+0)")).toBe("x");
    expect(resultCommand("simplify(2*x+3*x)")).toBe("(5*x)");
    expect(resultCommand("simplify(x*x)")).toBe("(x^2)");
    expect(resultCommand("simplify(x/x)")).toBe("(x/x)");
    expect(()=>resultCommand("simplify(1/0)")).toThrow("zero");
    expect(()=>resultCommand("simplify(floor(x))")).toThrow("unsupported");
    expect(()=>resultCommand("simplify((9^100)^100)")).toThrow("work limit");
    expect(()=>resultCommand("simplify(y=3)")).toThrow("expression");
    expect(()=>resultCommand("matrix(")).toThrow("Incomplete");
  });
  it("differentiates elementary functions and rational powers exactly",()=>{
    for(const [source,expected] of [
      ["differentiate(x^3+sin(x),x)",(x:number)=>3*x*x+Math.cos(x)],
      ["differentiate(ln(x)+sqrt(x),x)",(x:number)=>1/x+1/(2*Math.sqrt(x))],
      ["differentiate(exp(x)/x,x)",(x:number)=>Math.exp(x)*(x-1)/(x*x)],
      ["differentiate(x^(1/2),x)",(x:number)=>0.5/Math.sqrt(x)],
    ] as const){
      const result=resultCommand(source)!;
      const evaluate=compileExpression(result);
      for(const x of [0.2,0.8,2])expect(evaluate(x).value.toNumber()).toBeCloseTo(expected(x),9);
    }
    expect(()=>resultCommand("differentiate(abs(x),x)")).toThrow();
    expect(()=>resultCommand("differentiate(x^x,x)")).toThrow();
  });
  it("honors degree-mode chain rules",()=>{
    setAngleMode("degrees");
    const result=resultCommand("differentiate(sin(x),x)")!;
    expect(compileExpression(result)(30).value.toNumber()).toBeCloseTo(Math.PI/180*Math.cos(Math.PI/6),12);
  });
  it("factors rational-root polynomials and reports unsupported factors",()=>{
    for(const polynomial of ["x^2-1","x^3-3*x^2+3*x-1","2*x^2-3*x+1","x^3","0","4"]){
      const result=resultCommand(`factor(${polynomial},x)`)!;
      for(const x of [-2,0,1.5,3])
        expect(compileExpression(result)(x).value.toNumber()).toBeCloseTo(compileExpression(polynomial)(x).value.toNumber(),9);
    }
    expect(()=>resultCommand("factor(x^2+1,x)")).toThrow("rational");
    expect(()=>resultCommand("factor(x^9,x)")).toThrow();
    expect(()=>resultCommand("factor(sin(x),x)")).toThrow();
  });
  it("calculates row-major matrices, multiplication, inverses, and determinants",()=>{
    expect(resultCommand("matrix(1,2,3,4)")).toBe("[[1, 2], [3, 4]]");
    expect(resultCommand("matmul(1,2,3,4,0,1,1,0)")).toBe("[[2, 1], [4, 3]]");
    expect(resultCommand("inverse(1,2,3,4)")).toBe("[[-2, 1], [1.5, -0.5]]");
    expect(resultCommand("det(1,2,3,4)")).toBe("-2");
    expect(()=>resultCommand("inverse(1,2,2,4)")).toThrow("singular");
    expect(()=>resultCommand("matrix(x,2,3,4)")).toThrow("scalar");
  });
});
