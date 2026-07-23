-- AFA Division Model — Build order step 1 ONLY (schema + seed + mapping, no UI)
-- Ground truth: session-data/afa/afa-divisions-spec.md (power-desktop repo).
-- Additive only: no existing column dropped or renamed. divisions.name stays
-- (kept until the migration is verified in production use, per the spec).

-- ============================================================
-- classes — PUBLIC READ, director-write (via scorekeeper door, later step).
-- League-level skill classes (Rec/E/D/Open...). Directors add more later;
-- this migration seeds the four the league already runs.
-- ============================================================
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  aliases text[] not null default '{}',
  sort_order integer not null default 0,
  hr_limit integer, -- nullable — league hasn't ruled its own HR limits yet
  bands_note text,
  rules_notes text,
  created_at timestamptz not null default now()
);
comment on table public.classes is 'Public league-level skill classes (Rec/E/D/Open/...). No PII. Safe for anon read. Director-write via the scorekeeper door (future step) — no code change to add a class, just a row.';

alter table public.classes enable row level security;

drop policy if exists "public read classes" on public.classes;
create policy "public read classes" on public.classes for select using (true);

-- Explicit grants — this project's Data API posture is "auto-expose new
-- tables OFF", which means new tables get NO role grants at all by
-- default, not even service_role. Same pattern as every other public table
-- in schema.sql: SELECT to anon+authenticated, ALL to service_role.
grant select on public.classes to anon, authenticated;
grant all on public.classes to service_role;

-- Seed the four classes the league already runs. Open/Championship/Champ/
-- Uppers are the same class by the league's own usage (JD ruling
-- 2026-07-23) — aliases resolve them to one row, not four.
insert into public.classes (name, aliases, sort_order)
values
  ('Rec', '{}', 10),
  ('E', '{}', 20),
  ('D', '{}', 30),
  ('Open', '{Championship,Champ,Uppers}', 40)
on conflict (name) do nothing;

-- ============================================================
-- divisions — additive columns. All nullable; existing rows stay valid
-- with no backfill required to pass the not-null/check constraints.
-- ============================================================
alter table public.divisions add column if not exists gender text
  check (gender in ('mens', 'womens', 'coed'));
alter table public.divisions add column if not exists class_id uuid
  references public.classes(id);
alter table public.divisions add column if not exists display_name text;

comment on column public.divisions.gender is 'mens | womens | coed. Nullable — set only when divisions.name parses cleanly to a gender + class pair; see display_name otherwise.';
comment on column public.divisions.class_id is 'FK to classes. Nullable — set only alongside gender when divisions.name parses cleanly to a gender + class pair.';
comment on column public.divisions.display_name is 'Override / fallback rendered name. Set to the original divisions.name for every row where gender+class could not be cleanly parsed (do-not-guess rule) — see migration mapping table in the dispatch report.';

create index if not exists idx_divisions_class on public.divisions(class_id);

-- ============================================================
-- Map existing division rows.
-- Live data check (2026-07-23) found every existing divisions.name value
-- is one of exactly three strings: "Men's", "Women's", "Coed" — no class
-- token (Rec/E/D/Open/Uppers/Lowers/Championship/Champ/etc.) appears in any
-- existing row. Per the spec, a "clean match" requires BOTH gender AND
-- class to parse together; gender alone is not enough to populate the
-- structured fields (do-not-guess rule). So every existing row falls to
-- the fallback: gender/class_id stay null, display_name = name.
-- This is written generally (parses a gender token, then independently
-- looks for a class name/alias as a whole-word match) so it stays correct
-- and idempotent if re-run later after rows with fuller names exist (e.g.
-- "Coed Uppers") — it is not hardcoded to "set nothing".
-- ============================================================
with parsed as (
  select
    d.id,
    case
      when d.name ~* '^coed\y' then 'coed'
      when d.name ~* '^men''?s\y' then 'mens'
      when d.name ~* '^women''?s\y' then 'womens'
      else null
    end as raw_gender,
    (
      select cl.id
      from public.classes cl
      where lower(d.name) ~ ('\y' || lower(cl.name) || '\y')
         or exists (
           select 1 from unnest(cl.aliases) a
           where lower(d.name) ~ ('\y' || lower(a) || '\y')
         )
      order by length(cl.name) desc
      limit 1
    ) as raw_class_id
  from public.divisions d
),
resolved as (
  select
    id,
    -- Clean match requires BOTH gender AND class to parse together
    -- (spec: "where it cleanly matches gender + class... set the new
    -- fields; where it doesn't, leave the new fields null"). Gender
    -- alone is not enough — do not guess the other half.
    case when raw_gender is not null and raw_class_id is not null then raw_gender end as gender,
    case when raw_gender is not null and raw_class_id is not null then raw_class_id end as class_id
  from parsed
)
update public.divisions d
set
  gender = r.gender,
  class_id = r.class_id,
  display_name = case when r.gender is not null and r.class_id is not null then null else d.name end
from resolved r
where r.id = d.id;
