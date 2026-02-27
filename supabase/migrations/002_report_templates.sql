-- ============================================================
-- Migration: Add report_templates table and primary_one_pager_id
-- ============================================================

-- 1. Add primary_one_pager_id to pursuits
alter table pursuits
  add column primary_one_pager_id uuid references one_pagers(id) on delete set null;

-- 2. Create report_templates table
create table report_templates (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text not null default '',
  config          jsonb not null default '{}',
  is_shared       boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  is_archived     boolean not null default false
);

-- Auto-update updated_at
create or replace function set_report_templates_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_report_templates_updated_at
  before update on report_templates
  for each row
  execute function set_report_templates_updated_at();

-- ============================================================
-- RLS Policies for report_templates
-- ============================================================
alter table report_templates enable row level security;

-- SELECT: users can see their own templates + all shared templates
create policy "Users can view own and shared templates"
  on report_templates for select
  to authenticated
  using (
    created_by = auth.uid()
    or is_shared = true
  );

-- INSERT: any authenticated user can create templates
create policy "Users can create templates"
  on report_templates for insert
  to authenticated
  with check (true);

-- UPDATE: 
--   - Creator can update their own non-shared templates
--   - Only admin/owner can update shared templates
create policy "Users can update own templates or admin/owner can update shared"
  on report_templates for update
  to authenticated
  using (
    created_by = auth.uid()
    or (
      is_shared = true
      and exists (
        select 1 from user_profiles
        where user_profiles.id = auth.uid()
        and user_profiles.role in ('admin', 'owner')
      )
    )
  );

-- DELETE (soft-delete via is_archived):
--   Same as UPDATE policy — owner of template or admin/owner for shared
create policy "Users can delete own or admin/owner can delete shared"
  on report_templates for delete
  to authenticated
  using (
    created_by = auth.uid()
    or (
      is_shared = true
      and exists (
        select 1 from user_profiles
        where user_profiles.id = auth.uid()
        and user_profiles.role in ('admin', 'owner')
      )
    )
  );
