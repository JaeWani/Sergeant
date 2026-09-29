-- The preceding migration replaces this SECURITY DEFINER function with a new
-- signature. New functions receive PostgreSQL's default EXECUTE grants, so
-- explicitly restrict this public-schema RPC to the server role.
revoke execute on function public.create_prepared_submission(
  text, integer, text, text, text, jsonb, jsonb, text, text[], text,
  boolean, boolean, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_prepared_submission(
  text, integer, text, text, text, jsonb, jsonb, text, text[], text,
  boolean, boolean, text, text, text
) to service_role;
