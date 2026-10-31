# Better Desmos

A browser-based graphing calculator built with TypeScript and Vite. Its small stack keeps the app easy to run and the math engine independently testable. Graph updates are immediate except for explicit slider playback.

## Versioning

The current app version is **1.3**. For each push, increment the second number (for example, `1.2` to `1.3`) and keep the package version in `package.json` in sync as `1.3.0`. When the user explicitly says a change is major enough, increment the first number and reset the second to zero (for example, `1.3` to `2.0`).

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

Each row can plot `y` as a function of `x`, an implicit equation whose contour is graphed where both sides are equal, or a shaded inequality. For example, `x^2 + y^2 = 4` draws a circle and `y >= x^2` shades the region above a parabola. The optional `y =` prefix is accepted for explicit functions. Supported syntax:

- Numbers, parentheses, `x`, `pi`, and `e`
- `+`, `-`, `*`, `/`, and `^`; implicit multiplication is supported (for example, `2x`, `35.6x`, or `2(x + 1)`)
- `sqrt`, `abs`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `ln`, `log` (base 10), and `exp`
- Trigonometric functions use radians

Each expression has a base-color picker. Expand **Spatial RGB** to set optional red, green, and blue formulas based on `x`, `y`, and sliders. Blank channels retain their base-color component. Formula results are rounded to the nearest integer and clamped to 0–255; invalid formulas and domain errors are reported beside the expression, and affected samples fall back to its base color. Spatial coloring is sampled along explicit/parametric/implicit curves and at cells in shaded inequalities, so color boundaries are numerical and follow the current graph sampling/detail settings. Slider playback re-evaluates the formulas on each frame. Precise mode uses the configured decimal precision for channel calculations; Desmos mode uses its ten-digit fast math.

Implicit equations use one equals sign and may contain both `x` and `y`. Invalid syntax is reported beside its expression. Domain errors at individual sample points leave gaps in the graph, as expected for functions with restricted domains or discontinuities.

Single-letter parameters such as `a` or `b` automatically get sliders (default range -10 to 10) and an editable numeric value; the same parameter value is shared by every expression that uses it. Each slider has **Play/Pause**, configurable minimum/maximum bounds, and a speed in parameter units per second. Playback moves back and forth between the bounds and updates the graph using the current accuracy/performance settings. Only one slider animates at a time; playback is not recorded or exported as video. Desmos mode can make playback smoother on slower computers, while precise mode and smaller sampling spacing can make individual frames more detailed at the cost of slower updates. Stop playback when you want to inspect a high-detail static frame. `parametric(x(t), y(t), start, end)` is written as `parametric(t, t^2, -3, 3)`. Polar graphs use `polar(radius, startAngle, endAngle)`, for example `polar(2, 0, 2pi)`; angles are radians. These curves are sampled numerically and can miss narrow features. Inequality shading uses a finite screen grid, so its boundary and fill are approximate.

`derivative(expression)` plots a five-point finite-difference derivative. `integral(expression, start, end)` plots a composite-Simpson numerical integral; bounds may include `x`, as in `integral(x^2, 0, x)`. Both are approximations using JavaScript floating-point samples, not symbolic calculus, and may be inaccurate near discontinuities or rapidly changing functions.

`list(v1, v2, ...)` plots the values as points at x-coordinates 1, 2, and so on. The numeric functions `sum`, `product`, `min`, `max`, `mean`, `median`, `variance`, `stdev`, and `factorial` can be used as expression rows with comma-separated arguments. Their results use standard JavaScript number arithmetic; `variance` and `stdev` are population statistics, and factorial is limited to integers 0–170.

Expressions can be hidden, assigned to editable folders, and given notes. Tables show count, mean x/y, median y, population standard deviation, and y range. Available regression models include linear, polynomial, logarithmic, exponential, power, sine, and tangent. Exponential and power fits use log-transformed least squares and require positive y-values; power fits also require positive x-values. All graph types and regressions are limited numerical implementations, not full Desmos syntax or symbolic algebra.

## Tables and regressions

Select **Add table** to create an editable x/y data table. Add or remove rows, and complete rows with finite numbers to plot their points. Empty rows are ignored; a partly filled row is reported as an error. Tables can be removed independently.

Click near a plotted explicit or parametric curve to add the snapped point to a table for that expression. The first click creates the table, and later clicks on the same curve append rows to it. Click-and-drag continues to pan the graph. Implicit contours and shaded inequalities are not sampled into tables because a single x-value can correspond to multiple y-values.

Each table can fit a **Linear**, **Quadratic**, or **Polynomial** regression (degrees 3–5), plus **Logarithmic** (`a + b ln(x)`), **Exponential** (`a exp(bx)`), **Power** (`a x^b`), **Sine** (`a sin(bx + c) + d`), and **Tangent** (`a tan(bx + c) + d`) models. Trigonometric regression uses radians and searches for a best-fit frequency; tangent fits use a bounded, multi-start numerical least-squares search and can fail or settle on a local fit, especially around asymptotes. Logarithmic regression requires positive x-values; exponential fits require positive y-values; power fits require positive x- and y-values. The fit is drawn as a dashed curve, and its approximate equation and R² value are shown below the table. Use **Copy to expressions** to add the fitted equation to the expression list as a normal editable graph. Polynomial fitting uses a centered, scaled least-squares QR calculation to reduce numerical conditioning problems. A degree `n` polynomial fit needs at least `n + 1` valid data points and enough distinct x-values; logarithmic/exponential/power fits need at least two and trigonometric fits need at least four data points. All regressions are approximate numerical fits, not exact identities; unusually clustered or ill-conditioned data can still lose accuracy.

## Hover points

Move the cursor over an explicit curve to reveal detected x/y-axis intercepts, local vertices, and intersections with other explicit curves. Implicit curves show their detected x/y-axis intercepts, but do not get intersection markers with other graphs; while hovered, they show a nearby coordinate. Point labels show the point type and approximate coordinates. Table data points remain visible as plotted points.

At most 10 axis intercepts per curve are retained, prioritizing those nearest the center of the current view. These detections use sampled graph data, so they are approximations, not a symbolic guarantee. Narrow features, tangent roots, or points between samples may be missed. Implicit curves are not assigned intersections with other graphs because the number of crossings can be infinite.

## Numeric approach and limitations

Finite decimal literals and arithmetic made only from rational values are represented as reduced `BigInt` fractions. This preserves exact rational values internally, including fractions such as `1 / 3`; conversion to decimal occurs when a value needs to be plotted. Exact square roots and integer powers are retained as rationals when practical.

Operations involving `pi`, `e`, variables, or transcendental functions use `decimal.js` at the configured precision (50 significant digits by default) with round-half-even rounding. These are high-precision approximations, not symbolic or mathematically exact results. The graph is itself an approximation: explicit curves are sampled about once per horizontal screen pixel by default. Implicit contours use a zoom-dependent grid from one screen pixel up to the configured spacing (six pixels by default), then join samples with linear interpolation. Narrow features can be missed, and discontinuities or ambiguous contour intersections are detected heuristically. The graph coordinates originate from JavaScript canvas coordinates and are therefore approximate too.

Expressions are parsed once and reused until edited. The coordinate grid is drawn over the plotted curves for readability.

## Accuracy and performance controls

Open **Accuracy & performance** in the expression panel to adjust:

- **Desmos mode**: switches to maximum-performance graph settings and rounds native JavaScript `Number`/`Math` calculations to 10 significant digits. It uses the widest graph sample spacing (4 px for explicit curves, 12 px maximum for implicit contours) and restores your previous settings when turned off. This is a fast approximate mode, not the official Desmos engine. Results are approximate and may differ from precise mode; the math precision slider is disabled while this mode is on.
- All three sliders are oriented consistently: **left = better performance**, **right = worse performance**.
- **Math precision**: 20–100 significant digits for approximate Decimal calculations (default 50). Moving right increases numeric precision and may increase calculation cost.
- **Explicit curve spacing**: 4–0.5 screen pixels between samples from left to right (default 1). Moving right samples the curve more densely, which may show more detail but can take longer.
- **Implicit contour spacing**: 12–1 screen pixels for the contour grid's maximum spacing from left to right (default 6). Moving right may capture more contour detail at a higher cost. The grid remains zoom-adaptive and uses at least one pixel between samples.

These are different tradeoffs: Desmos mode uses 10-digit standard floating-point arithmetic and wider sampling; increasing Decimal precision does not add more graph samples, and a denser graph does not increase Decimal precision. Rendered curves remain numerical approximations. Desmos mode does not reproduce Desmos-specific rendering effects such as Bernard. The current graph of `tan(35.6x)=0` shows the sampled zero contours.

This is a numerical graphing prototype, not a proof system or a guarantee of correctly rendered features at every scale. Expressions are parsed by the app's own bounded parser and are never executed as JavaScript.

## Saving and sharing

Projects autosave in browser local storage on the current device. **Export** downloads a JSON project file; **Import** validates and loads a project JSON file. **Share** copies a URL containing the project data, so anyone with that link can open the same expressions, tables, sliders, folders, notes, and graph view. Share links are self-contained and have a 50,000-character limit; use JSON export/import for larger projects. There is no cloud account or server-side project storage.
