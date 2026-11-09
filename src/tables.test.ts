import { describe, expect, it } from "vitest";
import { compileExpression, compileCollectionGraph, expandUserFunctions } from "./math";
import { tableColumns, tableColumnName, tableRowSource, validateTableColumnName, evaluateTableColumn, type FormulaTable } from "./tables";

describe("formula table columns", () => {
  const table: FormulaTable = {
    id: 2, rows: [{ id: 1, x: "0", y: "f(0)" }, { id: 2, x: "2", y: "" }, { id: 3, x: "", y: "" }],
    yFormula: "f(x_2)",
  };
  it("assigns stable unique defaults and normalizes custom column names", () => {
    expect(tableColumnName(table, "x")).toBe("x_2");
    expect(tableColumnName({ ...table, xColumn: " U_data " }, "x")).toBe("u_data");
    for (const name of ["u", "x_1", "y_data"]) expect(() => validateTableColumnName(name)).not.toThrow();
    for (const name of ["x", "y", "t", "e", "pi", "hello", "u-v", "f(x)"]) expect(() => validateTableColumnName(name)).toThrow();
  });
  it("skips untouched rows and gives column formulas precedence without changing stored cells", () => {
    const [x, y] = tableColumns(table);
    expect(x!.rows).toEqual([0, 1]);
    expect(y!.sources).toEqual(["f(x_2)", "f(x_2)"]);
    expect(table.rows[0]!.y).toBe("f(0)");
    expect(tableColumns({ ...table, yFormula: "" })[1]!.sources).toEqual(["f(0)", ""]);
  });
  it("supports safe formula cells and rowwise user-defined function columns", () => {
    const [x, y] = tableColumns({ ...table, rows: [...table.rows, { id: 4, x: "3", y: "" }] });
    const evaluate = (source: string) => compileExpression(source)(0).value.toNumber();
    const xValues = evaluateTableColumn(x!, evaluate);
    const yValues = evaluateTableColumn(y!, (source, row) => evaluate(expandUserFunctions(
      tableRowSource(source, x!.target, xValues[row]!),
      [{ name: "f", parameter: "a", body: "a^2+1" }],
    )));
    expect(xValues).toEqual(["(0)", "(2)", "(3)"]);
    expect(yValues).toEqual(["(1)", "(5)", "(10)"]);
    const polygon = compileCollectionGraph("polygon((x_2,y_2))", {}, { x_2: xValues, y_2: yValues });
    expect(polygon?.kind === "polygon" && polygon.evaluate()).toEqual([[0, 1], [2, 5], [3, 10]]);
  });
  it("makes x/y row aliases follow renames while preserving named-point coordinates", () => {
    const aliased = tableColumns({ ...table, xColumn: "u", yColumn: "v", yFormula: "f(x)+p.x+p.y" });
    expect(aliased[1]!.sources[0]).toBe("f(u)+p.x+p.y");
    expect(tableRowSource("u+u[2]+u_1+sin(u)", "u", "(3)")).toBe("(3)+u[2]+u_1+sin((3))");
  });
  it("reports missing cells, domain errors, invalid syntax, and nonfinite results with row context", () => {
    const column = tableColumns({ id: 1, rows: [{ id: 1, x: "", y: "" }, { id: 2, x: "2", y: "" }] })[1]!;
    expect(() => evaluateTableColumn(column, () => 1)).toThrow(/Row 2, y_1/);
    for (const source of ["sqrt(-1)", "1/0", "window.alert(1)"]) {
      const invalid = { ...column, sources: [source] };
      expect(() => evaluateTableColumn(invalid, (text) => compileExpression(text)(0).value.toNumber())).toThrow(/Row 2/);
    }
    expect(() => evaluateTableColumn({ ...column, sources: ["1"] }, () => Infinity)).toThrow(/finite/);
  });
  it("preserves the existing 5000-row table capacity independently of graph list limits", () => {
    const large = { id: 1, rows: Array.from({ length: 5000 }, (_, id) => ({ id: id + 1, x: String(id), y: String(id * 2) })) };
    expect(evaluateTableColumn(tableColumns(large)[0]!, Number)).toHaveLength(5000);
  });
});
