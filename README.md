# Better Desmos

A static, browser-based graphing calculator built with TypeScript and Vite. Its small stack keeps the app easy to run and the math engine independently testable. It uses no animation or animated graph updates.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Run the math tests and production build with:

```sh
npm test
npm run build
```

## Expressions

Each row plots `y` as a function of `x`. The optional `y =` prefix is accepted. Supported syntax:

- Numbers, parentheses, `x`, `pi`, and `e`
- `+`, `-`, `*`, `/`, and `^` (use `*` explicitly; implicit multiplication such as `2x` is not supported)
- `sqrt`, `abs`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `ln`, `log` (base 10), and `exp`
- Trigonometric functions use radians

Invalid syntax is reported beside its expression. Domain errors at individual sample points leave gaps in the graph, as expected for functions with restricted domains or discontinuities.

## Numeric approach and limitations

Finite decimal literals and arithmetic made only from rational values are represented as reduced `BigInt` fractions. This preserves exact rational values internally, including fractions such as `1 / 3`; conversion to decimal occurs when a value needs to be plotted. Exact square roots and integer powers are retained as rationals when practical.

Operations involving `pi`, `e`, variables, or transcendental functions use `decimal.js` at 50 significant digits with round-half-even rounding. These are high-precision approximations, not symbolic or mathematically exact results. The graph is itself an approximation: it samples at roughly one point per horizontal canvas pixel, so narrow features may be missed and discontinuities can only be detected heuristically. The horizontal input coordinates originate from JavaScript canvas pixel coordinates and are therefore approximate too.

This is a numerical graphing prototype, not a proof system or a guarantee of correctly rendered features at every scale. Expressions are parsed by the app's own bounded parser and are never executed as JavaScript.
