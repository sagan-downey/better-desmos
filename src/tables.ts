export interface FormulaTable {
  id: number;
  rows: Array<{ id: number; x: string; y: string }>;
  xColumn?: string;
  yColumn?: string;
  xFormula?: string;
  yFormula?: string;
}

export type TableAxis = "x" | "y";
export interface TableColumn {
  table: FormulaTable;
  axis: TableAxis;
  target: string;
  sources: string[];
  rows: number[];
}

export function tableColumnName(table: FormulaTable, axis: TableAxis): string {
  return (axis === "x" ? table.xColumn : table.yColumn)?.trim().toLowerCase() || `${axis}_${table.id}`;
}

export function tableColumns(table: FormulaTable): TableColumn[] {
  const rows = table.rows.flatMap((row, index) => row.x.trim() || row.y.trim() ? [index] : []);
  return (["x", "y"] as const).map((axis) => ({
    table, axis, rows, target: tableColumnName(table, axis),
    sources: rows.map((index) => ((axis === "x" ? table.xFormula : table.yFormula)?.trim() || table.rows[index]![axis].trim())
      .replace(/[a-z]+(?:_[a-z0-9]+)?(?:\.[xy])?/gi, (token) =>
        token.toLowerCase() === "x" || token.toLowerCase() === "y"
          ? tableColumnName(table, token.toLowerCase() === "x" ? "x" : "y") : token)),
  }));
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
      return `(${value})`;
    } catch (reason) {
      throw new Error(`Row ${row + 1}, ${column.target}: ${reason instanceof Error ? reason.message : "Could not evaluate cell."}`);
    }
  });
}
