-- ============================================================================
--  The showcase site: everything the new landing page shows, editable from
--  the admin screen.
--
--  Same security model as the rest of the schema: everything here is public
--  to READ (it is what the shop's website displays) and writable only by an
--  account listed in public.admins. No customer data lives in any of these
--  tables.
--
--  Hebrew text is deliberately absent from this file. Every text column is
--  nullable and the app falls back to its own built-in wording, so no Hebrew
--  has to survive a trip through the SQL editor (see the earlier fix migration
--  for why that matters).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Site content: one row, like shop_settings
-- ---------------------------------------------------------------------------
create table if not exists public.site_content (
  id              smallint primary key default 1 check (id = 1),

  hero_title_he   text,
  hero_title_en   text,
  hero_sub_he     text,
  hero_sub_en     text,
  hero_image_url  text,            -- a photo from the gallery, or empty for the animated pole

  marquee_he      text,            -- words separated by commas
  marquee_en      text,

  about_title_he  text,
  about_title_en  text,
  about_he        text,
  about_en        text,
  about_image_url text,

  stat_years      int check (stat_years   is null or stat_years   >= 0),
  stat_clients    int check (stat_clients is null or stat_clients >= 0),
  stat_cuts       int check (stat_cuts    is null or stat_cuts    >= 0),

  phone           text,
  whatsapp        text,            -- digits, international, e.g. 972501234567
  instagram       text,            -- a full URL or a bare handle
  tiktok          text,
  facebook        text,
  address_he      text,
  address_en      text,
  waze_url        text,
  maps_url        text,
  bit_url         text,            -- overrides BIT_URL in js/config.js when set

  updated_at      timestamptz not null default now()
);

insert into public.site_content (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Gallery: photos of Akiva's work. The file itself lives in Storage; this row
-- holds where it is, its captions and its place in the order.
-- ---------------------------------------------------------------------------
create table if not exists public.gallery (
  id          bigint generated always as identity primary key,
  path        text not null unique,   -- object path inside the "gallery" bucket
  url         text not null,          -- its public URL
  width       int,
  height      int,
  caption_he  text,
  caption_en  text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists gallery_order_idx on public.gallery(sort_order, id);

-- ---------------------------------------------------------------------------
-- Testimonials: typed in by the admin from what real customers said
-- ---------------------------------------------------------------------------
create table if not exists public.testimonials (
  id          bigint generated always as identity primary key,
  author      text not null check (length(btrim(author)) between 1 and 60),
  body        text not null check (length(btrim(body))   between 1 and 600),
  rating      smallint not null default 5 check (rating between 1 and 5),
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Services get an optional one-line description for the service cards
-- ---------------------------------------------------------------------------
alter table public.services add column if not exists description_he text;
alter table public.services add column if not exists description_en text;

-- ============================================================================
--  Row level security: read for all, write for the admin
-- ============================================================================
alter table public.site_content enable row level security;
alter table public.gallery      enable row level security;
alter table public.testimonials enable row level security;

drop policy if exists site_content_read on public.site_content;
create policy site_content_read on public.site_content for select using (true);
drop policy if exists site_content_write on public.site_content;
create policy site_content_write on public.site_content for all
  using (public.is_admin()) with check (public.is_admin());

-- Visitors see only the photos that are switched on; the admin sees them all.
drop policy if exists gallery_read on public.gallery;
create policy gallery_read on public.gallery for select
  using (active or public.is_admin());
drop policy if exists gallery_write on public.gallery;
create policy gallery_write on public.gallery for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists testimonials_read on public.testimonials;
create policy testimonials_read on public.testimonials for select
  using (active or public.is_admin());
drop policy if exists testimonials_write on public.testimonials;
create policy testimonials_write on public.testimonials for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.site_content, public.gallery, public.testimonials
  to anon, authenticated;
grant insert, update, delete on public.site_content, public.gallery, public.testimonials
  to authenticated;
grant select on public.services to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ============================================================================
--  Storage: a public bucket for the photos
--
--  Public means anyone can fetch a photo by its URL, which is the point — they
--  are on the website. Uploading, replacing and deleting are admin only.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gallery_admin_insert on storage.objects;
create policy gallery_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.is_admin());

drop policy if exists gallery_admin_update on storage.objects;
create policy gallery_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and public.is_admin())
  with check (bucket_id = 'gallery' and public.is_admin());

drop policy if exists gallery_admin_delete on storage.objects;
create policy gallery_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and public.is_admin());

-- The admin needs to see objects to replace or delete them.
drop policy if exists gallery_admin_select on storage.objects;
create policy gallery_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'gallery' and public.is_admin());
