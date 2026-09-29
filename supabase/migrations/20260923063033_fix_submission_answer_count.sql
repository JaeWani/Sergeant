create or replace function public.create_prepared_submission(
  p_name text,
  p_commission_year integer,
  p_mbti text,
  p_email text,
  p_calculation_version text,
  p_answers jsonb,
  p_scores jsonb,
  p_primary_type text,
  p_content_version text,
  p_template_version text,
  p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission_id uuid;
begin
  if (select count(*) from jsonb_object_keys(p_answers)) <> 72 then
    raise exception 'Expected 72 answers';
  end if;

  insert into public.submissions (
    consented_at, name, commission_year, mbti, email, calculation_version
  ) values (
    now(), p_name, p_commission_year, nullif(p_mbti, ''), lower(p_email), p_calculation_version
  ) returning id into v_submission_id;

  insert into public.answers (submission_id, question_number, score)
  select v_submission_id, key::smallint, value::smallint
  from jsonb_each_text(p_answers);

  insert into public.score_results (
    submission_id, score_r, score_i, score_a, score_s, score_e, score_c,
    primary_type, content_version
  ) values (
    v_submission_id,
    (p_scores->>'R')::smallint, (p_scores->>'I')::smallint,
    (p_scores->>'A')::smallint, (p_scores->>'S')::smallint,
    (p_scores->>'E')::smallint, (p_scores->>'C')::smallint,
    p_primary_type, p_content_version
  );

  insert into public.reports (
    submission_id, content_version, template_version, storage_path
  ) values (
    v_submission_id, p_content_version, p_template_version, p_storage_path
  );

  return v_submission_id;
end;
$$;
