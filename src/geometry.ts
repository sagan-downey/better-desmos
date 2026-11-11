import { splitCollectionParts } from "./collections";
import { numericSource } from "./numericSource";

export type PointSources = [string, string];

export function pointSources(source: string): PointSources | undefined {
  const text = source.trim();
  if (!text.startsWith("(") || !text.endsWith(")")) return undefined;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") depth -= 1;
    if (depth === 0 && index < text.length - 1) return undefined;
  }
  const coordinates = splitCollectionParts(text.slice(1, -1));
  if (coordinates.length === 1) return pointSources(coordinates[0]!);
  if (coordinates.length !== 2) return undefined;
  if (coordinates.some((coordinate) => !coordinate)) throw new Error("Points need two coordinates.");
  return [coordinates[0]!, coordinates[1]!];
}

export function expandPointOperations(source:string):string{
  const rewrite=(text:string,depth=0):string=>{
    if(depth>128)throw new Error("Point arithmetic may nest at most 128 levels.");
    text=text.trim();
    const point=pointSources(text);
    if(point)return`(${rewrite(point[0],depth+1)},${rewrite(point[1],depth+1)})`;
    if(/^\(.*\)$/s.test(text)){
      let nesting=0,enclosed=true;
      for(let index=0;index<text.length;index++){
        if(text[index]==="(")nesting++;else if(text[index]===")")nesting--;
        if(nesting===0&&index<text.length-1){enclosed=false;break;}
      }
      if(enclosed)return`(${rewrite(text.slice(1,-1),depth+1)})`;
    }
    const projection=/^(.*)\.([xy])$/i.exec(text);
    if(projection){
      const coordinates=pointSources(rewrite(projection[1]!,depth+1));
      if(!coordinates)throw new Error("Coordinate projection requires a point.");
      return `(${coordinates[projection[2]!.toLowerCase()==="x"?0:1]})`;
    }
    for(const operators of ["+-","*/","^"]){
      let nesting=0;
      for(let index=text.length-1;index>=0;index--){
        const char=text[index]!;
        if(")]}".includes(char))nesting++;
        else if("([{".includes(char))nesting--;
        if(nesting||!operators.includes(char)||index===0)continue;
        const prefix=text.slice(0,index).trimEnd();
        if(/[+\-*/^,(]$/.test(prefix)||/[0-9.]e$/i.test(prefix))continue;
        const left=rewrite(prefix,depth+1),right=rewrite(text.slice(index+1),depth+1);
        const a=pointSources(left),b=pointSources(right);
        if(!a&&!b)return text;
        if((char==="+"||char==="-")&&a&&b)return`((${a[0]})${char}(${b[0]}),(${a[1]})${char}(${b[1]}))`;
        if(char==="*"&&Boolean(a)!==Boolean(b)){
          const coordinates=a??b!,scalar=a?right:left;
          return`((${coordinates[0]})*(${scalar}),(${coordinates[1]})*(${scalar}))`;
        }
        if(char==="/"&&a&&!b)return`((${a[0]})/(${right}),(${a[1]})/(${right}))`;
        throw new Error("Points support addition/subtraction with points and multiplication/division by scalars.");
      }
    }
    if(text.startsWith("-")||text.startsWith("+")){
      const coordinates=pointSources(rewrite(text.slice(1),depth+1));
      if(coordinates)return`(${text[0]}(${coordinates[0]}),${text[0]}(${coordinates[1]}))`;
    }
    return text;
  };
  return rewrite(source);
}

export function polygonVertexSources(source:string):string[]|undefined{
  const match=/^\s*polygon\s*\((.*)\)\s*$/is.exec(source);
  if(!match)return undefined;
  let vertices=splitCollectionParts(match[1]!);
  if(vertices.length===1&&vertices[0]!.startsWith("[")&&vertices[0]!.endsWith("]")){
    vertices=splitCollectionParts(vertices[0]!.slice(1,-1));
  }
  return vertices.length>=3&&vertices.every((vertex)=>pointSources(vertex))?vertices:undefined;
}

export function replacePolygonVertex(source:string,index:number,x:number,y:number):string{
  const vertices=polygonVertexSources(source);
  if(!vertices||!Number.isInteger(index)||index<0||index>=vertices.length||!Number.isFinite(x)||!Number.isFinite(y))throw new Error("Cannot edit this polygon vertex directly.");
  vertices[index]=`(${numericSource(Number(x.toPrecision(12)))},${numericSource(Number(y.toPrecision(12)))})`;
  return`polygon(${vertices.join(",")})`;
}

export function expandNamedPoints(source: string, points: Record<string, PointSources>): string {
  const bound = new Set([...source.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/gi)].map((match) => match[1]!.toLowerCase()));
  const expanded = source.replace(/[a-z]+(?:_[a-z0-9]+)?(?:\.[xy])?/gi, (token) => {
    const [name, coordinate] = token.toLowerCase().split(".");
    if (bound.has(name!) || !Object.hasOwn(points, name!)) return token;
    const point = points[name!]!;
    return coordinate ? `(${point[coordinate === "x" ? 0 : 1]})` : `(${point[0]},${point[1]})`;
  });
  if (expanded.length > 4096) throw new Error("Expanded point expression is too long.");
  return expanded;
}

export function dynamicLabel(source: string, evaluate: (source: string) => number): string {
  return source.replace(/\$\{([^{}]+)\}/g, (_, expression: string) => {
    const value = evaluate(expression);
    if (!Number.isFinite(value)) throw new Error("Label values must be finite.");
    return Number(value.toPrecision(10)).toString();
  });
}
