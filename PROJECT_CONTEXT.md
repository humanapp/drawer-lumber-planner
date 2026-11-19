# Drawer Lumber Planner — Project context

This is a compact, browser-based lumber estimator developed alongside a custom kitchen cabinetry project. Preserve both the user's drawer data and the existing feature set across revisions.

## Calculator requirements
- Group drawer configurations by drawer-box height. Each group contains multiple rows with quantity, **outside** drawer-box width, and front-to-back depth.
- Compact UI: one set of column headers per height group, no duplicated row labels.
- Default nominal purchased stock: 4/4 maple (1 inch), final machined thickness: approximately 1/2 inch. The theoretical board-foot figure uses purchased nominal thickness, not final thickness.
- Estimate theoretical material for four drawer sides per drawer. Applied decorative fronts and bottoms are excluded.
- Estimate purchased board feet using purchased board width, thickness, saw kerf, edge trimming, width allowance, length allowance for planer snipe, and per-BF price.
- User prefers to manage their **33% spare stock margin separately**; optional margin field defaults to zero.
- Yield estimate is approximate; a future revision may pack actual parts into specific lengths of stock more intelligently.
- Save all user inputs in localStorage using `drawer-lumber-planner-v1` for compatibility with existing versions. Do not rename or reset without migration.
- Retain JSON project export/import and CSV export/import. Validate imports. Preserve schema compatibility with previous project files.
- Iterative changes should update `index.html` in this GitHub repo and not require the user to download new HTML files.

## Woodworking design context
- Approximately 24 drawer boxes for inset kitchen cabinetry, with applied, adjustable decorative fronts.
- Drawer boxes will be approximately 1/2-inch solid maple, through-dovetailed using a Leigh D4R Pro. Asymmetric decorative Fibonacci-inspired tail proportions: 1:2:3 for small/medium drawer sides and 1:2:3:5 for taller bottom drawers, smallest at bottom.
- Drawers range from roughly 5-inch tall top drawers to approximately 11-inch tall deep drawers. Exact quantities/dimensions belong to the user's calculator project data, not assumed examples.
- Sources maple at Crosscut Hardwood, Seattle. Considering 4/4 S2S and approximately 7–9-inch wide boards, edge-gluing when needed.
- Rough crosscuts include extra length to remove leading/trailing planer snipe (the machine showed approximately 3 inches at each end). Purchased boards may be 8–10 feet long.
- Milling: stage rough-mill (around 5/8-inch or as thick as possible while flat), let rest 48–72 hours, then dimension to around 0.510–0.515 and drum-sand to final 0.500 inches, typically 150 grit.
- Machines: JET JPJ-12B jointer/planer and JWDS-1632 drum sander. The latter has a known snipe tendency and needs alignment checks. User has limited shop floor space and wheels machines in and out as needed.
- Basement and kitchen currently have similar relative humidity (~51–52%), so maple can acclimate in basement.
- Finish plan: Rubio Monocoat Oil Plus 2C for maple drawer boxes/pull-outs. Separately considering Waterlox Original for future Boos maple butcher-block countertops, applied outdoors in spring/summer.
- Painted inset decorative faces and face frames: unfinished reveal target approximately 3/32 inch; finish will slightly reduce it.
- Other cabinetry includes custom spice-rack and trash pull-outs, roughly 12-inch width and 10-inch depth, with Salice slides. Not included in drawer material totals unless later requested.
- Future finishing: waterborne cabinet paint sprayed in temporary ZipWall-isolated basement section with window ventilation, investigating HVLP versus Graco Magnum.
- Preserve conversation/project context in this file as decisions evolve. Prefer not to silently rewrite established woodworking assumptions.

## Edge-glued tall parts (v1.6)
When a drawer side's height plus machining width allowance exceeds usable purchased board width, estimate an edge-glued panel assembled from the minimum number of strips. For example, an 11-inch-high side from 8-inch stock uses two strips. This is conservative because offcuts from the narrower component are not credited against other drawer parts. The total extra length per individual cut part is applied once (e.g., 6 inches combined for both ends), not twice.

## Whole-board estimates (v1.7)
The calculator now accepts nominal purchased board length in feet (default 8). It builds a cut list for every drawer front/back and two sides, adds total end-snipe allowance once per physical part, splits oversized drawer heights into edge-glued strips, and uses a deterministic free-rectangle packing heuristic across finite stock lengths and widths. The displayed count is whole purchased boards; purchased BF and cost derive from that count, stock width, thickness, length, and price. The optional safety percentage rounds up to whole boards and remains zero by default. This is a heuristic and should not be represented as an exact optimal cutting plan. JSON project settings merge with defaults, so previous projects without boardLength default to 8 feet. The storage key stays unchanged.

## Drawer previews (v1.8)
The app renders an isometric-style SVG preview card for each drawer record at the bottom of the page. Previews show the open-top structural drawer box, scaled proportionally from outside width, depth and group height, and show the record's label and quantity. They update live on dimension or label edits. No new saved schema fields are required. Future iterations may show dovetail geometry, applied fronts or alternate views if requested.

## Initial rough-cut list (v1.9)
The app now includes a rough-cut list before the isometric previews, for crosscutting oversized blanks *before* the initial acclimation period. It lists rows for each drawer record's front/back and sides with the drawer label, height group, number of physical blanks, rough lengths, rough widths, and whether the part requires edge-gluing multiple strips. Rough length is the entered outside width (front/back) or depth (sides), plus the total per-piece snipe allowance, once. Rough width is the drawer height plus extra width allowance, divided across strips if the panel won't fit across the selected usable purchased stock width. An independent cut-list CSV export is provided. This is a rough blank schedule, not a definitive joinery cut plan; glue-up edge jointing loss is not separately modeled, and board-level kerf is accounted for by the purchasing estimate rather than the blank sizes. Saved drawer data schema and storage key remain unchanged.

## Initial crosscut list (v2.0)
The former rough-cut list has been simplified to an **initial crosscut list** for full-width purchased boards before acclimation. It aggregates identical oversized crosscut lengths, with quantity and drawer/part provenance; no rough widths or construction columns. Each length is outside drawer width (front/back) or drawer depth (sides), plus the total end-snipe allowance once. For tall panels needing edge-glued strips from narrower purchased boards, each strip requires a crosscut blank, so quantity is multiplied by the number of strips; ripping/jointing/gluing happen later. CSV export follows this simple list. All saved drawer data remains unchanged.

## Calculation caution
The first implementations estimate strip yield per height group and use a simplified average length calculation; they do not optimize crosscuts on finite 8–10 foot purchased boards. Check the per-part extra-length convention carefully before relying on purchasing totals. Consider a unit-tested cut optimizer as a future improvement.
