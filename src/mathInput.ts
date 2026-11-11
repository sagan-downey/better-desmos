const functions = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "asin", "acos", "atan", "sinh", "cosh", "tanh",
  "ln", "log", "exp", "abs", "floor", "ceil", "sqrt",
]);
const commands: Record<string, string> = {
  cdot: "*", times: "*", div: "/", pi: "pi", theta: "theta", le: "<=", leq: "<=",
  ge: ">=", geq: ">=", ne: "!=", neq: "!=", to: "->", rightarrow: "->", sim: "~",
  lbrace: "{", rbrace: "}", lbrack: "[", rbrack: "]", vert: "|", mid: "|",
  land: " and ", lor: " or ", colon: ":", infty: "infinity",
  prime: "'", doubleprime: "''",
};

/** Converts notation only; expression evaluation always stays in the math parser. */
export function latexToSource(latex: string): string {
  if (latex.length > 20000) throw new Error("Visual expression is too long.");
  let index = 0;
  const space = () => { while (/\s/.test(latex[index] ?? "") && index < latex.length) index++; };
  const group = (): string => {
    space();
    if (latex[index] !== "{") return atom();
    index++;
    const body = read("}");
    if (latex[index++] !== "}") throw new Error("Finish the math field's closing brace.");
    if (!body.trim()) throw new Error("Fill in the math field's empty argument.");
    return body;
  };
  const rawGroup = (): string => {
    space();
    if (latex[index++] !== "{") throw new Error("Expected a math name in braces.");
    const end = latex.indexOf("}", index);
    if (end < 0) throw new Error("Finish the math name.");
    const name = latex.slice(index, end);
    index = end + 1;
    if (!/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error("Use a supported mathematical name.");
    return name;
  };
  const atom = (): string => {
    space();
    const char = latex[index++];
    if (!char) throw new Error("Finish the math field's missing argument.");
    if (char === "{") {
      const body = read("}");
      if (latex[index++] !== "}") throw new Error("Finish the math field's closing brace.");
      return `(${body})`;
    }
    if (char === "^") {
      const primes = /^\s*\{((?:\\prime\s*)+)\}/.exec(latex.slice(index));
      if (primes) { index += primes[0].length; return "'".repeat((primes[1]!.match(/\\prime/g) ?? []).length); }
      if (latex.slice(index).startsWith("\\prime")) { index += 6; return "'"; }
      return `^(${group()})`;
    }
    if (char === "_") {
      space();
      const subscript = latex[index] === "{" ? rawGroupOrDigits() : latex[index++];
      if (!subscript || !/^[a-z0-9]+$/i.test(subscript)) throw new Error("Subscripts must contain letters or digits.");
      return `_${subscript}`;
    }
    if (char !== "\\") {
      if (!/[a-z0-9.+\-*/^_()[\],:!<>=|~']/i.test(char)) throw new Error(`Unsupported visual character "${char}".`);
      return char;
    }
    const match = /^[a-z]+/i.exec(latex.slice(index));
    if (!match) {
      const escaped = latex[index++];
      if (escaped === "{" || escaped === "}") return escaped;
      if (escaped === "," || escaped === ";" || escaped === " ") return " ";
      if (escaped === "!") return "";
      throw new Error("Unsupported visual math command.");
    }
    const name = match[0]; index += name.length;
    if (["left", "right", "middle", "displaystyle", "textstyle", "limits", "nolimits"].includes(name)) return "";
    if (name === "placeholder") throw new Error("Fill in the math field's empty placeholder.");
    if (["operatorname", "mathrm", "mathit", "text"].includes(name)) {
      const value = rawGroup();
      return ["and", "or", "for", "with"].includes(value) || name === "mathrm" && value === "d" ? ` ${value} ` : value;
    }
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const numerator = group(), denominator = group();
      if (numerator === "d" && /^d[a-z](?:_[a-z0-9]+)?$/i.test(denominator) &&
          /^\s*(?:\\left\s*)?\(/.test(latex.slice(index))) return `d/${denominator}`;
      return `((${numerator})/(${denominator}))`;
    }
    if (name === "sqrt") {
      space();
      let root: string | undefined;
      if (latex[index] === "[") { index++; root = read("]"); if (latex[index++] !== "]") throw new Error("Finish the root index."); }
      const body = group();
      return root ? `((${body})^(1/(${root})))` : `sqrt(${body})`;
    }
    if (name === "sum" || name === "prod" || name === "int") {
      space();
      if (latex[index++] !== "_") throw new Error("Calculus notation requires a lower bound.");
      const lower = group(); space();
      if (latex[index++] !== "^") throw new Error("Calculus notation requires an upper bound.");
      return `${name}_{${lower}}^{${group()}} `;
    }
    if (name === "differentialD") return " d";
    if (name === "log") {
      space();
      if (latex[index] === "_") { index++; return `log_{${group()}}`; }
    }
    if (functions.has(name) || ["arcsin", "arccos", "arctan"].includes(name)) {
      space();
      if (latex[index] === "(" || latex.slice(index).startsWith("\\left")) return name;
      if (latex[index] === "^") {
        index++;
        const exponent = group(); space();
        return `((${name}(${argument()}))^(${exponent}))`;
      }
      return `${name}(${argument()})`;
    }
    if (Object.hasOwn(commands, name)) return commands[name]!;
    throw new Error(`Unsupported visual command "\\${name}". Use the text editor for this notation.`);
  };
  const rawGroupOrDigits = (): string => {
    index++;
    const end = latex.indexOf("}", index);
    if (end < 0) throw new Error("Finish the subscript.");
    const value = latex.slice(index, end); index = end + 1;
    return value;
  };
  const argument = (): string => {
    space();
    if (latex.slice(index).startsWith("\\left")) { index += 5; space(); }
    if (latex[index] === "(") {
      index++; const body = read(")");
      if (latex[index++] !== ")") throw new Error("Finish the function argument.");
      return body;
    }
    if (latex[index] === "+" || latex[index] === "-") return latex[index++]! + argument();
    const number = /^(?:\d+(?:\.(?!\.)\d*)?|\.\d+)/.exec(latex.slice(index));
    let value: string;
    if (number) { value = number[0]; index += value.length; }
    else value = group();
    space();
    while (latex[index] === "^" || latex[index] === "_" || latex[index] === "!") { value += atom(); space(); }
    if (/[a-z0-9.(]/i.test(latex[index] ?? "") || latex.slice(index).startsWith("\\left(")) {
      throw new Error("Use parentheses around a multi-term function argument.");
    }
    return value;
  };
  const read = (end = ""): string => {
    let result = "";
    while (index < latex.length && (!end || latex[index] !== end)) {
      if (/\s/.test(latex[index] ?? "")) result += " ";
      space();
      if (end && latex[index] === end) break;
      if (index >= latex.length) break;
      result += atom();
    }
    return result;
  };
  const source = read().replace(/\bd\s+([a-z](?:_[a-z0-9]+)?)\b/gi, "d$1").replace(/\s+/g, " ").trim();
  if (source.length > 512) throw new Error("Expressions are limited to 512 characters.");
  return source;
}

export function sourceToLatex(source: string): string {
  if (source.length > 512) throw new Error("Expressions are limited to 512 characters.");
  source = source.replace(/θ/g, "theta").replace(/[Σ∑]/g, "sum").replace(/[Π∏]/g, "prod").replace(/∫/g, "int");
  let index = 0;
  const group = (open: string, close: string): string => {
    if (source[index++] !== open) throw new Error("Incomplete expression group.");
    const start = index;
    let depth = 1;
    while (index < source.length && depth) {
      if (source[index] === open) depth++;
      if (source[index] === close) depth--;
      index++;
    }
    if (depth) throw new Error("Finish the expression's closing bracket.");
    return sourceToLatex(source.slice(start, index - 1));
  };
  const exponent = (): string => {
    while (/\s/.test(source[index] ?? "") && index < source.length) index++;
    let value = "";
    if (source[index] === "+" || source[index] === "-") {
      const sign = source[index++]!;
      return sign + exponent();
    }
    if (source[index] === "(") value = `(${group("(", ")")})`;
    else if (source[index] === "{") value = group("{", "}");
    else {
      const call = /^[a-z]+(?:_[a-z0-9]+)?\s*(?=\()/i.exec(source.slice(index));
      if (call) {
        index += call[0].length;
        value = sourceToLatex(call[0].trim()) + `(${group("(", ")")})`;
      } else {
        const operand = /^(?:\d+(?:\.(?!\.)\d*)?|\.\d+|[a-z]+(?:_[a-z0-9]+)?)/i.exec(source.slice(index));
        if (!operand) throw new Error("Finish the exponent before using visual editing.");
        index += operand[0].length; value = sourceToLatex(operand[0]);
      }
    }
    while (source[index] === "!") { index++; value += "!"; }
    if (source[index] === "^") { index++; value += `^{${exponent()}}`; }
    return value;
  };
  let result = "";
  let termStart = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const bound = /^(sum|prod|int)_/i.exec(rest);
    if (bound) {
      index += bound[0].length;
      const lower = group("{", "}");
      if (source[index++] !== "^") throw new Error("Calculus notation requires an upper bound.");
      const upper = group("{", "}");
      result += `\\${bound[1]!.toLowerCase()}_{${lower}}^{${upper}} `;
      termStart = result.length;
      continue;
    }
    const derivative = /^d\/d([a-z](?:_[a-z0-9]+)?)\s*\(/i.exec(rest);
    if (derivative) {
      index += derivative[0].length - 1;
      result += `\\frac{d}{d${sourceToLatex(derivative[1]!)}}\\left(${group("(", ")")}\\right)`;
      continue;
    }
    const name = /^[a-z]+(?:_[a-z0-9]+)?/i.exec(rest);
    if (name) {
      index += name[0].length;
      const [base, subscript] = name[0].toLowerCase().split("_");
      const functionCall = /^\s*\(/.test(source.slice(index));
      if (base === "log" && !subscript && source.slice(index).startsWith("_{")) {
        index++;
        result += `\\log_{${group("{", "}")}}`;
        continue;
      }
      if (base === "sqrt" && functionCall && !subscript) {
        while (/\s/.test(source[index] ?? "") && index < source.length) index++;
        result += `\\sqrt{${group("(", ")")}}`;
        continue;
      }
      const rendered = base === "pi" || base === "theta" ? `\\${base} ` :
        base!.length > 1 || functionCall ? `\\operatorname{${base}}` : base!;
      result += rendered + (subscript ? `_{${subscript}}` : "");
      continue;
    }
    const relation = /^(<=|>=|!=|->|≤|≥|≠|→|~)/.exec(rest);
    if (relation) {
      const map: Record<string, string> = {"<=":"\\le ",">=":"\\ge ","!=":"\\ne ","->":"\\to ","≤":"\\le ","≥":"\\ge ","≠":"\\ne ","→":"\\to ","~":"\\sim "};
      result += map[relation[0]]!; index += relation[0].length; termStart = result.length; continue;
    }
    const char = source[index++]!;
    if (char === "(") { index--; result += `(${group("(", ")")})`; }
    else if (char === "/") {
      if (/^(sum|prod|int)_/.test(source.slice(index).trimStart())) throw new Error("Parenthesize a calculus expression used as a denominator.");
      const denominator = exponent();
      const numerator = result.slice(termStart);
      if (!numerator.trim()) throw new Error("Finish the fraction's numerator.");
      result = `${result.slice(0, termStart)}\\frac{${numerator}}{${denominator}}`;
    }
    else if (char === "{") result += "\\{";
    else if (char === "}") result += "\\}";
    else if (char === "*") result += "\\cdot ";
    else if (/\s/.test(char)) result += "\\;";
    else if (char === "^") {
      result += `^{${exponent()}}`;
    } else if (/[0-9.+\-/()[\],:!<>=|'\s]/.test(char)) result += char;
    else throw new Error(`Use the text editor for "${char}" notation.`);
    if ("+-=,:<>[{".includes(char)) termStart = result.length;
  }
  return result;
}
