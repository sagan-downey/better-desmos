import { splitCollectionParts, type StatisticsMode } from "./collections";
import { randomKey } from "./random";

export function rewriteRandom(
  source: string, evaluate: (source: string) => number,
  lists: Record<string, string[]> = {}, mode: StatisticsMode = "sample", scope = source,
): string {
  let output = "", cursor = 0;
  const calls = /\b(random|shuffle)\s*\(/gi;
  for (let match = calls.exec(source); match; match = calls.exec(source)) {
    if (match.index > 0 && source[match.index - 1] === ".") continue;
    const open = match.index + match[0].lastIndexOf("(");
    let depth = 1, end = open + 1;
    for (; end < source.length && depth; end += 1) {
      if (source[end] === "(") depth += 1;
      if (source[end] === ")") depth -= 1;
    }
    if (depth) throw new Error("Random expression is missing a closing parenthesis.");
    const body = source.slice(open + 1, end - 1).trim();
    const parts = body ? splitCollectionParts(body) : [];
    const args = parts.map((arg) => rewriteRandom(arg, evaluate, lists, mode, `${scope}:${match.index}:${arg}`));
    const replacement = `${match[1]!.toLowerCase() === "shuffle" ? "shufflesample" : "randomsample"}(${randomKey(`${scope}:${match.index}`)}${args.length ? `,${args.join(",")}` : ""})`;
    output += source.slice(cursor, match.index) + replacement;
    cursor = end;
    calls.lastIndex = end;
  }
  return output + source.slice(cursor);
}
