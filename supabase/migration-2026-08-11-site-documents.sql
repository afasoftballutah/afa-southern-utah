-- Director-editable site documents: rules, umpire agreements, waivers, other.
-- Service_role only; public pages read via server (same posture as news_posts).

create table if not exists public.site_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null
    check (kind in ('rules', 'umpire_agreement', 'waiver', 'other')),
  title text not null,
  body text not null default '',
  source_url text,
  published boolean not null default true,
  sort_order int not null default 0,
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.site_documents is
  'Director-authored rules, umpire agreements, waivers, and other public docs.';

comment on column public.site_documents.kind is
  'rules | umpire_agreement | waiver | other';

comment on column public.site_documents.source_url is
  'Optional external PDF or reference link (e.g. national rule book).';

comment on column public.site_documents.version is
  'Optional version tag; used for active waiver (release_text_version).';

create index if not exists idx_site_documents_kind_pub
  on public.site_documents (kind, published, sort_order, updated_at desc);

alter table public.site_documents enable row level security;

grant all on public.site_documents to service_role;

-- Seed the liability release so directors can edit without a blank slate.
-- Idempotent: only inserts when the slug is missing.
insert into public.site_documents (
  slug, kind, title, body, published, sort_order, version
)
select
  'player-liability-release',
  'waiver',
  'Player / Manager Liability Release',
  'I have read this release and waiver of liability for the American Fastpitch Association (AFA) and in consideration of being allowed to participate in any way in AFA related events and activities, the undersigned agree to not hold liable the association, directors, schools or parks where softball/baseball events are to take place. In case I am injured during practice/games on premises I give up my right to file a claim(s against the AFA. I understand that I have given up substantial rights by signing this form and I have signed it freely and voluntarily.',
  true,
  0,
  'waiver-2026-v1'
where not exists (
  select 1 from public.site_documents where slug = 'player-liability-release'
);

insert into public.site_documents (
  slug, kind, title, body, source_url, published, sort_order
)
select
  'afa-slow-pitch-rule-book',
  'rules',
  'AFA Slow Pitch Rule Book (2020)',
  'The official AFA slow-pitch rule book is available as a PDF. Tournament-specific house rules appear on each tournament page.

Directors can add Southern Utah notes or house rules as additional Rules documents on this desk.',
  'https://afasoftball.com/wp-content/uploads/2023/01/Slow-Pitch-Rule-Book-2020.pdf',
  true,
  0
where not exists (
  select 1 from public.site_documents where slug = 'afa-slow-pitch-rule-book'
);

insert into public.site_documents (
  slug, kind, title, body, published, sort_order
)
select
  'umpire-agreement',
  'umpire_agreement',
  'Umpire Agreement',
  'Edit this document from Director → Documents.

Typical contents: pay rates, arrival times, dress code, no-show policy, and how to accept assignments for Southern Utah tournaments.',
  true,
  0
where not exists (
  select 1 from public.site_documents where slug = 'umpire-agreement'
);
