import { describe,it,expect } from "vitest";
import { compileExpression,freeIdentifiers,resultCommand } from "./math";

describe("explicit SI unit commands",()=>{
  it("adds compatible units, derives dimensions and converts composite units",()=>{
    expect(resultCommand("unitcheck(3*m+2*cm)")).toBe("3.02 m");
    expect(resultCommand("unitcheck(N)")).toBe("1 m*kg*s^-2");
    expect(resultCommand("unitcheck(J/s)")).toBe("1 m^2*kg*s^-3");
    expect(resultCommand("unitcheck(sqrt(4*m^2))")).toBe("2 m");
    expect(resultCommand("convert(72,km/h,m/s)")).toBe("20 m/s");
    expect(resultCommand("convert(180,deg,rad)")).toBe("3.14159265359 rad");
    expect(resultCommand("convert(1,A*s,C)")).toBe("1 C");
  });
  it("supports dimensionless scalars and radian unit trigonometry",()=>{
    expect(resultCommand("unitcheck(b*m)",{b:2})).toBe("2 m");
    expect(resultCommand("unitcheck(sin(90*deg))")).toBe("1 (dimensionless)");
    expect(resultCommand("unitcheck(m)",{m:99})).toBe("1 m");
    expect(compileExpression("m+1",{m:99})(0).value.toNumber()).toBe(100);
    expect(freeIdentifiers("unitcheck(b*m+A)")).toEqual(["b"]);
    expect(freeIdentifiers("convert(a,m,cm)")).toEqual(["a"]);
    expect(resultCommand("convert(a,m,cm)",{a:2})).toBe("200 cm");
  });
  it("rejects mismatches, unknown units, unsupported functions and nonfinite values",()=>{
    for(const source of ["unitcheck(m+s)","convert(1,m,s)","unitcheck(celsius)","unitcheck(sin(m))","unitcheck(m^s)",
      "unitcheck(1/0)","unitcheck(sqrt(-m))","unitcheck(floor(m))","convert(1,-m,m)","unitcheck(m^17)"])
      expect(()=>resultCommand(source)).toThrow();
  });
});
