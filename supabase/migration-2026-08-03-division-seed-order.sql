-- Director seed order for a division (no-pool 3GG / DE generate).
-- Ordered list of team names: index 0 = seed #1.
-- Null = not seeded yet; generate must not invent order from submitted_at.

alter table public.divisions
  add column if not exists seed_order text[];

comment on column public.divisions.seed_order is
  'Director-set seed list for this division (seed #1 first). Used when generating a bracket. Null until the director saves a full order.';
