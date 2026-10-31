import { describe, expect, it } from "vitest";
import {
  compileColorExpression,
  hexToHsv,
  hsvToHex,
  compileExpression,
  compileFastGraphExpression,
  compileGraphExpression,
  compileImplicitEquation,
  fitLogarithmicRegression,
  fitExponentialRegression,
  fitPowerRegression,
  fitPolynomialRegression,
  fitSineRegression,
  fitTangentRegression,
  FAST_MODE_PRECISION_DIGITS,
  getPrecisionDigits,
  setPrecisionDigits,
} from "./math";

describe("compileExpression", () => {
  it("converts HSV colors to hex and extracts base-color HSV values", () => {
    expect(hsvToHex(0, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(120, 1, 1)).toBe("#00ff00");
    expect(hsvToHex(240, 1, 1)).toBe("#0000ff");
    expect(hsvToHex(360, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(480, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(-120, 1, 1)).toBe("#ff0000");
    expect(hsvToHex(120, 1.5, 1)).toBe("#00ff00");
    expect(hsvToHex(0, 0.5, 0.5)).toBe("#804040");
    expect(hexToHsv("#ff0000")).toEqual([0, 1, 1]);
    expect(hexToHsv("#808080")).toEqual([0, 0, 128 / 255]);
    expect(() => hsvToHex(Number.NaN, 0, 0)).toThrow(/finite/);
  });

  it("compiles color formulas with x, y, and slider values without executing JavaScript", () => {
    const color = compileColorExpression("x * 10 + a + y", { a: 12 });
    expect(color(2, 3)).toBe(35);
    expect(compileColorExpression("x + y", {}, true)(1.25, 2.5)).toBe(3.75);
    expect(() => compileColorExpression("window.alert(1)", {})).toThrow();
    expect(() => compileColorExpression("x = 2", {})).toThrow();
    expect(() => compileColorExpression("x / y", {})(1, 0)).toThrow(/Division by zero/);
  });

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
    expect(compileExpression("35.6x")(2).value.toString()).toBe("71.2");
    expect(compileExpression("2(x + 1)")(2).value.toString()).toBe("6");
    expect(compileExpression("2sin(pi / 2)")(0).value.toNumber()).toBeCloseTo(2);
  });

  it("evaluates supported functions with approximate values", () => {
    const result = compileExpression("sin(pi / 2)")(0);
    expect(result.exact).toBe(false);
    expect(result.value.toNumber()).toBeCloseTo(1, 14);
    expect(compileExpression("log(100)")(0).value.toNumber()).toBeCloseTo(2);
  });

  it("allows explicit, bounded math precision settings", () => {
    try {
      setPrecisionDigits(30);
      expect(getPrecisionDigits()).toBe(30);
      expect(compileExpression("pi")(0).value.toString()).toBe("3.14159265358979323846264338328");
      expect(() => setPrecisionDigits(19)).toThrow(/between 20 and 100/);
      expect(() => setPrecisionDigits(101)).toThrow(/between 20 and 100/);
    } finally {
      setPrecisionDigits(50);
    }
    expect(getPrecisionDigits()).toBe(50);
  });

  it("uses standard-precision numeric evaluation in fast mode", () => {
    expect(FAST_MODE_PRECISION_DIGITS).toBe(10);
    const explicit = compileFastGraphExpression("y = sin(pi / 2)");
    expect(explicit.kind).toBe("explicit");
    if (explicit.kind === "explicit") {
      expect(explicit.evaluate(0)).toBeCloseTo(1);
      expect(typeof explicit.evaluate(0)).toBe("number");
    }
    const rounded = compileFastGraphExpression("pi");
    expect(rounded.kind === "explicit" && rounded.evaluate(0)).toBe(3.141592654);

    const implicit = compileFastGraphExpression("x^2 + y^2 = 4");
    expect(implicit.kind).toBe("implicit");
    if (implicit.kind === "implicit") {
      expect(implicit.evaluate(2, 0)).toBe(0);
      expect(implicit.evaluate(0, 0)).toBe(-4);
    }
    const invalid = compileFastGraphExpression("sqrt(-1)");
    expect(() => invalid.kind === "explicit" && invalid.evaluate(0)).toThrow();
  });

  it("reports invalid syntax, unsupported names, and domain errors", () => {
    expect(() => compileExpression("x + unknown")).toThrow('Unknown name "unknown"');
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

  it("evaluates implicit equations as a zero-valued residual", () => {
    const circle = compileImplicitEquation("x^2 + y^2 = 4");
    expect(circle(2, 0).toNumber()).toBe(0);
    expect(circle(0, 0).toNumber()).toBe(-4);
    expect(circle(0, 2).toNumber()).toBe(0);

    const tangent = compileImplicitEquation("tan(35.6x)=0");
    expect(tangent(Math.PI / 35.6, 3).toNumber()).toBeCloseTo(0, 14);
    expect(tangent(0, 3).toNumber()).toBeCloseTo(0, 14);
  });

  it("supports sliders, inequalities, parametric and polar graphs, lists, and statistics", () => {
    const parameters = { a: 3 };
    const slider = compileGraphExpression("a*x", parameters);
    expect(slider.kind).toBe("explicit");
    if (slider.kind === "explicit") {
      const firstValue = slider.evaluate(2);
      expect(typeof firstValue === "number" ? firstValue : firstValue.value.toNumber()).toBe(6);
      parameters.a = 4;
      const updatedValue = slider.evaluate(2);
      expect(typeof updatedValue === "number" ? updatedValue : updatedValue.value.toNumber()).toBe(8);
    }

    const inequality = compileGraphExpression("y >= x^2");
    expect(inequality.kind).toBe("inequality");
    if (inequality.kind === "inequality") {
      expect(inequality.relation).toBe(">=");
      expect(inequality.evaluate(1, 2).toString()).toBe("1");
    }
    const parametric = compileGraphExpression("parametric(t, t^2, -2, 2)");
    expect(parametric.kind).toBe("parametric");
    if (parametric.kind === "parametric") {
      expect(parametric.evaluate(1)).toEqual([1, 1]);
    }
    const polar = compileGraphExpression("polar(2, 0, 2pi)");
    expect(polar.kind).toBe("parametric");
    if (polar.kind === "parametric") {
      expect(polar.evaluate(0)[0]).toBeCloseTo(2);
      expect(polar.evaluate(0)[1]).toBeCloseTo(0);
    }
    const list = compileGraphExpression("list(2, 4, 8)");
    expect(list.kind).toBe("list");
    if (list.kind === "list") expect(list.evaluate()).toEqual([2, 4, 8]);

    const mean = compileGraphExpression("mean(2, 4, 6)");
    expect(mean.kind === "explicit" && mean.evaluate(0)).toBeCloseTo(4);
    const factorial = compileGraphExpression("factorial(5)");
    expect(factorial.kind === "explicit" && factorial.evaluate(0)).toBe(120);
  });

  it("provides explicitly numerical derivative and integral graph helpers", () => {
    const derivative = compileGraphExpression("derivative(x^2)");
    expect(derivative.kind).toBe("explicit");
    if (derivative.kind === "explicit") {
      const result = derivative.evaluate(3);
      expect(typeof result === "number" ? result : result.value.toNumber()).toBeCloseTo(6, 6);
    }
    const integral = compileGraphExpression("integral(x^2, 0, x)");
    expect(integral.kind).toBe("explicit");
    if (integral.kind === "explicit") {
      const result = integral.evaluate(3);
      expect(typeof result === "number" ? result : result.value.toNumber()).toBeCloseTo(9, 8);
    }
  });

  it("fits linear, quadratic, and higher-degree regressions", () => {
    const linear = fitPolynomialRegression([-2, -1, 0, 1, 2], [-3, -1, 1, 3, 5], 1);
    expect(linear.coefficients[0]!.toNumber()).toBeCloseTo(1);
    expect(linear.coefficients[1]!.toNumber()).toBeCloseTo(4);
    expect(linear.powerCoefficients.map((coefficient) => coefficient.toNumber()))
      .toEqual([1, 2]);
    const quadratic = fitPolynomialRegression([-2, -1, 0, 1, 2], [9, 2, 1, 6, 17], 2);
    expect(quadratic.powerCoefficients.map((coefficient) => coefficient.toNumber()))
      .toEqual([1, 2, 3]);
    const atOne = quadratic.coefficients.reduce(
      (sum, coefficient, power) => sum + coefficient.toNumber() *
        ((1 - quadratic.center.toNumber()) / quadratic.scale.toNumber()) ** power,
      0,
    );
    expect(atOne).toBeCloseTo(6);
    const cubic = fitPolynomialRegression([-2, -1, 0, 1], [-8, -1, 0, 1], 3);
    expect(cubic.coefficients[3]!.toNumber()).toBeCloseTo(3.375);
  });

  it("rejects regressions with too few or degenerate data points", () => {
    expect(() => fitPolynomialRegression([0, 1], [1, 2], 2)).toThrow(/at least 3 data points/);
    expect(() => fitPolynomialRegression([1, 1, 1], [1, 2, 3], 1)).toThrow(/distinct x-values/);
    expect(() => fitPolynomialRegression([0, 0, 1], [1, 1, 2], 2)).toThrow(/does not support/);
    expect(() => fitPolynomialRegression([0, Number.NaN], [1, 2], 1)).toThrow(/finite numbers/);
  });

  it("fits logarithmic, sine, and tangent regressions", () => {
    const logX = [1, 2, 4, 8, 16];
    const logY = logX.map((x) => 3 + 2 * Math.log(x));
    const logarithmic = fitLogarithmicRegression(logX, logY);
    expect(logarithmic.intercept.toNumber()).toBeCloseTo(3, 10);
    expect(logarithmic.slope.toNumber()).toBeCloseTo(2, 10);
    expect(() => fitLogarithmicRegression([-1, 1, 2], [0, 1, 2])).toThrow(/positive x-values/);

    const x = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
    const sineY = x.map((value) => 2 * Math.sin(1.3 * value + 0.2) + 0.5);
    const sine = fitSineRegression(x, sineY);
    expect(sine.amplitude).toBeCloseTo(2, 3);
    expect(sine.frequency).toBeCloseTo(1.3, 2);
    expect(sine.phase).toBeCloseTo(0.2, 2);
    expect(sine.offset).toBeCloseTo(0.5, 2);
    const sineError = x.reduce((sum, value, index) => {
      const prediction = sine.amplitude * Math.sin(sine.frequency * value + sine.phase) + sine.offset;
      return sum + (prediction - sineY[index]!) ** 2;
    }, 0);
    expect(sineError).toBeLessThan(1e-4);

    const tangentX = [-0.6, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.6];
    const tangentY = tangentX.map((value) => 0.8 * Math.tan(1.2 * value - 0.1) + 0.4);
    const tangent = fitTangentRegression(tangentX, tangentY);
    expect(tangent.amplitude).toBeCloseTo(0.8, 2);
    expect(tangent.frequency).toBeCloseTo(1.2, 1);
    expect(tangent.offset).toBeCloseTo(0.4, 2);
  });

  it("fits exponential and power regressions", () => {
    const x = [0, 1, 2, 3];
    const exponential = fitExponentialRegression(x, x.map((value) => 2 * Math.exp(0.5 * value)));
    expect(exponential.scale.toNumber()).toBeCloseTo(2, 8);
    expect(exponential.rate.toNumber()).toBeCloseTo(0.5, 8);
    const powerX = [1, 2, 3, 4];
    const power = fitPowerRegression(powerX, powerX.map((value) => 3 * value ** 2));
    expect(power.scale.toNumber()).toBeCloseTo(3, 8);
    expect(power.exponent.toNumber()).toBeCloseTo(2, 8);
    expect(() => fitPowerRegression([-1, 1], [1, 2])).toThrow(/positive x-/);
  });

  it("distinguishes explicit y assignments from implicit equations", () => {
    expect(compileGraphExpression("y = x^2").kind).toBe("explicit");
    expect(compileGraphExpression("x^2 + y^2 = 4").kind).toBe("implicit");
    expect(() => compileImplicitEquation("x + y")).toThrow(/exactly one equals sign/);
    expect(() => compileImplicitEquation("x = y = 2")).toThrow(/exactly one equals sign/);
    expect(() => compileImplicitEquation("x^2 + y^2 =")).toThrow(/Both sides/);
    expect(() => compileImplicitEquation("x + unknown = y")).toThrow('Unknown name "unknown"');
    expect(compileImplicitEquation("tan(35.6x)=0")(Math.PI / 35.6, 3).toNumber()).toBeCloseTo(0, 14);
  });
});
