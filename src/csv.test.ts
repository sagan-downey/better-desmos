import { describe,it,expect } from "vitest";
import { parseCSV,csvNumericCell,encodeCSV } from "./csv";

describe("CSV tables",()=>{
  it("round trips quoting, commas, CRLF, and empty values",()=>{
    const rows=[["x_1","a\"b"],["1",""],["2","3,4"],["5","multi\nline"]];
    expect(parseCSV(encodeCSV(rows))).toEqual(rows);
    expect(parseCSV("\uFEFFx,y\r\n1,2\r\n")).toEqual([["x","y"],["1","2"]]);
  });
  it("validates malformed and unbounded input",()=>{
    for(const text of ['"x,y\n1,2','x,y\n1,2,3','x,"a"b\n1,2',"1\n2",Array(21).fill("a").join(",")])
      expect(()=>parseCSV(text)).toThrow();
    expect(()=>parseCSV("a".repeat(2_000_001))).toThrow("2 MB");
  });
  it("accepts finite numeric literals without executing formulas",()=>{
    expect(csvNumericCell("1e-3")).toBe("0.001");
    expect(csvNumericCell("1.234567890123456789")).toBe("1.234567890123456789");
    expect(csvNumericCell("")).toBe("");
    for(const value of ["=1+2","sin(2)","Infinity","1e9999","<script>"])
      expect(()=>csvNumericCell(value)).toThrow("finite");
  });
});
