import { tableColumnFormula, type FormulaTable, type TableAxis } from "./tables";

export const MAX_TABLE_ROWS = 5000;

export function spreadsheetCells(text: string): string[][] | undefined {
  if (!/[\t\r\n]/.test(text)) return undefined;
  if (text.length > 2_580_000) throw new Error("Paste is too large; paste at most 20,000 cells at a time.");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  const normalized = text.replace(/\r\n?/g, "\n");
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (quoted) {
      if (char === '"') {
        if (normalized[index + 1] === '"') { cell += '"'; index += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
    } else if (char === "\t" || char === "\n") {
      row.push(cell);
      cell = "";
      closedQuote = false;
      if (char === "\n") { rows.push(row); row = []; }
    } else if (closedQuote) {
      throw new Error("Invalid spreadsheet paste: text follows a closing quote.");
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new Error("Invalid spreadsheet paste: missing closing quote.");
  if (cell || row.length || !normalized.endsWith("\n")) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.reduce((count, entry) => count + entry.length, 0) > 20_000) {
    throw new Error("Paste at most 20,000 cells at a time.");
  }
  if (rows.some((entry) => entry.some((value) => value.length > 128))) {
    throw new Error("Each pasted cell must contain at most 128 characters.");
  }
  return rows;
}

export function tableAxisAt(column: number): TableAxis {
  return column === 0 ? "x" : column === 1 ? "y" : column - 2;
}

export function validateSpreadsheetPaste(
  table: FormulaTable, cells: string[][], startRow: number, startColumn: number,
): { rows: number; columns: number } {
  const rows = Math.max(table.rows.length, startRow + cells.length);
  const columns = Math.max(2 + (table.extraColumns?.length ?? 0), startColumn + Math.max(0, ...cells.map((row) => row.length)));
  if (rows > MAX_TABLE_ROWS) throw new Error(`Tables are limited to ${MAX_TABLE_ROWS} rows.`);
  for (const row of cells) {
    for (let index = 0; index < row.length; index += 1) {
      const column = startColumn + index;
      if (tableColumnFormula(table, tableAxisAt(column))) {
        throw new Error(`Cannot paste into formula column ${column + 1}. Clear its column formula first.`);
      }
    }
  }
  return { rows, columns };
}

export function nextTableCell(
  row: number, column: number, rowCount: number, editableColumns: number[],
  key: string, backwards = false,
): { row: number; column: number } | undefined {
  const position = editableColumns.indexOf(column);
  if (position < 0) return undefined;
  if (key === "Tab" || key === "ArrowLeft" || key === "ArrowRight") {
    const previous = key === "ArrowLeft" || (key === "Tab" && backwards);
    const next = position + (previous ? -1 : 1);
    if (next >= 0 && next < editableColumns.length) return { row, column: editableColumns[next]! };
    if (key !== "Tab") return undefined;
    const nextRow = row + (previous ? -1 : 1);
    if (nextRow < 0 || nextRow > rowCount) return undefined;
    return { row: nextRow, column: editableColumns[previous ? editableColumns.length - 1 : 0]! };
  }
  const nextRow = row + (key === "ArrowUp" || (key === "Enter" && backwards) ? -1 : 1);
  return nextRow < 0 || nextRow > rowCount ? undefined : { row: nextRow, column };
}
