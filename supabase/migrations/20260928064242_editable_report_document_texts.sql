-- Fixed PDF wording is kept private: the public survey receives the selected
-- values only through prepare-submission, while the admin Edge Function owns edits.
create table public.report_document_texts (
  content_key text primary key check (content_key in (
    'document_title', 'profile_name_label', 'profile_type_label',
    'primary_heading', 'intro', 'notice', 'reference_heading',
    'reference_r_label', 'reference_r_description',
    'reference_i_label', 'reference_i_description',
    'reference_a_label', 'reference_a_description',
    'reference_s_label', 'reference_s_description',
    'reference_e_label', 'reference_e_description',
    'reference_c_label', 'reference_c_description'
  )),
  text text not null check (char_length(trim(text)) between 1 and 12000),
  updated_at timestamptz not null default now()
);

create trigger report_document_texts_set_updated_at
before update on public.report_document_texts
for each row execute function public.set_updated_at();

alter table public.report_document_texts enable row level security;

revoke all on public.report_document_texts from anon, authenticated;
grant select, insert, update on public.report_document_texts to service_role;
