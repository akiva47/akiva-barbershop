# המספרה של עקיבא · Akiva's Barbershop

Appointment booking for a one-chair barbershop, in Hebrew and English.
Customers see free times. Only the admin sees who booked them.

## How the privacy actually works

This matters more than any feature, so it is worth being precise.

The site is static files. Anyone can read the JavaScript, and anyone can read
the "anon" API key out of it — that key is *meant* to be public. So the app is
built on the assumption that a visitor can send any request they like:

- The `appointments` table has **one** row level security policy, and it grants
  access only to an admin. A visitor has no policy, and under RLS no policy
  means no access. They cannot read a name, a phone number or a note, whatever
  request they craft.
- Customers reach appointments only through four `SECURITY DEFINER` functions:
  `available_slots`, `create_appointment`, `appointment_by_token`,
  `cancel_appointment`. The first returns times and nothing else. The third
  needs the random uuid from the customer's own cancellation link.
- Opening hours, breaks, special days and services are readable by everyone —
  they have to be, to show availability — but writable only by an admin.

None of this is enforced in the browser. It is enforced by Postgres.

## Setup

### 1. Create the Supabase project

At [supabase.com](https://supabase.com), create a free project. Pick a region
close to Israel (Frankfurt is the usual choice).

### 2. Create the tables

Open **SQL Editor**, paste the whole of `db/schema.sql`, and run it. It is safe
to run more than once.

### 3. Create your admin account

In **Authentication → Users → Add user**, create a user with your email and a
password, and tick "Auto confirm user". Copy the user's UUID, then run this in
the SQL editor:

```sql
insert into public.admins (user_id) values ('PASTE-YOUR-USER-UUID');
```

Anyone not in that table is just a visitor, even if they can sign in.

### 4. Point the app at the project

In **Settings → API**, copy the Project URL and the `anon` `public` key into
`js/config.js`.

Never put the `service_role` key in this file. That one bypasses every policy
above.

### 5. Publish

Push to GitHub and turn on Pages, the same way as any static site.

## What you can change without touching code

Everything below lives in the database and is edited from `admin.html`:

| Screen | What it controls |
| --- | --- |
| Diary | Every booking for a day, with name and phone. Tap to call, ✕ to cancel |
| Opening hours | Which of the seven days you work, and from when to when |
| Breaks | Recurring weekly breaks — lunch, prayer, a standing appointment |
| Special days | One-off closures or different hours for a specific date |
| Services | Names in both languages, duration, price, active or not |

Slot length follows the service duration. The step between offered start times,
the booking lead time and how far ahead customers may book live in the
`shop_settings` row.

## Layout

```
index.html          customer booking
admin.html          your diary and settings
cancel.html         the page a customer's cancellation link opens
db/schema.sql       tables, policies and functions — the security model
js/config.js        your project URL and anon key
js/i18n.js          every string, Hebrew and English
js/common.js        database client, language, date formatting
js/booking.js       customer flow
js/admin.js         admin screens
js/supabase.js      the Supabase client, vendored so there is no CDN to trust
css/app.css         one stylesheet; logical properties flip it for Hebrew
```

## Known limits

- **No reminders.** A web app cannot schedule a notification. Customers do not
  get an SMS or an email; the cancellation link is the whole handshake.
- **One chair.** The schema assumes a single barber. A second chair would mean
  adding a provider column to appointments and to availability.
- **The cancellation link is the only key a customer has.** Lose it and they
  have to phone you. That is deliberate: the alternative is customer accounts.
