-- Multiple images per news post (public URLs in storage bucket "photos").

alter table public.news_posts
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

comment on column public.news_posts.image_urls is
  'Ordered list of public image URLs (0+). Uploaded to the photos bucket.';
