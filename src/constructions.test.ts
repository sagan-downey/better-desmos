import { afterEach,describe,expect,it } from "vitest";
import { compileFastGraphExpression,compileGraphExpression,freeIdentifiers,resultCommand,setAngleMode } from "./math";
import { graphSVG,type SVGView } from "./svgExport";

afterEach(()=>setAngleMode("radians"));
describe("geometry, complex grids and Riemann sums",()=>{
  for(const compile of [compileGraphExpression,compileFastGraphExpression]){
    it(`draws point-based segments and circles in ${compile.name}`,()=>{
      const line=compile("segment((1,2),(4,6))");
      if(line.kind!=="parametric")throw new Error("Expected segment");
      expect(line.evaluate(0)).toEqual([1,2]);expect(line.evaluate(1)).toEqual([4,6]);
      const circle=compile("circle((1,2),(4,6))");
      if(circle.kind!=="parametric")throw new Error("Expected circle");
      expect(circle.evaluate(0)).toEqual([6,2]);
      expect(circle.evaluate(Math.PI/2)[0]).toBeCloseTo(1);
      expect(circle.evaluate(Math.PI/2)[1]).toBeCloseTo(7);
      expect(()=>compile("circle((1,2),(1,2))")).toThrow(/distinct/);
      expect(()=>compile("segment((0,0),2)")).toThrow(/points/);
    });
    it(`maps a grid through z squared in ${compile.name}`,()=>{
      const grid=compile("complexgrid(z^2,2,1)");
      if(grid.kind!=="collection")throw new Error("Expected grid");
      expect(grid.graphs).toHaveLength(10);
      const line=grid.graphs[0]!;
      if(line.kind!=="parametric")throw new Error("Expected grid line");
      expect(line.evaluate(1)).toEqual([3,-4]);
      expect(()=>compile("complexgrid(z,2,0)")).toThrow();
      expect(()=>compile("complexgrid(z,20,1)")).toThrow();
      expect(freeIdentifiers("complexgrid(z^2+a,2,1)")).toEqual(["a"]);
    });
    it(`computes left, right and midpoint signed sums in ${compile.name}`,()=>{
      for(const [method,sum] of [["left",5],["right",14],["midpoint",8.75]] as const){
        const graph=compile(`riemann(x^2,0,3,3,${method})`);
        if(graph.kind!=="collection")throw new Error("Expected rectangles");
        expect(graph.graphs).toHaveLength(3);
        expect(graph.summary).toContain(String(sum));
        const first=graph.graphs[0]!;
        if(first.kind!=="polygon")throw new Error("Expected rectangle");
        expect(first.evaluate()[0]).toEqual([0,0]);
      }
      const negative=compile("riemann(-1,0,2,2,left)");
      if(negative.kind!=="collection")throw new Error("Expected rectangles");
      expect(negative.summary).toContain("-2");
      for(const input of ["riemann(x,0,1,0,left)","riemann(x,0,1,101,left)","riemann(x,1,0,2,left)","riemann(x,0,1,2,bad)","riemann(1/x,-1,1,1,midpoint)"])
        expect(()=>compile(input)).toThrow();
      expect(freeIdentifiers("riemann(a*x,0,b,n,midpoint)")).toEqual(["a","x","b","n"]);
    });
  }
  it("measures unsigned angles in radians and degrees and rejects degeneracy",()=>{
    expect(Number(resultCommand("pointangle((1,0),(0,0),(0,1))")!.split(" ")[0])).toBeCloseTo(Math.PI/2,10);
    setAngleMode("degrees");
    expect(resultCommand("pointangle((1,0),(0,0),(0,1))")).toBe("90 degrees");
    expect(()=>resultCommand("pointangle((0,0),(0,0),(1,0))")).toThrow(/distinct/);
  });
  it("exports the new graph types as finite SVG",()=>{
    const view:SVGView={width:100,height:100,sx:x=>50+x*10,sy:y=>50-y*10,wx:x=>(x-50)/10,wy:y=>(50-y)/10,color:()=>"#ff0000"};
    for(const source of ["segment((0,0),(1,2))","circle((0,0),(1,0))","complexgrid(z,1,1)","riemann(x,0,1,4,midpoint)"]){
      const svg=graphSVG(compileGraphExpression(source),view,{color:"#ff0000"});
      expect(svg.markup).toMatch(/<(path|polygon)/);expect(svg.markup).not.toMatch(/NaN|Infinity/);
    }
  });
});
