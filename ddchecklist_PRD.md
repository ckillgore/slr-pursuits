# Pursuit Diligence Checklist — Feature Specification & Implementation Guide

**StreetLights Residential • Pursuit Application**
**February 2026 • v1.0**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Data Model](#2-data-model)
3. [Template Management System](#3-template-management-system)
4. [Default Template Content](#4-default-template-content)
5. [User Interface Specifications](#5-user-interface-specifications)
6. [Box Integration](#6-box-integration)
7. [External User Access](#7-external-user-access)
8. [Implementation Phases](#8-implementation-phases)
9. [Technical Notes](#9-technical-notes)

---

## 1. Executive Summary

This document specifies the Diligence Checklist feature for the SLR Pursuit application. The feature provides a structured, template-driven task management system that guides the development team through the full pre-development lifecycle from LOI execution through construction start. It replaces ad-hoc spreadsheets and email-based tracking with a centralized, auditable system that integrates with the existing pursuit data model in Supabase and connects to Box for document management.

**Key design decisions:**

- **Three-level hierarchy:** Phase → Task → Checklist Item (no deeper nesting)
- **Soft dependencies** between tasks (visual indicators, no hard blocking)
- **Relative-to-milestone due dates** in templates, overridable to fixed dates per pursuit
- **Six-state status progression:** Not Started → In Progress → In Review → Complete → N/A → Blocked
- **Admin-only master template editing;** team members edit pursuit-level copies only
- **Manual Box file linking** (browse/search and attach to tasks)
- **In-app notifications only** (no email)
- **External user access** for consultants and third parties (scoped to assigned tasks only)
- **Core deal team of 3–5 people** per pursuit with individual task assignment
- Pursuits already have a **region/market field** that will be leveraged for cross-pursuit filtering

---

## 2. Data Model

All tables use UUID primary keys and standard `created_at` / `updated_at` timestamps. Row Level Security (RLS) policies are defined in Section 2.7.

### 2.1 `checklist_templates`

Master templates that can be applied to pursuits. Only admins can create or edit these.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key, default `gen_random_uuid()` |
| `name` | text | No | Template name (e.g., "Standard Ground-Up Multifamily") |
| `description` | text | Yes | Description of when to use this template |
| `is_default` | boolean | No | If true, auto-suggested when creating new pursuits |
| `is_active` | boolean | No | Soft delete flag. Inactive templates cannot be applied to new pursuits |
| `version` | integer | No | Incremented on each edit for change tracking |
| `created_by` | uuid (FK) | No | References `auth.users`. The admin who created the template |
| `created_at` | timestamptz | No | Auto-set on creation |
| `updated_at` | timestamptz | No | Auto-updated via trigger |

### 2.2 `checklist_template_phases`

Phase groupings within a template. Phases define the top-level organizational structure.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `template_id` | uuid (FK) | No | References `checklist_templates.id` (CASCADE delete) |
| `name` | text | No | Phase name (e.g., "Due Diligence") |
| `description` | text | Yes | Phase description and guidance notes |
| `sort_order` | integer | No | Display order within the template |
| `default_milestone` | text | Yes | Which milestone this phase's tasks are relative to (e.g., "dd_expiration") |
| `color` | text | Yes | Optional hex color for visual identification in timeline views |

### 2.3 `checklist_template_tasks`

Individual tasks within a phase. Tasks are the primary unit of work assignment, status tracking, and accountability.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `phase_id` | uuid (FK) | No | References `checklist_template_phases.id` (CASCADE) |
| `name` | text | No | Task name |
| `description` | text | Yes | Detailed description, guidance, and lessons learned |
| `sort_order` | integer | No | Display order within the phase |
| `default_status` | text | No | Always "not_started" for template tasks |
| `relative_due_days` | integer | Yes | Days relative to milestone (negative = before, positive = after) |
| `relative_milestone` | text | Yes | Overrides phase `default_milestone` if set |
| `depends_on_task_id` | uuid (FK) | Yes | Soft dependency — references another template task in same template |
| `is_critical_path` | boolean | No | If true, highlighted in timeline views as critical |
| `external_assignable` | boolean | No | If true, this task can be assigned to external users |

### 2.4 `checklist_template_checklist_items`

Sub-steps within a task. These are lightweight checkboxes, not full task entities. They do not have their own assignee, due date, or status — they simply break a task into discrete verification steps.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `task_id` | uuid (FK) | No | References `checklist_template_tasks.id` (CASCADE) |
| `label` | text | No | Checklist item text |
| `sort_order` | integer | No | Display order within the task |

### 2.5 Pursuit Instance Tables

When a template is applied to a pursuit, the entire structure is deep-copied into pursuit-specific tables. This allows the team to customize the checklist per deal without affecting the master template.

#### `pursuit_checklist_instances`

Tracks which template was applied and when. A pursuit can only have one active checklist instance.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `pursuit_id` | uuid (FK) | No | References `pursuits.id` (CASCADE). Unique constraint. |
| `source_template_id` | uuid (FK) | Yes | Template this was copied from (null if built manually) |
| `source_template_version` | integer | Yes | Version of template at time of copy |
| `applied_at` | timestamptz | No | When the template was applied |
| `applied_by` | uuid (FK) | No | Who applied the template |

#### `pursuit_milestones`

Milestone dates that drive relative due date calculations. When a milestone date changes, all task due dates referencing that milestone recalculate automatically via a database function.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `pursuit_id` | uuid (FK) | No | References `pursuits.id` (CASCADE) |
| `milestone_key` | text | No | Machine key: `loi_execution`, `dd_expiration`, `hard_deposit`, `closing`, `construction_start`, `first_unit_delivery` |
| `milestone_label` | text | No | Display name (e.g., "DD Expiration Date") |
| `target_date` | date | Yes | Estimated or confirmed date |
| `is_confirmed` | boolean | No | Whether this date is confirmed vs. estimated |
| `sort_order` | integer | No | Display order |

#### `pursuit_checklist_phases`

Pursuit-level copy of phases. Same structure as template phases plus pursuit-specific fields.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `instance_id` | uuid (FK) | No | References `pursuit_checklist_instances.id` (CASCADE) |
| `pursuit_id` | uuid (FK) | No | Denormalized for query performance |
| `source_phase_id` | uuid | Yes | Original template phase ID for reference |
| `name` | text | No | Phase name (editable per pursuit) |
| `description` | text | Yes | Phase description (editable per pursuit) |
| `sort_order` | integer | No | Display order |
| `default_milestone` | text | Yes | Milestone key for this phase's tasks |
| `color` | text | Yes | Hex color for timeline |

#### `pursuit_checklist_tasks`

The core task entity where all user interaction happens. This is the most important table in the system.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `phase_id` | uuid (FK) | No | References `pursuit_checklist_phases.id` (CASCADE) |
| `pursuit_id` | uuid (FK) | No | Denormalized for query performance and RLS |
| `source_task_id` | uuid | Yes | Original template task ID |
| `name` | text | No | Task name (editable) |
| `description` | text | Yes | Rich text description (stored as HTML) |
| `sort_order` | integer | No | Display order within phase |
| `status` | text | No | Enum: `not_started`, `in_progress`, `in_review`, `complete`, `not_applicable`, `blocked` |
| `assigned_to` | uuid (FK) | Yes | References `auth.users` or `external_users.id` |
| `assigned_to_type` | text | No | Enum: `internal`, `external`. Default: `internal` |
| `due_date` | date | Yes | Calculated or manually set due date |
| `due_date_is_manual` | boolean | No | If true, `due_date` was manually set and won't recalculate |
| `relative_due_days` | integer | Yes | Days offset from milestone |
| `relative_milestone` | text | Yes | Milestone key this task is relative to |
| `depends_on_task_id` | uuid (FK) | Yes | Soft dependency on another pursuit task |
| `is_critical_path` | boolean | No | Highlighted in timeline views |
| `external_assignable` | boolean | No | Can this task be assigned to external users |
| `completed_at` | timestamptz | Yes | Set when status changes to `complete` |
| `completed_by` | uuid (FK) | Yes | Who marked it complete |
| `created_at` | timestamptz | No | Auto-set |
| `updated_at` | timestamptz | No | Auto-updated via trigger |

#### `pursuit_checklist_items`

Pursuit-level checklist sub-items within tasks. Simple checkboxes with completion tracking.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `task_id` | uuid (FK) | No | References `pursuit_checklist_tasks.id` (CASCADE) |
| `label` | text | No | Checklist item text (editable) |
| `is_checked` | boolean | No | Default false |
| `checked_by` | uuid (FK) | Yes | Who checked it |
| `checked_at` | timestamptz | Yes | When it was checked |
| `sort_order` | integer | No | Display order |

### 2.6 Supporting Tables

#### `task_notes`

Rich text notes attached to tasks. Supports inline note creation and threaded discussion.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `task_id` | uuid (FK) | No | References `pursuit_checklist_tasks.id` (CASCADE) |
| `author_id` | uuid (FK) | No | References `auth.users` or `external_users.id` |
| `author_type` | text | No | Enum: `internal`, `external` |
| `content` | text | No | Rich text content stored as HTML |
| `parent_note_id` | uuid (FK) | Yes | For threaded replies, references `task_notes.id` |
| `created_at` | timestamptz | No | Auto-set |
| `updated_at` | timestamptz | No | Auto-updated |

#### `task_file_links`

Links between tasks and Box files. Stores Box file metadata for display without requiring a Box API call on every page load.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `task_id` | uuid (FK) | No | References `pursuit_checklist_tasks.id` (CASCADE) |
| `box_file_id` | text | No | Box file ID for API operations |
| `file_name` | text | No | Cached file name for display |
| `file_type` | text | Yes | Cached file extension/type |
| `file_size` | bigint | Yes | Cached file size in bytes |
| `box_url` | text | No | Direct URL to file in Box |
| `linked_by` | uuid (FK) | No | Who attached the file |
| `linked_at` | timestamptz | No | When the file was attached |
| `description` | text | Yes | Optional note about what this file is |

#### `task_activity_log`

Immutable audit trail of all task changes. Powers the activity feed and provides accountability.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `task_id` | uuid (FK) | No | References `pursuit_checklist_tasks.id` (CASCADE) |
| `pursuit_id` | uuid (FK) | No | Denormalized for efficient querying |
| `user_id` | uuid (FK) | No | Who performed the action |
| `action` | text | No | Enum: `status_changed`, `assigned`, `note_added`, `file_linked`, `file_removed`, `due_date_changed`, `task_edited`, `checklist_item_toggled` |
| `old_value` | jsonb | Yes | Previous value (for changes) |
| `new_value` | jsonb | Yes | New value (for changes) |
| `created_at` | timestamptz | No | Immutable timestamp |

#### `external_users`

External users (consultants, attorneys, engineers) who can access specific assigned tasks. These users authenticate via a separate mechanism (magic link or simple password) and have extremely limited platform access.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `email` | text | No | Unique. Used for magic link authentication |
| `name` | text | No | Display name |
| `company` | text | Yes | Company/firm name |
| `role` | text | Yes | Role description (e.g., "Civil Engineer", "Zoning Attorney") |
| `is_active` | boolean | No | Can be deactivated to revoke all access |
| `invited_by` | uuid (FK) | No | Internal user who created this external user |
| `last_login_at` | timestamptz | Yes | Last access timestamp |
| `created_at` | timestamptz | No | Auto-set |

#### `notifications`

In-app notification queue for task assignments, due date reminders, and status changes.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid (PK) | No | Primary key |
| `user_id` | uuid (FK) | No | Recipient (internal user) |
| `pursuit_id` | uuid (FK) | Yes | Related pursuit for navigation |
| `task_id` | uuid (FK) | Yes | Related task for deep linking |
| `type` | text | No | Enum: `task_assigned`, `due_date_approaching`, `due_date_overdue`, `status_changed`, `note_added`, `file_linked` |
| `title` | text | No | Notification headline |
| `body` | text | Yes | Notification detail text |
| `is_read` | boolean | No | Default false |
| `read_at` | timestamptz | Yes | When marked as read |
| `created_at` | timestamptz | No | Auto-set |

### 2.7 Row Level Security Policies

All checklist tables must have RLS enabled. The following policies govern access:

- **Template tables** (`checklist_templates`, `*_phases`, `*_tasks`, `*_checklist_items`): All authenticated internal users can SELECT. Only users with admin role can INSERT, UPDATE, DELETE.
- **Pursuit instance tables:** Internal users who are members of the pursuit's team can SELECT, INSERT, UPDATE. Pursuit team membership should be determined by a `pursuit_team_members` junction table or by matching the user's region assignment.
- **External user access:** External users can only SELECT `pursuit_checklist_tasks` WHERE `assigned_to` = their ID AND `assigned_to_type` = 'external'. They can INSERT into `task_notes` and `task_file_links` for their assigned tasks only. They cannot UPDATE task status or other fields — only internal users can change status.
- **`task_activity_log`:** INSERT only via database triggers (not directly by users). SELECT follows same rules as the parent task.
- **`notifications`:** Users can only SELECT and UPDATE (mark as read) their own notifications.

### 2.8 Database Functions & Triggers

The following functions should be implemented as Supabase database functions:

- **`apply_template_to_pursuit(pursuit_id, template_id)`:** Deep-copies the template structure into pursuit instance tables. Creates `pursuit_milestones` with null dates. Returns the new instance ID.
- **`recalculate_due_dates(pursuit_id)`:** Called via trigger when any `pursuit_milestone.target_date` changes. Recalculates `due_date` for all tasks where `due_date_is_manual = false` by adding `relative_due_days` to the referenced milestone date.
- **`log_task_activity()`:** Trigger function on `pursuit_checklist_tasks` that inserts into `task_activity_log` on any UPDATE, capturing old and new values for changed columns.
- **`generate_notification()`:** Trigger function that creates notification records when: a task is assigned (`task_assigned`), a task's due_date is within 7 days (`due_date_approaching` — run via pg_cron daily), a task's due_date has passed and status is not complete/na (`due_date_overdue` — run via pg_cron daily).

---

## 3. Template Management System

The template system allows admins to define reusable checklist structures that can be applied to new pursuits. The system ships with a comprehensive default template (defined in Section 4) and supports creating additional templates for different deal types.

### 3.1 Template CRUD (Admin Only)

Accessible from a dedicated Template Manager page in the application settings area. Only users with admin privileges can access this page.

- **Create:** New blank template or duplicate an existing template as a starting point.
- **Edit:** Full CRUD on phases, tasks, and checklist items within a template. Drag-and-drop reordering. Rich text editing for task descriptions.
- **Deactivate:** Soft-delete via `is_active` flag. Deactivated templates cannot be applied to new pursuits but existing pursuit copies are unaffected.
- **Version tracking:** Each save increments the version number. When applying a template to a pursuit, the version is recorded so teams can see if their checklist is based on an older template version.

### 3.2 Applying Templates to Pursuits

When a user navigates to a pursuit that has no checklist, they see a prompt to apply a template. The flow is:

1. User clicks "Add Checklist" on the pursuit detail page
2. Modal shows available active templates with the default template pre-selected
3. User selects a template and confirms
4. The `apply_template_to_pursuit` function deep-copies the entire template structure
5. User is presented with a milestone date entry form to set initial target dates
6. Due dates auto-calculate based on entered milestones

After application, the pursuit checklist is fully independent of the template. Changes to the master template do not propagate to existing pursuit checklists. However, the UI should show a subtle indicator if the pursuit's checklist was based on an older template version, with an option to view what changed (informational only, not auto-applied).

---

## 4. Default Template Content

The following is the complete default template that ships with the application. This template covers the standard ground-up multifamily development lifecycle from contract execution through construction mobilization. It contains **7 phases** and **100+ individual tasks** with detailed descriptions and checklist sub-items.

The description field for each task serves dual purposes: it provides guidance to the team on what needs to happen, and it captures institutional knowledge (lessons learned) from prior SLR projects. Task descriptions should be treated as living documentation and updated as the team accumulates new lessons.

---

### Phase 1: Development Agreement / Land Contribution

**Description:** Legal and contractual framework for site acquisition, land contribution, or joint venture structuring. Initiated at LOI execution and completed by closing.

**Default Milestone:** Closing Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 1.1 | **Contract Summary** | Prepare a summary of all executed and pending agreements for the deal file. Include key dates, obligations, and contingencies. | — |
| 1.2 | **Term Sheet** | Define what agreements are required for your specific site. Identify the full set of legal documents needed based on deal structure (JV, fee simple purchase, ground lease, land contribution, etc.). | — |
| 1.3 | **Purchase & Sale Agreement** | Negotiate and execute the PSA. Track all amendments, side letters, and extension notices. | — |
| 1.4 | **Development Agreement** | Agreement between developer and capital partner defining roles, responsibilities, fees, and approval rights during the development period. | — |
| 1.5 | **Contribution Agreement** | If land is being contributed (not purchased), define contribution value, timing, tax treatment, and partner credit. | — |
| 1.6 | **Development Cooperation & Funding Agreement** | Governs co-development arrangements where multiple parties share development responsibilities and funding obligations. | — |
| 1.7 | **Limited Partnership Agreement** | LP agreement defining capital structure, waterfall, promote thresholds, key person provisions, and governance. | — |
| 1.8 | **General Partnership Agreement** | GP-level agreement defining management responsibilities, fee structures, and decision-making authority between GP partners. | — |
| 1.9 | **CCR Agreement** | Covenants, Conditions & Restrictions agreement. Particularly relevant for master-planned communities or mixed-use developments with shared infrastructure. | — |
| 1.10 | **Horizontal Development Agreement** | Agreement governing site work, infrastructure, and horizontal improvements when site development is separated from vertical construction. | — |
| 1.11 | **Multifamily Contractor / Owner Agreement** | GMP or stipulated sum contract between owner entity and general contractor for the multifamily vertical construction. | — |
| 1.12 | **Retail Contractor / Owner Agreement** | Separate construction contract for ground-floor retail or commercial components if applicable. | — |
| 1.13 | **Title Report Order** | Order preliminary title report immediately upon PSA execution. Title issues discovered late can delay or kill a deal. | — |
| 1.14 | **Power Company Agreement** | Power companies are notorious for slow responses. Start agreement discussion during schematic design. Push power company engineering team to provide estimate of potential work by end of Design Development. | — |
| 1.15 | **Cable Company Agreement** | Cable companies are notorious for slow responses. Start agreement discussion during schematic design. Push cable company engineering team to provide estimate of potential work by end of Design Development. | — |
| 1.16 | **Attain Earnest Money Wiring Instructions** | Obtain wiring instructions from title company or escrow agent for earnest money deposit. Verify instructions independently to prevent wire fraud. | — |
| 1.17 | **Pre-Development Funds Request** | Submit request to capital partner for pre-development funding. Include detailed budget for DD costs, design fees, deposits, and legal expenses. | — |
| 1.18 | **Set Up Project Files** | Create standardized project folder structure in Box. Establish naming conventions and access permissions for the deal team. | — |
| 1.19 | **Broker Commission Agreements** | Agreement per Purchase & Sale Agreement. Coordinated in proforma. Confirm terms of broker agreement are reflected in proforma and that commission timing and conditions are clearly documented. | — |

---

### Phase 2: Due Diligence

**Description:** Comprehensive investigation of the site covering legal, environmental, geotechnical, civil, zoning, and market conditions. Most items must be completed within the DD period defined in the PSA.

**Default Milestone:** DD Expiration Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 2.1 | **DD Kickoff Call with Legal & Key Stakeholders** | Schedule kickoff call within 48 hours of PSA execution. Assign task owners, establish DD timeline, and confirm critical path items. | — |
| 2.2 | **Review Seller's Underlying Contracts** | For sites with existing buildings: review in-place leases, service contracts, maintenance agreements, parking arrangements, and all third-party obligations that transfer with the property. | — |
| 2.3 | **Title Commitment** | Obtain and review the title commitment from the title company. This is a critical-path item that must be started immediately. | • Review title commitment for liens, encumbrances, and restrictions · • Review all exception documents listed in Schedule B · • Confirm legal description matches survey · • Identify any title defects requiring cure before closing |
| 2.4 | **Buyer's Objection Letter** | Prepare and deliver formal objection letter regarding title and survey matters within the timeframe specified in the PSA. Coordinate with legal counsel on cure items. | — |
| 2.5 | **Revised Title Commitment** | Obtain revised title commitment after seller cures objected items. Confirm all objections have been satisfactorily resolved or waived. | — |
| 2.6 | **Legal Description / Title Survey** | Obtain ALTA survey and confirm legal description matches title commitment. Surveyor and purchaser's counsel must coordinate. | • Commission or update ALTA survey to current standards · • Obtain seller's affidavit regarding boundary disputes, encroachments, and unrecorded agreements · • Confirm survey matches legal description in title commitment |
| 2.7 | **Bankruptcy & Lien Search** | Conduct bankruptcy and lien searches on seller entity and principals. Confirm no pending actions that could cloud title or delay closing. | — |
| 2.8 | **Guarantees & Warranties with Respect to Property** | Identify and review all existing guarantees and warranties that transfer with the property, including roof warranties, equipment warranties, and structural guarantees. | — |
| 2.9 | **UCC Searches** | Conduct Uniform Commercial Code searches to identify any security interests, fixtures filings, or personal property liens affecting the site. | — |
| 2.10 | **Verify No Prohibited Persons** | Screen seller, seller principals, and all counterparties against OFAC SDN list, other sanctions lists, and anti-money laundering databases. | — |
| 2.11 | **List of Pending & Threatened Litigation** | Obtain from seller and independently verify through court records. | • Conduct litigation searches from state and federal courts in jurisdiction · • Review any pending or threatened actions involving the property or seller |
| 2.12 | **Deed Restriction Review** | Confirm during title review with closing attorney if deed has use restrictions. Examples: no apartments, no grocery store, dry overlay (no alcohol sales), age restrictions, height limitations. **This is a deal-killer item if missed.** | — |
| 2.13 | **Tax Analysis** | Obtain tax summary memo from tax consultants (e.g., Ryan Tax Consultants). Confirm analysis is captured in proforma. Investigate: LIDs, CFDs, real estate taxes, rollback taxes, franchise taxes (TN handles at partnership level). Review taxes as project advances through development as they are subject to change (Nashville 2020 saw 34% tax increase). | — |
| 2.14 | **Planning Department - Preliminary Site Plan Review** | Submit preliminary site plan to local planning department for informal review and feedback before formal application. Identify potential red flags early. | — |
| 2.15 | **Land Use Approvals** | PZR is the first step during DD for zoning review. For complicated sites, hire a local code consultant or zoning attorney to confirm the design concept meets zoning code. | • SLR internal zoning review and assessment · • Obtain Zoning Certificate / Verification Letter from PZR Corp or equivalent · • Commission zoning consultant or attorney letter confirming permitted use and density · • Review existing plat and filed plans for the site · • Confirm entitlement process, timeline, and required approvals · • Confirm signage constraints and permitted signage types · • Confirm affordable housing requirements or voluntary programs |
| 2.16 | **Aerial Photograph** | Obtain current aerial photograph of the site and surrounding area. Useful for site planning, presentation materials, and identifying potential conflicts with adjacent properties. | — |
| 2.17 | **SLR Market Study** | Commission or prepare internal market study covering: submarket fundamentals, competitive supply pipeline, absorption rates, rent comps, demographic trends, and employment drivers. | — |
| 2.18 | **Review Seller's Information Package** | Systematically review all materials provided by the seller during due diligence. | • Phase I Environmental Site Assessment · • ALTA Survey · • In-place leases and rent roll · • Tenant notice letters · • Geotechnical report · • Dewatering report (if applicable) |
| 2.19 | **Regulations / No Violations Letter** | For sites with existing buildings: obtain a letter from the city confirming no outstanding code violations, open permits, or compliance orders against the property. | — |
| 2.20 | **Historical Report** | Research the historical use of the site through Sanborn maps, aerial photographs, city directories, and fire insurance records. Supports environmental assessment and identifies potential contamination sources. | — |
| 2.21 | **Review CCRs** | If applicable, review all Covenants, Conditions & Restrictions. Confirm POA/HOA fees are coordinated in the proforma. Identify any use restrictions, architectural review requirements, or development standards. | — |
| 2.22 | **Site Visit / Property Inspection** | Conduct physical site inspection with key team members. Document existing conditions, adjacent property uses, access points, utilities, topography, drainage patterns, and any visible environmental concerns. | — |
| 2.23 | **Architect - Preliminary Design** | Engage architect for preliminary design work during DD to validate development concept. | • Density study / preliminary site plan to confirm achievable unit count · • Site plan submission to planning department for preliminary feedback |
| 2.24 | **Civil Engineer Due Diligence Report** | Commission the civil DD report immediately after PSA execution. Cover as many items as possible from the DD checklist. Typical cost: $7,500 over 3 weeks. Confirm impact fees and permit fees are in proforma and coordinated with construction team. | • Survey review and boundary confirmation · • Floodplain analysis and FEMA map review · • Wetland delineation or determination · • Endangered species habitat assessment · • Impact fee research and documentation · • Building permit fee research and documentation · • Confirm all impact fees and permit fees are captured in proforma |
| 2.25 | **Easement Issues** | Identify all existing and required easements. Check if the property will need to drain to neighboring properties. *(Lesson learned: The Alastair drained onto Mercedes Benz property per mutual grading plan.)* | • Temporary construction easements required during build · • Drainage easements — existing and needed · • Vehicular and pedestrian access easements |
| 2.26 | **Phase I Environmental Report** | Commission Phase I ESA from qualified environmental consultant. Critical-path item with expiration constraints. | • Complete site assessment per ASTM E1527-21 standard · • Track 180-day expiration from date of site visit (not report date) · • Commission report update if approaching expiration before closing |
| 2.27 | **Geotechnical Report** | Commission geotechnical investigation. Confirm structural engineer has classified seismic zone during DD to aid in foundation sizing during concept phase. A supplemental report from the geotechnical engineer may be required for seismic classification. | • Seismic zone classification review · • Structural engineer and construction team review of geotech findings · • Structural engineer conceptual foundation summary for early pricing |
| 2.28 | **Environmental Attorney Recommendation Letter** | Obtain formal recommendation letter from environmental legal counsel summarizing findings from Phase I (and Phase II if applicable) and recommending whether to proceed, require additional investigation, or obtain environmental insurance. | — |
| 2.29 | **Environmental Report - Additional Studies** | Additional environmental investigations beyond Phase I as warranted by site conditions. *(Note: research and site visit must be within 180 days of closing, not just the report date. EMF study may be required for sites adjacent to substations or large power lines.)* | • Phase II Environmental Site Assessment (if RECs identified in Phase I) · • Waters of US / karst features investigation · • In-situ soil sampling and laboratory analysis · • Phase III site remediation plan and cost estimate · • Fuel oil tank investigation and removal cost estimate · • Lead-based paint survey (existing structures) · • Electromagnetic field study (if near substations or major power lines) · • Methane testing (especially near former landfills or industrial sites) · • Limited asbestos sampling (existing structures) · • Radon testing — confirm with environmental attorney if recommended · • Environmental insurance (Pollution Legal Liability policy) evaluation · • Ground water quality testing · • Confirm all environmental results are communicated to construction team |
| 2.30 | **Service Contracts** | Review all existing service contracts that may transfer with the property or need to be terminated. | • Maintenance and landscape agreements · • Parking agreements and licenses · • Joint-use agreements with adjacent properties · • Option agreements affecting the property · • All other service contracts |
| 2.31 | **Will Serve Letters** | Most civil engineers will complete all will serve letters as part of the DD report. Research if local gas companies have rebates for upgrading from electric to gas ranges. *(Lesson learned: Confirm with civil engineer the age of water and sewer lines — 5J had adequate line capacity but pipes were over 100 years old and required replacement by the city.)* | • Electric utility — capacity confirmation and service requirements · • Gas utility — capacity and connection requirements (check for appliance rebates) · • Water and sewer — capacity, connection fees, and infrastructure condition · • Telephone / fiber service availability · • Cable / broadband service availability · • Verify no MUDs or contractual cost-sharing agreements · • Flow study if required by utility provider |
| 2.32 | **Overhead Utility Relocation Requirements** | Confirm if overhead utility lines must be buried. *(Lesson learned: Midtown Atlanta requires all development to bury power lines. Confirm requirement through civil engineer early — this can be a significant unbudgeted cost.)* | — |
| 2.33 | **Notify Seller of Non-Assumed Contracts** | Provide formal written notice to seller of any service contracts or agreements that buyer will not assume at closing, per PSA requirements. | — |
| 2.34 | **Aerial Rights / Crane Plan** | Determine if construction will require crane operations over adjacent properties or public rights-of-way. *(Lesson learned: Fifth and Juniper required crane to be dismantled over a historical church after the building was constructed.)* | — |
| 2.35 | **Contractor Pre-Construction Review** | Engage general contractor for pre-construction services and site assessment during DD. | • Crane and staging plan / easement requirements · • FAA notification (45 days prior to construction start for structures over 200 ft or near airports) · • Contractor site visit and constructability review · • Subcontractor market meetings to understand current pricing and availability · • Power company coordination to confirm transformer and switchgear layouts · • Phased unit turn strategy — confirm with city what building elements are required for phased TCO |

---

### Phase 3: Project Team Assembly

**Description:** Formal engagement of all key project team consultants and contractors. Some engagements begin during DD; this phase tracks formal contract execution.

**Default Milestone:** Construction Start Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 3.1 | **Architect Engaged** | Execute architect agreement. Confirm scope covers schematic design through construction administration. Establish design schedule aligned with permit timeline. | — |
| 3.2 | **General Contractor Engaged** | Execute GC pre-construction or GMP agreement. Confirm insurance requirements, bonding capacity, and key personnel assignments. | — |
| 3.3 | **Civil Engineer Engaged** | Execute civil engineering agreement for full site design. Scope should cover DD report through construction-phase services. | — |
| 3.4 | **Structural Engineer Engaged** | Execute structural engineering agreement. Confirm seismic classification, foundation approach, and coordination with geotech findings. | — |
| 3.5 | **MEP Engineer Engaged** | Execute mechanical, electrical, and plumbing engineering agreement. Coordinate with architect on building systems approach. | — |
| 3.6 | **Landscape Architect Engaged** | Execute landscape architecture agreement. Coordinate with civil engineer on grading, drainage, and site amenity design. | — |
| 3.7 | **Interior Designer Engaged** | Execute interior design agreement covering unit interiors, amenity spaces, corridors, and lobby. Establish FF&E budget and procurement timeline. | — |
| 3.8 | **Environmental Consultant Retained** | Confirm ongoing environmental consultant engagement for any monitoring, remediation oversight, or Phase II/III work required through construction. | — |
| 3.9 | **Tax Consultant Engaged** | Engage property tax consultant for abatement applications, assessed value projections, and appeals strategy. | — |
| 3.10 | **Traffic Engineer Engaged** | If required by entitlements, engage traffic engineer for traffic impact analysis and any required mitigation measures. | — |

---

### Phase 4: Entitlements

**Description:** All governmental approvals, permits, and entitlements required to develop the site as designed. Timeline varies dramatically by jurisdiction.

**Default Milestone:** Construction Start Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 4.1 | **Zoning Pre-Application Meeting** | Schedule pre-application meeting with planning staff to review proposed development concept, identify potential issues, and confirm submission requirements. | — |
| 4.2 | **Zoning Application Submitted** | Submit formal zoning application with all required materials. Track application number, assigned planner, and hearing dates. | — |
| 4.3 | **Neighborhood / Community Meetings** | Attend or host required community engagement meetings. Document feedback, opposition, and any commitments made to neighbors or council members. | — |
| 4.4 | **Planning Commission Hearing** | Prepare and present at planning commission hearing. Coordinate presentation materials, applicant testimony, and expert witnesses if needed. | — |
| 4.5 | **City Council Approval** | If required, track city council hearing date and prepare for council presentation. Monitor any conditions of approval. | — |
| 4.6 | **Zoning Approval / Ordinance Recorded** | Confirm zoning approval is final and recorded. Document all conditions of approval and proffered commitments. | — |
| 4.7 | **Site Plan Approval** | Submit and obtain approval of detailed site plan per local requirements. May be concurrent with or separate from zoning. | — |
| 4.8 | **Subdivision / Plat Approval** | If the site requires subdivision or replatting, submit and obtain plat approval. Coordinate with civil engineer and title company. | — |
| 4.9 | **Stormwater Management Plan Approval** | Submit and obtain approval of stormwater management plan. Coordinate with civil engineer on detention/retention requirements. | — |
| 4.10 | **Tree Survey & Removal Permits** | Complete tree survey, obtain tree removal permits, and establish mitigation requirements (replanting, fee-in-lieu, or tree bank credits). | — |
| 4.11 | **Demolition Permit** | If existing structures require demolition, obtain demolition permit. Coordinate with environmental consultant on asbestos/lead abatement requirements. | — |
| 4.12 | **Grading Permit** | Obtain grading/earthwork permit to allow site preparation work to begin in advance of full building permit. | — |
| 4.13 | **Building Permit Application** | Submit building permit application with full construction document set. Track plan review comments and resubmission timeline. | — |
| 4.14 | **Building Permit Issued** | Obtain building permit. Confirm all conditions precedent are satisfied and permit is unconditional. | — |
| 4.15 | **Tax Abatement / Incentive Applications** | If applicable, submit applications for property tax abatements, TIF districts, PILOT agreements, or other local incentives. These often have specific timing requirements relative to construction start. | — |
| 4.16 | **Historic Preservation Review** | If the site or adjacent properties are historically designated, complete required review with SHPO or local historic preservation commission. | — |

---

### Phase 5: Design & Construction Documents

**Description:** Architectural and engineering design from schematic through construction documents. Each phase builds on the prior and requires team coordination and owner approval before advancing.

**Default Milestone:** Construction Start Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 5.1 | **Schematic Design (SD)** | Establish overall design concept, building massing, unit layouts, site plan, and amenity program. SD set is the basis for initial GC pricing. | • Floor plans for all unit types · • Building sections and elevations (preliminary) · • Site plan with parking, amenities, and landscape concept · • Amenity program and space allocation · • Preliminary material and finish palette · • SD cost estimate from GC |
| 5.2 | **SD Owner Review & Approval** | Development team reviews SD package against proforma assumptions, market positioning, and construction budget. Approve or provide comments before advancing to DD. | — |
| 5.3 | **Design Development (DD Set)** | Refine design with detailed dimensions, structural system, MEP coordination, and material selections. DD set is the basis for GMP negotiation. | • Detailed floor plans with dimensions and unit counts confirmed · • Structural system defined and coordinated with geotech · • MEP systems designed and coordinated · • Building envelope and exterior material selections · • Interior finish selections and specifications · • Detailed site plan with civil engineering coordination · • DD cost estimate from GC — basis for GMP discussion · • Code review and life safety plan |
| 5.4 | **DD Owner Review & Approval** | Development team reviews DD package. Confirm unit mix, finishes, and building systems align with proforma and market positioning. Final major decision point before CDs. | — |
| 5.5 | **Construction Documents (CD Set)** | Complete permit-ready construction documents. CDs must be fully coordinated across all disciplines. | • Architectural construction documents complete · • Structural construction documents complete · • MEP construction documents complete · • Civil / site construction documents complete · • Landscape construction documents complete · • Interior design specifications and finish schedules · • Specification manual (Divisions 1–33 as applicable) · • Cross-discipline coordination review completed · • Code compliance review by third-party if required |
| 5.6 | **GMP / Construction Budget Finalization** | Negotiate and execute GMP amendment or final construction budget based on CD set. Reconcile against proforma budget. | — |
| 5.7 | **Permit Set Submission** | Submit final permit set to building department. Coordinate with all disciplines to ensure complete and coordinated submission. | — |
| 5.8 | **Plan Review Comments & Resubmission** | Respond to building department plan review comments. Track rounds of review and coordinate responses across consultants. | — |
| 5.9 | **Value Engineering** | If GMP exceeds budget, conduct structured value engineering process. Document all VE items with cost impact, design impact, and team recommendation. | — |
| 5.10 | **Long-Lead Procurement Identification** | Identify all long-lead items (elevators, switchgear, generators, custom windows, etc.) and initiate procurement to avoid schedule delays. | — |

---

### Phase 6: Financing & Loan Closing

**Description:** Construction loan and equity closing process from lender selection through funding. Typically runs in parallel with later design phases and entitlements.

**Default Milestone:** Closing Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 6.1 | **Lender Selection & Term Sheet** | Solicit construction loan proposals from target lenders. Negotiate term sheet covering loan amount, rate, term, guarantees, reserves, and covenants. | — |
| 6.2 | **Loan Application Submitted** | Submit formal loan application with all required exhibits: proforma, market study, borrower financial statements, organizational documents, site plans, and budget. | — |
| 6.3 | **Appraisal Ordered** | Lender orders appraisal from approved MAI appraiser. Provide appraiser with proforma, rent comps, site plan, and market study. Track timeline closely as appraisals are frequently on the critical path. | — |
| 6.4 | **Appraisal Received & Reviewed** | Review appraisal for as-stabilized value, as-complete value, and as-is land value. Confirm LTV/LTC ratios meet term sheet requirements. Challenge errors or unsupported conclusions. | — |
| 6.5 | **Lender Due Diligence** | Coordinate lender's independent due diligence process. | • Lender's environmental review and reliance letter · • Lender's engineering / plan & cost review (PCA) · • Lender's market study or third-party market consultant review · • Lender's insurance review · • Lender's legal review of organizational documents |
| 6.6 | **Loan Commitment Received** | Receive and review formal loan commitment letter. Confirm all terms match negotiated term sheet and identify any new conditions. | — |
| 6.7 | **Loan Document Review & Negotiation** | Review and negotiate all loan documents with lender's counsel. Key focus areas: draw mechanics, reserve requirements, completion guarantees, change order approval thresholds, and default triggers. | — |
| 6.8 | **Equity Capital Call / Funding** | Issue capital call notice to LP/equity partner per partnership agreement. Confirm wire instructions, timing, and documentation requirements. | — |
| 6.9 | **Rate Lock / Hedge Execution** | If applicable, execute interest rate cap or hedge instrument per loan requirements. Coordinate with lender on approved counterparties and documentation. | — |
| 6.10 | **Pre-Closing Title & Survey Update** | Order updated title commitment and survey endorsements required by lender. Confirm all prior objection items have been cured. | — |
| 6.11 | **Closing Checklist Coordination** | Prepare and circulate comprehensive closing checklist with all parties (buyer counsel, seller counsel, lender counsel, title company). Track completion status daily in the final week before closing. | — |
| 6.12 | **Loan Closing & Initial Funding** | Execute all loan documents, fund equity, and close the transaction. Confirm recording of deed, deed of trust, and UCC filings. | — |
| 6.13 | **Post-Closing Deliverables** | Complete all post-closing requirements including recorded documents, title policy issuance, original document delivery, and any outstanding conditions. | — |

---

### Phase 7: Insurance & Risk Management

**Description:** Insurance program design and procurement for the development period. Must be in place before construction start and coordinated with lender requirements.

**Default Milestone:** Construction Start Date

| # | Task | Description / Guidance | Checklist Items |
|---|------|----------------------|-----------------|
| 7.1 | **Insurance Broker Engagement** | Engage insurance broker with multifamily development experience. Provide project details for preliminary coverage design and budgeting. | — |
| 7.2 | **Builder's Risk Insurance** | Procure builder's risk policy covering the full construction value. Coordinate coverage limits, deductibles, and named insureds with lender requirements. | — |
| 7.3 | **General Liability Insurance** | Confirm general liability coverage for the owner entity during the development period. Coordinate with GC's CGL policy to ensure no coverage gaps. | — |
| 7.4 | **OCIP / CCIP Decision** | Determine whether to use an Owner-Controlled Insurance Program (OCIP) or Contractor-Controlled Insurance Program (CCIP). Analyze cost, coverage, and administrative requirements for each approach based on project size. | — |
| 7.5 | **Professional Liability Coordination** | Confirm professional liability (E&O) insurance for all design professionals (architect, engineers, consultants). Verify coverage limits meet contract requirements and lender standards. | — |
| 7.6 | **Environmental Insurance** | If recommended by environmental counsel, procure Pollution Legal Liability (PLL) policy. Particularly important for brownfield sites or properties with known contamination history. | — |
| 7.7 | **Contractor Insurance Verification** | Collect and verify certificates of insurance from GC and all major subcontractors. Confirm coverage types, limits, and additional insured endorsements meet contract and lender requirements. | — |
| 7.8 | **Lender Insurance Requirements Review** | Obtain lender's insurance requirements matrix. Confirm all policies meet or exceed lender minimums for coverage types, limits, deductibles, and carrier ratings. | — |
| 7.9 | **Umbrella / Excess Liability** | Procure umbrella or excess liability policy to supplement underlying GL, auto, and employer's liability coverage. Coordinate limits with lender requirements and project risk profile. | — |
| 7.10 | **Workers' Compensation Compliance** | Confirm workers' compensation compliance for all parties. Particularly important for OCIP programs where the owner assumes responsibility for WC coverage. | — |

---

## 5. User Interface Specifications

### 5.1 Pursuit Checklist View

This is the primary view for interacting with a pursuit's checklist. It appears as a new tab or section within the existing pursuit detail page.

**Layout:** Vertical accordion-style layout with phases as collapsible sections. Each phase header shows the phase name, a progress bar (X of Y tasks complete), and the phase color indicator. Clicking a phase header expands/collapses the task list.

**Task Cards:** Each task renders as a card within its phase section. The card shows: status badge (color-coded), task name, assignee avatar, due date (with overdue highlighting in red), checklist item progress (e.g., "3/5"), and file attachment count. Soft dependency indicator shows a subtle arrow connecting dependent tasks.

**Task Detail Panel:** Clicking a task card opens a slide-out panel (right side) with full task details. The panel contains:

- Task name (editable inline)
- Status selector (dropdown with the six states)
- Assignee selector (dropdown of pursuit team members + external users if task is `external_assignable`)
- Due date display showing both calculated date and milestone reference, with manual override toggle
- Description field with rich text editor (stored as HTML)
- Checklist items as interactive checkboxes
- Notes section with rich text input and chronological note feed
- File links section with "Link Box File" button and list of attached files
- Activity log showing all changes to this task
- Soft dependency indicator showing what this task depends on and what depends on it

### 5.2 Milestone Configuration Panel

Accessible from the pursuit checklist view header. Shows all milestones in timeline order with date pickers. Changing a milestone date triggers recalculation of all related task due dates. Unconfirmed dates are shown with a dashed border; confirmed dates with a solid border. The panel should clearly show how many tasks are affected by each milestone.

### 5.3 My Assignments Dashboard

Accessible from the main navigation. Shows the logged-in user all tasks assigned to them across all pursuits.

**Default view:** Grouped by pursuit, sorted by due date (soonest first). Overdue tasks are pinned to the top with red highlighting.

**Filters:** By status (multi-select), by pursuit, by region (leverages existing pursuit region field), by due date range.

**Quick actions:** Users can change task status directly from this view without navigating to the pursuit. Clicking the task name navigates to the pursuit checklist with the task detail panel open.

**Summary stats:** Show total tasks assigned, overdue count, due this week count, and completion rate.

### 5.4 Pursuit Timeline View

A Gantt-style horizontal timeline showing all tasks across all phases for a single pursuit. This view provides a visual overview of the entire pre-development timeline.

**Layout:** Horizontal timeline with time on the x-axis. Phases are rows (or row groups). Tasks are bars within their phase row, positioned by due date. Milestones are diamond markers on the timeline.

**Color coding:** Task bars are colored by status. Phase color is shown as a left-border accent. Critical path tasks have a distinct visual treatment (thicker bar or different pattern).

**Interaction:** Clicking a task bar opens the task detail panel. Hovering shows a tooltip with task name, assignee, status, and due date.

**Soft dependencies:** Rendered as subtle curved arrows between dependent task bars.

### 5.5 Cross-Pursuit Overview

A portfolio-level view showing checklist progress across multiple pursuits. Accessible from the main dashboard or a dedicated "Pipeline" page.

**Layout:** Table/grid with one row per pursuit. Columns show: pursuit name, region, overall progress (bar), overdue task count, next upcoming milestone, and phase-level mini progress bars.

**Filters:** By region, by team member (show only pursuits where this user has assignments), by milestone date range.

**Drill-down:** Clicking a pursuit row navigates to that pursuit's checklist view.

### 5.6 Notification Center

A bell icon in the application header with an unread count badge. Clicking opens a dropdown panel showing recent notifications grouped by date.

Each notification shows: icon by type, title, brief description, timestamp, and pursuit name. Clicking a notification marks it as read and navigates to the relevant task. A "Mark all as read" action is available at the top of the panel.

**Notification types and their triggers:**

- **Task Assigned:** When any task's `assigned_to` changes to the current user
- **Due Date Approaching:** 7 days before due date, then again at 3 days and 1 day (generated by daily pg_cron job)
- **Overdue:** When a task's due date passes and status is not complete or N/A (daily pg_cron job)
- **Status Changed:** When a task the user owns or is assigned to changes status
- **Note Added:** When someone adds a note to a task the user is assigned to
- **File Linked:** When someone attaches a file to a task the user is assigned to

---

## 6. Box Integration

The Box integration provides manual file linking between tasks and Box files. Users browse or search their Box account from within the task detail panel and attach files to tasks. The integration uses the Box MCP connector already available in the application.

### 6.1 File Linking Workflow

1. User opens a task detail panel and clicks "Link Box File"
2. A modal opens with a Box file browser showing the user's Box folders
3. User can navigate folders or use search to find files
4. User selects one or more files and optionally adds a description for each
5. On confirm, the app creates `task_file_links` records with cached file metadata (name, type, size, URL)
6. Linked files appear in the task detail panel as a list with file icon, name, size, and a link that opens the file in Box

### 6.2 Box API Methods Used

The following Box MCP tools are relevant for this integration:

- **`search_files_keyword`:** For searching Box files from the file picker modal
- **`list_folder_content_by_folder_id`:** For browsing folder contents in the file picker
- **`get_file_details`:** For fetching file metadata (name, size, type) when linking
- **`get_file_preview`:** Optional — for inline file preview in the task detail panel

### 6.3 Design Considerations

- File metadata is cached in `task_file_links` at link time. File names and sizes may change in Box after linking — this is acceptable. A "Refresh" button on the file list can re-fetch metadata from Box if needed.
- Deleting a file link from a task does not delete the file from Box. It only removes the association.
- External users should be able to view linked files (the Box URL) but the application should not expose the Box file picker to external users. External users who need to attach files should upload them and provide a link, or the internal team member links the file on their behalf.

---

## 7. External User Access

External users are third-party consultants, attorneys, engineers, and other professionals who need limited access to specific tasks assigned to them. This feature eliminates the email chain problem where internal teams are constantly chasing deliverables from external parties.

### 7.1 Access Model

External users have an extremely constrained view of the platform:

- They can **ONLY** see tasks where `assigned_to` matches their `external_user` ID
- They **cannot** see the pursuit name, address, financial details, or any other pursuit metadata beyond the task itself
- They **cannot** see other tasks in the same phase or any other phase
- They **cannot** change task status — only internal users can advance task status
- They **CAN** add notes to their assigned tasks (to provide updates, ask questions, or document findings)
- They **CAN** view and click file links on their assigned tasks
- They **CAN** upload files via Box link (if they have Box access) or provide external URLs in notes

### 7.2 Authentication

External users authenticate via magic link (passwordless email). When an internal user assigns a task to an external user, the external user receives a magic link email that logs them directly into a minimal portal showing only their assigned tasks. The magic link approach avoids password management overhead for users who may only access the platform occasionally.

### 7.3 External User Management

Internal users (any team member, not just admins) can:

- Create external user records (email, name, company, role)
- Assign external users to tasks that have `external_assignable = true`
- Deactivate external users (revokes all access immediately)

The external user record is global — the same civil engineer can be assigned to tasks across multiple pursuits without creating duplicate records. Their portal view aggregates all assigned tasks across all pursuits.

### 7.4 External User Portal UI

The external portal is a minimal, single-page experience:

- Header shows the external user's name and company
- Body shows a list of assigned tasks grouped by a generic project identifier (not the full pursuit name)
- Each task card shows: task name, description, due date, checklist items (read-only checkboxes), linked files, and a notes section
- The notes section allows the external user to write and submit notes (rich text)
- No navigation to other parts of the application. No settings. No dashboard.

---

## 8. Implementation Phases

The feature should be built incrementally. Each phase delivers usable functionality and builds on the prior phase.

### Phase 1: Foundation (Priority: Immediate)

**Goal:** Working checklist with template application, status tracking, and basic task interaction.

- Create all database tables, functions, and triggers defined in Section 2
- Build the Template Manager admin page (CRUD for templates, phases, tasks, checklist items)
- Seed the default template from Section 4
- Implement "Apply Template to Pursuit" flow with milestone date entry
- Build the Pursuit Checklist View (accordion layout, task cards, task detail panel)
- Implement status changes, task assignment (internal users only), and checklist item toggling
- Implement rich text notes on tasks
- Implement due date calculation from milestones and manual override
- Build the activity log (automatic via triggers)

### Phase 2: Dashboards & Navigation (Priority: High)

**Goal:** Users can see their work across pursuits and managers can see portfolio-level progress.

- Build the My Assignments dashboard with filters
- Build the Cross-Pursuit Overview table
- Implement the Notification Center (bell icon, dropdown, notification generation via triggers and pg_cron)
- Build the Pursuit Timeline View (Gantt-style)
- Add soft dependency visual indicators

### Phase 3: Box Integration (Priority: Medium)

**Goal:** Users can link Box files to tasks for document management.

- Build the Box file picker modal using Box MCP tools
- Implement `task_file_links` CRUD
- Display linked files in task detail panel with preview capability
- Add file link activity logging

### Phase 4: External User Access (Priority: Lower)

**Goal:** Third-party consultants can view and interact with their assigned tasks.

- Create `external_users` table and management UI
- Implement magic link authentication for external users
- Build the external user portal (minimal task-only view)
- Implement RLS policies for external user access
- Add external user assignment capability to task detail panel

---

## 9. Technical Notes

### 9.1 Rich Text Editor

Task descriptions and notes require a rich text editor. Recommended: **Tiptap** (headless, React-native, stores as HTML). The editor should support: bold, italic, links, bullet lists, numbered lists, and inline code. It should NOT support images (use Box file links instead), tables, or complex formatting. Keep it lightweight.

### 9.2 Realtime Subscriptions

Use Supabase Realtime to subscribe to changes on `pursuit_checklist_tasks` for the active pursuit. This ensures that when one team member changes a task status, other team members viewing the same pursuit see the update without refreshing. Subscribe to the `pursuit_id` filter to limit the subscription scope.

### 9.3 Performance Considerations

The default template contains approximately 100+ tasks across 7 phases. When applied to a pursuit, this creates 100+ rows in `pursuit_checklist_tasks` plus associated checklist items. Queries should use appropriate indexes:

- `pursuit_checklist_tasks`: Index on `(pursuit_id, phase_id, sort_order)`
- `pursuit_checklist_tasks`: Index on `(assigned_to, status)` for My Assignments queries
- `pursuit_checklist_tasks`: Index on `(pursuit_id, due_date)` for timeline views
- `task_activity_log`: Index on `(task_id, created_at)` for activity feeds
- `notifications`: Index on `(user_id, is_read, created_at)` for notification center

### 9.4 Status Enum Values

Use a Postgres enum type or a check constraint for the status field. The six valid values are:

```
not_started | in_progress | in_review | complete | not_applicable | blocked
```

**Status display configuration:**

| Status | Color | Icon | Behavior |
|--------|-------|------|----------|
| Not Started | Gray (`#9CA3AF`) | Circle outline | Default state. No timestamp recorded. |
| In Progress | Blue (`#3B82F6`) | Half circle | Active work. Sets `updated_at`. |
| In Review | Amber (`#F59E0B`) | Eye icon | Awaiting review by another team member. |
| Complete | Green (`#10B981`) | Checkmark | Sets `completed_at` and `completed_by`. |
| Not Applicable | Slate (`#64748B`) | Slash icon | Task doesn't apply to this deal. Excluded from progress calculations. |
| Blocked | Red (`#EF4444`) | X circle | Cannot proceed. Should reference the blocking task via `depends_on`. |

### 9.5 Milestone Keys

The following milestone keys are used in the default template. Additional milestones can be added per pursuit.

| Key | Display Name | Typical Usage |
|-----|-------------|---------------|
| `loi_execution` | LOI Execution Date | Start of pursuit timeline |
| `dd_expiration` | DD Expiration Date | Due diligence task deadlines |
| `hard_deposit` | Hard Deposit Date | Go/no-go decision point |
| `closing` | Closing Date | Financing, legal, and title tasks |
| `construction_start` | Construction Start Date | Design, permitting, insurance, team assembly |
| `first_unit_delivery` | First Unit Delivery | Marketing and lease-up preparation |