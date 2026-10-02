-- ============================================================
-- regrid_usage_log: who used Regrid parcel records, and for what
-- ============================================================
-- Regrid bills every parcel record returned (2,000/month on the plan, then
-- $0.15 each). Regrid's own /usage endpoint is the source of truth for the
-- totals; this log adds the who/what so admins can see where they went.
-- Rows are written by the API routes as the signed-in user.

CREATE TABLE IF NOT EXISTS public.regrid_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- lookup | nearby | find | refresh
  purpose text NOT NULL,
  records integer NOT NULL DEFAULT 0 CHECK (records >= 0),
  detail jsonb
);

CREATE INDEX IF NOT EXISTS regrid_usage_log_created_at_idx ON public.regrid_usage_log (created_at DESC);

ALTER TABLE public.regrid_usage_log ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can record their own usage; only owners/admins can read the log
CREATE POLICY "Users insert own usage" ON public.regrid_usage_log
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read usage" ON public.regrid_usage_log
  FOR SELECT TO authenticated USING (public.get_user_role() IN ('owner', 'admin'));
