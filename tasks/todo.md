# Pre-Development Budget Feature

## Phase 1 — Database & Data Layer
- [x] Write migration `004_predev_budgets.sql`
- [x] Add types to `src/types/index.ts`
- [x] Add query functions to `src/lib/supabase/queries.ts`
- [x] Add React Query hooks to `src/hooks/useSupabaseQueries.ts`

## Phase 2 — Pursuit Tab (Budget Editor)
- [x] Create `PredevBudgetTab.tsx` with creation flow + budget grid
- [x] Integrate into pursuit detail page as new tab
- [x] Add summary cards (Actuals / Projected / Total Budget)
- [x] Allow deleting any line item (template or custom)

## Phase 3 — Portfolio Report Integration
- [x] Add `'predev_budgets'` data source toggle to Reports page
- [x] Build budget report view with monthly/annual toggle
- [x] Add line item category filter (multi-select, e.g. Earnest Money)

## Phase 4 — Polish & Edge Cases
- [x] Build check (tsc --noEmit) — no errors in new code
- [x] Run migration SQL in Supabase (user action required)
- [ ] Manual testing via dev server

---

# Key Dates Tracking Feature

## Phase 1 — Database & Data Layer
- [x] Write migration `20260227_key_dates.sql` (`key_date_types` + `key_dates`)
- [x] Add types (`KeyDateType`, `KeyDate`, `KeyDateStatus`) to `src/types/index.ts`
- [x] Add query functions to `src/lib/supabase/queries.ts`
- [x] Add React Query hooks to `src/hooks/useSupabaseQueries.ts`

## Phase 2 — Pursuit Tab (Key Dates Editor)
- [x] Create `KeyDatesTab.tsx` with grouped date list, status toggles, timeline
- [x] Add/edit/delete key date dialogs
- [x] AI contract extraction API route (`/api/ai-extract-dates`)
- [x] AI review modal (accept/reject/edit extracted dates)
- [x] Integrate into pursuit detail page as new tab

## Phase 3 — Portfolio Report Integration
- [x] Add `'key_dates'` data source toggle to Reports page
- [x] Build `KeyDateReport.tsx` with summary cards, sortable table, portfolio timeline
- [x] Add key date report fields (flattened one-row-per-pursuit)

## Phase 4 — Admin & Polish
- [x] Admin page for Key Date Types management
- [x] Admin nav links across all admin pages
- [x] Run `20260227_key_dates.sql` migration in Supabase (user action required)
- [ ] Manual testing via dev server

---

# Application Polish Pass (2/26)

- [x] Fix Tiptap duplicate `underline` extension warning
- [x] Pursuit detail: tab bar horizontal scroll on mobile (6 tabs)
- [x] Pursuit detail: responsive padding (`px-4 md:px-6`)
- [x] Pursuit detail: `mx-4` on all 3 modal dialogs
- [x] Dashboard: `router.push` instead of `window.location.href` in list view
- [x] Dashboard: list view table `overflow-x-auto`
- [x] Dashboard: `mx-4` on 2 modal dialogs
- [x] Dashboard: remove unused `ArrowUpDown` import + dead `currentStyle` variable
- [x] Fix TS error: `income_heatmap_data` type cast on pursuit detail page

---

# Due Diligence Checklist Feature

## Phase 1 — Database & Data Layer
- [x] Write migration `005_checklist_schema.sql` (11 tables, 3 DB functions, triggers, RLS, indexes)
- [x] Seed default template (7 phases, 113 tasks, 98 items) in `005b` + `005c`
- [x] Add types to `src/types/index.ts` (12 interfaces, 3 type unions)
- [x] Add query functions to `src/lib/supabase/queries.ts` (~300 lines)
- [x] Add React Query hooks to `src/hooks/useSupabaseQueries.ts` (20+ hooks)

## Phase 2 — Pursuit Tab (Checklist UI)
- [x] Create `ChecklistTab.tsx` with accordion phases, task cards, task detail panel
- [x] Apply template dialog with default template selection
- [x] Milestone bar with date entry + confirmed/estimated toggle
- [x] Task detail panel with status toggle, checklist items, notes, activity log
- [x] Summary stats bar (progress, overdue, in-progress counts)
- [x] Integrate into pursuit detail page as new tab

## Phase 3 — Admin Interface
- [x] Create `/admin/checklist-templates` page with template browser
- [x] Add "Checklists" nav link to all admin pages

## Phase 4 — Polish & Verification
- [x] Build check (`npm run build`) — no errors
- [x] Fix 7 implicit `any` type errors in `queries.ts`
- [ ] Run migration SQL in Supabase (user action required)
- [ ] Manual testing via dev server
- [ ] Checklist KPI card on pursuit Overview tab (cosmetic, deferred)

---

# Rent Comps Report Tab (3/1)

- [x] Add `'rent_comps'` data source toggle to Reports page
- [x] Define rent comp report fields (`reportFields.ts`)
- [x] Wire rent comp data through `useRentCompReportData` hook
- [x] Connect to `useReportEngine` + `ReportTable`
- [x] Fix Year Built aggregation (average not sum)
- [x] Fix rent fields aggregation (average not sum)
- [x] Fix Leased % field to use actual data

---

# Report Filter Redesign (3/1)

- [x] Add `'in'` operator to `ReportFilterOperator` type
- [x] Add `values?: string[]` to `ReportFilter` interface
- [x] Update `applyFilters` in `useReportEngine` for `'in'` operator
- [x] Redesign `ReportConfigPanel` — text fields show multi-select checkbox pick-lists
- [x] Numeric/currency fields keep operator-based input (≥, ≤, etc.)
- [x] Extract distinct values from data for pick-list population
- [x] Pass `data` prop from Reports page to `ReportConfigPanel`

---

# Report Export — PDF + XLSX (3/1)

- [x] Create `exportReportExcel.ts` — XLSX with groups, subtotals, auto-width columns
- [x] Create `ReportPDF.tsx` — PDF with dynamic orientation and scaled fonts
- [x] Wire XLSX + PDF export buttons into Reports toolbar
- [x] Lazy-import both exports for bundle optimization
- [x] Build check — no new errors

---

# Bug Fixes (3/1)

- [x] AI Site Assessment persistence — summary lost on page navigation
  - [x] Fix `onSaveParcelData` to merge with existing `parcel_data` (preserves `aiSummary` key)
  - [x] Add `aiHydratedRef` to prevent stale closure in restore `useEffect`
  - [x] Reset hydration ref on "Clear" so regeneration works
- [x] Rent Comp report — Year Built column shows decimals in subtotal/total rows
  - [x] Add `Math.round()` to `rc_year_built` format function

---

# Hellodata Rent Comps Integration

## Phase 1 — Database & Data Layer
- [x] Write migration `010_hellodata_rent_comps.sql` (5 tables)
- [x] Add types to `src/types/index.ts`
- [x] Add query functions to `src/lib/supabase/queries.ts`
- [x] Add React Query hooks to `src/hooks/useHellodataQueries.ts`
- [x] Add calculation utilities `src/lib/calculations/hellodataCalculations.ts`

## Phase 2 — API Routes
- [x] Create `/api/hellodata/search` route (proxies free search)
- [x] Create `/api/hellodata/property` route (smart-cache fetch)
- [x] Create `/api/hellodata/comparables` route (proxies free comps)

## Phase 3 — Pursuit Tab (Rent Comps UI)
- [x] Create `RentCompsTab.tsx` with search, add, detail views
- [x] Integrate into pursuit detail page as new tab
- [x] Build unit mix / rent tables, concession timeline, occupancy charts

## Phase 4 — Verification
- [x] Test with free dev properties (3 properties provided)
- [x] Verify caching prevents duplicate API calls
- [x] Manual testing via dev server

---

# Security Audit (3/1)

- [x] Audit all 15 API routes for injection vectors
- [x] Verify all DB operations use parameterized Supabase query builder (no raw SQL)
- [x] Confirm service role key isolated in `admin-client.ts` (server-only)
- [x] Verify admin routes (`/api/admin/*`) are owner-role gated
- [x] Confirm `.env*` in `.gitignore` and no secrets tracked in git
- [x] Verify RLS enabled on all tables with appropriate policies
- [x] Check `NEXT_PUBLIC_` env vars — only URL + anon key (by design)

---

# Activity Tracking Fix (3/2)

- [x] Diagnose `created_by` null values for pursuits and one-pagers
- [x] Fix `createPursuit` to auto-set `created_by` from auth user
- [x] Fix `createOnePager` to auto-set `created_by` from auth user
- [x] Remove explicit `created_by: null` from 3 callers (dashboard, pursuit detail, explore)

---

# AI Site Assessment — Rent Comp Integration (3/2)

- [x] Load `usePursuitRentComps` on pursuit detail page
- [x] Send rent comp data (property names, units, rents by bed type, occupancy, concessions, quality) to `/api/ai-summary`
- [x] Aggregate unit-level rent data into bed-type averages in API route
- [x] Update Pass 1 prompt to include competitive rent analysis
- [x] Add "Competitive Rent Landscape" section to Pass 2 assessment prompt
- [x] Increase token limits for expanded analysis

---

# Assemblage Parcels on Maps (3/2)

- [x] Render assemblage parcels (purple polygons) on pursuit overview LocationCard map
- [x] Render assemblage parcels (purple polygons) on Public Info tab main map
- [x] Auto-fit map bounds to encompass primary + assemblage parcels
- [x] Map re-renders when assemblage changes

---

# One-Pager Fixes & Enhancements (3/2)

## Bug Fixes
- [x] Property tax calculation — change divisor so mil rate is treated as percentage (no divide)
- [x] Rename "Mil Rate" label → "Tax Rate" with `format="percent"`
- [x] Investigate payroll "+ Employee" / "+ Contract" button unresponsiveness (cache keys verified consistent; likely fixed by prior optimistic update fixes)
- [x] Investigate one-pager inline input values not updating in view (confirmed saving correctly; reactivity issue resolved by prior cache invalidation fixes)

## Capex Reserves Expense Line
- [x] Add `opex_capex_reserves` to `types/index.ts` (OnePager + 2 template types)
- [x] Add to `schemas.ts` Zod validation
- [x] Add to `opex.ts` calculation engine (`capex_reserves_total` in `OpExCalc`)
- [x] Add `OpExRow` for "Capex Reserves" in `OnePagerEditor.tsx` (below Property Tax)
- [x] Add to `exportExcel.ts` and `OnePagerPDF.tsx` exports
- [x] Add to pursuit creation defaults and admin template defaults
- [x] Write migration `20260302_capex_reserves.sql` (columns on `one_pagers` + `data_model_templates`)

## Revenue Card Redesign
- [x] Compact inline layout: Other Income (input + /unit/mo label → annual amount)
- [x] Compact inline layout: Vacancy & Loss (input % → red vacancy amount)
- [x] Add $/Unit and $/SF metrics under Net Revenue
- [x] Remove separate "Other Income (Annual)" and "Vacancy Amount" rows

## Unit Mix Total Row
- [x] Add weighted avg MO. RENT calculation (total annual rev ÷ total units ÷ 12)

## Table Header Alignment
- [x] Left-align "Uses" header in Development Budget table
- [x] Left-align "Category" header in Operating Expenses table

---

# Mobile Responsiveness — One-Pager (3/2)

- [x] Responsive outer padding (`px-3 sm:px-6`, `py-4 sm:py-6`)
- [x] Top bar wraps vertically on mobile (`flex-col sm:flex-row`)
- [x] Toolbar horizontally scrollable (`overflow-x-auto`)
- [x] KPI header stacks vertically on mobile; key metrics in 3-col grid
- [x] Card CSS: `overflow-x: auto` on mobile, compact padding (14px vs 20px)
- [x] `data-table` CSS: `min-width: 480px` triggers horizontal scroll on narrow screens
- [x] Unit mix table wrapper: `overflow-x-auto`

---

# Mobile Responsiveness — Reports Tab (3/2)

- [x] Toolbar restructured into two rows (title+actions top, data source toggle bottom)
- [x] Data source toggle: abbreviated labels on mobile, horizontally scrollable
- [x] Template selector: reduced min-width on mobile
- [x] Responsive padding (`px-3 sm:px-4 md:px-6`)
- [x] Fix broken div nesting that caused large white space between toolbar and content

---

# Vercel Analytics (3/2)

- [x] Install `@vercel/analytics` package
- [x] Add `<Analytics />` component to root layout

---

# AI Investment Memo & DOCX Export (3/7)

## AI Memo Generation
- [x] Two-pass AI pipeline: Gemini (analyst fact-sheet) → Claude (narrative writer)
- [x] Update Claude prompt to factual/analytical tone (no IC recommendations)
- [x] Save generated HTML to `executive_memo` column on pursuits
- [x] DB migration: `20260307_executive_memo.sql` adds `executive_memo` text column

## Editable Memo Page (`/pursuits/[id]/memo`)
- [x] RichTextEditor for in-browser editing of AI-generated narrative
- [x] Auto-save edits to Supabase via `useUpdatePursuit`
- [x] Inline exhibit sections: Location Map, Financial Summary, Rent Comps, Leasing/Concessions, Land Comps, Sale Comps
- [x] Dynamic exhibit labeling (A, B, C…) based on available data

## DOCX Export
- [x] `src/lib/docx/docxBuilder.ts` — programmatic DOCX builder with cover page, HTML→blocks parser, data tables
- [x] `/api/ai-memo/export-docx` — server route fetching all Supabase data + Mapbox static image
- [x] Download DOCX button on memo page with loading state
- [x] Remove Print/PDF button (DOCX is sole export)

## Future Enhancements
- [ ] Increase Claude `max_tokens` to prevent narrative truncation on data-heavy pursuits
- [ ] Remove raw stage UUIDs from AI-generated text
- [ ] Add demographics ring data exhibit to DOCX
- [ ] Weave exhibits inline within narrative sections (after corresponding headings)

---

# Future / Deferred Items

- [ ] **Hellodata Market Rents/Pricing API** — AI-driven rent recommendations endpoint (costs ~$0.50/call). Deferred from initial Rent Comps integration. Endpoint: `POST /property/pricing`. Accepts subject property + settings (max_radius, listing_status, date range, include_outliers, building_ids). Returns recommended prices per unit type based on recently closed comps.
- [ ] Checklist KPI card on pursuit Overview tab
- [ ] **Security hardening: API route auth** — Add `getUser()` check at top of non-admin API routes to require a valid session (currently proxied routes are callable without auth, but no data leakage risk)
- [ ] **Security hardening: Soft deletes** — Add `deleted_at` column to critical tables (pursuits, land_comps, key_dates) instead of hard deletes, to allow recovery from accidental deletion
- [ ] **Backfill `created_by`** — Write SQL to set `created_by` on existing pursuits/one-pagers with null values (historical data won't show activity without this)

---

# One-Pager — Formatting & Display Fixes (3/6)

- [x] **Management fee — show two decimal places** — Changed `decimals={1}` → `decimals={2}` on mgmt fee InlineInput
- [x] **HC/NRSF — round without decimals in hard cost sensitivity table** — Changed `formatCurrency(row.adjustedValue, 2)` → `formatCurrency(row.adjustedValue, 0)`
- [x] **Payroll & property tax — reduce text size** — Changed toggle buttons from `text-sm` to `text-xs`
- [ ] **FAR — decide net or gross building size** — ⚠️ Decision needed: should Floor Area Ratio use net or gross building size? Currently unclear which is being used. Capture as open question and revisit
- [x] **Sensitivity table colors in dark mode** — Added CSS variables `--sensitivity-deep-green`, `--sensitivity-faint-green`, `--sensitivity-deep-red` with dark theme overrides; updated `yocBgColor()` to use them
- [x] **Stage dropdown in dark mode** — Changed `<option>` background from `#fff` to `var(--bg-card)`

---

# One-Pager — Feature Enhancements (3/6)

## Unit Mix Total Row
- [x] **Add Monthly Rent to total row** — Already implemented: weighted average monthly rent (total annual rev ÷ total units ÷ 12) shows in the unit mix total row

## Revenue Card
- [ ] **Improve layout of revenue card** — Refine the visual layout and information density of the revenue summary card

## Unit Density Recommendations
- [ ] **Adjust suggested unit density for product subtypes** — Currently density recommendations only consider the main product type (e.g. "Wrap") but not the subtype (e.g. "5 Over 2"). Subtypes like 5 Over 2 have a higher standard density per acre than base Wrap. Update the recommendation logic to be subtype-aware

## Unit Premiums
- [ ] **Add unit premiums feature to revenue card** — New capability for users to capture rent premiums as an add-on in the one-pager:
  - Add premium input fields (extra rent $/unit/month and rent $/SF impact)
  - Show premiums in the revenue card alongside Other Income
  - Display both base rent and rent-with-premium figures
  - Premiums represent upgrades/features that command additional rent above base (e.g. balcony, view, finishes)

## Card/Row Comments
- [ ] **Add comment capability to one-pager tables** — Allow users to add comments/notes to:
  - Unit Mix table (at the table/card level since there aren't per-row comments per unit type)
  - Land Cost row
  - Hard Cost input section
  - Soft Cost input section
  - Consider implementing at the card level with a notes/comment field per card. Extend existing `FieldNoteButton.tsx` pattern or build a similar card-level annotation

## Parking
- [ ] **Add parking spaces input** — New input field for total parking spaces on the one-pager. Calculate and display parking spaces per unit ratio

## PDF Export
- [ ] **PDF export — match expanded/collapsed state** — One-pager PDF export currently includes property tax but excludes payroll. Both should be included in the PDF if their cards are "expanded" by the user in the UI, and hidden if collapsed. Match the PDF output to the user's current expanded/collapsed card state. Files: `OnePagerPDF.tsx`

---

# Comparables & Market Data (3/6)

## Land Comps & Sale Comps — Persistence
- [ ] **Save land comps and sale comps to database** — Ensure land comps and sale comps are properly persisting to the database (verify save flow end-to-end)
- [ ] **Auto-fill address from Mapbox API** — When adding a land or sale comp, use Mapbox geocoding API to auto-fill address fields
- [ ] **Add ability to relate land and sale comps to a pursuit** — Similar to how rent comps can be linked to a pursuit, add the same association capability for land comps and sale comps

## Sale Comps — Display Fixes
- [ ] **Add rents-at-sale info to sale comps** — Include rent information at time of sale in the sale comp data
- [ ] **Fix year of construction display** — Year of construction currently shows with a comma (e.g. "2,024" instead of "2024"); remove number formatting on year fields

## Rent Comps — Fixes & Enhancements
- [x] **Fix weird characters on rent comps** — Investigate and fix encoding/character display issues on rent comp data
- [x] **Verify list/map component views on comps are working** — Confirm that both list view and map view render correctly for comps
- [x] **Bubble chart drilldown** — When user clicks a bubble on the rent/size bubble chart in the rent comps page, provide a drilldown showing the underlying property details. File: `RentCompSections.tsx`

---

# Standalone Rent Comps Entity (3/7)

## Data Layer
- [x] Add `fetchAllHellodataProperties()` to `queries.ts` (lightweight list/grid/map query)
- [x] Add `fetchHellodataPropertyDetail()` to `queries.ts` (full detail with units + concessions)
- [x] Add `fetchPursuitsLinkedToProperty()` to `queries.ts` (reverse lookup)
- [x] Add hooks: `useAllHellodataProperties`, `useHellodataPropertyDetail`, `usePursuitsForProperty`

## Comps Page — Rent Toggle
- [x] Add 'Rent Comps' as first toggle on `/comps` page (default active)
- [x] Grid, list, and map view modes with search + state/city filters
- [x] Hide "New Comp" button for rent comps (sourced from Hellodata)

## Rent Comp Detail Page (`/comps/rent/[id]`)
- [x] Header: Mapbox map, website link, KPI bar (units/year/stories), linked pursuit badges
- [x] Add to Pursuit dropdown, Refresh Data button, last-refreshed timestamp
- [x] **Overview tab**: property facts, building quality scores, reviews, fees, pricing strategy, amenities
- [x] **Units tab**: bedroom summary table (count/avgSqft/avgRent/avgEffective/avg$/SF/avgDOM/available per bed type + totals), full rent roll below
- [x] **Rent Trends tab**: reuses `RentTrendsSection`
- [x] **Rent vs Size tab**: reuses `BubbleChartSection` (group by property/bed/floorplan, asking/effective toggle)
- [x] **Leasing tab**: reuses `LeasingActivitySection` (trailing 12-week heatmap)
- [x] **Concessions tab**: active + historical with item details
- [x] **Occupancy tab**: reuses `OccupancySection` (derived from unit availability_periods)
- [x] Compute full `PropertyMetrics` for all reused chart sections

## Weekly Cron Refresh
- [x] Create `/api/cron/refresh-rent-comps` route (de-dupes by hellodata_id, 500ms rate limit)
- [x] Create `vercel.json` with cron schedule: Monday 5:00 AM CT
- [x] `CRON_SECRET` env var for auth

## Known Issues / Future
- [ ] `occupancy_over_time` is NULL for all properties — Hellodata doesn't populate this field; occupancy is derived from unit availability_periods instead
- [ ] Demographics data visualization (if Hellodata provides it)

## Market Study Tab (New Feature)
- [ ] **Market study tab in rent comps section** — New tab that replicates the AT&T PRM internal market study exhibit used in investment memos and internal reviews. Should include:
  - Map visualization
  - Market summary narrative
  - Market stock breakdown by unit type with SF allocations/groupings

---

# Reports & Export (3/6)

- [x] **Reorder reports toggle options** — Changed order to: Pursuits, Rent Comps, Land Comps, Pre-Dev, Key Dates, Sale Comps
- [ ] **Inject SLR logo on PDF report exports** — Add the SLR company logo to PDF report exports. Files: `ReportPDF.tsx`, `OnePagerPDF.tsx`

---

# Product Guidelines Feature (3/6)

- [ ] **Product Guidelines capture** — New feature to capture a summary of detailed Smartsheet product guidelines within the platform. Product Guidelines are base assumptions for product selections across units, building, site, and amenities that feed into precon pricing. This would:
  - Provide a way to link to or embed relevant Smartsheet data
  - Store a summarized version of the guidelines within the pursuit
  - Surface key assumptions that inform the financial model
  - Scope and design TBD — research Smartsheet API integration options
