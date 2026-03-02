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

# Hellodata Rent Comps Integration

## Phase 1 — Database & Data Layer
- [ ] Write migration `010_hellodata_rent_comps.sql` (5 tables)
- [ ] Add types to `src/types/index.ts`
- [ ] Add query functions to `src/lib/supabase/queries.ts`
- [ ] Add React Query hooks to `src/hooks/useHellodataQueries.ts`
- [ ] Add calculation utilities `src/lib/calculations/hellodataCalculations.ts`

## Phase 2 — API Routes
- [ ] Create `/api/hellodata/search` route (proxies free search)
- [ ] Create `/api/hellodata/property` route (smart-cache fetch)
- [ ] Create `/api/hellodata/comparables` route (proxies free comps)

## Phase 3 — Pursuit Tab (Rent Comps UI)
- [ ] Create `RentCompsTab.tsx` with search, add, detail views
- [ ] Integrate into pursuit detail page as new tab
- [ ] Build unit mix / rent tables, concession timeline, occupancy charts

## Phase 4 — Verification
- [ ] Test with free dev properties (3 properties provided)
- [ ] Verify caching prevents duplicate API calls
- [ ] Manual testing via dev server

---

# Future / Deferred Items

- [ ] **Hellodata Market Rents/Pricing API** — AI-driven rent recommendations endpoint (costs ~$0.50/call). Deferred from initial Rent Comps integration. Endpoint: `POST /property/pricing`. Accepts subject property + settings (max_radius, listing_status, date range, include_outliers, building_ids). Returns recommended prices per unit type based on recently closed comps.
- [ ] Checklist KPI card on pursuit Overview tab
