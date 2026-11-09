import Decimal from "decimal.js";
import { expandCollections, hasCollections, splitCollectionParts, type StatisticsMode } from "./collections";
import { pointSources } from "./geometry";

const DEFAULT_PRECISION_DIGITS = 50;
export const FAST_MODE_PRECISION_DIGITS = 10;

Decimal.set({
  precision: DEFAULT_PRECISION_DIGITS,
  rounding: Decimal.ROUND_HALF_EVEN,
  maxE: 100_000,
  minE: -100_000,
});

export function getPrecisionDigits(): number {
  return Decimal.precision;
}

export function setPrecisionDigits(digits: number): void {
  if (!Number.isInteger(digits) || digits < 20 || digits > 100) {
    throw new Error("Math precision must be between 20 and 100 digits");
  }
  Decimal.set({ precision: digits });
}

type Rational = { kind: "rational"; numerator: bigint; denominator: bigint };
type Approximate = { kind: "approximate"; value: Decimal };
type Value = Rational | Approximate;

type Node =
  | { type: "number"; value: Rational }
  | { type: "variable"; name: string }
  | { type: "constant"; value: "pi" | "e" }
  | { type: "unary"; operator: "+" | "-"; operand: Node }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { type: "call"; name: string; argument: Node }
  | { type: "restricted"; value: Node; condition: Condition }
  | { type: "piecewise"; branches: Array<{ condition: Condition; value: Node }>; fallback?: Node };

type Comparison = "<" | "<=" | ">" | ">=" | "=" | "!=";
type Condition =
  | { type: "comparison"; operator: Comparison; left: Node; right: Node }
  | { type: "logical"; operator: "and" | "or"; left: Condition; right: Condition };

export class UndefinedPointError extends Error {
  constructor() {
    super("Expression is undefined here: no condition is satisfied.");
    this.name = "UndefinedPointError";
  }
}

export interface Evaluation {
  value: Decimal;
  exact: boolean;
}

export interface UserFunctionDefinition {
  name: string;
  parameter: string;
  parameters?: string[];
  body: string;
}

export function functionParameters(definition: UserFunctionDefinition): string[] {
  const parameters = (definition.parameters ?? [definition.parameter]).map((name) => name.toLowerCase());
  if (parameters.length < 1 || parameters.length > 8 ||
      new Set(parameters).size !== parameters.length ||
      parameters.some((name) => !/^[a-z](?:_[a-z0-9]+)?$/.test(name) || ["e", "pi"].includes(name))) {
    throw new Error("Functions need 1–8 distinct letter or subscripted parameters, excluding e and pi.");
  }
  return parameters;
}

export function expandUserFunctions(
  source: string,
  definitions: UserFunctionDefinition[],
): string {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  const functionsByName = new Map<string, UserFunctionDefinition>();
  for (const definition of definitions) {
    const name = definition.name.toLowerCase();
    if (!/^[a-z](?:_[a-z0-9]+)?$/.test(name)) {
      throw new Error("User functions must have a letter or subscripted name.");
    }
    functionParameters(definition);
    if (functionsByName.has(name)) {
      throw new Error(`Function "${name}" is defined more than once.`);
    }
    functionsByName.set(name, { ...definition, name });
  }

  const expand = (expression: string, callStack: string[]): string => {
    let result = "";
    let offset = 0;
    while (offset < expression.length) {
      const identifier = /^[a-zA-Z]+(?:_[a-zA-Z0-9]+)?/.exec(expression.slice(offset));
      if (!identifier) {
        result += expression[offset]!;
        offset += 1;
        continue;
      }

      const token = identifier[0];
      const name = token.toLowerCase();
      const definition = functionsByName.get(name);
      let open = offset + token.length;
      while (/\s/.test(expression[open] ?? "")) open += 1;
      if (!definition || expression[open] !== "(") {
        result += token;
        offset += token.length;
        continue;
      }
      if (callStack.includes(name)) {
        throw new Error(`Circular function definition involving "${name}".`);
      }

      let depth = 1;
      let close = open + 1;
      let braceDepth = 0;
      let bracketDepth = 0;
      const argumentsSource: string[] = [];
      let argumentStart = open + 1;
      for (; close < expression.length && depth > 0; close += 1) {
        if (expression[close] === "(") depth += 1;
        else if (expression[close] === ")") depth -= 1;
        else if (expression[close] === "{") braceDepth += 1;
        else if (expression[close] === "}") braceDepth -= 1;
        else if (expression[close] === "[") bracketDepth += 1;
        else if (expression[close] === "]") bracketDepth -= 1;
        else if (expression[close] === "," && depth === 1 && braceDepth === 0 && bracketDepth === 0) {
          argumentsSource.push(expression.slice(argumentStart, close));
          argumentStart = close + 1;
        }
      }
      if (depth !== 0) throw new Error(`Missing closing parenthesis in call to "${name}".`);
      argumentsSource.push(expression.slice(argumentStart, close - 1));
      const parameters = functionParameters(definition);
      if (argumentsSource.length !== parameters.length) {
        throw new Error(`Function "${name}" accepts ${parameters.length === 1 ? "one argument" : `${parameters.length} arguments`}.`);
      }
      if (argumentsSource.some((argument) => !argument.trim())) {
        throw new Error(`Function "${name}" requires ${parameters.length === 1 ? "one argument" : `${parameters.length} arguments`}.`);
      }
      const argumentsExpanded = argumentsSource.map((argument) => expand(argument, callStack));
      if ([...definition.body.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/gi)]
        .some((match) => parameters.includes(match[1]!.toLowerCase()))) {
        throw new Error("Use different names for function parameters and for bindings.");
      }
      const body = definition.body.replace(/[a-zA-Z]+(?:_[a-zA-Z0-9]+)?/g, (variable) =>
        parameters.includes(variable.toLowerCase())
          ? `(${argumentsExpanded[parameters.indexOf(variable.toLowerCase())]})` : variable
      );
      result += `(${expand(body, [...callStack, name])})`;
      offset = close;
      if (result.length > MAX_EXPRESSION_LENGTH) {
        throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
      }
    }
    return result;
  };

  return expand(source, []);
}

export type ImplicitEvaluation = (x: number, y: number) => Decimal | number;
type PreciseImplicitEvaluation = (x: number, y: number) => Decimal;
export type ExplicitEvaluation = (x: number) => Evaluation | number;

export type GraphExpression =
  | { kind: "polygon"; evaluate: () => [number, number][] }
  | { kind: "explicit"; evaluate: ExplicitEvaluation; tangent?: () => { slope: number; offset: number }; region?: (parameter: number) => string }
  | { kind: "sideways"; evaluate: ExplicitEvaluation; tangent?: () => { slope: number; offset: number }; region?: (parameter: number) => string }
  | { kind: "implicit"; evaluate: ImplicitEvaluation; region?: (x: number, y?: number) => string }
  | { kind: "inequality"; relation: "<" | "<=" | ">" | ">="; evaluate: ImplicitEvaluation; region?: (x: number, y?: number) => string }
  | {
      kind: "point";
      evaluate: () => [number, number];
      xVariables: string[];
      yVariables: string[];
    }
  | { kind: "parametric"; evaluate: (parameter: number) => [number, number]; start: number; end: number; region?: (parameter: number) => string }
  | { kind: "list"; evaluate: () => Array<number | undefined> }
  | { kind: "collection"; graphs: GraphExpression[] };

export interface PolynomialRegression {
  center: Decimal;
  scale: Decimal;
  coefficients: Decimal[];
  powerCoefficients: Decimal[];
}

export interface LogarithmicRegression {
  intercept: Decimal;
  slope: Decimal;
}

export interface ExponentialRegression {
  scale: Decimal;
  rate: Decimal;
}

export interface PowerRegression {
  scale: Decimal;
  exponent: Decimal;
}

export interface TrigonometricRegression {
  model: "sine" | "tangent";
  amplitude: number;
  frequency: number;
  phase: number;
  offset: number;
}

const functions = new Set([
  "sqrt",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "ln",
  "log",
  "exp",
  "abs",
  "floor",
  "ceil",
]);
const MAX_EXPRESSION_LENGTH = 512;
const MAX_COORDINATE_CACHE_SIZE = 2048;
const rationalDecimalCache = new WeakMap<Rational, Map<number, Decimal>>();
const constantCache = new Map<number, { pi: Decimal; e: Decimal }>();

function cachedCoordinate(cache: Map<number, Decimal>, value: number): Decimal {
  let coordinate = cache.get(value);
  if (!coordinate) {
    if (cache.size >= MAX_COORDINATE_CACHE_SIZE) {
      cache.clear();
    }
    coordinate = new Decimal(value.toString());
    cache.set(value, coordinate);
  }
  return coordinate;
}

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

function decimalConstant(name: "pi" | "e"): Decimal {
  const precision = Decimal.precision;
  let constants = constantCache.get(precision);
  if (!constants) {
    constants = { pi: Decimal.acos(-1), e: Decimal.exp(1) };
    constantCache.set(precision, constants);
  }
  return constants[name];
}

function asDecimal(value: Value): Decimal {
  if (value.kind !== "rational") {
    return value.value;
  }
  const precision = Decimal.precision;
  let cached = rationalDecimalCache.get(value);
  if (!cached) {
    cached = new Map();
    rationalDecimalCache.set(value, cached);
  }
  let converted = cached.get(precision);
  if (!converted) {
    converted = new Decimal(value.numerator.toString()).div(value.denominator.toString());
    cached.set(precision, converted);
  }
  return converted;
}

function parse(
  source: string,
  allowY = false,
  stripYAssignment = true,
  variableNames: string[] = [],
): Node {
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  }
  const expression = stripYAssignment ? source.trim().replace(/^y\s*=\s*/i, "") : source.trim();
  const tokens: string[] = [];
  let offset = 0;
  while (offset < expression.length) {
    if (/\s/.test(expression[offset]!)) {
      offset += 1;
      continue;
    }
    const remaining = expression.slice(offset);
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)|^[a-zA-Z]+(?:_[a-zA-Z0-9]+)?|^(?:<=|>=|!=|≤|≥|≠)|^[+\-*/^(),{}:<>=]/.exec(remaining);
    if (!match) {
      throw new Error(`Unexpected character "${expression[offset]}"`);
    }
    tokens.push(match[0] === "≤" ? "<=" : match[0] === "≥" ? ">=" :
      match[0] === "≠" ? "!=" : match[0].toLowerCase());
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
    if (token === "{") {
      const branches: Array<{ condition: Condition; value: Node }> = [];
      let fallback: Node | undefined;
      if (peek() === "}") throw new Error("Piecewise expressions need at least one condition and value.");
      while (true) {
        let depth = 0;
        let hasCondition = false;
        for (let index = position; index < tokens.length; index += 1) {
          const token = tokens[index];
          if (depth === 0 && (token === "," || token === "}")) break;
          if (depth === 0 && token === ":") {
            hasCondition = true;
            break;
          }
          if (token === "(" || token === "{") depth += 1;
          if (token === ")" || token === "}") depth -= 1;
        }
        if (hasCondition) {
          const condition = conditionOr();
          expect(":");
          branches.push({ condition, value: sum() });
        } else {
          fallback = sum();
          if (branches.length === 0) {
            throw new Error("Use {condition: value, ..., fallback} for a piecewise expression.");
          }
          if (peek() !== "}") throw new Error("A piecewise fallback must be the last entry.");
        }
        if (peek() !== ",") break;
        take();
      }
      expect("}");
      return { type: "piecewise", branches, fallback };
    }
    const name = token.toLowerCase();
    if (name === "x" || variableNames.includes(name)) {
      return { type: "variable", name };
    }
    if (name === "y" && allowY) {
      return { type: "variable", name: "y" };
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

  function startsImplicitFactor(token: string | undefined): boolean {
    if (token === "(" || /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token ?? "")) {
      return true;
    }
    if (!token || !/^[a-zA-Z]+(?:_[a-zA-Z0-9]+)?$/.test(token)) {
      return false;
    }
    const name = token.toLowerCase();
    return name === "x" || variableNames.includes(name) || name === "pi" || name === "e" ||
      (allowY && name === "y") || functions.has(name);
  }

  function product(): Node {
    let node = unary();
    while (peek() === "*" || peek() === "/" || startsImplicitFactor(peek())) {
      let operator: "*" | "/";
      if (peek() === "*" || peek() === "/") {
        operator = take() as "*" | "/";
      } else {
        operator = "*";
      }
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
    while (peek() === "{") {
      take();
      node = { type: "restricted", value: node, condition: conditionOr() };
      expect("}");
    }
    return node;
  }

  function isComparison(token: string | undefined): token is Comparison {
    return token !== undefined && ["<", "<=", ">", ">=", "=", "!="].includes(token);
  }

  function comparison(): Condition {
    if (peek() === "(") {
      let depth = 0;
      let braces = 0;
      let grouped = false;
      for (let index = position; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token === "(") depth += 1;
        if (token === ")") depth -= 1;
        if (token === "{") braces += 1;
        if (token === "}") braces -= 1;
        if (depth === 0) break;
        if (braces === 0 && isComparison(token)) grouped = true;
      }
      if (grouped) {
        take();
        const condition = conditionOr();
        expect(")");
        return condition;
      }
    }
    let left = sum();
    if (!isComparison(peek())) throw new Error("Conditions need a comparison, such as x < 2.");
    let result: Condition | undefined;
    while (isComparison(peek())) {
      const operator = take() as Comparison;
      const right = sum();
      const part: Condition = { type: "comparison", operator, left, right };
      result = result ? { type: "logical", operator: "and", left: result, right: part } : part;
      left = right;
    }
    return result!;
  }

  function conditionAnd(): Condition {
    let condition = comparison();
    while (peek() === "and") {
      take();
      condition = { type: "logical", operator: "and", left: condition, right: comparison() };
    }
    return condition;
  }

  function conditionOr(): Condition {
    let condition = conditionAnd();
    while (peek() === "or" || peek() === ",") {
      take();
      condition = { type: "logical", operator: "or", left: condition, right: conditionAnd() };
    }
    return condition;
  }

  const result = sum();
  if (position < tokens.length) {
    throw new Error(`Unexpected token "${peek()}"`);
  }
  return result;
}

const constantNodes = new WeakMap<Node, boolean>();
const constantValues = new WeakMap<Node, { precision: number; value: Value }>();

function conditionIsConstant(condition: Condition): boolean {
  return condition.type === "logical"
    ? conditionIsConstant(condition.left) && conditionIsConstant(condition.right)
    : isConstantExpression(condition.left) && isConstantExpression(condition.right);
}

function isConstantExpression(node: Node): boolean {
  const cached = constantNodes.get(node);
  if (cached !== undefined) return cached;
  const constant = node.type === "variable" ? false
    : node.type === "unary" ? isConstantExpression(node.operand)
      : node.type === "binary" ? isConstantExpression(node.left) && isConstantExpression(node.right)
        : node.type === "call" ? isConstantExpression(node.argument)
          : node.type === "restricted" ? isConstantExpression(node.value) && conditionIsConstant(node.condition)
            : node.type === "piecewise" ? node.branches.every((branch) =>
              conditionIsConstant(branch.condition) && isConstantExpression(branch.value)) &&
              (!node.fallback || isConstantExpression(node.fallback))
              : true;
  constantNodes.set(node, constant);
  return constant;
}

function evaluate(node: Node, x: Decimal, y?: Decimal, variables: Record<string, number> = {}): Value {
  if (!isConstantExpression(node)) return evaluateNode(node, x, y, variables);
  const cached = constantValues.get(node);
  if (cached?.precision === Decimal.precision) return cached.value;
  const value = evaluateNode(node, x, y, variables);
  constantValues.set(node, { precision: Decimal.precision, value });
  return value;
}

function evaluateNode(node: Node, x: Decimal, y: Decimal | undefined, variables: Record<string, number>): Value {
  switch (node.type) {
    case "restricted":
      if (!evaluateCondition(node.condition, x, y, variables)) throw new UndefinedPointError();
      return evaluate(node.value, x, y, variables);
    case "piecewise":
      for (const branch of node.branches) {
        if (evaluateCondition(branch.condition, x, y, variables)) {
          return evaluate(branch.value, x, y, variables);
        }
      }
      if (node.fallback) return evaluate(node.fallback, x, y, variables);
      throw new UndefinedPointError();
    case "number":
      return node.value;
    case "variable":
      if (node.name === "y") {
        if (!y) {
          throw new Error("y is only available in an implicit equation");
        }
        return approximate(y);
      }
      if (node.name === "x") return approximate(x);
      const variableValue = variables[node.name];
      if (variableValue === undefined || !Number.isFinite(variableValue)) {
        throw new Error(`Set a finite slider value for "${node.name}"`);
      }
      return approximate(new Decimal(variableValue.toString()));
    case "constant":
      return approximate(decimalConstant(node.value));
    case "unary": {
      const value = evaluate(node.operand, x, y, variables);
      if (node.operator === "+") {
        return value;
      }
      return value.kind === "rational"
        ? rational(-value.numerator, value.denominator)
        : approximate(value.value.negated());
    }
    case "binary": {
      const left = evaluate(node.left, x, y, variables);
      const right = evaluate(node.right, x, y, variables);
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
      const value = evaluate(node.argument, x, y, variables);
      if (node.name === "abs" && value.kind === "rational") {
        return rational(value.numerator < 0n ? -value.numerator : value.numerator, value.denominator);
      }
      if ((node.name === "floor" || node.name === "ceil") && value.kind === "rational") {
        const quotient = value.numerator / value.denominator;
        const remainder = value.numerator % value.denominator;
        if (node.name === "floor" && value.numerator < 0n && remainder !== 0n) {
          return rational(quotient - 1n);
        }
        if (node.name === "ceil" && value.numerator > 0n && remainder !== 0n) {
          return rational(quotient + 1n);
        }
        return rational(quotient);
      }
      const argument = asDecimal(value);
      switch (node.name) {
        case "abs":
          return approximate(argument.abs());
        case "floor":
          return approximate(argument.floor());
        case "ceil":
          return approximate(argument.ceil());
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

type FastEvaluator = (x: number, y?: number) => number;

function compareValues(operator: Comparison, comparison: number): boolean {
  switch (operator) {
    case "<": return comparison < 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case ">=": return comparison >= 0;
    case "=": return comparison === 0;
    case "!=": return comparison !== 0;
  }
}

function evaluateCondition(
  condition: Condition, x: Decimal, y: Decimal | undefined, variables: Record<string, number>,
): boolean {
  if (condition.type === "logical") {
    return condition.operator === "and"
      ? evaluateCondition(condition.left, x, y, variables) && evaluateCondition(condition.right, x, y, variables)
      : evaluateCondition(condition.left, x, y, variables) || evaluateCondition(condition.right, x, y, variables);
  }
  const left = evaluate(condition.left, x, y, variables);
  const right = evaluate(condition.right, x, y, variables);
  if (left.kind === "rational" && right.kind === "rational") {
    const difference = left.numerator * right.denominator - right.numerator * left.denominator;
    return compareValues(condition.operator, difference < 0n ? -1 : difference > 0n ? 1 : 0);
  }
  return compareValues(condition.operator, asDecimal(left).comparedTo(asDecimal(right)));
}

function compileFastCondition(condition: Condition, variables: Record<string, number>): (x: number, y?: number) => boolean {
  if (condition.type === "logical") {
    const left = compileFastCondition(condition.left, variables);
    const right = compileFastCondition(condition.right, variables);
    return condition.operator === "and" ? (x, y) => left(x, y) && right(x, y) : (x, y) => left(x, y) || right(x, y);
  }
  const left = compileFastEvaluator(condition.left, variables);
  const right = compileFastEvaluator(condition.right, variables);
  return (x, y) => {
    const a = assertFiniteFastResult(left(x, y));
    const b = assertFiniteFastResult(right(x, y));
    return compareValues(condition.operator, a < b ? -1 : a > b ? 1 : 0);
  };
}

function compileFastEvaluator(node: Node, variables: Record<string, number>): FastEvaluator {
  const evaluator = compileFastEvaluatorNode(node, variables);
  if (!isConstantExpression(node)) return evaluator;
  let cached: number | undefined;
  return (x, y) => {
    if (cached === undefined) cached = evaluator(x, y);
    return cached;
  };
}

function compileFastEvaluatorNode(node: Node, variables: Record<string, number>): FastEvaluator {
  switch (node.type) {
    case "restricted": {
      const condition = compileFastCondition(node.condition, variables);
      const value = compileFastEvaluator(node.value, variables);
      return (x, y) => {
        if (!condition(x, y)) throw new UndefinedPointError();
        return value(x, y);
      };
    }
    case "piecewise": {
      const branches = node.branches.map((branch) => ({
        condition: compileFastCondition(branch.condition, variables),
        value: compileFastEvaluator(branch.value, variables),
      }));
      const fallback = node.fallback && compileFastEvaluator(node.fallback, variables);
      return (x, y) => {
        for (const branch of branches) if (branch.condition(x, y)) return branch.value(x, y);
        if (fallback) return fallback(x, y);
        throw new UndefinedPointError();
      };
    }
    case "number": {
      const { numerator, denominator } = node.value;
      const value = roundFast(Number(numerator) / Number(denominator));
      return () => value;
    }
    case "variable":
      if (node.name === "x") return (x) => roundFast(x);
      if (node.name === "y") {
        return (_x, y) => {
          if (y === undefined) {
            throw new Error("y is only available in an implicit equation");
          }
          return roundFast(y);
        };
      }
      return () => {
        const value = variables[node.name];
        if (value === undefined || !Number.isFinite(value)) {
          throw new Error(`Set a finite slider value for "${node.name}"`);
        }
        return roundFast(value);
      };
    case "constant": {
      const value = roundFast(node.value === "pi" ? Math.PI : Math.E);
      return () => value;
    }
    case "unary": {
      const evaluateOperand = compileFastEvaluator(node.operand, variables);
      return node.operator === "-"
        ? (x, y) => roundFast(-evaluateOperand(x, y))
        : (x, y) => roundFast(evaluateOperand(x, y));
    }
    case "binary": {
      const evaluateLeft = compileFastEvaluator(node.left, variables);
      const evaluateRight = compileFastEvaluator(node.right, variables);
      switch (node.operator) {
        case "+":
          return (x, y) => roundFast(evaluateLeft(x, y) + evaluateRight(x, y));
        case "-":
          return (x, y) => roundFast(evaluateLeft(x, y) - evaluateRight(x, y));
        case "*":
          return (x, y) => roundFast(evaluateLeft(x, y) * evaluateRight(x, y));
        case "/":
          return (x, y) => {
            const left = evaluateLeft(x, y);
            const right = evaluateRight(x, y);
            if (right === 0) throw new Error("Division by zero");
            return roundFast(left / right);
          };
        case "^":
          return (x, y) => {
            const left = evaluateLeft(x, y);
            const right = evaluateRight(x, y);
            if (left < 0 && !Number.isInteger(right)) {
              throw new Error("A negative base requires an integer exponent");
            }
            if (left === 0 && right < 0) {
              throw new Error("Zero cannot be raised to a negative exponent");
            }
            return roundFast(left ** right);
          };
      }
      break;
    }
    case "call": {
      const evaluateArgument = compileFastEvaluator(node.argument, variables);
      switch (node.name) {
        case "abs":
          return (x, y) => roundFast(Math.abs(evaluateArgument(x, y)));
        case "floor":
          return (x, y) => Math.floor(evaluateArgument(x, y));
        case "ceil":
          return (x, y) => Math.ceil(evaluateArgument(x, y));
        case "sqrt":
          return (x, y) => {
            const argument = evaluateArgument(x, y);
            if (argument < 0) {
              throw new Error("sqrt is only defined here for values greater than or equal to zero");
            }
            return roundFast(Math.sqrt(argument));
          };
        case "sin":
          return (x, y) => roundFast(Math.sin(evaluateArgument(x, y)));
        case "cos":
          return (x, y) => roundFast(Math.cos(evaluateArgument(x, y)));
        case "tan":
          return (x, y) => roundFast(Math.tan(evaluateArgument(x, y)));
        case "asin":
          return (x, y) => {
            const argument = evaluateArgument(x, y);
            if (Math.abs(argument) > 1) {
              throw new Error("asin requires an input between -1 and 1");
            }
            return roundFast(Math.asin(argument));
          };
        case "acos":
          return (x, y) => {
            const argument = evaluateArgument(x, y);
            if (Math.abs(argument) > 1) {
              throw new Error("acos requires an input between -1 and 1");
            }
            return roundFast(Math.acos(argument));
          };
        case "atan":
          return (x, y) => roundFast(Math.atan(evaluateArgument(x, y)));
        case "ln":
          return (x, y) => {
            const argument = evaluateArgument(x, y);
            if (argument <= 0) throw new Error("ln requires an input greater than zero");
            return roundFast(Math.log(argument));
          };
        case "log":
          return (x, y) => {
            const argument = evaluateArgument(x, y);
            if (argument <= 0) throw new Error("log requires an input greater than zero");
            return roundFast(Math.log10(argument));
          };
        case "exp":
          return (x, y) => roundFast(Math.exp(evaluateArgument(x, y)));
      }
    }
  }
  throw new Error("Could not compile expression");
}

function roundFast(value: number): number {
  return Number.isFinite(value) ? Number(value.toPrecision(FAST_MODE_PRECISION_DIGITS)) : value;
}

function assertFiniteFastResult(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("The result is outside the supported numeric range");
  }
  return value;
}

interface AffineExpression {
  coefficient: Node;
  constant: Node;
}

function zeroNode(): Node {
  return { type: "number", value: rational(0n) };
}

function oneNode(): Node {
  return { type: "number", value: rational(1n) };
}

function isZeroNode(node: Node): boolean {
  return node.type === "number" && node.value.numerator === 0n;
}

function isOneNode(node: Node): boolean {
  return node.type === "number" && node.value.numerator === node.value.denominator;
}

function negateNode(node: Node): Node {
  if (node.type === "number") {
    return { type: "number", value: rational(-node.value.numerator, node.value.denominator) };
  }
  if (node.type === "unary" && node.operator === "-") {
    return node.operand;
  }
  return { type: "unary", operator: "-", operand: node };
}

function binaryNode(operator: "+" | "-" | "*" | "/", left: Node, right: Node): Node {
  if (operator === "+") {
    if (isZeroNode(left)) return right;
    if (isZeroNode(right)) return left;
  } else if (operator === "-") {
    if (isZeroNode(right)) return left;
    if (isZeroNode(left)) return negateNode(right);
  } else if (operator === "*") {
    if (isZeroNode(left) || isZeroNode(right)) return zeroNode();
    if (isOneNode(left)) return right;
    if (isOneNode(right)) return left;
  } else {
    if (isZeroNode(left)) return zeroNode();
    if (isOneNode(right)) return left;
  }
  return { type: "binary", operator, left, right };
}

function affineInVariable(node: Node, variable: "x" | "y"): AffineExpression | undefined {
  if (node.type === "variable" && node.name === variable) {
    return { coefficient: oneNode(), constant: zeroNode() };
  }
  if (node.type === "number" || node.type === "constant" ||
      (node.type === "variable" && node.name !== variable)) {
    return { coefficient: zeroNode(), constant: node };
  }
  if (node.type === "unary") {
    const operand = affineInVariable(node.operand, variable);
    if (!operand) return undefined;
    return node.operator === "+"
      ? operand
      : {
        coefficient: negateNode(operand.coefficient),
        constant: negateNode(operand.constant),
      };
  }
  if (node.type === "call") {
    return containsVariable(node.argument, variable)
      ? undefined
      : { coefficient: zeroNode(), constant: node };
  }
  if (node.type === "piecewise" || node.type === "restricted") {
    return containsVariable(node, variable) ? undefined : { coefficient: zeroNode(), constant: node };
  }
  if (node.type !== "binary") {
    return undefined;
  }

  const leftContainsVariable = containsVariable(node.left, variable);
  const rightContainsVariable = containsVariable(node.right, variable);
  if (!leftContainsVariable && !rightContainsVariable) {
    return { coefficient: zeroNode(), constant: node };
  }
  if (node.operator === "+" || node.operator === "-") {
    const left = affineInVariable(node.left, variable);
    const right = affineInVariable(node.right, variable);
    if (!left || !right) return undefined;
    return {
      coefficient: binaryNode(node.operator, left.coefficient, right.coefficient),
      constant: binaryNode(node.operator, left.constant, right.constant),
    };
  }
  if (node.operator === "*" && leftContainsVariable !== rightContainsVariable) {
    const affine = affineInVariable(leftContainsVariable ? node.left : node.right, variable);
    const factor = leftContainsVariable ? node.right : node.left;
    if (!affine) return undefined;
    return {
      coefficient: binaryNode("*", affine.coefficient, factor),
      constant: binaryNode("*", affine.constant, factor),
    };
  }
  if (node.operator === "/" && !rightContainsVariable) {
    const numerator = affineInVariable(node.left, variable);
    if (!numerator) return undefined;
    return {
      coefficient: binaryNode("/", numerator.coefficient, node.right),
      constant: binaryNode("/", numerator.constant, node.right),
    };
  }
  return undefined;
}

function containsVariable(node: Node, variable: "x" | "y"): boolean {
  switch (node.type) {
    case "restricted":
      return containsVariable(node.value, variable) || conditionContainsVariable(node.condition, variable);
    case "piecewise":
      return node.branches.some((branch) => containsVariable(branch.value, variable) ||
        conditionContainsVariable(branch.condition, variable)) ||
        Boolean(node.fallback && containsVariable(node.fallback, variable));
    case "variable":
      return node.name === variable;
    case "unary":
      return containsVariable(node.operand, variable);
    case "binary":
      return containsVariable(node.left, variable) || containsVariable(node.right, variable);
    case "call":
      return containsVariable(node.argument, variable);
    default:
      return false;
  }
}

function conditionContainsVariable(condition: Condition, variable: "x" | "y"): boolean {
  return condition.type === "logical"
    ? conditionContainsVariable(condition.left, variable) || conditionContainsVariable(condition.right, variable)
    : containsVariable(condition.left, variable) || containsVariable(condition.right, variable);
}

function compileCoordinateRegion(
  node: Node, variables: Record<string, number>, fast: boolean,
): ((x: number, y?: number) => string) | undefined {
  const check = (condition: Condition) => fast ? compileFastCondition(condition, variables)
    : (x: number, y?: number) => evaluateCondition(condition, new Decimal(x),
      y === undefined ? undefined : new Decimal(y), variables);
  const build = (tree: Node): ((x: number, y?: number) => string) | undefined => {
    if (tree.type === "piecewise") {
      const branches = tree.branches.map((branch) => ({
        condition: check(branch.condition), value: build(branch.value),
      }));
      const fallback = tree.fallback && build(tree.fallback);
      return (x, y) => {
        for (const [index, branch] of branches.entries()) {
          if (branch.condition(x, y)) return `${index}:${branch.value?.(x, y) ?? ""}`;
        }
        if (tree.fallback) return `fallback:${fallback?.(x, y) ?? ""}`;
        throw new UndefinedPointError();
      };
    }
    if (tree.type === "restricted") {
      const condition = check(tree.condition);
      const value = build(tree.value);
      return (x, y) => {
        if (!condition(x, y)) throw new UndefinedPointError();
        return value?.(x, y) ?? "";
      };
    }
    if (tree.type === "unary") return build(tree.operand);
    if (tree.type === "call") return build(tree.argument);
    if (tree.type !== "binary") return undefined;
    const left = build(tree.left);
    const right = build(tree.right);
    if (!left && !right) return undefined;
    return (x, y) => `${left?.(x, y) ?? ""}|${right?.(x, y) ?? ""}`;
  };
  return build(node);
}

function compileRegion(
  node: Node, variables: Record<string, number>, fast: boolean, sideways = false,
): ((parameter: number) => string) | undefined {
  const region = compileCoordinateRegion(node, variables, fast);
  return region && ((parameter) => sideways ? region(0, parameter) : region(parameter));
}

function tangentParameters(
  tree: Node,
  parameter: "x" | "y",
  variables: Record<string, number>,
): (() => { slope: number; offset: number }) | undefined {
  if (tree.type !== "call" || tree.name !== "tan") return undefined;
  const affine = affineInVariable(tree.argument, parameter);
  if (!affine || containsVariable(affine.coefficient, parameter) ||
      containsVariable(affine.constant, parameter)) return undefined;
  return () => ({
    slope: asDecimal(evaluate(affine.coefficient, new Decimal(0), new Decimal(0), variables)).toNumber(),
    offset: asDecimal(evaluate(affine.constant, new Decimal(0), new Decimal(0), variables)).toNumber(),
  });
}

function compileAffineEquation(
  left: Node,
  right: Node,
  variables: Record<string, number>,
  fast: boolean,
  solveFor: "x" | "y",
): Extract<GraphExpression, { kind: "explicit" | "sideways" }> | undefined {
  const parameter = solveFor === "x" ? "y" : "x";
  const leftAffine = affineInVariable(left, solveFor);
  const rightAffine = affineInVariable(right, solveFor);
  if (!leftAffine || !rightAffine) return undefined;
  const coefficient = binaryNode("-", leftAffine.coefficient, rightAffine.coefficient);
  const constant = binaryNode("-", leftAffine.constant, rightAffine.constant);
  if (containsVariable(coefficient, solveFor) || containsVariable(constant, solveFor) ||
      containsVariable(coefficient, parameter)) {
    return undefined;
  }
  const solution = binaryNode("/", negateNode(constant), coefficient);
  const kind = solveFor === "x" ? "sideways" : "explicit";
  const tangent = tangentParameters(solution, parameter, variables);
  const region = compileRegion(solution, variables, fast, solveFor === "x");

  if (fast) {
    const evaluateCoefficient = compileFastEvaluator(coefficient, variables);
    if (evaluateCoefficient(0, 0) === 0) return undefined;
    const evaluateSolution = compileFastEvaluator(solution, variables);
    return {
      kind,
      tangent,
      region,
      evaluate: (value: number) => {
        if (!Number.isFinite(value)) {
          throw new Error(`${parameter} must be a finite number`);
        }
        const result = evaluateSolution(
          solveFor === "x" ? 0 : value,
          solveFor === "x" ? value : 0,
        );
        if (!Number.isFinite(result)) {
          throw new Error(`Equation does not define a ${solveFor}-value for this ${parameter}`);
        }
        return assertFiniteFastResult(result);
      },
    };
  }

  if (asDecimal(evaluate(
    coefficient,
    new Decimal(0),
    new Decimal(0),
    variables,
  )).isZero()) {
    return undefined;
  }
  return {
    kind,
    tangent,
    region,
    evaluate: (value: number) => {
      if (!Number.isFinite(value)) {
        throw new Error(`${parameter} must be a finite number`);
      }
      const result = evaluate(
        solution,
        new Decimal(solveFor === "x" ? "0" : value.toString()),
        new Decimal(solveFor === "x" ? value.toString() : "0"),
        variables,
      );
      return {
        value: asDecimal(result),
        exact: result.kind === "rational",
      };
    },
  };
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

export function fitPolynomialRegression(
  xValues: number[],
  yValues: number[],
  degree: number,
): PolynomialRegression {
  if (!Number.isInteger(degree) || degree < 1 || degree > 5) {
    throw new Error("Regression degree must be between 1 and 5");
  }
  if (xValues.length !== yValues.length || xValues.length < degree + 1) {
    throw new Error(`A degree ${degree} regression needs at least ${degree + 1} data points`);
  }
  if (xValues.some((value) => !Number.isFinite(value)) ||
      yValues.some((value) => !Number.isFinite(value))) {
    throw new Error("Regression data must contain only finite numbers");
  }

  const xs = xValues.map((value) => new Decimal(value.toString()));
  const ys = yValues.map((value) => new Decimal(value.toString()));
  const center = xs.reduce((sum, value) => sum.plus(value), new Decimal(0)).div(xs.length);
  const scale = xs.reduce(
    (largest, value) => Decimal.max(largest, value.minus(center).abs()),
    new Decimal(0),
  );
  if (scale.isZero()) {
    throw new Error("Regression needs at least two distinct x-values");
  }

  const columns = Array.from({ length: degree + 1 }, (_, power) =>
    xs.map((value) => value.minus(center).div(scale).pow(power)));
  const orthogonal: Decimal[][] = [];
  const triangular = Array.from({ length: degree + 1 }, () =>
    Array.from({ length: degree + 1 }, () => new Decimal(0)));

  for (let column = 0; column <= degree; column += 1) {
    const vector = columns[column]!.slice();
    const originalNorm = vector
      .reduce((sum, value) => sum.plus(value.times(value)), new Decimal(0))
      .sqrt();
    for (let previous = 0; previous < column; previous += 1) {
      const projection = orthogonal[previous]!.reduce(
        (sum, value, index) => sum.plus(value.times(vector[index]!)),
        new Decimal(0),
      );
      triangular[previous]![column] = projection;
      for (let index = 0; index < vector.length; index += 1) {
        vector[index] = vector[index]!.minus(projection.times(orthogonal[previous]![index]!));
      }
    }
    const norm = vector.reduce((sum, value) => sum.plus(value.times(value)), new Decimal(0)).sqrt();
    if (norm.isZero() || norm.lt(originalNorm.times(new Decimal(10).pow(-Decimal.precision + 10)))) {
      throw new Error("Regression data does not support this polynomial degree");
    }
    triangular[column]![column] = norm;
    orthogonal.push(vector.map((value) => value.div(norm)));
  }

  const projected = orthogonal.map((column) =>
    column.reduce((sum, value, index) => sum.plus(value.times(ys[index]!)), new Decimal(0)));
  const coefficients = Array.from({ length: degree + 1 }, () => new Decimal(0));
  for (let row = degree; row >= 0; row -= 1) {
    let residual = projected[row]!;
    for (let column = row + 1; column <= degree; column += 1) {
      residual = residual.minus(triangular[row]![column]!.times(coefficients[column]!));
    }
    coefficients[row] = residual.div(triangular[row]![row]!);
  }
  const powerCoefficients = Array.from({ length: degree + 1 }, () => new Decimal(0));
  for (let normalizedPower = 0; normalizedPower <= degree; normalizedPower += 1) {
    let combination = 1;
    for (let power = 0; power <= normalizedPower; power += 1) {
      if (power > 0) {
        combination = combination * (normalizedPower - power + 1) / power;
      }
      const factor = new Decimal(combination)
        .times(center.negated().pow(normalizedPower - power))
        .div(scale.pow(normalizedPower));
      powerCoefficients[power] = powerCoefficients[power]!
        .plus(coefficients[normalizedPower]!.times(factor));
    }
  }
  return { center, scale, coefficients, powerCoefficients };
}

export function fitLogarithmicRegression(
  xValues: number[],
  yValues: number[],
): LogarithmicRegression {
  if (xValues.some((value) => value <= 0)) {
    throw new Error("Logarithmic regression requires positive x-values");
  }
  const fit = fitPolynomialRegression(xValues.map(Math.log), yValues, 1);
  return {
    intercept: fit.powerCoefficients[0]!,
    slope: fit.powerCoefficients[1]!,
  };
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | undefined {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) {
        pivot = row;
      }
    }
    const divisor = augmented[pivot]![column]!;
    if (Math.abs(divisor) < 1e-14) {
      return undefined;
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    for (let entry = column; entry <= size; entry += 1) {
      augmented[column]![entry] = augmented[column]![entry]! / divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let entry = column; entry <= size; entry += 1) {
        augmented[row]![entry] = augmented[row]![entry]! - factor * augmented[column]![entry]!;
      }
    }
  }
  return augmented.map((row) => row[size]!);
}

function validateTrigonometricData(xValues: number[], yValues: number[]): {
  center: number;
  span: number;
  minimumSpacing: number;
} {
  if (xValues.length !== yValues.length || xValues.length < 4) {
    throw new Error("Trigonometric regression needs at least 4 data points");
  }
  if (xValues.some((value) => !Number.isFinite(value)) ||
      yValues.some((value) => !Number.isFinite(value))) {
    throw new Error("Regression data must contain only finite numbers");
  }
  const pairs = xValues.map((x, index) => ({ x, y: yValues[index]! }))
    .sort((left, right) => left.x - right.x);
  const span = pairs[pairs.length - 1]!.x - pairs[0]!.x;
  if (span <= 0) {
    throw new Error("Regression needs at least two distinct x-values");
  }
  const spacings = pairs.slice(1).map((pair, index) => pair.x - pairs[index]!.x)
    .filter((spacing) => spacing > 0);
  if (spacings.length === 0) {
    throw new Error("Regression needs at least two distinct x-values");
  }
  return {
    center: (pairs[0]!.x + pairs[pairs.length - 1]!.x) / 2,
    span,
    minimumSpacing: Math.min(...spacings),
  };
}

function fitSineFrequency(
  xValues: number[],
  yValues: number[],
  frequency: number,
): { amplitude: number; phase: number; offset: number; error: number } | undefined {
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  const right = [0, 0, 0];
  const basis = xValues.map((x) => [Math.sin(frequency * x), Math.cos(frequency * x), 1]);
  for (let index = 0; index < basis.length; index += 1) {
    for (let row = 0; row < 3; row += 1) {
      right[row] += basis[index]![row]! * yValues[index]!;
      for (let column = 0; column < 3; column += 1) {
        matrix[row]![column] += basis[index]![row]! * basis[index]![column]!;
      }
    }
  }
  const coefficients = solveLinearSystem(matrix, right);
  if (!coefficients) {
    return undefined;
  }
  const [sine, cosine, offset] = coefficients;
  const amplitude = Math.hypot(sine!, cosine!);
  const phase = Math.atan2(cosine!, sine!);
  const error = xValues.reduce((sum, x, index) => {
    const residual = yValues[index]! -
      (amplitude * Math.sin(frequency * x + phase) + offset!);
    return sum + residual * residual;
  }, 0);
  return { amplitude, phase, offset: offset!, error };
}

export function fitExponentialRegression(
  xValues: number[],
  yValues: number[],
): ExponentialRegression {
  if (xValues.length !== yValues.length || xValues.length < 2) {
    throw new Error("Exponential regression needs at least two matching data points");
  }
  if (yValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Exponential regression requires positive y-values");
  }
  const fit = fitPolynomialRegression(xValues, yValues.map(Math.log), 1);
  return {
    scale: fit.powerCoefficients[0]!.exp(),
    rate: fit.powerCoefficients[1]!,
  };
}

export function fitPowerRegression(
  xValues: number[],
  yValues: number[],
): PowerRegression {
  if (xValues.length !== yValues.length || xValues.length < 2) {
    throw new Error("Power regression needs at least two matching data points");
  }
  if (xValues.some((value) => !Number.isFinite(value) || value <= 0) ||
      yValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Power regression requires positive x- and y-values");
  }
  const fit = fitPolynomialRegression(xValues.map(Math.log), yValues.map(Math.log), 1);
  return {
    scale: fit.powerCoefficients[0]!.exp(),
    exponent: fit.powerCoefficients[1]!,
  };
}

export function fitSineRegression(xValues: number[], yValues: number[]): TrigonometricRegression {
  const { span, minimumSpacing } = validateTrigonometricData(xValues, yValues);
  const minimumFrequency = Math.max(1e-8, Math.PI / (span * 4));
  const maximumFrequency = Math.min(1_000_000, Math.PI / minimumSpacing * 0.9);
  const frequencyCount = 320;
  let best: { frequency: number; amplitude: number; phase: number; offset: number; error: number }
    | undefined;
  const frequencies = Array.from({ length: frequencyCount + 1 }, (_, index) =>
    minimumFrequency + (maximumFrequency - minimumFrequency) * index / frequencyCount);
  for (const frequency of frequencies) {
    const fit = fitSineFrequency(xValues, yValues, frequency);
    if (fit && Number.isFinite(fit.error) && (!best || fit.error < best.error)) {
      best = { frequency, ...fit };
    }
  }
  if (!best) {
    throw new Error("Could not fit a sine regression to these data");
  }
  const index = frequencies.findIndex((frequency) => frequency === best!.frequency);
  let left = frequencies[Math.max(0, index - 1)]!;
  let right = frequencies[Math.min(frequencyCount, index + 1)]!;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let first = right - ratio * (right - left);
  let second = left + ratio * (right - left);
  let firstFit = fitSineFrequency(xValues, yValues, first)!;
  let secondFit = fitSineFrequency(xValues, yValues, second)!;
  for (let iteration = 0; iteration < 36; iteration += 1) {
    if (firstFit.error < secondFit.error) {
      right = second;
      second = first;
      secondFit = firstFit;
      first = right - ratio * (right - left);
      firstFit = fitSineFrequency(xValues, yValues, first)!;
    } else {
      left = first;
      first = second;
      firstFit = secondFit;
      second = left + ratio * (right - left);
      secondFit = fitSineFrequency(xValues, yValues, second)!;
    }
  }
  const refined = firstFit.error < secondFit.error ? { frequency: first, ...firstFit }
    : { frequency: second, ...secondFit };
  return {
    model: "sine",
    amplitude: refined.amplitude,
    frequency: refined.frequency,
    phase: refined.phase,
    offset: refined.offset,
  };
}

function tangentFitError(
  xValues: number[],
  yValues: number[],
  parameters: number[],
): number {
  const [amplitude, frequency, phase, offset] = parameters;
  let error = 0;
  for (let index = 0; index < xValues.length; index += 1) {
    const angle = frequency! * xValues[index]! + phase!;
    if (Math.abs(Math.cos(angle)) < 1e-5) {
      return Number.POSITIVE_INFINITY;
    }
    const predicted = amplitude! * Math.tan(angle) + offset!;
    if (!Number.isFinite(predicted) || Math.abs(predicted) > 1e12) {
      return Number.POSITIVE_INFINITY;
    }
    error += (yValues[index]! - predicted) ** 2;
  }
  return error;
}

export function fitTangentRegression(
  xValues: number[],
  yValues: number[],
): TrigonometricRegression {
  const { span, minimumSpacing, center } = validateTrigonometricData(xValues, yValues);
  const sortedX = [...xValues].sort((left, right) => left - right);
  const sortedY = xValues.map((x, index) => ({ x, y: yValues[index]! }))
    .sort((left, right) => left.x - right.x).map(({ y }) => y);
  const minimumFrequency = Math.max(1e-8, Math.PI / (span * 4));
  const maximumFrequency = Math.min(1_000, Math.PI / minimumSpacing * 0.8);
  const mean = yValues.reduce((sum, value) => sum + value, 0) / yValues.length;
  const range = Math.max(...yValues) - Math.min(...yValues);
  let bestParameters: number[] | undefined;
  let bestError = Number.POSITIVE_INFINITY;

  for (let frequencyIndex = 0; frequencyIndex < 36; frequencyIndex += 1) {
    const frequency = minimumFrequency +
      (maximumFrequency - minimumFrequency) * frequencyIndex / 35;
    for (const phaseOffset of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) {
      for (const sign of [-1, 1]) {
        let parameters = [sign * Math.max(range / 4, 1e-6), frequency,
          phaseOffset - frequency * center, mean];
        let error = tangentFitError(sortedX, sortedY, parameters);
        let damping = 1e-3;
        for (let iteration = 0; iteration < 60 && Number.isFinite(error); iteration += 1) {
          const normal = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
          const gradient = [0, 0, 0, 0];
          for (let index = 0; index < sortedX.length; index += 1) {
            const x = sortedX[index]!;
            const angle = parameters[1]! * x + parameters[2]!;
            const tangent = Math.tan(angle);
            const secantSquared = 1 / Math.cos(angle) ** 2;
            if (!Number.isFinite(tangent) || Math.abs(tangent) > 1e8) {
              continue;
            }
            const derivatives = [
              tangent,
              parameters[0]! * secantSquared * x,
              parameters[0]! * secantSquared,
              1,
            ];
            const residual = sortedY[index]! -
              (parameters[0]! * tangent + parameters[3]!);
            for (let row = 0; row < 4; row += 1) {
              gradient[row] += derivatives[row]! * residual;
              for (let column = 0; column < 4; column += 1) {
                normal[row]![column] += derivatives[row]! * derivatives[column]!;
              }
            }
          }
          for (let diagonal = 0; diagonal < 4; diagonal += 1) {
            normal[diagonal]![diagonal] += damping *
              Math.max(normal[diagonal]![diagonal]!, 1);
          }
          const delta = solveLinearSystem(normal, gradient);
          if (!delta?.every(Number.isFinite)) {
            break;
          }
          const candidate = parameters.map((value, index) => value + delta[index]!);
          candidate[1] = Math.max(minimumFrequency, Math.min(maximumFrequency, candidate[1]!));
          const candidateError = tangentFitError(sortedX, sortedY, candidate);
          if (candidateError < error) {
            parameters = candidate;
            if (Math.abs(error - candidateError) <= 1e-12 * Math.max(1, error)) {
              error = candidateError;
              break;
            }
            error = candidateError;
            damping = Math.max(1e-9, damping / 3);
          } else {
            damping = Math.min(1e12, damping * 10);
            if (damping >= 1e12) {
              break;
            }
          }
        }
        if (error < bestError) {
          bestError = error;
          bestParameters = parameters;
        }
      }
    }
  }
  if (!bestParameters || !Number.isFinite(bestError)) {
    throw new Error("Could not fit a tangent regression to these data");
  }
  return {
    model: "tangent",
    amplitude: bestParameters[0]!,
    frequency: bestParameters[1]!,
    phase: bestParameters[2]!,
    offset: bestParameters[3]!,
  };
}

export function compileExpression(
  source: string,
  variables: Record<string, number> = {},
  allowY = false,
): (x: number, y?: number) => Evaluation {
  const tree = parse(source, allowY, true, Object.keys(variables));
  const xCoordinates = new Map<number, Decimal>();
  const yCoordinates = new Map<number, Decimal>();
  return (x: number, y?: number) => {
    if (!Number.isFinite(x)) {
      throw new Error("x must be a finite number");
    }
    if (allowY && !Number.isFinite(y)) {
      throw new Error("y must be a finite number");
    }
    const result = evaluate(
      tree,
      cachedCoordinate(xCoordinates, x),
      allowY ? cachedCoordinate(yCoordinates, y!) : undefined,
      variables,
    );
    return { value: asDecimal(result), exact: result.kind === "rational" };
  };
}

export function compileTickerAction(
  source: string,
  variables: Record<string, number>,
): { target: string; evaluate: () => number } {
  const match = /^\s*([a-z](?:_[a-z0-9]+)?)\s*=\s*(.+)\s*$/i.exec(source);
  if (!match) {
    throw new Error("Ticker action must be an assignment such as a = a + 1");
  }
  const target = match[1]!.toLowerCase();
  if (["e", "x", "y", "t"].includes(target)) {
    throw new Error(`"${target}" cannot be updated by a ticker`);
  }
  if (!Object.hasOwn(variables, target)) {
    throw new Error(`Ticker target "${target}" is not an available slider`);
  }
  const evaluateValue = compileExpression(match[2]!, variables);
  return {
    target,
    evaluate: () => {
      const value = evaluateValue(0).value.toNumber();
      if (!Number.isFinite(value)) {
        throw new Error("Ticker action must produce a finite number");
      }
      return value;
    },
  };
}

export function compileColorExpression(
  source: string,
  variables: Record<string, number>,
  fast = false,
): (x: number, y: number) => number {
  const tree = parse(source, true, false, Object.keys(variables));
  if (fast) {
    const evaluate = compileFastEvaluator(tree, variables);
    return (x, y) => assertFiniteFastResult(evaluate(x, y));
  }
  return (x, y) => asDecimal(evaluate(
      tree,
      new Decimal(x.toString()),
      new Decimal(y.toString()),
      variables,
    )).toNumber();
}

export function hexToHsv(hex: string): [number, number, number] {
  if (!/^#[\da-f]{6}$/i.test(hex)) {
    throw new Error("Color must be a six-digit hex value");
  }
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const difference = maximum - minimum;
  let hue = 0;
  if (difference !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / difference) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / difference + 2);
    else hue = 60 * ((red - green) / difference + 4);
  }
  if (hue < 0) hue += 360;
  const saturation = maximum === 0 ? 0 : difference / maximum;
  return [hue, saturation, maximum];
}

export function hsvToHex(hue: number, saturation: number, value: number): string {
  if (![hue, saturation, value].every(Number.isFinite)) {
    throw new Error("HSV values must be finite numbers");
  }
  const normalizedHue = Math.min(360, Math.max(0, hue)) / 60;
  const normalizedSaturation = Math.min(1, Math.max(0, saturation));
  const normalizedValue = Math.min(1, Math.max(0, value));
  const chroma = normalizedValue * normalizedSaturation;
  const secondary = chroma * (1 - Math.abs(normalizedHue % 2 - 1));
  const offset = normalizedValue - chroma;
  const sector = Math.floor(normalizedHue);
  const [red, green, blue] = sector === 0 ? [chroma, secondary, 0]
    : sector === 1 ? [secondary, chroma, 0]
      : sector === 2 ? [0, chroma, secondary]
        : sector === 3 ? [0, secondary, chroma]
          : sector === 4 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function compileImplicitEquation(
  source: string,
  variables: Record<string, number> = {},
): PreciseImplicitEvaluation {
  const relation = graphRelation(source);
  if (relation?.operator !== "=" || graphRelation(source.slice(relation.index + 1))) {
    throw new Error("Implicit equations must contain exactly one equals sign, for example x^2 + y^2 = 4");
  }
  const splitAt = relation.index;
  const leftSource = source.slice(0, splitAt);
  const rightSource = source.slice(splitAt + 1);
  if (!leftSource.trim() || !rightSource.trim()) {
    throw new Error("Both sides of an implicit equation need an expression");
  }
  const variableNames = Object.keys(variables);
  const left = parse(leftSource, true, false, variableNames);
  const right = parse(rightSource, true, false, variableNames);
  const xCoordinates = new Map<number, Decimal>();
  const yCoordinates = new Map<number, Decimal>();
  const compiled: PreciseImplicitEvaluation = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("x and y must be finite numbers");
    }
    const xValue = cachedCoordinate(xCoordinates, x);
    const yValue = cachedCoordinate(yCoordinates, y);
    return asDecimal(evaluate(left, xValue, yValue, variables))
      .minus(asDecimal(evaluate(right, xValue, yValue, variables)));
  };
  return compiled;
}

function splitCallArguments(source: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(" || source[index] === "{") depth += 1;
    if (source[index] === ")" || source[index] === "}") depth -= 1;
    if (source[index] === "," && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(source.slice(start).trim());
  return result;
}

export function graphRelation(source: string): { index: number; operator: Comparison } | undefined {
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(" || char === "{") depth += 1;
    if (char === ")" || char === "}") depth -= 1;
    if (depth !== 0) continue;
    const match = /^(<=|>=|!=|[<>=≤≥≠])/.exec(source.slice(index));
    if (match) {
      const operator = match[0] === "≤" ? "<=" : match[0] === "≥" ? ">=" :
        match[0] === "≠" ? "!=" : match[0] as Comparison;
      return { index, operator };
    }
  }
  return undefined;
}

function compileRestrictedGraph(
  source: string, variables: Record<string, number>, fast: boolean, statisticsMode: StatisticsMode,
): GraphExpression | undefined {
  let depth = 0;
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{" && depth === 0 && index > 0 &&
        !/[+\-*/^(:,=<>]$/.test(source.slice(0, index).trim())) {
      start = index;
      break;
    }
    if (char === "(" || char === "{") depth += 1;
    if (char === ")" || char === "}") depth -= 1;
  }
  if (start < 0) return undefined;
  const suffix = source.slice(start);
  let braceDepth = 0;
  for (const char of suffix) {
    if (braceDepth === 0 && char !== "{" && !/\s/.test(char)) {
      throw new Error("Restrictions must follow the complete graph expression.");
    }
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;
    if (braceDepth < 0) throw new Error("Unexpected closing restriction bracket.");
  }
  if (braceDepth !== 0) throw new Error("Missing closing restriction bracket.");
  // A postfix restriction must consist entirely of trailing condition groups.
  const restricted = parse(`1${suffix}`, true, false, Object.keys(variables));
  if (restricted.type !== "restricted") throw new Error("Restrictions must follow the complete graph expression.");
  const base = source.slice(0, start).trim();
  const graph = fast ? compileFastGraphExpression(base, variables, statisticsMode) : compileGraphExpression(base, variables, statisticsMode);
  const condition = fast ? compileFastEvaluator(restricted, variables) : undefined;
  const check = (x: number, y: number) => {
    if (condition) condition(x, y);
    else evaluate(restricted, new Decimal(x), new Decimal(y), variables);
  };
  if (graph.kind === "explicit" || graph.kind === "sideways") {
    return {
      kind: graph.kind,
      region: graph.region,
      evaluate: (parameter: number) => {
        const result = graph.evaluate(parameter);
        const output = typeof result === "number" ? result : result.value.toNumber();
        check(graph.kind === "sideways" ? output : parameter, graph.kind === "sideways" ? parameter : output);
        return result;
      },
    };
  }
  if (graph.kind === "implicit" || graph.kind === "inequality") {
    return {
      ...graph,
      evaluate: (x, y) => {
        check(x, y);
        return graph.evaluate(x, y);
      },
    };
  }
  if (graph.kind === "point") {
    return {
      ...graph,
      evaluate: () => {
        const point = graph.evaluate();
        check(...point);
        return point;
      },
    };
  }
  if (graph.kind === "parametric") {
    return {
      ...graph,
      evaluate: (parameter: number) => {
        const point = graph.evaluate(parameter);
        check(...point);
        return point;
      },
    };
  }
  if (graph.kind === "collection" || graph.kind === "polygon") {
    throw new Error("Apply restrictions within each collection expression.");
  }
  return {
    ...graph,
    evaluate: () => graph.evaluate().map((value, index) => {
      if (value === undefined) return undefined;
      try {
        check(index + 1, value);
        return value;
      } catch (reason) {
        if (reason instanceof UndefinedPointError) return undefined;
        throw reason;
      }
    }),
  };
}

function compileInequality(
  source: string,
  variables: Record<string, number>,
  fast: boolean,
): Extract<GraphExpression, { kind: "inequality" }> {
  const comparison = graphRelation(source);
  if (!comparison || !["<", "<=", ">", ">="].includes(comparison.operator)) {
    throw new Error("Inequalities need an expression on both sides, such as y > x^2");
  }
  const leftSource = source.slice(0, comparison.index);
  const symbolLength = /[≤≥]/.test(source[comparison.index]!) ? 1 : comparison.operator.length;
  const rightSource = source.slice(comparison.index + symbolLength);
  if (!leftSource.trim() || !rightSource.trim()) {
    throw new Error("Inequalities need an expression on both sides, such as y > x^2");
  }
  const relation = comparison.operator;
  if (graphRelation(rightSource)) {
    throw new Error("Use one comparison operator per inequality");
  }
  const left = parse(leftSource!, true, false, Object.keys(variables));
  const right = parse(rightSource!, true, false, Object.keys(variables));
  let evaluateFastDifference: FastEvaluator | undefined;
  if (fast) {
    const evaluateLeft = compileFastEvaluator(left, variables);
    const evaluateRight = compileFastEvaluator(right, variables);
    evaluateFastDifference = (x, y) => evaluateLeft(x, y) - evaluateRight(x, y);
  }
  return {
    kind: "inequality",
    relation: relation as "<" | "<=" | ">" | ">=",
    region: compileCoordinateRegion(binaryNode("-", left, right), variables, fast),
    evaluate: (x, y) => {
      if (evaluateFastDifference) return assertFiniteFastResult(evaluateFastDifference(x, y));
      return asDecimal(evaluate(left, new Decimal(x.toString()), new Decimal(y.toString()), variables))
        .minus(asDecimal(evaluate(right, new Decimal(x.toString()), new Decimal(y.toString()), variables)));
    },
  };
}

function compileParametric(
  source: string,
  variables: Record<string, number>,
  polar: boolean,
): Extract<GraphExpression, { kind: "parametric" }> {
  const open = source.indexOf("(");
  if (open < 0 || !source.endsWith(")")) {
    throw new Error("Use parametric(x(t), y(t), start, end) or polar(r(t), start, end)");
  }
  const args = splitCallArguments(source.slice(open + 1, -1));
  const expected = polar ? 3 : 4;
  if (args.length !== expected || args.some((part) => !part)) {
    throw new Error(polar
      ? "Polar graphs need a radius and start/end angles, for example polar(2, 0, 2pi)"
      : "Parametric graphs need x(t), y(t), and start/end values");
  }
  const values = { ...variables, t: 0 };
  const first = compileExpression(args[0]!, values);
  const second = polar ? undefined : compileExpression(args[1]!, values);
  const firstRegion = compileRegion(parse(args[0]!, false, true, Object.keys(values)), values, false);
  const secondRegion = polar ? undefined : compileRegion(parse(args[1]!, false, true, Object.keys(values)), values, false);
  const start = compileExpression(args[polar ? 1 : 2]!, variables)(0).value.toNumber();
  const end = compileExpression(args[polar ? 2 : 3]!, variables)(0).value.toNumber();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) {
    throw new Error("Graph parameter bounds must be finite and different");
  }
  return {
    kind: "parametric",
    start,
    end,
    region: firstRegion || secondRegion ? (parameter) => {
      values.t = parameter;
      return `${firstRegion?.(parameter) ?? ""}|${secondRegion?.(parameter) ?? ""}`;
    } : undefined,
    evaluate: (parameter) => {
      values.t = parameter;
      const firstValue = first(parameter).value.toNumber();
      if (polar) {
        return [
          firstValue * Math.cos(parameter),
          firstValue * Math.sin(parameter),
        ];
      }
      return [firstValue, second!(parameter).value.toNumber()];
    },
  };
}

function compileCalculusGraph(
  source: string,
  variables: Record<string, number>,
  derivative: boolean,
): Extract<GraphExpression, { kind: "explicit" }> {
  const open = source.indexOf("(");
  if (open < 0 || !source.endsWith(")")) {
    throw new Error(derivative
      ? "Use derivative(expression), for example derivative(x^2)"
      : "Use integral(expression, start, end), for example integral(x^2, 0, x)");
  }
  const args = splitCallArguments(source.slice(open + 1, -1));
  if (derivative && args.length === 1 && args[0]) {
    const fn = compileExpression(args[0], variables);
    return {
      kind: "explicit",
      evaluate: (x) => {
        const step = Math.pow(Number.EPSILON, 0.2) * Math.max(1, Math.abs(x));
        const value = (at: number) => fn(at).value.toNumber();
        return (
          value(x - 2 * step) - 8 * value(x - step) +
          8 * value(x + step) - value(x + 2 * step)
        ) / (12 * step);
      },
    };
  }
  if (!derivative && args.length === 3 && args.every(Boolean)) {
    const fn = compileExpression(args[0]!, variables);
    const lower = compileExpression(args[1]!, variables);
    const upper = compileExpression(args[2]!, variables);
    return {
      kind: "explicit",
      evaluate: (x) => {
        const start = lower(x).value.toNumber();
        const end = upper(x).value.toNumber();
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          throw new Error("Integral bounds must be finite");
        }
        const intervals = 256;
        const step = (end - start) / intervals;
        let total = fn(start).value.toNumber() + fn(end).value.toNumber();
        for (let index = 1; index < intervals; index += 1) {
          total += (index % 2 === 0 ? 2 : 4) *
            fn(start + step * index).value.toNumber();
        }
        return total * step / 3;
      },
    };
  }
  throw new Error(derivative
    ? "Derivative graphs need one expression"
    : "Integral graphs need an expression and two bounds");
}

function compileListGraph(
  source: string,
  variables: Record<string, number>,
): Extract<GraphExpression, { kind: "list" }> {
  const args = splitCallArguments(source.slice(source.indexOf("(") + 1, -1));
  if (args.length === 0 || args.some((argument) => !argument)) {
    throw new Error("Lists need one or more comma-separated values, for example list(2, 4, 6)");
  }
  const values = args.map((argument) => compileExpression(argument, variables));
  return {
    kind: "list",
    evaluate: () => values.map((value) => value(0).value.toNumber()),
  };
}

const POINT_NON_SLIDER_VARIABLES = new Set(["e", "x", "y", "t"]);

function compilePointGraph(
  source: string,
  variables: Record<string, number>,
): Extract<GraphExpression, { kind: "point" }> | undefined {
  const coordinates = pointSources(source);
  if (!coordinates) return undefined;
  const variablesInCoordinate = (coordinate: string): string[] => {
    const identifiers = coordinate.match(/[a-z]+(?:_[a-z0-9]+)?/gi)?.map((name) => name.toLowerCase()) ?? [];
    const sliderVariables = [...new Set(identifiers.filter((name) =>
      name !== "pi" && name !== "e" && name !== "and" && name !== "or" && !functions.has(name)))];
    if (sliderVariables.some((name) =>
      !/^[a-z](?:_[a-z0-9]+)?$/.test(name) || POINT_NON_SLIDER_VARIABLES.has(name))) {
      throw new Error("Draggable point coordinates must use slider variables and supported math operations");
    }
    return sliderVariables;
  };
  const xVariables = variablesInCoordinate(coordinates[0]!);
  const yVariables = variablesInCoordinate(coordinates[1]!);
  const xCoordinate = compileExpression(coordinates[0]!, variables);
  const yCoordinate = compileExpression(coordinates[1]!, variables);
  return {
    kind: "point",
    xVariables,
    yVariables,
    evaluate: () => [
      xCoordinate(0).value.toNumber(),
      yCoordinate(0).value.toNumber(),
    ],
  };
}

function compileStatisticsGraph(
  source: string,
  variables: Record<string, number>,
  statisticsMode: StatisticsMode,
): Extract<GraphExpression, { kind: "explicit" }> {
  const match = /^([a-z]+)\((.*)\)$/i.exec(source.trim());
  if (!match) throw new Error("Use a supported statistics function with comma-separated values");
  const name = match[1]!.toLowerCase();
  const args = splitCallArguments(match[2]!);
  const unaryNames = new Set(["factorial"]);
  const supported = new Set([
    "sum", "product", "min", "max", "mean", "median", "variance", "stdev", "variancep", "stdevp", "var", "varp", "factorial",
  ]);
  if (!supported.has(name)) throw new Error(`Unknown statistics function "${name}"`);
  if (args.length === 0 || args.some((argument) => !argument) ||
      (unaryNames.has(name) && args.length !== 1)) {
    throw new Error(`${name} has an invalid number of arguments`);
  }
  const values = args.map((argument) => compileExpression(argument, variables));
  return {
    kind: "explicit",
    evaluate: (x) => {
      const numbers = values.map((value) => value(x).value.toNumber());
      if (numbers.some((value) => !Number.isFinite(value))) {
        throw new Error(`${name} requires finite values`);
      }
      if (name === "factorial") {
        const n = numbers[0]!;
        if (!Number.isInteger(n) || n < 0 || n > 170) {
          throw new Error("factorial requires a whole number from 0 to 170");
        }
        let result = 1;
        for (let factor = 2; factor <= n; factor += 1) result *= factor;
        return result;
      }
      if (name === "sum") return numbers.reduce((sum, value) => sum + value, 0);
      if (name === "product") return numbers.reduce((product, value) => product * value, 1);
      if (name === "min") return Math.min(...numbers);
      if (name === "max") return Math.max(...numbers);
      if (name === "mean") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      const sorted = [...numbers].sort((left, right) => left - right);
      if (name === "median") {
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[middle - 1]! + sorted[middle]!) / 2
          : sorted[middle]!;
      }
      const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      const denominator = numbers.length - (statisticsMode === "sample" && !name.endsWith("p") ? 1 : 0);
      if (denominator <= 0) throw new Error("Sample variance and standard deviation require at least two values.");
      const variance = numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / denominator;
      return name.startsWith("stdev") ? Math.sqrt(variance) : variance;
    },
  };
}

export function compileGraphExpression(
  source: string,
  variables: Record<string, number> = {},
  statisticsMode: StatisticsMode = "population",
):
  GraphExpression {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  const trimmed = source.trim();
  const collection = compileCollectionGraph(trimmed, variables, {}, false, statisticsMode);
  if (collection) return collection;
  const restricted = compileRestrictedGraph(trimmed, variables, false, statisticsMode);
  if (restricted) return restricted;
  const relation = graphRelation(trimmed);
  const point = compilePointGraph(trimmed, variables);
  if (point) return point;
  if (/^list\s*\(/i.test(trimmed)) {
    return compileListGraph(trimmed, variables);
  }
  if (/^(?:sum|product|min|max|mean|median|variance|stdev|variancep|stdevp|var|varp|factorial)\s*\(/i.test(trimmed)) {
    return compileStatisticsGraph(trimmed, variables, statisticsMode);
  }
  if (/^derivative\s*\(/i.test(trimmed)) {
    return compileCalculusGraph(trimmed, variables, true);
  }
  if (/^integral\s*\(/i.test(trimmed)) {
    return compileCalculusGraph(trimmed, variables, false);
  }
  if (/^parametric\s*\(/i.test(trimmed)) {
    return compileParametric(trimmed, variables, false);
  }
  if (/^polar\s*\(/i.test(trimmed)) {
    return compileParametric(trimmed, variables, true);
  }
  if (relation && relation.operator !== "=") {
    return compileInequality(trimmed, variables, false);
  }
  if (/^\s*y\s*=/i.test(source)) {
    const tree = parse(source, false, true, Object.keys(variables));
    return {
      kind: "explicit", evaluate: compileExpression(source, variables),
      tangent: tangentParameters(tree, "x", variables),
      region: compileRegion(tree, variables, false),
    };
  }
  if (relation?.operator === "=") {
    if (!graphRelation(source.slice(relation.index + 1))) {
      const splitAt = relation.index;
      const variableNames = Object.keys(variables);
      const left = parse(source.slice(0, splitAt), true, false, variableNames);
      const right = parse(source.slice(splitAt + 1), true, false, variableNames);
      const explicit = compileAffineEquation(left, right, variables, false, "y") ??
        compileAffineEquation(left, right, variables, false, "x");
      if (explicit) return explicit;
      return {
        kind: "implicit", evaluate: compileImplicitEquation(source, variables),
        region: compileCoordinateRegion(binaryNode("-", left, right), variables, false),
      };
    }
    return { kind: "implicit", evaluate: compileImplicitEquation(source, variables) };
  }
  return {
    kind: "explicit", evaluate: compileExpression(source, variables),
    tangent: tangentParameters(parse(source, false, true, Object.keys(variables)), "x", variables),
    region: compileRegion(parse(source, false, true, Object.keys(variables)), variables, false),
  };
}

export function compileCollectionGraph(
  source: string, variables: Record<string, number>,
  lists: Record<string, string[]> = {}, fast = false,
  statisticsMode: StatisticsMode = "population",
): GraphExpression | undefined {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  if (/^polygon\s*\(/i.test(source.trim())) {
    const trimmed = source.trim();
    if (!trimmed.endsWith(")")) throw new Error("Use polygon((x1,y1),(x2,y2),(x3,y3),...).");
    const vertices = splitCollectionParts(trimmed.slice(trimmed.indexOf("(") + 1, -1))
      .flatMap((item) => expandCollections(item, (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode).items);
    if (vertices.length < 3 || vertices.length > 2048) throw new Error("Polygons need 3 to 2048 vertices.");
    const coordinates = vertices.map((vertex) => {
      const point = pointSources(vertex);
      if (!point) throw new Error("Each polygon vertex must be a point (x,y).");
      if (point.some((item) => (item.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).some((name) => ["x", "y", "t"].includes(name.toLowerCase())))) {
        throw new Error("Polygon vertices must use scalar coordinates or sliders, not x, y, or t.");
      }
      return point.map((item) => compileExpression(item, variables));
    });
    return {
      kind: "polygon",
      evaluate: () => coordinates.map((point): [number, number] => {
        const x = point[0]!(0).value.toNumber();
        const y = point[1]!(0).value.toNumber();
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Polygon coordinates must be finite.");
        return [x, y];
      }),
    };
  }
  if (!hasCollections(source, lists)) return undefined;
  const expansion = expandCollections(source, (item) => compileExpression(item, variables)(0).value.toNumber(), lists, statisticsMode);
  if (!expansion.list) {
    const graph = fast ? compileFastGraphExpression(expansion.items[0]!, variables, statisticsMode) :
      compileGraphExpression(expansion.items[0]!, variables, statisticsMode);
    if (expansion.approximate && graph.kind === "explicit") {
      return { ...graph, evaluate: (x: number) => {
        const value = graph.evaluate(x);
        return typeof value === "number" ? value : { ...value, exact: false };
      } };
    }
    return graph;
  }
  const graphs = expansion.items.map((item) => fast ? compileFastGraphExpression(item, variables, statisticsMode) :
    compileGraphExpression(item, variables, statisticsMode));
  if (graphs.every((graph, index) => graph.kind === "explicit" &&
      !(expansion.items[index]!.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).some((name) => ["x", "y"].includes(name.toLowerCase())) &&
      !graphRelation(expansion.items[index]!))) {
    return {
      kind: "list",
      evaluate: () => graphs.map((graph) => {
        if (graph.kind !== "explicit") throw new Error("Expected a scalar list element.");
        const result = graph.evaluate(0);
        return typeof result === "number" ? result : result.value.toNumber();
      }),
    };
  }
  return { kind: "collection", graphs };
}

export function compileFastGraphExpression(
  source: string,
  variables: Record<string, number> = {},
  statisticsMode: StatisticsMode = "population",
): GraphExpression {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  const trimmed = source.trim();
  const collection = compileCollectionGraph(trimmed, variables, {}, true, statisticsMode);
  if (collection) return collection;
  const restricted = compileRestrictedGraph(trimmed, variables, true, statisticsMode);
  if (restricted) return restricted;
  const relation = graphRelation(trimmed);
  const point = compilePointGraph(trimmed, variables);
  if (point) return point;
  if (/^(?:list|sum|product|min|max|mean|median|variance|stdev|variancep|stdevp|var|varp|factorial)\s*\(/i.test(trimmed)) {
    return compileGraphExpression(trimmed, variables, statisticsMode);
  }

  if (/^(?:derivative|integral)\s*\(/i.test(trimmed)) {
    return compileGraphExpression(trimmed, variables, statisticsMode);
  }

  if (/^(?:parametric|polar)\s*\(/i.test(trimmed)) {
    return compileGraphExpression(trimmed, variables, statisticsMode);
  }
  if (relation && relation.operator !== "=") {
    return compileInequality(trimmed, variables, true);
  }
  if (/^\s*y\s*=/i.test(source) || !relation) {
    const tree = parse(source, false, true, Object.keys(variables));
    const evaluate = compileFastEvaluator(tree, variables);
    return {
      kind: "explicit",
      tangent: tangentParameters(tree, "x", variables),
      region: compileRegion(tree, variables, true),
      evaluate: (x: number) => {
        if (!Number.isFinite(x)) {
          throw new Error("x must be a finite number");
        }
        return assertFiniteFastResult(evaluate(x));
      },
    };
  }

  if (!relation || relation.operator !== "=" || graphRelation(source.slice(relation.index + 1))) {
    throw new Error("Implicit equations must contain exactly one equals sign, for example x^2 + y^2 = 4");
  }
  const splitAt = relation.index;
  const leftSource = source.slice(0, splitAt);
  const rightSource = source.slice(splitAt + 1);
  if (!leftSource.trim() || !rightSource.trim()) {
    throw new Error("Both sides of an implicit equation need an expression");
  }
  const variableNames = Object.keys(variables);
  const left = parse(leftSource, true, false, variableNames);
  const right = parse(rightSource, true, false, variableNames);
  const explicit = compileAffineEquation(left, right, variables, true, "y") ??
    compileAffineEquation(left, right, variables, true, "x");
  if (explicit) return explicit;
  const evaluateLeftFast = compileFastEvaluator(left, variables);
  const evaluateRightFast = compileFastEvaluator(right, variables);
  return {
    kind: "implicit",
    region: compileCoordinateRegion(binaryNode("-", left, right), variables, true),
    evaluate: (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error("x and y must be finite numbers");
      }
      return assertFiniteFastResult(
        evaluateLeftFast(x, y) - evaluateRightFast(x, y),
      );
    },
  };
}
