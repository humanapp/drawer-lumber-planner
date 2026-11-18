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

## Calculation caution
The first implementations estimate strip yield per height group and use a simplified average length calculation; they do not optimize crosscuts on finite 8–10 foot purchased boards. Check the per-part extra-length convention carefully before relying on purchasing totals. Consider a unit-tested cut optimizer as a future improvement.
