export type LineStyle = "solid" | "dashed" | "dotted";
export type PointStyle = "filled" | "open" | "cross";

export function lineDash(style: LineStyle = "solid", width = 2): number[] {
  return style === "dashed" ? [6 * Math.max(1, width / 2), 4 * Math.max(1, width / 2)] :
    style === "dotted" ? [width, 3 * width] : [];
}

export function inequalityLineStyle(relation: "<" | "<=" | ">" | ">=", style: LineStyle = "solid"): LineStyle {
  return relation === "<" || relation === ">" ? "dotted" : style;
}

export function connectContourSegments(segments: number[]): number[] {
  type Node = { x:number; y:number; edges:number[] };
  const nodes = new Map<string, Node>();
  const edges: Array<[Node, Node]> = [];
  const node = (x:number,y:number):Node => {
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
    let result = nodes.get(key);
    if (!result) { result = { x, y, edges: [] }; nodes.set(key, result); }
    return result;
  };
  for (let i=0;i+3<segments.length;i+=4) {
    const a=node(segments[i]!,segments[i+1]!),b=node(segments[i+2]!,segments[i+3]!);
    if (a===b) continue;
    const index=edges.length;
    edges.push([a,b]);a.edges.push(index);b.edges.push(index);
  }
  const used=new Uint8Array(edges.length),result:number[]=[];
  const starts=[...nodes.values()].sort((a,b)=>a.edges.length-b.edges.length);
  for(const start of starts) {
    while(start.edges.some(index=>!used[index])) {
      let current=start;
      for (;;) {
        const index=current.edges.find(index=>!used[index]);
        if(index===undefined)break;
        used[index]=1;
        const [a,b]=edges[index]!,next=current===a?b:a;
        result.push(current.x,current.y,next.x,next.y);
        current=next;
      }
    }
  }
  return result;
}

export function dashedSegments(segments: number[], pattern: number[]): number[] {
  if (!pattern.length) return segments;
  const output: number[] = [];
  let phase = 0, offset = 0, previousX: number | undefined, previousY: number | undefined;
  for (let index = 0; index < segments.length; index += 4) {
    const x1 = segments[index]!, y1 = segments[index + 1]!, x2 = segments[index + 2]!, y2 = segments[index + 3]!;
    if (x1 !== previousX || y1 !== previousY) { phase = 0; offset = 0; }
    const length = Math.hypot(x2 - x1, y2 - y1);
    let travelled = 0;
    while (travelled < length) {
      const part = Math.min(length - travelled, pattern[phase]! - offset);
      if (phase % 2 === 0) output.push(
        x1 + (x2 - x1) * travelled / length, y1 + (y2 - y1) * travelled / length,
        x1 + (x2 - x1) * (travelled + part) / length, y1 + (y2 - y1) * (travelled + part) / length);
      travelled += part;
      offset += part;
      if (offset >= pattern[phase]! - 1e-10) { offset = 0; phase = (phase + 1) % pattern.length; }
    }
    previousX = x2; previousY = y2;
  }
  return output;
}

export function drawStyledPoint(
  context: CanvasRenderingContext2D, x: number, y: number, radius: number, style: PointStyle,
  color: string, border: string, borderWidth: number,
): void {
  context.beginPath();
  context.setLineDash([]);
  context.strokeStyle = style === "filled" ? border : color;
  context.lineWidth = borderWidth;
  if (style === "cross") {
    context.moveTo(x - radius, y - radius); context.lineTo(x + radius, y + radius);
    context.moveTo(x - radius, y + radius); context.lineTo(x + radius, y - radius);
  } else {
    context.arc(x, y, radius, 0, Math.PI * 2);
    if (style === "filled") { context.fillStyle = color; context.fill(); }
  }
  context.stroke();
}
