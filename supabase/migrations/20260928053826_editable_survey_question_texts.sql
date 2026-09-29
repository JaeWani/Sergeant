create table public.survey_question_texts (
  question_number smallint primary key check (question_number between 1 and 72),
  text text not null check (char_length(trim(text)) between 1 and 500),
  updated_at timestamptz not null default now()
);

create trigger survey_question_texts_set_updated_at
before update on public.survey_question_texts
for each row execute function public.set_updated_at();

alter table public.survey_question_texts enable row level security;

-- Question text is public only through the explicitly scoped Edge Function.
-- No browser role receives direct table permissions.
grant select, insert, update on public.survey_question_texts to service_role;
