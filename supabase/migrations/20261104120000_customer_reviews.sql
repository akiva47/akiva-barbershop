-- ============================================================================
--  Customers can write a review. It waits for Akiva's approval.
--
--  A visitor still cannot touch the testimonials table: the only way in is
--  submit_review(), which checks the input, files the review switched off
--  (active = false) and pings Akiva. Visitors only ever see active reviews,
--  so nothing appears on the site until the admin approves it.
--
--  Hebrew strings travel as base64 (see 20260901221920).
-- ============================================================================

alter table public.testimonials add column if not exists source text not null default 'admin'
  check (source in ('admin', 'customer'));
alter table public.testimonials add column if not exists approved_at timestamptz;

-- Reviews written before this migration were typed in by the admin and are
-- already live.
update public.testimonials set approved_at = coalesce(approved_at, created_at)
 where source = 'admin' and active;

create or replace function public.submit_review(p_author text, p_body text, p_rating int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a text := btrim(regexp_replace(coalesce(p_author, ''), '\s+', ' ', 'g'));
  b text := btrim(coalesce(p_body, ''));
  waiting int;
begin
  if length(a) < 2 or length(a) > 40 then
    raise exception 'BAD_NAME' using errcode = 'P0001';
  end if;
  if length(b) < 5 or length(b) > 600 then
    raise exception 'BAD_REVIEW' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'BAD_REVIEW' using errcode = 'P0001';
  end if;
  -- Links are how review spam looks; a real review does not need one.
  if b ~* '(https?://|www\.|\.com\b|\.co\.il\b)' or a ~* '(https?://|www\.)' then
    raise exception 'BAD_REVIEW' using errcode = 'P0001';
  end if;
  -- Flood guard: a pile of unapproved reviews in the last day stops new ones
  -- until the admin has looked.
  select count(*) into waiting from public.testimonials
   where source = 'customer' and not active and approved_at is null
     and created_at > now() - interval '1 day';
  if waiting >= 20 then
    raise exception 'TOO_MANY' using errcode = 'P0001';
  end if;

  insert into public.testimonials (author, body, rating, active, source, sort_order)
  values (a, b, p_rating, false, 'customer',
          coalesce((select max(sort_order) from public.testimonials), 0) + 1);

  -- Tell Akiva, if alerts are set up. Never let that block the review.
  begin
    if to_regprocedure('public.notify_send(text)') is not null then
      perform public.notify_send(
        convert_from(decode('4q2QINeq15LXldeR15Qg15fXk9ep15Qg157Xl9eb15Qg15zXkNeZ16nXldeo', 'base64'), 'UTF8') || E'\n' ||
        a || ' · ' || repeat('★', p_rating) || E'\n' || b || E'\n\n' ||
        convert_from(decode('15DXpNep16gg15zXkNep16gg15DXlSDXnNee15fXldenINeR16DXmdeU15XXnCwg16rXl9eqINeU157XnNem15XXqi4=', 'base64'), 'UTF8'));
    end if;
  exception when others then null;
  end;

  return true;
end;
$$;

revoke all on function public.submit_review(text, text, int) from public;
grant execute on function public.submit_review(text, text, int) to anon, authenticated;
