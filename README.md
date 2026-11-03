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

Open **SQL Editor**, paste the whole of `supabase/migrations/*_init_barbershop.sql`, and run it. It is safe
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
| Dashboard | Today's and this week's bookings, expected income, the next client, quick actions |
| Diary | Every booking for a day, with name and phone. Call, WhatsApp, cancel, delete, or add a booking taken by phone |
| Gallery | Upload photos of your work (resized in the browser before upload), captions in both languages, order, show/hide, pick the hero and "about" photos |
| Services | Names and short descriptions in both languages, duration, price or price range, order, active or not |
| Hours & days | Weekly opening hours, recurring breaks, one-off closures or different hours |
| Site content | Hero title and subtitle, the running words, the about text, the numbers section, phone, WhatsApp, Instagram/TikTok/Facebook, address, Waze/Maps, Bit link. Anything left empty falls back to the built-in wording |
| Testimonials | What real clients said, with a star rating. The section is hidden while there are none |
| Settings | Step between start times, booking lead time, how far ahead customers may book, open bookings per phone |

The photos live in a public Supabase Storage bucket called `gallery`. Anyone
can view a photo by its URL (they are on the website); only the admin can
upload or delete. The bucket and its policies are created by
`supabase/migrations/20261103120000_showcase_site.sql`.

## The customer site

`index.html` is the shop's website and booking in one page: an animated hero
showing the next free slot, the price list, a scroll-driven gallery, hours with
an "open now" badge, contact buttons and a WhatsApp button. Booking opens as a
full-screen sheet (service, then day and time, then name and phone) and ends
with an "add to calendar" file, the cancel link and the Bit button. Bookings
made on a phone are remembered on that phone under "My bookings".

All motion is plain CSS and JavaScript in `js/fx.js` (no libraries), and it is
switched off for anyone whose device asks for reduced motion.

## Booking alerts

`supabase/migrations/20261103150000_booking_notifications.sql` adds a trigger
on `appointments` that messages Akiva whenever a customer books or cancels. The
message is sent from Postgres through `pg_net`, so it arrives even when no
browser is open. Bookings the admin adds by hand do not trigger it.

Channels, set up from **Settings → Booking alerts** in the admin:

- **Telegram** (recommended): create a bot with @BotFather, paste its token,
  message the bot once, then tap "Find automatically" to fill in the chat id.
- **WhatsApp** through CallMeBot, a free outside service: their bot replies
  with an API key once you message it.

The keys live in `notify_settings`, readable and writable only by an admin.
`notify_send` is not executable by `anon` or `authenticated`, so visitors
cannot use it to send messages; `notify_test` is admin only.

## Known limits

- **No reminders for customers.** Customers do not get an SMS or an email; the
  cancellation link and the calendar file are the whole handshake. (Akiva does
  get an alert for each booking, see above.)
- **One chair.** The schema assumes a single barber. A second chair would mean
  adding a provider column to appointments and to availability.
- **The cancellation link is the only key a customer has.** Lose it and they
  have to phone you. That is deliberate: the alternative is customer accounts.
