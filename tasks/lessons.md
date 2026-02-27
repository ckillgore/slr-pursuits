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

