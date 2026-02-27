-- ============================================================
-- Diligence Checklist — Schema Migration (Phase 1)
-- ============================================================

-- ============================================================
-- 1. Template Tables
-- ============================================================

CREATE TABLE checklist_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    description     text,
    is_default      boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    version         integer NOT NULL DEFAULT 1,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checklist_template_phases (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    name                text NOT NULL,
    description         text,
    sort_order          integer NOT NULL DEFAULT 0,
    default_milestone   text,
    color               text
);

CREATE TABLE checklist_template_tasks (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id                uuid NOT NULL REFERENCES checklist_template_phases(id) ON DELETE CASCADE,
    name                    text NOT NULL,
    description             text,
    sort_order              integer NOT NULL DEFAULT 0,
    default_status          text NOT NULL DEFAULT 'not_started',
    relative_due_days       integer,
    relative_milestone      text,
    depends_on_task_id      uuid REFERENCES checklist_template_tasks(id) ON DELETE SET NULL,
    is_critical_path        boolean NOT NULL DEFAULT false,
    external_assignable     boolean NOT NULL DEFAULT false
);

CREATE TABLE checklist_template_checklist_items (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid NOT NULL REFERENCES checklist_template_tasks(id) ON DELETE CASCADE,
    label       text NOT NULL,
    sort_order  integer NOT NULL DEFAULT 0
);

-- ============================================================
-- 2. Pursuit Instance Tables
-- ============================================================

CREATE TABLE pursuit_checklist_instances (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pursuit_id                  uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    source_template_id          uuid REFERENCES checklist_templates(id) ON DELETE SET NULL,
    source_template_version     integer,
    applied_at                  timestamptz NOT NULL DEFAULT now(),
    applied_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (pursuit_id)
);

CREATE TABLE pursuit_milestones (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pursuit_id      uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    milestone_key   text NOT NULL,
    milestone_label text NOT NULL,
    target_date     date,
    is_confirmed    boolean NOT NULL DEFAULT false,
    sort_order      integer NOT NULL DEFAULT 0,
    UNIQUE (pursuit_id, milestone_key)
);

CREATE TABLE pursuit_checklist_phases (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id         uuid NOT NULL REFERENCES pursuit_checklist_instances(id) ON DELETE CASCADE,
    pursuit_id          uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    source_phase_id     uuid,
    name                text NOT NULL,
    description         text,
    sort_order          integer NOT NULL DEFAULT 0,
    default_milestone   text,
    color               text
);

CREATE TABLE pursuit_checklist_tasks (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id                uuid NOT NULL REFERENCES pursuit_checklist_phases(id) ON DELETE CASCADE,
    pursuit_id              uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    source_task_id          uuid,
    name                    text NOT NULL,
    description             text,
    sort_order              integer NOT NULL DEFAULT 0,
    status                  text NOT NULL DEFAULT 'not_started'
                            CHECK (status IN ('not_started','in_progress','in_review','complete','not_applicable','blocked')),
    assigned_to             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_to_type        text NOT NULL DEFAULT 'internal' CHECK (assigned_to_type IN ('internal','external')),
    due_date                date,
    due_date_is_manual      boolean NOT NULL DEFAULT false,
    relative_due_days       integer,
    relative_milestone      text,
    depends_on_task_id      uuid REFERENCES pursuit_checklist_tasks(id) ON DELETE SET NULL,
    is_critical_path        boolean NOT NULL DEFAULT false,
    external_assignable     boolean NOT NULL DEFAULT false,
    completed_at            timestamptz,
    completed_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pursuit_checklist_items (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid NOT NULL REFERENCES pursuit_checklist_tasks(id) ON DELETE CASCADE,
    label       text NOT NULL,
    is_checked  boolean NOT NULL DEFAULT false,
    checked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    checked_at  timestamptz,
    sort_order  integer NOT NULL DEFAULT 0
);

-- ============================================================
-- 3. Supporting Tables
-- ============================================================

CREATE TABLE task_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         uuid NOT NULL REFERENCES pursuit_checklist_tasks(id) ON DELETE CASCADE,
    author_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    author_type     text NOT NULL DEFAULT 'internal' CHECK (author_type IN ('internal','external')),
    content         text NOT NULL,
    parent_note_id  uuid REFERENCES task_notes(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task_activity_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     uuid NOT NULL REFERENCES pursuit_checklist_tasks(id) ON DELETE CASCADE,
    pursuit_id  uuid NOT NULL REFERENCES pursuits(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    action      text NOT NULL CHECK (action IN (
        'status_changed','assigned','note_added','file_linked','file_removed',
        'due_date_changed','task_edited','checklist_item_toggled'
    )),
    old_value   jsonb,
    new_value   jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. Indexes
-- ============================================================

CREATE INDEX idx_ct_phases_template ON checklist_template_phases(template_id);
CREATE INDEX idx_ct_tasks_phase ON checklist_template_tasks(phase_id);
CREATE INDEX idx_ct_items_task ON checklist_template_checklist_items(task_id);

CREATE INDEX idx_pci_pursuit ON pursuit_checklist_instances(pursuit_id);
CREATE INDEX idx_pm_pursuit ON pursuit_milestones(pursuit_id);
CREATE INDEX idx_pcp_instance ON pursuit_checklist_phases(instance_id);
CREATE INDEX idx_pcp_pursuit ON pursuit_checklist_phases(pursuit_id);

CREATE INDEX idx_pct_pursuit_phase_sort ON pursuit_checklist_tasks(pursuit_id, phase_id, sort_order);
CREATE INDEX idx_pct_assigned_status ON pursuit_checklist_tasks(assigned_to, status);
CREATE INDEX idx_pct_pursuit_due ON pursuit_checklist_tasks(pursuit_id, due_date);

CREATE INDEX idx_pcitems_task ON pursuit_checklist_items(task_id);
CREATE INDEX idx_tn_task ON task_notes(task_id);
CREATE INDEX idx_tal_task_created ON task_activity_log(task_id, created_at);
CREATE INDEX idx_tal_pursuit ON task_activity_log(pursuit_id);

-- ============================================================
-- 5. Auto-update triggers
-- ============================================================

CREATE TRIGGER update_checklist_templates_updated_at
    BEFORE UPDATE ON checklist_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pursuit_checklist_tasks_updated_at
    BEFORE UPDATE ON pursuit_checklist_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_notes_updated_at
    BEFORE UPDATE ON task_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. Row Level Security
-- ============================================================

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_checklist_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_checklist_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pursuit_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity_log ENABLE ROW LEVEL SECURITY;

-- Template tables: all authenticated can read, admin can write
CREATE POLICY "Authenticated read templates" ON checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage templates" ON checklist_templates FOR ALL TO authenticated
    USING (public.get_user_role() IN ('admin','owner')) WITH CHECK (public.get_user_role() IN ('admin','owner'));

CREATE POLICY "Authenticated read template phases" ON checklist_template_phases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage template phases" ON checklist_template_phases FOR ALL TO authenticated
    USING (public.get_user_role() IN ('admin','owner')) WITH CHECK (public.get_user_role() IN ('admin','owner'));

CREATE POLICY "Authenticated read template tasks" ON checklist_template_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage template tasks" ON checklist_template_tasks FOR ALL TO authenticated
    USING (public.get_user_role() IN ('admin','owner')) WITH CHECK (public.get_user_role() IN ('admin','owner'));

CREATE POLICY "Authenticated read template items" ON checklist_template_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage template items" ON checklist_template_checklist_items FOR ALL TO authenticated
    USING (public.get_user_role() IN ('admin','owner')) WITH CHECK (public.get_user_role() IN ('admin','owner'));

-- Pursuit instance tables: full authenticated access (team-scoping deferred)
CREATE POLICY "Authenticated full access" ON pursuit_checklist_instances FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuit_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuit_checklist_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuit_checklist_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON pursuit_checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON task_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON task_activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 7. Database Functions
-- ============================================================

-- Apply a template to a pursuit (deep copy)
CREATE OR REPLACE FUNCTION apply_template_to_pursuit(
    p_pursuit_id uuid,
    p_template_id uuid,
    p_applied_by uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_instance_id uuid;
    v_template_version integer;
    r_phase RECORD;
    v_new_phase_id uuid;
    r_task RECORD;
    v_new_task_id uuid;
    r_item RECORD;
BEGIN
    -- Get template version
    SELECT version INTO v_template_version FROM checklist_templates WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

    -- Delete existing checklist if any
    DELETE FROM pursuit_checklist_instances WHERE pursuit_id = p_pursuit_id;

    -- Create instance
    INSERT INTO pursuit_checklist_instances (pursuit_id, source_template_id, source_template_version, applied_by)
    VALUES (p_pursuit_id, p_template_id, v_template_version, p_applied_by)
    RETURNING id INTO v_instance_id;

    -- Create default milestones
    INSERT INTO pursuit_milestones (pursuit_id, milestone_key, milestone_label, sort_order) VALUES
        (p_pursuit_id, 'loi_execution',      'LOI Execution Date',       1),
        (p_pursuit_id, 'dd_expiration',       'DD Expiration Date',       2),
        (p_pursuit_id, 'hard_deposit',        'Hard Deposit Date',        3),
        (p_pursuit_id, 'closing',             'Closing Date',             4),
        (p_pursuit_id, 'construction_start',  'Construction Start Date',  5),
        (p_pursuit_id, 'first_unit_delivery', 'First Unit Delivery',      6)
    ON CONFLICT (pursuit_id, milestone_key) DO NOTHING;

    -- Copy phases
    FOR r_phase IN
        SELECT * FROM checklist_template_phases WHERE template_id = p_template_id ORDER BY sort_order
    LOOP
        INSERT INTO pursuit_checklist_phases (instance_id, pursuit_id, source_phase_id, name, description, sort_order, default_milestone, color)
        VALUES (v_instance_id, p_pursuit_id, r_phase.id, r_phase.name, r_phase.description, r_phase.sort_order, r_phase.default_milestone, r_phase.color)
        RETURNING id INTO v_new_phase_id;

        -- Copy tasks within phase
        FOR r_task IN
            SELECT * FROM checklist_template_tasks WHERE phase_id = r_phase.id ORDER BY sort_order
        LOOP
            INSERT INTO pursuit_checklist_tasks (
                phase_id, pursuit_id, source_task_id, name, description, sort_order,
                status, relative_due_days, relative_milestone, is_critical_path, external_assignable
            ) VALUES (
                v_new_phase_id, p_pursuit_id, r_task.id, r_task.name, r_task.description, r_task.sort_order,
                'not_started', r_task.relative_due_days,
                COALESCE(r_task.relative_milestone, r_phase.default_milestone),
                r_task.is_critical_path, r_task.external_assignable
            ) RETURNING id INTO v_new_task_id;

            -- Copy checklist items within task
            FOR r_item IN
                SELECT * FROM checklist_template_checklist_items WHERE task_id = r_task.id ORDER BY sort_order
            LOOP
                INSERT INTO pursuit_checklist_items (task_id, label, sort_order)
                VALUES (v_new_task_id, r_item.label, r_item.sort_order);
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN v_instance_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recalculate due dates when milestones change
CREATE OR REPLACE FUNCTION recalculate_due_dates(p_pursuit_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE pursuit_checklist_tasks t
    SET due_date = m.target_date + t.relative_due_days
    FROM pursuit_milestones m
    WHERE t.pursuit_id = p_pursuit_id
      AND t.due_date_is_manual = false
      AND t.relative_milestone IS NOT NULL
      AND t.relative_due_days IS NOT NULL
      AND m.pursuit_id = p_pursuit_id
      AND m.milestone_key = t.relative_milestone
      AND m.target_date IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recalculate on milestone change
CREATE OR REPLACE FUNCTION trg_milestone_date_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.target_date IS DISTINCT FROM OLD.target_date THEN
        PERFORM recalculate_due_dates(NEW.pursuit_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER milestone_date_changed
    AFTER UPDATE ON pursuit_milestones
    FOR EACH ROW EXECUTE FUNCTION trg_milestone_date_changed();

-- Activity log trigger
CREATE OR REPLACE FUNCTION log_task_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO task_activity_log (task_id, pursuit_id, user_id, action, old_value, new_value)
        VALUES (NEW.id, NEW.pursuit_id, auth.uid(), 'status_changed',
                jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    END IF;

    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        INSERT INTO task_activity_log (task_id, pursuit_id, user_id, action, old_value, new_value)
        VALUES (NEW.id, NEW.pursuit_id, auth.uid(), 'assigned',
                jsonb_build_object('assigned_to', OLD.assigned_to), jsonb_build_object('assigned_to', NEW.assigned_to));
    END IF;

    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        INSERT INTO task_activity_log (task_id, pursuit_id, user_id, action, old_value, new_value)
        VALUES (NEW.id, NEW.pursuit_id, auth.uid(), 'due_date_changed',
                jsonb_build_object('due_date', OLD.due_date), jsonb_build_object('due_date', NEW.due_date));
    END IF;

    -- Set completed_at/completed_by when status changes to complete
    IF NEW.status = 'complete' AND OLD.status != 'complete' THEN
        NEW.completed_at := now();
        NEW.completed_by := auth.uid();
    ELSIF NEW.status != 'complete' AND OLD.status = 'complete' THEN
        NEW.completed_at := NULL;
        NEW.completed_by := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checklist_task_activity_log
    BEFORE UPDATE ON pursuit_checklist_tasks
    FOR EACH ROW EXECUTE FUNCTION log_task_activity();
