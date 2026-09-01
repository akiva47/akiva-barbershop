-- Akiva's real service list, and a fix for the mangled Hebrew.
--
-- The first seed arrived with its Hebrew corrupted somewhere between the
-- clipboard and the SQL editor. To make that impossible to repeat, every
-- Hebrew string below travels as base64 and is decoded by Postgres itself:
-- what crosses the wire is pure ASCII, so no encoding guess can damage it.
--
-- Rows are updated in place rather than replaced, because appointments
-- reference services and deleting one would break that link.

alter table public.services
  add column if not exists price_max numeric(8,2);

comment on column public.services.price_max is
  'Set only when the price is a range; the app then shows "price - price_max".';

update public.services set
  name_he      = convert_from(decode('16rXodek15XXqNeq','base64'),'UTF8'),
  name_en      = 'Haircut',
  duration_min = 15,
  price        = 35,
  price_max    = null,
  active       = true,
  sort_order   = 1
where id = 1;

update public.services set
  name_he      = convert_from(decode('16rXodek15XXqNeqICsg15bXp9ef','base64'),'UTF8'),
  name_en      = 'Haircut & beard',
  duration_min = 20,
  price        = 40,
  price_max    = null,
  active       = true,
  sort_order   = 2
where id = 2;

update public.services set
  name_he      = convert_from(decode('16HXmdeT15XXqCDXqteh16TXldeo16o=','base64'),'UTF8'),
  name_en      = 'Haircut tidy-up',
  duration_min = 10,
  price        = 15,
  price_max    = 20,
  active       = true,
  sort_order   = 3
where id = 3;

update public.services set
  name_he      = convert_from(decode('16HXmdeT15XXqCDXlten158=','base64'),'UTF8'),
  name_en      = 'Beard tidy-up',
  duration_min = 10,
  price        = 15,
  price_max    = null,
  active       = true,
  sort_order   = 4
where id = 4;

-- Anything beyond these four is retired rather than deleted, so any
-- appointment that already points at it keeps working.
update public.services set active = false where id > 4;

-- Let the app read the new column.
grant select on public.services to anon, authenticated;
