import { describe, expect, it } from "vitest";
import { fitCustomRegression, regressionParameters, regressionSides } from "./customRegression";

const lists = {
  x_1: ["(1)", "(2)", "(3)", "(4)", "(5)"],
  y_1: ["(3)", "(5)", "(7)", "(9)", "(11)"],
};

describe("custom ~ regressions", () => {
  it("splits sides and finds unknown parameters", () => {
    const sides = regressionSides("y_1 ~ m x_1 + b")!;
    expect(sides).toEqual({ left: "y_1", right: "m x_1 + b" });
    expect(regressionParameters(sides, new Set(["x_1", "y_1"]))).toEqual(["b", "m"]);
    expect(regressionSides("y = x")).toBeUndefined();
    expect(() => regressionSides("y_1 ~ a ~ b")).toThrow(/one ~/);
    expect(() => regressionParameters(regressionSides("y_1 ~ a x")!, new Set(["y_1"]))).toThrow(/instead of x/);
  });

  it("fits a linear model exactly and graphs it in x", () => {
    const fit = fitCustomRegression(regressionSides("y_1 ~ m x_1 + b")!, ["b", "m"], {}, lists);
    expect(fit.parameters.m).toBeCloseTo(2, 9);
    expect(fit.parameters.b).toBeCloseTo(1, 9);
    expect(fit.rSquared).toBeCloseTo(1, 12);
    expect(fit.residuals.every((value) => Math.abs(value) < 1e-9)).toBe(true);
    expect(fit.graphSource).toBe("m (x) + b");
  });

  it("converges for noisy linear data", () => {
    const fit = fitCustomRegression(regressionSides("y_1 ~ m x_1 + b")!, ["b", "m"], {},
      { x_1: ["(1)", "(2)", "(3)"], y_1: ["(2.9)", "(5.1)", "(7)"] });
    expect(fit.converged).toBe(true);
    expect(fit.parameters.m).toBeCloseTo(2.05, 8);
    expect(fit.parameters.b).toBeCloseTo(0.9, 8);
    expect(fit.residuals.reduce((sum, value) => sum + value, 0)).toBeCloseTo(0, 8);
  });

  it("fits nonlinear exponential models", () => {
    const data = {
      x_1: ["(0)", "(1)", "(2)", "(3)"],
      y_1: [0, 1, 2, 3].map((x) => `(${3 * Math.exp(0.5 * x)})`),
    };
    const fit = fitCustomRegression(regressionSides("y_1 ~ a e^(k x_1)")!, ["a", "k"], {}, data);
    expect(fit.parameters.a).toBeCloseTo(3, 6);
    expect(fit.parameters.k).toBeCloseTo(0.5, 6);
  });

  it("reports explicit errors", () => {
    expect(() => fitCustomRegression(regressionSides("y_1 ~ x_1")!, [], {}, lists)).toThrow(/at least one/);
    expect(() => fitCustomRegression(regressionSides("3 ~ a x_1")!, ["a"], {}, lists)).toThrow(/left side/);
    expect(() => fitCustomRegression(regressionSides("y_1 ~ a")!, ["a"], {}, lists)).toThrow(/right side/);
    expect(() => fitCustomRegression(regressionSides("y_1 ~ a [1,2]")!, ["a"], {}, lists)).toThrow(/same number/);
  });
});
