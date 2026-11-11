export function bracketedRoot(
  evaluate:(x:number)=>number,lower:number,upper:number,iterations=60,
):number|undefined{
  if(!Number.isFinite(lower)||!Number.isFinite(upper)||lower>upper)throw new Error("Root bounds must be finite and increasing.");
  let left=lower,right=upper,a=evaluate(left),b=evaluate(right);
  if(!Number.isFinite(a)||!Number.isFinite(b))return undefined;
  if(a===0)return left;if(b===0)return right;
  if(Math.sign(a)===Math.sign(b))return undefined;
  const tolerance=1e-10*Math.max(1,Math.min(Math.abs(a),Math.abs(b)));
  let best=Math.abs(a)<Math.abs(b)?left:right,residual=Math.min(Math.abs(a),Math.abs(b));
  for(let index=0;index<iterations;index++){
    const middle=left/2+right/2,value=evaluate(middle);
    if(!Number.isFinite(value))return undefined;
    if(Math.abs(value)<residual){best=middle;residual=Math.abs(value);}
    if(value===0)return middle;
    if(Math.sign(value)===Math.sign(a)){left=middle;a=value;}else{right=middle;b=value;}
    if(middle===left&&right-left<=Number.EPSILON*Math.max(1,Math.abs(middle)))break;
  }
  return residual<=tolerance?best:undefined;
}

export function bracketedExtremum(
  evaluate:(x:number)=>number,lower:number,upper:number,maximum=false,
):{x:number;y:number}{
  if(!Number.isFinite(lower)||!Number.isFinite(upper)||lower>=upper)throw new Error("Extremum bounds must be finite and increasing.");
  const ratio=(Math.sqrt(5)-1)/2,sign=maximum?-1:1;
  let a=lower,b=upper,c=b-ratio*(b-a),d=a+ratio*(b-a),fc=evaluate(c)*sign,fd=evaluate(d)*sign;
  for(let index=0;index<60;index++){
    if(!Number.isFinite(fc)||!Number.isFinite(fd))throw new Error("Extremum is undefined inside its bracket.");
    if(fc<fd){b=d;d=c;fd=fc;c=b-ratio*(b-a);fc=evaluate(c)*sign;}
    else{a=c;c=d;fc=fd;d=a+ratio*(b-a);fd=evaluate(d)*sign;}
  }
  const x=a/2+b/2,y=evaluate(x);
  if(!Number.isFinite(y))throw new Error("Extremum is undefined.");
  return{x,y};
}

export function polygonSignedDistance(vertices:[number,number][],x:number,y:number):number{
  let inside=false,distance=Infinity;
  for(let index=0;index<vertices.length;index++){
    const a=vertices[index]!,b=vertices[(index+1)%vertices.length]!;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length)):0;
    distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
  }
  return inside?-distance:distance;
}

export function segmentCrossings(first:number[],second:number[],width:number,height:number):{points:[number,number][];limited:boolean}{
    const bins=new Map<string,number[]>(),size=64;
    const cells=(segments:number[],index:number):string[]=>{
      const x0=segments[index]!,y0=segments[index+1]!,x1=segments[index+2]!,y1=segments[index+3]!;
      if(![x0,y0,x1,y1].every(Number.isFinite))return[];
      const minX=Math.max(0,Math.floor(Math.min(x0,x1)/size)),maxX=Math.min(Math.ceil(width/size),Math.floor(Math.max(x0,x1)/size));
      const minY=Math.max(0,Math.floor(Math.min(y0,y1)/size)),maxY=Math.min(Math.ceil(height/size),Math.floor(Math.max(y0,y1)/size));
      const result:string[]=[];
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)result.push(`${x}:${y}`);
      return result;
    };
    for(let index=0;index+3<second.length;index+=4)for(const cell of cells(second,index)){
      const entries=bins.get(cell)??[];entries.push(index);bins.set(cell,entries);
    }
    const points:[number,number][]=[];
    let comparisons=0;
    for(let index=0;index+3<first.length;index+=4){
      const nearby=new Set(cells(first,index).flatMap((cell)=>bins.get(cell)??[]));
      for(const other of nearby){
        if(++comparisons>250000||points.length>=256)return{points,limited:true};
        const ax=first[index]!,ay=first[index+1]!,dx=first[index+2]!-ax,dy=first[index+3]!-ay;
        const bx=second[other]!,by=second[other+1]!,ex=second[other+2]!-bx,ey=second[other+3]!-by;
        const determinant=dx*ey-dy*ex;
        if(determinant===0)continue;
        const t=((bx-ax)*ey-(by-ay)*ex)/determinant,u=((bx-ax)*dy-(by-ay)*dx)/determinant;
        if(t<0||t>1||u<0||u>1)continue;
        const x=ax+t*dx,y=ay+t*dy;
        if(x<0||x>width||y<0||y>height)continue;
        if(!points.some((point)=>Math.hypot(point[0]-x,point[1]-y)<0.25))points.push([x,y]);
      }
    }
    return{points,limited:false};
  }
