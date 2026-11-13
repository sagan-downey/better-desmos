import type { Node } from "./math";
import { finite } from "./analysisTools";

type Dimensions=[number,number,number,number,number,number,number];
interface Quantity {value:number;dimensions:Dimensions}
const mapDimensions=(fn:(index:number)=>number):Dimensions=>[fn(0),fn(1),fn(2),fn(3),fn(4),fn(5),fn(6)];
const base=(index:number):Dimensions=>mapDimensions(i=>i===index?1:0);
const none:Dimensions=[0,0,0,0,0,0,0];
const quantity=(value:number,dimensions:Dimensions=none):Quantity=>({value,dimensions});
export const UNITS:Record<string,Quantity>={
  m:quantity(1,base(0)),cm:quantity(0.01,base(0)),mm:quantity(0.001,base(0)),km:quantity(1000,base(0)),
  kg:quantity(1,base(1)),g:quantity(0.001,base(1)),
  s:quantity(1,base(2)),ms:quantity(0.001,base(2)),min:quantity(60,base(2)),h:quantity(3600,base(2)),
  a:quantity(1,base(3)),k:quantity(1,base(4)),mol:quantity(1,base(5)),cd:quantity(1,base(6)),
  hz:quantity(1,[0,0,-1,0,0,0,0]),n:quantity(1,[1,1,-2,0,0,0,0]),
  j:quantity(1,[2,1,-2,0,0,0,0]),w:quantity(1,[2,1,-3,0,0,0,0]),
  pa:quantity(1,[-1,1,-2,0,0,0,0]),c:quantity(1,[0,0,1,1,0,0,0]),
  v:quantity(1,[2,1,-3,-1,0,0,0]),ohm:quantity(1,[2,1,-3,-2,0,0,0]),
  rad:quantity(1),deg:quantity(Math.PI/180),
};
const same=(a:Dimensions,b:Dimensions)=>a.every((v,i)=>Math.abs(v-b[i]!)<1e-12);
const dimensional=(a:Quantity)=>!same(a.dimensions,none);
const combine=(a:Dimensions,b:Dimensions,sign:number):Dimensions=>mapDimensions(i=>a[i]!+sign*b[i]!);
export function evaluateUnits(tree:Node,scalars:Record<string,number>={}):Quantity{
  const visit=(node:Node):Quantity=>{
    if(node.type==="number")return quantity(Number(node.value.numerator)/Number(node.value.denominator));
    if(node.type==="constant")return quantity(node.value==="pi"?Math.PI:Math.E);
    if(node.type==="variable"){
      if(UNITS[node.name])return UNITS[node.name]!;
      if(Object.hasOwn(scalars,node.name))return quantity(finite(scalars[node.name]!));
      throw new Error(`Unknown unit or scalar "${node.name}". Use explicit SI units; uppercase names are normalized to lowercase.`);
    }
    if(node.type==="unary"){const q=visit(node.operand);return {...q,value:node.operator==="-"?-q.value:q.value};}
    if(node.type==="binary"){
      const a=visit(node.left),b=visit(node.right);
      if(node.operator==="+"||node.operator==="-"){
        if(!same(a.dimensions,b.dimensions))throw new Error("Unit mismatch: addition/subtraction requires matching dimensions.");
        return {...a,value:finite(a.value+(node.operator==="+"?b.value:-b.value))};
      }
      if(node.operator==="*")return quantity(finite(a.value*b.value),combine(a.dimensions,b.dimensions,1));
      if(node.operator==="/")return quantity(finite(a.value/b.value),combine(a.dimensions,b.dimensions,-1));
      if(dimensional(b)||Math.abs(b.value)>16)throw new Error("Unit exponents must be dimensionless and within -16 to 16.");
      return quantity(finite(a.value**b.value),mapDimensions(i=>a.dimensions[i]!*b.value));
    }
    if(node.type==="call"||(node.type==="multicall"&&node.args.length===1)){
      const q=visit(node.type==="call"?node.argument:node.args[0]!);
      if(node.name==="sqrt")return quantity(finite(Math.sqrt(q.value)),mapDimensions(i=>q.dimensions[i]!/2));
      if(node.name==="abs")return {...q,value:Math.abs(q.value)};
      if(dimensional(q))throw new Error(`${node.name} requires a dimensionless argument (rad/deg are dimensionless angle units).`);
      const fn:Record<string,(x:number)=>number>={sin:Math.sin,cos:Math.cos,tan:Math.tan,exp:Math.exp,ln:Math.log,log:Math.log10};
      if(fn[node.name])return quantity(finite(fn[node.name]!(q.value)));
    }
    throw new Error("Unsupported unit expression. Use arithmetic, powers, sqrt/abs, or dimensionless sin/cos/tan/exp/ln/log.");
  };
  const result=visit(tree);finite(result.value);return result;
}
export function unitResult(q:Quantity):string{
  const names=["m","kg","s","A","K","mol","cd"];
  const units=q.dimensions.flatMap((v,i)=>v?`${names[i]}${v===1?"":`^${v}`}`:[]).join("*");
  return `${Number(q.value.toPrecision(12))} ${units||"(dimensionless)"}`;
}
export function convertUnits(value:number,from:Quantity,to:Quantity):number{
  if(!same(from.dimensions,to.dimensions))throw new Error("Cannot convert between different physical dimensions.");
  if(from.value<=0||to.value<=0)throw new Error("Conversion units must have positive scales.");
  return finite(value*from.value/to.value);
}
