import { describe, expect, it } from "vitest";
import { BoundedCache, referencedVariableSignature, SegmentIndex, selectHoverPoint, tangentBranchRange, tangentPixelCoverage } from "./performance";

describe("bounded sample caching", () => {
  it("evicts least-recently-used entries and remains active after reaching capacity", () => {
    const cache = new BoundedCache<number, number>(2);
    cache.set(1, 10);
    cache.set(2, 20);
    expect(cache.get(1)).toBe(10);
    cache.set(3, 30);
    expect(cache.size).toBe(2);
    expect(cache.get(2)).toBeUndefined();
    expect(cache.get(1)).toBe(10);
    expect(cache.get(3)).toBe(30);
    for (let i = 4; i < 100; i += 1) cache.set(i, i);
    expect(cache.size).toBe(2);
    expect(cache.get(99)).toBe(99);
  });

  it("does not round sample coordinates or discard zero results", () => {
    const cache = new BoundedCache<number, number>(3);
    cache.set(1, 0);
    cache.set(1 + Number.EPSILON, 2);
    expect(cache.get(1)).toBe(0);
    expect(cache.get(1 + Number.EPSILON)).toBe(2);
    expect(() => new BoundedCache(0)).toThrow(/positive integer/);
  });

  it("preserves LRU order through updates, hits, and repeated evictions", () => {
    const cache = new BoundedCache<number, number>(128);
    const reference = new Map<number, number>();
    for (let i = 0; i < 20_000; i += 1) {
      const key = (i * 37) % 257;
      if (i % 3 === 0) {
        const expected = reference.get(key);
        if (reference.has(key)) {
          reference.delete(key);
          reference.set(key, expected!);
        }
        expect(cache.get(key)).toBe(expected);
      } else {
        reference.delete(key);
        if (reference.size === 128) reference.delete(reference.keys().next().value!);
        reference.set(key, i);
        cache.set(key, i);
      }
      expect(cache.size).toBe(reference.size);
    }
    const single = new BoundedCache<number, number>(1);
    single.set(1, 1);
    single.set(1, 2);
    expect(single.get(1)).toBe(2);
    single.set(2, 3);
    expect(single.get(1)).toBeUndefined();
    expect(single.get(2)).toBe(3);
  });

  it("invalidates for referenced variables, including nonfinite values, but not unrelated sliders", () => {
    const variables = { a: 1, b_1: 2, c: 3 };
    const source = "a*x + b_1";
    const original = referencedVariableSignature(source, variables);
    variables.c = 4;
    expect(referencedVariableSignature(source, variables)).toBe(original);
    variables.a = 5;
    expect(referencedVariableSignature(source, variables)).not.toBe(original);
    variables.a = Number.NaN;
    const nan = referencedVariableSignature(source, variables);
    variables.a = Infinity;
    expect(referencedVariableSignature(source, variables)).not.toBe(nan);
    variables.a = -0;
    const negativeZero = referencedVariableSignature(source, variables);
    variables.a = 0;
    expect(referencedVariableSignature(source, variables)).not.toBe(negativeZero);
  });
});

describe("hover segment indexing", () => {
  it("enumerates tangent branches independently of pixel sampling and slope direction", () => {
    const range = tangentBranchRange(36, 0, -100, 100);
    expect(range.first).toBe(-1146);
    expect(range.last).toBe(1146);
    expect(tangentBranchRange(-36, 0, -100, 100)).toEqual(range);
    expect(tangentBranchRange(36, Math.PI, -100, 100))
      .toEqual({ first: range.first + 1, last: range.last + 1 });
    expect(tangentBranchRange(1, 0, 0, 19_999 * Math.PI))
      .toEqual({ first: -0, last: 19_999 });
    expect(tangentBranchRange(1, 0, 0, 20_000 * Math.PI).last).toBe(20_000);
    expect(tangentBranchRange(36, 0, -1e6, 1e6).last).toBeGreaterThan(1_000_000);
  });
  it("keeps dense coverage bounded and respects opacity without accumulating overlapping strokes", () => {
    expect(tangentPixelCoverage(0.01, 2, 0.3)).toBe(0.3);
    expect(tangentPixelCoverage(0, 2, 0.3)).toBe(0.3);
    expect(tangentPixelCoverage(0.01, 2, 0)).toBe(0);
    expect(tangentPixelCoverage(0.01, 2, 1)).toBe(1);
    expect(() => tangentPixelCoverage(-1, 2, 1)).toThrow(/valid/);
    const dense = { segments: [], hoverPoint: (x: number, y: number) => ({ x, y: y + 0.1 }) };
    const index = new SegmentIndex([dense]);
    expect(selectHoverPoint(index.nearby(100, 200, 10), 100, 200, () => 0))
      .toMatchObject({ curve: dense, x: 100, y: 200.1 });
  });
  it("prefers workspace priority within the hover radius, then the nearest segment", () => {
    const higher = { segments: [-20, 8, 20, 8, -20, 6, 20, 6] };
    const lower = { segments: [-20, 0, 20, 0] };
    const index = new SegmentIndex([lower, higher]);
    const priority = (curve: typeof higher) => curve === higher ? 0 : 1;
    const candidates = index.nearby(0, 0, 10);
    expect(selectHoverPoint(candidates, 0, 0, priority)).toMatchObject({
      curve: higher, x: 0, y: 6, distance: 6,
    });
    expect(selectHoverPoint(candidates, 0, 0, (curve) => curve === lower ? 0 : 1)?.curve)
      .toBe(lower);
    expect(selectHoverPoint(candidates, 0, -5, priority)?.curve).toBe(lower);
    expect(selectHoverPoint(candidates, 0, -20, priority)).toBeUndefined();
    expect(selectHoverPoint(candidates, 0, 0, () => Infinity)).toBeUndefined();
  });

  it("handles very long segments without allocating an unbounded grid", () => {
    const curve = { segments: [-1e12, -1e12, 1e12, 1e12] };
    const index = new SegmentIndex([curve]);
    expect(index.nearby(0, 0, 10).map(({ curve: candidate }) => candidate)).toEqual([curve]);
    expect(() => index.nearby(0, 0, Number.NaN)).toThrow(/finite/);
    const distant = { segments: [1e30, 1e30, 1e30, 1e30] };
    const distantIndex = new SegmentIndex([distant]);
    expect(distantIndex.nearby(1e30, 1e30, 10)[0]?.curve).toBe(distant);
    const small = { segments: [0, 0, 1, 1] };
    expect(new SegmentIndex([small]).nearby(0, 0, 1e30)[0]?.curve).toBe(small);
  });

  it("includes nearby segments across bucket boundaries and preserves original tie order", () => {
    const first = { segments: [0, 64, 128, 64, 64, 0, 64, 128] };
    const second = { segments: [0, 0, 128, 128] };
    const index = new SegmentIndex([first, second]);
    const nearby = index.nearby(64, 64, 10);
    expect(nearby.map(({ curve, offset }) => [curve, offset])).toEqual([
      [first, 0], [first, 4], [second, 0],
    ]);
    expect(index.nearby(1000, 1000, 10)).toEqual([]);
  });

  it("never removes a segment whose bounding box intersects the pointer search square", () => {
    const curves = Array.from({ length: 20 }, (_, i) => ({
      segments: [i * 17 - 100, i * 7 - 50, i * 17 - 60, i * 7 + 80],
    }));
    const index = new SegmentIndex(curves, 32);
    for (let y = -100; y <= 300; y += 13) {
      for (let x = -100; x <= 300; x += 19) {
        const candidates = index.nearby(x, y, 10);
        for (const curve of curves) {
          const [x1, y1, x2, y2] = curve.segments;
          if (Math.min(x1!, x2!) <= x + 10 && Math.max(x1!, x2!) >= x - 10 &&
              Math.min(y1!, y2!) <= y + 10 && Math.max(y1!, y2!) >= y - 10) {
            expect(candidates.some((entry) => entry.curve === curve)).toBe(true);
          }
        }
      }
    }
  });
});
