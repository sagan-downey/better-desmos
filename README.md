# Better Desmos

A browser-based graphing calculator built with TypeScript and Vite. Its small stack keeps the app easy to run and the math engine independently testable. Graph updates are immediate except for explicit slider playback.

## Versioning

The current app version is **2.6**. Keep the package version in `package.json` in sync as `2.6.0`.

## Run locally

Requires Node.js 20 or newer. To run Better Desmos as a standalone file without a local server, build it and open `dist/better-desmos.html` in a browser:

```sh
npm install
npm run build
```

The generated HTML contains the app's JavaScript and CSS, so it can be copied and opened directly. Keep the project file to rebuild after changing the source.

Prebuilt downloads are available from the GitHub [Releases](https://github.com/sagan-downey/better-desmos/releases) page. Download `better-desmos.html`, then open it in Firefox or another browser.

To run the development version with hot reload:

```sh
npm run dev
```

Run the math tests and production build with:

```sh
npm test
npm run build
```

## Expressions

Each row can plot `y` as a function of `x`, an implicit equation whose contour is graphed where both sides are equal, or a shaded inequality. Equations that can be solved linearly for `y` are graphed as explicit functions even if `y` is on the right or appears with an offset, such as `(x - 1)(x + 1) = y` or `y + 2 = (x - 1)(x + 1)`. Equations nonlinear in `y`, such as `x^2 + y^2 = 4`, use the implicit contour renderer. The optional `y =` prefix is accepted for explicit functions. The expression text is kept as entered; compiled parser trees and graph-sample caches are internal and are never shown as a rewritten or simplified expression. Supported syntax:

- Numbers, parentheses, `x`, `pi`, and `e`
- `+`, `-`, `*`, `/`, and `^`; implicit multiplication is supported (for example, `2x`, `35.6x`, or `2(x + 1)`)
- Slider variables can include a subscript suffix, such as `a_1`, `x_mean`, or `b_12c`; enter the underscore directly in the expression or ticker action.
- `sqrt`, `abs`, `floor`, `ceil`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `ln`, `log` (base 10), and `exp`
- Trigonometric functions use radians

Click an expression's color circle to open its appearance settings. Set the base color, line size (1–10 px), and opacity (0–100%) there. The panel also supports hue, saturation, and value formulas based on `x`, `y`, and sliders. Entering spatial formulas makes the expression circle show a rainbow indicator, while the formulas determine the graph color. Hue uses degrees and is clamped to 0–360 for color conversion: values above 360 remain above 360 in the formula result but render as the endpoint color instead of restarting the rainbow. Saturation and value use normalized decimals (0–1). Opacity applies to curves, implicit contours, inequality boundaries and fill, and list points.

Implicit equations use one equals sign and may contain both `x` and `y`. Invalid syntax is reported beside its expression. Domain errors at individual sample points leave gaps in the graph, as expected for functions with restricted domains or discontinuities.

Single-letter parameters such as `a` or subscripted parameters such as `a_1` automatically get sliders (default range -10 to 10) and an editable numeric value; each parameter value is shared by every expression that uses it. Draggable point coordinates can use any supported math operations on sliders, for example `(floor(a_1) + 2b_mean, ceil(c^2))`, and either coordinate can be fixed, as in `(1, b)` or `(a, 2)`. At least one coordinate must depend on a slider. Dragging adds the graph-space movement to each slider used by that coordinate; with transformed or multi-slider formulas, the displayed point may move by a different amount than the drag. Each slider has **Play/Pause**, configurable minimum/maximum bounds, and a speed in parameter units per second. Multiple sliders can play simultaneously; each moves independently back and forth between its bounds while the graph updates using the current accuracy/performance settings. Playback is not recorded or exported as video. Desmos mode can make playback smoother on slower computers, while precise mode and smaller sampling spacing can make individual frames more detailed at the cost of slower updates. Stop playback when you want to inspect a high-detail static frame. `parametric(x(t), y(t), start, end)` is written as `parametric(t, t^2, -3, 3)`. Polar graphs use `polar(radius, startAngle, endAngle)`, for example `polar(2, 0, 2pi)`; angles are radians. These curves are sampled numerically and can miss narrow features. Inequality shading uses a finite screen grid, so its boundary and fill are approximate.

Add a **Ticker** from the workspace menu to run a parsed slider assignment such as `a = a + 1` at a chosen interval in milliseconds (10–60,000). Choose to repeat until paused or run a fixed number of ticks (1–1,000,000). Tickers can be renamed and collapsed to save workspace space. Ticker actions use the math parser, not JavaScript, and ticker settings are saved with the project. Tick progress and running state are temporary; pausing or completing a ticker saves the resulting slider values.

`derivative(expression)` plots a five-point finite-difference derivative. `integral(expression, start, end)` plots a composite-Simpson numerical integral; bounds may include `x`, as in `integral(x^2, 0, x)`. Both are approximations using JavaScript floating-point samples, not symbolic calculus, and may be inaccurate near discontinuities or rapidly changing functions.

`list(v1, v2, ...)` plots the values as points at x-coordinates 1, 2, and so on. The numeric functions `sum`, `product`, `min`, `max`, `mean`, `median`, `variance`, `stdev`, and `factorial` can be used as expression rows with comma-separated arguments. Their results use standard JavaScript number arithmetic; `variance` and `stdev` are population statistics, and factorial is limited to integers 0–170.

Expressions can be hidden. Add standalone text blocks from the workspace Add menu for notes and explanations; text blocks, expressions, and tables can all be grouped in editable folders. Tables show count, mean x/y, median y, population standard deviation, and y range. Available regression models include linear, polynomial, logarithmic, exponential, power, sine, and tangent. Exponential and power fits use log-transformed least squares and require positive y-values; power fits also require positive x-values. All graph types and regressions are limited numerical implementations, not full Desmos syntax or symbolic algebra.

## Tables and regressions

Expressions, tables, text blocks, and tickers appear together in one ordered workspace list beneath the app name and project controls. Use the **+** menu to add an expression, table, text block, ticker, or folder. Tables and tickers can be renamed and individually collapsed; folders can also be collapsed with the arrow beside their name. Drag items into folders to group them, and drag items to reorder them; focus an item's reorder handle and use the up/down arrow keys for keyboard reordering. Folder membership, collapsed state, names, text, ticker settings, and mixed item order are saved with the project and included in exports and share links. Older projects without an explicit order open with expressions before tables, preserving existing expression folders; legacy expression notes are imported as text blocks.

In each table, add or remove rows and complete rows with finite numbers to plot their points. Empty rows are ignored; a partly filled row is reported as an error. Tables can be removed independently.

Click near a plotted explicit or parametric curve to add the snapped point to a table for that expression. The first click creates the table, and later clicks on the same curve append rows to it. Click-and-drag continues to pan the graph. Implicit contours and shaded inequalities are not sampled into tables because a single x-value can correspond to multiple y-values.

Each table can fit a **Linear**, **Quadratic**, or **Polynomial** regression (degrees 3–5), plus **Logarithmic** (`a + b ln(x)`), **Exponential** (`a exp(bx)`), **Power** (`a x^b`), **Sine** (`a sin(bx + c) + d`), and **Tangent** (`a tan(bx + c) + d`) models. Trigonometric regression uses radians and searches for a best-fit frequency; tangent fits use a bounded, multi-start numerical least-squares search and can fail or settle on a local fit, especially around asymptotes. Logarithmic regression requires positive x-values; exponential fits require positive y-values; power fits require positive x- and y-values. The fit is drawn as a dashed curve, and its approximate equation and R² value are shown below the table. Use **Copy to expressions** to add the fitted equation to the expression list as a normal editable graph. Polynomial fitting uses a centered, scaled least-squares QR calculation to reduce numerical conditioning problems. A degree `n` polynomial fit needs at least `n + 1` valid data points and enough distinct x-values; logarithmic/exponential/power fits need at least two and trigonometric fits need at least four data points. All regressions are approximate numerical fits, not exact identities; unusually clustered or ill-conditioned data can still lose accuracy.

## Hover points

Move the cursor over an explicit curve to reveal detected x/y-axis intercepts, local vertices, and intersections with other explicit curves. Implicit curves show their detected x/y-axis intercepts, but do not get intersection markers with other graphs; while hovered, they show a nearby coordinate. Point labels show the point type and approximate coordinates. Table data points remain visible as plotted points.

At most 10 axis intercepts per curve are retained, prioritizing those nearest the center of the current view. These detections use sampled graph data, so they are approximations, not a symbolic guarantee. Narrow features, tangent roots, or points between samples may be missed. Implicit curves are not assigned intersections with other graphs because the number of crossings can be infinite.

## Numeric approach and limitations

Finite decimal literals and arithmetic made only from rational values are represented as reduced `BigInt` fractions. This preserves exact rational values internally, including fractions such as `1 / 3`; conversion to decimal occurs when a value needs to be plotted. Exact square roots and integer powers are retained as rationals when practical.

Operations involving `pi`, `e`, variables, or transcendental functions use `decimal.js` at the configured precision (50 significant digits by default) with round-half-even rounding. These are high-precision approximations, not symbolic or mathematically exact results. The graph is itself an approximation: explicit curves are sampled about once per horizontal screen pixel by default, with adaptive subdivision around steep or sharply curved regions so branches can reach the viewport edge near asymptotes. Explicit samples are reused across redraws when the expression and slider values have not changed. The graph canvas is rendered at three times the visible viewport width and height, leaving one viewport of pre-rendered graph area beyond each edge. During graph dragging, the rendered canvas is translated as a quick preview; nearby panning reveals that buffered area immediately, while longer drags can expose empty edges until the graph is recalculated after release. The graph stays static while idle and redraws only in response to changes. Implicit contours use a zoom-dependent grid from one screen pixel up to the configured spacing (six pixels by default), then join samples with linear interpolation. Narrow features can be missed, and discontinuities or ambiguous contour intersections are detected heuristically. The graph coordinates originate from JavaScript canvas coordinates and are therefore approximate too.

Expressions are parsed once and reused until edited. Use a pair of slider variables in a point expression, such as `(a, b)`, to plot a point. Open its appearance settings and toggle **Allow dragging point** to enable or disable moving it on the graph; when enabled, dragging changes both slider values, respecting their minimum and maximum. Open the gear-shaped **Settings** control over the graph to show or hide the grid, x- and y-axes, and axis numbers, or change the ratio of the axes' screen scales. Equal units (1:1) is the default; changing the ratio changes how graph shapes are displayed. These graph display preferences are saved with projects. The same menu contains the accuracy and performance controls. The vertical icon stack provides Settings, zoom out, zoom in, and reset view (home) in that order. Drag elsewhere on the graph to pan.

## Accuracy and performance controls

Open **Settings** to choose a color scheme. Dark is the default, with Light, Ocean, Forest, Sunset, Rose, Lavender, and High contrast also included. Create and save custom schemes by choosing colors for the graph background, workspace surfaces, text, accent, and borders. The selected scheme and custom schemes are saved in this browser, separately from project files.

Open **Settings** and expand **Accuracy & performance** to adjust:

- **Desmos mode**: enabled by default. It switches to fast graph settings and rounds native JavaScript `Number`/`Math` calculations to 10 significant digits. Explicit curves are sampled at 1 px to keep sharp curves such as reciprocals legible, and implicit contours use 12 px maximum spacing. It restores your previous settings when turned off. This is a fast approximate mode, not the official Desmos engine. Results are approximate and may differ from precise mode; the math precision slider is disabled while this mode is on.
- All three sliders are oriented consistently: **left = better performance**, **right = worse performance**.
- **Math precision**: 20–100 significant digits for approximate Decimal calculations (default 50 in precise mode). Moving right increases numeric precision and may increase calculation cost.
- **Explicit curve spacing**: 4–0.5 screen pixels between samples from left to right (default 1 in precise mode). Moving right samples the curve more densely, which may show more detail but can take longer.
- **Implicit contour spacing**: 12–1 screen pixels for the contour grid's maximum spacing from left to right (default 6 in precise mode). Moving right may capture more contour detail at a higher cost. The grid remains zoom-adaptive and uses at least one pixel between samples.

These are different tradeoffs: Desmos mode uses 10-digit standard floating-point arithmetic and wider sampling; increasing Decimal precision does not add more graph samples, and a denser graph does not increase Decimal precision. Rendered curves remain numerical approximations. Desmos mode does not reproduce Desmos-specific rendering effects such as Bernard. The current graph of `tan(35.6x)=0` shows the sampled zero contours.

### Measuring graph performance during development

When running `npm run dev`, use the browser developer console:

```js
window.betterDesmosProfiler.benchmark(30)
window.betterDesmosProfiler.snapshot()
```

The benchmark compares repeated redraws of the current graph with the explicit-expression evaluation cache bypassed and enabled. It warms up each mode, then reports median and 95th-percentile draw time, expression evaluations, cache hits, and cache bypasses. Use the same browser, viewport, graph, and settings when comparing changes. The benchmark runs synchronously and may briefly pause the page; the profiler is development-only and is not included in production builds. `snapshot()` reports recent draw activity; if its draw count does not increase while the app is idle, the graph is not redrawing in the background.

This is a numerical graphing prototype, not a proof system or a guarantee of correctly rendered features at every scale. Expressions are parsed by the app's own bounded parser and are never executed as JavaScript.

## Saving and sharing

Click **Save** to open a confirmation dialog. Choose whether to enable **Auto-save** for future changes, then confirm to save the project in browser local storage on this device. The auto-save preference is remembered on this device and can be changed the next time you save. **Undo** and **Redo** step through up to 20 recent project changes in either direction during the current app session; a short pause groups rapid edits (such as typing) into one step. **Export** downloads a JSON project file; **Import** validates and loads a project JSON file. **Share** copies a URL containing the project data, so anyone with that link can open the same expressions, tables, text blocks, sliders, folders, and graph view. Share links are self-contained and have a 50,000-character limit; use JSON export/import for larger projects. There is no cloud account or server-side project storage.
