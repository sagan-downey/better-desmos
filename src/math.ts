import Decimal from "decimal.js";

Decimal.set({
  precision: 50,
  rounding: Decimal.ROUND_HALF_EVEN,
  maxE: 100_000,
  minE: -100_000,
});

type Rational = { kind: "rational"; numerator: bigint; denominator: bigint };
type Approximate = { kind: "approximate"; value: Decimal };
type Value = Rational | Approximate;

type Node =
  | { type: "number"; value: Rational }
  | { type: "variable" }
  | { type: "constant"; value: "pi" | "e" }
  | { type: "unary"; operator: "+" | "-"; operand: Node }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { type: "call"; name: string; argument: Node };

export interface Evaluation {
  value: Decimal;
  exact: boolean;
}

const functions = new Set(["sqrt", "sin", "cos", "tan", "asin", "acos", "atan", "ln", "log", "exp", "abs"]);
const MAX_EXPRESSION_LENGTH = 512;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) {
    throw new Error("Division by zero");
  }
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return {
    kind: "rational",
    numerator: (numerator / divisor) * sign,
    denominator: (denominator / divisor) * sign,
  };
}

function decimalLiteral(text: string): Rational {
  const [whole = "0", fractional = ""] = text.split(".");
  const digits = `${whole || "0"}${fractional}`;
  return rational(BigInt(digits), 10n ** BigInt(fractional.length));
}

function approximate(value: Decimal): Approximate {
  if (!value.isFinite()) {
    throw new Error("The result is outside the supported numeric range");
  }
  return { kind: "approximate", value };
}

function asDecimal(value: Value): Decimal {
  return value.kind === "rational"
    ? new Decimal(value.numerator.toString()).div(value.denominator.toString())
    : value.value;
}

function parse(source: string): Node {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  }
  const expression = source.trim().replace(/^y\s*=\s*/i, "");
  const tokens: string[] = [];
  let offset = 0;
  while (offset < expression.length) {
    if (/\s/.test(expression[offset]!)) {
      offset += 1;
      continue;
    }
    const remaining = expression.slice(offset);
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)|^[a-zA-Z]+|^[+\-*/^(),]/.exec(remaining);
    if (!match) {
      throw new Error(`Unexpected character "${expression[offset]}"`);
    }
    tokens.push(match[0]);
    offset += match[0].length;
  }
  if (tokens.length === 0) {
    throw new Error("Enter an expression, for example y = x^2");
  }

  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (token: string) => {
    if (take() !== token) {
      throw new Error(`Expected "${token}"`);
    }
  };

  function primary(): Node {
    const token = take();
    if (token === undefined) {
      throw new Error("Expected a number, x, or a parenthesized expression");
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      return { type: "number", value: decimalLiteral(token) };
    }
    if (token === "(") {
      const value = sum();
      expect(")");
      return value;
    }
    const name = token.toLowerCase();
    if (name === "x") {
      return { type: "variable" };
    }
    if (name === "pi" || name === "e") {
      return { type: "constant", value: name };
    }
    if (functions.has(name)) {
      expect("(");
      const argument = sum();
      expect(")");
      return { type: "call", name, argument };
    }
    throw new Error(`Unknown name "${token}"`);
  }

  function power(): Node {
    const left = primary();
    if (peek() === "^") {
      take();
      return { type: "binary", operator: "^", left, right: unary() };
    }
    return left;
  }

  function unary(): Node {
    if (peek() === "+" || peek() === "-") {
      const operator = take() as "+" | "-";
      return { type: "unary", operator, operand: unary() };
    }
    return power();
  }

  function product(): Node {
    let node = unary();
    while (peek() === "*" || peek() === "/") {
      const operator = take() as "*" | "/";
      node = { type: "binary", operator, left: node, right: unary() };
    }
    return node;
  }

  function sum(): Node {
    let node = product();
    while (peek() === "+" || peek() === "-") {
      const operator = take() as "+" | "-";
      node = { type: "binary", operator, left: node, right: product() };
    }
    return node;
  }

  const result = sum();
  if (position < tokens.length) {
    throw new Error(`Unexpected token "${peek()}"`);
  }
  return result;
}

function evaluate(node: Node, x: Decimal): Value {
  switch (node.type) {
    case "number":
      return node.value;
    case "variable":
      return approximate(x);
    case "constant":
      return approximate(node.value === "pi" ? Decimal.acos(-1) : Decimal.exp(1));
    case "unary": {
      const value = evaluate(node.operand, x);
      if (node.operator === "+") {
        return value;
      }
      return value.kind === "rational"
        ? rational(-value.numerator, value.denominator)
        : approximate(value.value.negated());
    }
    case "binary": {
      const left = evaluate(node.left, x);
      const right = evaluate(node.right, x);
      if (left.kind === "rational" && right.kind === "rational") {
        const a = left.numerator;
        const b = left.denominator;
        const c = right.numerator;
        const d = right.denominator;
        switch (node.operator) {
          case "+":
            return rational(a * d + c * b, b * d);
          case "-":
            return rational(a * d - c * b, b * d);
          case "*":
            return rational(a * c, b * d);
          case "/":
            return rational(a * d, b * c);
          case "^":
            if (right.denominator === 1n && right.numerator >= -100n && right.numerator <= 100n) {
              const exponent = Number(right.numerator);
              if (a === 0n && exponent < 0) {
                throw new Error("Zero cannot be raised to a negative exponent");
              }
              return exponent < 0
                ? rational(b ** BigInt(-exponent), a ** BigInt(-exponent))
                : rational(a ** BigInt(exponent), b ** BigInt(exponent));
            }
        }
      }
      const a = asDecimal(left);
      const b = asDecimal(right);
      switch (node.operator) {
        case "+":
          return approximate(a.plus(b));
        case "-":
          return approximate(a.minus(b));
        case "*":
          return approximate(a.times(b));
        case "/":
          if (b.isZero()) {
            throw new Error("Division by zero");
          }
          return approximate(a.div(b));
        case "^":
          if (a.isNegative() && !b.isInteger()) {
            throw new Error("A negative base requires an integer exponent");
          }
          if (a.isZero() && b.isNegative()) {
            throw new Error("Zero cannot be raised to a negative exponent");
          }
          return approximate(a.pow(b));
      }
      break;
    }
    case "call": {
      const value = evaluate(node.argument, x);
      if (node.name === "abs" && value.kind === "rational") {
        return rational(value.numerator < 0n ? -value.numerator : value.numerator, value.denominator);
      }
      const argument = asDecimal(value);
      switch (node.name) {
        case "abs":
          return approximate(argument.abs());
        case "sqrt": {
          if (argument.isNegative()) {
            throw new Error("sqrt is only defined here for values greater than or equal to zero");
          }
          if (value.kind === "rational") {
            const numeratorRoot = integerSquareRoot(value.numerator);
            const denominatorRoot = integerSquareRoot(value.denominator);
            if (numeratorRoot ** 2n === value.numerator && denominatorRoot ** 2n === value.denominator) {
              return rational(numeratorRoot, denominatorRoot);
            }
          }
          return approximate(argument.sqrt());
        }
        case "sin":
          return approximate(argument.sin());
        case "cos":
          return approximate(argument.cos());
        case "tan":
          if (argument.cos().abs().lt("1e-45")) {
            throw new Error("tan is undefined at this input");
          }
          return approximate(argument.tan());
        case "asin":
          if (argument.abs().gt(1)) {
            throw new Error("asin requires an input between -1 and 1");
          }
          return approximate(argument.asin());
        case "acos":
          if (argument.abs().gt(1)) {
            throw new Error("acos requires an input between -1 and 1");
          }
          return approximate(argument.acos());
        case "atan":
          return approximate(argument.atan());
        case "ln":
          if (argument.lte(0)) {
            throw new Error("ln requires an input greater than zero");
          }
          return approximate(argument.ln());
        case "log":
          if (argument.lte(0)) {
            throw new Error("log requires an input greater than zero");
          }
          return approximate(argument.log());
        case "exp":
          return approximate(argument.exp());
      }
    }
  }
  throw new Error("Could not evaluate expression");
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 2n) {
    return value;
  }
  let current = value;
  let next = (current + 1n) / 2n;
  while (next < current) {
    current = next;
    next = (current + value / current) / 2n;
  }
  return current;
}

export function compileExpression(source: string): (x: number) => Evaluation {
  const tree = parse(source);
  return (x: number) => {
    if (!Number.isFinite(x)) {
      throw new Error("x must be a finite number");
    }
    const result = evaluate(tree, new Decimal(x.toString()));
    return { value: asDecimal(result), exact: result.kind === "rational" };
  };
}
