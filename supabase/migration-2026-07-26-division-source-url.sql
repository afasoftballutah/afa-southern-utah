-- Hourly results sync (JD, 2026-07-26: "can you just pull the results in
-- every hour?"). The league runs the same tournament on QuickScores; up
-- to now JD kept both in step by hand. This column is the only thing the
-- sync needs that the schema did not already have: WHERE a division's
-- results live upstream.
--
-- One URL per division, because QuickScores models this tournament as
-- four separate "leagues" — the pool-play league plus one per bracket —
-- and each has its own page and its own id. A division with no URL is
-- simply not synced, which is how every other tournament stays untouched.
alter table public.divisions
  add column if not exists source_url text;

comment on column public.divisions.source_url is
  'Upstream results page for this division (QuickScores ResultsDisplay). Read hourly by /api/sync/quickscores; null means never synced.';

update public.divisions set source_url = 'https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1728825'
 where id = '61b465ee-e0b9-489c-aeeb-274fa11f8a34'; -- Coed (pool play)
update public.divisions set source_url = 'https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1732184'
 where id = '00e80340-8db4-4149-bb8f-c77cb1e6e425'; -- Gold
update public.divisions set source_url = 'https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1732185'
 where id = '54a34837-0573-4ad8-87a3-2feaef7024a8'; -- Silver
update public.divisions set source_url = 'https://www.quickscores.com/Orgs/ResultsDisplay.php?OrgDir=sgcity&LeagueID=1733457'
 where id = '5f95d12b-ada4-4657-a23b-025f35cc9cc7'; -- Bronze
