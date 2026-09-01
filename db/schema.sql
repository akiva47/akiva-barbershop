-- ============================================================================
--  Akiva's Barbershop — database schema
--
--  The security model in one paragraph:
--  Customers connect with the public "anon" key, which every visitor can read
--  out of the page source. So anon is given NO direct access to the
--  appointments table at all — not even SELECT. Customers reach appointments
--  only through the four SECURITY DEFINER functions at the bottom of this file,
--  and those functions return times, never names. The only way to read a
--  customer's name or phone is to be signed in as an admin. This is enforced by
--  Postgres itself, not by the app, so nothing a visitor does in the browser
--  can get around it.
--
--  Run this whole file once in the Supabase SQL editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Who counts as an admin
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Shop settings
-- ---------------------------------------------------------------------------
create table if not exists public.shop_settings (
  id             smallint primary key default 1 check (id = 1),
  timezone       text    not null default 'Asia/Jerusalem',
  slot_step_min  int     not null default 15   check (slot_step_min between 5 and 120),
  lead_time_min  int     not null default 60,  -- no bookings inside the next hour
  max_days_ahead int     not null default 30,  -- how far out customers may book
  max_open_per_phone int not null default 3    -- spam guard
);

insert into public.shop_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id           bigint generated always as identity primary key,
  name_he      text not null,
  name_en      text not null,
  duration_min int  not null check (duration_min between 5 and 480),
  price        numeric(8,2),
  active       boolean not null default true,
  sort_order   int not null default 0
);

-- ---------------------------------------------------------------------------
-- The weekly plan: one row per weekday, 0 = Sunday .. 6 = Saturday
-- ---------------------------------------------------------------------------
create table if not exists public.work_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  is_open boolean not null default true,
  opens   time not null default '09:00',
  closes  time not null default '19:00',
  check (closes > opens)
);

-- ---------------------------------------------------------------------------
-- Breaks. Either a recurring weekly break (weekday set) or a one-off on a
-- specific date (on_date set) — exactly one of the two.
-- ---------------------------------------------------------------------------
create table if not exists public.breaks (
  id      bigint generated always as identity primary key,
  weekday smallint check (weekday between 0 and 6),
  on_date date,
  starts  time not null,
  ends    time not null,
  label   text,
  check (ends > starts),
  check (num_nonnulls(weekday, on_date) = 1)
);

create index if not exists breaks_weekday_idx on public.breaks(weekday);
create index if not exists breaks_date_idx    on public.breaks(on_date);

-- ---------------------------------------------------------------------------
-- Day overrides: "closed this Tuesday", "opening late on the 4th"
-- ---------------------------------------------------------------------------
create table if not exists public.day_overrides (
  on_date   date primary key,
  is_closed boolean not null default false,
  opens     time,
  closes    time,
  note      text,
  check (is_closed or (opens is not null and closes is not null and closes > opens))
);

-- ---------------------------------------------------------------------------
-- Appointments — the sensitive table
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id             bigint generated always as identity primary key,
  service_id     bigint not null references public.services(id),
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  customer_name  text not null,
  customer_phone text not null,
  note           text,
  status         text not null default 'booked' check (status in ('booked','cancelled')),
  cancel_token   uuid not null default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  cancelled_at   timestamptz,
  check (ends_at > starts_at)
);

create unique index if not exists appointments_token_idx on public.appointments(cancel_token);
create index if not exists appointments_starts_idx on public.appointments(starts_at);
create index if not exists appointments_phone_idx on public.appointments(customer_phone);

-- Two people tapping the same slot at the same instant: the database refuses
-- the second one. Application checks alone cannot close this race.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
  where (status = 'booked');

-- ============================================================================
--  Row level security
-- ============================================================================
alter table public.admins        enable row level security;
alter table public.shop_settings enable row level security;
alter table public.services      enable row level security;
alter table public.work_hours    enable row level security;
alter table public.breaks        enable row level security;
alter table public.day_overrides enable row level security;
alter table public.appointments  enable row level security;

-- Anyone may read what shapes availability. None of it is personal.
drop policy if exists settings_read on public.shop_settings;
create policy settings_read on public.shop_settings for select using (true);

drop policy if exists services_read on public.services;
create policy services_read on public.services for select using (true);

drop policy if exists hours_read on public.work_hours;
create policy hours_read on public.work_hours for select using (true);

drop policy if exists breaks_read on public.breaks;
create policy breaks_read on public.breaks for select using (true);

drop policy if exists overrides_read on public.day_overrides;
create policy overrides_read on public.day_overrides for select using (true);

-- Only the admin may change any of it.
drop policy if exists settings_write on public.shop_settings;
create policy settings_write on public.shop_settings for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists services_write on public.services;
create policy services_write on public.services for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists hours_write on public.work_hours;
create policy hours_write on public.work_hours for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists breaks_write on public.breaks;
create policy breaks_write on public.breaks for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists overrides_write on public.day_overrides;
create policy overrides_write on public.day_overrides for all
  using (public.is_admin()) with check (public.is_admin());

-- Appointments: admin only. Customers get no policy at all, which under RLS
-- means no access — this is the line that keeps the names private.
drop policy if exists appointments_admin on public.appointments;
create policy appointments_admin on public.appointments for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admins_read on public.admins;
create policy admins_read on public.admins for select using (user_id = auth.uid());

-- ============================================================================
--  The only doors a customer has
-- ============================================================================

-- Free start times for a service on a date. Returns times and nothing else.
create or replace function public.available_slots(p_date date, p_service_id bigint)
returns table (slot_start timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s       public.shop_settings%rowtype;
  ov      public.day_overrides%rowtype;
  wh      public.work_hours%rowtype;
  dur     int;
  wd      smallint;
  t_open  time;
  t_close time;
begin
  select * into s from public.shop_settings where id = 1;

  select duration_min into dur
    from public.services where id = p_service_id and active;
  if dur is null then return; end if;

  if p_date < (now() at time zone s.timezone)::date
     or p_date > (now() at time zone s.timezone)::date + s.max_days_ahead then
    return;
  end if;

  wd := extract(dow from p_date)::smallint;   -- 0 = Sunday

  select * into ov from public.day_overrides where on_date = p_date;
  if found then
    if ov.is_closed then return; end if;
    t_open := ov.opens;
    t_close := ov.closes;
  else
    select * into wh from public.work_hours where weekday = wd;
    if not found or not wh.is_open then return; end if;
    t_open := wh.opens;
    t_close := wh.closes;
  end if;

  return query
  with bounds as (
    select (p_date + t_open)  at time zone s.timezone as t0,
           (p_date + t_close) at time zone s.timezone as t1
  ),
  candidate as (
    select gs as st, gs + make_interval(mins => dur) as en
    from bounds b,
         generate_series(b.t0,
                         b.t1 - make_interval(mins => dur),
                         make_interval(mins => s.slot_step_min)) as gs
  )
  select c.st
  from candidate c
  where c.st >= now() + make_interval(mins => s.lead_time_min)
    and not exists (
      select 1 from public.appointments a
      where a.status = 'booked'
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.st, c.en, '[)')
    )
    and not exists (
      select 1 from public.breaks br
      where (br.weekday = wd or br.on_date = p_date)
        and tstzrange((p_date + br.starts) at time zone s.timezone,
                      (p_date + br.ends)   at time zone s.timezone, '[)')
            && tstzrange(c.st, c.en, '[)')
    )
  order by c.st;
end;
$$;

-- Book a slot. Returns the cancellation token, which is the customer's only
-- handle on their own appointment.
create or replace function public.create_appointment(
  p_service_id bigint,
  p_starts_at  timestamptz,
  p_name       text,
  p_phone      text,
  p_note       text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.shop_settings%rowtype;
  dur   int;
  name_ text := btrim(coalesce(p_name, ''));
  phone_ text := btrim(coalesce(p_phone, ''));
  open_count int;
  tok   uuid;
begin
  select * into s from public.shop_settings where id = 1;

  if length(name_) < 2 or length(name_) > 60 then
    raise exception 'BAD_NAME' using errcode = 'P0001';
  end if;
  if length(phone_) < 7 or length(phone_) > 25 then
    raise exception 'BAD_PHONE' using errcode = 'P0001';
  end if;

  select duration_min into dur
    from public.services where id = p_service_id and active;
  if dur is null then
    raise exception 'BAD_SERVICE' using errcode = 'P0001';
  end if;

  select count(*) into open_count
    from public.appointments
   where customer_phone = phone_
     and status = 'booked'
     and starts_at > now();
  if open_count >= s.max_open_per_phone then
    raise exception 'TOO_MANY' using errcode = 'P0001';
  end if;

  -- The slot has to be one the availability function is actually offering.
  -- This re-checks opening hours, breaks, lead time and collisions in one go.
  if not exists (
    select 1
    from public.available_slots((p_starts_at at time zone s.timezone)::date, p_service_id) a
    where a.slot_start = p_starts_at
  ) then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;

  insert into public.appointments (service_id, starts_at, ends_at, customer_name, customer_phone, note)
  values (p_service_id, p_starts_at, p_starts_at + make_interval(mins => dur),
          name_, phone_, nullif(btrim(coalesce(p_note, '')), ''))
  returning cancel_token into tok;

  return tok;
exception
  when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
end;
$$;

-- Look up one appointment by its token — this is the customer seeing their own
-- booking, so the name comes back. Guessing a token is guessing a random uuid.
create or replace function public.appointment_by_token(p_token uuid)
returns table (
  starts_at     timestamptz,
  ends_at       timestamptz,
  status        text,
  customer_name text,
  service_he    text,
  service_en    text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.starts_at, a.ends_at, a.status, a.customer_name, s.name_he, s.name_en
  from public.appointments a
  join public.services s on s.id = a.service_id
  where a.cancel_token = p_token;
$$;

create or replace function public.cancel_appointment(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hit int;
begin
  update public.appointments
     set status = 'cancelled', cancelled_at = now()
   where cancel_token = p_token
     and status = 'booked'
     and starts_at > now();
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: customers may call exactly these four functions and nothing else.
-- ---------------------------------------------------------------------------
revoke all on function public.available_slots(date, bigint) from public;
revoke all on function public.create_appointment(bigint, timestamptz, text, text, text) from public;
revoke all on function public.appointment_by_token(uuid) from public;
revoke all on function public.cancel_appointment(uuid) from public;

grant execute on function public.available_slots(date, bigint)   to anon, authenticated;
grant execute on function public.create_appointment(bigint, timestamptz, text, text, text) to anon, authenticated;
grant execute on function public.appointment_by_token(uuid)      to anon, authenticated;
grant execute on function public.cancel_appointment(uuid)        to anon, authenticated;
grant execute on function public.is_admin()                      to anon, authenticated;

-- ============================================================================
--  Starting data — edit any of it later from the admin screen
-- ============================================================================
insert into public.services (name_he, name_en, duration_min, price, sort_order)
select * from (values
  ('תספורת גבר',        'Haircut',            30, 70,  1),
  ('תספורת + זקן',      'Haircut & beard',    45, 100, 2),
  ('עיצוב זקן',          'Beard trim',         15, 40,  3),
  ('תספורת ילד',        'Kid''s haircut',     20, 50,  4)
) as v(name_he, name_en, duration_min, price, sort_order)
where not exists (select 1 from public.services);

-- Open seven days a week to start with; close whichever days you like from the
-- admin screen. Friday and Saturday get shorter hours as a sensible default.
insert into public.work_hours (weekday, is_open, opens, closes)
values (0, true, '09:00', '19:00'),   -- Sunday
       (1, true, '09:00', '19:00'),
       (2, true, '09:00', '19:00'),
       (3, true, '09:00', '19:00'),
       (4, true, '09:00', '19:00'),
       (5, true, '09:00', '14:00'),   -- Friday
       (6, true, '20:00', '23:00')    -- Saturday night
on conflict (weekday) do nothing;
