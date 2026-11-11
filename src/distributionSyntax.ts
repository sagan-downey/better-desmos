import { expandCollections, splitCollectionParts, type StatisticsMode } from "./collections";
import { DISTRIBUTION_NAMES, makeDistribution, type Distribution, type DistributionName } from "./probability";
import { randomKey } from "./random";
import { numericSource } from "./numericSource";

const prefixes: Record<DistributionName, string> = {
  normaldist: "normal", tdist: "t", chisqdist: "chi", uniformdist: "uniform",
  binomialdist: "binomial", poissondist: "poisson", geodist: "geo", discretedist: "discrete",
};

export function isDistributionName(name: string): name is DistributionName {
  return DISTRIBUTION_NAMES.some((entry) => entry === name);
}

function findGroupEnd(source: string, start: number): number | undefined {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")" && --depth === 0) return index + 1;
  }
  return undefined;
}

function groupEnd(source: string, start: number): number {
  const end = findGroupEnd(source, start);
  if (end === undefined) throw new Error("Distribution expression is missing a closing parenthesis.");
  return end;
}

export function distributionCall(source: string): { name: DistributionName; args: string[]; end: number } | undefined {
  const match = /^\s*([a-z]+)\s*\(/i.exec(source);
  if (!match || !isDistributionName(match[1]!.toLowerCase())) return undefined;
  const name = match[1]!.toLowerCase();
  if (!isDistributionName(name)) return undefined;
  const start = match[0].lastIndexOf("(");
  const end = findGroupEnd(source, start);
  if (end === undefined) return undefined;
  const body = source.slice(start + 1, end - 1).trim();
  return { name, args: body ? splitCollectionParts(body) : [], end };
}

export function readDistribution(
  source: string, evaluate: (source: string) => number, lists: Record<string, string[]> = {}, mode: StatisticsMode = "sample",
): Distribution {
  const call = distributionCall(source);
  if (!call || source.slice(call.end).trim()) throw new Error("Enter a probability distribution.");
  const expanded = call.args.map((arg) => expandCollections(arg, evaluate, lists, mode));
  if (call.name === "discretedist") {
    if (expanded.length < 1 || expanded.length > 2 || expanded.some((arg) => !arg.list)) {
      throw new Error("Use discretedist(values[, weights]) with lists.");
    }
    return makeDistribution(call.name, [], expanded[0]!.items.map(evaluate), expanded[1]?.items.map(evaluate));
  }
  if (expanded.some((arg) => arg.list || arg.items.length !== 1)) throw new Error("Distribution parameters must be scalar values.");
  return makeDistribution(call.name, expanded.map((arg) => evaluate(arg.items[0]!)));
}

export function rewriteDistributions(
  source: string, evaluate: (source: string) => number, lists: Record<string, string[]> = {}, mode: StatisticsMode = "sample", scope = source,
): string {
  let result = "", index = 0;
  while (index < source.length) {
    const token = /^[a-z]+(?:_[a-z0-9]+)?/i.exec(source.slice(index));
    if (!token) { result += source[index++]; continue; }
    const name = token[0].toLowerCase();
    if (!isDistributionName(name)) { result += token[0]; index += token[0].length; continue; }
    const call = distributionCall(source.slice(index));
    if (!call) { result += token[0]; index += token[0].length; continue; }
    const original = source.slice(index, index + call.end);
    const tail = source.slice(index + call.end);
    const method = /^\s*\.\s*([a-z]+)\s*/i.exec(tail);
    let end = index + call.end;
    let methodName = method?.[1]?.toLowerCase() ?? "pdf";
    let args = ["x"];
    if (method) {
      end += method[0].length;
      if (source[end] === "(") {
        const close = groupEnd(source, end);
        const body = source.slice(end + 1, close - 1).trim();
        args = body ? splitCollectionParts(body) : [];
        end = close;
      } else args = [];
    }
    if (methodName === "random") {
      if (args.length > 1) throw new Error("Use d.random() or d.random(n).");
      result += `distributionsample(${DISTRIBUTION_NAMES.indexOf(call.name)},${randomKey(`${scope}:${index}:${original}`)},${args[0] ?? "-1"}${call.args.length ? `,${call.args.join(",")}` : ""})`;
    } else if (["mean", "median", "variance", "stdev"].includes(methodName)) {
      if (args.length) throw new Error(`${methodName} takes no arguments for a distribution.`);
      const parameters = call.name === "discretedist" ? (() => {
        const distribution = readDistribution(original, evaluate, lists, mode);
        return distribution.values!.flatMap((value, i) => [numericSource(value), numericSource(distribution.weights?.[i] ?? 1)]);
      })() : call.args;
      result += `${prefixes[call.name]}${methodName}(${parameters.join(",")})`;
    } else {
      if (!["pdf", "cdf", "inversecdf"].includes(methodName)) throw new Error(`Unsupported distribution method "${methodName}".`);
      if (methodName === "cdf" && args.length === 2) methodName = "prob";
      else if (args.length !== 1) throw new Error(`${methodName} requires one input${methodName === "cdf" ? " or two bounds" : ""}.`);
      const parameters = call.name === "discretedist"
        ? (() => {
          const distribution = readDistribution(original, evaluate, lists, mode);
          return distribution.values!.flatMap((value, i) => [numericSource(value), numericSource(distribution.weights?.[i] ?? 1)]);
        })() : call.args;
      const rewritten = [...args, ...parameters].map((arg) => rewriteDistributions(arg, evaluate, lists, mode));
      result += `${prefixes[call.name]}${methodName === "inversecdf" ? "inv" : methodName}(${rewritten.join(",")})`;
    }
    index = end;
  }
  return result;
}

export function distributionDefinition(source: string): { target: string; source: string } | undefined {
  const match = /^\s*([a-z](?:_[a-z0-9]+)?)\s*=\s*(.+)$/i.exec(source);
  if (!match) return undefined;
  const call = distributionCall(match[2]!);
  if (!call || match[2]!.slice(call.end).trim()) return undefined;
  const target = match[1]!.toLowerCase();
  if (["x", "y", "t", "r", "e", "i"].includes(target)) return undefined;
  return { target, source: match[2]! };
}

export function expandDistributionDefinitions(source: string, definitions: Array<{ target: string; source: string }>): string {
  const expand = (body: string, stack: Set<string>): string => body.replace(/[a-z]+(?:_[a-z0-9]+)?/gi, (token,index:number) => {
    if(body.slice(0,index).trimEnd().endsWith("."))return token;
    const target = token.toLowerCase();
    const matches = definitions.filter((definition) => definition.target === target);
    if (!matches.length) return token;
    if (matches.length > 1) throw new Error(`Distribution "${target}" is defined more than once.`);
    if (stack.has(target)) throw new Error(`Circular distribution dependency involving "${target}".`);
    const next = new Set(stack); next.add(target);
    return expand(matches[0]!.source, next);
  });
  return expand(source, new Set());
}
