alter function public.set_updated_at() set search_path = pg_catalog;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.create_prepared_submission(
  text, integer, text, text, text, jsonb, jsonb, text, text, text, text
) from public, anon, authenticated;
revoke execute on function public.enqueue_email_for_ready_report() from public, anon, authenticated;
revoke execute on function public.claim_email_job(uuid) from public, anon, authenticated;

grant execute on function public.create_prepared_submission(
  text, integer, text, text, text, jsonb, jsonb, text, text, text, text
) to service_role;
grant execute on function public.claim_email_job(uuid) to service_role;
