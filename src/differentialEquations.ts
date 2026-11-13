export interface SolutionSample {
  x: number;
  y: number;
  slope: number;
}

export function solveDifferentialEquation(
  slope: (x: number, y: number) => number,
  x0: number, y0: number, start: number, end: number,
): SolutionSample[] {
  if (![x0,y0,start,end].every(Number.isFinite) || !(start < end) || x0 < start || x0 > end)
    throw new Error("ODE requires finite values with start <= x0 <= end and start < end.");
  if (end-start > 10000) throw new Error("ODE interval must be no wider than 10000.");
  const evaluate = (x: number, y: number): number => {
    if (!Number.isFinite(y)) throw new Error("ODE solution became nonfinite.");
    const value = slope(x,y);
    if (!Number.isFinite(value)) throw new Error("ODE slope must be finite throughout the interval.");
    return value;
  };
  const rk4 = (x: number, y: number, h: number): number => {
    const a=evaluate(x,y), b=evaluate(x+h/2,y+h*a/2);
    const c=evaluate(x+h/2,y+h*b/2), d=evaluate(x+h,y+h*c);
    return y+h*(a+2*b+2*c+d)/6;
  };
  const initial={x:x0,y:y0,slope:evaluate(x0,y0)};
  let attempts=0;
  const integrate = (target: number): SolutionSample[] => {
    const points:SolutionSample[]=[];
    const direction=Math.sign(target-x0), maxStep=(end-start)/128;
    let x=x0,y=y0,h=direction*maxStep;
    while (direction*(target-x)>0) {
      if (++attempts>8192) throw new Error("ODE exceeded 8192 integration steps; shorten the interval or use a less stiff equation.");
      h=direction*Math.min(Math.abs(h),Math.abs(target-x));
      if (x+h===x) throw new Error("ODE step became too small; the solution may be singular or stiff.");
      const full=rk4(x,y,h), half=rk4(x+h/2,rk4(x,y,h/2),h/2);
      const error=Math.abs(half-full)/15, tolerance=1e-9*(1+Math.max(Math.abs(y),Math.abs(half)));
      if (!Number.isFinite(error)) throw new Error("ODE solution became nonfinite.");
      if (error<=tolerance) {
        x=Math.abs(target-(x+h))<=Math.abs(h)*1e-12?target:x+h;
        y=half+(half-full)/15;
        points.push({x,y,slope:evaluate(x,y)});
      }
      const factor=error===0?2:Math.min(2,Math.max(0.1,0.9*(tolerance/error)**0.2));
      h=direction*Math.min(maxStep,Math.abs(h)*factor);
    }
    return points;
  };
  return [...integrate(start).reverse(),initial,...integrate(end)];
}

export function interpolateSolution(samples: SolutionSample[], x: number): number {
  if (!Number.isFinite(x) || x<samples[0]!.x || x>samples.at(-1)!.x)
    throw new Error("Requested x lies outside the ODE solution interval.");
  let lo=0,hi=samples.length-1;
  while (hi-lo>1) {
    const mid=(lo+hi)>>1;
    if (samples[mid]!.x>x) hi=mid; else lo=mid;
  }

  const a=samples[lo]!,b=samples[hi]!;
  if (x===a.x) return a.y;
  if (x===b.x) return b.y;
  const h=b.x-a.x,t=(x-a.x)/h;
  return (2*t**3-3*t**2+1)*a.y+(t**3-2*t**2+t)*h*a.slope+
    (-2*t**3+3*t**2)*b.y+(t**3-t**2)*h*b.slope;
}

export function solveTrajectory(
    field:(x:number,y:number)=>[number,number],
    x0:number,y0:number,start:number,end:number,
  ):{x:SolutionSample[];y:SolutionSample[]} {
    if(![x0,y0,start,end].every(Number.isFinite)||start>0||end<0||start>=end||end-start>10000)
      throw new Error("Trajectory requires finite values, start <= 0 <= end, start < end, and an interval at most 10000 wide.");
    const evaluate=(x:number,y:number):[number,number]=>{
      const result=field(x,y);
      if(![x,y,...result].every(Number.isFinite))throw new Error("Trajectory or vector field became nonfinite.");
      return result;
    };
    const rk4=(p:[number,number],h:number):[number,number]=>{
      const a=evaluate(...p),b=evaluate(p[0]+h*a[0]/2,p[1]+h*a[1]/2);
      const c=evaluate(p[0]+h*b[0]/2,p[1]+h*b[1]/2),d=evaluate(p[0]+h*c[0],p[1]+h*c[1]);
      return [p[0]+h*(a[0]+2*b[0]+2*c[0]+d[0])/6,p[1]+h*(a[1]+2*b[1]+2*c[1]+d[1])/6];
    };
    const initial=evaluate(x0,y0),xs:SolutionSample[]=[{x:0,y:x0,slope:initial[0]}],ys:SolutionSample[]=[{x:0,y:y0,slope:initial[1]}];
    let attempts=0;
    for(const target of [start,end]){
      const direction=Math.sign(target),maxStep=(end-start)/128;
      let t=0,p:[number,number]=[x0,y0],h=direction*maxStep;
      const xx:SolutionSample[]=[],yy:SolutionSample[]=[];
      while(direction*(target-t)>0){
        if(++attempts>8192)throw new Error("Trajectory exceeded 8192 steps; shorten the interval.");
        h=direction*Math.min(Math.abs(h),Math.abs(target-t));
        if(t+h===t)throw new Error("Trajectory step became too small; the system may be singular or stiff.");
        const full=rk4(p,h),half=rk4(rk4(p,h/2),h/2);
        const ratio=Math.max(...half.map((v,i)=>Math.abs(v-full[i]!)/15/(1e-9*(1+Math.max(Math.abs(p[i]!),Math.abs(v))))));
        if(!Number.isFinite(ratio))throw new Error("Trajectory became nonfinite.");
        if(ratio<=1){
          t=Math.abs(target-(t+h))<=Math.abs(h)*1e-12?target:t+h;
          p=[half[0]+(half[0]-full[0])/15,half[1]+(half[1]-full[1])/15];
          const slope=evaluate(...p);
          xx.push({x:t,y:p[0],slope:slope[0]});yy.push({x:t,y:p[1],slope:slope[1]});
        }
        h=direction*Math.min(maxStep,Math.abs(h)*(ratio===0?2:Math.min(2,Math.max(0.1,0.9*ratio**-0.2))));
      }
      if(direction<0){xs.unshift(...xx.reverse());ys.unshift(...yy.reverse());}
      else {xs.push(...xx);ys.push(...yy);}
    }
    return {x:xs,y:ys};
}
