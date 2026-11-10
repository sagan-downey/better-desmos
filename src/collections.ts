export interface CollectionExpansion {
  items: string[];
  list: boolean;
  approximate?: boolean;
}

export const MAX_COLLECTION_ITEMS = 2048;
export type StatisticsMode = "population" | "sample";
export const COLLECTION_FUNCTIONS = [
  "join", "sort", "reverse", "unique", "length", "count", "total",
  "mean", "median", "min", "max", "sum", "product", "variance", "stdev", "variancep", "stdevp", "var", "varp",
];

export function hasCollections(source: string, lists: Record<string, string[]> = {}): boolean {
  return source.includes("[") || /\sfor\s/i.test(source) ||
    (source.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).some((name) => Object.hasOwn(lists, name.toLowerCase()));
}

function bounded(items: string[], list = true): CollectionExpansion {
  if (items.length > MAX_COLLECTION_ITEMS) throw new Error(`Lists are limited to ${MAX_COLLECTION_ITEMS} elements.`);
  return { items, list };
}

export function splitCollectionParts(source: string, separator = ","): string[] {
  const parts: string[] = [];
  const stack: string[] = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if ("([{".includes(char)) stack.push(char);
    if (")]}".includes(char)) {
      const open = stack.pop();
      if (open !== ({ ")": "(", "]": "[", "}": "{" }[char])) throw new Error("Mismatched expression brackets.");
    }
    if (stack.length === 0 && source.startsWith(separator, index)) {
      parts.push(source.slice(start, index).trim());
      start = index + separator.length;
      index += separator.length - 1;
    }
  }
  if (stack.length) throw new Error("Missing closing expression bracket.");
  parts.push(source.slice(start).trim());
  return parts;
}

export function expandCollections(
  source: string,
  evaluate: (source: string) => number,
  lists: Record<string, string[]> = {},
  statisticsMode: StatisticsMode = "population",
): CollectionExpansion {
  let work = 0;
  let depth = 0;
  let approximate = false;
  const number = (text: string): number => {
    const value = evaluate(text);
    if (!Number.isFinite(value)) throw new Error("List values must be finite numbers.");
    return value;
  };
  const scalarNumber = (text: string): number => {
    const expanded = expand(text);
    if (expanded.list || expanded.items.length !== 1) throw new Error("A list bound or index must be a scalar.");
    return number(expanded.items[0]!);
  };
  const combine = (left: CollectionExpansion, right: CollectionExpansion): CollectionExpansion => {
    // Like Desmos, lists of different lengths combine up to the shortest length.
    const size = left.list && right.list
      ? Math.min(left.items.length, right.items.length)
      : left.list ? left.items.length : right.list ? right.items.length : 1;
    return bounded(Array.from({ length: size }, (_, index) =>
      `${left.items[left.list ? index : 0] ?? ""}${right.items[right.list ? index : 0] ?? ""}`),
    left.list || right.list);
  };
  const literal = (text: string): CollectionExpansion => {
    if (!text.trim()) return bounded([]);
    const range = splitCollectionParts(text, "...");
    if (range.length > 1) {
      if (range.length !== 2) throw new Error("A list range needs one ellipsis.");
      const starts = splitCollectionParts(range[0]!);
      if (starts.length < 1 || starts.length > 2) throw new Error("Use [start...end] or [start,next...end].");
      const start = scalarNumber(starts[0]!);
      const end = scalarNumber(range[1]!);
      const step = starts.length === 2 ? scalarNumber(starts[1]!) - start : 1;
      if (step === 0) throw new Error("A list range step must not be zero.");
      const distance = (end - start) / step;
      if (distance < 0) return bounded([]);
      const count = Math.floor(distance + 1e-12) + 1;
      if (!Number.isSafeInteger(count) || count > MAX_COLLECTION_ITEMS) {
        throw new Error(`Lists are limited to ${MAX_COLLECTION_ITEMS} elements.`);
      }
      const stepSource = starts.length === 2 ? `((${starts[1]})-(${starts[0]}))` : "1";
      return bounded(Array.from({ length: count }, (_, index) => `((${starts[0]})+${index}*${stepSource})`));
    }
    const items = splitCollectionParts(text).flatMap((part) => expand(part).items);
    return bounded(items.map((item) => `(${item})`));
  };
  const select = (base: CollectionExpansion, indexText: string, name?: string): CollectionExpansion => {
    if (!base.list) throw new Error("Indexing requires a list.");
    const filter = name && new RegExp(`^${name}\\s*(<=|>=|!=|=|<|>)\\s*(.+)$`, "i").exec(indexText.trim());
    if (filter) {
      const limit = scalarNumber(filter[2]!);
      return bounded(base.items.filter((item) => {
        const value = number(item);
        switch (filter[1]) {
          case "<": return value < limit;
          case "<=": return value <= limit;
          case ">": return value > limit;
          case ">=": return value >= limit;
          case "=": return value === limit;
          default: return value !== limit;
        }
      }));
    }
    const indices = literal(indexText);
    const items = indices.items.map((item) => {
      const index = number(item);
      if (!Number.isInteger(index) || index < 1 || index > base.items.length) {
        throw new Error(`List index must be an integer between 1 and ${base.items.length}.`);
      }
      return base.items[index - 1]!;
    });
    return bounded(items, indexText.includes(",") || indexText.includes("...") ||
      expand(indexText).list);
  };
  const expandBody = (text: string): CollectionExpansion => {
    if (++work > 20_000) throw new Error("List expression is too complex.");
    const comprehensions = splitCollectionParts(text, " for ");
    if (comprehensions.length > 1) {
      if (comprehensions.length !== 2) throw new Error("Use one for clause with comma-separated bindings.");
      let bodies = [comprehensions[0]!];
      const names = new Set<string>();
      for (const binding of splitCollectionParts(comprehensions[1]!)) {
        const match = /^([a-z](?:_[a-z0-9]+)?)\s*=\s*(.+)$/i.exec(binding);
        if (!match) throw new Error("Use expression for a=[...], b=[...].");
        const name = match[1]!.toLowerCase();
        if (["x", "y", "e", "pi"].includes(name) || names.has(name)) throw new Error("Use distinct, nonreserved for variables.");
        names.add(name);
        const values = expand(match[2]!);
        if (!values.list) throw new Error("A for binding requires a list.");
        if (bodies.length * values.items.length > MAX_COLLECTION_ITEMS) throw new Error(`Lists are limited to ${MAX_COLLECTION_ITEMS} elements.`);
        bodies = bodies.flatMap((body) => values.items.map((value) => body.replace(
          /[a-z]+(?:_[a-z0-9]+)?/gi, (token) => token.toLowerCase() === name ? `(${value})` : token,
        )));
      }
      return bounded(bodies.flatMap((body) => expand(body).items));
    }
    let result: CollectionExpansion = { items: [""], list: false };
    let index = 0;
    const group = (open: number): { text: string; end: number } => {
      const stack = [text[open]!];
      for (let close = open + 1; close < text.length; close += 1) {
        const char = text[close]!;
        if ("([{".includes(char)) stack.push(char);
        if (")]}".includes(char)) {
          const expected = ({ ")": "(", "]": "[", "}": "{" }[char]);
          if (stack.pop() !== expected) throw new Error("Mismatched expression brackets.");
          if (!stack.length) return { text: text.slice(open + 1, close), end: close + 1 };
        }
      }
      throw new Error("Missing closing expression bracket.");
    };
    while (index < text.length) {
      const identifier = /^[a-z]+(?:_[a-z0-9]+)?/i.exec(text.slice(index));
      let part: CollectionExpansion;
      let listName: string | undefined;
      if (identifier) {
        const token = identifier[0];
        const name = token.toLowerCase();
        index += token.length;
        let next = index;
        while (/\s/.test(text[next] ?? "") && next < text.length) next += 1;
        if (text[next] === "(") {
          const call = group(next);
          index = call.end;
          const args = splitCollectionParts(call.text).map(expand);
          const aggregate = COLLECTION_FUNCTIONS.includes(name) && args.some((arg) => arg.list);
          if (aggregate) {
            const items = bounded(args.flatMap((arg) => arg.items)).items;
            if (name === "join") part = bounded(items);
            else if (name === "length" || name === "count") part = { items: [String(items.length)], list: false };
            else if (["sort", "reverse", "unique"].includes(name)) {
              const values = items.map((item) => ({ item, value: number(item) }));
              const seen = new Set<number>();
              const sorted = name === "reverse" ? values.reverse() : name === "sort"
                ? values.sort((a, b) => a.value - b.value) : values.filter(({ value }) => {
                  if (seen.has(value)) return false;
                  seen.add(value);
                  return true;
                });
              part = bounded(sorted.map(({ item }) => item));
            } else {
              if (!items.length && name !== "sum" && name !== "total" && name !== "product") {
                throw new Error(`${name} requires a nonempty list.`);
              }
              let valueSource: string;
              if (["min", "max"].includes(name)) {
                approximate = true;
                const ordered = items.map((item) => ({ item, value: number(item) })).sort((a, b) => a.value - b.value);
                valueSource = ordered[name === "min" ? 0 : ordered.length - 1]!.item;
              } else if (name === "median") {
                approximate = true;
                const ordered = items.map((item) => ({ item, value: number(item) })).sort((a, b) => a.value - b.value);
                const middle = Math.floor(ordered.length / 2);
                valueSource = ordered.length % 2 ? ordered[middle]!.item :
                  `((${ordered[middle - 1]!.item})+(${ordered[middle]!.item}))/2`;
              } else if (["variance", "stdev", "variancep", "stdevp", "var", "varp"].includes(name)) {
                approximate = true;
                const denominator = items.length - (statisticsMode === "sample" && !name.endsWith("p") ? 1 : 0);
                if (denominator <= 0) throw new Error("Sample variance and standard deviation require at least two values.");
                let mean = 0;
                let squareSum = 0;
                for (const [index, item] of items.entries()) {
                  const value = number(item);
                  const difference = value - mean;
                  mean += difference / (index + 1);
                  squareSum += difference * (value - mean);
                }
                const variance = squareSum / denominator;
                const value = name.startsWith("stdev") ? Math.sqrt(variance) : variance;
                if (!Number.isFinite(value)) throw new Error(`${name} exceeds the supported numeric range.`);
                valueSource = String(value);
              } else {
                valueSource = items.length ? items.map((item) => `(${item})`).join(name === "product" ? "*" : "+") :
                  name === "product" ? "1" : "0";
                if (name === "mean") valueSource = `(${valueSource})/${items.length}`;
              }
              part = { items: [`(${valueSource})`], list: false };
            }
          } else {
            let joined: CollectionExpansion = { items: [""], list: false };
            for (const [argIndex, arg] of args.entries()) {
              if (argIndex) joined = combine(joined, { items: [","], list: false });
              joined = combine(joined, arg);
            }
            part = { items: joined.items.map((item) => `${token}(${item})`), list: joined.list };
          }
        } else if (Object.hasOwn(lists, name)) {
          part = bounded(lists[name]!.map((item) => `(${item})`));
          listName = name;
        } else part = { items: [token], list: false };
      } else if (text[index] === "[" || text[index] === "(" || text[index] === "{") {
        const open = text[index]!;
        const contents = group(index);
        index = contents.end;
        if (open === "[") part = literal(contents.text);
        else {
          const expanded = expand(contents.text);
          part = { items: expanded.items.map((item) => `${open}${item}${open === "(" ? ")" : "}"}`), list: expanded.list };
        }
      } else {
        part = { items: [text[index]!], list: false };
        index += 1;
      }
      let nextIndex = index;
      while (nextIndex < text.length && /\s/.test(text[nextIndex]!)) nextIndex += 1;
      while (part.list && text[nextIndex] === "[") {
        index = nextIndex;
        const indices = group(index);
        part = select(part, indices.text, listName);
        index = indices.end;
        nextIndex = index;
        while (nextIndex < text.length && /\s/.test(text[nextIndex]!)) nextIndex += 1;
        listName = undefined;
        if (!part.list && text[nextIndex] === "[") throw new Error("Indexing requires a list.");
      }
      result = combine(result, part);
    }
    return result;
  };
  const expand = (text: string): CollectionExpansion => {
    if (++depth > 128) throw new Error("List expressions may nest at most 128 levels.");
    try {
      const result = expandBody(text);
      if (result.items.some((item) => item.length > 4096) ||
          result.items.reduce((total, item) => total + item.length, 0) > 1_000_000) {
        throw new Error("Expanded list expression is too long.");
      }
      return result;
    } finally {
      depth -= 1;
    }
  };
  if (source.length > 4096) throw new Error("Expressions must be 4096 characters or fewer.");
  return { ...expand(source.replace(/…/g, "...").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/≠/g, "!=")
    .replace(/\s+for\s+/gi, " for ").trim()), approximate };
}
