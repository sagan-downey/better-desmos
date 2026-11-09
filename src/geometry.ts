import { splitCollectionParts } from "./collections";

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
