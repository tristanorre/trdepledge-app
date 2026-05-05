-- Slice 1: materials catalogue + key/value config.

create table if not exists public.materials_catalogue (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),

  name                     text        not null,
  unit                     text        not null,    -- e.g. 'm²', 'kg', 'each', 'L', 'bag'
  base_price_cents         integer     not null    check (base_price_cents >= 0),
  category                 text,
  active                   boolean     not null    default true
);

create index if not exists materials_catalogue_active_idx on public.materials_catalogue (active);

-- Now that materials_catalogue exists, add the deferred FK from job_materials.
alter table public.job_materials
  drop constraint if exists job_materials_material_id_fkey;
alter table public.job_materials
  add constraint job_materials_material_id_fkey
  foreign key (material_id) references public.materials_catalogue(id);


create table if not exists public.config (
  key                      text        primary key,
  value                    text        not null,
  updated_at               timestamptz not null    default now()
);

drop trigger if exists config_set_updated_at on public.config;
create trigger config_set_updated_at
  before update on public.config
  for each row execute function public.set_updated_at();

-- Seed values per spec. Rates in cents; admin can edit via Settings later.
insert into public.config (key, value) values
  ('private_rate_cents',         '6000'),
  ('ndis_rate_cents',            '5698'),
  ('aged_care_rate_cents',       '5698'),
  ('default_markup_percent',     '20'),
  ('ndis_support_item',          '01_019_0120_1_1'),
  ('cancellation_notice_days',   '7')
on conflict (key) do nothing;
