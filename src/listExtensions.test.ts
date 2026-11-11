import { describe, expect, it } from "vitest";
import { expandCollections } from "./collections";
import { compileExpression, compileCollectionGraph } from "./math";
const evaluate=(source:string)=>compileExpression(source)(0).value.toNumber();
const values=(source:string,lists:Record<string,string[]>={})=>expandCollections(source,evaluate,lists).items.map(evaluate);
describe("list extensions",()=>{
  it("filters by parallel lists and arithmetic conditions",()=>{
    const lists={l:["1","2","3","4"],m:["4","3","2","1"]};
    expect(values("l[m<3]",lists)).toEqual([3,4]);
    expect(values("l[2<=l<4]",lists)).toEqual([2,3]);
    expect(values("l[l+m=5]",lists)).toEqual([1,2,3,4]);
    expect(values("l[l>2 and m<2]",lists)).toEqual([4]);
    expect(values("l[m<3]",{...lists,m:["1","4"]})).toEqual([1]);
    expect(()=>values("l[1<2]",lists)).toThrow(/list-valued/);
  });
  it("sorts by stable parallel keys",()=>{
    expect(values("sort([10,20,30],[3,1,2])")).toEqual([20,30,10]);
    expect(values("sort([10,20,30],[1,1])")).toEqual([10,20]);
    expect(()=>values("sort([1,2],3)")).toThrow();
  });
  it("computes distances and midpoint graphs",()=>{
    expect(values("distance((0,0),(3,4))")).toEqual([5]);
    expect(values("distance(([0,1],[0,0]),(3,4))")).toEqual([5,Math.sqrt(20)]);
    const graph=compileCollectionGraph("midpoint((0,0),(2,4))",{});
    expect(graph?.kind).toBe("point");
    if(graph?.kind==="point")expect(graph.evaluate()).toEqual([1,2]);
  });
  it("supports point arithmetic and coordinate projections with list broadcasting",()=>{
    for(const [source,expected]of [
      ["(1,2)+(3,4)",[4,6]],
      ["2*(1,2)-(3,4)/2",[0.5,2]],
      ["-(1,2)",[-1,-2]],
    ]as const){
      const graph=compileCollectionGraph(source,{});
      expect(graph?.kind==="point"&&graph.evaluate()).toEqual(expected);
    }
    expect(values("[(1,2),(3,4)].x")).toEqual([1,3]);
    expect(values("(2*[(1,2),(3,4)]).y")).toEqual([4,8]);
    expect(()=>compileCollectionGraph("(1,2)*(3,4)",{})).toThrow(/Points support/);
  });
});
