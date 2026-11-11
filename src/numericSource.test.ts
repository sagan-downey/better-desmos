import { describe,expect,it } from "vitest";
import { numericSource } from "./numericSource";
import { compileExpression } from "./math";
describe("generated numeric expression sources",()=>{
  it.each([1e-12,-3e-20,1e30,Number.MIN_VALUE,1.25,0])("round trips %s without treating an exponent as Euler's constant",(value)=>{
    expect(compileExpression(numericSource(value))(0).value.toNumber()).toBe(value);
  });
  it("rejects nonfinite generated values",()=>expect(()=>numericSource(Infinity)).toThrow());
});
