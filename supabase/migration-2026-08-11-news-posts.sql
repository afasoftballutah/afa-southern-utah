-- Homepage news posts — director creates; public home reads published only.

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  link_url text,
  link_label text,
  published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.news_posts is
  'Director-authored homepage news. Service_role only; public pages read via server.';

create index if not exists idx_news_posts_published
  on public.news_posts (published, published_at desc);

alter table public.news_posts enable row level security;

-- No policies for anon/authenticated — service_role only (same posture as registrations).
grant all on public.news_posts to service_role;
