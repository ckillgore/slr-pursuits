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
