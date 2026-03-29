-- catalog_migration_v1.sql
-- Слой 2: Каталог задач (catalog_*_dim).
-- Создаёт 4 таблицы иерархии тема → подтема → уник → вопрос.
-- Применение: Supabase SQL Editor (или supabase db push).

begin;

-- ============================================================
-- catalog_theme_dim  (уровень 1)
-- ============================================================

create table if not exists public.catalog_theme_dim (
    theme_id                text        primary key,
    title                   text        not null,
    sort_order              integer     not null check (sort_order > 0),
    is_enabled              boolean     not null default true,
    is_hidden               boolean     not null default false,
    is_counted_in_coverage  boolean     not null default true,
    total_subtopic_count    integer     not null default 0 check (total_subtopic_count    >= 0),
    total_unic_count        integer     not null default 0 check (total_unic_count        >= 0),
    total_question_count    integer     not null default 0 check (total_question_count    >= 0),
    catalog_version         text        not null,
    source_path             text,
    updated_at              timestamptz not null default now()
);

comment on table  public.catalog_theme_dim                        is 'Каталог тем (уровень 1). Источник — index.json, group-записи.';
comment on column public.catalog_theme_dim.theme_id               is 'Идентификатор темы, напр. "1", "2", … "12".';
comment on column public.catalog_theme_dim.sort_order             is 'Порядок отображения внутри списка тем (1-based, из позиции в index.json).';
comment on column public.catalog_theme_dim.is_counted_in_coverage is 'Учитывать ли тему при расчёте покрытия. Не перезаписывается при upsert.';
comment on column public.catalog_theme_dim.catalog_version        is 'Версия каталога. Формат: YYYY-MM-DDThh:mm_<sha8>.';

drop trigger if exists trg_catalog_theme_dim_updated_at
    on public.catalog_theme_dim;

create trigger trg_catalog_theme_dim_updated_at
    before update on public.catalog_theme_dim
    for each row execute function public.set_updated_at();

alter table public.catalog_theme_dim enable row level security;

drop policy if exists "authenticated can read catalog_theme_dim"
    on public.catalog_theme_dim;

create policy "authenticated can read catalog_theme_dim"
    on public.catalog_theme_dim
    for select
    to authenticated
    using (true);

-- ============================================================
-- catalog_subtopic_dim  (уровень 2)
-- ============================================================

create table if not exists public.catalog_subtopic_dim (
    subtopic_id             text        primary key,
    theme_id                text        not null
                                        references public.catalog_theme_dim (theme_id),
    title                   text        not null,
    sort_order              integer     not null check (sort_order > 0),
    is_enabled              boolean     not null default true,
    is_hidden               boolean     not null default false,
    is_counted_in_coverage  boolean     not null default true,
    total_unic_count        integer     not null default 0 check (total_unic_count     >= 0),
    total_question_count    integer     not null default 0 check (total_question_count >= 0),
    catalog_version         text        not null,
    source_path             text,
    updated_at              timestamptz not null default now()
);

comment on table  public.catalog_subtopic_dim                        is 'Каталог подтем (уровень 2). Источник — index.json, path-записи.';
comment on column public.catalog_subtopic_dim.subtopic_id            is 'Идентификатор подтемы, напр. "1.1", "1.2".';
comment on column public.catalog_subtopic_dim.theme_id               is 'Родительская тема.';
comment on column public.catalog_subtopic_dim.sort_order             is 'Порядок внутри темы (1-based, из позиции в index.json).';
comment on column public.catalog_subtopic_dim.is_counted_in_coverage is 'Учитывать ли при расчёте покрытия. Не перезаписывается при upsert.';
comment on column public.catalog_subtopic_dim.source_path            is 'Путь к JSON-файлу подтемы, напр. "content/tasks/1/1.1.json".';
comment on column public.catalog_subtopic_dim.catalog_version        is 'Версия каталога на момент последней синхронизации.';

create index if not exists idx_catalog_subtopic_dim_theme_sort
    on public.catalog_subtopic_dim (theme_id, sort_order);

drop trigger if exists trg_catalog_subtopic_dim_updated_at
    on public.catalog_subtopic_dim;

create trigger trg_catalog_subtopic_dim_updated_at
    before update on public.catalog_subtopic_dim
    for each row execute function public.set_updated_at();

alter table public.catalog_subtopic_dim enable row level security;

drop policy if exists "authenticated can read catalog_subtopic_dim"
    on public.catalog_subtopic_dim;

create policy "authenticated can read catalog_subtopic_dim"
    on public.catalog_subtopic_dim
    for select
    to authenticated
    using (true);

-- ============================================================
-- catalog_unic_dim  (уровень 3)
-- ============================================================

create table if not exists public.catalog_unic_dim (
    unic_id                 text        primary key,
    subtopic_id             text        not null
                                        references public.catalog_subtopic_dim (subtopic_id),
    theme_id                text        not null
                                        references public.catalog_theme_dim (theme_id),
    title                   text        not null,
    sort_order              integer     not null check (sort_order > 0),
    is_enabled              boolean     not null default true,
    is_hidden               boolean     not null default false,
    is_counted_in_coverage  boolean     not null default true,
    total_question_count    integer     not null default 0 check (total_question_count >= 0),
    catalog_version         text        not null,
    updated_at              timestamptz not null default now()
);

comment on table  public.catalog_unic_dim                        is 'Каталог уник-прототипов (уровень 3). unic_id = base_id из question_bank.';
comment on column public.catalog_unic_dim.unic_id                is 'Идентификатор уник-группы, напр. "1.1.1". Совпадает с question_bank.base_id.';
comment on column public.catalog_unic_dim.subtopic_id            is 'Родительская подтема.';
comment on column public.catalog_unic_dim.theme_id               is 'Денормализация: тема для ускорения запросов без лишнего JOIN.';
comment on column public.catalog_unic_dim.sort_order             is 'Порядок внутри подтемы (1-based, из позиции type в JSON-файле).';
comment on column public.catalog_unic_dim.is_counted_in_coverage is 'Учитывать ли при расчёте покрытия. Не перезаписывается при upsert.';
comment on column public.catalog_unic_dim.catalog_version        is 'Версия каталога на момент последней синхронизации.';

create index if not exists idx_catalog_unic_dim_subtopic_sort
    on public.catalog_unic_dim (subtopic_id, sort_order);

create index if not exists idx_catalog_unic_dim_theme_id
    on public.catalog_unic_dim (theme_id);

-- Частичный индекс для Layer 3: знаменатель покрытия
create index if not exists idx_catalog_unic_dim_counted
    on public.catalog_unic_dim (theme_id, subtopic_id)
    where is_counted_in_coverage = true;

drop trigger if exists trg_catalog_unic_dim_updated_at
    on public.catalog_unic_dim;

create trigger trg_catalog_unic_dim_updated_at
    before update on public.catalog_unic_dim
    for each row execute function public.set_updated_at();

alter table public.catalog_unic_dim enable row level security;

drop policy if exists "authenticated can read catalog_unic_dim"
    on public.catalog_unic_dim;

create policy "authenticated can read catalog_unic_dim"
    on public.catalog_unic_dim
    for select
    to authenticated
    using (true);

-- ============================================================
-- catalog_question_dim  (уровень 4, листовой)
-- ============================================================

create table if not exists public.catalog_question_dim (
    question_id     text        primary key,
    unic_id         text        not null
                                references public.catalog_unic_dim (unic_id),
    subtopic_id     text        not null
                                references public.catalog_subtopic_dim (subtopic_id),
    theme_id        text        not null
                                references public.catalog_theme_dim (theme_id),
    sort_order      integer     not null check (sort_order > 0),
    manifest_path   text,
    is_enabled      boolean     not null default true,
    is_hidden       boolean     not null default false,
    catalog_version text        not null,
    updated_at      timestamptz not null default now()
);

alter table public.catalog_question_dim
    add column if not exists manifest_path text;

comment on table  public.catalog_question_dim             is 'Каталог вопросов (уровень 4, листовой). question_id = question_bank.question_id.';
comment on column public.catalog_question_dim.question_id is 'Идентификатор вопроса, напр. "1.1.1.1". Совпадает с question_bank.question_id.';
comment on column public.catalog_question_dim.unic_id     is 'Родительская уник-группа (= question_bank.base_id).';
comment on column public.catalog_question_dim.subtopic_id is 'Денормализация: подтема вопроса.';
comment on column public.catalog_question_dim.theme_id    is 'Денормализация: тема вопроса.';
comment on column public.catalog_question_dim.sort_order  is 'Порядок внутри уник-группы (1-based, из позиции prototype в JSON-файле).';
comment on column public.catalog_question_dim.manifest_path is 'Путь к manifest-файлу конкретного question для targeted question-level lookup.';
comment on column public.catalog_question_dim.catalog_version is 'Версия каталога на момент последней синхронизации.';

create index if not exists idx_catalog_question_dim_unic_sort
    on public.catalog_question_dim (unic_id, sort_order);

create index if not exists idx_catalog_question_dim_subtopic_id
    on public.catalog_question_dim (subtopic_id);

create index if not exists idx_catalog_question_dim_theme_id
    on public.catalog_question_dim (theme_id);

drop trigger if exists trg_catalog_question_dim_updated_at
    on public.catalog_question_dim;

create trigger trg_catalog_question_dim_updated_at
    before update on public.catalog_question_dim
    for each row execute function public.set_updated_at();

alter table public.catalog_question_dim enable row level security;

drop policy if exists "authenticated can read catalog_question_dim"
    on public.catalog_question_dim;

create policy "authenticated can read catalog_question_dim"
    on public.catalog_question_dim
    for select
    to authenticated
    using (true);

commit;
