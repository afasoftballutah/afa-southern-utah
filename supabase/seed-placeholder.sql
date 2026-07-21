-- Placeholder season data — sourced verbatim from the 2023 AFA Southern Utah
-- schedule poster (assets/schedule-2023.jpg). These are REAL 2023 dates/fees,
-- not invented 2026 ones — we do not have 2026 dates yet (open item, tracked
-- in afa-spec.md). Every row is flagged is_placeholder = true and status =
-- 'complete' so the site never presents stale data as an upcoming event.
-- Replace this data once Joey provides the real 2026 schedule.

insert into public.tournaments
  (slug, name, start_date, end_date, venue_name, venue_address, entry_fee_cents, deposit_cents, game_guarantee, divisions_offered, poster_url, is_placeholder, status, contacts)
values
  ('2023-superbowl', 'Superbowl Softball Tournament', '2023-01-27', '2023-01-28', 'The Canyons Sports Complex', 'St. George, UT', 37500, null, '4GG', 'Men''s, Women''s',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]'),

  ('2023-march-madness', 'March Madness Softball Tournament', '2023-03-03', '2023-03-04', 'The Canyons Sports Complex', 'St. George, UT', 37500, null, '4GG', 'Men''s, Women''s',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]'),

  ('2023-bill-given-memorial', 'Bill Given Memorial Coed Tournament', '2023-04-14', '2023-04-15', 'The Canyons Sports Complex', 'St. George, UT', 37500, null, '4GG', 'Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]'),

  ('2023-heat-stroker', 'Heat Stroker Softball Tournament', '2023-07-14', '2023-07-16', 'The Canyons Sports Complex', 'St. George, UT', 37500, null, '4GG', 'Men''s, Women''s',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]'),

  ('2023-coed-heat-stroker', 'Coed Heat Stroker Softball Tournament', '2023-07-28', '2023-07-29', 'The Canyons Sports Complex', 'St. George, UT', 37500, null, '4GG', 'Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]'),

  ('2023-halloween', 'Halloween Softball Tournament', '2023-10-27', '2023-10-28', 'The Canyons Sports Complex', 'St. George, UT', 37500, null, '4GG', 'Men''s, Women''s',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]'),

  ('2023-toys-4-tots', 'Toys 4 Tots Softball Tournament', '2023-12-08', '2023-12-09', 'The Canyons Sports Complex', 'St. George, UT', 22500, null, '4GG', 'Coed',
   'https://gbwusopifbyhlcppbfnl.supabase.co/storage/v1/object/public/posters/2023-schedule-placeholder.jpg', true, 'complete',
   '[{"name":"Josh Christianson","phone":"(435) 680-2450"},{"name":"Joey Markakis","phone":"(702) 860-7060"}]')
on conflict (slug) do nothing;

-- Divisions per tournament (Men's/Women's tournaments get two divisions; Coed gets one)
insert into public.divisions (tournament_id, name, sort_order)
select t.id, d.name, d.sort_order
from public.tournaments t
cross join lateral (
  values
    ('Men''s', 0), ('Women''s', 1)
) as d(name, sort_order)
where t.slug in ('2023-superbowl', '2023-march-madness', '2023-heat-stroker', '2023-halloween')
on conflict (tournament_id, name) do nothing;

insert into public.divisions (tournament_id, name, sort_order)
select t.id, 'Coed', 0
from public.tournaments t
where t.slug in ('2023-bill-given-memorial', '2023-coed-heat-stroker', '2023-toys-4-tots')
on conflict (tournament_id, name) do nothing;
