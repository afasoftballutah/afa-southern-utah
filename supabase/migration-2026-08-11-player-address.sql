-- Canonical address on the players directory (not only on roster lines).
-- Roster address still wins for waivers; this is what directors edit and list.

alter table public.players
  add column if not exists address text;

comment on column public.players.address is
  'Mailing / ID address for the person directory. Roster_members.address remains the per-tournament waiver snapshot.';

-- Best-effort backfill from the newest roster line that has an address.
with ranked as (
  select
    m.player_id,
    m.address,
    row_number() over (
      partition by m.player_id
      order by m.created_at desc nulls last
    ) as rn
  from public.roster_members m
  where m.player_id is not null
    and m.address is not null
    and nullif(trim(m.address), '') is not null
    and m.removed_at is null
)
update public.players p
set address = r.address
from ranked r
where p.id = r.player_id
  and r.rn = 1
  and (p.address is null or nullif(trim(p.address), '') is null);
