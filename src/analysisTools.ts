import { bracketedRoot, bracketedExtremum } from "./graphAnalysis";
import { probabilityKernel } from "./probability";

export const ANALYSIS_GRAPH_NAMES=["heatmap","contours","fourier","fourierdata","taylor","taylorerror","tangentline","normalline","errorbars","confidenceband","predictionband","areabetween"];
export const ANALYSIS_RESULT_NAMES=["spectrum","arclength","curvature","area","roots","unitcheck","convert"];

export function finite(value:number):number {
  if(!Number.isFinite(value))throw new Error("Analysis encountered a nonfinite value.");
  return value;
}
export function interval(a:number,b:number):void{
  if(![a,b].every(Number.isFinite)||a>=b||b-a>10000)
    throw new Error("Analysis interval must be finite, increasing, and at most 10000 units wide.");
}

export function integrate(evaluate:(x:number)=>number,a:number,b:number):number{
  interval(a,b);let work=0;
  const f=(x:number)=>{if(++work>20000)throw new Error("Numerical integral exceeded 20000 evaluations.");return finite(evaluate(x));};
  const simpson=(a:number,b:number,fa:number,fm:number,fb:number)=>(b-a)*(fa+4*fm+fb)/6;
  const fa=f(a),fb=f(b),m=a/2+b/2,fm=f(m),initial=simpson(a,b,fa,fm,fb);
  const recurse=(a:number,b:number,fa:number,fm:number,fb:number,whole:number,tolerance:number,depth:number):number=>{
    const m=a/2+b/2,l=a/2+m/2,r=m/2+b/2,fl=f(l),fr=f(r);
    const left=simpson(a,m,fa,fl,fm),right=simpson(m,b,fm,fr,fb),delta=left+right-whole;
    if(Math.abs(delta)<=15*tolerance)return left+right+delta/15;
    if(depth===0||l===a||r===b)throw new Error("Numerical integral did not converge; shorten the interval or avoid singularities.");
    return recurse(a,m,fa,fl,fm,left,tolerance/2,depth-1)+recurse(m,b,fm,fr,fb,right,tolerance/2,depth-1);
  };
  // Initial panels reduce aliasing of oscillatory functions; the estimate is still numerical.
  let result=0;
  for(let i=0;i<32;i++){
    const lo=a+(b-a)*i/32,hi=a+(b-a)*(i+1)/32,mid=lo/2+hi/2;
    const x=f(lo),y=f(mid),z=f(hi),whole=simpson(lo,hi,x,y,z);
    result+=recurse(lo,hi,x,y,z,whole,1e-8*(1+Math.abs(initial))/32,18);
  }
  return finite(result);
}

export function derivatives(f:(x:number)=>number,x:number):{first:number;second:number}{
  const h=1e-4*Math.max(1,Math.abs(x));
  const a=finite(f(x-2*h)),b=finite(f(x-h)),c=finite(f(x)),d=finite(f(x+h)),e=finite(f(x+2*h));
  return {first:finite((a-8*b+8*d-e)/(12*h)),second:finite((-a+16*b-30*c+16*d-e)/(12*h*h))};
}

export interface FourierSeries { a:number[];b:number[];start:number;period:number }
export function fourierSeries(f:(x:number)=>number,start:number,end:number,harmonics:number):FourierSeries{
  interval(start,end);
  if(!Number.isInteger(harmonics)||harmonics<0||harmonics>32)throw new Error("Fourier harmonics must be an integer from 0 to 32.");
  const count=1024,period=end-start;
  const values=Array.from({length:count},(_,i)=>finite(f(start+period*i/count)));
  const a:number[]=[],b:number[]=[];
  for(let k=0;k<=harmonics;k++){
    let c=0,s=0;
    for(let i=0;i<count;i++){const angle=2*Math.PI*k*i/count;c+=values[i]!*Math.cos(angle);s+=values[i]!*Math.sin(angle);}
    a.push(finite(2*c/count));b.push(finite(2*s/count));
  }
  return {a,b,start,period};
}
export function evaluateFourier(series:FourierSeries,x:number):number{
  let result=series.a[0]!/2;
  for(let k=1;k<series.a.length;k++){
    const angle=2*Math.PI*k*(x-series.start)/series.period;
    result+=series.a[k]!*Math.cos(angle)+series.b[k]!*Math.sin(angle);
  }
  return finite(result);
}
export function dataFourier(values:number[],spacing:number,harmonics:number):FourierSeries{
  if(values.length<2||values.length>2048||!values.every(Number.isFinite)||!Number.isFinite(spacing)||spacing<=0)
    throw new Error("Fourier data requires 2–2048 finite, equally spaced samples and positive sample spacing.");
  if(!Number.isInteger(harmonics)||harmonics<0||harmonics>Math.min(32,Math.floor((values.length-1)/2)))
    throw new Error("Data harmonics must be 0–32 and below the Nyquist frequency.");
  const a:number[]=[],b:number[]=[];
  for(let k=0;k<=harmonics;k++){
    let c=0,s=0;
    values.forEach((v,i)=>{const angle=2*Math.PI*k*i/values.length;c+=v*Math.cos(angle);s+=v*Math.sin(angle);});
    a.push(finite(2*c/values.length));b.push(finite(2*s/values.length));
  }
  return {a,b,start:0,period:finite(values.length*spacing)};
}

export function findRoots(f:(x:number)=>number,start:number,end:number):{roots:{x:number;residual:number}[];gaps:number;firstError?:string}{
  interval(start,end);
  let gaps=0,firstError:string|undefined;
  const sample=(x:number)=>{
    try{return finite(f(x));}catch(reason){
      gaps++;firstError??=reason instanceof Error?reason.message:"Could not evaluate root sample.";return NaN;
    }
  };
  const roots:{x:number;residual:number}[]=[],count=512;
  const xs=Array.from({length:count+1},(_,i)=>start+(end-start)*i/count),ys=xs.map(sample);
  if(ys.every(y=>y===0))throw new Error("All root-search samples are zero; isolated roots cannot be identified.");
  const accept=(x:number|undefined)=>{
    if(x===undefined)return;
    const residual=Math.abs(sample(x));
    if(residual>1e-8||!Number.isFinite(residual)||roots.some(r=>Math.abs(r.x-x)<1e-7*Math.max(1,Math.abs(x))))return;
    if(roots.length>=128)throw new Error("Root search exceeded 128 roots; shorten the interval.");
    roots.push({x,residual});
  };
  for(let i=0;i<xs.length;i++){
    if(ys[i]===0)accept(xs[i]);
    if(i&&Number.isFinite(ys[i-1])&&Number.isFinite(ys[i])&&Math.sign(ys[i-1]!)!==Math.sign(ys[i]!)){
      accept(bracketedRoot(sample,xs[i-1]!,xs[i]!));
    }
    if(i>0&&i<count&&Math.abs(ys[i]!)<Math.abs(ys[i-1]!)&&Math.abs(ys[i]!)<Math.abs(ys[i+1]!)){
      try{accept(bracketedExtremum(x=>Math.abs(sample(x)),xs[i-1]!,xs[i+1]!).x);}
      catch(reason){if(!(reason instanceof Error)||!reason.message.includes("Extremum is undefined"))throw reason;}
    }
  }
  return {roots:roots.sort((a,b)=>a.x-b.x),gaps,firstError};
}

export function linearBand(xs:number[],ys:number[],level:number,prediction:boolean):(x:number)=>{mean:number;width:number}{
  if(xs.length!==ys.length||xs.length<3||xs.length>2048||!xs.every(Number.isFinite)||!ys.every(Number.isFinite))
    throw new Error("Linear bands require equal-length finite X/Y lists with 3–2048 observations.");
  if(!Number.isFinite(level)||level<=0||level>=1)throw new Error("Confidence level must be between 0 and 1.");
  const n=xs.length,xmean=finite(xs.reduce((a,b)=>a+b,0)/n),ymean=finite(ys.reduce((a,b)=>a+b,0)/n);
  const sxx=xs.reduce((sum,x)=>sum+(x-xmean)**2,0);
  if(!Number.isFinite(sxx)||sxx<=0)throw new Error("Linear band X values must vary.");
  const slope=finite(xs.reduce((sum,x,i)=>sum+(x-xmean)*(ys[i]!-ymean),0)/sxx);
  const variance=finite(ys.reduce((sum,y,i)=>sum+(y-ymean-slope*(xs[i]!-xmean))**2,0)/(n-2));
  const critical=finite(probabilityKernel("tinv",[(1+level)/2,n-2]));
  return x=>({mean:finite(ymean+slope*(x-xmean)),
    width:finite(critical*Math.sqrt(variance*((prediction?1:0)+1/n+(x-xmean)**2/sxx)))});
}
