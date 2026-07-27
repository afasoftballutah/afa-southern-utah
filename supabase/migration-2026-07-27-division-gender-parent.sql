-- Division gender/class backfill for team-page identity (2026-07-27).
-- Spec: M5-Share/spec-team-pages.md step 0.
--
-- Replaces the 2026-07-23 gate that wrote gender and class only when BOTH
-- parsed from the same name. Gender alone is now a valid fact: it separates
-- two teams that share a name. Class is still only written when an explicit
-- class token appears in the name (own, then parent).
--
-- Parent walk: Gold/Silver/Bronze carry no gender; their parent is Coed.
-- That is the only nesting on file; the walk is general so deeper trees work.
--
-- Do NOT use tournaments.divisions_offered or registrations.class.
-- Idempotent: safe to re-run. Does not edit migration-2026-07-23-divisions.sql.

comment on column public.divisions.gender is
  'mens | womens | coed. Nullable. Parsed from own name, then parent name. Gender alone is valid (team-page identity, 2026-07-27).';

comment on column public.divisions.class_id is
  'FK to classes. Nullable. Only when a class token appears in own name, then parent name. Whole-word match on classes.name and classes.aliases.';

with recursive
lineage as (
  -- Every division is its own root; walk toward the parent (depth 0 = self).
  select
    d.id as div_id,
    d.id as node_id,
    d.name as node_name,
    d.parent_division_id,
    0 as depth
  from public.divisions d
  union all
  select
    l.div_id,
    p.id,
    p.name,
    p.parent_division_id,
    l.depth + 1
  from lineage l
  join public.divisions p on p.id = l.parent_division_id
  where l.depth < 8
),
node_parsed as (
  select
    l.div_id,
    l.depth,
    case
      when l.node_name ~* '^coed\y' then 'coed'
      when l.node_name ~* '^men''?s\y' then 'mens'
      when l.node_name ~* '^women''?s\y' then 'womens'
      else null
    end as gender,
    (
      select cl.id
      from public.classes cl
      where lower(l.node_name) ~ ('\y' || lower(cl.name) || '\y')
         or exists (
           select 1 from unnest(cl.aliases) a
           where lower(l.node_name) ~ ('\y' || lower(a) || '\y')
         )
      order by length(cl.name) desc
      limit 1
    ) as class_id
  from lineage l
),
-- First non-null gender along the walk (self first, then parent, …).
gender_pick as (
  select distinct on (div_id)
    div_id,
    gender
  from node_parsed
  where gender is not null
  order by div_id, depth asc
),
-- First non-null class along the walk (self first).
class_pick as (
  select distinct on (div_id)
    div_id,
    class_id
  from node_parsed
  where class_id is not null
  order by div_id, depth asc
),
resolved as (
  select
    d.id,
    g.gender,
    c.class_id
  from public.divisions d
  left join gender_pick g on g.div_id = d.id
  left join class_pick c on c.div_id = d.id
)
update public.divisions d
set
  gender = r.gender,
  class_id = r.class_id
  -- display_name left alone (keep existing Gold/Silver/… labels)
from resolved r
where r.id = d.id;
