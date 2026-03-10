-- Migration for Checklist Task Attachments

-- 1. Create the Storage Bucket for task files
INSERT INTO storage.buckets (id, name, public, "file_size_limit", "allowed_mime_types")
VALUES ('task-files', 'task-files', false, 52428800, null) -- 50MB limit
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "task_files_select" ON storage.objects FOR SELECT USING (bucket_id = 'task-files');
CREATE POLICY "task_files_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'task-files');
CREATE POLICY "task_files_update" ON storage.objects FOR UPDATE USING (bucket_id = 'task-files');
CREATE POLICY "task_files_delete" ON storage.objects FOR DELETE USING (bucket_id = 'task-files');

-- 2. Create the task_attachments table
CREATE TABLE IF NOT EXISTS public.task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.pursuit_checklist_tasks(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    content_type TEXT,
    size_bytes INTEGER,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_by_external_party_id UUID REFERENCES public.external_task_parties(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uploaded_by_check CHECK (
        (uploaded_by IS NOT NULL AND uploaded_by_external_party_id IS NULL) OR
        (uploaded_by IS NULL AND uploaded_by_external_party_id IS NOT NULL) OR
        (uploaded_by IS NULL AND uploaded_by_external_party_id IS NULL) -- Allowed edge case for system uploads
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);

-- Enable RLS
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for task_attachments

-- Authenticated internal users can view and manage all attachments
CREATE POLICY "Internal users can view all task attachments"
    ON public.task_attachments FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Internal users can insert task attachments"
    ON public.task_attachments FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Internal users can update task attachments"
    ON public.task_attachments FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Internal users can delete task attachments"
    ON public.task_attachments FOR DELETE
    TO authenticated
    USING (true);

-- (External Portal Users rely on anonymous roles or edge functions depending on implementation. 
-- For now, internal policies ensure basic operation)
