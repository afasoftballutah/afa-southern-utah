-- Real, confirmed 2026 season — replaces the 2023 placeholder data entirely.
-- Source: assets/schedule-2026.jpg (2026 AFA Southern Nevada Schedule flyer),
-- confirmed by JD 2026-07-21. All 11 events, copied verbatim from the flyer
-- except the tournament name typo "Tourament" -> "Tournament" (#1) and
-- normalizing "Ut"/"UT" casing — neither changes any fact on the flyer.
--
-- The flyer's own title says "Southern Nevada" (their graphics quirk — the
-- events span NV/UT/AZ) but the site stays "AFA Southern Utah": one
-- regional org, masthead unchanged.

delete from public.tournaments where is_placeholder = true;

insert into public.tournaments
  (slug, name, start_date, end_date, venue_name, venue_address, entry_fee_cents, game_guarantee, divisions_offered, poster_url, is_placeholder, status, contacts)
values
  ('2026-art-gomez-umpire', 'Art Gomez Umpire Tournament', '2026-01-03', '2026-01-04', 'Desert Breeze Park', 'Las Vegas, NV', 27500, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-coed-superbowl', 'Coed Superbowl', '2026-01-25', '2026-01-25', 'Santa Clara, UT', null, 27500, '3GG', 'Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-frozen-ropes', 'Frozen Ropes Tournament', '2026-02-21', '2026-02-22', 'Arroyo Grande Complex', 'Las Vegas, NV', 35000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-bash-4-bats', 'Bash 4 Bats', '2026-03-13', '2026-03-15', 'Bullhead City, AZ', null, 45000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-swing-for-the-fences', 'Swing for the Fences', '2026-04-11', '2026-04-12', 'Santa Clara, UT', null, 35000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-cinco-de-plinko', 'Cinco de Plinko Tournament', '2026-05-02', '2026-05-03', 'Arroyo Grande', 'Las Vegas, NV', 35000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-caliente-memorial', 'Caliente Memorial Weekend Blast', '2026-05-22', '2026-05-24', 'Caliente, NV', null, 35000, '7GG', 'Men''s',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-bombs-away', 'Bombs Away', '2026-06-13', '2026-06-14', 'Arroyo Grande', 'Las Vegas, NV', 35000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'complete',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-t-shirt-tournament', 'T-Shirt Tournament', '2026-08-22', '2026-08-23', 'St George, UT', null, 27500, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'upcoming',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-afa-world-series', 'AFA World Series', '2026-11-12', '2026-11-15', 'Mesquite, NV', null, 45000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'upcoming',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]'),

  ('2026-santa-smackdown', 'Santa Smackdown', '2026-12-19', '2026-12-20', 'Santa Clara, UT', null, 30000, '3GG', 'Men''s, Women''s, Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2026-schedule.jpg', false, 'upcoming',
   '[{"name":"Frank Coco","phone":"702-318-1502"},{"name":"Joey Markakis","phone":"702-860-7060"},{"name":"Jamie Neal","phone":"408-409-4881"}]')
on conflict (slug) do nothing;

-- Divisions per tournament (m/w/c tournaments get three; coed-only and
-- mens-only tournaments get exactly the one the flyer lists).
insert into public.divisions (tournament_id, name, sort_order)
select t.id, d.name, d.sort_order
from public.tournaments t
cross join lateral (
  values ('Men''s', 0), ('Women''s', 1), ('Coed', 2)
) as d(name, sort_order)
where t.slug in (
  '2026-art-gomez-umpire', '2026-frozen-ropes', '2026-bash-4-bats',
  '2026-swing-for-the-fences', '2026-cinco-de-plinko', '2026-bombs-away',
  '2026-t-shirt-tournament', '2026-afa-world-series', '2026-santa-smackdown'
)
on conflict (tournament_id, name) do nothing;

insert into public.divisions (tournament_id, name, sort_order)
select t.id, 'Coed', 0 from public.tournaments t where t.slug = '2026-coed-superbowl'
on conflict (tournament_id, name) do nothing;

insert into public.divisions (tournament_id, name, sort_order)
select t.id, 'Men''s', 0 from public.tournaments t where t.slug = '2026-caliente-memorial'
on conflict (tournament_id, name) do nothing;
