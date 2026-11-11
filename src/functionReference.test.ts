import { describe, expect, it } from "vitest";
import { COLLECTION_FUNCTIONS } from "./collections";
import { filterFunctionReference, FUNCTION_REFERENCE } from "./functionReference";
import { BUILTIN_NAMES } from "./math";
import { STATISTICAL_PLOTS } from "./statisticalPlots";
import { DISTRIBUTION_NAMES } from "./probability";
import { INFERENCE_NAMES } from "./inference";

describe("function reference", () => {
  const listed = new Set(FUNCTION_REFERENCE.flatMap((category) =>
    category.entries.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])])));

  it("lists every built-in and list function the parser accepts", () => {
    const missing = [...BUILTIN_NAMES, ...COLLECTION_FUNCTIONS, ...STATISTICAL_PLOTS, ...DISTRIBUTION_NAMES, ...INFERENCE_NAMES].filter((name) => !listed.has(name));
    expect(missing).toEqual([]);
  });

  it("filters by name, alias, and description", () => {
    expect(filterFunctionReference("floor").flatMap((c) => c.entries.map((e) => e.name))).toEqual(["floor"]);
    expect(filterFunctionReference("sgn").flatMap((c) => c.entries.map((e) => e.name))).toEqual(["sign"]);
    expect(filterFunctionReference("mean").some((c) => c.title === "Statistics")).toBe(true);
    expect(filterFunctionReference("")).toBe(FUNCTION_REFERENCE);
    expect(filterFunctionReference("nothing-matches-this")).toEqual([]);
  });
});
