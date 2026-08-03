-- Regions: Southern Utah, Northern Utah, CO, AZ, NV short codes
-- (replaces the old "series" bucket).
-- Superseded by migration-2026-08-03-region-full-names.sql
-- (co→colorado, az→arizona, nv→nevada).

-- Drop existing check on tournaments.region (name may vary by env)
do $$
declare
  cname text;
begin
  select con.conname into cname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where rel.relname = 'tournaments'
    and nsp.nspname = 'public'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%region%';
  if cname is not null then
    execute format('alter table public.tournaments drop constraint %I', cname);
  end if;
end $$;

-- Allow new region keys (keep series temporarily so we can reassign rows)
alter table public.tournaments
  add constraint tournaments_region_check
  check (region in (
    'southern_utah',
    'northern_utah',
    'co',
    'az',
    'nv',
    'series'
  ));

-- Reassign former series events by geography
update public.tournaments
set region = 'co'
where region = 'series'
  and (
    venue_name ilike '%CO%'
    or venue_name ilike '%Colorado%'
    or venue_name ilike '%Montrose%'
    or venue_name ilike '%Delta%'
    or venue_address ilike '%CO%'
    or venue_address ilike '%Colorado%'
    or name ilike '%Montrose%'
    or name ilike '%Delta%'
  );

-- Remaining series (e.g. Roosevelt UT) → Northern Utah
update public.tournaments
set region = 'northern_utah'
where region = 'series';

-- Fredonia AZ coed weekend
update public.tournaments
set region = 'az'
where slug = '2026-coed-fredonia';

-- Mesquite → NV
update public.tournaments
set region = 'nv'
where venue_name ilike '%Mesquite%'
   or venue_address ilike '%Mesquite%';

-- Wendover events → NV (was often lumped under northern)
update public.tournaments
set region = 'nv'
where venue_name ilike '%Wendover%'
   or venue_address ilike '%Wendover%';

-- Drop series from the allowed set
alter table public.tournaments drop constraint tournaments_region_check;
alter table public.tournaments
  add constraint tournaments_region_check
  check (region in (
    'southern_utah',
    'northern_utah',
    'co',
    'az',
    'nv'
  ));
