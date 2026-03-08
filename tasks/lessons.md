# Lessons Learned — SLR Pursuits

_(Append new lessons below. Do not rewrite or delete existing entries.)_

## Regrid API v2
- **Response structure**: `{ parcels: { features }, zoning: { features }, buildings: { features } }` — nested, not flat GeoJSON.
- **Multiple records at a point**: Real property + BPP can coexist. Filter by `geometry`, positive `landval`, penalize `usedesc` containing "BPP".
- **Zoning layer is separate**: `data.zoning.features` has development standards (height, FAR, setbacks, permitted uses). Always merge into parcel data.
- **`zoning_id` is internal**: Display `zoning` field (e.g., "PD-193"), not `zoning_id` (numeric ID).
- **Sentinel values**: `-5555`, `-9999`, `-1111` mean "no data" for numeric fields. Filter before display.
- **Field naming**: State = `state2`, ZIP = `szip`/`szip5`. Always verify against actual API response.
- **Address lookup > point lookup**: `/api/v2/parcels/address?query=...&return_field_labels=true` is more accurate.
- **Nearby search**: `GET /api/v2/parcels/point?lat=X&lon=Y&radius=200&limit=50`. Exclude primary parcel by `regridId`. Not all results have geometry.

## Regrid MVT Tile Server
- **Endpoint**: `tiles.regrid.com/api/v1/parcels/{z}/{x}/{y}.mvt?token=KEY&fields=...` — zoom 10–21.
- **Proxy API key**: Use Next.js API route; add `Cache-Control: max-age=3600, stale-while-revalidate=86400`.
- **`promoteId` required**: Without `promoteId: { parcels: 'parcelnumb' }`, `setFeatureState` highlights multiple parcels (non-unique internal tile IDs). Always promote a unique field.
- **Source layer**: Named `parcels` — must match in `source-layer` and `promoteId`.
- **Hover fields**: Include `parcelnumb`, `address`, `owner`, `usedesc`, `zoning`, `ll_gisacre`, `ll_gissqft`, `parval`, `yearbuilt` for zero-cost tooltips. Full detail via API on click only.
- **404 tiles**: Ocean/sparse areas return 404. Return 204 from proxy.

## HUD Fair Market Rents
- **Entity ID**: Metro areas use `METRO{cbsa}M{cbsa}` (e.g., `METRO19100M19100`), not raw FIPS.
- **ZIP→metro mapping**: Iterate state metros and search each for ZIP. Cache result server-side (30+ calls for TX).
- **SAFMR**: When `smallarea_status: "1"`, response has per-ZIP rents in `basicdata` array.

## Mapbox Patterns
- **Async import guard**: `import('mapbox-gl')` in `useEffect` can resolve after unmount. Always check `if (!mapContainerRef.current) return;` before `new Map()`.
- **Avoid map recreation on state change**: Store map in `useRef`, update GeoJSON via `source.setData()` in separate `useEffect`.
- **Selection via feature properties**: Encode selection as `selected: 0 | 1` property, use data-driven styling `['case', ['==', ['get', 'selected'], 1], ...]`.
- **Ref for event callbacks**: Map handlers registered once on load. Use `useRef` for callbacks/data so handlers access current state.

## Supabase
- **JSONB caching**: Verify columns exist first. Use `useRef` (`latestCacheRef`) to merge concurrent saves. Use `useRef` guard to prevent duplicate fetches.
- **Per-radius caching**: Cache radius-dependent data (drive times, heatmaps) in nested JSONB by radius key.
- **Auth**: Next.js 16 uses `proxy.ts` (not `middleware.ts`). `SUPABASE_SERVICE_ROLE_KEY` is server-only. Disable public sign-ups for internal apps.
- **Trigger timing**: `handle_new_user` trigger must exist before user creation. Manually insert profiles for pre-existing users. Run full migration in one pass.
- **RLS gotchas**: `.single()` returns `{}` on 0 rows (not an RLS error). Insert policies checking `auth.uid() = created_by` require explicit `created_by` value.
- **moddatetime**: Requires `CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;` then `extensions.moddatetime(updated_at)`.
- **RLS strategy**: Broad `authenticated` on data tables; restrict config tables to admin/owner via `get_user_role()`.

## React Patterns
- **Optimistic mutations**: Upsert must handle both insert and update in `onMutate`. Delete needs optimistic removal too. Use `onSettled` over `onSuccess` for cache invalidation.
- **Controlled input jumpiness**: When `onChange` → mutation → cache invalidation → re-render, inputs lose focus. Solution: local-state wrapper component, fire mutation on `onBlur`/Enter. Sync props→local only when not editing.
- **CSS specificity**: Global `.inline-input` styles override Tailwind. Use inline `style` for guaranteed overrides. Thread all props through extracted helper components.

## CSS Grid Layout
- **`gridAutoFlow: 'dense'`**: Essential for mixed `col-span` layouts. Remove intermediate wrapper `<div>`s so cards are direct grid children.
- **Prevent card stretching**: Use `lg:self-start` (`align-self: start`). Stack related cards by wrapping in a shared `col-span-2` parent.

## AI (Gemini)
- **Model name**: Use exact identifier (e.g., `gemini-2.5-flash-preview`). Set `maxOutputTokens: 4000+`.
- **Context**: Structured text with section headers (`=== PARCEL DATA ===`). Pass 1mi ESRI ring as primary, 3/5mi for comparison.

## Census Bureau APIs
- **Free alternative to ESRI**: FCC for FIPS, TIGERweb for geometries, ACS for data. TIGERweb layer indices change — implement retry across service/layer combos.
- **ACS batch limit**: Batch block group FIPS in groups of ~50 (URL length limit).

## Pre-Dev Budgets
- **JSONB monthly values**: Store `{ "YYYY-MM": { projected, actual } }` per line item. Flexible schema, easy to extend, queryable.
- **Standard line item labels**: Keep template row names immutable so portfolio-level reports can filter/aggregate by category (e.g., Earnest Money across all pursuits).
- **Separate report view for time-series data**: Budget data is a monthly grid, not tabular — use a dedicated report component instead of forcing it through the generic `ReportTable`/`useReportEngine`.
- **Line item filter in reports**: Pass a `Set<string>` through helper functions rather than filtering rows. This preserves per-pursuit rows while narrowing which line items contribute to totals.

## Reports Architecture
- **Data source toggle > mixed rows**: Use toggle for entities with different field sets. Store `dataSource` in `ReportConfig` for template portability.
- **Adapter pattern**: Map secondary entity into primary `ReportRow` shape. Use source-filtered field helpers.

## Miscellaneous
- **Walk Score**: Free widget requires domain registration + may force paid plan. Use direct link: `walkscore.com/score/{encoded_address}`.
- **react-pdf tables**: Percentage-based widths in `flexDirection: 'row'` views. Conditional colors via ternary in `style` objects.

## Key Dates
- **Standard vs flexible dates**: Only 3 dates are truly "standard" (Contract Execution, Inspection Period, Closing Date). Everything else varies per deal — use a lookup table for common types but always allow custom dates.
- **Flattened report view**: For key dates, one row per pursuit with columns for key date types + next upcoming + counts is more useful than one row per date (which creates too many rows).
- **AI extraction from PDFs**: Gemini can process PDFs as inline base64. Use a review modal so users accept/reject/edit before saving — never auto-import AI-extracted data.
- **getKeyDateValue accessor**: When report fields use a different data shape than `ReportRow`, add a parallel accessor (`getKeyDateValue`) on the field definition rather than forcing data into the standard shape.
- **Dedicated report component**: Like pre-dev budgets, key dates data has a different shape from standard report rows. Use a standalone component (`KeyDateReport`) instead of forcing through `useReportEngine`/`ReportTable`.

## AI (Gemini) — Contract Processing
- **Inline PDF data**: Use `inlineData: { mimeType: 'application/pdf', data: base64 }` in the content parts. No need for Files API for single-file extraction.
- **Structured extraction prompt**: Ask for JSON array with specific fields (`label`, `matched_type`, `date_value`, `contract_reference`, `confidence`). Set `temperature: 0.1` for deterministic extraction.
- **Confidence-based defaults**: Auto-select dates with confidence ≥ 0.5 in the review modal; lower confidence dates shown but unchecked.
- **Graceful JSON parsing**: AI sometimes wraps JSON in markdown code fences. Strip `` ```json `` and `` ``` `` before parsing; fall back to regex match for `[...]`.

## Tiptap v3
- **StarterKit includes underline**: In Tiptap v3, `StarterKit` bundles `underline` by default. Importing `@tiptap/extension-underline` separately causes a "Duplicate extension names" warning. Fix: disable it in StarterKit (`underline: false`) when importing explicitly.

## Mobile Responsiveness Patterns
- **Modal dialog margins**: Always add `mx-4` to modal inner cards so they don't touch screen edges on mobile. The Comps page had this right; Dashboard and Pursuit Detail did not.
- **Tab bar overflow**: When a tab bar has 5+ tabs, add `overflow-x-auto` on the container and `whitespace-nowrap` on each tab button so they scroll horizontally on narrow screens instead of wrapping.
- **Consistent responsive padding**: Use `px-4 md:px-6 py-6 md:py-8` on all page containers. Easy to miss when copying from an older page that only had fixed padding.

## Navigation
- **`window.location.href` vs `router.push`**: Use `router.push` for in-app navigation (client-side, no full reload). Use `window.location.href` only when a full reload is intentional (e.g., after login to re-trigger auth middleware) or inside imperative DOM listeners (e.g., Mapbox marker clicks) where the React router isn't accessible.

## Due Diligence Checklist
- **Template-driven architecture**: Use a template → instance pattern for repeatable workflows. Templates define phases/tasks/items; `apply_template_to_pursuit` DB function deep-clones them into pursuit-specific rows. This keeps templates immutable while letting pursuits customize.
- **Milestone-relative due dates**: Template tasks store `relative_milestone` + `relative_due_days`. A DB function (`recalculate_due_dates`) computes actual dates from milestone target dates. Only tasks without `due_date_is_manual = true` get recalculated.
- **Activity logging via DB trigger**: Use a `BEFORE UPDATE` trigger on task rows to automatically log status changes, assignee changes, etc. to an activity table. This captures all changes regardless of which client made them.
- **Accordion + slide-out panel UX**: For hierarchical data (phases → tasks → details), an accordion list with a slide-out detail panel is more scannable than nested modals. Keep the task list visible while editing a specific task.
- **Implicit `any` in Supabase `.map()`**: Supabase's generated types don't always flow through `.map()` callbacks in strict TS mode. Add explicit `(param: any)` annotations on `.map()` callbacks when chaining off Supabase query results to prevent build failures.
- **Seed data splitting**: For large seed datasets (100+ rows), split across multiple migration files (e.g., `005b`, `005c`) to keep files manageable and allow partial re-runs during development.

## Controlled Input Jumpiness (Expanded)
- **Root cause**: Any `<input type="text">` whose `onChange` fires a Supabase upload (via TanStack Query `.mutate()`) on every keystroke causes React re-renders that reset focus/cursor position.
- **Fix**: Always use the shared `DebouncedTextInput` component from `src/components/shared/DebouncedTextInput.tsx`. It holds local state and only fires `onCommit` on blur or Enter key.
- **Files fixed**: pursuit detail (Region), admin/stages (stage name), admin/key-date-types (type name x2), admin/templates (payroll role name), OnePagerEditor (soft cost line_item_name).
- **Rule**: Never wire a text `<input>` `onChange` directly to `.mutate()`. Always use `DebouncedTextInput` or an equivalent local-state → commit-on-blur pattern.

## Report Field Aggregation
- **Default aggregation is wrong for many fields**: Defaulting all number/currency fields to SUM causes nonsensical totals (e.g., Year Built summed across rows). Add an `aggregation?: 'sum' | 'avg' | 'none'` property to `ReportFieldDef` so each field can override the default.
- **Rents should average, not sum**: Asking Rent, Effective Rent, Rent/SF are per-property metrics — averaging makes sense for group subtotals, summing does not.
- **Year fields**: Year Built should either average or show nothing in subtotal/total rows. Use `aggregation: 'avg'` and round to nearest integer.
- **Percent fields**: Leased % and similar should always average, never sum. The engine already defaults percent to avg, but verify per field.

## Contextual Report Filters
- **Generic operators don't fit text fields**: Operators like `>`, `<`, `=` are meaningless for Stage, Region, Product Type. Use field-type detection to render the right UI.
- **Pick-list filter pattern**: For text fields, extract distinct values from the actual data, render as a checkbox list, and use an `'in'` operator with a `values: string[]` array. This is far more intuitive than typing exact-match strings.
- **Filter search for long lists**: When a pick-list has 6+ values, show a search input above the checkboxes to help users find values quickly.
- **Pass data to config panel**: The config panel needs the raw data to extract distinct values. Pass it as an optional `data` prop — the component should handle null/empty data gracefully.

## Report Export (PDF + XLSX)
- **ExcelJS for XLSX**: Pure data-driven, no DOM dependency. Walk the group tree to emit group header rows → data rows → subtotal rows. Apply number formats by field type.
- **@react-pdf/renderer for PDF**: Consistent with existing one-pager PDF. Use `StyleSheet.create` for styles, `Font.register` for Inter. Column widths should be proportional based on field type (text = wider, currency = narrower).
- **Dynamic orientation**: Auto-switch to landscape for reports with >8 columns. Also scale font size down for >10 and >14 columns to prevent text truncation.
- **Lazy-import exports**: Use `await import(...)` in the button onClick handler to keep the export libraries out of the main bundle. Both ExcelJS and @react-pdf/renderer are heavy.
- **Frozen header pane**: In XLSX, `ws.views = [{ state: 'frozen', ySplit: 1 }]` keeps headers visible while scrolling — essential for large exports.

## Security Architecture
- **Supabase query builder prevents SQL injection**: All `.from()`, `.eq()`, `.insert()`, `.update()`, `.delete()` calls are parameterized by PostgREST. Never use raw SQL or string interpolation in queries.
- **Server-only API keys**: All third-party keys (Regrid, Gemini, Hellodata, ArcGIS) use `process.env.KEY_NAME` without the `NEXT_PUBLIC_` prefix. Only the Supabase URL and anon key are client-visible (by design — scoped by RLS).
- **Admin client isolation**: `createAdminClient()` (service role) lives in a dedicated file with clear "NEVER import from client-side" documentation. It's only used in `/api/admin/*` routes that verify `profile.role === 'owner'` first.
- **RLS as the real access control layer**: Even if someone has the anon key, RLS policies on every table restrict what they can read/write. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe to expose because it's powerless without matching RLS policies.
- **Middleware auth vs API route auth**: The Next.js proxy redirects unauthenticated page requests to `/login`, but exempts `/api/*` paths. API routes that proxy external services (demographics, Regrid tiles) don't need session auth since they only return public data. Admin routes add their own auth layer.
- **Hard deletes are a risk**: Without `deleted_at` / soft-delete columns, accidental deletions are permanent. Consider soft-delete for critical tables (pursuits, comps, key dates).

## JSONB Column Collisions
- **Multiple features sharing a JSONB column**: If two features store data in the same JSONB column (e.g., `parcel_data` holding both Regrid parcel info and `aiSummary`), any write that replaces the whole column wipes the other feature's data. Always **merge** with the existing value (`{ ...existing, ...newData }`) instead of replacing. Better yet, use `useRef` to track the latest known state for concurrent-save scenarios.
- **Hydration from DB with `useEffect`**: When restoring local state from a DB-fetched field, avoid referencing mutable state in the guard condition (e.g., `!aiSummary`). The state variable may be stale in the closure. Use a `useRef` flag (e.g., `aiHydratedRef`) to track whether hydration has occurred.

## Report Aggregation Formatting
- **Integer fields with `avg` aggregation**: Year Built, count-like fields, and similar integer data should use `Math.round()` in their `format` function. The aggregation engine computes raw `sum / count`, which produces decimals (e.g., "2018.67"). The `format` function is applied to both individual row values and aggregated subtotal/total values, so rounding is safe for both cases.

## Server-Side `created_by` Pattern
- **Always set `created_by` server-side**: Any `create*` function that inserts a row with a `created_by` column should call `getUser()` and set it automatically inside the function. Never rely on callers to pass it — callers inevitably pass `null` or forget to include it.
- **Add to `Omit` type**: When auto-setting `created_by`, add it to the function's `Omit<Entity, ...>` type so callers can't override it.
- **Audit pattern**: Check all `create*` functions against `createLandComp` / `createSaleComp` (which did this correctly from the start) to find any that are missing the pattern.

## AI Multi-Pass Context Enrichment
- **Feed rent comps into AI site assessment**: The 2-pass AI pipeline (data summary → assessment) benefits from competitive rent data. Aggregate unit-level rents into bed-type averages server-side before adding to context — avoids sending 50+ raw unit records to the LLM.
- **Token limits scale with context**: When adding new data sources to the AI prompt, increase `maxOutputTokens` proportionally. The model needs room for the new section (e.g., "Competitive Rent Landscape").
- **Prompt sections should be conditional**: Use "If X data is provided... If not, skip this section entirely" phrasing so the model handles missing data gracefully without hallucinating.

## Mapbox Polygon Rendering Across Views
- **Same data, multiple maps**: When parcel geometry needs to show on multiple maps (LocationCard, PublicInfoTab), render it independently in each component's `map.on('load')` handler. Don't try to share map instances.
- **Assemblage on initial load**: If assemblage parcels exist when the map first loads, render them in the init `useEffect`'s load handler — not just in a separate "update" `useEffect`. The update effect may not fire if the assemblage hasn't changed since mount.
- **Dependency array for map recreation**: Add `assemblage` (or the relevant parcel data) to the main map `useEffect` deps so the map re-creates with current data. The separate "update" `useEffect` then handles incremental changes.
- **Consistent color convention**: Primary parcel = component's brand color (amber on PublicInfo, blue on LocationCard). Assemblage parcels = purple (`#7C3AED`) everywhere for visual consistency.

## Adding a New Expense Line Item (Pattern)
- **Checklist**: Types (OnePager + all template interfaces) → schema (Zod) → calculation engine (add to `OpExCalc` interface + total) → UI (`OpExRow` in `OnePagerEditor`) → exports (Excel + PDF) → pursuit creation defaults → admin template defaults + UI → DB migration (ALTER TABLE on both `one_pagers` and `data_model_templates`).
- **Template type duplication**: `DataModelTemplate` may have multiple type definitions (interface + DB row type). Search for ALL occurrences of the sibling field (e.g., `default_opex_insurance`) and add the new field next to each one.
- **Table name accuracy in migrations**: The template table is `data_model_templates`, not `data_models`. Always verify actual table names from the initial schema migration before writing ALTER TABLE statements.

## Property Tax / Mil Rate Input Convention
- **User mental model matters**: The user thinks of the tax rate as a percentage (e.g., 1.2748 = 1.2748%). Don't apply millage convention (÷1000) or percentage convention (÷100) unless the user explicitly wants it. In this case: `assessed_value × rate_input` with no division.
- **Label should match the math**: If the input works as a straight percentage, label it "Tax Rate" with `format="percent"`, not "Mil Rate" (which implies ÷1000).

## Revenue Card UX
- **Inline assumption + result pattern**: For inputs that produce a calculated amount (e.g., Other Income $/unit/mo → annual total, Vacancy % → vacancy $), show the assumption input inline on the left and the calculated result on the right. This collapses 2–3 rows into one compact row.
- **Sub-metrics under totals**: Display $/Unit and $/SF below key totals (Net Revenue, etc.) as small secondary text. These are high-value metrics that don't need their own full row.

## Mobile Responsiveness — Tables
- **`min-width` on data tables**: Set `min-width: 480px` (or appropriate) on `.data-table` CSS class so tables maintain readability on narrow screens. Combined with `overflow-x: auto` on the parent `.card`, this gives horizontal scroll instead of squishing columns.
- **Card overflow on mobile**: Use `overflow-x: auto` on `.card` at mobile breakpoint only. Revert to `overflow-x: visible` on `sm:` and up so popups (notes, tooltips) aren't clipped on desktop.
- **Responsive card padding**: Reduce card padding on mobile (14px vs 20px) to maximize content area.
- **KPI headers**: Convert rigid `flex` + `grid-cols-N` layouts to stacking `flex-col lg:flex-row` with secondary metrics in a responsive grid. On mobile, show key metrics in a compact 3-col grid below the headline number.

## Mobile Responsiveness — Toolbar Restructuring
- **Two-row toolbar pattern**: When a toolbar has too many controls for one row (toggle group + selector + action buttons), split into two rows: top row = title + actions, bottom row = toggle group (scrollable).
- **Abbreviated toggle labels**: Use `<span className="hidden sm:inline">Full Label</span><span className="sm:hidden">Abbr</span>` for data source toggle buttons. Shows full text on desktop, abbreviated on mobile.
- **Div nesting discipline**: When restructuring a complex toolbar from one row to multi-row, add `{/* end X */}` comments on closing `</div>` tags. Mismatched nesting creates invisible layout bugs (large white space gaps) that are hard to spot visually.

## Auth Session Management
- **Stale closures in `onAuthStateChange`**: The listener is registered once (empty deps `[]`), so any state read inside it is frozen at mount time. Always use `useRef` to track values (like `profile`) that the listener needs to read at runtime. Reading state directly causes phantom "unauthenticated" states on every token refresh (~55 min).
- **Harden `signOut`**: `supabase.auth.signOut()` throws if the session is already invalid. Always wrap in `try/catch` and proceed with state clearing + redirect regardless — users must never be trapped in an unrecoverable state.
- **Tab-return session health check**: Add a `visibilitychange` listener that calls `getUser()` when the tab becomes visible. Sessions can expire while tabs are backgrounded; this catches it immediately instead of leaving a broken UI.

## AI Investment Memo — Two-Pass Pipeline
- **Gemini for data synthesis, Claude for prose**: Gemini excels at parsing large structured JSON into a fact-sheet. Claude excels at turning that fact-sheet into polished prose. The two-pass approach produces better results than either model alone.
- **Factual tone > persuasive tone**: Users don't want fake IC recommendations from AI. Prompt the writer model to be factual/analytical with observations and assessments — not persuasive committee language. End with "Risk Considerations" instead of "Recommendation."
- **Tell the AI about downstream exhibits**: When the app will append charts/tables below the narrative, tell the AI in the prompt so it references exhibits by label (e.g., "See Exhibit B") instead of reproducing data tables inline.
- **Strip raw IDs from AI context**: Internal UUIDs (stage IDs, pursuit IDs) leak into AI-generated text if included in the data payload. Either strip them before sending or instruct the model to omit them.

## Browser Print-to-PDF Limitations
- **Dark mode bleeds through**: Browser `window.print()` captures current theme styling. Even with `@media print` CSS overrides, interactive components (buttons, toggles, colored table headers) render poorly. The more complex the UI, the worse the PDF.
- **Interactive components can't be hidden selectively**: Mapbox zoom controls, chart toggle buttons, and tab selectors all appear in print output. Hiding them via CSS is fragile and incomplete.
- **DOCX export > browser print for professional documents**: For institutional-quality output, programmatic DOCX generation (via the `docx` npm package) gives full control over fonts, margins, table formatting, and page breaks. Browser print should be a last resort, not the primary export.

## DOCX Generation (docx npm package v9)
- **`Buffer` → `Uint8Array` for NextResponse**: Node `Buffer` is not assignable to `NextResponse` body in strict TypeScript. Wrap in `new Uint8Array(buffer)`.
- **`Paragraph[]` vs `(Paragraph | Table)[]`**: When building section content that mixes paragraphs and tables, type the array as `(Paragraph | Table)[]`. The `docx` package's `ISectionOptions.children` accepts this union.
- **HTML → blocks parser**: A simple regex-based parser (`/<(h[1-3]|p|li)>.../) is sufficient for AI-generated HTML (no nested elements, no attributes). Handle `<table>` separately by extracting rows/cells first, then processing remaining text segments.
- **Mapbox Static Images API**: `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-l+COLOR(lng,lat)/lng,lat,zoom/WxH@2x?access_token=TOKEN` generates a clean map image for embedding. Use `light-v11` style for print-friendly output.
- **Cover page KPIs**: A small key-value table on the cover page (Units, Budget, YOC) gives the reader instant context before the narrative starts.

## Standalone Entity from Existing Data
- **Reuse existing chart components**: When building a detail page for a standalone entity that shares data with an existing pursuit-level view, import the existing section components (`BubbleChartSection`, `LeasingActivitySection`, `OccupancySection`) and compute the required `PropertyMetrics` interface from the raw data. Avoid rewriting chart/visualization logic.
- **Summary table before detail table**: For unit-level data, always provide a bedroom-grouped summary table (count, avg sqft, avg rent, avg $/SF, avg DOM, available) above the full rent roll. Clicking a summary row should filter the detail table below — users scan the summary first, then drill down.
- **Null-guard JSONB values**: Hellodata's `building_quality` JSONB has entries where values are `null` even though keys are present. Always filter with `.filter(([, v]) => v != null && typeof v === 'number')` before calling `.toFixed()` or using in calculations. This applies to any JSONB column with mixed/sparse data.
- **`occupancy_over_time` is unpopulated**: Hellodata's API does not populate the `occupancy_over_time` field for most properties. Derive occupancy from unit `availability_periods` (enter_market / exit_market dates) instead — this is what the existing `OccupancySection` already does.

## Vercel Cron Jobs
- **`vercel.json` cron config**: Add `{ "crons": [{ "path": "/api/cron/...", "schedule": "0 11 * * 1" }] }` at project root. The schedule is standard cron syntax in **UTC** (11:00 UTC = 5:00 AM CT).
- **CRON_SECRET auth**: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when invoking cron routes. Set `CRON_SECRET` in Vercel env vars. The route should check `req.headers.get('authorization')` against `Bearer ${process.env.CRON_SECRET}`.
- **Self-calling API pattern**: The cron route can call the app's own API routes internally (e.g., `/api/hellodata/property?forceRefresh=true`). Use `NEXT_PUBLIC_APP_URL` or `VERCEL_URL` for the base URL. This reuses existing upsert/cache logic without duplication.
- **Rate limiting external APIs**: When a cron job iterates over N entities calling an external API, add a delay between calls (e.g., `await new Promise(r => setTimeout(r, 500))`) to avoid rate limits. Log per-entity results for debugging.
- **Hellodata refresh is non-destructive**: Each API call returns trailing historical data (unit `history`, `availability_periods`, `concessions_history`). The upsert + delete-and-reinsert pattern for units/concessions replaces current-state snapshots with fresh current-state snapshots — historical data lives inside the response, not across rows.
- **`openssl` unavailable on Windows**: Use PowerShell to generate random hex strings: `-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })`.

## Hellodata Property API
- **Cache-first, never auto-refresh**: The property endpoint should default to returning cached data if it exists, regardless of age. Use `forceRefresh=true` query param only for explicit user action or cron jobs. This prevents accidental API costs (~$0.50/call).
- **Fetch log table**: Log every Hellodata API call to a `hellodata_fetch_log` table (fire-and-forget insert) for cost tracking and debugging. Include `hellodata_id`, `endpoint`, `response_status`, and `fetched_by`.
