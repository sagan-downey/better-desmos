export type LineStyle = "solid" | "dashed" | "dotted";
export type PointStyle = "filled" | "open" | "cross";

export function lineDash(style: LineStyle = "solid", width = 2): number[] {
  return style === "dashed" ? [6 * Math.max(1, width / 2), 4 * Math.max(1, width / 2)] :
    style === "dotted" ? [width, 3 * width] : [];
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
