-- guard_user_profile_privileged_columns (20260922000000) is a trigger function,
-- but Postgres grants EXECUTE to PUBLIC by default, so the advisor flags it as
-- callable at /rest/v1/rpc/. Triggers don't need any API role to hold EXECUTE.
REVOKE EXECUTE ON FUNCTION public.guard_user_profile_privileged_columns() FROM PUBLIC, anon, authenticated;
