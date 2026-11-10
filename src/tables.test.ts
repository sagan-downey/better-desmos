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
  it("adds stable, valid extra-column names and compact lists for nonblank cells", () => {
    const expanded: FormulaTable = { id: 2, rows: [
      { id: 1, x: "1", y: "2", extra: ["3", ""] },
      { id: 2, x: "2", y: "4", extra: ["", "8"] },
      { id: 3, x: "", y: "" },
    ], extraColumns: [{ id: 1 }, { id: 12 }] };
    const columns = tableColumns(expanded);
    expect(columns.map(({ target }) => target)).toEqual(["x_2", "y_2", "c_t2c1", "c_t2c12"]);
    expect(columns[2]!.rows).toEqual([0]);
    expect(columns[3]!.rows).toEqual([1]);
    expect(evaluateTableColumn(columns[2]!, Number)).toEqual(["(3)"]);
    for (const column of columns) expect(() => validateTableColumnName(column.target)).not.toThrow();
    expect(tableColumnName({ ...expanded, id: 21 }, 0)).not.toBe(tableColumnName(expanded, 0));
    expect(tableColumnName({ ...expanded, extraColumns: [{ id: 12 }, { id: 1 }] }, 0)).toBe("c_t2c12");
    expect(tableColumnName({ ...expanded, extraColumns: [{ id: 1, name: " W_data " }] }, 0)).toBe("w_data");
  });
  it("evaluates extra formulas with both row aliases and preserves stored manual cells", () => {
    const expanded: FormulaTable = { id: 2, xColumn: "u", yColumn: "v", rows: [
      { id: 1, x: "1", y: "2", extra: ["99", "x+y", ""] },
      { id: 2, x: "3", y: "4", extra: ["", "", "x*y"] },
      { id: 3, x: "", y: "", extra: ["", "", ""] },
    ], extraColumns: [{ id: 1, formula: "x^2+y" }, { id: 2 }, { id: 3 }] };
    const columns = tableColumns(expanded);
    const evaluate = (source: string) => compileExpression(source)(0).value.toNumber();
    const x = evaluateTableColumn(columns[0]!, evaluate);
    const y = evaluateTableColumn(columns[1]!, evaluate);
    const calculate = (column: typeof columns[number]) => evaluateTableColumn(column, (source, index) => {
      const row = column.rows[index]!;
      return evaluate(tableRowSource(tableRowSource(source, "u", x[row]!), "v", y[row]!));
    });
    expect(columns[2]!.sources).toEqual(["u^2+v", "u^2+v"]);
    expect(calculate(columns[2]!)).toEqual(["(3)", "(13)"]);
    expect(calculate(columns[3]!)).toEqual(["(3)"]);
    expect(calculate(columns[4]!)).toEqual(["(12)"]);
    expect(expanded.rows[0]!.extra![0]).toBe("99");
    expect(tableColumns({ ...expanded, extraColumns: [{ id: 1 }] })[2]!.sources).toEqual(["99"]);
  });
  it("ignores blank extra cells but reports invalid nonblank extra input", () => {
    const expanded: FormulaTable = { id: 1, rows: [
      { id: 1, x: "1", y: "2" }, { id: 2, x: "2", y: "3", extra: ["sqrt(-1)"] },
    ], extraColumns: [{ id: 1 }] };
    const column = tableColumns(expanded)[2]!;
    expect(column.rows).toEqual([1]);
    expect(() => evaluateTableColumn(column, (text) => compileExpression(text)(0).value.toNumber()))
      .toThrow(/Row 2, c_t1c1/);
    expect(tableColumns({ ...expanded, rows: [{ id: 1, x: "", y: "" }] })[2]!.rows).toEqual([]);
    expect(tableColumns({ ...expanded, rows: [{ id: 1, x: "", y: "", extra: ["1"] }] })[0]!.sources).toEqual([""]);
  });

});
