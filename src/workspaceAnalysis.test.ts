import { describe,it,expect } from "vitest";
import { EXAMPLES,inspectDependencies } from "./workspaceAnalysis";
import { compileGraphExpression,freeIdentifiers,resultCommand } from "./math";

describe("dependency inspection and example gallery",()=>{
  it("tracks direct/transitive sliders, functions and table columns",()=>{
    const reports=inspectDependencies([
      {id:"a",label:"a",defines:"a",references:[]},
      {id:"f",label:"f",defines:"f",references:["a"]},
      {id:"table",label:"y_1",defines:"y_1",references:["f"]},
      {id:"plot",label:"plot",references:["y_1"]},
    ],["a"]);
    expect(reports[3]!.direct).toEqual(["y_1"]);
    expect(reports[3]!.indirect).toEqual(["a","f"]);
    expect(reports[3]!.unresolved).toEqual([]);
  });
  it("reports circular/recursive paths and unresolved names without hanging",()=>{
    const reports=inspectDependencies([
      {id:"a",label:"a",defines:"a",references:["b"]},
      {id:"b",label:"b",defines:"b",references:["a","q"]},
    ],[]);
    expect(reports[0]!.cycles).toEqual([["a","b","a"]]);
    expect(reports[0]!.unresolved).toEqual(["q"]);
  });
  it("handles shared DAGs, duplicate providers and empty projects",()=>{
    expect(inspectDependencies([],[])).toEqual([]);
    const result=inspectDependencies([
      {id:"1",label:"first f",defines:"f",references:["a"]},
      {id:"2",label:"second f",defines:"f",references:["b"]},
      {id:"3",label:"plot",references:["f"]},
    ],["a","b"]);
    expect(result[2]!.indirect).toEqual(["a","b"]);
  });
  it("offers unique example identifiers",()=>{
    expect(new Set(EXAMPLES.map(e=>e.id)).size).toBe(EXAMPLES.length);
  });
  for(const example of EXAMPLES)it(`compiles self-contained ${example.id} example without definitions or playback`,()=>{
    for(const source of example.expressions){
      expect(source).not.toMatch(/tone|^\s*[a-z]\s*=/i);
      expect(freeIdentifiers(source).filter(n=>!["x","y","z","i"].includes(n))).toEqual([]);
      const result=resultCommand(source);
      if(result===undefined)expect(compileGraphExpression(source)).toBeDefined();
    }
  });
});
