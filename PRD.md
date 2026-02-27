# Product Requirements Document: SLR One-Pager
## Multifamily Development Feasibility Analysis Platform

**Version:** 1.0  
**Date:** February 24, 2026  
**Author:** Case — Chief Development Officer, StreetLights Residential  
**Stack:** React / TypeScript / Next.js / Supabase / Vercel  

---

## 1. Product Overview

### 1.1 Purpose

SLR One-Pager is a web application for rapid feasibility analysis of multifamily development sites. It replaces ad-hoc Excel one-pagers with a structured, collaborative, and exportable tool that calculates **unlevered yield on cost** from a minimal set of assumptions. There is no forward forecast, no leverage, and no DCF — this is purely a stabilized-year, unlevered feasibility tool.

### 1.2 Core Concept

The application is organized around two primary entities:

- **Pursuit** — A real estate site or deal opportunity (e.g., "2.4 acres at Main & Elm, Frisco TX"). A Pursuit has a physical location, stage tracking, and notes.
- **One-Pager** — A specific development scenario for a Pursuit (e.g., "4-Story Wrap, 320 units" vs. "5 Over 2, 400 units"). Multiple One-Pagers can exist per Pursuit to evaluate different schemes.

A **Data Model** layer provides configurable default assumptions by product type and region. When a user creates a new One-Pager, default values are loaded from the matching Data Model template. Once created, the One-Pager's values are independent — changes to the Data Model only affect future One-Pagers.

### 1.3 Key Output

**Unlevered Yield on Cost = Stabilized NOI ÷ Total Development Budget**

Secondary outputs include cost/unit, cost/SF, rent/SF, NOI/unit, and sensitivity tables.

### 1.4 Users

Internal SLR development team (~10 users). No external user access required at launch. Single-role authentication (all users have full access).

---

## 2. Information Architecture

### 2.1 Application Structure

```
/                         → Home / Dashboard (Pursuit cards + map + filters)
/pursuits/:id             → Pursuit Detail (info, one-pager list, comparison)
/pursuits/:id/one-pagers/:id → One-Pager Editor (single-page dashboard)
/compare                  → Cross-Pursuit Comparison Tool
/admin                    → Admin Settings
  /admin/product-types    → Product Type & Sub-Type Management
  /admin/data-models      → Default Assumption Templates
  /admin/stages           → Pursuit Stage Configuration
  /admin/payroll-templates→ Payroll Role Templates
  /admin/tax-regions      → Regional Tax Assumption Management
```

### 2.2 Entity Relationship Diagram

```
┌─────────────────┐       ┌──────────────────┐
│   Pursuit        │1────M│   One-Pager       │
├─────────────────┤       ├──────────────────┤
│ id (uuid)        │       │ id (uuid)         │
│ name             │       │ pursuit_id (FK)   │
│ address          │       │ name              │
│ coordinates      │       │ product_type_id   │
│ site_area_sf     │       │ sub_product_type_id│
│ stage_id (FK)    │       │ created_at        │
│ stage_changed_at │       │ updated_at        │
│ created_at       │       │ created_by        │
│ exec_summary     │       │ [all assumptions] │
│ arch_notes       │       │ [all calculated]  │
│ region           │       └──────────────────┘
│ created_by       │
└─────────────────┘

┌─────────────────┐       ┌──────────────────┐
│ ProductType      │1────M│ SubProductType    │
├─────────────────┤       ├──────────────────┤
│ id (uuid)        │       │ id (uuid)         │
│ name             │       │ product_type_id   │
│ sort_order       │       │ name              │
│ default_density_low│     │ sort_order        │
│ default_density_high│    └──────────────────┘
│ is_active        │
└─────────────────┘

┌─────────────────┐       ┌──────────────────┐
│ DataModel        │       │ PursuitStage      │
├─────────────────┤       ├──────────────────┤
│ id (uuid)        │       │ id (uuid)         │
│ name             │       │ name              │
│ product_type_id  │       │ sort_order        │
│ region (nullable)│       │ color             │
│ [all defaults]   │       │ is_active         │
│ created_at       │       └──────────────────┘
│ updated_at       │
└─────────────────┘

┌──────────────────────┐   ┌──────────────────┐
│ OnePagerUnitMix      │   │ OnePagerPayroll   │
├──────────────────────┤   ├──────────────────┤
│ id (uuid)             │   │ id (uuid)         │
│ one_pager_id (FK)     │   │ one_pager_id (FK) │
│ unit_type (enum)      │   │ role_name         │
│ unit_count            │   │ headcount         │
│ avg_unit_sf           │   │ base_compensation │
│ rent_input_mode       │   │ bonus_pct         │
│ rent_per_sf           │   │ sort_order        │
│ rent_whole_dollar     │   └──────────────────┘
│ sort_order            │
└──────────────────────┘

┌──────────────────────────┐
│ OnePagerSoftCostDetail   │
├──────────────────────────┤
│ id (uuid)                 │
│ one_pager_id (FK)         │
│ line_item_name            │
│ amount                    │
│ calc_method (flat/$_pct)  │
│ sort_order                │
└──────────────────────────┘
```

---

## 3. Data Model — Full Schema

### 3.1 Pursuits Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Pursuit name (e.g., "Main & Elm Site") |
| `address` | text | Full street address |
| `city` | text | City |
| `state` | text | State abbreviation |
| `county` | text | County (relevant for tax) |
| `zip` | text | ZIP code |
| `latitude` | numeric(10,7) | Latitude from geocode |
| `longitude` | numeric(10,7) | Longitude from geocode |
| `site_area_sf` | numeric(12,2) | Total site area in square feet |
| `stage_id` | uuid (FK) | Current pursuit stage |
| `stage_changed_at` | timestamptz | When stage last changed |
| `exec_summary` | jsonb | Rich text (stored as Tiptap/ProseMirror JSON) |
| `arch_notes` | jsonb | Rich text for architecture team notes |
| `region` | text | Region identifier (for tax/assumption lookup) |
| `created_by` | uuid (FK) | User who created |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-updated |
| `is_archived` | boolean | Soft delete |

**Calculated (virtual/view):**
- `site_area_acres` = `site_area_sf` / 43,560

### 3.2 One-Pagers Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `pursuit_id` | uuid (FK) | Parent pursuit |
| `name` | text | Scenario name (e.g., "Scheme A — 4-Story Wrap") |
| `product_type_id` | uuid (FK) | Product type |
| `sub_product_type_id` | uuid (FK, nullable) | Sub-product type |
| `created_by` | uuid (FK) | Creator |
| `created_at` | timestamptz | Auto-set |
| `updated_at` | timestamptz | Auto-updated |
| `is_archived` | boolean | Soft delete — hides dead iterations without permanent deletion |
| **Site & Density** | | |
| `total_units` | integer | Total unit count |
| `efficiency_ratio` | numeric(5,4) | NRSF-to-GBSF ratio (e.g., 0.8500) |
| **Revenue** | | |
| `other_income_per_unit_month` | numeric(10,2) | Other income $/unit/month |
| `vacancy_rate` | numeric(5,4) | Combined vacancy/concessions/credit loss/LTL (e.g., 0.0700) |
| **Budget** | | |
| `hard_cost_per_nrsf` | numeric(10,2) | Hard cost assumption per NRSF |
| `land_cost` | numeric(14,2) | Total land cost ($) |
| `soft_cost_pct` | numeric(5,4) | Soft cost as % of hard cost |
| `use_detailed_soft_costs` | boolean | Toggle for detailed vs. single-line soft costs |
| **OpEx (all $/unit/year)** | | |
| `opex_utilities` | numeric(10,2) | Utilities per unit per year |
| `opex_repairs_maintenance` | numeric(10,2) | Repairs & Maintenance |
| `opex_contract_services` | numeric(10,2) | Contract Services |
| `opex_marketing` | numeric(10,2) | Marketing |
| `opex_general_admin` | numeric(10,2) | General & Administrative |
| `opex_turnover` | numeric(10,2) | Turnover |
| `opex_misc` | numeric(10,2) | Miscellaneous |
| `opex_insurance` | numeric(10,2) | Insurance |
| `mgmt_fee_pct` | numeric(5,4) | Property management fee as % of net revenue |
| **Payroll** | | |
| `payroll_burden_pct` | numeric(5,4) | Burden % applied to all payroll (e.g., 0.3000) |
| **Property Tax** | | |
| `tax_mil_rate` | numeric(10,6) | Total mil rate (sum of all applicable rates) |
| `tax_assessed_pct_hard` | numeric(5,4) | Assessed value % for hard costs |
| `tax_assessed_pct_land` | numeric(5,4) | Assessed value % for land |
| `tax_assessed_pct_soft` | numeric(5,4) | Assessed value % for soft costs |
| **Sensitivity** | | |
| `sensitivity_rent_steps` | numeric(6,2)[] | Array of rent PSF deltas for sensitivity (e.g., [-0.10, -0.05, 0, 0.05, 0.10]) |
| `sensitivity_hard_cost_steps` | numeric(10,2)[] | Array of hard cost PSF deltas |
| `sensitivity_land_cost_steps` | numeric(14,2)[] | Array of land cost deltas |

### 3.3 One-Pager Unit Mix Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `one_pager_id` | uuid (FK) | Parent one-pager |
| `unit_type` | text | Enum: `studio`, `one_bed`, `two_bed`, `three_bed`, `penthouse`, `townhome`, `other` |
| `unit_type_label` | text | Display label (e.g., "Studio", "1 BR", "2 BR", "3 BR", "PH", "TH", "Other") |
| `unit_count` | integer | Number of units of this type |
| `avg_unit_sf` | numeric(8,2) | Average unit size in SF |
| `rent_input_mode` | text | Enum: `per_sf`, `whole_dollar` |
| `rent_per_sf` | numeric(8,4) | Monthly rent per SF (when mode = per_sf) |
| `rent_whole_dollar` | numeric(10,2) | Monthly whole-dollar rent (when mode = whole_dollar) |
| `sort_order` | integer | Display order |

**Calculated (virtual):**
- `total_sf` = `unit_count` × `avg_unit_sf`
- `effective_monthly_rent` = if `per_sf`: `rent_per_sf` × `avg_unit_sf`; if `whole_dollar`: `rent_whole_dollar`
- `effective_rent_per_sf` = `effective_monthly_rent` / `avg_unit_sf`
- `annual_rental_revenue` = `unit_count` × `effective_monthly_rent` × 12

### 3.4 One-Pager Payroll Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `one_pager_id` | uuid (FK) | Parent one-pager |
| `line_type` | text | Enum: `employee`, `contract`. Employee lines apply bonus + burden; contract lines use fixed_amount only |
| `role_name` | text | Role title (e.g., "Community Manager") or contract description |
| `headcount` | numeric(4,1) | Number of employees (allows 0.5 for part-time). Used for `employee` type only |
| `base_compensation` | numeric(10,2) | Annual base salary per employee. Used for `employee` type only |
| `bonus_pct` | numeric(5,4) | Bonus as % of base (e.g., 0.1000 = 10%). Used for `employee` type only |
| `fixed_amount` | numeric(10,2) | Annual fixed cost. Used for `contract` type only |
| `sort_order` | integer | Display order |

**Calculated (virtual):**
- For `employee` lines: `total_comp_burdened` = `headcount` × `base_compensation` × (1 + `bonus_pct`) × (1 + parent `payroll_burden_pct`)
- For `contract` lines: `total_comp_burdened` = `fixed_amount` (no bonus or burden applied)

### 3.5 One-Pager Soft Cost Detail Table (Optional)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `one_pager_id` | uuid (FK) | Parent one-pager |
| `line_item_name` | text | Line item description |
| `amount` | numeric(14,2) | Dollar amount |
| `sort_order` | integer | Display order |

When `use_detailed_soft_costs` = true, total soft cost = sum of detail rows (replaces the percentage-based calculation).

### 3.6 Data Model Templates Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | Template name |
| `product_type_id` | uuid (FK) | Associated product type |
| `region` | text (nullable) | Region-specific override (null = global default) |
| `is_active` | boolean | Enabled for use |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| **Default values** | | Mirrors all assumption columns from One-Pagers table |
| `default_efficiency_ratio` | numeric(5,4) | |
| `default_other_income_per_unit_month` | numeric(10,2) | |
| `default_vacancy_rate` | numeric(5,4) | |
| `default_hard_cost_per_nrsf` | numeric(10,2) | |
| `default_soft_cost_pct` | numeric(5,4) | Default soft cost as % of hard cost |
| `default_opex_utilities` | numeric(10,2) | |
| `default_opex_repairs_maintenance` | numeric(10,2) | |
| `default_opex_contract_services` | numeric(10,2) | |
| `default_opex_marketing` | numeric(10,2) | |
| `default_opex_general_admin` | numeric(10,2) | |
| `default_opex_turnover` | numeric(10,2) | |
| `default_opex_misc` | numeric(10,2) | |
| `default_opex_insurance` | numeric(10,2) | |
| `default_mgmt_fee_pct` | numeric(5,4) | |
| `default_payroll_burden_pct` | numeric(5,4) | |
| `default_tax_mil_rate` | numeric(10,6) | |
| `default_tax_assessed_pct_hard` | numeric(5,4) | |
| `default_tax_assessed_pct_land` | numeric(5,4) | |
| `default_tax_assessed_pct_soft` | numeric(5,4) | |

### 3.7 Data Model Payroll Defaults Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `data_model_id` | uuid (FK) | Parent data model |
| `line_type` | text | Enum: `employee`, `contract` |
| `role_name` | text | Default role name or contract description |
| `headcount` | numeric(4,1) | Default headcount (employee only) |
| `base_compensation` | numeric(10,2) | Default base comp (employee only) |
| `bonus_pct` | numeric(5,4) | Default bonus % (employee only) |
| `fixed_amount` | numeric(10,2) | Default fixed amount (contract only) |
| `sort_order` | integer | |

### 3.8 Product Types Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `name` | text | Display name |
| `density_low` | numeric(6,1) | Low end of typical density (units/acre) |
| `density_high` | numeric(6,1) | High end of typical density (units/acre) |
| `sort_order` | integer | |
| `is_active` | boolean | |

**Default seed data:**

| Name | Density Low | Density High |
|------|-------------|--------------|
| Townhomes | 12 | 20 |
| Garden | 20 | 30 |
| Hybrid | 25 | 40 |
| Wrap | 35 | 55 |
| Mid Rise | 50 | 80 |
| High Rise | 80 | 150 |
| Other | 10 | 150 |

### 3.9 Sub-Product Types Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `product_type_id` | uuid (FK) | Parent product type |
| `name` | text | Display name |
| `sort_order` | integer | |
| `is_active` | boolean | |

**Default seed data:**

| Parent | Sub-Product Types |
|--------|-------------------|
| Wrap | 3-Story Wrap, 4-Story Wrap, 5-Story Wrap, 5 Over 1 Wrap, 5 Over 2 Wrap |
| High Rise | High Rise with Adjacent Garage, High Rise Podium |

### 3.10 Pursuit Stages Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `name` | text | Stage name |
| `sort_order` | integer | Pipeline order |
| `color` | text | Hex color for UI badges and map pins |
| `is_active` | boolean | |

**Default seed data:**

| Sort | Name | Color |
|------|------|-------|
| 1 | Screening | #94A3B8 |
| 2 | Initial Analysis | #3B82F6 |
| 3 | LOI | #8B5CF6 |
| 4 | Under Contract | #F59E0B |
| 5 | Due Diligence | #F97316 |
| 6 | Closed | #10B981 |
| 7 | Passed | #EF4444 |
| 8 | Dead | #6B7280 |

### 3.11 Pursuit Stage History Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | |
| `pursuit_id` | uuid (FK) | |
| `stage_id` | uuid (FK) | Stage transitioned TO |
| `changed_at` | timestamptz | When the change occurred |
| `changed_by` | uuid (FK) | User who made the change |

This enables funnel reporting — count of pursuits entering/exiting each stage over time.

### 3.12 Users Table

Leverage Supabase Auth. Additional profile data:

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Matches auth.users.id |
| `full_name` | text | Display name |
| `email` | text | Email |
| `is_active` | boolean | |

---

## 4. Calculation Engine

All calculations are performed client-side in real-time as inputs change. Values are also persisted to the database for reporting and comparison queries.

### 4.1 Site & Density

```
site_area_acres = site_area_sf / 43,560
density_units_per_acre = total_units / site_area_acres
```

**Density Recommendation Engine:**
When the user enters site area and selects a product type, the system displays a recommended unit count range:
```
recommended_units_low = site_area_acres × product_type.density_low
recommended_units_high = site_area_acres × product_type.density_high
```
Display as: "Recommended range: 280–440 units (35–55 units/acre for Wrap product)"

If the user provides a FAR restriction input (optional field), calculate:
```
max_buildable_sf = site_area_sf × FAR
max_units_from_far = max_buildable_sf / avg_unit_sf_across_mix / (1 / efficiency_ratio)
```
Display as constraint: "FAR limit suggests max ~380 units"

### 4.2 Unit Mix Aggregations

```
Per unit type:
  total_sf = unit_count × avg_unit_sf
  effective_monthly_rent = rent_per_sf × avg_unit_sf  (or whole_dollar)
  effective_rent_per_sf = effective_monthly_rent / avg_unit_sf
  annual_revenue = unit_count × effective_monthly_rent × 12

Totals:
  total_units = Σ unit_count
  total_nrsf = Σ total_sf
  total_gbsf = total_nrsf / efficiency_ratio
  weighted_avg_unit_sf = total_nrsf / total_units
  weighted_avg_rent_per_sf = (Σ annual_revenue) / total_nrsf / 12
  gross_potential_rent = Σ annual_revenue
```

### 4.3 Revenue

```
gross_potential_rent     = (from unit mix)
other_income             = other_income_per_unit_month × total_units × 12
gross_potential_revenue  = gross_potential_rent + other_income
vacancy_loss             = gross_potential_revenue × vacancy_rate
net_revenue              = gross_potential_revenue - vacancy_loss
```

### 4.4 Budget

```
hard_cost         = hard_cost_per_nrsf × total_nrsf
hard_cost_per_gbsf = hard_cost / total_gbsf    (display metric)
land_cost         = (direct input)

IF use_detailed_soft_costs = false:
  soft_cost       = soft_cost_pct × hard_cost
  total_budget    = hard_cost + land_cost + soft_cost
ELSE:
  soft_cost       = Σ soft_cost_detail_amounts
  total_budget    = hard_cost + land_cost + soft_cost
  soft_cost_pct   = soft_cost / hard_cost  (display metric, reverse-calc)
```

**Key display metrics:**
```
cost_per_unit     = total_budget / total_units
cost_per_nrsf     = total_budget / total_nrsf
cost_per_gbsf     = total_budget / total_gbsf
land_cost_per_unit = land_cost / total_units
land_cost_per_sf   = land_cost / site_area_sf
```

### 4.5 Operating Expenses

```
Per-unit OpEx categories (annual):
  utilities_total        = opex_utilities × total_units
  repairs_maint_total    = opex_repairs_maintenance × total_units
  contract_services_total = opex_contract_services × total_units
  marketing_total        = opex_marketing × total_units
  general_admin_total    = opex_general_admin × total_units
  turnover_total         = opex_turnover × total_units
  misc_total             = opex_misc × total_units
  insurance_total        = opex_insurance × total_units

Payroll:
  per employee role = headcount × base_compensation × (1 + bonus_pct) × (1 + payroll_burden_pct)
  per contract line  = fixed_amount (no bonus or burden)
  payroll_total      = Σ employee_role_totals + Σ contract_line_amounts

Management Fee:
  mgmt_fee_total = mgmt_fee_pct × net_revenue

Property Tax (see 4.6):
  property_tax_total = (calculated)

total_opex = Σ all_category_totals + payroll_total + mgmt_fee_total + property_tax_total
opex_per_unit = total_opex / total_units
opex_ratio = total_opex / net_revenue
```

### 4.6 Property Tax

```
assessed_value = (tax_assessed_pct_hard × hard_cost)
               + (tax_assessed_pct_land × land_cost)
               + (tax_assessed_pct_soft × soft_cost)

property_tax = assessed_value × tax_mil_rate / 1000
property_tax_per_unit = property_tax / total_units
```

### 4.7 NOI & Yield

```
noi = net_revenue - total_opex
noi_per_unit = noi / total_units
noi_per_sf = noi / total_nrsf

unlevered_yield_on_cost = noi / total_budget
```

### 4.8 Sensitivity Tables

**Table 1: Rent Sensitivity**
Rows: Rent PSF varied by step deltas (e.g., -$0.10, -$0.05, base, +$0.05, +$0.10)
Output columns: Adjusted Rent PSF | GPR | NOI | YOC

**Table 2: Hard Cost Sensitivity**
Rows: Hard cost per NRSF varied by step deltas
Output columns: Adjusted HC/NRSF | Total Budget | YOC

**Table 3: Land Cost Sensitivity**
Rows: Land cost varied by step deltas
Output columns: Adjusted Land Cost | Total Budget | YOC

**Table 4 (2D Matrix): Rent PSF vs. Hard Cost**
A matrix with rent PSF steps as columns and hard cost steps as rows, cell value = YOC. Highlight the base case cell. Color-code cells (green = higher YOC, red = lower).

---

## 5. User Interface Specification

### 5.1 Design Principles

- **Dashboard-first**: All inputs and outputs for a One-Pager visible on a single page with no tab navigation required. Scrollable single-page layout with clearly defined sections/cards.
- **Inline editing**: All assumption inputs are editable in-place. Click to edit, auto-save on blur/Enter.
- **Real-time calculation**: All outputs update instantly as inputs change. No "calculate" button.
- **Information density**: Professional, compact layout that prioritizes data visibility. Minimal chrome.
- **Fast**: Optimistic UI updates. Debounced saves. No loading spinners for calculation changes.

### 5.2 Home / Dashboard (`/`)

**Layout:** Full-width page with two primary zones.

**Top Bar:**
- Application logo/name
- "New Pursuit" button (primary CTA)
- User avatar/name
- Link to Admin Settings

**Filter Bar:**
- Stage filter (multi-select dropdown with color badges)
- Region filter
- Date range filter (created date)
- Search (pursuit name, address)
- Toggle: Card View / Map View / Split View

**Card View:**
- Grid of Pursuit cards (responsive: 1–3 columns)
- Each card shows:
  - Pursuit name
  - Address (city, state)
  - Stage badge (color-coded)
  - Product type(s) of associated One-Pagers
  - Number of One-Pagers
  - Best YOC across One-Pagers (highlighted metric)
  - Created date
  - Last updated date
- Cards are sortable by: Name, Stage, Created Date, Updated Date, Best YOC
- Click card → navigate to Pursuit Detail

**Map View:**
- Full-width Mapbox map
- Pursuits displayed as pins, color-coded by stage
- Clicking a pin opens a popup with pursuit summary + link to detail
- Map respects active filters

**Split View:**
- Left: Card list (compact, single-column)
- Right: Map

### 5.3 Pursuit Detail (`/pursuits/:id`)

**Header Section:**
- Pursuit name (inline editable)
- Address with Mapbox autocomplete (inline editable)
- Stage dropdown (color-coded; changing triggers stage history log)
- Site area SF (inline editable) → shows calculated acres
- Region (dropdown or text)
- Created date, last updated, created by
- Small inline map showing location pin

**Tabs or Sections (scrollable):**

**Section: Executive Summary**
- Rich text editor (Tiptap) for exec summary
- Full-width card

**Section: Architecture Notes**
- Rich text editor (Tiptap) for architecture/planning team notes
- Full-width card

**Section: One-Pagers**
- List/grid of One-Pager cards for this pursuit (active by default; toggle to show archived)
- Each card shows: name, product type, total units, YOC, last updated
- "New One-Pager" button → opens creation dialog:
  - Name
  - Product type (dropdown)
  - Sub-product type (dropdown, filtered by product type)
  - Option to load defaults from Data Model template
- "Compare" button → opens side-by-side comparison view

**Section: One-Pager Comparison (inline or modal)**
- Select 2–4 One-Pagers to compare
- Side-by-side table with matched rows (see §6)
- Variance column for each pair

### 5.4 One-Pager Editor (`/pursuits/:id/one-pagers/:id`)

**This is the core screen.** Single-page scrollable dashboard layout. All sections visible simultaneously.

**Top Bar:**
- Breadcrumb: Pursuit Name > One-Pager Name
- One-Pager name (inline editable)
- Product type / Sub-product type display
- Action buttons: Export PDF | Export Excel | Duplicate | Archive | Delete
- Auto-save indicator

**Layout: Responsive grid of cards/panels. On large screens (1440px+), a 2-column or 3-column grid. Each card represents a section.**

---

#### Card: Site & Density Summary

| Input/Output | Field | Format |
|-------------|-------|--------|
| Display | Site Area (SF) | Inherited from Pursuit (link to edit) |
| Display | Site Area (Acres) | Calculated |
| Input | Total Units | Integer |
| Display | Density (Units/Acre) | Calculated |
| Display | Recommended Range | From product type density defaults |
| Input | FAR (optional) | Decimal |
| Display | FAR-Implied Max Units | Calculated (if FAR provided) |
| Input | Efficiency Ratio | Percentage (e.g., 85%) |
| Display | Total NRSF | Calculated from unit mix |
| Display | Total GBSF | NRSF / efficiency |

---

#### Card: Unit Mix

Table layout with inline editable cells:

| Unit Type | # Units | Avg SF | Total SF | Rent Mode | Rent/SF | Monthly Rent | Annual Revenue |
|-----------|---------|--------|----------|-----------|---------|--------------|----------------|
| Studio | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| 1 BR | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| 2 BR | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| 3 BR | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| PH | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| TH | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| Other | `[input]` | `[input]` | calc | `[toggle]` | `[input]` | calc | calc |
| **Total** | **calc** | **wtd avg** | **calc** | | **wtd avg** | **wtd avg** | **calc** |

- Rent Mode toggle: "$/SF" or "$" — switches between rent_per_sf and whole_dollar input
- Rows with 0 units can be collapsed/hidden
- "Add Row" for additional custom unit types (type = "other")

---

#### Card: Revenue Summary

| Line | $/Unit/Mo | Annual |
|------|-----------|--------|
| Gross Potential Rent | calc | calc |
| Other Income | `[input]` | calc |
| Gross Potential Revenue | calc | calc |
| Less: Vacancy & Loss | `[input %]` | calc |
| **Net Revenue** | **calc** | **calc** |

- Vacancy input is a single percentage field
- Display vacancy as both % and $ amount

---

#### Card: Development Budget

| Line | Assumption | Total | $/Unit | $/NRSF |
|------|-----------|-------|--------|--------|
| Hard Costs | `[input $/NRSF]` | calc | calc | — |
| Hard Costs (per GBSF) | — | — | — | calc |
| Land Cost | `[input $]` | — | calc | calc |
| Soft Costs (incl. carry) | `[input % of HC]` | calc | calc | calc |
| **Total Budget** | — | **calc** | **calc** | **calc** |

- Toggle for "Show Detailed Soft Costs" → expands to editable line items
- When detailed: soft cost % row becomes display-only (reverse-calculated as % of hard cost)
- Display land cost per SF of site area as additional metric

---

#### Card: Operating Expenses

| Category | $/Unit/Year | Annual Total |
|----------|------------|--------------|
| Utilities | `[input]` | calc |
| Repairs & Maintenance | `[input]` | calc |
| Contract Services | `[input]` | calc |
| Marketing | `[input]` | calc |
| General & Administrative | `[input]` | calc |
| Turnover | `[input]` | calc |
| Miscellaneous | `[input]` | calc |
| Insurance | `[input]` | calc |
| Payroll & Related | (see detail) | calc |
| Management Fee | `[input %]` | calc |
| Property Tax | (see detail) | calc |
| **Total Operating Expenses** | **calc** | **calc** |

- Payroll row is expandable → shows payroll detail sub-table
- Property Tax row is expandable → shows tax calculation detail
- Display OpEx ratio (total opex / net revenue) as summary metric

---

#### Card: Payroll Detail (expandable or sub-card)

| Type | Role | Headcount | Base Comp | Bonus % | Burdened Total |
|------|------|-----------|-----------|---------|----------------|
| Employee | `[input]` | `[input]` | `[input]` | `[input]` | calc |
| Employee | `[input]` | `[input]` | `[input]` | `[input]` | calc |
| Contract | `[input]` | — | — | — | `[input fixed $]` |
| **Payroll & Related** | | | | Burden: `[input %]` | **calc** |

- "Add Employee Role" and "Add Contract Line" buttons
- Employee lines: headcount × base × (1 + bonus%) × (1 + burden%) 
- Contract lines: fixed amount only (no bonus, no burden applied)
- Delete role (X button per row)
- Roles can be pre-populated from Data Model payroll defaults

---

#### Card: Property Tax Detail (expandable or sub-card)

| Component | Input | Value |
|-----------|-------|-------|
| Mil Rate | `[input]` | — |
| Assessed % — Hard Costs | `[input %]` | calc $ |
| Assessed % — Land | `[input %]` | calc $ |
| Assessed % — Soft Costs | `[input %]` | calc $ |
| **Total Assessed Value** | — | **calc** |
| **Annual Property Tax** | — | **calc** |
| Property Tax / Unit | — | calc |

---

#### Card: Returns Summary (prominent, highlighted)

This card should be visually prominent — larger type, accent color background, positioned at the top-right or spanning the full width.

| Metric | Value |
|--------|-------|
| **Unlevered Yield on Cost** | **calc %** (large, bold) |
| NOI | calc $ |
| NOI / Unit | calc $ |
| NOI / SF | calc $ |
| Total Budget | calc $ |
| Cost / Unit | calc $ |
| Cost / NRSF | calc $ |
| Cost / GBSF | calc $ |
| Wtd Avg Rent / SF | calc $ |
| OpEx Ratio | calc % |

---

#### Card: Sensitivity Analysis

Three tables as described in §4.8, plus the 2D rent vs. hard cost matrix.

- Each table is a compact grid
- Base case row/column highlighted
- YOC cells color-coded (green gradient for higher, red for lower)
- Sensitivity step values are editable in the table headers

---

#### Card: Notes (bottom of page)

- Two rich-text areas visible:
  1. Executive Summary (synced with Pursuit-level exec_summary — editable here, saves to Pursuit)
  2. Architecture/Planning Notes (synced with Pursuit-level arch_notes)

---

### 5.5 Admin Settings (`/admin`)

**Product Types & Sub-Types:**
- CRUD table for product types with density range inputs
- Nested CRUD for sub-types under each product type
- Drag-to-reorder sort

**Data Model Templates:**
- List of templates, filterable by product type and region
- Edit view mirrors the One-Pager input structure but for default values
- Includes payroll role defaults

**Pursuit Stages:**
- CRUD table with name, sort order, color picker
- Drag-to-reorder

**Tax Regions:**
- Quick-access view of region-specific tax assumptions
- Shortcut to create/edit Data Model templates filtered to tax fields

---

## 6. Comparison Features

### 6.1 Intra-Pursuit Comparison (Side-by-Side)

Accessed from Pursuit Detail. User selects 2–4 One-Pagers.

**Layout:** Vertical table with assumption/metric labels in the left column and One-Pager values in subsequent columns. Final column(s) show variance (absolute and/or percentage) between selected scenarios.

**Sections (matching One-Pager card structure):**
- Site & Density
- Unit Mix (summarized: total units, wtd avg SF, wtd avg rent/SF)
- Revenue (GPR, Other Income, Vacancy %, Net Revenue)
- Budget (HC/NRSF, Land, Soft Cost %, Total Budget, Cost/Unit)
- OpEx (Total OpEx, OpEx/Unit, OpEx Ratio)
- Returns (YOC, NOI, NOI/Unit)

**Features:**
- Highlight best/worst value per row (green/red)
- "Winner" badge on the One-Pager with highest YOC
- Export comparison as PDF

### 6.2 Cross-Pursuit Comparison

Accessed from `/compare`. User selects One-Pagers from across different Pursuits.

**Layout:** Horizontal table:
- Rows: One-Pagers (grouped by Pursuit)
- Columns: Key metrics and assumptions

**Columns:**
Pursuit | One-Pager | Product Type | Region | Units | Density | Rent/SF | HC/NRSF | Land Cost | Total Budget | Cost/Unit | GPR | Net Revenue | NOI | YOC

**Features:**
- Sortable by any column
- Filterable by region, product type, stage, date range
- Group by Pursuit or flatten
- Export as Excel

---

## 7. Mapping Features

### 7.1 Technology

Mapbox GL JS via `react-map-gl` wrapper.

### 7.2 Address Autocomplete

On the Pursuit address field, integrate Mapbox Search / Geocoding API:
- As user types, display address suggestions dropdown
- On selection, auto-populate: address, city, state, county, zip, latitude, longitude
- Support manual coordinate entry as fallback

### 7.3 Pursuit Map (Home Dashboard)

- Display all Pursuits as map markers
- Marker color = Pursuit stage color
- Marker click → popup with:
  - Pursuit name
  - Address
  - Stage badge
  - Best YOC
  - Unit count range across One-Pagers
  - "View Pursuit" link
- Cluster markers at low zoom levels
- Map respects all active filters from the dashboard filter bar

---

## 8. Import / Export

### 8.1 Excel Import

**Purpose:** Bulk-input assumptions for a new One-Pager from a standardized Excel template.

**Approach:**
- Provide a downloadable "SLR One-Pager Import Template.xlsx" with:
  - Named cells for every input field
  - Validation rules and dropdowns matching the application's enums
  - Instructions sheet
- Upload flow:
  1. User clicks "Import from Excel" on a Pursuit
  2. Selects file
  3. System parses named cells, validates data
  4. Preview screen shows parsed values with any warnings/errors
  5. User confirms → creates new One-Pager with imported values

**Technology:** SheetJS (xlsx) for parsing client-side.

### 8.2 PDF Export

**Purpose:** Branded, shareable feasibility one-pager for internal distribution and capital partner review.

**Layout (target: single landscape page if possible, 2 pages max):**

**Page 1:**
- SLR logo + "Development Feasibility Analysis" header
- Pursuit name, address, date
- Returns summary (YOC prominently displayed)
- Unit mix table
- Revenue summary
- Budget summary
- OpEx summary
- Key metrics sidebar (Cost/Unit, NOI/Unit, Rent/SF, etc.)

**Page 2 (if needed):**
- Sensitivity tables
- Executive summary text
- Architecture notes (optional inclusion toggle)
- Small site map image

**Technology:** `@react-pdf/renderer` for client-side PDF generation. This avoids Vercel serverless size limits and timeout constraints associated with headless browser approaches.

### 8.3 Excel Export

**Purpose:** Formatted workbook mirroring the on-screen layout for users who want to manipulate data in Excel.

**Workbook structure:**
- Sheet 1: "Summary" — mirrors the One-Pager dashboard layout
- Sheet 2: "Unit Mix" — detailed unit mix table
- Sheet 3: "OpEx & Payroll" — operating expense detail + payroll table
- Sheet 4: "Sensitivity" — all sensitivity tables
- Sheet 5: "Assumptions" — flat list of all inputs for reference

**Technology:** ExcelJS for client-side generation with cell formatting, styling, merged cells, and number formatting.

---

## 9. Technical Architecture

### 9.1 Frontend

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Component Library | shadcn/ui |
| State Management | React Query (TanStack Query) for server state; Zustand for local UI state |
| Rich Text | Tiptap (ProseMirror-based) |
| Maps | Mapbox GL JS via react-map-gl |
| Charts/Viz | Recharts or lightweight custom (for sensitivity heatmaps) |
| Tables | TanStack Table for comparison views |
| Forms | React Hook Form + Zod validation |
| PDF Generation | @react-pdf/renderer (client-side) |
| Excel I/O | ExcelJS for formatted export; SheetJS (xlsx) for import parsing |

### 9.2 Backend

| Layer | Technology |
|-------|-----------|
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/magic link at launch; Microsoft Entra ID SSO as fast-follow for seamless internal login) |
| API | Supabase client SDK (direct DB queries via PostgREST) |
| Storage | Supabase Storage (for export files, import templates) |
| Edge Functions | Supabase Edge Functions (for server-side processing if needed) |
| Hosting | Vercel |

### 9.3 Database Policies

- See §9.6 Security for RLS and access policies

### 9.4 Database Triggers

**Calculated Value Triggers:**
To prevent data drift when calculation logic is updated in future deployments, key calculated fields on the `one_pagers` table (see §9.6) should be recomputed at the PostgreSQL layer via triggers, not solely by the client.

- Trigger on `one_pagers` INSERT/UPDATE: recalculates budget-derived fields (hard_cost, soft_cost, total_budget, cost_per_unit)
- Trigger on `one_pager_unit_mix` INSERT/UPDATE/DELETE: recalculates NRSF, GBSF, GPR, weighted avg rent, and cascades to NOI/YOC on the parent one_pager
- Trigger on `one_pager_payroll` INSERT/UPDATE/DELETE: recalculates payroll total and cascades to total opex, NOI, YOC on parent one_pager
- Trigger on `one_pager_soft_cost_detail` INSERT/UPDATE/DELETE: recalculates soft cost total when detailed mode is active

The client still performs real-time calculations for instant UI feedback, but the database is the source of truth for stored values.

**Text Sanitization Trigger:**
A Postgres trigger on all tables with text input fields (pursuits, one_pagers, product_types, etc.) applies `TRIM()` to text columns on INSERT/UPDATE. This prevents grouping, sorting, and comparison bugs from trailing whitespace. Additionally, Zod schemas on the client should include `.trim()` on all text fields as a first line of defense.

### 9.5 Real-Time & Presence

- Use Supabase Realtime subscriptions on Pursuit and One-Pager tables so multiple users see updates
- Implement a lightweight **presence indicator** on the One-Pager editor: when a user opens a One-Pager, broadcast their presence via Supabase Realtime Presence. Display a small avatar/badge (e.g., "Jane is also viewing") to alert users when someone else is actively on the same record. This prevents silent overwrites with the last-write-wins auto-save model.
- Optimistic updates for all input changes

### 9.6 Security

- Enable Row Level Security (RLS) on all tables
- Policy: Authenticated users can read/write all rows (single-team application)
- Future: Restrict by organization_id if multi-tenant needed
- No public API exposure
- Environment variables for all secrets

### 9.7 API Design

Leverage Supabase's auto-generated REST API. Key queries:

```sql
-- Home dashboard: Pursuits with best YOC
SELECT p.*, 
  (SELECT MAX(/* YOC calculation or stored value */) 
   FROM one_pagers op WHERE op.pursuit_id = p.id) as best_yoc,
  (SELECT COUNT(*) FROM one_pagers op WHERE op.pursuit_id = p.id) as one_pager_count
FROM pursuits p
WHERE p.is_archived = false
ORDER BY p.updated_at DESC;

-- One-Pager with all related data
SELECT op.*, 
  json_agg(DISTINCT um.*) as unit_mix,
  json_agg(DISTINCT pr.*) as payroll_roles,
  json_agg(DISTINCT scd.*) as soft_cost_details
FROM one_pagers op
LEFT JOIN one_pager_unit_mix um ON um.one_pager_id = op.id
LEFT JOIN one_pager_payroll pr ON pr.one_pager_id = op.id
LEFT JOIN one_pager_soft_cost_detail scd ON scd.one_pager_id = op.id
WHERE op.id = :id
GROUP BY op.id;

-- Funnel report
SELECT 
  ps.name as stage,
  COUNT(*) as count,
  date_trunc('month', psh.changed_at) as month
FROM pursuit_stage_history psh
JOIN pursuit_stages ps ON ps.id = psh.stage_id
GROUP BY ps.name, ps.sort_order, date_trunc('month', psh.changed_at)
ORDER BY ps.sort_order, month;
```

### 9.8 Stored Calculated Values

While calculations happen client-side for instant UI feedback, store key calculated outputs on the `one_pagers` table for efficient querying (dashboard cards, comparison, sorting). These values are authoritatively maintained by database triggers (see §9.4):

| Column | Type | Description |
|--------|------|-------------|
| `calc_total_nrsf` | numeric | |
| `calc_total_gbsf` | numeric | |
| `calc_gpr` | numeric | |
| `calc_net_revenue` | numeric | |
| `calc_total_budget` | numeric | |
| `calc_hard_cost` | numeric | |
| `calc_soft_cost` | numeric | |
| `calc_total_opex` | numeric | |
| `calc_noi` | numeric | |
| `calc_yoc` | numeric | |
| `calc_cost_per_unit` | numeric | |
| `calc_noi_per_unit` | numeric | |

These are updated whenever the One-Pager is saved.

---

## 10. Deployment & Infrastructure

### 10.1 Vercel Configuration

- Deploy via Vercel connected to Git repository
- Custom domain: `[subdomain].streetlightsresidential.com` (or similar)
- Environment variables for Supabase URL, anon key, Mapbox token

### 10.2 Supabase Configuration

- Single Supabase project
- Enable RLS
- Enable Realtime on key tables
- Storage bucket for exports and import templates
- Edge Functions for any server-side processing

### 10.3 Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    (server-side only)
NEXT_PUBLIC_MAPBOX_TOKEN=
```

---

## 11. Implementation Phases

### Phase 1: Foundation (MVP)
- Supabase schema setup (all tables, RLS, seed data)
- Authentication (Supabase Auth)
- Admin: Product Types, Sub-Types, Pursuit Stages (CRUD)
- Pursuit CRUD (name, address, stage — no map yet)
- One-Pager CRUD with full calculation engine
- One-Pager editor: all input cards, all calculations, returns summary
- Dashboard: pursuit card list with filters
- Auto-save

### Phase 2: Polish & Collaboration
- Rich text editors (exec summary, arch notes)
- Mapbox address autocomplete + geocoding
- Dashboard map view with stage-colored pins
- Data Model templates (admin CRUD + load-on-create)
- Payroll templates
- Regional tax defaults
- Density recommendation engine
- Detailed soft cost toggle

### Phase 3: Comparison & Export
- Intra-pursuit side-by-side comparison
- Cross-pursuit comparison table
- Sensitivity analysis tables + 2D matrix
- PDF export (branded layout)
- Excel export (formatted workbook)
- Excel import (template + parser)

### Phase 4: Reporting & Refinement
- Pursuit stage history tracking + funnel report
- Dashboard analytics (YOC distribution, deal flow)
- Split view (cards + map)
- Performance optimization
- Mobile responsiveness
- Branding/theming refinement

---

## 12. File & Folder Structure (Recommended)

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                          # Home dashboard
│   ├── pursuits/
│   │   ├── [id]/
│   │   │   ├── page.tsx                  # Pursuit detail
│   │   │   └── one-pagers/
│   │   │       └── [onePagerId]/
│   │   │           └── page.tsx          # One-Pager editor
│   ├── compare/
│   │   └── page.tsx                      # Cross-pursuit comparison
│   ├── admin/
│   │   ├── page.tsx                      # Admin overview
│   │   ├── product-types/page.tsx
│   │   ├── data-models/page.tsx
│   │   ├── stages/page.tsx
│   │   └── tax-regions/page.tsx
│   └── auth/
│       ├── login/page.tsx
│       └── callback/route.ts
├── components/
│   ├── ui/                               # shadcn/ui components
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── pursuits/
│   │   ├── PursuitCard.tsx
│   │   ├── PursuitForm.tsx
│   │   ├── PursuitMap.tsx
│   │   └── StageSelect.tsx
│   ├── one-pager/
│   │   ├── OnePagerEditor.tsx            # Main editor layout
│   │   ├── cards/
│   │   │   ├── SiteDensityCard.tsx
│   │   │   ├── UnitMixCard.tsx
│   │   │   ├── RevenueCard.tsx
│   │   │   ├── BudgetCard.tsx
│   │   │   ├── OpExCard.tsx
│   │   │   ├── PayrollCard.tsx
│   │   │   ├── PropertyTaxCard.tsx
│   │   │   ├── ReturnsSummaryCard.tsx
│   │   │   ├── SensitivityCard.tsx
│   │   │   └── NotesCard.tsx
│   │   ├── UnitMixTable.tsx
│   │   └── InlineInput.tsx
│   ├── comparison/
│   │   ├── SideBySideComparison.tsx
│   │   └── CrossPursuitTable.tsx
│   └── shared/
│       ├── RichTextEditor.tsx
│       ├── AddressAutocomplete.tsx
│       └── ExportButtons.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts                      # Generated types
│   ├── calculations/
│   │   ├── unitMix.ts
│   │   ├── revenue.ts
│   │   ├── budget.ts
│   │   ├── opex.ts
│   │   ├── propertyTax.ts
│   │   ├── returns.ts
│   │   ├── sensitivity.ts
│   │   └── index.ts                      # Unified calc engine
│   ├── export/
│   │   ├── pdf.ts
│   │   ├── excel.ts
│   │   └── template.ts
│   ├── import/
│   │   └── excelImport.ts
│   └── constants.ts
├── hooks/
│   ├── usePursuit.ts
│   ├── useOnePager.ts
│   ├── useAutoSave.ts
│   ├── useCalculations.ts
│   └── useDataModel.ts
├── types/
│   ├── pursuit.ts
│   ├── onePager.ts
│   ├── unitMix.ts
│   ├── admin.ts
│   └── index.ts
└── styles/
    └── globals.css
```

---

## 13. Key UX Interactions

### 13.1 Creating a New One-Pager

1. User navigates to Pursuit Detail
2. Clicks "New One-Pager"
3. Modal/dialog appears:
   - Name input
   - Product Type dropdown
   - Sub-Product Type dropdown (filtered by product type)
   - "Load defaults from:" dropdown showing matching Data Model templates (filtered by product type + region)
   - Checkbox: "Copy from existing One-Pager" → dropdown of this pursuit's existing One-Pagers
4. On create:
   - If loading from Data Model: all assumption fields populated with template defaults, payroll roles pre-populated
   - If copying: all values cloned from selected One-Pager
   - If neither: all fields blank/zero
5. Navigates to One-Pager Editor

### 13.2 Inline Input Editing

- All numeric inputs use a custom `InlineInput` component
- Display: formatted value (e.g., "$145.00", "7.00%", "320")
- On click/focus: raw numeric input with appropriate step/precision
- On blur/Enter: validates, formats, triggers auto-save
- On Escape: reverts to previous value
- Visual feedback: subtle highlight on changed fields since last save

### 13.3 Auto-Save

- 300ms debounce after last input change
- Save indicator in top bar: "Saving..." → "Saved" → fades
- On save: persist inputs; database triggers recalculate all stored calc fields (see §9.4)
- Conflict resolution: last-write-wins with presence indicators (see §9.5) to minimize simultaneous edits

### 13.4 Density Recommendation

When user changes total_units, site_area_sf, or product_type:
- Calculate implied density
- Display below the Total Units input:
  - If within recommended range: "42 units/acre — within typical range for Wrap (35–55)"
  - If below range: "18 units/acre — below typical range for Wrap (35–55)" (amber warning)
  - If above range: "62 units/acre — above typical range for Wrap (35–55)" (amber warning)
- Optional: "Suggest units" button auto-fills total_units to midpoint of recommended range

---

## 14. Non-Functional Requirements

### 14.1 Performance
- Page load: < 2 seconds
- Calculation update: < 50ms (client-side, synchronous)
- Auto-save round-trip: < 500ms
- Dashboard with 100+ pursuits: smooth scroll, lazy-loaded cards

### 14.2 Browser Support
- Chrome, Safari, Edge (latest versions)
- Desktop-first (1280px+ primary viewport)
- Tablet-responsive (768px+)
- Mobile: read-only/view-only acceptable

### 14.3 Data Integrity
- All monetary values stored as numeric with appropriate precision (no floating point)
- All percentages stored as decimals (0.0700 not 7.00)
- Input validation: non-negative numbers for costs/rents, 0–1 range for percentages
- All text inputs validated with Zod `.trim()` on the client; Postgres TRIM trigger as safety net (see §9.4)
- Foreign key constraints with cascading deletes on One-Pager child tables

### 14.4 Security
- Supabase RLS enabled on all tables
- Authenticated access only
- No public API exposure
- Environment variables for all secrets

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **NRSF** | Net Rentable Square Footage — total leasable area |
| **GBSF** | Gross Building Square Footage — total building area including common areas, corridors, mechanical |
| **Efficiency Ratio** | NRSF / GBSF — typically 0.80–0.90 for multifamily |
| **GPR** | Gross Potential Rent — total rent if 100% occupied at market rents |
| **NOI** | Net Operating Income — net revenue minus operating expenses |
| **YOC** | Yield on Cost — NOI / Total Development Cost (unlevered return metric) |
| **Mil Rate** | Property tax rate expressed in mills (1 mil = $1 per $1,000 of assessed value) |
| **FAR** | Floor Area Ratio — ratio of total building floor area to site area |
| **Pursuit** | A real estate site or deal opportunity being evaluated |
| **One-Pager** | A single feasibility scenario for a Pursuit |
| **Data Model** | A template of default assumptions by product type and region |

---

## Appendix B: Default OpEx Assumptions (Example Seed Data)

These are placeholder values for initial Data Model templates. Actual defaults should be set by SLR team in Admin.

| Category | $/Unit/Year (Garden) | $/Unit/Year (Wrap) | $/Unit/Year (High Rise) |
|----------|---------------------|-------------------|------------------------|
| Utilities | $1,200 | $1,400 | $1,800 |
| Repairs & Maintenance | $800 | $900 | $1,100 |
| Contract Services | $600 | $700 | $900 |
| Marketing | $400 | $500 | $600 |
| G&A | $500 | $600 | $750 |
| Turnover | $300 | $350 | $400 |
| Miscellaneous | $200 | $250 | $300 |
| Insurance | $700 | $800 | $1,000 |
| Management Fee | 3.0% | 3.0% | 3.0% |

---

## Appendix C: Sensitivity Table Configuration Defaults

| Sensitivity Type | Default Steps |
|-----------------|---------------|
| Rent PSF | -$0.15, -$0.10, -$0.05, Base, +$0.05, +$0.10, +$0.15 |
| Hard Cost / NRSF | -$15, -$10, -$5, Base, +$5, +$10, +$15 |
| Land Cost | -$2M, -$1M, -$500K, Base, +$500K, +$1M, +$2M |

Steps are editable per One-Pager.