// Edge Function "push": sends Web Push notifications for Akiva's Barbershop.
//
// Called by the database only (see supabase/migrations/20261105120000_web_push.sql):
//   { audience: "admin", title, body, url }  -> every admin device
//   { audience: "reminders" }                -> the customer reminders now due
// Every call carries notify_settings.push_secret; anything else is refused.
//
// Hebrew text is written as \u escapes so copying this file through a browser
// cannot damage it.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "Asia/Jerusalem";
const T = {
  remindTitle: "\u05ea\u05d6\u05db\u05d5\u05e8\u05ea: \u05ea\u05d5\u05e8 \u05d1\u05de\u05e1\u05e4\u05e8\u05d4 \u05e9\u05dc \u05e2\u05e7\u05d9\u05d1\u05d0",
  tomorrowAt: "\u05de\u05d7\u05e8 \u05d1\u05be",
  todayAt: "\u05d4\u05d9\u05d5\u05dd \u05d1\u05be",
  inAnHour: "\u05d1\u05e2\u05d5\u05d3 \u05e9\u05e2\u05d4, \u05d1\u05be",
  dayTail: ". \u05d0\u05dd \u05de\u05e9\u05d4\u05d5 \u05d4\u05e9\u05ea\u05e0\u05d4, \u05d0\u05e4\u05e9\u05e8 \u05dc\u05d1\u05d8\u05dc \u05d3\u05e8\u05da \u05d4\u05e7\u05d9\u05e9\u05d5\u05e8.",
  hourTail: ". \u05e0\u05ea\u05e8\u05d0\u05d4!",
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Sub = { id: number; endpoint: string; p256dh: string; auth: string };

async function sendAll(subs: Sub[], payload: Record<string, unknown>) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6 },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // The device unsubscribed or the browser dropped it: forget it.
      if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", code, String(e));
    }
  }
  return sent;
}

const fmtTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).format(d);
const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).format(d);

async function reminders() {
  const now = Date.now();
  const { data: appts, error } = await sb
    .from("appointments")
    .select("id, starts_at, created_at, cancel_token, reminded_day_at, reminded_hour_at, services(name_he)")
    .eq("status", "booked")
    .gt("starts_at", new Date(now).toISOString())
    .lte("starts_at", new Date(now + 24.25 * 3600e3).toISOString());
  if (error) throw error;
  let sent = 0;
  for (const a of appts ?? []) {
    const start = new Date(a.starts_at);
    const left = start.getTime() - now;
    const lead = start.getTime() - new Date(a.created_at).getTime();
    // deno-lint-ignore no-explicit-any
    const svc = ((a as any).services?.name_he as string) ?? "";
    let kind: "day" | "hour" | null = null;
    const mark: Record<string, string> = {};
    if (left <= 70 * 60e3 && !a.reminded_hour_at) {
      mark.reminded_hour_at = new Date().toISOString();
      if (!a.reminded_day_at) mark.reminded_day_at = mark.reminded_hour_at;
      if (lead > 90 * 60e3) kind = "hour";       // booked minutes ago: no need to remind
    } else if (left > 70 * 60e3 && !a.reminded_day_at) {
      mark.reminded_day_at = new Date().toISOString();
      if (lead > 25 * 3600e3) kind = "day";
    }
    if (!Object.keys(mark).length) continue;
    await sb.from("appointments").update(mark).eq("id", a.id);
    if (!kind) continue;
    const { data: subs } = await sb.from("push_subscriptions")
      .select("id, endpoint, p256dh, auth").eq("token", a.cancel_token);
    if (!subs?.length) continue;
    const time = fmtTime(start);
    const sameDay = fmtDay(start) === fmtDay(new Date(now));
    const body = kind === "hour"
      ? T.inAnHour + time + (svc ? " \u00b7 " + svc : "") + T.hourTail
      : (sameDay ? T.todayAt : T.tomorrowAt) + time + (svc ? " \u00b7 " + svc : "") + T.dayTail;
    sent += await sendAll(subs as Sub[], {
      title: T.remindTitle, body, url: "cancel.html?t=" + a.cancel_token, tag: "remind-" + a.id,
    });
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  const { data: n } = await sb.from("notify_settings")
    .select("push_secret, vapid_public, vapid_private").eq("id", 1).single();
  if (!n || !input.secret || input.secret !== n.push_secret) return new Response("forbidden", { status: 403 });
  if (!n.vapid_public || !n.vapid_private) return new Response("push not set up", { status: 200 });
  webpush.setVapidDetails("https://akiva47.github.io/akiva-barbershop/", n.vapid_public, n.vapid_private);

  try {
    if (input.audience === "admin") {
      const { data: subs } = await sb.from("push_subscriptions")
        .select("id, endpoint, p256dh, auth").eq("is_admin", true);
      const sent = await sendAll((subs ?? []) as Sub[], {
        title: String(input.title ?? ""), body: String(input.body ?? ""), url: String(input.url ?? "admin.html"),
      });
      return Response.json({ sent });
    }
    if (input.audience === "reminders") return Response.json({ sent: await reminders() });
    return new Response("unknown audience", { status: 400 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
