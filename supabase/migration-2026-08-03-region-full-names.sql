-- Region keys: co/az/nv → colorado/arizona/nevada (full state names).

-- Temporarily allow both short and full names while we rewrite rows
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

alter table public.tournaments
  add constraint tournaments_region_check
  check (region in (
    'southern_utah',
    'northern_utah',
    'colorado',
    'arizona',
    'nevada',
    'co',
    'az',
    'nv',
    'series'
  ));

update public.tournaments set region = 'colorado' where region = 'co';
update public.tournaments set region = 'arizona' where region = 'az';
update public.tournaments set region = 'nevada' where region = 'nv';

-- Final allowed set (full names only)
alter table public.tournaments drop constraint tournaments_region_check;
alter table public.tournaments
  add constraint tournaments_region_check
  check (region in (
    'southern_utah',
    'northern_utah',
    'colorado',
    'arizona',
    'nevada'
  ));
