import Decimal from "decimal.js";
import { expandCollections, hasCollections, INTERNAL_COLLECTION_FUNCTIONS, splitCollectionParts, type StatisticsMode } from "./collections";
import { pointSources } from "./geometry";
import { statisticalPlotShapes } from "./statisticalPlots";
import { DISTRIBUTION_NAMES, PROBABILITY_KERNELS, isProbabilityKernel, probabilityKernel } from "./probability";
import { distributionCall, readDistribution, rewriteDistributions } from "./distributionSyntax";
import { inferenceCall, inferenceProperty, readInference, rewriteInferenceProperties } from "./inference";
import { rewriteRandom } from "./randomSyntax";
import { complex, add, sub, mul, div, pow, neg, complexFunction, integrateComplex, COMPLEX_FUNCTIONS, type Complex } from "./complex";
import { polygonSignedDistance } from "./graphAnalysis";
import { solveDifferentialEquation, interpolateSolution, solveTrajectory } from "./differentialEquations";
import { ADVANCED_GRAPH_NAMES, RESULT_COMMAND_NAMES, commandArguments, domainColor, fractalColor, inverseMatrix, multiplyMatrices, type Matrix2 } from "./advancedGraphs";
import { simplifyNode, symbolicSource, symbolicDerivative, factorPolynomial, normalizeSymbolic } from "./symbolic";
import { ANALYSIS_GRAPH_NAMES, ANALYSIS_RESULT_NAMES, finite as analysisFinite, interval as analysisInterval, integrate, derivatives, fourierSeries, evaluateFourier, dataFourier, findRoots, linearBand } from "./analysisTools";
import { UNITS, evaluateUnits, unitResult, convertUnits } from "./units";

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

export type AngleMode = "radians" | "degrees";
let angleMode: AngleMode = "radians";
export function getAngleMode(): AngleMode { return angleMode; }
export function setAngleMode(mode: AngleMode): void {
  if (mode !== "radians" && mode !== "degrees") throw new Error("Angle mode must be radians or degrees");
  angleMode = mode;
}

export type Node =
  | { type: "number"; value: Rational }
  | { type: "variable"; name: string }
  | { type: "constant"; value: "pi" | "e" }
  | { type: "unary"; operator: "+" | "-"; operand: Node }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { type: "call"; name: string; argument: Node }
  | { type: "multicall"; name: string; args: Node[] }
  | { type: "bound"; operation: "derivative" | "integral" | "sum" | "prod"; variable: string; body: Node; lower: Node; upper?: Node }
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
  baseCases?: Array<{ arguments: number[]; body: string }>;
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
  if (expressionLength(source) > MAX_EXPRESSION_LENGTH || source.length > MAX_RECURSIVE_PAYLOAD_LENGTH * 8) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
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

  const dependencies = (definition: UserFunctionDefinition): string[] => {
    const sources = [definition.body, ...(definition.baseCases ?? []).map((item) => item.body)];
    return [...new Set(sources.flatMap((text) =>
      [...text.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*\(/gi)]
        .map((match) => match[1]!.toLowerCase()).filter((name) => functionsByName.has(name))))];
  };
  const reachesCycle = (name: string, active = new Set<string>(), done = new Set<string>()): boolean => {
    if (active.has(name)) return true;
    if (done.has(name)) return false;
    active.add(name);
    const cyclic = dependencies(functionsByName.get(name)!).some((next) => reachesCycle(next, active, done));
    active.delete(name);
    done.add(name);
    return cyclic;
  };
  const reachesBase = (name: string, seen = new Set<string>()): boolean => {
    if (seen.has(name)) return false;
    seen.add(name);
    const definition = functionsByName.get(name)!;
    return Boolean(definition.baseCases?.length) || dependencies(definition).some((next) => reachesBase(next, seen));
  };

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
      let primes = 0;
      while (expression[open] === "'") { primes += 1; open += 1; }
      if (primes && !definition) throw new Error(`Prime notation requires a user-defined function: "${name}"`);
      if (primes > 2) throw new Error("At most two derivative primes are supported");
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
      if (reachesCycle(name) || reachesBase(name)) {
        if (primes) throw new Error("Prime notation is not supported for recursive functions.");
        const reachable = new Set<string>();
        const collect = (current: string) => {
          if (reachable.has(current)) return;
          reachable.add(current);
          dependencies(functionsByName.get(current)!).forEach(collect);
        };
        collect(name);
        const program = [...reachable].map((current) => functionsByName.get(current)!);
        if (!program.some((item) => item.baseCases?.length)) {
          throw new Error(`Circular function definition involving "${name}": recursive functions need an explicit base case.`);
        }
        validateRecursiveProgram(program);
        const payload = [...new TextEncoder().encode(JSON.stringify(program))]
          .map((byte) => byte.toString(16).padStart(2, "0")).join("");
        if (payload.length > MAX_RECURSIVE_PAYLOAD_LENGTH) throw new Error("Recursive function definitions exceed the work limit.");
        result += `recur_${payload}(${argumentsExpanded.join(",")})`;
        offset = close;
        continue;
      }
      if ([...definition.body.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/gi)]
        .some((match) => parameters.includes(match[1]!.toLowerCase()))) {
        throw new Error("Use different names for function parameters and for bindings.");
      }
      if (primes) {
        if (parameters.length !== 1) throw new Error("Prime notation requires a single-argument user function");
        let derivative = expand(definition.body, [...callStack, name]);
        for (let order = 0; order < primes; order += 1) derivative = `derivativeat(${parameters[0]},${derivative},${order === primes - 1 ? argumentsExpanded[0] : parameters[0]})`;
        result += `(${derivative})`;
        offset = close;
        continue;
      }
      const scoped = /(?:sum|prod|int)\s*_|[Σ∑Π∏∫]|d\s*\/\s*d|derivativeat\s*\(/i.test(definition.body);
      const body = scoped ? substituteScopedBody(expand(definition.body, [...callStack, name]), parameters, argumentsExpanded) : definition.body.replace(/[a-zA-Z]+(?:_[a-zA-Z0-9]+)?/g, (variable) =>
        parameters.includes(variable.toLowerCase())
          ? `(${argumentsExpanded[parameters.indexOf(variable.toLowerCase())]})` : variable
      );
      result += `(${expand(body, [...callStack, name])})`;
      offset = close;
      if (expressionLength(result) > MAX_EXPRESSION_LENGTH) {
        throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
      }
    }
    if (expressionLength(result) > MAX_EXPRESSION_LENGTH || result.length > MAX_RECURSIVE_PAYLOAD_LENGTH * 8) {
      throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
    }
    return result;
  };

  return expand(source, []);
}

const MAX_RECURSIVE_PAYLOAD_LENGTH = 16384;
const MAX_RECURSION_DEPTH = 128;
const MAX_RECURSION_WORK = 4096;

function validateRecursiveProgram(program: UserFunctionDefinition[]): void {
  if (program.length > 64) throw new Error("Recursive function definitions exceed the work limit.");
  for (const definition of program) {
    const parameters = functionParameters(definition);
    if (!definition.body.trim() || definition.body.length > MAX_EXPRESSION_LENGTH) throw new Error("Invalid recursive function body.");
    if (definition.baseCases !== undefined && !Array.isArray(definition.baseCases)) throw new Error("Invalid recursive base cases.");
    if (definition.baseCases && definition.baseCases.length > 128) throw new Error("Recursive base cases exceed the work limit.");
    const seen = new Set<string>();
    for (const base of definition.baseCases ?? []) {
      if (!base || !Array.isArray(base.arguments) || base.arguments.length !== parameters.length ||
          base.arguments.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
          typeof base.body !== "string" || !base.body.trim() || base.body.length > MAX_EXPRESSION_LENGTH) {
        throw new Error(`Invalid numeric base case for "${definition.name}".`);
      }
      const key = JSON.stringify(base.arguments);
      if (seen.has(key)) throw new Error(`Duplicate base case for "${definition.name}".`);
      seen.add(key);
    }
  }
}

function decodeRecursiveProgram(name: string): UserFunctionDefinition[] {
  const payload = name.slice(6);
  if (!payload || payload.length > MAX_RECURSIVE_PAYLOAD_LENGTH || payload.length % 2 || !/^[0-9a-f]+$/.test(payload)) {
    throw new Error("Invalid recursive function encoding.");
  }
  try {
    const bytes = new Uint8Array(payload.match(/../g)!.map((byte) => parseInt(byte, 16)));
    const program: UserFunctionDefinition[] = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(program) || !program.length || program.length > 64 ||
        program.some((item) => !item || typeof item.name !== "string" ||
          !/^[a-z](?:_[a-z0-9]+)?$/.test(item.name) || typeof item.body !== "string" ||
          (item.baseCases !== undefined && !Array.isArray(item.baseCases))) ||
        new Set(program.map((item) => item.name)).size !== program.length) throw new Error();
    validateRecursiveProgram(program);
    return program;
  } catch {
    throw new Error("Invalid recursive function encoding.");
  }
}

function expressionLength(source: string): number {
  return source.replace(/\brecur_[0-9a-f]+/gi, "recur").replace(/\brecurcall_\d+/gi, "f").length;
}

function substituteScopedBody(source: string, parameters: string[], argumentsSource: string[]): string {
  const identifiers = source.replace(/θ/g, "theta").match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? [];
  const names = identifiers.flatMap((name) => name.toLowerCase().startsWith("log_") ? [name.slice(4).toLowerCase()] : [name.toLowerCase()])
    .filter((name) => !functions.has(name) && !["pi", "e", "sum", "prod", "int", "d", "derivativeat"].includes(name));
  const tree = parse(source, true, false, names);
  let nextScope = 0;
  const used = new Set((source + argumentsSource.join(" ")).match(/[a-z]+(?:_[a-z0-9]+)?/gi)?.map((name) => name.toLowerCase()));
  const condition = (value: Condition, bound: Map<string, string>): string => value.type === "logical"
    ? `(${condition(value.left, bound)}) ${value.operator} (${condition(value.right, bound)})`
    : `${write(value.left, bound)}${value.operator}${write(value.right, bound)}`;
  const write = (node: Node, bound: Map<string, string>): string => {
    switch (node.type) {
      case "number": return `(${node.value.numerator}/${node.value.denominator})`;
      case "constant": return node.value;
      case "variable": {
        if (bound.has(node.name)) return bound.get(node.name)!;
        const index = parameters.indexOf(node.name);
        return index < 0 ? node.name : `(${argumentsSource[index]})`;
      }
      case "unary": return `(${node.operator}${write(node.operand, bound)})`;
      case "binary": return `(${write(node.left, bound)}${node.operator}${write(node.right, bound)})`;
      case "call": return `${node.name}(${write(node.argument, bound)})`;
      case "multicall": {
        if (node.name.startsWith("recur_") &&
            freeIdentifiers(`${node.name}(0)`).some((name) => bound.has(name))) {
          throw new Error("A recursive function cannot capture a renamed calculus binding in an expanded function.");
        }
        return `${node.name}(${node.args.map((arg) => write(arg, bound)).join(",")})`;
      }
      case "restricted": return `(${write(node.value, bound)}{${condition(node.condition, bound)}})`;
      case "piecewise": return `{${[...node.branches.map((branch) => `${condition(branch.condition, bound)}:${write(branch.value, bound)}`), ...(node.fallback ? [write(node.fallback, bound)] : [])].join(",")}}`;
      case "bound": {
        let local: string;
        do { local = `z_scope${++nextScope}`; } while (used.has(local));
        used.add(local);
        const scope = new Map(bound); scope.set(node.variable, local);
        const body = write(node.body, scope), lower = write(node.lower, bound);
        if (node.operation === "derivative") return `derivativeat(${local},${body},${lower})`;
        const upper = write(node.upper!, bound);
        return node.operation === "integral" ? `(int_{${lower}}^{${upper}} (${body}) d${local})` : `(${node.operation}_{${local}=${lower}}^{${upper}} (${body}))`;
      }
    }
  };
  return write(tree, new Map());
}

export type ImplicitEvaluation = (x: number, y: number) => Decimal | number;
type PreciseImplicitEvaluation = (x: number, y: number) => Decimal;
export type ExplicitEvaluation = (x: number) => Evaluation | number;

export type GraphExpression =
  | { kind: "plane"; evaluate: (x:number,y:number)=>[number,number,number] }
  | { kind: "vectorfield"; evaluate: (x: number, y: number) => [number, number]; arrows: boolean }
  | { kind: "polygon"; evaluate: () => [number, number][]; vertexSources?:[string,string][] }
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

export const BUILTIN_NAMES = [
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
  "ceil", "sec", "csc", "cot", "arcsin", "arccos", "arctan", "arcsec", "arccsc", "arccot",
  "sinh", "cosh", "tanh", "sech", "csch", "coth", "asinh", "acosh", "atanh",
  "arcsinh", "arccosh", "arctanh", "arcsech", "arccsch", "arccoth",
  "sign", "sgn", "round", "factorial", "mod", "gcd", "lcm", "ncr", "npr", "logbase",
] as const;
const functions = new Set<string>([...BUILTIN_NAMES, ...PROBABILITY_KERNELS, ...DISTRIBUTION_NAMES,...COMPLEX_FUNCTIONS]);
export function freeIdentifiers(source: string): string[] {
  const normalized = source.replace(/θ/g, "theta").replace(/[Σ∑]/g, "sum").replace(/[Π∏]/g, "prod").replace(/∫/g, "int").toLowerCase();
  const commandName=new RegExp(`^\\s*(${[...ADVANCED_GRAPH_NAMES,...RESULT_COMMAND_NAMES,...ANALYSIS_GRAPH_NAMES,...ANALYSIS_RESULT_NAMES,"vectorfield","slopefield","ode"].join("|")})\\s*\\(`).exec(normalized)?.[1];
  if(commandName&&normalized.trim().endsWith(")")){
    const body=normalized.slice(normalized.indexOf("(")+1,normalized.lastIndexOf(")"));
    const args=splitCallArguments(body);
    if(commandName==="convert")return [...new Set(args.flatMap((arg,index)=>freeIdentifiers(arg).filter(n=>index===0||!Object.hasOwn(UNITS,n))))];
    const bound=commandName==="domaincolor"?["z","i"]:commandName==="unitcheck"?Object.keys(UNITS):
      ["factor","differentiate"].includes(commandName)?[args[1]?.trim()??"x"]:[];
    return [...new Set(args.flatMap(freeIdentifiers).filter(n=>!bound.includes(n)))];
  }
  const relation = graphRelation(normalized);
  if (relation && !normalized.includes("[")) {
    const length = /[≤≥≠]/.test(normalized[relation.index]!) ? 1 : relation.operator.length;
    const left = normalized.slice(0, relation.index), right = normalized.slice(relation.index + length);
    const names = /^\s*r\s*$/.test(left) ? freeIdentifiers(right).filter((name) => name !== "theta") : [...freeIdentifiers(left), ...freeIdentifiers(right)];
    return [...new Set(names)];
  }
  let coordinates: [string, string] | undefined;
  try { coordinates = pointSources(normalized); } catch { /* Identifier analysis must also accept incomplete input. */ }
  if (coordinates) return [...new Set(coordinates.flatMap(freeIdentifiers))];
  const identifiers = [...new Set([...normalized.matchAll(/[a-z]+(?:_[a-z0-9]+)?/g)]
    .filter((match)=>normalized[match.index-1]!=="."&&
      !(match[0]==="d"&&/^\s*\/\s*d[a-z]/.test(normalized.slice(match.index+1)))).map((match)=>match[0]))];
  const found = new Set<string>();
  const condition = (value: Condition, bound: Set<string>) => {
    if (value.type === "logical") { condition(value.left, bound); condition(value.right, bound); }
    else { walk(value.left, bound); walk(value.right, bound); }
  };
  const walk = (node: Node, bound: Set<string>) => {
    switch (node.type) {
      case "variable": if (!bound.has(node.name)) found.add(node.name); break;
      case "unary": walk(node.operand, bound); break;
      case "binary": walk(node.left, bound); walk(node.right, bound); break;
      case "call": walk(node.argument, bound); break;
      case "multicall": {
        node.args.forEach((arg) => walk(arg, bound));
        if (node.name.startsWith("recur_")) {
          const program = decodeRecursiveProgram(node.name);
          const names = new Set(program.map((item) => item.name));
          for (const item of program) {
            const parameters = new Set(functionParameters(item));
            for (const text of [item.body, ...(item.baseCases ?? []).map((base) => base.body)]) {
              const masked = text.replace(/\b([a-z](?:_[a-z0-9]+)?)\s*(?=\()/gi,
                (token, name: string) => names.has(name.toLowerCase()) ? "sin" : token);
              for (const name of freeIdentifiers(masked)) if (!parameters.has(name) && !bound.has(name)) found.add(name);
            }
          }
        }
        break;
      }
      case "bound": {
        const scope = new Set([...bound, node.variable]);
        walk(node.lower, bound);
        if (node.upper) walk(node.upper, bound);
        walk(node.body, scope); break;
      }
      case "restricted": walk(node.value, bound); condition(node.condition, bound); break;
      case "piecewise": node.branches.forEach((branch) => { condition(branch.condition, bound); walk(branch.value, bound); }); if (node.fallback) walk(node.fallback, bound); break;
    }
  };
  try {
    walk(parse(normalized, true, true, identifiers.flatMap((name) => name.startsWith("log_") ? [name.slice(4)] : [name]).filter((name) => !functions.has(name) && !["pi", "e"].includes(name) && !/^(?:log_|sum|prod|int|d|derivativeat)$/.test(name) && !name.startsWith("log_"))), new Set());
    return [...found];
  } catch {
    const bound = new Set([...normalized.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/g)].map((match) => match[1]!));
    for (const match of normalized.matchAll(/(?:sum|prod|[Σ∑Π∏])_\{\s*([a-z](?:_[a-z0-9]+)?)\s*=/gi)) bound.add(match[1]!);
    for (const match of normalized.matchAll(/d\s*\/\s*d([a-z](?:_[a-z0-9]+)?)/g)) bound.add(match[1]!);
    if (/(?:int_|∫)/.test(normalized)) for (const match of normalized.matchAll(/\bd([a-z](?:_[a-z0-9]+)?)\b/g)) { bound.add(match[0]); bound.add(match[1]!); }
    if (/^\s*r\s*=/.test(normalized)) { bound.add("r"); bound.add("theta"); }
    if(/^\s*domaincolor\s*\(/i.test(normalized)){bound.add("z");bound.add("i");}
    if(/^\s*(?:differentiate|factor)\s*\(/i.test(normalized))bound.add(normalized.match(/,\s*([a-z](?:_[a-z0-9]+)?)\s*\)$/)?.[1]??"x");
    return [...new Set(identifiers.flatMap((name) => name.startsWith("log_") ? [name.slice(4)] : [name]).filter((name) => !functions.has(name) && !bound.has(name) && !["sum", "prod", "int", "derivativeat", "pi", "e", "and", "or", "vectorfield", "slopefield", "ode",...ADVANCED_GRAPH_NAMES,...RESULT_COMMAND_NAMES,...ANALYSIS_GRAPH_NAMES,...ANALYSIS_RESULT_NAMES].includes(name)))];
  }
}

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
  if (text.startsWith("-")) { const value = decimalLiteral(text.slice(1)); return rational(-value.numerator, value.denominator); }
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
  functionNames: string[] = [],
): Node {
  if (expressionLength(source) > MAX_EXPRESSION_LENGTH || source.length > MAX_RECURSIVE_PAYLOAD_LENGTH * 8) {
    throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  }
  const normalized = source.replace(/θ/g, "theta").replace(/[Σ∑]/g, "sum").replace(/[Π∏]/g, "prod").replace(/∫/g, "int");
  const expression = stripYAssignment ? normalized.trim().replace(/^y\s*=\s*/i, "") : normalized.trim();
  const tokens: string[] = [];
  let offset = 0;
  while (offset < expression.length) {
    if (/\s/.test(expression[offset]!)) {
      offset += 1;
      continue;
    }
    const remaining = expression.slice(offset);
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)|^[a-zA-Z]+(?:_[a-zA-Z0-9]+)?|^(?:<=|>=|!=|≤|≥|≠)|^[_!|' +\-*/^(),{}:<>=]/.exec(remaining);
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

  const boundNames: string[] = [];
  let bars = 0;
  function primary(): Node {
    const token = take();
    if (token === undefined) {
      throw new Error("Expected a number, x, or a parenthesized expression");
    }
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      return { type: "number", value: decimalLiteral(token) };
    }
    if (token === "|") {
      bars += 1;
      const argument = sum();
      if (peek() !== "|") throw new Error("Absolute-value bars must be paired; parenthesize nested absolute values");
      take(); bars -= 1;
      return { type: "call", name: "abs", argument };
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
    if (name === "derivativeat") {
      expect("("); const variable = take() ?? ""; expect(",");
      boundNames.push(variable); const body = sum(); boundNames.pop(); expect(",");
      const lower = sum(); expect(")");
      return { type: "bound", operation: "derivative", variable, body, lower };
    }
    if (name === "d" && peek() === "/") {
      take();
      const differential = take() ?? "";
      if (!/^d[a-z](?:_[a-z0-9]+)?$/.test(differential)) throw new Error("Use d/dx(expression) with a single-letter variable");
      const variable = differential.slice(1);
      expect("("); boundNames.push(variable);
      const body = sum(); boundNames.pop(); expect(")");
      return { type: "bound", operation: "derivative", variable, body, lower: { type: "variable", name: variable } };
    }
    if (["sum", "prod", "int"].includes(name) && peek() === "_") {
      take(); expect("{");
      let variable = "";
      if (name !== "int") {
        variable = take() ?? "";
        if (!/^[a-z](?:_[a-z0-9]+)?$/.test(variable)) throw new Error("A sum or product index must be a letter or subscripted variable");
        expect("=");
      }
      const lower = sum(); expect("}"); expect("^"); expect("{");
      const upper = sum(); expect("}");
      if (name === "int") {
        let depth = 0, differential = -1;
        for (let index = position; index < tokens.length; index += 1) {
          const token = tokens[index]!;
          if (depth === 0 && /^d[a-z](?:_[a-z0-9]+)?$/.test(token)) { differential = index; break; }
          if (token === "(" || token === "{") depth += 1;
          if (token === ")" || token === "}") depth -= 1;
        }
        if (differential < 0) throw new Error("An integral needs a trailing differential, for example dx");
        variable = tokens[differential]!.slice(1);
        const body = parse(tokens.slice(position, differential).join(" "), allowY, false, [...variableNames, ...boundNames, variable], functionNames);
        position = differential + 1;
        return { type: "bound", operation: "integral", variable, body, lower, upper };
      }
      boundNames.push(variable); const body = product(); boundNames.pop();
      return { type: "bound", operation: name as "sum" | "prod", variable, body, lower, upper };
    }
    if (name.startsWith("log_") || (name === "log" && peek() === "_")) {
      let base: Node;
      if (name.startsWith("log_")) base = parse(name.slice(4), allowY, false, [...variableNames, ...boundNames], functionNames);
      else { take(); expect("{"); base = sum(); expect("}"); }
      expect("("); const argument = sum(); expect(")");
      return { type: "multicall", name: "logbase", args: [argument, base] };
    }
    if (name.startsWith("recur_") || (functionNames.includes(name) && peek() === "(")) {
      expect("(");
      const args = [sum()];
      while (peek() === ",") { take(); args.push(sum()); }
      expect(")");
      if (name.startsWith("recur_")) decodeRecursiveProgram(name);
      return { type: "multicall", name, args };
    }
    if (name === "x" || variableNames.includes(name) || boundNames.includes(name)) {
      return { type: "variable", name };
    }
    if (name === "y" && allowY) {
      return { type: "variable", name: "y" };
    }
    if (name === "pi" || name === "e") {
      return { type: "constant", value: name };
    }
    if (functions.has(name)||functionNames.includes(name)) {
      expect("(");
      const args = [sum()];
      while (peek() === ",") { take(); args.push(sum()); }
      expect(")");
      return { type: "multicall", name, args };
    }
    throw new Error(`Unknown name "${token}"`);
  }

  function power(): Node {
    let left = primary();
    while (peek() === "!") { take(); left = { type: "multicall", name: "factorial", args: [left] }; }
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
    if ((token === "|" && bars === 0) || token === "(" || /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token ?? "")) {
      return true;
    }
    if (!token || !/^[a-zA-Z]+(?:_[a-zA-Z0-9]+)?$/.test(token)) {
      return false;
    }
    const name = token.toLowerCase();
    return name === "x" || boundNames.includes(name) || variableNames.includes(name) || name.startsWith("log_") || ["sum", "prod", "int", "d"].includes(name) || name === "pi" || name === "e" ||
      (allowY && name === "y") || functions.has(name) || name.startsWith("recur_") || functionNames.includes(name);
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

type RecursiveProgram = Array<{
  parameters: string[];
  body: Node;
  bases: Array<{ arguments: number[]; body: Node }>;
}>;
const recursivePrograms = new WeakMap<Node, Map<string, RecursiveProgram>>();

function recursiveProgram(node: Extract<Node, { type: "multicall" }>, variableNames: string[]): RecursiveProgram {
  const key = [...variableNames].sort().join(",");
  let cache = recursivePrograms.get(node);
  if (!cache) { cache = new Map(); recursivePrograms.set(node, cache); }
  const cached = cache.get(key);
  if (cached) return cached;
  const definitions = decodeRecursiveProgram(node.name);
  const names = definitions.map((_, index) => `recurcall_${index}`);
  const possibleBindings = [...new Set(definitions.flatMap((definition) =>
    [definition.body, ...(definition.baseCases ?? []).map((base) => base.body)]
      .flatMap((text) => (text.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).map((name) => name.toLowerCase()))))]
    .filter((name) => !functions.has(name) && !definitions.some((item) => item.name === name));
  const translate = (text: string) => text.replace(/\b([a-z](?:_[a-z0-9]+)?)\s*(?=\()/gi, (token, name: string) => {
    const index = definitions.findIndex((definition) => definition.name === name.toLowerCase());
    return index < 0 ? token : names[index]!;
  });
  const program = definitions.map((definition) => {
    const parameters = functionParameters(definition);
    if ([...definition.body.matchAll(/\b([a-z](?:_[a-z0-9]+)?)\s*=\s*\[/gi)]
      .some((match) => parameters.includes(match[1]!.toLowerCase()))) {
      throw new Error("Use different names for function parameters and for bindings.");
    }
    const read = (text: string) => parse(translate(text), true, false, [...variableNames, ...possibleBindings, ...parameters], names);
    return { parameters, body: read(definition.body), bases: (definition.baseCases ?? []).map((base) => ({
      arguments: base.arguments, body: read(base.body),
    })) };
  });
  cache.set(key, program);
  return program;
}

type RealRecursion = {
  program: RecursiveProgram;
  frames: Array<{ parameters: Map<string, Value>; bindings: Map<string, Value> }>;
  active: Set<string>;
  memo: Map<string, Value>;
  work: number;
};
let realRecursion: RealRecursion | undefined;

function recursionValueKey(value: Value): string {
  return value.kind === "rational" ? `r${value.numerator}/${value.denominator}` : `d${value.value.toString()}`;
}

function matchesNumericBase(value: Value, base: number): boolean {
  if (value.kind !== "rational") return value.value.eq(base);
  const [numerator, denominator] = new Decimal(base.toString()).toFraction();
  return value.numerator * BigInt(denominator.toFixed()) === BigInt(numerator.toFixed()) * value.denominator;
}

function recursiveRealCall(context: RealRecursion, index: number, args: Value[], x: Decimal,
  y: Decimal | undefined, variables: Record<string, number>): Value {
  const definition = context.program[index];
  if (!definition || args.length !== definition.parameters.length) throw new Error("Recursive function called with the wrong number of arguments.");
  if (++context.work > MAX_RECURSION_WORK) throw new Error("Recursive function work limit exceeded.");
  const key = `${index}:${args.map(recursionValueKey).join(",")}|${[...boundValues].map(([name, value]) => `${name}=${recursionValueKey(value)}`).join(",")}`;
  const cached = context.memo.get(key);
  if (cached) return cached;
  if (context.active.has(key)) throw new Error("Recursive function does not converge: repeated arguments.");
  if (context.frames.length >= MAX_RECURSION_DEPTH) throw new Error("Recursive function depth limit exceeded; a base case may be missing or unreachable.");
  const base = definition.bases.find((item) => item.arguments.every((value, i) => matchesNumericBase(args[i]!, value)));
  context.active.add(key);
  context.frames.push({
    parameters: new Map(definition.parameters.map((name, i) => [name, args[i]!])),
    bindings: new Map(boundValues),
  });
  try {
    const result = evaluate(base?.body ?? definition.body, x, y, variables);
    context.memo.set(key, result);
    return result;
  } finally {
    context.frames.pop();
    context.active.delete(key);
  }
}

const constantNodes = new WeakMap<Node, boolean>();
const constantValues = new WeakMap<Node, { precision: number; mode: AngleMode; value: Value }>();

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
        : node.type === "bound" ? false
        : node.type === "multicall" ? !node.name.startsWith("recur_") && !node.name.startsWith("recurcall_") && node.args.every(isConstantExpression)
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
  if (realRecursion || !isConstantExpression(node)) return evaluateNode(node, x, y, variables);
  const cached = constantValues.get(node);
  if (cached?.precision === Decimal.precision && cached.mode === angleMode) return cached.value;
  const value = evaluateNode(node, x, y, variables);
  constantValues.set(node, { precision: Decimal.precision, mode: angleMode, value });
  return value;
}

function evaluateNode(node: Node, x: Decimal, y: Decimal | undefined, variables: Record<string, number>): Value {
  switch (node.type) {
    case "multicall": {
      if (node.name.startsWith("recurcall_") && realRecursion) {
        return recursiveRealCall(realRecursion, Number(node.name.slice(10)), node.args.map((arg) => evaluate(arg, x, y, variables)), x, y, variables);
      }
      if (node.name.startsWith("recur_")) {
        const args = node.args.map((arg) => evaluate(arg, x, y, variables));
        const previous = realRecursion;
        const context: RealRecursion = { program: recursiveProgram(node, [...Object.keys(variables), ...boundValues.keys()]), frames: [], active: new Set(), memo: new Map(), work: 0 };
        realRecursion = context;
        try { return recursiveRealCall(context, 0, args, x, y, variables); }
        finally { realRecursion = previous; }
      }
      return evaluateBuiltin(node.name, node.args.map((arg) => evaluate(arg, x, y, variables)));
    }
    case "bound":
      return evaluateBound(node, x, y, variables);
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
      if (realRecursion) {
        const frame = realRecursion.frames[realRecursion.frames.length - 1];
        if (frame?.parameters.has(node.name) && boundValues.get(node.name) === frame.bindings.get(node.name)) {
          return frame.parameters.get(node.name)!;
        }
      }
      if (boundValues.has(node.name)) return boundValues.get(node.name)!;
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

const boundValues = new Map<string, Value>();

function evaluateBuiltin(originalName: string, values: Value[]): Value {
  if (isProbabilityKernel(originalName)) {
    return approximate(new Decimal(probabilityKernel(originalName, values.map((value) => asDecimal(value).toNumber()))));
  }
  const aliases: Record<string, string> = { arcsin: "asin", arccos: "acos", arctan: "atan", arcsinh: "asinh", arccosh: "acosh", arctanh: "atanh", sgn: "sign" };
  const name = aliases[originalName] ?? originalName;
  const arity = ["mod", "gcd", "lcm", "ncr", "npr", "logbase"].includes(name) ? [2] : ["round", "atan"].includes(name) ? [1, 2] : [1];
  if (!arity.includes(values.length)) throw new Error(`${originalName} requires ${arity.join(" or ")} argument(s)`);
  const a = asDecimal(values[0]!);
  const b = values[1] && asDecimal(values[1]);
  const integer = (value: Decimal, label = name): bigint => {
    if (!value.isInteger()) throw new Error(`${label} requires integer inputs`);
    if (value.abs().gt("1e100")) throw new Error(`${label} integer is outside the supported range`);
    return BigInt(value.toFixed(0));
  };
  const nonzero = (value: Decimal): Decimal => {
    if (value.abs().lt(new Decimal(10).pow(-Decimal.precision + 5))) throw new Error(`${name} is undefined at this input`);
    return value;
  };
  const requireDomain = (valid: boolean, description: string) => {
    if (!valid) throw new Error(`${originalName} requires ${description}`);
  };
  const radians = (value: Decimal) => angleMode === "degrees" ? value.times(decimalConstant("pi")).div(180) : value;
  const angle = (value: Decimal) => approximate(angleMode === "degrees" ? value.times(180).div(decimalConstant("pi")) : value);
  switch (name) {
    case "sign": return rational(BigInt(a.comparedTo(0)));
    case "round": {
      const digits = b ? Number(integer(b, "round digits")) : 0;
      requireDomain(Math.abs(digits) <= 100, "digits between -100 and 100");
      const rounded = a.times(new Decimal(10).pow(digits)).toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).div(new Decimal(10).pow(digits));
      return decimalLiteral(rounded.toFixed(Math.max(0, digits)));
    }
    case "mod": {
      if (b!.isZero()) throw new Error("mod divisor cannot be zero");
      if (values.every((value) => value.kind === "rational")) {
        const left = values[0] as Rational, right = values[1] as Rational;
        let n = left.numerator * right.denominator, d = left.denominator * right.numerator;
        if (d < 0n) { n = -n; d = -d; }
        let quotient = n / d; if (n < 0n && n % d) quotient -= 1n;
        return rational(left.numerator * right.denominator - quotient * right.numerator * left.denominator, left.denominator * right.denominator);
      }
      return approximate(a.minus(a.div(b!).floor().times(b!)));
    }
    case "gcd": case "lcm": {
      const left = integer(a), right = integer(b!); const divisor = gcd(left, right);
      return rational(name === "gcd" ? divisor : divisor === 0n ? 0n : (left * right / divisor < 0n ? -left * right / divisor : left * right / divisor));
    }
    case "factorial": case "ncr": case "npr": {
      const n = integer(a); const r = name === "factorial" ? n : integer(b!);
      requireDomain(n >= 0n && r >= 0n && r <= n, "non-negative integers with 0 <= r <= n");
      requireDomain(n <= 10000n, "an integer no larger than 10000");
      const count = name === "ncr" && r > n - r ? n - r : r;
      let result = 1n;
      for (let i = 0n; i < count; i += 1n) result = name === "ncr" ? result * (n - i) / (i + 1n) : result * (n - i);
      return rational(result);
    }
    case "logbase":
      requireDomain(a.gt(0) && b!.gt(0) && !b!.eq(1), "a positive input and a positive base other than 1");
      {
        const result = a.ln().div(b!.ln()), nearest = result.toDecimalPlaces(0);
        if (values[0]!.kind === "rational" && values[1]!.kind === "rational" && nearest.abs().lte(100)) {
          const input = values[0] as Rational, base = values[1] as Rational, exponent = BigInt(nearest.abs().toFixed(0));
          const powered = nearest.isNegative() ? rational(base.denominator ** exponent, base.numerator ** exponent) : rational(base.numerator ** exponent, base.denominator ** exponent);
          if (powered.numerator === input.numerator && powered.denominator === input.denominator) return rational(BigInt(nearest.toFixed(0)));
        }
        return approximate(result);
      }
    case "sin": return approximate(radians(a).sin());
    case "cos": return approximate(radians(a).cos());
    case "tan": return approximate(radians(a).sin().div(nonzero(radians(a).cos())));
    case "sec": return approximate(new Decimal(1).div(nonzero(radians(a).cos())));
    case "csc": return approximate(new Decimal(1).div(nonzero(radians(a).sin())));
    case "cot": return approximate(radians(a).cos().div(nonzero(radians(a).sin())));
    case "asin": case "acos":
      requireDomain(a.abs().lte(1), "an input between -1 and 1"); return angle(name === "asin" ? a.asin() : a.acos());
    case "atan":
      requireDomain(!b || !a.isZero() || !b.isZero(), "at least one nonzero coordinate for two-argument arctan");
      return angle(b ? Decimal.atan2(a, b) : a.atan());
    case "arcsec": case "arccsc":
      requireDomain(a.abs().gte(1), "an input with absolute value at least 1"); return angle(name === "arcsec" ? new Decimal(1).div(a).acos() : new Decimal(1).div(a).asin());
    case "arccot": return angle(Decimal.atan2(1, a));
    case "sinh": return approximate(a.sinh());
    case "cosh": return approximate(a.cosh());
    case "tanh": return approximate(a.tanh());
    case "sech": return approximate(new Decimal(1).div(a.cosh()));
    case "csch": return approximate(new Decimal(1).div(nonzero(a.sinh())));
    case "coth": return approximate(a.cosh().div(nonzero(a.sinh())));
    case "asinh": return approximate(a.asinh());
    case "acosh": requireDomain(a.gte(1), "an input at least 1"); return approximate(a.acosh());
    case "atanh": requireDomain(a.abs().lt(1), "an input strictly between -1 and 1"); return approximate(a.atanh());
    case "arcsech": requireDomain(a.gt(0) && a.lte(1), "an input in (0, 1]"); return approximate(new Decimal(1).div(a).acosh());
    case "arccsch": requireDomain(!a.isZero(), "a nonzero input"); return approximate(new Decimal(1).div(a).asinh());
    case "arccoth": requireDomain(a.abs().gt(1), "an input with absolute value greater than 1"); return approximate(new Decimal(1).div(a).atanh());
    default: {
      const result = evaluateNode({ type: "call", name, argument: { type: "number", value: values[0]!.kind === "rational" ? values[0] as Rational : decimalLiteral(a.toFixed()) } }, new Decimal(0), undefined, {});
      return values[0]!.kind === "rational" ? result : approximate(asDecimal(result));
    }
  }
}

function evaluateBound(node: Extract<Node, { type: "bound" }>, x: Decimal, y: Decimal | undefined, variables: Record<string, number>): Value {
  const lower = node.operation === "derivative" && node.lower.type === "variable" && node.lower.name === node.variable && !boundValues.has(node.variable) && variables[node.variable] === undefined && node.variable !== "y" ? x : asDecimal(evaluate(node.lower, x, y, variables));
  const upper = node.upper && asDecimal(evaluate(node.upper, x, y, variables));
  const previous = boundValues.get(node.variable);
  const at = (value: Decimal | Rational): Value => {
    boundValues.set(node.variable, "kind" in value ? value : approximate(value));
    return evaluate(node.body, x, y, variables);
  };
  try {
    if (node.operation === "derivative") {
      const h = Decimal.max(1, lower.abs()).times(new Decimal(10).pow(-Math.min(10, Math.floor((Decimal.precision - 5) / 4))));
      return approximate(asDecimal(at(lower.minus(h.times(2)))).minus(asDecimal(at(lower.minus(h))).times(8)).plus(asDecimal(at(lower.plus(h))).times(8)).minus(asDecimal(at(lower.plus(h.times(2))))).div(h.times(12)));
    }
    if (node.operation === "sum" || node.operation === "prod") {
      if (!lower.isInteger() || !upper!.isInteger()) throw new Error("Sum and product bounds must be integers");
      if (upper!.minus(lower).gte(10000)) throw new Error("Sum and product are limited to 10000 iterations");
      let result: Value = rational(node.operation === "sum" ? 0n : 1n);
      for (let index = BigInt(lower.toFixed(0)), end = BigInt(upper!.toFixed(0)); index <= end; index += 1n) {
        const term = at(rational(index));
        if (result.kind === "rational" && term.kind === "rational") result = node.operation === "sum" ? rational(result.numerator * term.denominator + term.numerator * result.denominator, result.denominator * term.denominator) : rational(result.numerator * term.numerator, result.denominator * term.denominator);
        else result = approximate(node.operation === "sum" ? asDecimal(result).plus(asDecimal(term)) : asDecimal(result).times(asDecimal(term)));
      }
      return result;
    }
    let evaluations = 0;
    const sample = (value: Decimal): Decimal => {
      if (++evaluations > 20000) throw new Error("Integral did not converge within 20000 evaluations");
      return asDecimal(at(value));
    };
    const simpson = (a: Decimal, b: Decimal, fa: Decimal, fm: Decimal, fb: Decimal) => b.minus(a).times(fa.plus(fm.times(4)).plus(fb)).div(6);
    const integrate = (a: Decimal, b: Decimal, fa: Decimal, fm: Decimal, fb: Decimal, whole: Decimal, tolerance: Decimal, depth: number): Decimal => {
      const middle = a.plus(b).div(2), leftMid = a.plus(middle).div(2), rightMid = middle.plus(b).div(2);
      const fl = sample(leftMid), fr = sample(rightMid);
      const left = simpson(a, middle, fa, fl, fm), right = simpson(middle, b, fm, fr, fb);
      const difference = left.plus(right).minus(whole);
      if (difference.abs().lte(tolerance.times(15))) return left.plus(right).plus(difference.div(15));
      if (depth === 0) throw new Error("Integral did not converge");
      return integrate(a, middle, fa, fl, fm, left, tolerance.div(2), depth - 1).plus(integrate(middle, b, fm, fr, fb, right, tolerance.div(2), depth - 1));
    };
    if (lower.eq(upper!)) return approximate(new Decimal(0));
    const midpoint = lower.plus(upper!).div(2), fa = sample(lower), fm = sample(midpoint), fb = sample(upper!);
    return approximate(integrate(lower, upper!, fa, fm, fb, simpson(lower, upper!, fa, fm, fb), new Decimal("1e-12"), 24));
  } finally {
    if (previous) boundValues.set(node.variable, previous); else boundValues.delete(node.variable);
  }
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
  let cachedMode = angleMode;
  return (x, y) => {
    if (cached === undefined || cachedMode !== angleMode) { cached = evaluator(x, y); cachedMode = angleMode; }
    return cached;
  };
}

function compileFastEvaluatorNode(node: Node, variables: Record<string, number>): FastEvaluator {
  switch (node.type) {
    case "multicall": {
      if (node.name.startsWith("recur_") || node.name.startsWith("recurcall_")) {
        return (x, y) => roundFast(asDecimal(evaluate(node, new Decimal(x), y === undefined ? undefined : new Decimal(y), variables)).toNumber());
      }
      if (["tan", "sec", "csc", "cot", "gcd", "lcm", "ncr", "npr", "factorial", "round"].includes(node.name)) {
        return (x, y) => roundFast(asDecimal(evaluateBuiltin(node.name, node.args.map((arg) => evaluate(arg, new Decimal(x), y === undefined ? undefined : new Decimal(y), variables)))).toNumber());
      }
      const args = node.args.map((arg) => compileFastEvaluator(arg, variables));
      return (x, y) => roundFast(asDecimal(evaluateBuiltin(node.name, args.map((arg) => approximate(new Decimal(arg(x, y)))))).toNumber());
    }
    case "bound":
      return (x, y) => roundFast(asDecimal(evaluateBound(node, new Decimal(x), y === undefined ? undefined : new Decimal(y), variables)).toNumber());
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
  if (node.type === "multicall" || node.type === "bound") {
    return containsVariable(node, variable) ? undefined : { coefficient: zeroNode(), constant: node };
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
    case "multicall": return node.name.startsWith("recur_") || node.args.some((arg) => containsVariable(arg, variable));
    case "bound": return containsVariable(node.lower, variable) || Boolean(node.upper && containsVariable(node.upper, variable)) || (node.variable !== variable && containsVariable(node.body, variable));
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
    if (tree.type === "bound") return undefined;
    if (tree.type === "multicall") {
      const regions = tree.args.map(build);
      return regions.some(Boolean) ? (x, y) => regions.map((region) => region?.(x, y) ?? "").join("|") : undefined;
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
  if (angleMode !== "radians" || (tree.type !== "call" && tree.type !== "multicall") || tree.name !== "tan") return undefined;
  const affine = affineInVariable(tree.type === "call" ? tree.argument : tree.args[0]!, parameter);
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

export function compileComplexExpression(
  source:string,variables:Record<string,number>={},values:Record<string,Complex>={},
):(x:number,y?:number)=>Complex{
  const tree=parse(source,true,true,[...Object.keys(variables),...Object.keys(values),"i"]);
  const local=new Map<string,Complex>();
  type ComplexRecursion = {
    program: RecursiveProgram;
    frames: Array<{ parameters: Map<string, Complex>; bindings: Map<string, Complex> }>;
    active: Set<string>; memo: Map<string, Complex>; work: number;
  };
  let recursion: ComplexRecursion | undefined;
  const recursiveCall = (context: ComplexRecursion, index: number, args: Complex[], x: number, y: number): Complex => {
    const definition = context.program[index];
    if (!definition || args.length !== definition.parameters.length) throw new Error("Recursive function called with the wrong number of arguments.");
    if (args.some((arg) => !Number.isFinite(arg.re) || !Number.isFinite(arg.im))) throw new Error("Recursive function arguments must be finite.");
    if (++context.work > MAX_RECURSION_WORK) throw new Error("Recursive function work limit exceeded.");
    const key = `${index}:${args.map((arg) => `${arg.re},${arg.im}`).join(";")}|${[...local].map(([name, value]) => `${name}=${value.re},${value.im}`).join(";")}`;
    const cached = context.memo.get(key);
    if (cached) return cached;
    if (context.active.has(key)) throw new Error("Recursive function does not converge: repeated arguments.");
    if (context.frames.length >= MAX_RECURSION_DEPTH) throw new Error("Recursive function depth limit exceeded; a base case may be missing or unreachable.");
    const base = definition.bases.find((item) => item.arguments.every((value, i) => args[i]!.im === 0 && args[i]!.re === value));
    context.active.add(key);
    context.frames.push({ parameters: new Map(definition.parameters.map((name, i) => [name, args[i]!])), bindings: new Map(local) });
    try {
      const result = visit(base?.body ?? definition.body, x, y);
      context.memo.set(key, result);
      return result;
    } finally { context.frames.pop(); context.active.delete(key); }
  };
  const real=(value:Complex):number=>{
    if(value.im!==0)throw new Error("Comparisons and calculus bounds require real values.");
    return value.re;
  };
  const condition=(node:Condition,x:number,y:number):boolean=>{
    if(node.type==="logical")return node.operator==="and"?condition(node.left,x,y)&&condition(node.right,x,y):condition(node.left,x,y)||condition(node.right,x,y);
    const a=visit(node.left,x,y),b=visit(node.right,x,y);
    if(node.operator==="="||node.operator==="!="){const equal=a.re===b.re&&a.im===b.im;return node.operator==="="?equal:!equal;}
    const left=real(a),right=real(b);
    return node.operator==="<"?left<right:node.operator==="<="?left<=right:node.operator===">"?left>right:left>=right;
  };
  const visit=(node:Node,x:number,y:number):Complex=>{
    if(node.type==="number")return complex(asDecimal(node.value).toNumber());
    if(node.type==="constant")return complex(node.value==="pi"?Math.PI:Math.E);
    if(node.type==="variable"){
      const frame=recursion?.frames[recursion.frames.length-1];
      if(frame?.parameters.has(node.name)&&local.get(node.name)===frame.bindings.get(node.name))return frame.parameters.get(node.name)!;
      if(local.has(node.name))return local.get(node.name)!;
      if(node.name==="i")return complex(0,1);
      if(node.name==="x")return complex(x);
      if(node.name==="y")return complex(y);
      if(Object.hasOwn(values,node.name))return values[node.name]!;
      if(Object.hasOwn(variables,node.name))return complex(variables[node.name]!);
      throw new Error(`Unknown complex variable "${node.name}".`);
    }
    if(node.type==="unary"){const value=visit(node.operand,x,y);return node.operator==="-"?neg(value):value;}
    if(node.type==="binary"){
      const a=visit(node.left,x,y),b=visit(node.right,x,y);
      return node.operator==="+"?add(a,b):node.operator==="-"?sub(a,b):node.operator==="*"?mul(a,b):node.operator==="/"?div(a,b):pow(a,b);
    }
    if(node.type==="restricted"){if(!condition(node.condition,x,y))throw new UndefinedPointError();return visit(node.value,x,y);}
    if(node.type==="piecewise"){
      for(const branch of node.branches)if(condition(branch.condition,x,y))return visit(branch.value,x,y);
      if(node.fallback)return visit(node.fallback,x,y);throw new UndefinedPointError();
    }
    if(node.type==="bound"){
      const lower=real(visit(node.lower,x,y)),upper=node.upper?real(visit(node.upper,x,y)):undefined;
      const previous=local.get(node.variable);
      const at=(t:number)=>{local.set(node.variable,complex(t));return visit(node.body,x,y);};
      try{
        if(node.operation==="sum"||node.operation==="prod"){
          if(upper===undefined||!Number.isSafeInteger(lower)||!Number.isSafeInteger(upper)||upper-lower>=10000)throw new Error("Complex sums/products need safe integer bounds and at most 10000 terms.");
          let result=complex(node.operation==="sum"?0:1);
          for(let t=lower;t<=upper;t++)result=node.operation==="sum"?add(result,at(t)):mul(result,at(t));
          return result;
        }
        if(node.operation==="derivative"){
          const h=Number.EPSILON**0.2*Math.max(1,Math.abs(lower));
          return div(add(sub(at(lower-2*h),mul(complex(8),at(lower-h))),sub(mul(complex(8),at(lower+h)),at(lower+2*h))),complex(12*h));
        }
        if(upper===undefined)throw new Error("Complex integrals need two bounds.");
        return integrateComplex(at,lower,upper);
      }finally{if(previous)local.set(node.variable,previous);else local.delete(node.variable);}
    }
    const args=node.type==="call"?[visit(node.argument,x,y)]:node.args.map((arg)=>visit(arg,x,y));
    if(node.type==="multicall"&&node.name.startsWith("recurcall_")&&recursion)return recursiveCall(recursion,Number(node.name.slice(10)),args,x,y);
    if(node.type==="multicall"&&node.name.startsWith("recur_")){
      const previous=recursion;
      const context:ComplexRecursion={program:recursiveProgram(node,[...Object.keys(variables),...Object.keys(values),...local.keys(),"i"]),frames:[],active:new Set(),memo:new Map(),work:0};
      recursion=context;
      try{return recursiveCall(context,0,args,x,y);}finally{recursion=previous;}
    }
    if(args.length===1){
      try{return complexFunction(node.name,args[0]!,angleMode==="degrees");}
      catch(reason){if(args[0]!.im!==0||!BUILTIN_NAMES.some((name)=>name===node.name))throw reason;}
    }
    if(node.name==="logbase"&&args.length===2)return div(complexFunction("ln",args[0]!),complexFunction("ln",args[1]!));
    if(args.some((arg)=>arg.im!==0))throw new Error(`"${node.name}" requires real arguments.`);
    return complex(asDecimal(evaluateBuiltin(node.name,args.map((arg)=>approximate(new Decimal(arg.re))))).toNumber());
  };
  return(x,y=0)=>{if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error("Complex coordinates must be finite.");return visit(tree,x,y);};
}

export function complexExpressionIsReal(source:string,variables:Record<string,number>={},values:Record<string,Complex>={}):boolean{
  const tree=parse(source,true,true,[...Object.keys(variables),...Object.keys(values),"i"]);
  const nonreal=(node:Node):boolean=>{
    if(node.type==="number"||node.type==="constant")return false;
    if(node.type==="variable")return node.name==="i"||Boolean(values[node.name]?.im);
    if(node.type==="unary")return nonreal(node.operand);
    if(node.type==="binary")return nonreal(node.left)||nonreal(node.right);
    if(node.type==="restricted")return nonreal(node.value);
    if(node.type==="piecewise")return node.branches.some((branch)=>nonreal(branch.value))||Boolean(node.fallback&&nonreal(node.fallback));
    if(node.type==="bound")return nonreal(node.body);
    if(node.type==="multicall"&&node.name.startsWith("recur_"))return true;
    if(["real","imag","abs","arg"].includes(node.name))return false;
    return(node.type==="call"?[node.argument]:node.args).some(nonreal);
  };
  return!nonreal(tree);
}

export function expressionMathML(source:string):string{
  const escape=(text:string)=>text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const condition=(node:Condition):string=>node.type==="logical"?`<mrow>${condition(node.left)}<mtext> ${node.operator} </mtext>${condition(node.right)}</mrow>`:
    `<mrow>${render(node.left)}<mo>${escape(node.operator)}</mo>${render(node.right)}</mrow>`;
  const render=(node:Node):string=>{
    if(node.type==="number")return node.value.denominator===1n?`<mn>${node.value.numerator}</mn>`:
      `<mfrac><mn>${node.value.numerator}</mn><mn>${node.value.denominator}</mn></mfrac>`;
    if(node.type==="variable"){
      const [name,subscript]=node.name.split("_");
      return subscript?`<msub><mi>${escape(name!)}</mi><mtext>${escape(subscript)}</mtext></msub>`:`<mi>${escape(node.name)}</mi>`;
    }
    if(node.type==="constant")return `<mi>${node.value==="pi"?"π":"e"}</mi>`;
    if(node.type==="unary")return `<mrow><mo>${node.operator}</mo>${render(node.operand)}</mrow>`;
    if(node.type==="binary"){
      if(node.operator==="/")return `<mfrac>${render(node.left)}${render(node.right)}</mfrac>`;
      if(node.operator==="^")return `<msup><mrow>${render(node.left)}</mrow><mrow>${render(node.right)}</mrow></msup>`;
      return `<mrow><mo>(</mo>${render(node.left)}<mo>${node.operator==="*"?"·":node.operator}</mo>${render(node.right)}<mo>)</mo></mrow>`;
    }
    if(node.type==="bound")return `<mrow><msubsup><mo>${node.operation==="sum"?"Σ":node.operation==="prod"?"Π":node.operation==="integral"?"∫":"D"}</mo><mrow><mi>${escape(node.variable)}</mi><mo>=</mo>${render(node.lower)}</mrow>${node.upper?render(node.upper):"<mrow/>"}</msubsup>${render(node.body)}</mrow>`;
    if(node.type==="restricted")return `<mrow>${render(node.value)}<mo>{</mo>${condition(node.condition)}<mo>}</mo></mrow>`;
    if(node.type==="piecewise")return `<mrow><mo>{</mo><mtable>${node.branches.map((branch)=>`<mtr><mtd>${render(branch.value)}</mtd><mtd>${condition(branch.condition)}</mtd></mtr>`).join("")}${node.fallback?`<mtr><mtd>${render(node.fallback)}</mtd><mtd><mtext>otherwise</mtext></mtd></mtr>`:""}</mtable></mrow>`;
    const args=node.type==="call"?[node.argument]:node.args;
    if(node.name==="sqrt"&&args.length===1)return `<msqrt>${render(args[0]!)}</msqrt>`;
    if(node.name==="abs"&&args.length===1)return `<mrow><mo>|</mo>${render(args[0]!)}<mo>|</mo></mrow>`;
    return `<mrow><mi>${escape(node.name)}</mi><mo>(</mo>${args.map(render).join("<mo>,</mo>")}<mo>)</mo></mrow>`;
  };
  const relation=graphRelation(source);
  const names=[...new Set(source.match(/[a-z]+(?:_[a-z0-9]+)?/gi)??[])].map((name)=>name.toLowerCase())
    .filter((name)=>!functions.has(name)&&!["pi","e","sum","prod","int"].includes(name));
  const callable=[...source.matchAll(/\b([a-z]+(?:_[a-z0-9]+)?)\s*\(/gi)].map((match)=>match[1]!.toLowerCase())
    .filter((name)=>!["x","y","e","pi"].includes(name));
  const tree=(text:string):string=>{
    const point=pointSources(text);
    if(point)return`<mrow><mo>(</mo>${point.map(tree).join("<mo>,</mo>")}<mo>)</mo></mrow>`;
    const trimmed=text.trim();
    if(trimmed.startsWith("[")&&trimmed.endsWith("]"))return`<mrow><mo>[</mo>${trimmed.slice(1,-1).trim()?splitCollectionParts(trimmed.slice(1,-1)).map(tree).join("<mo>,</mo>"):""}<mo>]</mo></mrow>`;
    return render(parse(text,true,false,names.filter((name)=>!callable.includes(name)),callable));
  };
  const body=relation?`<mrow>${tree(source.slice(0,relation.index))}<mo>${escape(relation.operator)}</mo>${tree(source.slice(relation.index+relation.operator.length))}</mrow>`:tree(source);
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${body}</math>`;
}

export function compileExpression(
  source: string,
  variables: Record<string, number> = {},
  allowY = false,
): (x: number, y?: number) => Evaluation {
  source = rewriteRandom(source, (text) => compileExpression(text, variables)(0).value.toNumber());
  const inferenceValues: Record<string, number> = {};
  let inferenceIndex = 0;
  source = rewriteInferenceProperties(source, (call) => {
    let name: string;
    do { name = `inference_value${inferenceIndex++}`; } while (Object.hasOwn(variables, name) || source.includes(name));
    Object.defineProperty(inferenceValues, name, {
      enumerable: true,
      get: () => inferenceProperty(readInference(call,
        (text) => compileExpression(text, variables)(0).value.toNumber()), call.property!),
    });
    return name;
  });
  source = rewriteDistributions(source, (text) => compileExpression(text, variables)(0).value.toNumber());
  if ((source.match(/[a-z]+(?:_[a-z0-9]+)?/gi) ?? []).some((name) => INTERNAL_COLLECTION_FUNCTIONS.includes(name.toLowerCase()))) {
    const expanded = expandCollections(source, (text) => compileExpression(text, variables)(0).value.toNumber());
    if (expanded.list || expanded.items.length !== 1) throw new Error("A scalar expression cannot return a random sample list.");
    source = expanded.items[0]!;
  }
  const context: Record<string, number> = {};
  for (const name of Object.keys(variables)) Object.defineProperty(context, name, { enumerable: true, get: () => variables[name] });
  for (const name of Object.keys(inferenceValues)) Object.defineProperty(context, name, { enumerable: true, get: () => inferenceValues[name] });
  const tree = parse(source, allowY, true, Object.keys(context));
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
      context,
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

function compileNativeGraph(source: string, variables: Record<string, number>): GraphExpression | undefined {
  const normalized = source.replace(/θ/g, "theta");
  if (/^r\s*(?:[<>≤≥])/i.test(normalized)) {
    const period = angleMode === "degrees" ? "360" : "(2*pi)";
    const cartesian = normalized.replace(/\br\b/gi, "sqrt(x^2+y^2)")
      .replace(/\btheta\b/gi, `mod(arctan(y,x)+${period},${period})`);
    return compileGraphExpression(cartesian, variables);
  }
  const candidate = /\{([^{}]+)\}\s*$/.exec(normalized);
  const suffix = candidate && !/[+\-*/^_(:,=<>]$/.test(normalized.slice(0, candidate.index).trim()) ? candidate : null;
  const base = suffix ? normalized.slice(0, suffix.index).trim() : normalized;
  const polar = /^r\s*=/i.test(base);
  const coordinates = polar ? undefined : pointSources(base);
  if (!polar && (!coordinates || !coordinates.some((coordinate) => freeIdentifiers(coordinate).includes("t")))) return undefined;
  const parameter = polar ? "theta" : "t";
  let start = 0, end = polar ? (angleMode === "degrees" ? 2160 : 12 * Math.PI) : 1;
  if (suffix) {
    const range = new RegExp(`^\\s*(.+?)\\s*(?:<=|<|≤)\\s*${parameter}\\s*(?:<=|<|≤)\\s*(.+?)\\s*$`, "i").exec(suffix[1]!);
    if (!range) return undefined;
    start = compileExpression(range[1]!, variables)(0).value.toNumber();
    end = compileExpression(range[2]!, variables)(0).value.toNumber();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("Graph parameter bounds must be finite and increasing");
  }
  const scope = { ...variables } as Record<string, number>;
  scope[parameter] = 0;
  const first = compileExpression(polar ? base.replace(/^r\s*=\s*/i, "") : coordinates![0], scope);
  const second = polar ? undefined : compileExpression(coordinates![1], scope);
  return {
    kind: "parametric", start, end,
    evaluate: (value) => {
      if (!Number.isFinite(value)) throw new Error("Graph parameter must be finite");
      Object.assign(scope, variables);
      scope[parameter] = value;
      const a = first(value).value.toNumber();
      if (!polar) return [a, second!(value).value.toNumber()];
      const radians = angleMode === "degrees" ? value * Math.PI / 180 : value;
      return [a * Math.cos(radians), a * Math.sin(radians)];
    },
  };
}

function compileRestrictedGraph(
  source: string, variables: Record<string, number>, fast: boolean, statisticsMode: StatisticsMode,
): GraphExpression | undefined {
  let depth = 0;
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{" && depth === 0 && index > 0 &&
        !/[+\-*/^_(:,=<>]$/.test(source.slice(0, index).trim())) {
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
  if (graph.kind === "vectorfield") {
    return {...graph,evaluate:(x,y)=>{check(x,y);return graph.evaluate(x,y);}};
  }
  if (graph.kind === "plane") {
    return {...graph,evaluate:(x,y)=>{check(x,y);return graph.evaluate(x,y);}};
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
  if(graph.kind==="polygon"){
    return{kind:"inequality",relation:"<=",evaluate:(x,y)=>{
      check(x,y);return polygonSignedDistance(graph.evaluate(),x,y);
    }};
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
  if (graph.kind === "collection") {
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
    const identifiers = freeIdentifiers(coordinate);
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

function compileAdvancedGraph(source:string,variables:Record<string,number>):GraphExpression|undefined{
  const scalar=(text:string)=>{
    if(graphRelation(text)||freeIdentifiers(text).some(n=>["x","y","t","z"].includes(n)))
      throw new Error("This argument must be a scalar expression without graph coordinates.");
    const result=compileExpression(text,variables)(0).value.toNumber();
    if(!Number.isFinite(result))throw new Error("Scalar argument must be finite.");
    return result;
  };
  for(const name of ADVANCED_GRAPH_NAMES){
    const args=commandArguments(source,name);
    if(!args)continue;
    if(name==="domaincolor"){
      if(args.length!==1)throw new Error("Use domaincolor(expression), with z = x + i*y.");
      const values:Record<string,Complex>={z:{re:0,im:0}};
      const evaluate=compileComplexExpression(args[0]!,variables,values);
      return {kind:"plane",evaluate:(x,y)=>{values.z={re:x,im:y};return domainColor(evaluate(x,y));}};
    }

    if(name==="mandelbrot"||name==="julia"){
      if(args.length!==(name==="julia"?3:1))throw new Error(name==="julia"?"Use julia(realC, imaginaryC, iterations).":"Use mandelbrot(iterations).");
      const iterations=scalar(args.at(-1)!);
      if(!Number.isInteger(iterations)||iterations<1||iterations>500)throw new Error("Fractal iterations must be an integer from 1 to 500.");
      const c=name==="julia"?{re:scalar(args[0]!),im:scalar(args[1]!)}:undefined;
      return {kind:"plane",evaluate:(x,y)=>fractalColor(x,y,iterations,c)};
    }
    if(name==="trajectory"){
      if(args.length!==6)throw new Error("Use trajectory(dx, dy, x0, y0, startTime, endTime).");
      const u=compileExpression(args[0]!,variables,true),v=compileExpression(args[1]!,variables,true);
      const x0=scalar(args[2]!),y0=scalar(args[3]!),start=scalar(args[4]!),end=scalar(args[5]!);
      const samples=solveTrajectory((x,y)=>[u(x,y).value.toNumber(),v(x,y).value.toNumber()],x0,y0,start,end);
      return {kind:"parametric",start,end,evaluate:t=>[interpolateSolution(samples.x,t),interpolateSolution(samples.y,t)]};
    }
    if(name==="transform"){
      if(args.length!==5)throw new Error("Use transform(a, b, c, d, pointOrPolygonOrCurve).");
      const a=scalar(args[0]!),b=scalar(args[1]!),c=scalar(args[2]!),d=scalar(args[3]!);
      const point=([x,y]:[number,number]):[number,number]=>{
        const result:[number,number]=[a*x+b*y,c*x+d*y];
        if(!result.every(Number.isFinite))throw new Error("Transformed point became nonfinite.");
        return result;
      };
      const transform=(graph:GraphExpression):GraphExpression=>{
        if(graph.kind==="point")return {...graph,xVariables:[],yVariables:[],evaluate:()=>point(graph.evaluate())};
        if(graph.kind==="polygon")return {kind:"polygon",evaluate:()=>graph.evaluate().map(point)};
        if(graph.kind==="parametric")return {...graph,evaluate:(t:number)=>point(graph.evaluate(t))};
        if(graph.kind==="collection")return {kind:"collection",graphs:graph.graphs.map(transform)};
        throw new Error("Transform supports points, polygons, and parametric curves (including ODE and trajectory curves).");
      };
      return transform(compileGraphExpression(args[4]!,variables));
    }
  }
  return undefined;
}

function analysisScalar(source:string,variables:Record<string,number>):number{
  if(graphRelation(source)||freeIdentifiers(source).some(n=>["x","y","t","z"].includes(n)))
    throw new Error("Analysis parameters must be scalar expressions, not graph coordinates or equations.");
  return analysisFinite(compileExpression(source,variables)(0).value.toNumber());
}
function analysisList(source:string,variables:Record<string,number>,lists:Record<string,string[]>):number[]{
  const expansion=expandCollections(source,text=>analysisScalar(text,variables),lists);
  if(!expansion.list)throw new Error("This argument requires a numeric list or table column.");
  return expansion.items.map(text=>analysisScalar(text,variables));
}
function analysisFunction(source:string,variables:Record<string,number>):(x:number)=>number{
  if(graphRelation(source))throw new Error("Use an expression in x, not an equation.");
  const evaluate=compileExpression(source,variables);
  return x=>analysisFinite(evaluate(x).value.toNumber());
}
function taylorEvaluator(source:string,center:number,order:number,variables:Record<string,number>):(x:number)=>number{
  if(!Number.isInteger(order)||order<0||order>8)throw new Error("Taylor order must be an integer from 0 to 8.");
  if(graphRelation(source))throw new Error("Taylor requires an expression in x, not an equation.");
  let tree=normalizeSymbolic(parse(source,false,true,Object.keys(variables)));
  let factorial=1;
  const coefficients:number[]=[];
  for(let i=0;i<=order;i++){
    const text=symbolicSource(tree);
    if(text.length>512)throw new Error("Taylor derivative exceeds the 512-character work limit; reduce the order.");
    coefficients.push(analysisFinite(compileExpression(text,variables)(center).value.toNumber()/factorial));
    if(i<order){tree=symbolicDerivative(tree,"x",getAngleMode()==="degrees");factorial*=i+1;}
  }
  return x=>{
    let value=0;for(let i=coefficients.length-1;i>=0;i--)value=value*(x-center)+coefficients[i]!;
    return analysisFinite(value);
  };
}
function compileAnalysisGraph(source:string,variables:Record<string,number>,lists:Record<string,string[]>={}):GraphExpression|undefined{
  const scalar=(s:string)=>analysisScalar(s,variables),list=(s:string)=>analysisList(s,variables,lists);
  for(const name of ANALYSIS_GRAPH_NAMES){
    const args=commandArguments(source,name);if(!args)continue;
    const need=(count:number)=>{if(args.length!==count)throw new Error(`Incorrect arguments for ${name}; see Settings → Functions.`);};
    if(name==="heatmap"||name==="contours"){
      need(name==="heatmap"?3:4);
      if(graphRelation(args[0]!))throw new Error("Use a real expression in x and y, not an equation.");
      const evaluate=compileExpression(args[0]!,variables,true),lo=scalar(args[1]!),hi=scalar(args[2]!);
      if(!(lo<hi))throw new Error("Color/contour range must be finite and increasing.");
      const span=analysisFinite(hi-lo);
      if(name==="heatmap")return {kind:"plane",evaluate:(x,y)=>{
        const value=analysisFinite(evaluate(x,y).value.toNumber());
        return [240*(1-Math.max(0,Math.min(1,(value-lo)/span))),0.85,0.95];
      }};
      const count=scalar(args[3]!);
      if(!Number.isInteger(count)||count<2||count>20)throw new Error("Contour count must be an integer from 2 to 20.");
      return {kind:"collection",graphs:Array.from({length:count},(_,i)=>({
        kind:"implicit",evaluate:(x:number,y:number)=>analysisFinite(evaluate(x,y).value.toNumber()-(lo+span*i/(count-1))),
      }))};
    }
    if(name==="fourier"||name==="fourierdata"){
      need(name==="fourier"?4:3);
      const series=name==="fourier"?fourierSeries(analysisFunction(args[0]!,variables),scalar(args[1]!),scalar(args[2]!),scalar(args[3]!)):
        dataFourier(list(args[0]!),scalar(args[1]!),scalar(args[2]!));
      return {kind:"explicit",evaluate:x=>evaluateFourier(series,x)};
    }
    if(name==="taylor"||name==="taylorerror"){
      need(3);
      const polynomial=taylorEvaluator(args[0]!,scalar(args[1]!),scalar(args[2]!),variables);
      const original=analysisFunction(args[0]!,variables);
      return {kind:"explicit",evaluate:x=>name==="taylor"?polynomial(x):Math.abs(original(x)-polynomial(x))};
    }
    if(name==="tangentline"||name==="normalline"){
      need(2);const f=analysisFunction(args[0]!,variables),x0=scalar(args[1]!),y0=f(x0),slope=derivatives(f,x0).first;
      if(name==="normalline"&&Math.abs(slope)<1e-12)return {kind:"sideways",evaluate:()=>x0};
      const m=name==="tangentline"?slope:-1/slope;
      return {kind:"explicit",evaluate:x=>y0+m*(x-x0)};
    }
    if(name==="areabetween"){
      need(4);const f=analysisFunction(args[0]!,variables),g=analysisFunction(args[1]!,variables),start=scalar(args[2]!),end=scalar(args[3]!);
      analysisInterval(start,end);
      return {kind:"inequality",relation:"<=",evaluate:(x,y)=>Math.max(start-x,x-end,Math.min(f(x),g(x))-y,y-Math.max(f(x),g(x)))};
    }
    if(name==="errorbars"){
      if(args.length!==3&&args.length!==4)throw new Error("Use errorbars(X,Y,Yerrors[,Xerrors]) with equal-length lists.");
      const xs=list(args[0]!),ys=list(args[1]!),ey=list(args[2]!),ex=args[3]?list(args[3]):xs.map(()=>0);
      if(!xs.length||xs.length>256||ys.length!==xs.length||ey.length!==xs.length||ex.length!==xs.length)
        throw new Error("Error bars require equal-length lists of 1–256 observations.");
      if([...ey,...ex].some(e=>e<0))throw new Error("Error-bar sizes must be nonnegative.");
      const graphs:GraphExpression[]=[];
      const line=(x1:number,y1:number,x2:number,y2:number)=>{
        if(![x1,y1,x2,y2].every(Number.isFinite))throw new Error("Error-bar endpoint became nonfinite.");
        graphs.push({kind:"parametric",start:0,end:1,evaluate:t=>[x1+(x2-x1)*t,y1+(y2-y1)*t]});
      };
      const span=Math.max(1,Math.max(...xs)-Math.min(...xs)),cap=span*0.005;
      xs.forEach((x,i)=>{
        const y=ys[i]!,e=ey[i]!,h=ex[i]!;
        graphs.push({kind:"point",xVariables:[],yVariables:[],evaluate:()=>[x,y]});
        line(x,y-e,x,y+e);line(x-cap,y-e,x+cap,y-e);line(x-cap,y+e,x+cap,y+e);
        if(h){line(x-h,y,x+h,y);line(x-h,y-cap,x-h,y+cap);line(x+h,y-cap,x+h,y+cap);}
      });
      return {kind:"collection",graphs};
    }
    if(name==="confidenceband"||name==="predictionband"){
      need(3);
      const band=linearBand(list(args[0]!),list(args[1]!),scalar(args[2]!),name==="predictionband");
      return {kind:"collection",graphs:[
        {kind:"inequality",relation:"<=",evaluate:(x,y)=>{const {mean,width}=band(x);return Math.abs(y-mean)-width;}},
        {kind:"explicit",evaluate:x=>{const {mean,width}=band(x);return mean-width;}},
        {kind:"explicit",evaluate:x=>{const {mean,width}=band(x);return mean+width;}},
        {kind:"explicit",evaluate:x=>band(x).mean},
      ]};
    }
  }
  return undefined;
}

export function resultCommand(source:string,variables:Record<string,number>={},lists:Record<string,string[]>={}):string|undefined {
  for(const name of ANALYSIS_RESULT_NAMES){
    const args=commandArguments(source,name);if(!args)continue;
    const scalar=(s:string)=>analysisScalar(s,variables),format=(n:number)=>Number(n.toPrecision(12)).toString();
    const need=(n:number)=>{if(args.length!==n)throw new Error(`Incorrect arguments for ${name}; see Settings → Functions.`);};
    if(name==="unitcheck"){need(1);return unitResult(evaluateUnits(parse(args[0]!,false,false,[...Object.keys(UNITS),...Object.keys(variables)]),variables));}
    if(name==="convert"){
      need(3);
      const from=evaluateUnits(parse(args[1]!,false,false,Object.keys(UNITS))),to=evaluateUnits(parse(args[2]!,false,false,Object.keys(UNITS)));
      return `${format(convertUnits(scalar(args[0]!),from,to))} ${args[2]}`;
    }
    if(name==="spectrum"){
      need(2);const values=analysisList(args[0]!,variables,lists);
      const series=dataFourier(values,scalar(args[1]!),Math.min(32,Math.floor((values.length-1)/2)));
      return `DC ${format(series.a[0]!/2)}; ${series.a.slice(1).map((a,i)=>`${format((i+1)/series.period)} cycles/unit: amplitude ${format(Math.hypot(a,series.b[i+1]!))}, phase ${format(Math.atan2(series.b[i+1]!,a))} rad`).join("; ")}`;
    }
    need(name==="curvature"?2:name==="area"?4:3);
    const f=analysisFunction(args[0]!,variables);
    if(name==="curvature"){const d=derivatives(f,scalar(args[1]!));return format(analysisFinite(Math.abs(d.second)/(1+d.first*d.first)**1.5));}
    if(name==="arclength"){return format(integrate(x=>Math.hypot(1,derivatives(f,x).first),scalar(args[1]!),scalar(args[2]!)));}
    if(name==="area"){const g=analysisFunction(args[1]!,variables);return format(integrate(x=>Math.abs(f(x)-g(x)),scalar(args[2]!),scalar(args[3]!)));}
    if(name==="roots"){
      need(3);const result=findRoots(f,scalar(args[1]!),scalar(args[2]!));
      return `${result.roots.length?result.roots.map(r=>`x=${format(r.x)} (|f|=${format(r.residual)})`).join("; "):"No verified roots found"} · bounded numerical search, not exhaustive${result.gaps?` · ${result.gaps} undefined samples: ${result.firstError}`:""}`;
    }
  }
  for(const name of RESULT_COMMAND_NAMES){
    const args=commandArguments(source,name);
    if(!args)continue;
    if(["simplify","differentiate","factor"].includes(name)){
      if(args.length<1||args.length>(name==="simplify"?1:2))throw new Error(`Use ${name}(expression${name==="simplify"?"":", variable"}).`);
      if(graphRelation(args[0]!))throw new Error("Symbolic commands require an expression, not an equation or inequality.");
      const variable=args[1]??"x";
      if(!/^[a-z](?:_[a-z0-9]+)?$/.test(variable)||["e","i"].includes(variable))throw new Error("Use one letter or subscripted variable.");
      const tree=normalizeSymbolic(parse(args[0]!,true,true,freeIdentifiers(args[0]!)));
      const result=name==="factor"?factorPolynomial(tree,variable):
        symbolicSource(name==="simplify"?simplifyNode(tree):symbolicDerivative(tree,variable,getAngleMode()==="degrees"));
      if(result.length>512)throw new Error("Symbolic result exceeds the 512-character expression limit.");
      return result;
    }
    const count=name==="matmul"?8:4;
    if(args.length!==count)throw new Error(`Use ${name}(${count===8?"a,b,c,d,e,f,g,h":"a,b,c,d"}) for row-major 2x2 matrices.`);
    const values=args.map(arg=>{
      if(freeIdentifiers(arg).some(n=>["x","y","t"].includes(n)))throw new Error("Matrix entries must be scalar expressions.");
      const value=compileExpression(arg,variables)(0).value.toNumber();
      if(!Number.isFinite(value))throw new Error("Matrix entries must be finite.");
      return value;
    });
    const a:Matrix2=[values[0]!,values[1]!,values[2]!,values[3]!];
    if(name==="det"){
      const det=a[0]*a[3]-a[1]*a[2];
      if(!Number.isFinite(det))throw new Error("Matrix determinant is nonfinite.");
      return String(det);
    }
    const result=name==="inverse"?inverseMatrix(a):name==="matmul"?multiplyMatrices(a,[values[4]!,values[5]!,values[6]!,values[7]!]):a;
    if(!result.every(Number.isFinite))throw new Error("Matrix result is nonfinite.");
    return `[[${result[0]}, ${result[1]}], [${result[2]}, ${result[3]}]]`;
  }
  if(new RegExp(`^\\s*(?:${[...RESULT_COMMAND_NAMES,...ANALYSIS_RESULT_NAMES].join("|")})\\s*\\(`,"i").test(source))
    throw new Error("Incomplete result command; check the closing parenthesis and arguments.");
  return undefined;
}

function compileDifferentialGraph(source:string, variables:Record<string,number>):GraphExpression|undefined {
  const match=/^(vectorfield|slopefield|ode)\s*\(([\s\S]*)\)$/i.exec(source.trim());
  if (!match) return undefined;
  const name=match[1]!.toLowerCase(),args=splitCallArguments(match[2]!);
  const count=name==="vectorfield"?2:name==="slopefield"?1:5;
  if (args.length!==count || args.some(arg=>!arg.trim()))
    throw new Error(name==="ode"?"Use ode(slope, x0, y0, start, end).":`Use ${name}(${name==="vectorfield"?"dx, dy":"slope"}).`);
  const compile=(text:string)=>{
    if (graphRelation(text)) throw new Error("Field components and ODE arguments must be expressions, not equations.");
    return compileExpression(text,variables,true);
  };
  const first=compile(args[0]!);
  if (name!=="ode") {
    const second=name==="vectorfield"?compile(args[1]!):undefined;
    return {kind:"vectorfield",arrows:name==="vectorfield",evaluate:(x,y)=>{
      const a=first(x,y).value.toNumber(),b=second?.(x,y).value.toNumber();
      const result:[number,number]=second?[a,b!]:[1,a];
      if (!result.every(Number.isFinite)) throw new Error("Field components must be finite.");
      return result;
    }};
  }
  const values=args.slice(1).map(text=>{
    if (freeIdentifiers(text).some(name=>["x","y","t"].includes(name)))
      throw new Error("ODE initial point and interval must be scalar values, not graph coordinates.");
    return compile(text)(0,0).value.toNumber();
  });
  const x0=values[0]!,y0=values[1]!,start=values[2]!,end=values[3]!;
  const samples=solveDifferentialEquation((x,y)=>first(x,y).value.toNumber(),x0,y0,start,end);
  return {kind:"parametric",start,end,evaluate:x=>[x,interpolateSolution(samples,x)]};
}

export function compileGraphExpression(
  source: string,
  variables: Record<string, number> = {},
  statisticsMode: StatisticsMode = "population",
):
  GraphExpression {
  if (expressionLength(source) > MAX_EXPRESSION_LENGTH || source.length > MAX_RECURSIVE_PAYLOAD_LENGTH * 8) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  const trimmed = source.trim();
  const analysis=compileAnalysisGraph(trimmed,variables);
  if(analysis)return analysis;
  const advanced=compileAdvancedGraph(trimmed,variables);
  if(advanced)return advanced;
  const differential=compileDifferentialGraph(trimmed,variables);
  if (differential) return differential;
  const collection = compileCollectionGraph(trimmed, variables, {}, false, statisticsMode);
  if (collection) return collection;
  source = rewriteDistributions(source, (text) => compileExpression(text, variables)(0).value.toNumber());
  const native = compileNativeGraph(trimmed, variables);
  if (native) return native;
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
  if (expressionLength(source) > MAX_EXPRESSION_LENGTH || source.length > MAX_RECURSIVE_PAYLOAD_LENGTH * 8) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  const analysis=compileAnalysisGraph(source,variables,lists);
  if(analysis)return analysis;
  source = rewriteRandom(source, (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode);
  const inference = inferenceCall(source);
  if (inference && !inference.property) {
    const result = readInference(inference, (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode);
    const evaluate = (x: number) => result.distribution.pdf(x);
    const threshold = result.score;
    const shaded = (x: number) => result.tails < 0 ? x <= threshold :
      result.tails > 0 ? x >= threshold : Math.abs(x) >= Math.abs(threshold);
    return { kind: "collection", graphs: [
      { kind: "explicit", evaluate },
      { kind: "inequality", relation: "<=", evaluate: (x: number, y: number) => {
        const density = evaluate(x);
        return shaded(x) && y >= 0 ? y - density : 1;
      } },
      { kind: "point", xVariables: [], yVariables: [], evaluate: () => [threshold, evaluate(threshold)] },
    ] };
  }
  const rewrittenInference = rewriteInferenceProperties(source, (call) =>
    `(${inferenceProperty(readInference(call, (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode), call.property!)})`);
  if (rewrittenInference !== source) return compileCollectionGraph(rewrittenInference, variables, lists, fast, statisticsMode) ??
    (fast ? compileFastGraphExpression(rewrittenInference, variables, statisticsMode) : compileGraphExpression(rewrittenInference, variables, statisticsMode));
  const distribution = distributionCall(source);
  if (distribution && !source.slice(distribution.end).trim()) {
    const evaluated = readDistribution(source, (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode);
    if (evaluated.discrete) {
      const [supportMin, supportMax] = evaluated.support();
      const low = Math.max(supportMin, evaluated.inverse(0.00001));
      const high = Math.min(supportMax, evaluated.inverse(0.99999));
      if (!evaluated.values && (!Number.isFinite(high - low) || high - low >= 2048)) {
        throw new Error("Discrete distribution plot exceeds 2048 points; use .pdf(x) or .cdf(x) to graph it.");
      }
      const outcomes = evaluated.values ? [...new Set(evaluated.values)].sort((a, b) => a - b) :
        Array.from({ length: Math.floor(high - low) + 1 }, (_, index) => low + index);
      if (outcomes.length > 2048) throw new Error("Discrete distribution plot exceeds 2048 points; use .pdf(x) or .cdf(x) to graph it.");
      return { kind: "collection", graphs: outcomes.map((x) => ({
        kind: "point", xVariables: [], yVariables: [], evaluate: () => [x, evaluated.pdf(x)],
      })) };
    }
  }
  const rewrittenDistribution = rewriteDistributions(source,
    (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode);
  if (rewrittenDistribution !== source) return compileCollectionGraph(rewrittenDistribution, variables, lists, fast, statisticsMode) ??
    (fast ? compileFastGraphExpression(rewrittenDistribution, variables, statisticsMode) : compileGraphExpression(rewrittenDistribution, variables, statisticsMode));
  const shapes = statisticalPlotShapes(source,
    (text) => compileExpression(text, variables)(0).value.toNumber(), lists, statisticsMode);
  if (shapes) {
    return { kind: "collection", graphs: shapes.map((shape): GraphExpression => {
      if (shape.kind === "point") return { kind: "point", xVariables: [], yVariables: [], evaluate: () => shape.point };
      if (shape.kind === "polygon") return { kind: "polygon", evaluate: () => shape.vertices };
      return { kind: "parametric", start: 0, end: 1, evaluate: (t: number) => [
        shape.start[0] * (1 - t) + shape.end[0] * t,
        shape.start[1] * (1 - t) + shape.end[1] * t,
      ] };
    }) };
  }
  if (/^polygon\s*\(/i.test(source.trim())) {
    const trimmed = source.trim();
    if(!trimmed.endsWith(")")){
      const restricted=compileRestrictedGraph(trimmed,variables,fast,statisticsMode);
      if(restricted)return restricted;
    }
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
      vertexSources:vertices.map((vertex)=>pointSources(vertex)!),
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
    if(expansion.items[0]===source)return undefined;
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
  if (expressionLength(source) > MAX_EXPRESSION_LENGTH || source.length > MAX_RECURSIVE_PAYLOAD_LENGTH * 8) throw new Error(`Expressions must be ${MAX_EXPRESSION_LENGTH} characters or fewer`);
  const trimmed = source.trim();
  const analysis=compileAnalysisGraph(trimmed,variables);
  if(analysis)return analysis;
  const advanced=compileAdvancedGraph(trimmed,variables);
  if(advanced)return advanced;
  const differential=compileDifferentialGraph(trimmed,variables);
  if (differential) return differential;
  const collection = compileCollectionGraph(trimmed, variables, {}, true, statisticsMode);
  if (collection) return collection;
  source = rewriteDistributions(source, (text) => compileExpression(text, variables)(0).value.toNumber());
  const native = compileNativeGraph(trimmed, variables);
  if (native) return native;
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
