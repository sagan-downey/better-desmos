import { describe, expect, it } from "vitest";
import { imageExportSize } from "./image-export";

describe("PNG export dimensions", () => {
  it("scales the visible graph rather than the pan buffer or device DPR", () => {
    expect(imageExportSize(1200, 800, 1)).toEqual({ width: 1200, height: 800 });
    expect(imageExportSize(1200, 800, 4)).toEqual({ width: 4800, height: 3200 });
    expect(imageExportSize(600.5, 500.25, 2)).toEqual({ width: 1201, height: 1001 });
    expect(imageExportSize(4000, 4000, 1)).toEqual({ width: 4000, height: 4000 });
  });
  it("rejects invalid and oversized requests before allocating canvases", () => {
    for (const args of [[0, 800, 1], [NaN, 1, 1], [100, Infinity, 2], [100, 100, 5], [100, 100, 1.5],
      [4001, 4000, 1], [16385, 1, 1], [2000, 1000, 4]]) {
      expect(() => imageExportSize(args[0]!, args[1]!, args[2]!)).toThrow();
    }
  });
});
