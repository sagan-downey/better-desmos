export interface FunctionReferenceEntry {
  name: string;
  syntax: string;
  description: string;
  aliases?: string[];
}

export interface FunctionReferenceCategory {
  title: string;
  entries: FunctionReferenceEntry[];
}

export const FUNCTION_REFERENCE: FunctionReferenceCategory[] = [
  {
    title: "Arithmetic & rounding",
    entries: [
      { name: "sqrt", syntax: "sqrt(x)", description: "Square root; x must be ≥ 0." },
      { name: "abs", syntax: "abs(x) or |x|", description: "Absolute value." },
      { name: "sign", syntax: "sign(x)", description: "−1, 0, or 1 depending on the sign of x.", aliases: ["sgn"] },
      { name: "floor", syntax: "floor(x)", description: "Greatest integer ≤ x." },
      { name: "ceil", syntax: "ceil(x)", description: "Least integer ≥ x." },
      { name: "round", syntax: "round(x) or round(x, n)", description: "Round half up, optionally to n decimal places (−100 to 100)." },
      { name: "mod", syntax: "mod(a, b)", description: "Remainder with the sign of b; b cannot be 0." },
      { name: "gcd", syntax: "gcd(a, b)", description: "Greatest common divisor of two integers." },
      { name: "lcm", syntax: "lcm(a, b)", description: "Least common multiple of two integers." },
    ],
  },
  {
    title: "Exponents & logarithms",
    entries: [
      { name: "exp", syntax: "exp(x)", description: "e raised to x." },
      { name: "ln", syntax: "ln(x)", description: "Natural logarithm; x must be > 0." },
      { name: "log", syntax: "log(x)", description: "Base-10 logarithm; x must be > 0." },
      { name: "logbase", syntax: "log_b(x) or logbase(x, b)", description: "Logarithm with base b > 0, b ≠ 1." },
    ],
  },
  {
    title: "Trigonometry",
    entries: [
      { name: "sin", syntax: "sin(x), cos(x), tan(x)", description: "Sine, cosine, and tangent. Uses the Angle mode setting." },
      { name: "cos", syntax: "cos(x)", description: "Cosine." },
      { name: "tan", syntax: "tan(x)", description: "Tangent." },
      { name: "sec", syntax: "sec(x), csc(x), cot(x)", description: "Secant, cosecant, and cotangent." },
      { name: "csc", syntax: "csc(x)", description: "Cosecant." },
      { name: "cot", syntax: "cot(x)", description: "Cotangent." },
      { name: "arcsin", syntax: "arcsin(x), arccos(x)", description: "Inverse sine and cosine; x in [−1, 1].", aliases: ["asin", "arccos", "acos"] },
      { name: "arctan", syntax: "arctan(x) or arctan(y, x)", description: "Inverse tangent; the two-input form gives the angle of the point (x, y).", aliases: ["atan"] },
      { name: "arcsec", syntax: "arcsec(x), arccsc(x), arccot(x)", description: "Inverse secant, cosecant, and cotangent.", aliases: ["arccsc", "arccot"] },
    ],
  },
  {
    title: "Hyperbolic",
    entries: [
      { name: "sinh", syntax: "sinh(x), cosh(x), tanh(x)", description: "Hyperbolic sine, cosine, and tangent.", aliases: ["cosh", "tanh"] },
      { name: "sech", syntax: "sech(x), csch(x), coth(x)", description: "Hyperbolic secant, cosecant, and cotangent.", aliases: ["csch", "coth"] },
      { name: "arcsinh", syntax: "arcsinh(x), arccosh(x), arctanh(x)", description: "Inverse hyperbolic functions.", aliases: ["asinh", "arccosh", "acosh", "arctanh", "atanh"] },
      { name: "arcsech", syntax: "arcsech(x), arccsch(x), arccoth(x)", description: "Inverse hyperbolic secant, cosecant, and cotangent.", aliases: ["arccsch", "arccoth"] },
    ],
  },
  {
    title: "Combinatorics",
    entries: [
      { name: "factorial", syntax: "x! or factorial(x)", description: "Factorial of a non-negative integer up to 10000." },
      { name: "ncr", syntax: "nCr(n, r)", description: "Combinations: ways to choose r of n." },
      { name: "npr", syntax: "nPr(n, r)", description: "Permutations: ordered choices of r of n." },
    ],
  },
  {
    title: "Lists",
    entries: [
      { name: "length", syntax: "length(L)", description: "Number of elements.", aliases: ["count"] },
      { name: "join", syntax: "join(L, M, …)", description: "Concatenate lists and values." },
      { name: "sort", syntax: "sort(L)", description: "Sort ascending." },
      { name: "reverse", syntax: "reverse(L)", description: "Reverse the order." },
      { name: "unique", syntax: "unique(L)", description: "Remove repeated values, keeping first occurrences." },
    ],
  },
  {
    title: "Statistics",
    entries: [
      { name: "total", syntax: "total(L)", description: "Sum of the elements.", aliases: ["sum"] },
      { name: "product", syntax: "product(L)", description: "Product of the elements." },
      { name: "mean", syntax: "mean(L)", description: "Arithmetic mean." },
      { name: "median", syntax: "median(L)", description: "Middle value (mean of the two middle values for even lengths)." },
      { name: "min", syntax: "min(L)", description: "Smallest value." },
      { name: "max", syntax: "max(L)", description: "Largest value." },
      { name: "variance", syntax: "variance(L)", description: "Variance using the Statistics setting (population or sample).", aliases: ["var"] },
      { name: "stdev", syntax: "stdev(L)", description: "Standard deviation using the Statistics setting." },
      { name: "variancep", syntax: "variancep(L)", description: "Population variance.", aliases: ["varp"] },
      { name: "stdevp", syntax: "stdevp(L)", description: "Population standard deviation." },
    ],
  },
  {
    title: "Calculus & notation",
    entries: [
      { name: "d/dx", syntax: "d/dx(f) or f'(x)", description: "Numerical derivative; f''(x) for the second derivative." },
      { name: "int", syntax: "int_{a}^{b} f dx or ∫", description: "Numerical definite integral." },
      { name: "sum_", syntax: "sum_{n=1}^{10} f or Σ", description: "Finite sum over integer n." },
      { name: "prod_", syntax: "prod_{n=1}^{10} f or Π", description: "Finite product over integer n." },
    ],
  },
  {
    title: "Geometry",
    entries: [
      { name: "polygon", syntax: "polygon((x1,y1), (x2,y2), …)", description: "Filled polygon from 3–2048 vertices or point lists." },
    ],
  },
];

export function filterFunctionReference(query: string): FunctionReferenceCategory[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return FUNCTION_REFERENCE;
  return FUNCTION_REFERENCE.map((category) => ({
    title: category.title,
    entries: category.entries.filter((entry) => {
      const haystack = [entry.name, entry.syntax, entry.description, category.title, ...(entry.aliases ?? [])].join(" ").toLowerCase();
      return terms.every((term) => haystack.includes(term));
    }),
  })).filter((category) => category.entries.length > 0);
}
