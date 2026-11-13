import { describe,it,expect } from "vitest";
import { graphSVG,svgDocument,xml,type SVGView } from "./svgExport";
import { compileGraphExpression,hsvToHex } from "./math";

const view:SVGView={width:200,height:200,sx:x=>100+x*20,sy:y=>100-y*20,wx:x=>(x-100)/20,wy:y=>(100-y)/20,color:hsvToHex};
describe("editable SVG export",()=>{
  it("emits vector paths and shapes, not a screenshot",()=>{
    const curve=graphSVG(compileGraphExpression("sin(x)"),view,{color:"#ff0000",lineStyle:"dashed"});
    expect(curve.markup).toContain("<path");
    expect(curve.markup).toContain('stroke-dasharray="6 4"');
    expect(curve.markup).not.toContain("<image");
    const polygon=graphSVG(compileGraphExpression("polygon((0,0),(1,0),(0,1))"),view,{color:"#ff0000"});
    expect(polygon.markup).toContain("<polygon");
    const point=graphSVG(compileGraphExpression("(1,2)"),view,{color:"#ff0000",pointStyle:"open"});
    expect(point.markup).toContain('cx="120" cy="60"');
    expect(point.markup).toContain('fill="none"');
  });
  it("exports fields, complex images, and contours",()=>{
    for(const source of ["vectorfield(-y,x)","domaincolor(z)","x^2+y^2=1","y<x"]){
      const result=graphSVG(compileGraphExpression(source),view,{color:"#ff0000"});
      expect(result.markup.length).toBeGreaterThan(100);
      expect(result.markup).not.toContain("Infinity");
    }
  });
  it("escapes XML content and clips to the viewport",()=>{
    expect(xml('<a x="&">')).toBe("&lt;a x=&quot;&amp;&quot;&gt;");
    const doc=svgDocument(view,"#000",'<path d="M0 0L1 1"/>');
    expect(doc).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(doc).toContain('clip-path="url(#viewport)"');
  });
  for(const source of ["heatmap(x+y,0,10)","contours(x^2+y^2,1,4,3)","fourier(sin(x),0,2*pi,2)",
    "taylor(x^2,0,2)","areabetween(x,x^2,0,1)","errorbars([1,2],[2,3],[0.2,0.3])",
    "confidenceband([1,2,3],[1,2,4],0.95)","predictionband([1,2,3],[1,2,4],0.95)"])
    it(`exports ${source} as editable finite SVG`,()=>{
      const result=graphSVG(compileGraphExpression(source),view,{color:"#ff0000"});
      expect(result.markup).toMatch(/<(?:path|rect|circle)/);
      expect(result.markup).not.toMatch(/Infinity|NaN|<image/);
      expect(result.gaps).toBe(0);
    });
});
