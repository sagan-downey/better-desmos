# Better Desmos

A browser-based graphing calculator built with TypeScript and Vite. Its small stack keeps the app easy to run and the math engine independently testable. Graph updates are immediate except for explicit slider playback.

## Versioning

The current app version is **3.2**. Keep the package version in `package.json` in sync as `3.2.0`.

Version 3.0 added embedded photos with relative X/Y scaling, domain/range restrictions, and piecewise expressions. Version 3.1 added multi-input functions, list expansion, named points, polygons, persistent labels, selectable-resolution PNG export, and saved sample/population statistics conventions. The workspace toolbar has a wrench dropdown on the left, Undo/Redo arrows in the center, and the add menu on the right. Version 3.2 adds renameable table columns available as expression lists, formula cells and whole-column formulas, faster animated regressions, and stable panning during playback.

Full Desmos parity remains unfinished. Remaining work includes general list/vector conditions and operations, expanded formula-driven tables, custom regressions, probability distributions and statistical visualizations/inference, clickable actions, direct photo manipulation, complex mode, a formatted math editor/keypad, and audio trace.

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

### Restrictions and piecewise functions

Limit a graph with trailing braces, for example `y=x^2 {-2<x<2}` or `x^2+y^2=4 {x>=0}`. Conditions use `<`, `<=`, `>`, `>=`, `=`, or `!=` (also `≤`, `≥`, and `≠`), and can compare parsed expressions containing sliders. Chained comparisons such as `0<x<=a` combine their comparisons with **and**. Multiple brace groups also mean **and**; within a group, use **and**/**or** or comma-separated alternatives (commas mean **or**). Parenthesize grouped conditions. Range restrictions on explicit and sideways graphs use the actual plotted output, so `y=x^2 {y<4}` clips the curve correctly. Restrictions also apply to implicit equations, inequalities, parametric/polar graphs, draggable points, and list points.

Use `{condition: value, condition: value, fallback}` for piecewise expressions, such as `y={x<0: -x, x<=2: x^2, 4}` or `f(x)={x>0: ln(x)}`. The first matching branch wins; only its value is evaluated, so an inactive branch's domain errors do not affect the result. A missing fallback makes the expression undefined wherever no condition matches. Undefined graph points leave gaps, while scalar evaluations report that no condition is satisfied. Piecewise expressions may be nested in arithmetic and function calls, and work in both math modes. Explicit and parametric renderers do not connect separate piecewise branches.

Graph restrictions must follow the complete graph expression. For restricted subexpressions inside arithmetic, wrap them in parentheses, for example `(x{x>0})+1`. Rational-only conditions compare exactly in precise mode; other conditions and boundaries use the selected numerical precision. Rendering is sampled, so very narrow allowed regions or isolated equality points can be missed. Open/closed endpoint markers are not drawn automatically. Restricted tangent curves use the general numerical sampler rather than the unrestricted dense-tangent coverage optimization.

Define functions with 1–8 distinct single-letter or subscripted parameters, for example `f(x) = x^2`, `g(a,b) = a + 2b`, or `f_1(a_1,b) = a_1^2 + b`. Call them with expressions, such as `g(2,x)` to graph it or `g(2,3)` to show a scalar result. Arguments are substituted simultaneously; nested functions, piecewise expressions, and list arguments are supported. Definitions stay in the workspace but do not draw their own graph. Bodies and calls use the same safe math parser; recursive definitions, duplicate parameters, incorrect argument counts, and function parameters shadowed by `for` bindings are rejected.

### Lists and curve families

Use `[1,2,3]` or define a named list with `l=[1,2,3]`. Ranges use `[start...end]` or `[start,next...end]`, such as `[1...10]`, `[0,0.25...1]`, and `[3,2...0]`. A one-start range has step 1; use two starting values to specify a descending or fractional step. Empty lists are supported.

Arithmetic and ordinary function calls broadcast scalars and zip equal-length lists element by element: `2[1,2,3]+[4,5,6]`, `sin(l)`, `y=l*x`, and `([1,2],[3,4])`. Unequal list lengths are errors rather than silently truncated. Numeric list expressions plot at x-coordinates 1, 2, and so on; lists of tuples plot their coordinates. Named lists can contain numbers or points and update with sliders and other definitions.

List indexing is one-based: `l[2]` selects one item; `l[1,3]` and `l[1...3]` select lists. Out-of-range and fractional indices are errors. Simple named-list filters such as `l[l>0]` and `l[l!=0]` are supported for numeric lists. Use `join`, `sort`, `reverse`, `unique`, `length`/`count`, `total`/`sum`, `product`, `min`, `max`, `mean`, `median`, `variance`/`var`, and `stdev` with list arguments. `sum([])` is 0 and `product([])` is 1; statistics requiring observations reject empty lists.

Comprehensions use `a^2 for a=[1...5]` or `(a,b) for a=[1,2],b=[3,4]`. Multiple bindings generate a Cartesian product; their local names do not create sliders. Bindings must use distinct scalar parameter names other than x, y, e, and pi.

Lists are bounded to 2048 elements, 128 expansion nesting levels, and bounded expansion work. The existing safe parser's 512-character limit also applies to each generated expression, so large reductions or deeply expanded function calls may hit that limit before the element limit. Range/index calculations, filters, sorting, uniqueness, and statistical ordering use finite floating-point values. Rational arithmetic is preserved in generated range values and sums/products/means where practical; numerical scalar statistics are marked `≈`. General logical list filters, point/vector arithmetic, coordinate projection of point lists, and every Desmos list operation are not yet supported. Ordering-based functions and numeric list statistics require coordinate-independent numbers; they do not compute a new ordering at every graph sample.

### Points, polygons, and persistent labels

Fixed points such as `(1,2)` are supported. Define a named point with `p=(a,b)`, reference `p.x` and `p.y`, or use `p` as a polygon vertex. Named point definitions plot their point and preserve their coordinates through save/import/export. Points whose coordinates share slider variables are valid, but direct dragging is disabled for shared-variable coordinates to avoid ambiguous updates; edit their sliders instead.

Use `polygon((0,0),(2,0),(0,2))`, `polygon(p,q,r)`, or a list of point vertices such as `polygon([(0,0),(2,0),(0,2)])`. Polygons require 3–2048 finite scalar/slider vertices, close their boundary, and render a translucent fill with the expression's line size, opacity, base color, or spatial HSV formulas. Self-intersecting polygons use even-odd filling. Polygon restrictions and freehand/direct vertex editing are not implemented.

Open expression appearance settings and enter **Label** to show persistent graph text. `${a}` or `${p.x}` inserts live numeric values, rounded to 10 significant digits. Optional **Label X**/**Label Y** formulas position it. Default anchors are the point's coordinates, a curve at parameter 0, a parametric curve's start, a polygon's mean vertex position, or the origin for an implicit graph. Collections use their first member's anchor. If the default anchor is undefined, enter both coordinates explicitly; invalid label formulas are reported without hiding a valid graph. Labels are plain canvas text, not interpreted HTML. They are saved with the expression and included in high-resolution refinement and PNG exports.

Click an expression's color circle to open its appearance settings. Set the base color, line size (1–10 px), and opacity (0–100%) there. The panel also supports hue, saturation, and value formulas based on `x`, `y`, and sliders. Entering spatial formulas makes the expression circle show a rainbow indicator, while the formulas determine the graph color. Hue uses degrees and is clamped to 0–360 for color conversion: values above 360 remain above 360 in the formula result but render as the endpoint color instead of restarting the rainbow. Saturation and value use normalized decimals (0–1). Opacity applies to curves, implicit contours, inequality boundaries and fill, and list points.

Equations use one equals sign and may contain both `x` and `y`. Equations linear in `y` or `x` with a coordinate-independent, nonzero coefficient are plotted as explicit curves in the corresponding direction. Direct affine-phase tangent curves, such as `x = tan(36y)` or `y = tan(a*x+b)`, are drawn branch by branch using the inverse tangent, so no stroke connects across a pole. When branches are at most half a screen pixel apart and their strokes cover every cross-section, the renderer draws their pixel-level coverage instead of enumerating branches. This keeps the curve visible at extreme zoom levels with no branch-count cutoff; opacity still applies once, and spatial HSV is sampled at device-pixel centers. Dense views may look solid; zoom in to distinguish branches. Hover projects onto a nearby branch numerically; at coordinates beyond representable branch-index precision it reports the pixel-level position. Other transformed or nonlinear-phase tangent expressions still use the general numerical sampler. Other equations use the implicit contour renderer, which can miss narrow features or confuse discontinuities with contour crossings. Invalid syntax is reported beside its expression. Domain errors at individual sample points leave gaps in the graph.

Expressions that do not depend on graph coordinates, such as `sin(pi / 2)` or `2^10`, display their numeric result in the workspace instead of drawing a horizontal line. Results that require numerical evaluation or display rounding are marked with `≈`; results depending on sliders update as those sliders change.

Single-letter parameters such as `a` or subscripted parameters such as `a_1` automatically get sliders (default range -10 to 10) and an editable numeric value; each parameter value is shared by every expression that uses it. Define a parameter with an assignment such as `a = 5`, `a = b`, or `a = sin(b)` to replace its slider with a fixed or dependent value; dependent definitions update when their slider inputs change and the current value is shown in the Sliders panel. Definitions cannot depend on graph coordinates (`x`, `y`, or `t`) or contain circular references. Draggable point coordinates can use any supported math operations on sliders, for example `(floor(a_1) + 2b_mean, ceil(c^2))`, and either coordinate can be fixed, as in `(1, b)` or `(a, 2)`. Direct dragging requires at least one slider and independent x/y slider sets. Dragging adds the graph-space movement to each slider used by that coordinate; with transformed or multi-slider formulas, the displayed point may move by a different amount than the drag.

Each slider has **Play/Pause**, configurable minimum/maximum bounds, and a speed in parameter units per second. Multiple sliders can play simultaneously; each moves independently back and forth between its bounds while the graph updates using the current accuracy/performance settings. Playback is not recorded or exported as video. Desmos mode can make playback smoother on slower computers, while precise mode and smaller sampling spacing can make individual frames more detailed at the cost of slower updates. Stop playback when you want to inspect a high-detail static frame. `parametric(x(t), y(t), start, end)` is written as `parametric(t, t^2, -3, 3)`. Polar graphs use `polar(radius, startAngle, endAngle)`, for example `polar(2, 0, 2pi)`; angles are radians. These curves are sampled numerically and can miss narrow features. Inequality shading uses a finite screen grid, so its boundary and fill are approximate.

Add a **Ticker** from the workspace menu to run a parsed slider assignment such as `a = a + 1` at a chosen interval in milliseconds (10–60,000). Choose to repeat until paused or run a fixed number of ticks (1–1,000,000). Tickers can be renamed and collapsed to save workspace space. Ticker actions use the math parser, not JavaScript, and ticker settings are saved with the project. Tick progress and running state are temporary; pausing or completing a ticker saves the resulting slider values.

`derivative(expression)` plots a five-point finite-difference derivative. `integral(expression, start, end)` plots a composite-Simpson numerical integral; bounds may include `x`, as in `integral(x^2, 0, x)`. Both are approximations using JavaScript floating-point samples, not symbolic calculus, and may be inaccurate near discontinuities or rapidly changing functions.

`list(v1, v2, ...)` remains supported and plots values at x-coordinates 1, 2, and so on. The numeric functions `sum`, `product`, `min`, `max`, `mean`, `median`, `variance`/`var`, `stdev`, and `factorial` also support expression rows with comma-separated arguments. These legacy comma-argument statistics use standard floating-point arithmetic; factorial is limited to integers 0–170.

**Settings → Statistics convention** controls the denominator for `variance`/`var`, `stdev`, and table standard deviation. Newly created projects use sample statistics (n−1); projects created before this setting was saved retain population statistics (n), including older imports and share links. The convention is persisted and included in undo/redo. `variancep`/`varp` and `stdevp` always compute population statistics. Sample variance/standard deviation require at least two observations and explicitly report undefined results for a singleton.

Expressions can be hidden. Add standalone text blocks from the workspace Add menu for notes and explanations; text blocks, expressions, and tables can all be grouped in editable folders. Tables show count, mean x/y, median y, standard deviation labeled with the selected convention, and y range. Available regression models include linear, polynomial, logarithmic, exponential, power, sine, and tangent. Exponential and power fits use log-transformed least squares and require positive y-values; power fits also require positive x-values. All graph types and regressions are limited numerical implementations, not full Desmos syntax or symbolic algebra.

## Tables and regressions

Expressions, tables, text blocks, tickers, and photos appear together in one ordered workspace list beneath the app name and project controls. Use the **+** menu to add an expression, table, text block, ticker, photo, or folder. Tables and tickers can be renamed and individually collapsed; folders can also be collapsed with the arrow beside their name. Drag items into folders to group them, and drag items to reorder them; focus an item's reorder handle and use the up/down arrow keys for keyboard reordering. Folder membership, collapsed state, names, text, ticker settings, photos, and mixed item order are saved with the project and included in exports and share links. Older projects without an explicit order open with expressions before tables, preserving existing expression folders; legacy expression notes are imported as text blocks.

In each table, add or remove rows and enter finite numbers or parsed scalar formulas such as `sin(pi/2)`, `a+2`, or `f(3)`. Formula cells retain their entered text and show an approximate numerical result beneath it. Tables can be removed independently.

Each column has an editable **Name** and optional whole-column **Formula**. Default names are `x_1` and `y_1` for the table with ID 1 (IDs stay stable when tables are reordered). Rename them to single-letter or subscripted names such as `u`, `v`, or `y_data`; names must be unique across columns, expression definitions, and user-defined functions. Clearing a name restores its default. Columns are available as numeric lists in expressions: `polygon((u,v))` draws a polygon from paired table coordinates, `u[2]` reads the second active row, and `mean(v)` computes a column statistic.

For a function-driven column, define `f(t)=t^2` in an expression, enter x-values, and put `f(x_1)` in the y-column Formula. The formula calculates one value per active row and its cells become read-only. Bare references to the opposite column of the same table use that row's value; the short aliases `x` and `y` follow column renames. Explicit indexing such as `x_1[2]` still reads the named list. Formulas can use sliders, user-defined functions, scalar definitions, and indexed columns from other tables. Clearing a column formula restores its previous manual cell contents.

Rows with no stored cell text are ignored, even with column formulas enabled; enter a value in either manual column to activate a row. An active row must produce one finite scalar value in both columns. Missing values, domain errors, duplicate names, and circular dependencies are reported instead of plotting incomplete data or fitting a partial regression. Computed column values are numerical approximations; graph list expansion remains limited to 2,048 items even though tables support 5,000 rows. Column names, cell formulas, and whole-column formulas are preserved by save, export/import, share links, and undo/redo.

Unchanged definitions and table results are reused during graph-only redraws such as pan and zoom. Editing cells, formulas, column names, or referenced sliders refreshes the calculations; removing rows and restoring projects rebuilds the table display against the current data.

Panning during slider or ticker playback keeps the preview aligned with the latest rendered camera position, so animation redraws do not reapply the accumulated drag offset. Canceling a pan restores the starting camera and redraws it.

Click near a plotted explicit or parametric curve to add the snapped point to a table for that expression. The first click creates the table, and later clicks on the same curve append rows to it. Click-and-drag continues to pan the graph. Implicit contours and shaded inequalities are not sampled into tables because a single x-value can correspond to multiple y-values.

Each table can fit a **Linear**, **Quadratic**, or **Polynomial** regression (degrees 3–5), plus **Logarithmic** (`a + b ln(x)`), **Exponential** (`a exp(bx)`), **Power** (`a x^b`), **Sine** (`a sin(bx + c) + d`), and **Tangent** (`a tan(bx + c) + d`) models. Trigonometric regression uses radians and searches for a best-fit frequency; tangent fits use a bounded, multi-start numerical least-squares search and can fail or settle on a local fit, especially around asymptotes. Logarithmic regression requires positive x-values; exponential fits require positive y-values; power fits require positive x- and y-values. The fit is drawn as a dashed curve, and its approximate equation and R² value are shown below the table. Use **Copy to expressions** to add the fitted equation to the expression list as a normal editable graph. Polynomial fitting uses a centered, scaled least-squares QR calculation to reduce numerical conditioning problems. A degree `n` polynomial fit needs at least `n + 1` valid data points and enough distinct x-values; logarithmic/exponential/power fits need at least two and trigonometric fits need at least four data points. All regressions are approximate numerical fits, not exact identities; unusually clustered or ill-conditioned data can still lose accuracy.

## Photos

Choose **Add photo** in the workspace menu and select a local PNG, JPEG, WebP, or GIF. Edit **Center X**, **Center Y**, **Rotation**, **X scale**, and **Y scale** using numbers or parsed scalar math expressions, including sliders and user-defined functions. X and Y scale are independent multipliers relative to the photo's initial size: **1** keeps that dimension unchanged, **2** doubles it, and **0.5** halves it. New photos start with both scales at 1, initially 10 graph units wide with their original aspect ratio. The initial dimensions are saved with the photo, so exporting, importing, or reopening does not reset the scale reference. Zero scale hides the image, and negative scales mirror it. Earlier photo projects without saved initial dimensions retain their previous sizes using a one-unit reference. Rotation is counterclockwise around the center, with a per-photo **Radians/Degrees** selector (radians by default). Changing units reinterprets the entered formula; it does not rewrite it. Invalid formulas and domain errors are shown in the photo row.

Photos can be renamed, hidden, removed, and given an opacity. Higher workspace items draw on top of lower items, including photos; the grid, axes, and point-inspection overlay remain above the graph content. Photos follow pan, zoom, axis aspect ratio, and progressive viewport refinement. Source-image detail limits sharpness: refinement cannot invent pixels missing from the original. Animated image formats are displayed as a static decoded frame, not played.

Photo data is embedded in saved/exported projects for offline use; no remote image URLs or SVG files are accepted. Each file is limited to 2 MB and 16 million decoded pixels, with at most 50 photos, 4 MB of embedded image text, and 32 million loaded photo pixels per project. The existing 5 MB project-file limit still applies. Large photo projects usually exceed the share-link length limit; use JSON export/import instead. Browser storage limits may prevent local saving, in which case the calculator reports the error.

## Hover points

Move the cursor over an explicit curve to reveal detected x/y-axis intercepts, local vertices, and intersections with other explicit curves. Implicit curves show their detected x/y-axis intercepts, but do not get intersection markers with other graphs; while hovered, they show a nearby coordinate. Point labels show the point type and approximate coordinates. Table data points remain visible as plotted points.

At most 10 axis intercepts per curve are retained, prioritizing those nearest the center of the current view. These detections use sampled graph data, so they are approximations, not a symbolic guarantee. Narrow features, tangent roots, or points between samples may be missed. Implicit curves are not assigned intersections with other graphs because the number of crossings can be infinite.

## Numeric approach and limitations

The grid, axes, and axis numbers use a separate viewport-sized overlay. They redraw immediately during zoom and pan previews, keeping text and grid lines at their normal size while the curve snapshot is scaled or translated. Curve sampling refreshes after the interaction settles.

Finite decimal literals and arithmetic made only from rational values are represented as reduced `BigInt` fractions. This preserves exact rational values internally, including fractions such as `1 / 3`; conversion to decimal occurs when a value needs to be plotted. Exact square roots and integer powers are retained as rationals when practical.

Operations involving `pi`, `e`, variables, or transcendental functions use `decimal.js` at the configured precision (50 significant digits by default) with round-half-even rounding. These are high-precision approximations, not symbolic or mathematically exact results. The graph is itself an approximation: explicit curves are sampled about once per horizontal screen pixel by default, with adaptive subdivision around steep or sharply curved regions so branches can reach the viewport edge near asymptotes. Explicit samples are reused across redraws when the expression and slider values have not changed. The graph canvas is rendered at three times the visible viewport width and height, leaving one viewport of pre-rendered graph area beyond each edge. During panning and zooming, the rendered canvas is translated or scaled as a quick preview; the graph is recalculated after the interaction settles. Nearby panning and zooming can reuse the buffered area immediately, while larger changes may temporarily expose empty edges until the graph is recalculated. The graph stays static while idle and redraws only in response to changes. Implicit contours use a zoom-dependent grid from one screen pixel up to the configured spacing (six pixels by default), then join samples with linear interpolation. Narrow features can be missed, and discontinuities or ambiguous contour intersections are detected heuristically. The graph coordinates originate from JavaScript canvas coordinates and are therefore approximate too.

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

Adaptive explicit-curve sampling stops subdividing intervals whose endpoints and midpoint are all beyond the same offscreen margin and whose midpoint curvature is within the current pixel tolerance. Large offscreen slopes alone do not trigger further subdivision. This also applies to animated table regressions when zoomed out; visible crossings, domain gaps, piecewise boundaries, and sharply curved intervals retain adaptive refinement.

Precise-mode sample caches are bounded and evict their least recently used entries without scanning the cache. Fast-mode sampling bypasses this cache because maintaining it can cost more than native math when zooming dense curves. Explicit and sideways expression curves reuse their sampled geometry and drawing paths while the viewport, sampling settings, precision, expanded function source, and referenced parameter values are unchanged. Changing an unrelated slider does not invalidate ordinary scalar curves; appearance and spatial HSV colors are still applied on every redraw. Collection expansion conservatively includes slider values in its cache key so ranges, filters, sorting, and reductions stay live. Multi-curve families bypass the shared per-expression sample/geometry cache to prevent one member from reusing another member's values. Other graph types continue to use their existing renderers. Function/slider analysis and constant math are also cached; precision changes invalidate approximate constant results, and parameter values remain live.

Hover uses a conservative segment index. Arbitrary points can be inspected on explicit, sideways, implicit, parametric, polar, and regression curves; coordinates come from the nearest sampled line segment and are numerical approximations. Nearby special points, such as intercepts and vertices, still snap to their detected coordinates. When multiple curves are within 10 screen pixels of the crosshair, the curve higher in the workspace list takes priority, including folder order and table regressions; its closest segment supplies the point. Reordering the workspace updates that priority. Adding a graph point to a table uses the same priority among eligible expression curves. The index is built on demand for pointer interactions, not during graph redraws; until then, the hover overlay scans the segments using the same selection rule. These optimizations do not reduce precision or sampling density.

Graph items are drawn from the bottom of the workspace list upward, so higher rows appear on top of lower rows. This applies across expressions and tables, including folder order, regression lines, shaded regions, and plotted points. Reordering rows changes both graph layering and hover priority.

Graph rendering still runs synchronously on the main thread. Zoom previews remain responsive between draws, but an already-running draw cannot yet be interrupted.

After a normal-resolution draw, the visible viewport progressively refines at 1.5x, 2x, 3x, and 4x its display pixel ratio, with a 700 ms idle gap before each pass. Only the viewport is refined; the surrounding pan/zoom-out buffer stays at normal resolution. Each pass uses denser sampling and finer curve tolerances, then replaces the visible detail canvas only when complete. Zoom-in previews transform the latest sharp canvas; zoom-out previews use the normal buffered graph. Pending refinement is canceled by pan, zoom, edits, resize, slider playback, and tickers, and resumes after the view settles. Grid labels and hover remain display-sized overlays.

Refinement is limited to 16 million pixels per visible canvas and stops escalating when a pass takes 120 ms or longer. This avoids unbounded resolution growth, but a synchronous refinement pass can still briefly block input once started. Higher-resolution pixels improve scroll-zoom previews; ordinary screenshots remain limited to the screen's pixel resolution.

### PNG export

Click the **wrench (Project tools)** dropdown and choose **PNG**, choose 1x, 2x, 3x, or 4x the visible graph's CSS dimensions, then choose **Download PNG**. The export renders a fresh, more densely sampled viewport with graph content, photos, persistent labels, grid, and axis numbers, rather than enlarging a screenshot or including the offscreen pan buffer. Hover/crosshair overlays and the sidebar are omitted. Exports are limited to 16 million pixels and 16384 pixels per side; oversized requests are rejected with instructions to choose a lower resolution. Encoding and photo-loading failures are reported explicitly. High-resolution exports render synchronously and may take longer for complex graphs; the export does not change the viewport, playback settings, or project contents.

When running `npm run dev`, use the browser developer console:

```js
window.betterDesmosProfiler.benchmark(30)
window.betterDesmosProfiler.snapshot()
```

The benchmark compares repeated redraws of the current graph with expression sample and geometry caches bypassed and enabled. It warms up each mode, then reports median and 95th-percentile draw time, expression evaluations, cache hits, and cache bypasses. Fast-mode samples always bypass the sample cache; geometry reuse still applies. Use the same browser, viewport, graph, and settings when comparing changes. Also measure actual pan/zoom redraws: an unchanged-view benchmark does not measure resampling or eviction costs. The benchmark runs synchronously and may briefly pause the page; the profiler is development-only and is not included in production builds. `snapshot()` reports recent draw activity; if its draw count does not increase while the app is idle, the graph is not redrawing in the background.

This is a numerical graphing prototype, not a proof system or a guarantee of correctly rendered features at every scale. Expressions are parsed by the app's own bounded parser and are never executed as JavaScript.

## Saving and sharing

The workspace toolbar places the **wrench (Project tools)** on the left, the **Undo**/**Redo** arrows in the center, and **+** on the right. The wrench dropdown contains **Save**, **Export**, **PNG**, **Import**, and **Share**. The arrow buttons retain accessible labels and disabled states when no history is available. The dropdown supports keyboard activation and Tab navigation; Escape, clicking outside, or choosing an action closes it.

Choose **Save** from Project tools to open a confirmation dialog. Choose whether to enable **Auto-save** for future changes, then confirm to save the project in browser local storage on this device. The auto-save preference is remembered on this device and can be changed the next time you save. **Undo** and **Redo** step through up to 20 recent project changes in either direction during the current app session; a short pause groups rapid edits (such as typing) into one step. **Export** downloads a JSON project file; **Import** validates and loads a project JSON file. **Share** copies a URL containing the project data, so anyone with that link can open the same expressions, tables, text blocks, sliders, folders, and graph view. Share links are self-contained and have a 50,000-character limit; use JSON export/import for larger projects. There is no cloud account or server-side project storage.
