-- question_bank_v1.sql
-- Индекс всех задач (question_id) для быстрого серверного подбора.
-- Применение: Supabase SQL Editor.

begin;

create table if not exists public.question_bank (
  question_id   text primary key,
  base_id       text not null,
  section_id    text not null,
  topic_id      text not null,
  type_id       text not null,

  manifest_path text,
  is_enabled    boolean not null default true,
  is_hidden     boolean not null default false,

  updated_at    timestamptz not null default now()
);

comment on table public.question_bank is 'Index of tasks from content/tasks manifests. One row per question_id.';
comment on column public.question_bank.question_id is 'Prototype id (proto.id).';
comment on column public.question_bank.base_id is 'Base id for uniqueness (like baseIdFromProtoId).';
comment on column public.question_bank.manifest_path is 'Manifest source path in repo (content/tasks/...).';

-- Индексы под будущие RPC выборки
create index if not exists question_bank_section_topic_idx on public.question_bank(section_id, topic_id);
create index if not exists question_bank_topic_type_idx on public.question_bank(topic_id, type_id);
create index if not exists question_bank_type_idx on public.question_bank(type_id);

-- Частичный индекс только по активным задачам (ускоряет выборку)
create index if not exists question_bank_active_idx
  on public.question_bank(section_id, topic_id, type_id)
  where is_enabled = true and is_hidden = false;

-- Таблица не должна быть доступна из клиента напрямую
revoke all on table public.question_bank from anon;
revoke all on table public.question_bank from authenticated;

commit;
