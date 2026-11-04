-- ============================================================================
--  Notifications from the site itself (Web Push)
--
--  * Akiva: every alert that already goes to Telegram/WhatsApp also goes, as
--    a phone notification, to each device where he switched them on.
--  * Customers: a reminder the day before and an hour before, if they asked
--    for one after booking.
--
--  The sending is done by the Edge Function "push"
--  (supabase/functions/push/index.ts), because Web Push needs encryption and
--  signing that Postgres cannot do. The database calls it: on every alert
--  through notify_send(), and every five minutes through pg_cron to send the
--  reminders that are due.
--
--  The signing keys are created in the admin's browser the first time he
--  switches notifications on; the private half is kept in notify_settings,
--  which only an admin (and the Edge Function, with the service key) can
--  read. The public half goes in site_content so customers' browsers can use
--  it. Nothing has to be copied by hand.
-- ============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.notify_settings add column if not exists vapid_public  text;
alter table public.notify_settings add column if not exists vapid_private text;
alter table public.notify_settings add column if not exists push_secret   text not null default gen_random_uuid()::text;
alter table public.site_content    add column if not exists push_public_key text;

alter table public.appointments add column if not exists reminded_day_at  timestamptz;
alter table public.appointments add column if not exists reminded_hour_at timestamptz;

-- One row per device and purpose: the admin's devices, and each customer
-- device tied to the booking it wants reminders for.
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  is_admin   boolean not null default false,
  token      uuid,              -- the booking's cancel token, for customers
  created_at timestamptz not null default now(),
  unique (endpoint, token)
);
create unique index if not exists push_admin_endpoint on public.push_subscriptions(endpoint) where is_admin;
create index if not exists push_token_idx on public.push_subscriptions(token);

alter table public.push_subscriptions enable row level security;
drop policy if exists push_admin_all on public.push_subscriptions;
create policy push_admin_all on public.push_subscriptions for all
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.push_subscriptions from anon;
grant select, delete on public.push_subscriptions to authenticated;

-- The only door: a customer may register for their own booking (they hold its
-- token); a device becomes an admin device only for a signed-in admin.
create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text,
                                            p_token uuid default null, p_admin boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'BAD_SUBSCRIPTION' using errcode = 'P0001';
  end if;
  if p_admin then
    if not public.is_admin() then raise exception 'NOT_ADMIN' using errcode = 'P0001'; end if;
    insert into public.push_subscriptions (endpoint, p256dh, auth, is_admin, token)
    values (p_endpoint, p_p256dh, p_auth, true, null)
    on conflict (endpoint) where is_admin do update set p256dh = excluded.p256dh, auth = excluded.auth;
    return true;
  end if;
  if not exists (select 1 from public.appointments
                  where cancel_token = p_token and status = 'booked' and starts_at > now()) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, is_admin, token)
  values (p_endpoint, p_p256dh, p_auth, false, p_token)
  on conflict (endpoint, token) do update set p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end;
$$;
revoke all on function public.save_push(text, text, text, uuid, boolean) from public;
grant execute on function public.save_push(text, text, text, uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Calling the Edge Function. The anon key below is the same public key the
-- website already carries; it only gets the call past the gateway. What the
-- function trusts is push_secret, which it checks against this table.
-- ---------------------------------------------------------------------------
create or replace function public.push_call(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.notify_settings%rowtype;
begin
  select * into n from public.notify_settings where id = 1;
  if not found or n.vapid_private is null then return; end if;   -- not switched on yet
  perform net.http_post(
    url     := 'https://qvwncsjqlaextvlifmaz.supabase.co/functions/v1/push',
    body    := p_body || jsonb_build_object('secret', n.push_secret),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2d25jc2pxbGFleHR2bGlmbWF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyOTQwMDQsImV4cCI6MjEwMzg3MDAwNH0.pFUKBgU-0V_7PKmlxfNCrbQnbNh7YZAYO-YamdJ_vp0')
  );
exception when others then null;
end;
$$;
revoke all on function public.push_call(jsonb) from public, anon, authenticated;

-- Every alert Akiva already gets now also goes to his devices: the first line
-- is the notification's title, the rest its text.
create or replace function public.notify_send(p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.notify_settings%rowtype;
begin
  select * into n from public.notify_settings where id = 1;
  if not found then return; end if;

  if coalesce(btrim(n.telegram_token), '') <> '' and coalesce(btrim(n.telegram_chat_id), '') <> '' then
    begin
      perform net.http_post(
        url  := 'https://api.telegram.org/bot' || btrim(n.telegram_token) || '/sendMessage',
        body := jsonb_build_object('chat_id', btrim(n.telegram_chat_id), 'text', p_text)
      );
    exception when others then null;
    end;
  end if;

  if coalesce(btrim(n.wa_phone), '') <> '' and coalesce(btrim(n.wa_apikey), '') <> '' then
    begin
      perform net.http_get(
        url    := 'https://api.callmebot.com/whatsapp.php',
        params := jsonb_build_object('phone', regexp_replace(n.wa_phone, '\D', '', 'g'),
                                     'text', p_text, 'apikey', btrim(n.wa_apikey))
      );
    exception when others then null;
    end;
  end if;

  perform public.push_call(jsonb_build_object(
    'audience', 'admin',
    'title', split_part(p_text, E'\n', 1),
    'body',  btrim(substr(p_text, length(split_part(p_text, E'\n', 1)) + 1)),
    'url',   'admin.html'
  ));
exception when others then
  null;
end;
$$;
revoke all on function public.notify_send(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Every five minutes: ask the function to send the reminders that are due.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'push-reminders';
exception when others then null;
end;
$$;
select cron.schedule('push-reminders', '*/5 * * * *',
  $$ select public.push_call(jsonb_build_object('audience', 'reminders')) $$);
