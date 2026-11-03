-- ============================================================================
--  A message to Akiva's phone whenever a customer books or cancels.
--
--  Delivery goes out from the database itself, through pg_net, so it works
--  whether or not anyone has the admin page open. Two channels, use either or
--  both:
--    * Telegram: a bot token from @BotFather and Akiva's chat id
--    * WhatsApp via CallMeBot: Akiva's number and the API key CallMeBot sends
--
--  The keys live in notify_settings, which only an admin can read or write.
--  The sending function is not callable by visitors at all, so nobody can use
--  it to send messages.
--
--  Hebrew strings travel as base64 and are decoded by Postgres, so pasting this
--  file into the SQL editor cannot mangle them (see 20260901221920).
-- ============================================================================

create extension if not exists pg_net;

create table if not exists public.notify_settings (
  id               smallint primary key default 1 check (id = 1),
  telegram_token   text,
  telegram_chat_id text,
  wa_phone         text,     -- international, e.g. 972586532121
  wa_apikey        text,
  on_new           boolean not null default true,
  on_cancel        boolean not null default true,
  updated_at       timestamptz not null default now()
);
insert into public.notify_settings (id) values (1) on conflict (id) do nothing;

alter table public.notify_settings enable row level security;
drop policy if exists notify_settings_admin on public.notify_settings;
create policy notify_settings_admin on public.notify_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- Deliberately no grant to anon: these are secrets.
revoke all on public.notify_settings from anon;
grant select, insert, update on public.notify_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Send one text to every configured channel. Never raises: a notification
-- problem must not stop a booking from being saved.
-- ---------------------------------------------------------------------------
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
exception when others then
  null;
end;
$$;

revoke all on function public.notify_send(text) from public, anon, authenticated;

-- "Wednesday 05/11 at 14:30", in Hebrew, in the shop's timezone
create or replace function public.notify_when(p_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  with s as (select timezone from public.shop_settings where id = 1),
       l as (select p_at at time zone coalesce((select timezone from s), 'Asia/Jerusalem') as t)
  select convert_from(decode('15nXlded', 'base64'), 'UTF8') || ' ' ||
         split_part(convert_from(decode('16jXkNep15XXnyzXqdeg15ks16nXnNeZ16nXmSzXqNeR15nXoteZLNeX157Xmdep15ks16nXmdep15ks16nXkdeq', 'base64'), 'UTF8'),
                    ',', extract(dow from l.t)::int + 1) || ' ' ||
         to_char(l.t, 'DD/MM') || ' ' ||
         convert_from(decode('15HXqdei15Q=', 'base64'), 'UTF8') || ' ' ||
         to_char(l.t, 'HH24:MI')
  from l;
$$;

-- ---------------------------------------------------------------------------
-- The trigger: new bookings and cancellations made by customers. Bookings
-- Akiva adds himself from the admin screen do not ping him.
-- ---------------------------------------------------------------------------
create or replace function public.appointments_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n   public.notify_settings%rowtype;
  svc text;
  msg text;
begin
  if public.is_admin() then return null; end if;

  select * into n from public.notify_settings where id = 1;
  if not found then return null; end if;

  select name_he into svc from public.services where id = new.service_id;

  if tg_op = 'INSERT' and new.status = 'booked' and n.on_new then
    msg := convert_from(decode('4pyC77iPINeq15XXqCDXl9eT16k=', 'base64'), 'UTF8') || E'\n' ||
           new.customer_name || E'\n' ||
           coalesce(svc, '') || E'\n' ||
           public.notify_when(new.starts_at) || E'\n' ||
           convert_from(decode('15jXnNek15XXnw==', 'base64'), 'UTF8') || ': ' || new.customer_phone ||
           case when new.note is not null
                then E'\n' || convert_from(decode('15TXoteo15Q=', 'base64'), 'UTF8') || ': ' || new.note
                else '' end;
  elsif tg_op = 'UPDATE' and old.status = 'booked' and new.status = 'cancelled' and n.on_cancel then
    msg := convert_from(decode('4p2MINeq15XXqCDXkdeV15jXnA==', 'base64'), 'UTF8') || E'\n' ||
           new.customer_name || ' · ' || coalesce(svc, '') || E'\n' ||
           public.notify_when(new.starts_at);
  end if;

  if msg is not null then perform public.notify_send(msg); end if;
  return null;
exception when others then
  return null;     -- never block the booking itself
end;
$$;

drop trigger if exists appointments_notify on public.appointments;
create trigger appointments_notify
  after insert or update of status on public.appointments
  for each row execute function public.appointments_notify();

-- ---------------------------------------------------------------------------
-- A test message, for the button on the admin settings screen
-- ---------------------------------------------------------------------------
create or replace function public.notify_test()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;
  perform public.notify_send(convert_from(decode(
    '15TXldeT16LXqiDXkdeT15nXp9eUINee15TXnteh16TXqNeUINep15wg16LXp9eZ15HXkC4g15TXlNeq16jXkNeV16og16LXldeR15PXldeqIOKchQ==',
    'base64'), 'UTF8'));
  return true;
end;
$$;

revoke all on function public.notify_test() from public, anon;
grant execute on function public.notify_test() to authenticated;
revoke all on function public.notify_when(timestamptz) from public, anon, authenticated;
