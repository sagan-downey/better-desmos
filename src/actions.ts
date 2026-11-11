import { expandCollections, splitCollectionParts, type StatisticsMode } from "./collections";
import { pointSources } from "./geometry";
import { numericSource } from "./numericSource";

export interface ActionDefinition { target: string; source: string }
export interface ActionUpdate { target: string; values: number[]; list: boolean; points?:[number,number][] }

export function actionUpdateSource(update:ActionUpdate):string{
  const items=update.points?update.points.map((point)=>`(${point.map(numericSource).join(",")})`):update.values.map(numericSource);
  return`${update.target}=${update.list?`[${items.join(",")}]`:items[0]}`;
}

export function actionDefinition(source: string): ActionDefinition | undefined {
  const match = /^\s*([a-z](?:_[a-z0-9]+)?)\s*=\s*(.+(?:->|→).+)$/i.exec(source);
  if (!match) return undefined;
  return { target: match[1]!.toLowerCase(), source: match[2]! };
}

export function expandActions(source: string, definitions: ActionDefinition[]): string {
  const expand = (body: string, path: Set<string>): string => splitCollectionParts(body).map((part) => {
    const target = part.trim().toLowerCase();
    const matches = definitions.filter((definition) => definition.target === target);
    if (!matches.length) return part;
    if (matches.length > 1) throw new Error(`Action "${target}" is defined more than once.`);
    if (path.has(target)) throw new Error(`Circular action dependency involving "${target}".`);
    return expand(matches[0]!.source, new Set([...path, target]));
  }).join(",");
  return expand(source, new Set());
}

export function evaluateActions(
  source: string, evaluate: (source: string) => number, available: Set<string>,
  lists: Record<string, string[]> = {}, mode: StatisticsMode = "sample",rewrite:(source:string)=>string=(source)=>source,
): ActionUpdate[] {
  const targets = new Set<string>();
  const parts = splitCollectionParts(source.replace(/→/g, "->"));
  if (!parts.length || parts.length > 128) throw new Error("Actions require 1 to 128 assignments.");
  return parts.map((part) => {
    const match = /^\s*([a-z](?:_[a-z0-9]+)?)\s*(?:->|=)\s*(.+)$/i.exec(part);
    if (!match) throw new Error("Use assignments such as a -> a+1, b -> a (updates are simultaneous).");
    const target = match[1]!.toLowerCase();
    if (["e", "pi", "x", "y", "t", "r", "theta", "i", "dt"].includes(target)) throw new Error(`"${target}" cannot be updated by an action.`);
    if (!available.has(target)) throw new Error(`Action target "${target}" must be an existing variable, point, or named list.`);
    if (targets.has(target)) throw new Error(`Action target "${target}" is assigned more than once.`);
    targets.add(target);
    const expanded = expandCollections(rewrite(match[2]!), evaluate, lists, mode);
    const coordinates=expanded.items.map(pointSources);
    if(coordinates.some(Boolean)){
      if(coordinates.some((point)=>!point))throw new Error("An action list must contain either numbers or points, not both.");
      const points=coordinates.map((point):[number,number]=>{
        const x=evaluate(point![0]),y=evaluate(point![1]);
        if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error("Action point coordinates must be finite.");
        return[x,y];
      });
      return{target,values:[],points,list:expanded.list};
    }
    const values = expanded.items.map((item) => {
      const value = evaluate(item);
      if (!Number.isFinite(value)) throw new Error("Actions must produce finite numeric values.");
      return value;
    });
    if (!expanded.list && values.length !== 1) throw new Error("Scalar actions require one finite value.");
    return { target, values, list: expanded.list };
  });
}
