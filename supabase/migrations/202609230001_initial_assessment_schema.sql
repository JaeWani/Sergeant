create extension if not exists pgcrypto;

create type public.report_status as enum ('awaiting_upload', 'ready', 'failed');
create type public.email_status as enum ('queued', 'sending', 'sent', 'retry', 'failed');

create table public.type_contents (
  id uuid primary key default gen_random_uuid(),
  type_code text not null check (type_code in ('R', 'I', 'A', 'S', 'E', 'C')),
  version text not null,
  label text not null,
  detail text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (type_code, version)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  consented_at timestamptz not null,
  name text not null check (char_length(name) between 1 and 40),
  commission_year integer not null check (commission_year between 1900 and 2100),
  mbti text,
  email text not null,
  calculation_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.answers (
  submission_id uuid not null references public.submissions(id) on delete cascade,
  question_number smallint not null check (question_number between 1 and 72),
  score smallint not null check (score between 1 and 5),
  primary key (submission_id, question_number)
);

create table public.score_results (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  score_r smallint not null check (score_r between 12 and 60),
  score_i smallint not null check (score_i between 12 and 60),
  score_a smallint not null check (score_a between 12 and 60),
  score_s smallint not null check (score_s between 12 and 60),
  score_e smallint not null check (score_e between 12 and 60),
  score_c smallint not null check (score_c between 12 and 60),
  primary_type text not null check (primary_type in ('R', 'I', 'A', 'S', 'E', 'C')),
  content_version text not null,
  calculated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  content_version text not null,
  template_version text not null,
  storage_path text not null unique,
  status public.report_status not null default 'awaiting_upload',
  sha256 text,
  byte_size integer check (byte_size > 0 and byte_size <= 5242880),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete cascade,
  recipient_email text not null,
  status public.email_status not null default 'queued',
  attempts smallint not null default 0 check (attempts between 0 and 3),
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_jobs_pending_idx on public.email_jobs (status, next_attempt_at)
  where status in ('queued', 'retry');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create trigger email_jobs_set_updated_at
before update on public.email_jobs
for each row execute function public.set_updated_at();

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

create or replace function public.enqueue_email_for_ready_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ready' and old.status is distinct from 'ready' then
    insert into public.email_jobs (report_id, recipient_email)
    select new.id, s.email
    from public.submissions s
    where s.id = new.submission_id
    on conflict (report_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger reports_enqueue_email
after update of status on public.reports
for each row execute function public.enqueue_email_for_ready_report();

create or replace function public.claim_email_job(p_job_id uuid)
returns setof public.email_jobs
language sql
security definer
set search_path = public
as $$
  update public.email_jobs
  set status = 'sending', attempts = attempts + 1, last_error = null
  where id = p_job_id
    and status in ('queued', 'retry')
    and next_attempt_at <= now()
  returning *;
$$;

revoke all on function public.create_prepared_submission from public;
revoke all on function public.claim_email_job from public;
grant execute on function public.create_prepared_submission to service_role;
grant execute on function public.claim_email_job to service_role;

alter table public.type_contents enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
alter table public.score_results enable row level security;
alter table public.reports enable row level security;
alter table public.email_jobs enable row level security;

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do update set public = false;

insert into public.type_contents (type_code, version, label, detail) values
  ('R', '2026-01', '야전·실무형(R)', '장비 운용과 현장 중심 임무 수행에서 강점을 보이는 유형입니다. 전투장비 운용과 유지관리, 전술적 운용, 병력 통제처럼 현장 실행력이 중요한 분야에서 역량을 발휘할 수 있습니다.'),
  ('I', '2026-01', '기술·분석형(I)', '분석적 사고와 문제 해결 능력이 강점인 유형입니다. 복잡한 시스템과 정보를 이해하고 활용하며, 기술적 분석과 근거 기반 판단이 필요한 분야에 적합합니다.'),
  ('A', '2026-01', '창의형(A)', '새로운 아이디어와 표현으로 조직에 활력을 더하는 유형입니다. 홍보, 콘텐츠 기획, 문화 활동처럼 창의적 접근이 필요한 분야에서 강점을 발휘할 수 있습니다.'),
  ('S', '2026-01', '관계형(S)', '사람을 이해하고 돕는 데 강점이 있는 유형입니다. 교육, 상담, 협업, 조직 내 소통과 안정이 중요한 역할에서 역량을 발휘할 수 있습니다.'),
  ('E', '2026-01', '리더형(E)', '리더십과 의사결정, 목표 달성에 강점이 있는 유형입니다. 조직을 이끌고 구성원을 동기부여하며 자원을 조정하는 역할에 적합합니다.'),
  ('C', '2026-01', '행정·관리형(C)', '체계적인 관리와 정확한 업무 수행에 강점이 있는 유형입니다. 규정, 절차, 기록, 자원 관리처럼 조직의 안정적 운영을 뒷받침하는 역할에 적합합니다.');
