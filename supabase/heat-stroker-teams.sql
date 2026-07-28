-- The 28 teams that played Coed Heat Stroker, entered as registrations.
--
-- The games are already here; the teams were not, so every division read
-- "Teams 0/6" beside a full bracket. The team names in the games ARE the
-- entry list — 28 in pool play, the same 28 across Gold, Silver and Bronze,
-- none in two brackets.
--
-- A team is registered in the bracket it ended in, because that is where it
-- is now. Pool play is the parent of those brackets, so its row rolls the
-- three up rather than holding its own copies.
--
-- No manager and no roster: that is the whole point (see
-- team-without-manager.sql). These are last season's results, not entries
-- anyone signed a waiver for. Nothing here may be treated as a signed entry.

with entered as (
  select
    d.tournament_id,
    d.id as division_id,
    d.gender,
    d.class_id,
    x.team_name
  from divisions d
  join tournaments t on t.id = d.tournament_id
  join lateral (
    select g.team1_name as team_name from games g
      where g.division_id = d.id and g.team1_name is not null
    union
    select g.team2_name from games g
      where g.division_id = d.id and g.team2_name is not null
  ) x on true
  where t.name ilike '%heat stroker%'
    and d.parent_division_id is not null   -- the brackets, not pool play
),
-- One teams row per name, so next season's entry can be recognised as the
-- same club. Same normalisation as lib/identity.js: curly apostrophes folded,
-- whitespace collapsed, lowercased.
made_teams as (
  insert into teams (name, normalized_name, gender)
  select distinct on (lower(regexp_replace(replace(team_name, '’', ''''), '\s+', ' ', 'g')))
    trim(team_name),
    lower(trim(regexp_replace(replace(team_name, '’', ''''), '\s+', ' ', 'g'))),
    gender
  from entered
  where not exists (
    select 1 from teams tm
    where tm.normalized_name = lower(trim(regexp_replace(replace(entered.team_name, '’', ''''), '\s+', ' ', 'g')))
  )
  returning id, normalized_name
)
insert into registrations (
  tournament_id, division_id, team_name, team_id, class_id,
  manager_name, manager_email, status, director_notes
)
select
  e.tournament_id,
  e.division_id,
  trim(e.team_name),
  coalesce(
    (select id from made_teams m
      where m.normalized_name = lower(trim(regexp_replace(replace(e.team_name, '’', ''''), '\s+', ' ', 'g')))),
    (select id from teams tm
      where tm.normalized_name = lower(trim(regexp_replace(replace(e.team_name, '’', ''''), '\s+', ' ', 'g')))
      limit 1)
  ),
  e.class_id,
  null, null,
  'confirmed',
  'Played this bracket. Entered from the results, not through the form.'
from entered e
on conflict do nothing;
