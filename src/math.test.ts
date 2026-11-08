import { describe, expect, it } from "vitest";
import {
  compileColorExpression,
  hexToHsv,
  hsvToHex,
  compileExpression,
  compileTickerAction,
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
  expandUserFunctions,
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

  it("expands single-argument user functions through the safe math parser", () => {
    const definitions = [
      { name: "f", parameter: "x", body: "x^2 + 1" },
      { name: "g", parameter: "x", body: "sin(x) + f(x)" },
    ];
    const scalar = compileExpression(expandUserFunctions("f(3)", definitions))(0);
    expect(scalar.value.toString()).toBe("10");

    const nested = compileExpression(expandUserFunctions("g(x)", definitions))(2);
    expect(nested.value.toNumber()).toBeCloseTo(Math.sin(2) + 5);

    const fast = compileFastGraphExpression(expandUserFunctions("f(x)", definitions));
    expect(fast.kind).toBe("explicit");
    if (fast.kind === "explicit") expect(fast.evaluate(2)).toBe(5);
    const precise = compileGraphExpression(expandUserFunctions("f(x)", definitions));
    expect(precise.kind).toBe("explicit");
    if (precise.kind === "explicit") {
      const result = precise.evaluate(2);
      expect(typeof result).not.toBe("number");
      if (typeof result !== "number") expect(result.value.toString()).toBe("5");
    }

    expect(() => expandUserFunctions("f(1)", [
      { name: "f", parameter: "x", body: "f(x) + 1" },
    ])).toThrow(/Circular function definition/);
    expect(() => expandUserFunctions("f()", definitions)).toThrow(/requires one argument/);
    expect(() => expandUserFunctions("f(1, 2)", definitions)).toThrow(/accepts one argument/);
    expect(() => expandUserFunctions("f(1)", [
      ...definitions,
      { name: "F", parameter: "x", body: "x" },
    ])).toThrow(/defined more than once/);
    expect(() => expandUserFunctions("g(1)", [
      { name: "g", parameter: "t", body: "t^2" },
    ])).toThrow(/use x as their input/);
  });

  it("supports letter-and-number subscripted slider variables", () => {
    const variables = { a_1: 3, x_mean: 4, b_12c: 2 };
    expect(compileExpression("a_1 + x_mean * b_12c", variables)(0).value.toNumber()).toBe(11);
    expect(compileExpression("2a_1", variables)(0).value.toNumber()).toBe(6);

    const point = compileGraphExpression("(a_mean + 1, floor(b_12))", {
      a_mean: 2.5,
      b_12: 3.8,
    });
    expect(point.kind).toBe("point");
    if (point.kind === "point") {
      expect(point.xVariables).toEqual(["a_mean"]);
      expect(point.yVariables).toEqual(["b_12"]);
      expect(point.evaluate()).toEqual([3.5, 3]);
    }

    const ticker = compileTickerAction("x_mean = x_mean + 1", { x_mean: 4 });
    expect(ticker.target).toBe("x_mean");
    expect(ticker.evaluate()).toBe(5);
    expect(() => compileExpression("a_", variables)).toThrow();
    expect(() => compileExpression("a_mean", { a: 1 })).toThrow(/Unknown name/);
  });

  it("evaluates supported functions with approximate values", () => {
    const result = compileExpression("sin(pi / 2)")(0);
    expect(result.exact).toBe(false);
    expect(result.value.toNumber()).toBeCloseTo(1, 14);
    expect(compileExpression("log(100)")(0).value.toNumber()).toBeCloseTo(2);
  });

  it("rounds down and up with floor and ceil, including for negative values", () => {
    expect(compileExpression("floor(3 / 2)")(0)).toMatchObject({ exact: true });
    expect(compileExpression("floor(3 / 2)")(0).value.toNumber()).toBe(1);
    expect(compileExpression("floor(-3 / 2)")(0).value.toNumber()).toBe(-2);
    expect(compileExpression("ceil(3 / 2)")(0).value.toNumber()).toBe(2);
    expect(compileExpression("ceil(-3 / 2)")(0).value.toNumber()).toBe(-1);
    expect(compileExpression("floor(2)")(0).value.toNumber()).toBe(2);
    expect(compileExpression("ceil(-2)")(0).value.toNumber()).toBe(-2);

    const fastFloor = compileFastGraphExpression("floor(-3 / 2)");
    const fastCeil = compileFastGraphExpression("ceil(3 / 2)");
    expect(fastFloor.kind === "explicit" && fastFloor.evaluate(0)).toBe(-2);
    expect(fastCeil.kind === "explicit" && fastCeil.evaluate(0)).toBe(2);
  });

  it("compiles safe ticker assignments that update slider values dynamically", () => {
    const variables = { a: 2, b: 5 };
    const increment = compileTickerAction("a = a + 1", variables);
    expect(increment.target).toBe("a");
    variables.a = increment.evaluate();
    expect(variables.a).toBe(3);

    const dependent = compileTickerAction("b = floor(a / 2)", variables);
    variables.b = dependent.evaluate();
    expect(variables.b).toBe(1);
    expect(() => compileTickerAction("window.alert(1)", variables)).toThrow(/assignment/);
    expect(() => compileTickerAction("x = 1", variables)).toThrow(/cannot be updated/);
    expect(() => compileTickerAction("c = c + 1", variables)).toThrow(/available slider/);
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

  it("compiles fast expression evaluators while preserving operator, domain, and slider behavior", () => {
    const power = compileFastGraphExpression("2^3^2");
    const negativePower = compileFastGraphExpression("-2^2");
    const logarithm = compileFastGraphExpression("log(100)");
    expect(power.kind === "explicit" && power.evaluate(0)).toBe(512);
    expect(negativePower.kind === "explicit" && negativePower.evaluate(0)).toBe(-4);
    expect(logarithm.kind === "explicit" && logarithm.evaluate(0)).toBe(2);

    const variables = { a: 3 };
    const slider = compileFastGraphExpression("a*x + a", variables);
    expect(slider.kind === "explicit" && slider.evaluate(2)).toBe(9);
    variables.a = 4;
    expect(slider.kind === "explicit" && slider.evaluate(2)).toBe(12);

    const negativeFractionalPower = compileFastGraphExpression("(-1)^0.5");
    const divisionByZero = compileFastGraphExpression("1 / (x - 2)");
    expect(() => negativeFractionalPower.kind === "explicit" && negativeFractionalPower.evaluate(0))
      .toThrow(/negative base requires an integer exponent/);
    expect(() => divisionByZero.kind === "explicit" && divisionByZero.evaluate(2))
      .toThrow(/Division by zero/);
    expect(() => compileColorExpression("x + y", {}, true)(1, Number.NaN)).toThrow();
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
    const sidewaysTangent = compileGraphExpression("x=tan(36y)");
    expect(sidewaysTangent.kind).toBe("sideways");
    if (sidewaysTangent.kind === "sideways") {
      const result = sidewaysTangent.evaluate(Math.atan(2) / 36);
      expect(typeof result === "number" ? result : result.value.toNumber()).toBeCloseTo(2);
    }
    const fastSidewaysTangent = compileFastGraphExpression("x=tan(36y)");
    expect(fastSidewaysTangent.kind).toBe("sideways");
    if (fastSidewaysTangent.kind === "sideways") {
      expect(fastSidewaysTangent.evaluate(Math.atan(2) / 36)).toBeCloseTo(2);
    }
    expect(compileGraphExpression("x^2 + y^2 = 4").kind).toBe("implicit");
    expect(() => compileImplicitEquation("x + y")).toThrow(/exactly one equals sign/);
    expect(() => compileImplicitEquation("x = y = 2")).toThrow(/exactly one equals sign/);
    expect(() => compileImplicitEquation("x^2 + y^2 =")).toThrow(/Both sides/);
    expect(() => compileImplicitEquation("x + unknown = y")).toThrow('Unknown name "unknown"');
    expect(compileImplicitEquation("tan(35.6x)=0")(Math.PI / 35.6, 3).toNumber()).toBeCloseTo(0, 14);
  });

  it("compiles slider-coordinate points whose values update dynamically", () => {
    const variables = { a: 2, b: -3 };
    const point = compileGraphExpression("(a, b)", variables);
    expect(point.kind).toBe("point");
    if (point.kind === "point") {
      expect(point.xVariables).toEqual(["a"]);
      expect(point.yVariables).toEqual(["b"]);
      expect(point.evaluate()).toEqual([2, -3]);
      variables.a = 4;
      variables.b = 5;
      expect(point.evaluate()).toEqual([4, 5]);
    }

    const fastPoint = compileFastGraphExpression("(a,b)", variables);
    expect(fastPoint.kind).toBe("point");
    const roundedPoint = compileGraphExpression("(floor(a), ceil(b))", { a: 2.4, b: -3.2 });
    expect(roundedPoint.kind).toBe("point");
    if (roundedPoint.kind === "point") {
      expect(roundedPoint.xVariables).toEqual(["a"]);
      expect(roundedPoint.yVariables).toEqual(["b"]);
      expect(roundedPoint.evaluate()).toEqual([2, -3]);
    }
    expect(compileFastGraphExpression("(floor(a), ceil(b))", { a: 2.4, b: -3.2 }).kind).toBe("point");
    const operationPoint = compileGraphExpression("(2a + b, c^2 / 2)", { a: 2, b: 3, c: 4 });
    expect(operationPoint.kind).toBe("point");
    if (operationPoint.kind === "point") {
      expect(operationPoint.xVariables).toEqual(["a", "b"]);
      expect(operationPoint.yVariables).toEqual(["c"]);
      expect(operationPoint.evaluate()).toEqual([7, 8]);
    }
    const verticalPoint = compileGraphExpression("(1, b)", { b: 3 });
    expect(verticalPoint.kind).toBe("point");
    if (verticalPoint.kind === "point") {
      expect(verticalPoint.xVariables).toEqual([]);
      expect(verticalPoint.yVariables).toEqual(["b"]);
      expect(verticalPoint.evaluate()).toEqual([1, 3]);
    }
    const horizontalPoint = compileGraphExpression("(a, 2)", { a: 4 });
    expect(horizontalPoint.kind).toBe("point");
    if (horizontalPoint.kind === "point") {
      expect(horizontalPoint.xVariables).toEqual(["a"]);
      expect(horizontalPoint.yVariables).toEqual([]);
      expect(horizontalPoint.evaluate()).toEqual([4, 2]);
    }
    expect(() => compileGraphExpression("(1, 2)", {})).toThrow(/at least one slider variable/);
    expect(() => compileGraphExpression("(a, a)", variables)).toThrow(/different slider variables/);
    const constantPoint = compileGraphExpression("(a, e)", variables);
    expect(constantPoint.kind).toBe("point");
    if (constantPoint.kind === "point") {
      expect(constantPoint.evaluate()[1]).toBeCloseTo(Math.E);
    }
    expect(() => compileGraphExpression("(x + a, b)", variables)).toThrow(/slider variables/);
  });

  it("plots equations linear in y as explicit curves, including factored forms", () => {
    const factored = compileGraphExpression("(x - 1)(x + 1) = y");
    expect(factored.kind).toBe("explicit");
    if (factored.kind === "explicit") {
      const result = factored.evaluate(2);
      expect(typeof result === "number" ? result : result.value.toNumber()).toBeCloseTo(3);
    }

    const shifted = compileFastGraphExpression("y + 2 = (x - 1)(x + 1)");
    expect(shifted.kind).toBe("explicit");
    if (shifted.kind === "explicit") {
      expect(shifted.evaluate(2)).toBeCloseTo(1);
    }
    expect(compileFastGraphExpression("x^2 + y^2 = 4").kind).toBe("implicit");
    expect(compileFastGraphExpression("x * y = x^2").kind).toBe("implicit");
    expect(compileFastGraphExpression("x + y = x + y").kind).toBe("implicit");
  });

  it("plots equations that solve for x as sideways explicit curves", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const variables = { a: 2 };
      const shifted = compile("2x + 1 = a*y^2", variables);
      expect(shifted.kind).toBe("sideways");
      if (shifted.kind === "sideways") {
        const numberAt = (y: number) => {
          const result = shifted.evaluate(y);
          return typeof result === "number" ? result : result.value.toNumber();
        };
        expect(numberAt(3)).toBe(8.5);
        variables.a = 4;
        expect(numberAt(3)).toBe(17.5);
        expect(() => shifted.evaluate(Number.NaN)).toThrow(/finite/);
      }
      const reciprocal = compile("x=1/y");
      expect(reciprocal.kind).toBe("sideways");
      if (reciprocal.kind === "sideways") {
        expect(() => reciprocal.evaluate(0)).toThrow();
      }
      expect(compile("x=2").kind).toBe("sideways");
      expect(compile("y^2=x").kind).toBe("sideways");
      expect(compile("x = 2y + 3").kind).toBe("explicit");
      expect(compile("x^2 + y^2 = 4").kind).toBe("implicit");
      expect(compile("x*y=y^2").kind).toBe("implicit");
    }
  });
});
