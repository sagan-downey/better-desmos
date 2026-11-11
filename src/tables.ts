import { numericSource } from "./numericSource";

export interface FormulaTable {
  id: number;
  rows: Array<{ id: number; x: string; y: string; extra?: string[] }>;
  xColumn?: string;
  yColumn?: string;
  xFormula?: string;
  yFormula?: string;
  extraColumns?: Array<{ id: number; name?: string; formula?: string }>;
}

export type TableAxis = "x" | "y" | number;
export interface TableColumn {
  table: FormulaTable;
  axis: TableAxis;
  target: string;
  sources: string[];
  rows: number[];
}

export function tableColumnName(table: FormulaTable, axis: TableAxis): string {
  if (typeof axis === "number") {
    const column = table.extraColumns![axis]!;
    return column.name?.trim().toLowerCase() || `c_t${table.id}c${column.id}`;
  }
  return (axis === "x" ? table.xColumn : table.yColumn)?.trim().toLowerCase() || `${axis}_${table.id}`;
}

export function tableColumnFormula(table: FormulaTable, axis: TableAxis): string {
  return (typeof axis === "number" ? table.extraColumns?.[axis]?.formula
    : axis === "x" ? table.xFormula : table.yFormula)?.trim() || "";
}

export function tableCell(table: FormulaTable, row: number, axis: TableAxis): string {
  return typeof axis === "number" ? table.rows[row]!.extra?.[axis] ?? "" : table.rows[row]![axis];
}

export function tableColumns(table: FormulaTable): TableColumn[] {
  const activeRows = table.rows.flatMap((row, index) =>
    row.x.trim() || row.y.trim() || row.extra?.some((cell) => cell.trim()) ? [index] : []);
  return (["x", "y", ...(table.extraColumns ?? []).map((_, index) => index)] as TableAxis[]).map((axis) => {
    const formula = tableColumnFormula(table, axis);
    const rows = typeof axis === "number" && !formula
      ? activeRows.filter((index) => tableCell(table, index, axis).trim()) : activeRows;
    return {
      table, axis, rows, target: tableColumnName(table, axis),
      sources: rows.map((index) => (formula || tableCell(table, index, axis).trim())
        .replace(/[a-z]+(?:_[a-z0-9]+)?(?:\.[xy])?/gi, (token) =>
          token.toLowerCase() === "x" || token.toLowerCase() === "y"
            ? tableColumnName(table, token.toLowerCase() === "x" ? "x" : "y") : token)),
    };
  });
}

export function tableRowSource(source: string, columnName: string, value: string): string {
  return source.replace(/[a-z]+(?:_[a-z0-9]+)?/gi, (token, offset: number) =>
    token.toLowerCase() === columnName && !/^\s*\[/.test(source.slice(offset + token.length))
      ? value : token);
}

export function validateTableColumnName(name: string): void {
  if (!/^[a-z](?:_[a-z0-9]+)?$/.test(name) || ["x", "y", "t", "e", "pi"].includes(name)) {
    throw new Error("Column names must be a letter or subscripted name such as u, x_1, or y_data; x, y, t, e, and pi are reserved.");
  }
}

export function evaluateTableColumn(
  column: TableColumn,
  evaluate: (source: string, rowIndex: number) => number,
): string[] {
  return column.sources.map((source, index) => {
    const row = column.rows[index]!;
    try {
      if (!source) throw new Error("Enter a value or a column formula.");
      const value = evaluate(source, index);
      if (!Number.isFinite(value)) throw new Error("The result must be a finite number.");
      return `(${numericSource(value)})`;
    } catch (reason) {
      throw new Error(`Row ${row + 1}, ${column.target}: ${reason instanceof Error ? reason.message : "Could not evaluate cell."}`);
    }
  });
}
