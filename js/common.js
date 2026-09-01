/* Shared plumbing: the database client, language, and date formatting. */

(function () {
  "use strict";

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
      document.title = t.shopName;
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

    // Guard every page: without config there is nothing to talk to.
    requireConfig: function (noticeEl) {
      if (this.configured) return true;
      this.notice(noticeEl, "error", this.t.errNotConfigured);
      return false;
    }
  };
})();
