import { describe, expect, it } from "vitest";
import { axisStep, fitViewportBounds } from "./viewport";

describe("viewport controls", () => {
  it("fits both axes exactly, including custom aspect ratios", () => {
    const bounds = fitViewportBounds(1000, 600, -2, 8, -10, 20);
    expect(bounds.centerX).toBe(3);
    expect(bounds.centerY).toBe(5);
    expect(bounds.scale).toBe(100);
    expect(bounds.aspectRatio).toBe(5);
    expect(1000 / bounds.scale).toBe(10);
    expect(600 / (bounds.scale / bounds.aspectRatio)).toBe(30);
  });
  it("rejects invalid bounds instead of silently changing them", () => {
    expect(() => fitViewportBounds(1000,600,2,2,-1,1)).toThrow(/increasing/);
    expect(() => fitViewportBounds(1000,600,-Infinity,1,-1,1)).toThrow(/finite/);
    expect(() => fitViewportBounds(1000,600,0,1e-10,-1,1)).toThrow(/range/);
  });
  it("supports automatic steps and validates manual steps", () => {
    expect(axisStep("")).toBeUndefined();
    expect(axisStep("0.25")).toBe(0.25);
    for (const value of ["0", "-1", "Infinity", "nope"]) expect(() => axisStep(value)).toThrow(/positive/);
  });
});
