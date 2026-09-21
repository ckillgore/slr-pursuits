-- Migration to fix database error when deleting users from auth
-- This drops and recreates foreign key constraints pointing to auth.users with correct ON DELETE behavior.

-- 1. entity_comments
ALTER TABLE public.entity_comments 
  DROP CONSTRAINT IF EXISTS entity_comments_author_id_fkey,
  ADD CONSTRAINT entity_comments_author_id_fkey 
    FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. user_saved_views
ALTER TABLE public.user_saved_views
  DROP CONSTRAINT IF EXISTS user_saved_views_user_id_fkey,
  ADD CONSTRAINT user_saved_views_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. hellodata_fetch_log
ALTER TABLE public.hellodata_fetch_log
  DROP CONSTRAINT IF EXISTS hellodata_fetch_log_fetched_by_fkey,
  ADD CONSTRAINT hellodata_fetch_log_fetched_by_fkey
    FOREIGN KEY (fetched_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. key_dates
ALTER TABLE public.key_dates
  DROP CONSTRAINT IF EXISTS key_dates_created_by_fkey,
  ADD CONSTRAINT key_dates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. land_comps
ALTER TABLE public.land_comps
  DROP CONSTRAINT IF EXISTS land_comps_created_by_fkey,
  ADD CONSTRAINT land_comps_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 6. one_pagers
ALTER TABLE public.one_pagers
  DROP CONSTRAINT IF EXISTS one_pagers_created_by_fkey,
  ADD CONSTRAINT one_pagers_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 7. predev_budgets
ALTER TABLE public.predev_budgets
  DROP CONSTRAINT IF EXISTS predev_budgets_created_by_fkey,
  ADD CONSTRAINT predev_budgets_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 8. pursuit_land_comps
ALTER TABLE public.pursuit_land_comps
  DROP CONSTRAINT IF EXISTS pursuit_land_comps_added_by_fkey,
  ADD CONSTRAINT pursuit_land_comps_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 9. pursuit_rent_comps
ALTER TABLE public.pursuit_rent_comps
  DROP CONSTRAINT IF EXISTS pursuit_rent_comps_added_by_fkey,
  ADD CONSTRAINT pursuit_rent_comps_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 10. pursuit_sale_comps
ALTER TABLE public.pursuit_sale_comps
  DROP CONSTRAINT IF EXISTS pursuit_sale_comps_added_by_fkey,
  ADD CONSTRAINT pursuit_sale_comps_added_by_fkey
    FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 11. pursuit_stage_history
ALTER TABLE public.pursuit_stage_history
  DROP CONSTRAINT IF EXISTS pursuit_stage_history_changed_by_fkey,
  ADD CONSTRAINT pursuit_stage_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 12. pursuits
ALTER TABLE public.pursuits
  DROP CONSTRAINT IF EXISTS pursuits_created_by_fkey,
  ADD CONSTRAINT pursuits_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 13. sale_comps
ALTER TABLE public.sale_comps
  DROP CONSTRAINT IF EXISTS sale_comps_created_by_fkey,
  ADD CONSTRAINT sale_comps_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
