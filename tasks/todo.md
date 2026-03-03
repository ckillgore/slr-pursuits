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

# Future / Deferred Items

- [ ] **Hellodata Market Rents/Pricing API** — AI-driven rent recommendations endpoint (costs ~$0.50/call). Deferred from initial Rent Comps integration. Endpoint: `POST /property/pricing`. Accepts subject property + settings (max_radius, listing_status, date range, include_outliers, building_ids). Returns recommended prices per unit type based on recently closed comps.
- [ ] Checklist KPI card on pursuit Overview tab
- [ ] **Security hardening: API route auth** — Add `getUser()` check at top of non-admin API routes to require a valid session (currently proxied routes are callable without auth, but no data leakage risk)
- [ ] **Security hardening: Soft deletes** — Add `deleted_at` column to critical tables (pursuits, land_comps, key_dates) instead of hard deletes, to allow recovery from accidental deletion
- [ ] **Backfill `created_by`** — Write SQL to set `created_by` on existing pursuits/one-pagers with null values (historical data won't show activity without this)

