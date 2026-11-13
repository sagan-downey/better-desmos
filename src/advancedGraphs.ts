import type { Complex } from "./complex";

export const ADVANCED_GRAPH_NAMES=["domaincolor","mandelbrot","julia","transform","trajectory"];
export const RESULT_COMMAND_NAMES=["simplify","differentiate","factor","matrix","matmul","inverse","det"];

export function commandArguments(source:string,name:string):string[]|undefined {
  const match=new RegExp(`^\\s*${name}\\s*\\(([\\s\\S]*)\\)\\s*$`,"i").exec(source);
  if(!match)return undefined;
  const parts:string[]=[];let depth=0,start=0;
  for(let i=0;i<match[1]!.length;i++){
    const c=match[1]![i]!;
    if("([{".includes(c))depth++;
    if(")]}".includes(c))depth--;
    if(depth<0)throw new Error(`Unbalanced ${name} arguments.`);
    if(c===","&&depth===0){parts.push(match[1]!.slice(start,i).trim());start=i+1;}
  }
  parts.push(match[1]!.slice(start).trim());
  if(depth||parts.some(p=>!p))throw new Error(`Missing or unbalanced ${name} arguments.`);
  return parts;
}

export function domainColor(value:Complex):[number,number,number] {
  const magnitude=Math.hypot(value.re,value.im);
  if(!Number.isFinite(magnitude))throw new Error("Complex result is nonfinite.");
  if(magnitude===0)return [0,0,0];
  return [(Math.atan2(value.im,value.re)*180/Math.PI+360)%360,0.8,0.35+0.65*(1-1/(1+magnitude))];
}

export function fractalColor(x:number,y:number,iterations:number,c?:Complex):[number,number,number] {
  let re=c?x:0,im=c?y:0;
  const cr=c?.re??x,ci=c?.im??y;
  for(let n=0;n<iterations;n++){
    const next=re*re-im*im+cr;
    im=2*re*im+ci;re=next;
    if(re*re+im*im>4)return [360*n/iterations,0.85,0.95];
  }
  return [0,0,0];
}

export type Matrix2=[number,number,number,number];
export function multiplyMatrices(a:Matrix2,b:Matrix2):Matrix2 {
  return [a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3]];
}
export function inverseMatrix(a:Matrix2):Matrix2 {
  const det=a[0]*a[3]-a[1]*a[2];
  if(!Number.isFinite(det)||det===0)throw new Error("Matrix is singular or its determinant is nonfinite.");
  const result:Matrix2=[a[3]/det,-a[1]/det,-a[2]/det,a[0]/det];
  if(!result.every(Number.isFinite))throw new Error("Matrix inverse is nonfinite.");
  return result;
}
