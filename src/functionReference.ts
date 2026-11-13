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
  {title:"Real fields & approximations",entries:[
    {name:"heatmap",syntax:"heatmap(x^2+y^2,0,10)",description:"Real-valued sampled color field. Low values blue, high red, clamped to the supplied range."},
    {name:"contours",syntax:"contours(x^2+y^2,1,9,5)",description:"2–20 equally spaced real level curves between low/high values, including endpoints."},
    {name:"fourier",syntax:"fourier(expression,start,end,harmonics)",description:"Periodic reconstruction from 1024 uniform samples; 0–32 harmonics, periodic extension outside the interval. Trig basis is radians regardless of Angle mode."},
    {name:"fourierdata",syntax:"fourierdata(samples,spacing,harmonics)",description:"Periodic discrete Fourier reconstruction of 2–2048 equally spaced finite samples. Harmonics below Nyquist, at most 32."},
    {name:"spectrum",syntax:"spectrum(samples,spacing)",description:"DC and first 32 sub-Nyquist amplitudes/phases; frequency in cycles per input-spacing unit, phase in radians."},
    {name:"taylor",syntax:"taylor(expression,center,order)",description:"Local Taylor approximation in x, orders 0–8. Derivatives from supported symbolic rules; coefficients evaluated numerically."},
    {name:"taylorerror",syntax:"taylorerror(expression,center,order)",description:"Absolute difference between the original function and its Taylor approximation, not a certified error bound."},
  ]},
  {title:"Geometry & root search",entries:[
    {name:"tangentline",syntax:"tangentline(expression,x0)",description:"Numerical tangent line at x0, using a five-point derivative."},
    {name:"normalline",syntax:"normalline(expression,x0)",description:"Numerical normal line at x0; vertical for a horizontal tangent."},
    {name:"arclength",syntax:"arclength(expression,start,end)",description:"Approximate length of y=f(x), with adaptive integration and finite differences."},
    {name:"curvature",syntax:"curvature(expression,x0)",description:"Approximate unsigned curvature of y=f(x), |f''|/(1+f'^2)^(3/2)."},
    {name:"area",syntax:"area(f,g,start,end)",description:"Approximate unsigned area between two explicit functions."},
    {name:"areabetween",syntax:"areabetween(f,g,start,end)",description:"Shade the region between two explicit functions on a bounded x interval."},
    {name:"roots",syntax:"roots(expression,start,end)",description:"Bounded numerical root search with residuals and undefined-sample warnings; can miss narrow, clustered, or high-frequency roots."},
  ]},
  {title:"Uncertainty & SI units",entries:[
    {name:"errorbars",syntax:"errorbars(X,Y,Yerrors[,Xerrors])",description:"Symmetric user-supplied uncertainties for 1–256 points. Lists must have equal length and errors must be nonnegative."},
    {name:"confidenceband",syntax:"confidenceband(X,Y,0.95)",description:"Pointwise confidence band for the linear-regression mean. At least three observations; independent normal constant-variance errors assumed. Not a simultaneous band."},
    {name:"predictionband",syntax:"predictionband(X,Y,0.95)",description:"Pointwise prediction band for one new observation in ordinary linear regression, under the same assumptions."},
    {name:"unitcheck",syntax:"unitcheck(3*m+2*cm)",description:"Explicit SI dimensional checking; prints base units. Arithmetic, powers and selected dimensionless functions. Ordinary expressions are unchanged."},
    {name:"convert",syntax:"convert(72,km/h,m/s)",description:"Convert a finite scalar between compatible explicit unit expressions. Unit names ignore case; K only, no offset Celsius/Fahrenheit."},
  ]},
  {title:"Complex images & fractals",entries:[
    {name:"domaincolor",syntax:"domaincolor(z^2-1)",description:"Complex-plane image with z=x+i*y. Hue is phase; brightness is magnitude, black at zero. Independent of Complex numbers setting."},
    {name:"mandelbrot",syntax:"mandelbrot(iterations)",description:"Mandelbrot escape-time image; integer iterations 1-500. Black means not escaped within the limit, not proven set membership."},
    {name:"julia",syntax:"julia(realC, imaginaryC, iterations)",description:"Julia escape-time image for z -> z^2+c; integer iterations 1-500."},
  ]},
  {title:"Matrices & exact forms",entries:[
    {name:"matrix",syntax:"matrix(a,b,c,d)",description:"Display a row-major 2x2 matrix. Entries use numerical scalar evaluation."},
    {name:"matmul",syntax:"matmul(a,b,c,d,e,f,g,h)",description:"Multiply two row-major 2x2 matrices."},
    {name:"det",syntax:"det(a,b,c,d)",description:"Numerical 2x2 determinant."},
    {name:"inverse",syntax:"inverse(a,b,c,d)",description:"Numerical inverse of a nonsingular 2x2 matrix."},
    {name:"transform",syntax:"transform(a,b,c,d,shape)",description:"Apply a 2x2 matrix to points, polygons, or parametric/ODE/trajectory curves."},
    {name:"simplify",syntax:"simplify(expression)",description:"Basic exact rational arithmetic and identity simplification; unsupported notation reports an error."},
    {name:"differentiate",syntax:"differentiate(expression,x)",description:"Exact derivative of supported arithmetic and elementary functions, using current angle mode. Rational constant exponents only."},
    {name:"factor",syntax:"factor(polynomial,x)",description:"Factor rational-coefficient polynomials of degree at most 8 into rational linear factors, using bounded rational-root search."},
  ]},
  {
    title: "Differential equations & fields",
    entries: [
      {name:"vectorfield",syntax:"vectorfield(dx, dy)",description:"Normalized direction arrows for a 2D vector field; components may use x, y, sliders, and user functions. Zero vectors are dots."},
      {name:"slopefield",syntax:"slopefield(slope)",description:"Direction segments for dy/dx = slope, e.g. slopefield(x-y)."},
      {name:"ode",syntax:"ode(slope, x0, y0, start, end)",description:"Numerical solution of dy/dx = slope through (x0,y0), integrated in both directions. Requires start <= x0 <= end; reports singularities or convergence failure."},
      {name:"trajectory",syntax:"trajectory(dx,dy,x0,y0,startTime,endTime)",description:"Autonomous 2D system trajectory from (x0,y0) at time 0, with startTime <= 0 <= endTime. Adaptive numerical integration."},
    ],
  },
  {
    title: "Sound",
    entries: [
      {name:"tone",syntax:"tone(frequency, gain)",description:"Type a tone expression to play a continuous sine tone. Frequency 20–20000 Hz; optional gain 0–1 (default 1). A mute control appears next to Project tools; loaded projects start muted."},
    ],
  },
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
      { name: "sort", syntax: "sort(L) or sort(L,keys)", description: "Sort ascending, optionally by a parallel list of keys. Unequal lists use the shortest length." },
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
      { name: "quantile", syntax: "quantile(L, p)", description: "Quantile for p from 0 to 1, using linear interpolation between sorted values." },
      { name: "quartile", syntax: "quartile(L, q)", description: "Quartile for q from 0 to 4; median-of-halves quartiles exclude the middle value for odd lists." },
      { name: "mad", syntax: "mad(L)", description: "Mean absolute deviation from the arithmetic mean." },
      { name: "cov", syntax: "cov(L, M)", description: "Sample covariance (n-1). Pairs values up to the shortest list." },
      { name: "covp", syntax: "covp(L, M)", description: "Population covariance (n). Pairs values up to the shortest list." },
      { name: "corr", syntax: "corr(L, M)", description: "Pearson correlation. Undefined for constant lists." },
      { name: "spearman", syntax: "spearman(L, M)", description: "Rank correlation, with average ranks for ties." },
      { name: "stats", syntax: "stats(L)", description: "Count, mean, median, sample/population SD, five-number summary, and a boxplot." },
    ],
  },
  {
    title: "Statistical plots",
    entries: [
      { name: "histogram", syntax: "histogram(L, width, mode, alignment)", description: "Bars from data. Defaults: width 1, count height, centered bins. Appearance controls select relative/density heights and left alignment." },
      { name: "dotplot", syntax: "dotplot(L, width, binned)", description: "Stacked points; defaults to width 1 and exact positions. Appearance controls select binned positions." },
      { name: "boxplot", syntax: "boxplot(L, offset, height, outliers)", description: "Box and whiskers; offset/height default to 1. Outliers 1 uses 1.5-IQR whiskers with separate outlier points." },
    ],
  },
  {
    title: "Probability distributions",
    entries: [
      { name: "normaldist", syntax: "normaldist(mean=0, SD=1)", description: "Normal distribution. Enter alone to plot the PDF; d=normaldist() defines a named distribution." },
      { name: "tdist", syntax: "tdist(df, shift=0, scale=1)", description: "Student t distribution with positive degrees of freedom and scale." },
      { name: "chisqdist", syntax: "chisqdist(df)", description: "Chi-square distribution with positive degrees of freedom." },
      { name: "uniformdist", syntax: "uniformdist(lower=0, upper=1)", description: "Uniform distribution on lower < upper." },
      { name: "binomialdist", syntax: "binomialdist(n, p)", description: "Binomial distribution; integer n from 0 to 100000, p from 0 to 1." },
      { name: "poissondist", syntax: "poissondist(mean)", description: "Poisson distribution; mean from greater than 0 through 10000." },
      { name: "geodist", syntax: "geodist(p)", description: "Trials until first success, starting at 1; p > 0 and p <= 1." },
      { name: "discretedist", syntax: "discretedist(values, weights)", description: "Finite discrete distribution. Optional nonnegative weights normalize to probabilities; matching lists up to 2048 outcomes." },
      { name: "pdf", syntax: "d.pdf(x)", description: "Probability density, or discrete probability mass. Integer-supported distributions round the input." },
      { name: "cdf", syntax: "d.cdf(x) or d.cdf(lower, upper)", description: "Cumulative probability or interval probability (discrete endpoints included)." },
      { name: "inversecdf", syntax: "d.inversecdf(p)", description: "Inverse cumulative probability; infinite endpoint quantiles report a domain error." },
      { name: "random", syntax: "random(), random(n), random(L[,n]), d.random([n])", description: "Uniform values, sampling with replacement from a list, or samples from a distribution. Rerandomize in the graph toolbar; samples otherwise stay fixed." },
      { name: "shuffle", syntax: "shuffle(L)", description: "Random permutation of a nonempty list. The saved random seed preserves samples across redraws and project reloads." },
      { name: "distribution properties", syntax: "d.mean, d.median, d.variance, d.stdev", description: "Numerical moments/median. Undefined or infinite moments report a domain error." },
    ],
  },
  {
    title: "Statistical inference",
    entries: [
      { name: "ztest", syntax: "ztest(L, populationSD) or ztest(L,SD,M,SD2)", description: "One/two-sample mean z-test. Summary inputs (mean,SD,n), optionally twice, are supported. Assumes known population SDs." },
      { name: "ttest", syntax: "ttest(L), ttest(L,M), or ttest(m)", description: "One-sample/Welch mean test, or fitted linear regression slope test. Summary (mean,SD,n) inputs are supported. Requires nonzero standard error; u=ttest(L) defines a reusable inference object." },
      { name: "zproptest", syntax: "zproptest(successes,n[,successes2,n2])", description: "One/two-proportion normal-approximation z-test. Two-proportion tests use a pooled null difference of 0." },
      { name: "chisqtest", syntax: "chisqtest(column1,column2,...)", description: "Chi-square independence test on at least two equal-length columns of counts. Expected cells below 5 trigger a warning." },
      { name: "chisqgof", syntax: "chisqgof(observed[,expectedWeights])", description: "Goodness-of-fit test; defaults to equal expected weights. Does not adjust df for estimated parameters." },
      { name: "test", syntax: "ttest(L).test(nullValue, tails=0, confidence=0.95)", description: "Set null hypothesis and tails: -1 left, 0 two-sided, 1 right. Numeric results expose .score, .p, .pleft, .pright, .estimate, .stderr, and t/chi-square .dof." },
      { name: "conf", syntax: "ttest(L).conf(0.95).lower or .upper", description: "Two-sided mean confidence interval; proportion intervals use the Wald approximation. Standalone tests show numerical summaries and shaded p-value tails." },
    ],
  },
  {
    title: "Complex numbers",
    entries: [
      {name:"real",syntax:"real(z)",description:"Real part in Complex mode. Complex arithmetic is numerical and uses principal branches."},
      {name:"imag",syntax:"imag(z)",description:"Imaginary part. Enable Complex numbers in Settings; use i for the imaginary unit."},
      {name:"conj",syntax:"conj(z)",description:"Complex conjugate."},
      {name:"arg",syntax:"arg(z)",description:"Principal argument; uses the Angle mode setting. Undefined at zero."},
    ],
  },
  {
    title: "Actions",
    entries: [
      { name: "->", syntax: "a -> a+1, p -> p+(1,2)", description: "Simultaneously update existing scalars, named points, or numeric/point lists. Run with the row button or a ticker; u=a->a+1 defines a reusable action. dt is the ticker interval in milliseconds." },
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
      { name: "polygon", syntax: "polygon((x1,y1), (x2,y2), …)", description: "Filled polygon from 3–2048 vertices or point lists. Trailing restrictions clip the interior; literal and independently slider-controlled vertices can be dragged." },
      { name: "distance", syntax: "distance(p,q)", description: "Euclidean distance between points or paired point lists." },
      { name: "midpoint", syntax: "midpoint(p,q)", description: "Point halfway between two points or paired point lists." },
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
