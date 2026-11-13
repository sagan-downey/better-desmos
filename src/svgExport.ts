import { lineDash, type LineStyle, type PointStyle } from "./graphAppearance";
import type { GraphExpression } from "./math";
import { traceContour } from "./regionTrace";

export const xml=(s:string):string=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
export interface SVGView {
  width:number;height:number;
  sx:(x:number)=>number;sy:(y:number)=>number;
  wx:(x:number)=>number;wy:(y:number)=>number;
  color:(h:number,s:number,v:number)=>string;
}
export interface SVGAppearance {
  color:string;opacity?:number;lineWidth?:number;lineStyle?:LineStyle;pointStyle?:PointStyle;pointSize?:number;
  colorAt?:(x:number,y:number)=>string;
}
export function graphSVG(graph:GraphExpression,view:SVGView,style:SVGAppearance):{markup:string;gaps:number}{
  const {width,height,sx,sy,wx,wy}=view,parts:string[]=[];
  let gaps=0;
  const color=(x:number,y:number)=>xml(style.colorAt?.(x,y)??style.color);
  const stroke=style.lineWidth??2,dash=lineDash(style.lineStyle,stroke).join(" ");
  const segment=(x1:number,y1:number,x2:number,y2:number,c:string)=>{
    if(![x1,y1,x2,y2].every(Number.isFinite))return;
    parts.push(`<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${c}" stroke-width="${stroke}" stroke-dasharray="${dash}"/>`);
  };
  const point=(x:number,y:number)=>{
    const px=sx(x),py=sy(y),r=style.pointSize??4,c=color(x,y);
    if(![px,py].every(Number.isFinite)){gaps++;return;}
    if(style.pointStyle==="cross"){
      segment(px-r,py-r,px+r,py+r,c);segment(px-r,py+r,px+r,py-r,c);
    }else parts.push(`<circle cx="${px}" cy="${py}" r="${r}" fill="${style.pointStyle==="open"?"none":c}" stroke="${c}"/>`);
  };
  if(graph.kind==="collection"){
    for(const member of graph.graphs){const result=graphSVG(member,view,style);parts.push(result.markup);gaps+=result.gaps;}
  }else if(graph.kind==="point"){point(...graph.evaluate());}
  else if(graph.kind==="list"){graph.evaluate().forEach((value,i)=>{if(value!==undefined)point(i+1,value);});}
  else if(graph.kind==="polygon"){
    const vertices=graph.evaluate();
    const projected=vertices.flatMap(([x,y],index)=>{
      const next=vertices[(index+1)%vertices.length]!;
      return Array.from({length:64},(_,i)=>[sx(x+(next[0]-x)*i/64),sy(y+(next[1]-y)*i/64)]);
    });
    if(projected.some(p=>!p.every(Number.isFinite)))throw new Error("SVG polygons crossing a logarithmic axis domain are unsupported; use PNG.");
    if(style.colorAt)throw new Error("SVG spatially colored polygon fills are unsupported; use PNG.");
    parts.push(`<polygon points="${projected.map(p=>p.join(",")).join(" ")}" fill="${xml(style.color)}" fill-opacity="0.16" stroke="${xml(style.color)}" stroke-width="${stroke}" stroke-dasharray="${dash}"/>`);
  }else if(graph.kind==="vectorfield"){
    const step=Math.max(40,Math.ceil(Math.sqrt(width*height/1600)));
    for(let py=step/2;py<height;py+=step)for(let px=step/2;px<width;px+=step){
      try{
        const x=wx(px),y=wy(py),[u,v]=graph.evaluate(x,y);
        const dx=u/(wx(px+0.5)-wx(px-0.5)),dy=v/(wy(py+0.5)-wy(py-0.5)),m=Math.hypot(dx,dy),c=color(x,y);
        if(!Number.isFinite(m))throw new Error("Nonfinite direction.");
        if(!m){point(x,y);continue;}
        const nx=dx/m,ny=dy/m,r=step*0.3,tx=px+nx*r,ty=py+ny*r;
        segment(px-nx*r,py-ny*r,tx,ty,c);
        if(graph.arrows){segment(tx-6*nx+4*ny,ty-6*ny-4*nx,tx,ty,c);segment(tx,ty,tx-6*nx-4*ny,ty-6*ny+4*nx,c);}
      }catch{gaps++;}
    }
  }else if(graph.kind==="implicit"){
    const contour=traceContour((px,py)=>{
      try{
        const v=graph.evaluate(wx(px),wy(py));
        return typeof v==="number"?v:v.toNumber();
      }catch{gaps++;return NaN;}
    },[0,width,0,height],160);
    gaps+=contour.gaps;
    for(const points of contour.paths){
      if(!style.colorAt){
        parts.push(`<path d="${points.map((p,i)=>`${i?"L":"M"}${p.x} ${p.y}`).join(" ")}" fill="none" stroke="${xml(style.color)}" stroke-width="${stroke}" stroke-dasharray="${dash}"/>`);
      }else for(let i=1;i<points.length;i++){
          const a=points[i-1]!,b=points[i]!;
          segment(a.x,a.y,b.x,b.y,color(wx(b.x),wy(b.y)));
        }
    }
    if(contour.limited)throw new Error("SVG contour branch limit exceeded; use PNG or a smaller viewport.");
  }else if(graph.kind==="plane"||graph.kind==="inequality"){
    const step=Math.max(3,Math.ceil(Math.sqrt(width*height/16000)));
    for(let py=0;py<height;py+=step)for(let px=0;px<width;px+=step){
      const x=wx(px+step/2),y=wy(py+step/2);
      try{
        if(graph.kind==="plane"){
          const [h,s,v]=graph.evaluate(x,y);
          parts.push(`<rect x="${px}" y="${py}" width="${step}" height="${step}" fill="${view.color(h,s,v)}"/>`);
        }else{
          const a=graph.evaluate(x,y),v=typeof a==="number"?a:a.toNumber();
          const inside=graph.relation==="<"?v<0:graph.relation==="<="?v<=0:graph.relation===">"?v>0:v>=0;
          if(inside)parts.push(`<rect x="${px}" y="${py}" width="${step}" height="${step}" fill="${color(x,y)}" fill-opacity="0.2"/>`);
        }
      }catch{gaps++;}
    }
    if(graph.kind==="inequality"){
      const contour=graphSVG({kind:"implicit",evaluate:graph.evaluate},view,{...style,opacity:1});
      parts.push(contour.markup);gaps+=contour.gaps;
    }
  }else{
    const count=Math.min(4096,Math.max(800,Math.ceil(width*2)));
    let previous:{px:number;py:number;region?:string}|undefined;
    const path:string[]=[];
    for(let i=0;i<=count;i++){
      try{
        const t=graph.kind==="parametric"?graph.start+(graph.end-graph.start)*i/count:
          graph.kind==="sideways"?wy(height*(1-i/count)):wx(width*i/count);
        let x:number,y:number;
        if(graph.kind==="parametric")[x,y]=graph.evaluate(t);
        else{
          const evaluated=graph.evaluate(t),v=typeof evaluated==="number"?evaluated:evaluated.value.toNumber();
          [x,y]=graph.kind==="sideways"?[v,t]:[t,v];
        }
        const px=sx(x),py=sy(y),region=graph.region?.(t);
        if(![px,py].every(Number.isFinite)||Math.abs(px)>width*100||Math.abs(py)>height*100)throw new Error("Offscreen or undefined sample.");
        const connected=previous&&region===previous.region&&Math.hypot(px-previous.px,py-previous.py)<height;
        if(style.colorAt){
          if(connected)segment(previous!.px,previous!.py,px,py,color(x,y));
        }else path.push(`${connected?"L":"M"}${px} ${py}`);
        previous={px,py,region};
      }catch{previous=undefined;gaps++;}
    }
    if(path.length)parts.push(`<path d="${path.join(" ")}" fill="none" stroke="${xml(style.color)}" stroke-width="${stroke}" stroke-dasharray="${dash}"/>`);
  }
  return {markup:`<g opacity="${style.opacity??1}">${parts.join("")}</g>`,gaps};
}

export function svgDocument(view:Pick<SVGView,"width"|"height">,background:string,body:string):string{
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" viewBox="0 0 ${view.width} ${view.height}"><title>Better Desmos graph</title><desc>Numerically sampled editable graph. Plane images and shaded regions are sampled cells.</desc><defs><clipPath id="viewport"><rect width="${view.width}" height="${view.height}"/></clipPath></defs><rect width="100%" height="100%" fill="${xml(background)}"/><g clip-path="url(#viewport)">${body}</g></svg>`;
}
