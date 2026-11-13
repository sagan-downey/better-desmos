import { describe,it,expect,afterEach } from "vitest";
import { dataFourier,derivatives,evaluateFourier,findRoots,fourierSeries,integrate,linearBand } from "./analysisTools";
import { compileGraphExpression,compileFastGraphExpression,compileCollectionGraph,freeIdentifiers,resultCommand,setAngleMode } from "./math";

afterEach(()=>setAngleMode("radians"));
describe("bounded numerical analysis",()=>{
  it("integrates smooth curves and crossings accurately and rejects domains",()=>{
    expect(integrate(x=>x*x,0,1)).toBeCloseTo(1/3,9);
    expect(integrate(x=>Math.abs(x),-1,1)).toBeCloseTo(1,9);
    expect(integrate(Math.sin,0,Math.PI)).toBeCloseTo(2,8);
    expect(()=>integrate(x=>1/x,-1,1)).toThrow(/nonfinite/);
    expect(()=>integrate(Math.sqrt,-1,1)).toThrow();
    expect(()=>integrate(x=>x,1,0)).toThrow(/interval/);
    expect(()=>integrate(x=>x,0,10001)).toThrow();
  });
  it("computes five-point derivatives",()=>{
    const d=derivatives(x=>x*x,1);
    expect(d.first).toBeCloseTo(2,8);expect(d.second).toBeCloseTo(2,6);
    expect(derivatives(Math.sin,0.7).first).toBeCloseTo(Math.cos(0.7),8);
  });
  it("reconstructs function Fourier coefficients, DC, signs and periodicity",()=>{
    const series=fourierSeries(x=>3+2*Math.cos(x)-4*Math.sin(2*x),0,2*Math.PI,3);
    expect(series.a[0]!/2).toBeCloseTo(3,10);
    expect(series.a[1]).toBeCloseTo(2,10);expect(series.b[2]).toBeCloseTo(-4,10);
    expect(series.b[1]).toBeCloseTo(0,10);
    for(const x of [-2,0,1.2,10])expect(evaluateFourier(series,x)).toBeCloseTo(3+2*Math.cos(x)-4*Math.sin(2*x),10);
    expect(()=>fourierSeries(Math.sin,0,1,33)).toThrow();
    expect(()=>fourierSeries(()=>Infinity,0,1,1)).toThrow();
  });
  it("reconstructs equally spaced discrete samples below Nyquist",()=>{
    const values=Array.from({length:16},(_,i)=>2+3*Math.cos(2*Math.PI*i/16)+Math.sin(4*Math.PI*i/16));
    const series=dataFourier(values,0.5,3);
    for(let i=0;i<16;i++)expect(evaluateFourier(series,i*0.5)).toBeCloseTo(values[i]!,10);
    expect(()=>dataFourier(values,0,2)).toThrow();
    expect(()=>dataFourier(values,1,8)).toThrow(/Nyquist/);
    expect(()=>dataFourier([1],1,0)).toThrow();
  });
  it("verifies bracketed and even roots, rejects poles, and reports gaps",()=>{
    const roots=findRoots(x=>x*x-1,-2,2).roots;
    expect(roots.map(r=>r.x)).toEqual([-1,1]);
    const tangent=findRoots(x=>(x-0.1234567)**2,-1,1);
    expect(tangent.roots).toHaveLength(1);
    expect(tangent.roots[0]!.x).toBeCloseTo(0.1234567,7);
    expect(tangent.roots[0]!.residual).toBeLessThanOrEqual(1e-8);
    expect(findRoots(x=>1/x,-1,1).roots).toEqual([]);
    expect(findRoots(x=>1/x,-1,1).gaps).toBeGreaterThan(0);
    expect(findRoots(x=>x*x+1,-1,1).roots).toEqual([]);
    expect(()=>findRoots(()=>0,-1,1)).toThrow(/isolated/);
    expect(findRoots(x=>1/x,-1,1).firstError).toContain("nonfinite");
  });
  it("matches a known Student t linear confidence/prediction band",()=>{
    const xs=[1,2,3,4,5],ys=[2,4,5,4,5];
    const confidence=linearBand(xs,ys,0.95,false),prediction=linearBand(xs,ys,0.95,true);
    // SSE=2.4, df=3, x mean=3, t(.975,3)=3.182446305.
    expect(confidence(3).mean).toBeCloseTo(4,10);
    expect(confidence(3).width).toBeCloseTo(3.182446305*Math.sqrt(0.8/5),6);
    expect(prediction(3).width).toBeCloseTo(3.182446305*Math.sqrt(0.8*1.2),6);
    expect(confidence(10).width).toBeGreaterThan(confidence(3).width);
    expect(()=>linearBand([1,1,1],[1,2,3],0.95,false)).toThrow(/vary/);
    expect(()=>linearBand(xs,ys,1,false)).toThrow(/level/);
    expect(()=>linearBand([1,2],[1,2],0.95,false)).toThrow();
  });
});

describe("analysis graph and result commands",()=>{
  for(const compile of [compileGraphExpression,compileFastGraphExpression]){
    it(`compiles fields, approximations, geometry and bands in ${compile.name}`,()=>{
      const heat=compile("heatmap(x+y,0,2)");
      if(heat.kind!=="plane")throw new Error("Expected plane");
      expect(heat.evaluate(0,0)[0]).toBe(240);expect(heat.evaluate(1,1)[0]).toBe(0);
      expect(heat.evaluate(5,5)[0]).toBe(0);
      const contours=compile("contours(x+y,0,2,3)");
      if(contours.kind!=="collection")throw new Error("Expected contours");
      expect(contours.graphs).toHaveLength(3);
      contours.graphs.forEach((g,i)=>{if(g.kind!=="implicit")throw new Error("Expected level");expect(g.evaluate(i,0)).toBe(0);});
      const polynomial=compile("taylor(x^3+2*x,1,3)");
      if(polynomial.kind!=="explicit")throw new Error("Expected Taylor");
      expect(polynomial.evaluate(2)).toBeCloseTo(12,10);
      const error=compile("taylorerror(sin(x),0,5)");
      if(error.kind!=="explicit")throw new Error("Expected error");
      expect(error.evaluate(0.5)).toBeCloseTo(Math.abs(Math.sin(0.5)-(0.5-0.5**3/6+0.5**5/120)),10);
      const tangent=compile("tangentline(x^2,1)");
      if(tangent.kind!=="explicit")throw new Error("Expected tangent");
      expect(tangent.evaluate(2)).toBeCloseTo(3,7);
      const normal=compile("normalline(x^2,0)");
      if(normal.kind!=="sideways")throw new Error("Expected vertical normal");
      expect(normal.evaluate(3)).toBe(0);
      const area=compile("areabetween(x,x^2,0,1)");
      if(area.kind!=="inequality")throw new Error("Expected shaded area");
      expect(area.evaluate(0.5,0.3)).toBeLessThan(0);
      expect(area.evaluate(-1,0)).toBeGreaterThan(0);
      expect(compile("confidenceband([1,2,3],[1,2,4],0.95)").kind).toBe("collection");
      expect(compile("predictionband([1,2,3],[1,2,4],0.95)").kind).toBe("collection");
    });
  }
  it("uses named lists/table columns and slider values without broadcasting commands",()=>{
    const graph=compileCollectionGraph("fourierdata(y_1,a,1)",{a:0.5},{y_1:["0","1","0","-1"]});
    if(graph?.kind!=="explicit")throw new Error("Expected data curve");
    expect(graph.evaluate(0.5)).toBeCloseTo(1,10);
    const bars=compileCollectionGraph("errorbars(x_1,y_1,[0.2,0.4])",{}, {x_1:["1","2"],y_1:["3","4"]});
    if(bars?.kind!=="collection")throw new Error("Expected error bars");
    expect(bars.graphs).toHaveLength(8);
    const vertical=bars.graphs[1]!;
    if(vertical.kind!=="parametric")throw new Error("Expected bar");
    expect(vertical.evaluate(0)).toEqual([1,2.8]);expect(vertical.evaluate(1)).toEqual([1,3.2]);
    expect(resultCommand("spectrum(y_1,1)",{}, {y_1:["0","1","0","-1"]})).toContain("amplitude 1");
    expect(freeIdentifiers("confidenceband(x_1,y_1,a)")).toEqual(["x_1","y_1","a"]);
  });
  it("reports measured values and bounded root limitations",()=>{
    expect(Number(resultCommand("arclength(2*x,0,1)"))).toBeCloseTo(Math.sqrt(5),8);
    expect(Number(resultCommand("arclength(x^2,0,1)"))).toBeCloseTo(Math.sqrt(5)/2+Math.asinh(2)/4,7);
    expect(Number(resultCommand("curvature(x^2,0)"))).toBeCloseTo(2,6);
    expect(Number(resultCommand("area(x,x^2,0,1)"))).toBeCloseTo(1/6,8);
    expect(resultCommand("roots(x^2-1,-2,2)")).toContain("x=-1");
    expect(resultCommand("roots(1/x,-1,1)")).toContain("undefined samples");
    expect(resultCommand("roots(x^2+1,-1,1)")).toContain("No verified roots");
  });
  it("respects degree-mode derivatives and rejects unsupported or invalid inputs",()=>{
    setAngleMode("degrees");
    const graph=compileGraphExpression("taylor(sin(x),0,1)");
    if(graph.kind!=="explicit")throw new Error("Expected Taylor");
    expect(graph.evaluate(1)).toBeCloseTo(Math.PI/180,10);
    for(const text of ["heatmap(x,1,0)","contours(x,0,1,21)","fourier(x,0,1,33)","taylor(abs(x),0,2)","taylor(x,0,9)",
      "errorbars([1],[2],[-1])","errorbars([1,2],[2],[0.1])","confidenceband([1,1,1],[1,2,3],0.95)"])
      expect(()=>compileGraphExpression(text)).toThrow();
    for(const text of ["area(x,0,1)","curvature(x)","spectrum([1],1)","arclength(sqrt(x),-1,1)"])
      expect(()=>resultCommand(text)).toThrow();
  });
});
