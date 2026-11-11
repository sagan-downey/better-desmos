import { describe, expect, it } from "vitest";
import { compileExpression } from "./math";
import { convertAsciiMathToLatex } from "mathlive/ssr";
import { latexToSource, sourceToLatex } from "./mathInput";

describe("visual math input adapter", () => {
  it.each(["x^2/3", "sqrt(x+1)", "sin(x)+a_12", "f(x)=x^2", "y_1=[1,2,3]", "{x>0:x,-x}", "d.cdf(x)", "p->p+(1,2)", "sum_{n=1}^{10} n", "int_{0}^{1} x^2 dx"])("preserves text notation: %s", (source) => {
    const expected = source === "x^2/3" ? "((x^(2))/(3))" : source.replace(/\^(\d+)/g, "^($1)");
    expect(latexToSource(sourceToLatex(source)).replace(/\s/g, "")).toBe(expected.replace(/\s/g, ""));
  });
  it("reads actual structural fractions, radicals, exponents, and subscripts", () => {
    const source = latexToSource("\\frac{\\sqrt{9}+x_{12}}{2}^{2}");
    expect(compileExpression(source, { x_12: 1 })(0).value.toNumber()).toBe(4);
    expect(compileExpression(latexToSource("\\sqrt[3]{8}"))(0).value.toNumber()).toBeCloseTo(2);
    expect(latexToSource("\\sin x+\\cos\\left(x\\right)")).toBe("sin(x)+cos(x)");
    expect(latexToSource("\\sin x^{2}")).toBe("sin(x^(2))");
    expect(latexToSource("\\sin x_{12}")).toBe("sin(x_12)");
    expect(latexToSource("\\sin -12")).toBe("sin(-12)");
    expect(() => latexToSource("\\sin 2x")).toThrow("parentheses");
    expect(latexToSource("\\sum_{n=1}^{4}n")).toBe("sum_{n=1}^{4} n");
  });
  it("reports unsupported or incomplete input instead of evaluating or discarding it", () => {
    for (const latex of ["\\htmlClass{bad}{x}", "\\frac{x}{", "\\sqrt{}", "\\unknown{x}", "\\placeholder{}", "x".repeat(513)]) {
      expect(() => latexToSource(latex)).toThrow();
    }
    expect(() => sourceToLatex("alert(x);")).toThrow();
    expect(() => compileExpression(latexToSource(sourceToLatex("alert('x')")))).toThrow();
  });
  it.each(["x^2^3", "x^-2^2", "x^(2+3)", "x^sin(x)", "x^pi", "x^2!", "d/dx(x^3)", "int_{0}^{1} x^2 dx", "log_{2+1}(27)"])("retains evaluation semantics through visual notation: %s", (source) => {
    const converted = latexToSource(sourceToLatex(source));
    const original = compileExpression(source)(2).value.toNumber();
    expect(compileExpression(converted)(2).value.toNumber()).toBeCloseTo(original, 9);
  });
  it("preserves keyword delimiters and implicit multiplication", () => {
    for (const source of ["a^2 for a=[1...3]", "[1,2][x>0 and x<1]", "1 2", "a b"]) {
      expect(latexToSource(sourceToLatex(source)).replace(/\^\(2\)/g, "^2")).toBe(source);
    }
    expect(latexToSource("\\sin^{2}\\left(x\\right)")).toBe("((sin(x))^(2))");
    expect(latexToSource("\\int_{0}^{1}x^2\\mathrm{d}x").replace(/\s+/g," ")).toBe("int_{0}^{1} x^(2) dx");
  });
  it("accepts normalized library output without using its evaluator or lossy ASCII export", () => {
    for (const source of ["x^2/3", "f(x)=sin(x)", "y_1=[1,2,3]", "z=2+3i"]) {
      const normalized = convertAsciiMathToLatex(source);
      if (source === "x^2/3") {
        expect(compileExpression(latexToSource(normalized))(2).value.toNumber()).toBe(compileExpression(latexToSource(sourceToLatex(source)))(2).value.toNumber());
      } else expect(latexToSource(normalized).replace(/\s/g, "")).toBe(latexToSource(sourceToLatex(source)).replace(/\s/g, ""));
    }
  });
  it("supports prime derivatives, Unicode calculus, and explicit token spacing", () => {
    expect(latexToSource("f^{\\prime\\prime}(x)")).toBe("f''(x)");
    expect(latexToSource(sourceToLatex("f'(x)"))).toBe("f'(x)");
    expect(latexToSource(sourceToLatex("Σ_{n=1}^{3} n"))).toBe("sum_{n=1}^{3} n");
    expect(latexToSource("a\\;b")).toBe("a b");
    expect(latexToSource("\\frac{d}{dx}")).toBe("((d)/(dx))");
  });
  it.each(["x^2/3", "(x+1)/(x+2)", "1+x/2", "2*x/3", "x/2/3", "1/(2/3)", "x/-2^2", "prod_{n=1}^{3} n/2", "int_{0}^{1} x/2 dx"])("renders stored division structurally without changing precedence: %s", (source) => {
    const latex = sourceToLatex(source);
    expect(latex).toContain("\\frac");
    const converted = latexToSource(latex);
    expect(compileExpression(converted)(2).value.toNumber()).toBeCloseTo(compileExpression(source)(2).value.toNumber(), 9);
  });
  it("preserves multi-letter and subscripted exponent variables", () => {
    const source = "x^abc+x^a_12";
    const converted = latexToSource(sourceToLatex(source));
    const variables = {abc:3,a_12:2};
    expect(compileExpression(converted,variables)(2).value.toNumber()).toBe(compileExpression(source,variables)(2).value.toNumber());
    expect(latexToSource(sourceToLatex("a->a/2")).replace(/\s/g,"")).toBe("a->((a)/(2))");
    expect(latexToSource(sourceToLatex("y>=x/2")).replace(/\s/g,"")).toBe("y>=((x)/(2))");
    expect(latexToSource(sourceToLatex("[1/2...3]"))).toBe("[((1)/(2))...3]");
  });
});
