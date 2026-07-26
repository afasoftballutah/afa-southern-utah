-- The hourly sync, scheduled from the DATABASE (JD, 2026-07-26: "have we
-- done the hourly scrape? surprised that hasnt come through").
--
-- It had not. GitHub Actions was the schedule, and GitHub's shared cron
-- queue is best-effort: the 06:05 run had not fired by 06:36. Top of the
-- hour is its most congested slot, and a tournament that finishes games
-- every hour cannot wait on someone else's queue.
--
-- pg_cron runs inside our own Postgres, on time, and pg_net makes the
-- call. The Actions workflow stays as a second trigger — the sync is
-- idempotent, so two callers cost nothing and either one covering for the
-- other is the point.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- APPLIED WITH THE REAL SECRET SUBSTITUTED AT RUN TIME. ${CRON_SECRET}
-- below is a placeholder: this file is in git, the secret is not. It
-- lives in .env.local and in Vercel's env, and the scheduled command
-- stored in cron.job carries the real value.

select cron.unschedule('quickscores-sync')
 where exists (select 1 from cron.job where jobname = 'quickscores-sync');

-- :23 past, deliberately: nothing else in this system runs then, and it
-- keeps the two schedules from landing on the same minute.
select cron.schedule(
  'quickscores-sync',
  '23 * * * *',
  $$
  select net.http_get(
    url := 'https://afa-southern-utah.vercel.app/api/sync/quickscores',
    headers := jsonb_build_object('Authorization', 'Bearer ${CRON_SECRET}'),
    timeout_milliseconds := 55000
  );
  $$
);
