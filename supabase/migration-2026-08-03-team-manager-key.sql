-- Team identity: name + manager + gender (not name alone, not class).
--
-- Class is an attribute only — clubs promote D→E and stay the same team.
-- Without a manager, rows are not unique on name: many "Fallen" stubs may
-- exist until managers are attached (partial unique index).

alter table public.teams
  add column if not exists manager_name text,
  add column if not exists manager_normalized_name text;

comment on column public.teams.manager_name is
  'Display name of the manager that defines this team identity (with the team name and gender).';
comment on column public.teams.manager_normalized_name is
  'Folded manager name for matching. Null when no manager yet — those rows never merge.';

-- Backfill manager from latest registration that has one
update public.teams t
set
  manager_name = s.manager_name,
  manager_normalized_name = lower(trim(regexp_replace(replace(s.manager_name, '’', ''''), '\s+', ' ', 'g')))
from (
  select distinct on (r.team_id)
    r.team_id,
    r.manager_name
  from public.registrations r
  where r.team_id is not null
    and r.manager_name is not null
    and trim(r.manager_name) <> ''
  order by r.team_id, r.submitted_at desc nulls last
) s
where t.id = s.team_id
  and t.merged_into_id is null;

-- Empty string → null so partial unique index treats "no manager" as non-unique
update public.teams
set manager_normalized_name = null
where manager_normalized_name is null
   or trim(manager_normalized_name) = '';

drop index if exists public.teams_identity;

-- Only teams WITH a manager are unique on (name, manager, gender).
-- Unmanaged stubs can share a name freely until a manager is known.
create unique index if not exists teams_identity
  on public.teams (
    normalized_name,
    manager_normalized_name,
    coalesce(gender, '')
  )
  where merged_into_id is null
    and manager_normalized_name is not null
    and manager_normalized_name <> '';
