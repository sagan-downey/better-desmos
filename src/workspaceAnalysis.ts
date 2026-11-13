export interface DependencyNode {id:string;label:string;defines?:string;references:string[]}
export interface DependencyReport {
  node:DependencyNode;direct:string[];indirect:string[];cycles:string[][];unresolved:string[];
}

export function inspectDependencies(nodes:DependencyNode[],scalars:string[]):DependencyReport[]{
  const providers=new Map<string,DependencyNode[]>();
  for(const node of nodes)if(node.defines)providers.set(node.defines,[...providers.get(node.defines)??[],node]);
  return nodes.map(node=>{
    const direct=new Set<string>(),indirect=new Set<string>(),unresolved=new Set<string>(),cycles:string[][]=[];
    const visited=new Set<string>();let work=0;
    const visit=(current:DependencyNode,path:DependencyNode[])=>{
      if(path.some(n=>n.id===current.id)){
        const start=path.findIndex(n=>n.id===current.id),cycle=[...path.slice(start).map(n=>n.label),current.label];
        if(!cycles.some(c=>c.join("\0")===cycle.join("\0")))cycles.push(cycle);
        return;
      }
      if(path.length>128||++work>10000)throw new Error("Dependency inspection exceeded its depth/work limit.");
      if(visited.has(current.id))return;
      visited.add(current.id);
      for(const reference of current.references){
        if(current.id===node.id)direct.add(reference);else indirect.add(reference);
        const targets=providers.get(reference);
        if(targets)for(const target of targets)visit(target,[...path,current]);
        else if(!scalars.includes(reference))unresolved.add(reference);
      }
    };
    visit(node,[]);
    for(const name of direct)indirect.delete(name);
    return {node,direct:[...direct].sort(),indirect:[...indirect].sort(),cycles,unresolved:[...unresolved].sort()};
  });
}

export interface Example {
  id:string;title:string;description:string;expressions:string[];
}
export const EXAMPLES:Example[]=[
  {id:"heatmap",title:"Potential energy",description:"Real heatmap with level curves. Blue is low potential; red is high.",expressions:["contours(x^2+2*y^2,1,9,5)","heatmap(x^2+2*y^2,0,10)"]},
  {id:"fourier",title:"Fourier reconstruction",description:"A square-like signal and its first eight harmonics. Expect ringing near jumps.",expressions:["sign(sin(x))","fourier(sign(sin(x)),0,2*pi,8)"]},
  {id:"taylor",title:"Taylor approximation",description:"Sine, its fifth-order approximation at zero, and absolute error.",expressions:["sin(x)","taylor(sin(x),0,5)","taylorerror(sin(x),0,5)"]},
  {id:"geometry",title:"Geometry measurements",description:"Tangent/normal lines, arc length, curvature, and a shaded area.",expressions:["x^2","tangentline(x^2,1)","normalline(x^2,1)","arclength(x^2,0,1)","curvature(x^2,0)","area(x^2,x,0,1)","areabetween(x^2,x,0,1)"]},
  {id:"pendulum",title:"Pendulum phase portrait",description:"Angle versus angular velocity for a nondamped pendulum. Use radians for the intended physical model.",expressions:["vectorfield(y,-sin(x))","trajectory(y,-sin(x),1,0,-6,6)"]},
  {id:"predator-prey",title:"Predator–prey model",description:"Positive population dynamics and an example trajectory.",expressions:["vectorfield(x*(1-y),y*(x-1))","trajectory(x*(1-y),y*(x-1),1.5,1,0,10)"]},
  {id:"uncertainty",title:"Data uncertainty",description:"Error bars plus a pointwise 95% linear-regression mean confidence band.",expressions:["errorbars([1,2,3,4,5],[1.8,4.1,5.7,8.2,10.1],[0.3,0.4,0.3,0.5,0.4])","confidenceband([1,2,3,4,5],[1.8,4.1,5.7,8.2,10.1],0.95)"]},
  {id:"complex",title:"Complex roots and poles",description:"Domain coloring of a rational complex function. Hue is phase; zero magnitude is black.",expressions:["domaincolor((z^2-1)/(z^2+1))"]},
  {id:"fractals",title:"Mandelbrot set",description:"100-iteration escape-time image. Black is not a proof of set membership.",expressions:["mandelbrot(100)"]},
  {id:"units-roots",title:"Units and root search",description:"Compatible-unit conversion, dimensional arithmetic, and residual-checked roots.",expressions:["unitcheck(3*m+20*cm)","convert(72,km/h,m/s)","roots(x^3-x,-2,2)"]},
];
