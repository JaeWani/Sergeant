-- Record ties and close secondary tendencies without using the RIASEC sort order as a tiebreaker.
alter table public.score_results
  add column joint_primary_types text[] not null default '{}',
  add column secondary_type text check (secondary_type in ('R', 'I', 'A', 'S', 'E', 'C')),
  add column is_tie boolean not null default false,
  add column is_close boolean not null default false;

drop function if exists public.create_prepared_submission(text, integer, text, text, text, jsonb, jsonb, text, text, text, text);

create function public.create_prepared_submission(
  p_name text, p_commission_year integer, p_mbti text, p_email text,
  p_calculation_version text, p_answers jsonb, p_scores jsonb, p_primary_type text,
  p_primary_types text[], p_secondary_type text, p_is_tie boolean, p_is_close boolean,
  p_content_version text, p_template_version text, p_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_submission_id uuid;
begin
  if (select count(*) from jsonb_object_keys(p_answers)) <> 72 then raise exception 'Expected 72 answers'; end if;
  insert into public.submissions (consented_at, name, commission_year, mbti, email, calculation_version)
  values (now(), p_name, p_commission_year, nullif(p_mbti, ''), lower(p_email), p_calculation_version)
  returning id into v_submission_id;
  insert into public.answers (submission_id, question_number, score)
  select v_submission_id, key::smallint, value::smallint from jsonb_each_text(p_answers);
  insert into public.score_results (
    submission_id, score_r, score_i, score_a, score_s, score_e, score_c, primary_type,
    joint_primary_types, secondary_type, is_tie, is_close, content_version
  ) values (
    v_submission_id, (p_scores->>'R')::smallint, (p_scores->>'I')::smallint,
    (p_scores->>'A')::smallint, (p_scores->>'S')::smallint, (p_scores->>'E')::smallint,
    (p_scores->>'C')::smallint, p_primary_type, p_primary_types, p_secondary_type,
    p_is_tie, p_is_close, p_content_version
  );
  insert into public.reports (submission_id, content_version, template_version, storage_path)
  values (v_submission_id, p_content_version, p_template_version, p_storage_path);
  return v_submission_id;
end;
$$;

revoke all on function public.create_prepared_submission(text, integer, text, text, text, jsonb, jsonb, text, text[], text, boolean, boolean, text, text, text) from public;
grant execute on function public.create_prepared_submission(text, integer, text, text, text, jsonb, jsonb, text, text[], text, boolean, boolean, text, text, text) to service_role;

-- Approved baseline wording for the non-commissioned-officer assessment.
update public.type_contents
set is_active = false
where type_code in ('R', 'I', 'A', 'S', 'E', 'C') and is_active = true;

insert into public.type_contents (type_code, version, label, detail) values
  ('R', '2026-09', '야전·실무형(R)', '장비 운용과 현장 중심의 임무 수행에서 강점을 보이는 유형입니다. 장비 점검과 유지관리, 훈련, 현장 실행력이 필요한 역할에서 역량을 발휘할 수 있습니다. 명확한 목표와 역할이 주어졌을 때 집중력과 책임감을 발휘하는 점이 강점입니다.'),
  ('I', '2026-09', '기술·분석형(I)', '분석적 사고와 문제 해결 능력이 강점인 유형입니다. 복잡한 시스템과 정보를 이해하고 근거를 바탕으로 판단하는 역할에서 역량을 발휘할 수 있습니다. 기술을 익히고 원인을 추적해 개선안을 찾는 과정에 강점을 보입니다.'),
  ('A', '2026-09', '창의형(A)', '새로운 아이디어와 표현으로 조직에 활력을 더하는 유형입니다. 홍보, 콘텐츠 기획, 교육 자료 개발처럼 창의적 접근이 필요한 업무에서 강점을 보입니다. 기존 방식을 개선하고 상황에 맞는 전달 방식을 찾는 데 관심이 있습니다.'),
  ('S', '2026-09', '관계형(S)', '사람을 이해하고 돕는 데 강점이 있는 유형입니다. 교육, 상담, 협업, 조직 내 소통과 안정이 중요한 역할에서 역량을 발휘할 수 있습니다. 구성원의 성장과 적응을 돕고 갈등을 조정하는 데 보람을 느낍니다.'),
  ('E', '2026-09', '리더형(E)', '목표 설정, 의사결정, 구성원 동기부여에 강점이 있는 유형입니다. 팀을 이끌고 제한된 자원을 조정하는 역할에서 역량을 발휘할 수 있습니다. 상황을 빠르게 파악하고 우선순위를 세워 행동으로 옮기는 데 관심이 있습니다.'),
  ('C', '2026-09', '행정·관리형(C)', '체계적인 관리와 정확한 업무 수행에 강점이 있는 유형입니다. 규정, 절차, 기록, 자원 관리처럼 조직 운영을 뒷받침하는 역할에 적합합니다. 작은 오류를 줄이고 안정적으로 업무를 완수하는 점이 강점입니다.');
