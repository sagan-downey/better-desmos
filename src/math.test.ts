import { describe, expect, it } from "vitest";
import { compileExpression } from "./math";

describe("compileExpression", () => {
  it("keeps rational arithmetic exact until a decimal value is requested", () => {
    const third = compileExpression("1 / 3")(0);
    expect(third.exact).toBe(true);
    expect(third.value.toSignificantDigits(45).toString()).toBe(
      "0.333333333333333333333333333333333333333333333",
    );
    expect(compileExpression("sqrt(9)")(0)).toMatchObject({ exact: true });
  });

  it("supports variables, precedence, right-associative powers, and optional y=", () => {
    expect(compileExpression("y = 2 + x^3")(2).value.toString()).toBe("10");
    expect(compileExpression("-2^2")(0).value.toString()).toBe("-4");
    expect(compileExpression("2^3^2")(0).value.toString()).toBe("512");
  });

  it("evaluates supported functions with approximate values", () => {
    const result = compileExpression("sin(pi / 2)")(0);
    expect(result.exact).toBe(false);
    expect(result.value.toNumber()).toBeCloseTo(1, 14);
    expect(compileExpression("log(100)")(0).value.toNumber()).toBeCloseTo(2);
  });

  it("reports invalid syntax, unsupported names, and domain errors", () => {
    expect(() => compileExpression("x + unknown")).toThrow('Unknown name "unknown"');
    expect(() => compileExpression("2x")).toThrow('Unexpected token "x"');
    expect(() => compileExpression("sqrt(-1)")(0)).toThrow(/sqrt is only defined/);
    expect(() => compileExpression("1 / (x - 2)")(2)).toThrow("Division by zero");
    expect(() => compileExpression("ln(0)")(0)).toThrow(/greater than zero/);
    expect(() => compileExpression("(-1)^0.5")(0)).toThrow(/negative base requires an integer exponent/);
    expect(() => compileExpression("0^-1")(0)).toThrow(/Zero cannot be raised/);
  });

  it("rejects malformed or excessive expressions", () => {
    expect(() => compileExpression("")).toThrow(/Enter an expression/);
    expect(() => compileExpression("x; alert(1)")).toThrow(/Unexpected character/);
    expect(() => compileExpression("x".repeat(513))).toThrow(/512 characters/);
  });
});
