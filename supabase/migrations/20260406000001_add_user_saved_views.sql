-- User Saved Views
CREATE TABLE public.user_saved_views (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL,
    name text NOT NULL,
    view_type text DEFAULT 'pursuits' NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    filters jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.user_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved views" 
    ON public.user_saved_views FOR ALL TO authenticated 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Ensure only one default view per user per view_type
CREATE UNIQUE INDEX user_saved_views_single_default_idx 
    ON public.user_saved_views (user_id, view_type) 
    WHERE is_default = true;
