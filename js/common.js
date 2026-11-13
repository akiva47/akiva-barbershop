/* Shared plumbing: the database client, language, and date formatting. */

(function () {
  "use strict";

  // GitHub Pages lets browsers keep a page for ten minutes, and a site saved to
  // the iPhone home screen holds on far longer, so a fresh deploy can go unseen.
  // Each page carries its build number; ask the server for the current one
  // (bypassing every cache) and, if it moved on, load the new page once.
  (function freshness() {
    const meta = document.querySelector('meta[name="build"]');
    if (!meta || !window.fetch) return;
    fetch(location.pathname + "?build-check=" + Date.now(), { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        const m = /<meta name="build" content="(\d+)"/.exec(html);
        if (!m || m[1] === meta.content) return;
        const key = "bb.build." + m[1];
        try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch (e) { return; }
        const u = new URL(location.href);
        u.searchParams.set("v", m[1]);     // a new address is never served from cache
        location.replace(u.toString());
      })
      .catch(() => {});
  })();

  const cfg = window.CONFIG || {};
  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf("PASTE_") === -1 &&
    cfg.SUPABASE_ANON_KEY.indexOf("PASTE_") === -1;

  window.APP = {
    configured: configured,
    tz: cfg.TIMEZONE || "Asia/Jerusalem",

    db: configured
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null,

    // ---------------------------------------------------------------- language
    lang: (function () {
      let saved = null;
      try { saved = localStorage.getItem("barbershop.lang"); } catch (e) {}
      if (saved === "he" || saved === "en") return saved;
      // Default to Hebrew unless the browser clearly prefers English.
      const nav = (navigator.language || "he").toLowerCase();
      return nav.indexOf("en") === 0 ? "en" : "he";
    })(),

    get t() { return window.I18N[this.lang]; },

    setLang: function (lang) {
      this.lang = lang;
      try { localStorage.setItem("barbershop.lang", lang); } catch (e) {}
      this.applyLang();
      document.dispatchEvent(new CustomEvent("langchange"));
    },

    applyLang: function () {
      const t = this.t;
      document.documentElement.lang = this.lang;
      document.documentElement.dir = t.dir;
      const tk = document.body && document.body.getAttribute("data-title");
      document.title = (tk && t[tk]) || t.shopName;
      document.querySelectorAll("[data-t]").forEach((el) => {
        const key = el.getAttribute("data-t");
        if (t[key] !== undefined) el.textContent = t[key];
      });
      document.querySelectorAll("[data-t-ph]").forEach((el) => {
        const key = el.getAttribute("data-t-ph");
        if (t[key] !== undefined) el.placeholder = t[key];
      });
      document.querySelectorAll("[data-lang-btn]").forEach((b) => {
        b.setAttribute("aria-pressed", b.getAttribute("data-lang-btn") === this.lang);
      });
    },

    mountLangToggle: function () {
      document.querySelectorAll("[data-lang-btn]").forEach((btn) => {
        btn.addEventListener("click", () => this.setLang(btn.getAttribute("data-lang-btn")));
      });
      this.applyLang();
    },

    // ------------------------------------------------------------------ dates
    // Everything the user sees is rendered in the shop's timezone, whatever
    // timezone their phone happens to be in.
    timeStr: function (date) {
      return new Intl.DateTimeFormat(this.t.locale, {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: this.tz
      }).format(date);
    },

    dateStr: function (date) {
      return new Intl.DateTimeFormat(this.t.locale, {
        weekday: "long", day: "numeric", month: "long", timeZone: this.tz
      }).format(date);
    },

    // "2026-09-02" for a Date, in shop-local terms
    isoDate: function (date) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit", timeZone: this.tz
      }).formatToParts(date);
      const get = (t) => parts.find((p) => p.type === t).value;
      return get("year") + "-" + get("month") + "-" + get("day");
    },

    // Which weekday (0 = Sunday) a shop-local ISO date falls on
    weekdayOf: function (isoDate) {
      const [y, m, d] = isoDate.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    },

    addDays: function (isoDate, n) {
      const [y, m, d] = isoDate.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + n);
      return dt.toISOString().slice(0, 10);
    },

    dayNumber: function (isoDate) {
      return Number(isoDate.split("-")[2]);
    },

    // "09:00:00" -> "09:00"
    hhmm: function (t) {
      return (t || "").slice(0, 5);
    },

    // ---------------------------------------------------------------- helpers
    // Turn a Postgres error into something a person can act on.
    errorText: function (err) {
      const t = this.t;
      const msg = String((err && (err.message || err.error_description)) || "");
      if (msg.indexOf("SLOT_TAKEN") > -1) return t.errSlotTaken;
      if (msg.indexOf("BAD_NAME") > -1) return t.errBadName;
      if (msg.indexOf("BAD_PHONE") > -1) return t.errBadPhone;
      if (msg.indexOf("TOO_MANY") > -1) return t.errTooMany;
      if (msg.indexOf("BAD_REVIEW") > -1) return t.errBadReview;
      return t.errGeneric;
    },

    notice: function (el, kind, text) {
      if (!el) return;
      el.className = "notice notice-" + kind;
      el.textContent = text;
      el.classList.remove("hidden");
    },

    clearNotice: function (el) {
      if (el) el.classList.add("hidden");
    },

    // ------------------------------------------------------------ site content
    // The admin-editable row. A missing table (migration not yet applied) or a
    // network hiccup leaves it empty, and every caller falls back to I18N.
    content: {},

    loadContent: async function () {
      if (!this.db) return {};
      try {
        const { data, error } = await this.db.from("site_content").select("*").eq("id", 1).maybeSingle();
        if (!error && data) this.content = data;
      } catch (e) {}
      return this.content;
    },

    // content field for the current language, else the built-in default
    c: function (field, i18nKey) {
      const v = this.content[field + "_" + this.lang];
      if (v && String(v).trim()) return String(v);
      return this.t[i18nKey] || "";
    },

    bitUrl: function () {
      return (this.content.bit_url && this.content.bit_url.trim()) ||
             (cfg.BIT_URL || "");
    },

    // WhatsApp number in the form wa.me wants: digits only, 972 instead of 0.
    waNumber: function () {
      let d = String((this.content.whatsapp && this.content.whatsapp.trim()) || cfg.WHATSAPP || "").replace(/\D/g, "");
      if (d.indexOf("0") === 0) d = "972" + d.slice(1);
      return d;
    },

    waUrl: function (text) {
      const n = this.waNumber();
      if (!n) return "";
      return "https://wa.me/" + n + (text ? "?text=" + encodeURIComponent(text) : "");
    },

    serviceName: function (s) {
      return this.lang === "he" ? s.name_he : s.name_en;
    },

    serviceDesc: function (s) {
      return (this.lang === "he" ? s.description_he : s.description_en) || "";
    },

    priceText: function (s) {
      const t = this.t;
      if (s.price === null || s.price === undefined) return "";
      return (s.price_max !== null && s.price_max !== undefined)
        ? t.currency + Number(s.price).toFixed(0) + "–" + Number(s.price_max).toFixed(0)
        : t.currency + Number(s.price).toFixed(0);
    },

    // ------------------------------------------------- bookings on this device
    // Only the cancellation tokens are kept, and only in this browser. They are
    // the customer's own keys; the details are fetched fresh through
    // appointment_by_token each time.
    myTokens: function () {
      try {
        const v = JSON.parse(localStorage.getItem("barbershop.mine") || "[]");
        return Array.isArray(v) ? v : [];
      } catch (e) { return []; }
    },

    rememberToken: function (token, startsAt) {
      try {
        const list = this.myTokens().filter((x) => x.t !== token);
        list.unshift({ t: token, s: startsAt });
        localStorage.setItem("barbershop.mine", JSON.stringify(list.slice(0, 12)));
      } catch (e) {}
    },

    cancelUrl: function (token) {
      return location.origin + location.pathname.replace(/[^/]*$/, "") +
             "cancel.html?t=" + encodeURIComponent(token);
    },

    // A calendar file the phone can open — the nearest thing to a reminder a
    // static site can give.
    icsFile: function (title, start, end, url) {
      const z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const esc = (s) => String(s).replace(/([,;\\])/g, "\\$1");
      const body = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//akiva-barbershop//EN",
        "BEGIN:VEVENT",
        "UID:" + z(start) + "-" + Math.random().toString(36).slice(2) + "@akiva",
        "DTSTAMP:" + z(new Date()),
        "DTSTART:" + z(start), "DTEND:" + z(end),
        "SUMMARY:" + esc(title),
        "DESCRIPTION:" + esc(url),
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:" + esc(title), "END:VALARM",
        "END:VEVENT", "END:VCALENDAR"
      ].join("\r\n");
      return new Blob([body], { type: "text/calendar;charset=utf-8" });
    },

    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[ch]);
    },

    // ------------------------------------------------------------ web push
    // Notifications from the site itself. The service worker (sw.js) shows
    // them; the Edge Function "push" sends them.
    push: {
      supported: function () {
        return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      },
      // An iPhone delivers web notifications only to a site opened from its
      // home-screen icon, never to a Safari tab.
      iosNeedsInstall: function () {
        const ios = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const standalone = navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
        return ios && !standalone;
      },
      b64: function (buf) {
        let s = "";
        new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
        return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      },
      bytes: function (b64url) {
        const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
        const bin = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
        return Uint8Array.from(bin, (c) => c.charCodeAt(0));
      },
      // Ask permission (this must be the first await after the tap, or iOS
      // refuses), then subscribe this device with the shop's public key.
      // Ask only when not already allowed: a second ask, away from the tap,
      // is answered "denied" by iOS even when notifications are on.
      ask: async function () {
        if (Notification.permission === "granted") return true;
        const perm = await Notification.requestPermission();
        return perm === "granted" || Notification.permission === "granted";
      },
      subscribe: async function (publicKey) {
        if (Notification.permission !== "granted" && !(await this.ask())) throw new Error("DENIED");
        const reg = await navigator.serviceWorker.register("sw.js");
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (sub) {
          const cur = sub.options && sub.options.applicationServerKey;
          if (cur && this.b64(cur) !== publicKey) { await sub.unsubscribe(); sub = null; }
        }
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.bytes(publicKey) });
        }
        const j = sub.toJSON();
        return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
      }
    },

    // The customer's "remind me" button, on the confirmation and the booking page.
    remindMe: async function (token, noticeEl, btn) {
      const t = this.t;
      const key = this.content.push_public_key;
      if (!key) return;
      if (this.push.iosNeedsInstall()) { this.notice(noticeEl, "quiet", t.pushIosHint); return; }
      if (!this.push.supported()) { this.notice(noticeEl, "quiet", t.pushUnsupported); return; }
      const label = btn && btn.firstElementChild;
      if (btn) btn.disabled = true;
      try {
        const s = await this.push.subscribe(key);
        const { error } = await this.db.rpc("save_push", {
          p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_token: token, p_admin: false
        });
        if (error) throw error;
        this.notice(noticeEl, "ok", t.pushOn);
        if (label) label.textContent = t.pushOnShort;
      } catch (e) {
        if (btn) btn.disabled = false;
        this.notice(noticeEl, "error", String(e && e.message) === "DENIED" ? t.pushDenied : t.errGeneric);
      }
    },

    // Guard every page: without config there is nothing to talk to.
    requireConfig: function (noticeEl) {
      if (this.configured) return true;
      this.notice(noticeEl, "error", this.t.errNotConfigured);
      return false;
    }
  };
})();
