-- ============================================================
-- unit_premiums: signed-in users only
-- ============================================================
-- The original policy was FOR ALL TO public USING (true), so the anon role —
-- the public key shipped to every browser — could read, insert, update and
-- delete every premium. Match the other one-pager child tables instead.
-- (The anon "for SMT" read policies on one_pagers etc. never covered premiums.)

DROP POLICY IF EXISTS "Users can manage unit premiums" ON public.unit_premiums;
DROP POLICY IF EXISTS "Authenticated full access" ON public.unit_premiums;
CREATE POLICY "Authenticated full access" ON public.unit_premiums
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
