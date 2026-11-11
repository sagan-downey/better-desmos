import { describe,expect,it } from "vitest";
import { expressionMathML } from "./math";
describe("formatted math editor",()=>{
  it("formats fractions, powers, roots, and bounded calculus",()=>{
    expect(expressionMathML("x^2/3")).toContain("<mfrac><msup>");
    expect(expressionMathML("sqrt(x)")).toContain("<msqrt>");
    expect(expressionMathML("sum_{n=1}^{10} n")).toContain("<msubsup>");
    expect(expressionMathML("y=x^2")).toContain("<mo>=</mo>");
    expect(expressionMathML("f(x)+x_1")).toContain("<mi>f</mi><mo>(</mo>");
    expect(expressionMathML("f(x)+x_1")).toContain("<msub>");
    expect(expressionMathML("[(1,2),(3,4)]")).toContain("<mo>[</mo>");
    expect(expressionMathML("y_1=[2,4,5,4,6]")).toContain("<msub>");
  });
  it("does not treat user-entered HTML as markup",()=>{
    expect(()=>expressionMathML("<script>alert(1)</script>")).toThrow();
    expect(()=>expressionMathML("x+")).toThrow();
  });
});
