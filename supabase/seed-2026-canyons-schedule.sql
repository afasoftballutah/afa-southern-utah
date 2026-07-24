-- The 2026 Canyons schedule — the six-event Southern Utah season from the
-- league's own schedule poster (southernutah.png, director-supplied; see
-- power-desktop session-data/afa/afa-visual-direction.md source list).
-- Coexists with the NV/UT/AZ eleven per JD ruling 2026-07-23: "both are
-- real — keep both." Applied live 2026-07-23 via the Management API.
-- All facts verbatim from the poster: $375 ($250 Toys 4 Kids), 4GG, The
-- Canyons Sports Complex, contacts Josh Christianson / Miles Yablonovsky /
-- Aubrey Murdock / Joey Markakis. Groups per event as printed (Men's/
-- Women's or Coed); no Rec/E/D/Open breakdown given on this poster.
insert into public.tournaments (slug,name,start_date,end_date,venue_name,venue_address,entry_fee_cents,game_guarantee,divisions_offered,region,is_placeholder,status,contacts) values
 ('2026-superbowl-canyons','Superbowl Softball Tournament','2026-01-23','2026-01-24','The Canyons Sports Complex','St. George, UT',37500,'4GG','Men''s, Women''s','southern_utah',false,'complete','[{"name":"Josh Christianson","phone":"435-680-2450"},{"name":"Miles Yablonovsky","phone":"435-627-4563"},{"name":"Aubrey Murdock","phone":"435-770-1977"},{"name":"Joey Markakis","phone":"702-860-7060"}]'::jsonb),
 ('2026-march-madness','March Madness Softball Tournament','2026-03-27','2026-03-28','The Canyons Sports Complex','St. George, UT',37500,'4GG','Men''s, Women''s','southern_utah',false,'complete','[{"name":"Josh Christianson","phone":"435-680-2450"},{"name":"Miles Yablonovsky","phone":"435-627-4563"},{"name":"Aubrey Murdock","phone":"435-770-1977"},{"name":"Joey Markakis","phone":"702-860-7060"}]'::jsonb),
 ('2026-heat-stroker','Heat Stroker Softball Tournament','2026-07-10','2026-07-11','The Canyons Sports Complex','St. George, UT',37500,'4GG','Men''s, Women''s','southern_utah',false,'complete','[{"name":"Josh Christianson","phone":"435-680-2450"},{"name":"Miles Yablonovsky","phone":"435-627-4563"},{"name":"Aubrey Murdock","phone":"435-770-1977"},{"name":"Joey Markakis","phone":"702-860-7060"}]'::jsonb),
 ('2026-coed-heat-stroker','Coed Heat Stroker Softball Tournament','2026-07-24','2026-07-25','The Canyons Sports Complex','St. George, UT',37500,'4GG','Coed','southern_utah',false,'upcoming','[{"name":"Josh Christianson","phone":"435-680-2450"},{"name":"Miles Yablonovsky","phone":"435-627-4563"},{"name":"Aubrey Murdock","phone":"435-770-1977"},{"name":"Joey Markakis","phone":"702-860-7060"}]'::jsonb),
 ('2026-halloween','Halloween Softball Tournament','2026-10-23','2026-10-24','The Canyons Sports Complex','St. George, UT',37500,'4GG','Men''s, Women''s','southern_utah',false,'upcoming','[{"name":"Josh Christianson","phone":"435-680-2450"},{"name":"Miles Yablonovsky","phone":"435-627-4563"},{"name":"Aubrey Murdock","phone":"435-770-1977"},{"name":"Joey Markakis","phone":"702-860-7060"}]'::jsonb),
 ('2026-toys-4-kids','Toys 4 Kids Softball Tournament','2026-12-04','2026-12-05','The Canyons Sports Complex','St. George, UT',25000,'4GG','Coed','southern_utah',false,'upcoming','[{"name":"Josh Christianson","phone":"435-680-2450"},{"name":"Miles Yablonovsky","phone":"435-627-4563"},{"name":"Aubrey Murdock","phone":"435-770-1977"},{"name":"Joey Markakis","phone":"702-860-7060"}]'::jsonb)
on conflict (slug) do nothing;
