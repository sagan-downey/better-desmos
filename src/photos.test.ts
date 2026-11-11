import { describe, expect, it } from "vitest";
import { expandUserFunctions } from "./math";
import { evaluatePhotoTransform, parsePhotos, photoMatrix, photoDragTransform, photoLocalPoint, MAX_PHOTO_BYTES, type Photo } from "./photos";

const photo: Photo = {
  id: 1, name: "Test photo", source: "data:image/png;base64,AAAA",
  centerX: "0", centerY: "0", rotation: "0", rotationUnit: "radians",
  width: "10", height: "5", opacity: 1, hidden: false,
  initialWidth: 1, initialHeight: 1,
};

describe("photos", () => {
  it("moves, resizes, and rotates photos in graph coordinates",()=>{
    const transform={centerX:1,centerY:2,width:4,height:2,rotation:0};
    expect(photoDragTransform(transform,"move",[0,0],[3,4])).toEqual({...transform,centerX:4,centerY:6});
    expect(photoDragTransform(transform,"scale",[3,3],[5,4])).toEqual({...transform,width:8,height:4});
    expect(photoDragTransform(transform,"rotate",[2,2],[1,3]).rotation).toBeCloseTo(Math.PI/2);
    const local=photoLocalPoint({...transform,rotation:Math.PI/2},1,3);
    expect(local[0]).toBeCloseTo(1);expect(local[1]).toBeCloseTo(0);
    expect(()=>photoDragTransform(transform,"scale",[1,2],[2,3])).toThrow(/away/);
  });
  it("imports embedded raster data and preserves only persistent fields", () => {
    expect(parsePhotos(undefined)).toEqual([]);
    const saved = { ...photo, folderId: 2, bitmap: "runtime data" };
    expect(parsePhotos(JSON.parse(JSON.stringify([saved])))).toEqual([{ ...photo, folderId: 2 }]);
  });

  it("rejects remote, SVG, malformed, duplicate and oversized photo data", () => {
    for (const source of ["https://example.com/photo.png", "data:image/svg+xml;base64,AAAA",
      "data:image/png;base64,", "data:image/png;base64,A===", "data:image/png;base64,AA=A"]) {
      expect(() => parsePhotos([{ ...photo, source }])).toThrow(/invalid photo/);
    }
    expect(() => parsePhotos([photo, photo])).toThrow(/invalid photo/);
    expect(() => parsePhotos([{ ...photo, opacity: 2 }])).toThrow(/invalid photo/);
    expect(() => parsePhotos([{ ...photo, width: "1".repeat(513) }])).toThrow(/invalid photo/);
    expect(() => parsePhotos([{ ...photo, rotationUnit: "turns" }])).toThrow(/invalid photo/);
    for (const initialWidth of [0, -1, Infinity, "10"]) {
      expect(() => parsePhotos([{ ...photo, initialWidth }])).toThrow(/invalid photo/);
    }
    expect(() => parsePhotos([{ ...photo, initialHeight: undefined }])).toThrow(/invalid photo/);
    const source = `data:image/png;base64,${"A".repeat(Math.ceil(MAX_PHOTO_BYTES / 3) * 4)}`;
    expect(() => parsePhotos([{ ...photo, source }])).toThrow(/invalid photo/);
    const validLarge = source.slice(0, -1) + "=";
    expect(parsePhotos([{ ...photo, source: validLarge }])).toHaveLength(1);
    expect(() => parsePhotos([{ ...photo, source: validLarge },
      { ...photo, id: 2, source: validLarge }])).toThrow(/total at most 4 MB/);
  });

  it("evaluates safe formulas, live sliders and user-defined functions", () => {
    const variables = { a: 2, b: 3 };
    const values = { ...photo, centerX: "a", centerY: "b", width: "2a", height: "f(b)", rotation: "pi/2" };
    const expand = (source: string) => expandUserFunctions(source, [{ name: "f", parameter: "x", body: "x^2" }]);
    expect(evaluatePhotoTransform(values, variables, expand)).toMatchObject({
      centerX: 2, centerY: 3, width: 4, height: 9, rotation: Math.PI / 2,
    });
    variables.a = 4;
    expect(evaluatePhotoTransform(values, variables, expand).width).toBe(8);
    expect(evaluatePhotoTransform({ ...photo, rotation: "90", rotationUnit: "degrees" }, {}).rotation)
      .toBeCloseTo(Math.PI / 2);
    expect(evaluatePhotoTransform({ ...photo, width: "{a=2:3,4}" }, variables).width).toBe(4);
  });

  it("reports invalid math and coordinate-dependent values beside the affected field", () => {
    for (const width of ["x", "y", "t", "2x", "x2", "x+1", "y=2", "", "sqrt(-1)", "1/0", "10^400", "1;alert(1)"]) {
      expect(() => evaluatePhotoTransform({ ...photo, width }, {})).toThrow(/X scale:/);
    }
    expect(() => evaluatePhotoTransform({ ...photo, centerX: "a" }, { a: NaN })).toThrow(/Center X:/);
    expect(evaluatePhotoTransform({ ...photo, centerX: "x_mean" }, { x_mean: 3 }).centerX).toBe(3);
  });

  it("maps centered images upright, rotates counterclockwise and respects unequal axis scales", () => {
    const transform = evaluatePhotoTransform({ ...photo, centerX: "2", centerY: "3" }, {});
    expect(photoMatrix(transform, 1, 1, 10, 20, 600, 400)).toEqual([100, -0, 0, 100, 310, 160]);
    const rotated = photoMatrix({ ...transform, rotation: Math.PI / 2 }, 1, 1, 10, 20, 600, 400);
    expect(rotated[0]).toBeCloseTo(0);
    expect(rotated[1]).toBeCloseTo(-200);
    expect(rotated[2]).toBeCloseTo(50);
    expect(rotated[3]).toBeCloseTo(0);
    expect(rotated.slice(4)).toEqual([310, 160]);
  });

  it("supports independent scaling, mirrored sizes and zero size, and rejects overflow", () => {
    const values = evaluatePhotoTransform({ ...photo, width: "-4", height: "0" }, {});
    expect(values).toMatchObject({ width: -4, height: 0 });
    expect(photoMatrix(values, 0, 0, 10, 10, 600, 400)[0]).toBe(-40);
    expect(() => photoMatrix({ ...values, width: 1e308 }, 0, 0, 10, 10, 600, 400)).toThrow(/numeric range/);
  });

  it("scales independently relative to the persisted initial image size", () => {
    const original = { ...photo, initialWidth: 10, initialHeight: 5, width: "1", height: "1" };
    expect(evaluatePhotoTransform(original, {})).toMatchObject({ width: 10, height: 5 });
    const changed = { ...original, width: "2a", height: "0.5" };
    expect(evaluatePhotoTransform(changed, { a: 1 })).toMatchObject({ width: 20, height: 2.5 });
    expect(evaluatePhotoTransform(changed, { a: 2 })).toMatchObject({ width: 40, height: 2.5 });
    const restored = parsePhotos(JSON.parse(JSON.stringify([changed])))[0]!;
    expect(evaluatePhotoTransform(restored, { a: 1 })).toMatchObject({ width: 20, height: 2.5 });
    expect(evaluatePhotoTransform({ ...original, width: "-1", height: "0" }, {}))
      .toMatchObject({ width: -10, height: 0 });
    expect(() => evaluatePhotoTransform({ ...original, width: "10^308" }, {})).toThrow(/X scale: Scaled size/);
  });

  it("preserves dimensions from older photo projects without an initial size", () => {
    const { initialWidth, initialHeight, ...legacy } = photo;
    expect(initialWidth).toBe(1);
    expect(initialHeight).toBe(1);
    const restored = parsePhotos([legacy])[0]!;
    expect(evaluatePhotoTransform(restored, {})).toMatchObject({ width: 10, height: 5 });
  });
});
