import { describe, expect, it } from "vitest";
import { completeFunction, functionCompletions } from "./autocomplete";
import { MAX_TABLE_ROWS, nextTableCell, spreadsheetCells, validateSpreadsheetPaste } from "./spreadsheet";
import { workspaceWidth } from "./workspaceResize";
import type { FormulaTable } from "./tables";

describe("function autocomplete", () => {
  it("suggests supported functions for a partial name at the caret", () => {
    expect(functionCompletions("y=me", 4)).toEqual({ start: 2, end: 4, names: ["mean", "median"] });
    expect(functionCompletions("floor(x)+flo", 12)?.names).toEqual(["floor"]);
    expect(functionCompletions("a_me", 4)).toBeUndefined();
    expect(functionCompletions("mean_1", 4)).toBeUndefined();
    expect(functionCompletions("m", 1)).toBeUndefined();
    expect(functionCompletions("mean(", 4)).toBeUndefined();
    expect(functionCompletions("xyz", 3)).toBeUndefined();
    expect(functionCompletions("vec",3)?.names).toContain("vectorfield");
    expect(functionCompletions("slope",5)?.names).toContain("slopefield");
    expect(functionCompletions("od",2)?.names).toContain("ode");
    expect(functionCompletions("dom",3)?.names).toContain("domaincolor");
    expect(functionCompletions("mand",4)?.names).toContain("mandelbrot");
    expect(functionCompletions("diff",4)?.names).toContain("differentiate");
    expect(functionCompletions("traj",4)?.names).toContain("trajectory");
    for(const name of ["heatmap","contours","fourier","fourierdata","spectrum","taylor","taylorerror","tangentline","normalline",
      "arclength","curvature","area","areabetween","roots","errorbars","confidenceband","predictionband","unitcheck","convert"])
      expect(functionCompletions(name.slice(0,3),3)?.names).toContain(name);
  });

  it("replaces the whole token without removing surrounding text", () => {
    expect(completeFunction("2+me+3", 2, 4, "mean")).toEqual({ text: "2+mean()+3", caret: 7 });
    expect(completeFunction("me (L)", 0, 2, "mean")).toEqual({ text: "mean (L)", caret: 6 });
    expect(functionCompletions("flor(x)", 3)?.end).toBe(4);
  });
});

describe("spreadsheet pasting", () => {
  const table: FormulaTable = { id: 1, rows: [{ id: 1, x: "1", y: "2" }] };
  it("parses tabular text, CRLF, empty cells, and quoted spreadsheet fields", () => {
    expect(spreadsheetCells("1\t2\r\n3\t4\r\n")).toEqual([["1", "2"], ["3", "4"]]);
    expect(spreadsheetCells('1\t\t"mean(1,2)"\n3\t4\t5')).toEqual([["1", "", "mean(1,2)"], ["3", "4", "5"]]);
    expect(spreadsheetCells('"a""b"\t2')).toEqual([['a"b', "2"]]);
    expect(spreadsheetCells("1\n\n3\n")).toEqual([["1"], [""], ["3"]]);
    expect(spreadsheetCells("1\t2\t")).toEqual([["1", "2", ""]]);
    expect(spreadsheetCells("mean(1,2)")).toBeUndefined();
  });
  it("rejects malformed or oversized input rather than truncating it", () => {
    expect(() => spreadsheetCells('"a\t2')).toThrow(/closing quote/);
    expect(() => spreadsheetCells('"a"b\t2')).toThrow(/closing quote/);
    expect(() => spreadsheetCells(`${"x".repeat(129)}\t2`)).toThrow(/128/);
    expect(() => spreadsheetCells("1\t".repeat(20_000))).toThrow(/20,000/);
  });
  it("plans expansion without mutating data and rejects formula-column overwrites", () => {
    expect(validateSpreadsheetPaste(table, [["1", "2", "3"], ["4"]], 1, 0)).toEqual({ rows: 3, columns: 3 });
    expect(table.rows).toHaveLength(1);
    expect(table.extraColumns).toBeUndefined();
    expect(() => validateSpreadsheetPaste({ ...table, yFormula: "x^2" }, [["1", "2"]], 0, 0)).toThrow(/formula column 2/);
    expect(() => validateSpreadsheetPaste(table, [["1"]], MAX_TABLE_ROWS, 0)).toThrow(/5000/);
  });
});

describe("table keyboard navigation", () => {
  it("wraps Tab across editable columns and supports reverse navigation", () => {
    expect(nextTableCell(0, 0, 2, [0, 2], "Tab")).toEqual({ row: 0, column: 2 });
    expect(nextTableCell(0, 2, 2, [0, 2], "Tab")).toEqual({ row: 1, column: 0 });
    expect(nextTableCell(1, 0, 2, [0, 2], "Tab", true)).toEqual({ row: 0, column: 2 });
    expect(nextTableCell(0, 0, 2, [0, 2], "Tab", true)).toBeUndefined();
  });
  it("moves vertically or requests a new row, without wrapping horizontal arrows", () => {
    expect(nextTableCell(1, 0, 2, [0, 2], "Enter")).toEqual({ row: 2, column: 0 });
    expect(nextTableCell(1, 2, 2, [0, 2], "Enter", true)).toEqual({ row: 0, column: 2 });
    expect(nextTableCell(0, 0, 2, [0, 2], "ArrowUp")).toBeUndefined();
    expect(nextTableCell(0, 2, 2, [0, 2], "ArrowRight")).toBeUndefined();
    expect(nextTableCell(0, 1, 2, [0, 2], "Tab")).toBeUndefined();
  });
});

describe("workspace resizing", () => {
  it("leaves room for the graph and respects desktop width limits", () => {
    expect(workspaceWidth(330, 1440)).toBe(330);
    expect(workspaceWidth(900, 1440)).toBe(800);
    expect(workspaceWidth(100, 1440)).toBe(280);
    expect(workspaceWidth(800, 810)).toBe(444);
    expect(workspaceWidth(800, 600)).toBe(444);
    expect(workspaceWidth(444.4, 1440)).toBe(444);
  });
});
