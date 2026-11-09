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
  UndefinedPointError,
} from "./math";

describe("restrictions and piecewise expressions", () => {
  it("selects the first matching branch lazily and preserves exact results", () => {
    const expression = compileExpression("{x<0: -x, x=0: 1/3, sqrt(x)}");
    expect(expression(-2).value.toNumber()).toBe(2);
    expect(expression(0).exact).toBe(true);
    expect(expression(0).value.toNumber()).toBeCloseTo(1 / 3);
    expect(expression(4).value.toNumber()).toBe(2);
    expect(compileExpression("{x<0: sqrt(-1), 7}")(2).value.toNumber()).toBe(7);
    expect(compileExpression("{x>=0: 1, x>=0: 2}")(0).value.toNumber()).toBe(1);
    expect(() => compileExpression("{x>0: x}")(-1)).toThrow(UndefinedPointError);
    expect(() => compileExpression("{x<0: sqrt(x), 0}")(-1)).toThrow(/sqrt/);
  });

  it("supports chained comparisons, grouped conditions, and/or and nested piecewise arithmetic", () => {
    const expression = compileExpression("2+{(x+1)<=0 or (1<x<3 and x!=2): {x<0: 4, 5}, 0}");
    expect(expression(-2).value.toNumber()).toBe(6);
    expect(expression(1.5).value.toNumber()).toBe(7);
    expect(expression(2).value.toNumber()).toBe(2);
    expect(expression(3).value.toNumber()).toBe(2);
    expect(compileExpression("{x≤0: 2, x≥1: 3, 4}")(0).value.toNumber()).toBe(2);
    expect(compileExpression("{x≠0: 1, 0}")(0).value.toNumber()).toBe(0);
    expect(compileExpression("sqrt(4){x>0, x<-1}")(-2).value.toNumber()).toBe(2);
    expect(() => compileExpression("1{x>0}{x<2}")(3)).toThrow(UndefinedPointError);
    expect(compileExpression("{x=0 or 1/x>0: 5, 0}")(0).value.toNumber()).toBe(5);
    expect(compileExpression("{({x<0:0,2})<1:7,9}")(-1).value.toNumber()).toBe(7);
    expect(compileExpression("{1/3>0.333333333333333333333333333333333333333333333333333:1,0}")(0)
      .value.toNumber()).toBe(1);
  });

  it("handles live slider conditions and expanded function bodies", () => {
    const variables = { a: 2 };
    const source = expandUserFunctions("f(x)", [{ name: "f", parameter: "x", body: "{x<a: x^2, a}" }]);
    const expression = compileExpression(source, variables);
    expect(expression(3).value.toNumber()).toBe(2);
    variables.a = 4;
    expect(expression(3).value.toNumber()).toBe(9);
  });

  it("clips explicit/sideways graphs in both modes using the actual plotted coordinates", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const graph = compile("y=x^2 {-2<x<2}{y<=1}");
      expect(graph.kind).toBe("explicit");
      if (graph.kind !== "explicit") throw Error("Expected explicit");
      expect(() => graph.evaluate(1)).not.toThrow();
      expect(() => graph.evaluate(1.5)).toThrow(UndefinedPointError);
      expect(() => graph.evaluate(-2)).toThrow(UndefinedPointError);
      const sideways = compile("x=y^2 {x<4 and y>=0}");
      expect(sideways.kind).toBe("sideways");
      if (sideways.kind !== "sideways") throw Error("Expected sideways");
      expect(() => sideways.evaluate(1)).not.toThrow();
      expect(() => sideways.evaluate(-1)).toThrow(UndefinedPointError);
      expect(() => sideways.evaluate(2)).toThrow(UndefinedPointError);
      const branch = compile("y={x<0: -1, x=0: 0, 1}");
      expect(branch.kind).toBe("explicit");
      if (branch.kind !== "explicit") throw Error("Expected explicit piecewise");
      const result = branch.evaluate(-1);
      expect(typeof result === "number" ? result : result.value.toNumber()).toBe(-1);
    }
  });

  it("restricts implicit equations, inequalities and parameterized curves", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      for (const source of ["x^2+y^2=4{x>=0}", "x^2+y^2<=4{x>=0}"]) {
        const graph = compile(source);
        if (graph.kind !== "implicit" && graph.kind !== "inequality") throw Error("Expected contour");
        expect(() => graph.evaluate(2, 0)).not.toThrow();
        expect(() => graph.evaluate(-2, 0)).toThrow(UndefinedPointError);
      }
      const graph = compile("parametric(t,{t<0: t^2, t},-2,2){x>=0}");
      if (graph.kind !== "parametric") throw Error("Expected parametric");
      expect(graph.evaluate(1)).toEqual([1, 1]);
      expect(() => graph.evaluate(-1)).toThrow(UndefinedPointError);
      const implicit = compile("x^2+y^2={x>=0: 4, 1}");
      if (implicit.kind !== "implicit") throw Error("Expected implicit piecewise");
      const result = implicit.evaluate(-1, 0);
      expect(typeof result === "number" ? result : result.toNumber()).toBe(0);
      const point = compile("(a,b){x>=0}", { a: -1, b: 2 });
      if (point.kind !== "point") throw Error("Expected point");
      expect(() => point.evaluate()).toThrow(UndefinedPointError);
      const polar = compile("polar({t<pi: 2, 1},0,2pi){y>=0}");
      if (polar.kind !== "parametric") throw Error("Expected polar");
      expect(() => polar.evaluate(Math.PI / 2)).not.toThrow();
      expect(() => polar.evaluate(Math.PI * 1.5)).toThrow(UndefinedPointError);
    }
  });

  it("keeps restrictions live and avoids unrestricted tangent optimization", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const variables = { a: 1 };
      const graph = compile("tan(x){x<a}", variables);
      if (graph.kind !== "explicit") throw Error("Expected explicit");
      expect(graph.tangent).toBeUndefined();
      expect(() => graph.evaluate(2)).toThrow(UndefinedPointError);
      variables.a = 3;
      expect(() => graph.evaluate(2)).not.toThrow();
    }
  });

  it("identifies branch boundaries so renderers never join different piecewise branches", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      for (const source of ["y={x<0: -1, 1}", "y=2+{x<0: -1, 1}{x>-2}"]) {
        const graph = compile(source);
        if (graph.kind !== "explicit" || !graph.region) throw Error("Expected branch metadata");
        expect(graph.region(-1)).not.toBe(graph.region(1));
        expect(graph.region(-1)).toBe(graph.region(-0.1));
      }
      const graph = compile("parametric(t,{t<0: -1, 1},-2,2)");
      if (graph.kind !== "parametric" || !graph.region) throw Error("Expected parametric branch metadata");
      expect(graph.region(-1)).not.toBe(graph.region(1));
      const implicit = compile("{x<0: -1, 1}=0");
      if (implicit.kind !== "implicit" || !implicit.region) throw Error("Expected implicit branch metadata");
      expect(implicit.region(-1, 0)).not.toBe(implicit.region(1, 0));
      const inequality = compile("y^2<{x<0:1,4}");
      if (inequality.kind !== "inequality" || !inequality.region) throw Error("Expected inequality branch metadata");
      expect(inequality.region(-1, 0)).not.toBe(inequality.region(1, 0));
    }
  });

  it("restricts list points without shifting the surviving points' x coordinates", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const graph = compile("list(1,2,3,4){x>2 and y<4}");
      if (graph.kind !== "list") throw Error("Expected list");
      expect(graph.evaluate()).toEqual([undefined, undefined, 3, undefined]);
    }
  });

  it("reports invalid syntax and never executes user text", () => {
    for (const source of ["{}", "{x<0:}", "{x<0: 1, 2, x>1: 3}", "{1: 2}",
      "{x<: 1}", "x{}", "x{x}", "{x<0: 1", "{x<0: window.alert(1), 0}", "x{unknown>0}",
      "x{x>0}+1{x<2}"]) {
      expect(() => compileGraphExpression(source), source).toThrow();
      expect(() => compileFastGraphExpression(source), source).toThrow();
    }
  });
});

describe("compileExpression", () => {
  it("provides live affine tangent branches in both graph orientations and modes", () => {
    for (const compile of [compileGraphExpression, compileFastGraphExpression]) {
      const variables = { a: 36, b: 1 };
      for (const source of ["x=tan(a*y+b)", "y=tan(a*x+b)", "tan(a*x+b)"]) {
        const graph = compile(source, variables);
        if (graph.kind !== "explicit" && graph.kind !== "sideways") {
          throw new Error("Expected a tangent curve.");
        }
        expect(graph.tangent?.()).toEqual({ slope: 36, offset: 1 });
        variables.a = -18;
        expect(graph.tangent?.()).toEqual({ slope: -18, offset: 1 });
        variables.a = 36;
      }
    }
  });
  it("reuses constant math without freezing precision, variables, or domain errors", () => {
    const variables = { a: 2 };
    const expression = compileExpression("sin(pi/4)*x + sqrt(9) + a", variables);
    expect(expression(2).value.toNumber()).toBeCloseTo(Math.SQRT2 + 5, 12);
    variables.a = 4;
    expect(expression(2).value.toNumber()).toBeCloseTo(Math.SQRT2 + 7, 12);
    const invalid = compileExpression("x + sqrt(-1)");
    expect(() => invalid(1)).toThrow(/sqrt/);
    expect(() => invalid(2)).toThrow(/sqrt/);
    const originalPrecision = getPrecisionDigits();
    const constant = compileExpression("pi/7");
    try {
      setPrecisionDigits(20);
      const lowPrecision = constant(0).value.toString();
      setPrecisionDigits(60);
      const highPrecision = constant(0).value.toString();
      expect(highPrecision.length).toBeGreaterThan(lowPrecision.length);
      expect(highPrecision).toBe(compileExpression("pi/7")(0).value.toString());
    } finally {
      setPrecisionDigits(originalPrecision);
    }
    const fast = compileFastGraphExpression("x + sin(pi/4)");
    const constantFast = compileFastGraphExpression("1 + sin(pi/4)");
    expect(fast.kind).toBe("explicit");
    expect(constantFast.kind).toBe("explicit");
    if (fast.kind !== "explicit" || constantFast.kind !== "explicit") {
      throw new Error("Expected explicit graphs for the constant-cache regression.");
    }
    expect(fast.evaluate(1)).toBe(constantFast.evaluate(0));
  });
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
    expect(compileExpression(expandUserFunctions("g(2)", [
      { name: "g", parameter: "t", body: "t^2" },
    ]))(0).value.toNumber()).toBe(4);
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
    const fixedPoint = compileGraphExpression("(1, 2)", {});
    expect(fixedPoint.kind === "point" && fixedPoint.evaluate()).toEqual([1, 2]);
    const sharedPoint = compileGraphExpression("(a, a)", variables);
    expect(sharedPoint.kind === "point" && sharedPoint.evaluate()).toEqual([variables.a, variables.a]);
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
