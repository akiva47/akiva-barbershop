/* The admin side. Every write here is also checked by row level security on the
   server, so a signed-out visitor opening this page gets a login form and
   nothing else — and even hand-crafted requests are refused. */

(function () {
  "use strict";

  const A = window.APP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => A.esc(s);

  const state = {
    tab: "dash", services: [], allServices: [], appts: [], strip: {}, hours: [], breaks: [],
    overrides: [], gallery: [], reviews: [], settings: null, dash: [], site: {}
  };

  // ------------------------------------------------------------------ icons
  const I = {
    dash: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    diary: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    gallery: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
    services: '<svg viewBox="0 0 24 24"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8 16L19 3M16 16L5 3"/></svg>',
    hours: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    site: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
    reviews: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>'
  };

  const TABS = [
    { id: "dash", t: "tabDash" }, { id: "diary", t: "tabToday" },
    { id: "gallery", t: "tabGallery" }, { id: "services", t: "tabServices" },
    { id: "hours", t: "tabHours" }, { id: "site", t: "tabSite" },
    { id: "reviews", t: "tabReviews" }, { id: "settings", t: "tabSettings" }
  ];

  // ---------------------------------------------------------------- helpers

  function flash(kind, text) {
    const box = $("toasts");
    const n = document.createElement("div");
    n.className = "toast " + (kind || "");
    n.textContent = text;
    box.appendChild(n);
    setTimeout(() => { n.classList.add("out"); setTimeout(() => n.remove(), 450); }, kind === "error" ? 4200 : 2400);
  }

  // A table the new migration adds, asked for before that migration has run.
  function isMissing(err) {
    if (!err) return false;
    const m = String(err.message || "") + " " + String(err.code || "");
    return /42P01|PGRST205|does not exist|Could not find the table/i.test(m);
  }

  function showMissing(which, err) {
    const box = document.querySelector('[data-missing="' + which + '"]');
    if (!box) return;
    if (isMissing(err)) { box.textContent = A.t.migrationMissing; box.classList.remove("hidden"); }
    else box.classList.add("hidden");
  }

  function svcName(id) {
    const s = state.allServices.find((x) => x.id === id);
    return s ? A.serviceName(s) : "";
  }
  function svcById(id) { return state.allServices.find((x) => x.id === id); }

  function toggle(checked, onChange) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "switch";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", String(!!checked));
    b.addEventListener("click", () => {
      const next = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(next));
      onChange(next);
    });
    return b;
  }

  function busy(btn, on) {
    const s = btn.firstElementChild || btn;
    if (on) { btn.dataset.label = s.textContent; s.textContent = A.t.saving; btn.disabled = true; }
    else { s.textContent = btn.dataset.label || s.textContent; btn.disabled = false; }
  }

  // Israeli local numbers to the international form wa.me wants.
  function waNumber(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (d.indexOf("0") === 0) d = "972" + d.slice(1);
    return d;
  }

  function dayBounds(iso, days) {
    const from = new Date(iso + "T00:00:00");
    const to = new Date(iso + "T00:00:00");
    to.setDate(to.getDate() + (days || 1));
    return [from.toISOString(), to.toISOString()];
  }

  // ------------------------------------------------------------------- tabs

  function renderTabs() {
    const t = A.t;
    const todayCount = state.dash.filter((a) => A.isoDate(new Date(a.starts_at)) === A.isoDate(new Date())).length;
    const html = TABS.map((x) =>
      '<button type="button" class="tab" role="tab" data-tab="' + x.id + '" aria-selected="' + (x.id === state.tab) + '">' +
      I[x.id] + "<span>" + esc(t[x.t]) + "</span>" +
      (x.id === "diary" && todayCount ? '<span class="badge">' + todayCount + "</span>" : "") +
      (x.id === "reviews" && pendingCount() ? '<span class="badge">' + pendingCount() + "</span>" : "") + "</button>").join("");
    $("tabs").innerHTML = html;
    $("bottomTabs").innerHTML = html;
  }

  function showTab(id, opts) {
    if (!TABS.find((x) => x.id === id)) id = "dash";
    state.tab = id;
    document.querySelectorAll("[data-panel]").forEach((p) => {
      const on = p.getAttribute("data-panel") === id;
      p.classList.toggle("hidden", !on);
      if (on) { p.style.animation = "none"; void p.offsetWidth; p.style.animation = ""; }
    });
    const tab = TABS.find((x) => x.id === id);
    $("topTitle").textContent = id === "dash" ? A.t.adminHello : A.t[tab.t];
    renderTabs();
    const bt = $("bottomTabs").querySelector('[data-tab="' + id + '"]');
    if (bt) bt.scrollIntoView({ inline: "center", block: "nearest" });
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
    if (!(opts && opts.keepScroll)) window.scrollTo({ top: 0 });
    if (id === "dash") loadDash();
    if (id === "diary") loadDiary();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) showTab(b.getAttribute("data-tab"));
  });

  function renderTopDate() {
    $("topDate").textContent = A.dateStr(new Date());
  }

  // -------------------------------------------------------------- dashboard

  async function loadDash() {
    const today = A.isoDate(new Date());
    const [from, to] = dayBounds(today, 7);
    const { data, error } = await A.db.from("appointments")
      .select("id,starts_at,ends_at,customer_name,customer_phone,service_id,status,note")
      .eq("status", "booked").gte("starts_at", from).lt("starts_at", to).order("starts_at");
    if (error) { flash("error", A.errorText(error)); return; }
    state.dash = data || [];
    renderDash();
    renderTabs();
  }

  function renderDash() {
    const t = A.t;
    const today = A.isoDate(new Date());
    const list = state.dash;
    const todays = list.filter((a) => A.isoDate(new Date(a.starts_at)) === today);
    $("kpiToday").textContent = todays.length;
    $("kpiWeek").textContent = list.length;
    const revenue = list.reduce((sum, a) => {
      const s = svcById(a.service_id);
      return sum + (s && s.price ? Number(s.price) : 0);
    }, 0);
    $("kpiRevenue").textContent = t.currency + Math.round(revenue).toLocaleString("en-US");

    const now = Date.now();
    const next = list.find((a) => new Date(a.ends_at).getTime() > now);
    const card = $("nextCard");
    if (!next) {
      card.innerHTML = '<span class="nc-k">' + esc(t.dashNext) + '</span><div class="nc-name" style="color:var(--ink-3)">' + esc(t.dashNoNext) + "</div>";
    } else {
      const d = new Date(next.starts_at);
      const mins = Math.round((d.getTime() - now) / 60000);
      const rtf = new Intl.RelativeTimeFormat(t.locale, { numeric: "auto" });
      const rel = mins <= 0 ? t.today : Math.abs(mins) < 60 ? rtf.format(mins, "minute")
        : mins < 60 * 24 ? rtf.format(Math.round(mins / 60), "hour") : rtf.format(Math.round(mins / 1440), "day");
      card.innerHTML = '<span class="nc-k">' + esc(t.dashNext) + "</span>" +
        '<div><div class="nc-time">' + A.timeStr(d) + "</div>" +
        '<div class="nc-name">' + esc(next.customer_name) + "</div>" +
        '<div class="nc-meta">' + esc(svcName(next.service_id)) + " · " + esc(A.dateStr(d)) + "</div></div>" +
        '<span class="nc-in"><span class="pulse"></span>' + esc(rel) + "</span>";
    }

    const days = Array.from({ length: 7 }, (_, i) => A.addDays(today, i));
    const counts = days.map((d) => list.filter((a) => A.isoDate(new Date(a.starts_at)) === d).length);
    const max = Math.max(1, ...counts);
    $("weekChart").innerHTML = days.map((d, i) =>
      '<div class="bar' + (i === 0 ? " today" : "") + '" data-day="' + d + '" title="' + esc(A.dateStr(new Date(d + "T12:00:00"))) + '">' +
      '<div class="bar-col" style="--i:' + i + ";--h:" + Math.round((counts[i] / max) * 100) + '%"><b>' + (counts[i] || "") + "</b></div>" +
      "<small>" + esc(t.weekdaysShort[A.weekdayOf(d)]) + "</small></div>").join("");
  }

  $("weekChart").addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]");
    if (!b) return;
    $("diaryDate").value = b.getAttribute("data-day");
    showTab("diary");
  });

  document.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
    const q = b.getAttribute("data-quick");
    if (q === "photo") { showTab("gallery"); setTimeout(() => $("fileInput").click(), 50); }
    if (q === "appt") { showTab("diary"); $("addApptFold").open = true; setTimeout(() => $("addApptFold").scrollIntoView({ behavior: "smooth", block: "center" }), 120); }
    if (q === "dayoff") { showTab("hours"); setTimeout(() => $("daysCard").scrollIntoView({ behavior: "smooth", block: "center" }), 120); }
    if (q === "site") showTab("site");
  }));

  // ------------------------------------------------------------------ diary

  async function loadDiary() {
    const day = $("diaryDate").value;
    if (!day) return;
    // One query covers the 7-day strip and the selected day's list.
    const stripStart = A.addDays(day, -3);
    const [from, to] = dayBounds(stripStart, 7);
    const { data, error } = await A.db.from("appointments")
      .select("id,starts_at,ends_at,customer_name,customer_phone,note,status,service_id")
      .gte("starts_at", from).lt("starts_at", to).order("starts_at");
    if (error) { flash("error", A.errorText(error)); return; }
    const all = data || [];
    state.strip = {};
    all.forEach((a) => {
      if (a.status !== "booked") return;
      const d = A.isoDate(new Date(a.starts_at));
      state.strip[d] = (state.strip[d] || 0) + 1;
    });
    state.appts = all.filter((a) => A.isoDate(new Date(a.starts_at)) === day);
    renderStrip();
    renderDiary();
  }

  function renderStrip() {
    const t = A.t;
    const day = $("diaryDate").value;
    const start = A.addDays(day, -3);
    const today = A.isoDate(new Date());
    $("diaryStrip").innerHTML = Array.from({ length: 7 }, (_, i) => A.addDays(start, i)).map((d) =>
      '<button type="button" class="ds" data-d="' + d + '" aria-pressed="' + (d === day) + '">' +
      "<small>" + esc(d === today ? t.today : t.weekdaysShort[A.weekdayOf(d)]) + "</small><b>" + A.dayNumber(d) + "</b>" +
      "<i>" + (state.strip[d] ? state.strip[d] : "") + "</i></button>").join("");
  }

  $("diaryStrip").addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    $("diaryDate").value = b.getAttribute("data-d");
    loadDiary();
  });

  function renderDiary() {
    const t = A.t;
    const box = $("diaryList");
    box.innerHTML = "";
    if (!state.appts.length) {
      box.innerHTML = '<div class="card empty">' + esc(t.noAppts) + "</div>";
      return;
    }
    const now = Date.now();
    state.appts.forEach((a, i) => {
      const s = new Date(a.starts_at), e = new Date(a.ends_at);
      const row = document.createElement("div");
      const isNow = s.getTime() <= now && e.getTime() > now;
      row.className = "appt" + (a.status === "cancelled" ? " cancelled" : "") + (e.getTime() < now ? " past" : "") + (isNow ? " now" : "");
      row.style.setProperty("--i", i);
      row.innerHTML =
        '<div class="appt-time"><b>' + A.timeStr(s) + "</b><small>" + A.timeStr(e) + "</small></div>" +
        '<div class="appt-body"><div class="appt-name">' + esc(a.customer_name) + "</div>" +
        '<div class="appt-meta">' + esc(svcName(a.service_id)) + ' · <span class="ltr" style="display:inline-block">' + esc(a.customer_phone) + "</span></div>" +
        (a.note ? '<div class="appt-note">' + esc(a.note) + "</div>" : "") +
        '<div class="appt-actions"></div></div>';
      const act = row.querySelector(".appt-actions");

      const call = document.createElement("a");
      call.className = "chip";
      call.href = "tel:" + a.customer_phone.replace(/[^\d+]/g, "");
      call.innerHTML = I.phone + "<span>" + esc(t.call) + "</span>";
      const wa = document.createElement("a");
      wa.className = "chip";
      wa.href = "https://wa.me/" + waNumber(a.customer_phone);
      wa.target = "_blank"; wa.rel = "noopener";
      wa.innerHTML = I.wa + "<span>WhatsApp</span>";
      act.append(call, wa);

      if (a.status === "booked") {
        const kill = document.createElement("button");
        kill.type = "button";
        kill.className = "chip chip-danger";
        kill.innerHTML = I.x + "<span>" + esc(t.cancelAppt) + "</span>";
        kill.addEventListener("click", async () => {
          if (!confirm(t.confirmCancel)) return;
          const { error } = await A.db.from("appointments")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", a.id);
          if (error) { flash("error", A.errorText(error)); return; }
          flash("ok", t.cancelled);
          loadDiary(); loadDash();
        });
        act.appendChild(kill);
      } else {
        // Already cancelled: the only thing left to do is get it off the list.
        const del = document.createElement("button");
        del.type = "button";
        del.className = "chip chip-danger";
        del.innerHTML = I.trash + "<span>" + esc(t.deleteAppt) + "</span>";
        del.addEventListener("click", async () => {
          if (!confirm(t.confirmDeleteAppt)) return;
          const { error } = await A.db.from("appointments").delete().eq("id", a.id);
          if (error) { flash("error", A.errorText(error)); return; }
          flash("ok", t.saved);
          loadDiary();
        });
        act.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  $("prevDay").addEventListener("click", () => { $("diaryDate").value = A.addDays($("diaryDate").value, -1); loadDiary(); });
  $("nextDay").addEventListener("click", () => { $("diaryDate").value = A.addDays($("diaryDate").value, 1); loadDiary(); });
  $("todayBtn").addEventListener("click", () => { $("diaryDate").value = A.isoDate(new Date()); loadDiary(); });
  $("diaryDate").addEventListener("change", loadDiary);

  function fillServiceSelect() {
    const sel = $("maService");
    const cur = sel.value;
    sel.innerHTML = state.allServices.filter((s) => s.active).map((s) =>
      '<option value="' + s.id + '">' + esc(A.serviceName(s)) + " · " + s.duration_min + " " + esc(A.t.minutes) + "</option>").join("");
    if (cur) sel.value = cur;
  }

  // A booking taken by phone. The admin writes the row directly; the overlap
  // constraint in the database still refuses a double booking.
  $("maAdd").addEventListener("click", async () => {
    const t = A.t;
    const s = svcById(Number($("maService").value));
    const day = $("diaryDate").value;
    const time = $("maTime").value;
    const name = $("maName").value.trim();
    const phone = $("maPhone").value.trim();
    if (!s || !day || !time) { flash("error", t.errGeneric); return; }
    if (name.length < 2) { flash("error", t.errBadName); return; }
    if (phone.replace(/\D/g, "").length < 7) { flash("error", t.errBadPhone); return; }
    const start = new Date(day + "T" + time + ":00");
    const end = new Date(start.getTime() + s.duration_min * 60000);
    const btn = $("maAdd");
    busy(btn, true);
    const { error } = await A.db.from("appointments").insert({
      service_id: s.id, starts_at: start.toISOString(), ends_at: end.toISOString(),
      customer_name: name, customer_phone: phone, note: $("maNote").value.trim() || null
    });
    busy(btn, false);
    if (error) {
      flash("error", error.code === "23P01" ? t.errSlotTaken : A.errorText(error));
      return;
    }
    $("maName").value = ""; $("maPhone").value = ""; $("maNote").value = "";
    $("addApptFold").open = false;
    flash("ok", t.saved);
    loadDiary(); loadDash();
  });

  // ---------------------------------------------------------------- gallery

  async function loadGallery() {
    const { data, error } = await A.db.from("gallery").select("*").order("sort_order").order("id");
    showMissing("gallery", error);
    if (error) { state.gallery = []; renderGallery(); return; }
    state.gallery = data || [];
    renderGallery();
  }

  function renderGallery() {
    const t = A.t;
    const grid = $("galGrid");
    grid.innerHTML = "";
    if (!state.gallery.length) {
      grid.innerHTML = '<div class="gal-empty">' + esc(t.galleryEmpty) + "</div>";
      return;
    }
    state.gallery.forEach((g, i) => {
      const card = document.createElement("div");
      card.className = "gal" + (g.active ? "" : " off");
      card.style.setProperty("--i", i);
      const isHero = state.site.hero_image_url === g.url;
      const isAbout = state.site.about_image_url === g.url;
      card.innerHTML =
        '<div class="gal-img"><img src="' + esc(g.url) + '" alt="" loading="lazy"><span class="gal-num">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<div class="gal-flags">' + (isHero ? "<span>" + esc(t.isHero) + "</span>" : "") + (isAbout ? "<span>" + esc(t.isAbout) + "</span>" : "") + "</div></div>" +
        '<div class="gal-body">' +
        '<input class="input" data-cap="he" placeholder="' + esc(t.captionHe) + '" value="' + esc(g.caption_he || "") + '" maxlength="80">' +
        '<input class="input" data-cap="en" dir="ltr" placeholder="' + esc(t.captionEn) + '" value="' + esc(g.caption_en || "") + '" maxlength="80">' +
        '<div class="gal-tools"></div></div>';

      card.querySelectorAll("[data-cap]").forEach((inp) => {
        inp.addEventListener("change", async () => {
          const field = "caption_" + inp.getAttribute("data-cap");
          const v = inp.value.trim() || null;
          const { error } = await A.db.from("gallery").update({ [field]: v }).eq("id", g.id);
          if (error) { flash("error", A.errorText(error)); return; }
          g[field] = v;
          flash("ok", t.saved);
        });
      });

      const tools = card.querySelector(".gal-tools");
      const mk = (html, title, fn, cls) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip" + (cls ? " " + cls : ""); b.innerHTML = html; b.title = title;
        b.addEventListener("click", fn);
        tools.appendChild(b);
        return b;
      };
      mk(I.up, t.moveUp, () => moveGallery(i, -1)).disabled = i === 0;
      mk(I.down, t.moveDown, () => moveGallery(i, 1)).disabled = i === state.gallery.length - 1;
      mk(esc(isHero ? t.isHero : t.setHero), t.setHero, () => setSiteImage("hero_image_url", isHero ? null : g.url), isHero ? "chip-gold" : "");
      mk(esc(isAbout ? t.isAbout : t.setAbout), t.setAbout, () => setSiteImage("about_image_url", isAbout ? null : g.url), isAbout ? "chip-gold" : "");
      mk(I.trash, t.delete, () => deletePhoto(g), "chip-danger");
      const sw = toggle(g.active, async (v) => {
        const { error } = await A.db.from("gallery").update({ active: v }).eq("id", g.id);
        if (error) { flash("error", A.errorText(error)); return; }
        g.active = v;
        card.classList.toggle("off", !v);
      });
      sw.title = t.shown;
      tools.appendChild(sw);
      grid.appendChild(card);
    });
  }

  async function moveGallery(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.gallery.length) return;
    const g = state.gallery;
    [g[i], g[j]] = [g[j], g[i]];
    renderGallery();
    // Rewrite the order of every photo, so ties left by older rows resolve.
    const results = await Promise.all(g.map((x, k) =>
      x.sort_order === k ? null : A.db.from("gallery").update({ sort_order: k }).eq("id", x.id).then((r) => { x.sort_order = k; return r; })));
    const bad = results.find((r) => r && r.error);
    if (bad) flash("error", A.errorText(bad.error));
  }

  async function setSiteImage(field, url) {
    const { error } = await A.db.from("site_content").upsert({ id: 1, [field]: url, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) { flash("error", A.errorText(error)); return; }
    state.site[field] = url;
    flash("ok", A.t.saved);
    renderGallery();
    renderSite();
  }

  async function deletePhoto(g) {
    const t = A.t;
    if (!confirm(t.confirmDeletePhoto)) return;
    const rm = await A.db.storage.from("gallery").remove([g.path]);
    if (rm.error) { flash("error", A.errorText(rm.error)); return; }
    const { error } = await A.db.from("gallery").delete().eq("id", g.id);
    if (error) { flash("error", A.errorText(error)); return; }
    // A deleted photo cannot stay on the hero or the about section.
    const clear = {};
    if (state.site.hero_image_url === g.url) clear.hero_image_url = null;
    if (state.site.about_image_url === g.url) clear.about_image_url = null;
    if (Object.keys(clear).length) {
      await A.db.from("site_content").upsert(Object.assign({ id: 1 }, clear), { onConflict: "id" });
      Object.assign(state.site, clear);
    }
    flash("ok", t.saved);
    loadGallery();
  }

  // Photos straight off a phone are 4–12 MB. Shrink them in the browser to
  // something a visitor on mobile data can load in a moment.
  async function shrink(file) {
    const MAX = 1800;
    let src;
    try {
      src = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (e) {
      src = await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = URL.createObjectURL(file);
      });
    }
    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
    const k = Math.min(1, MAX / Math.max(w0, h0));
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(src, 0, 0, w, h);
    const toBlob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
    let blob = await toBlob("image/webp", 0.84);
    // Safari before 17 cannot encode WebP and quietly hands back a PNG.
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.86);
    return { blob: blob, width: w, height: h, ext: blob.type === "image/webp" ? "webp" : "jpg" };
  }

  async function uploadFiles(files) {
    const t = A.t;
    files = Array.from(files || []).filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    const queue = $("queue");
    let order = state.gallery.length ? Math.min(...state.gallery.map((g) => g.sort_order)) - 1 : 0;
    for (const f of files) {
      const q = document.createElement("div");
      q.className = "q";
      const thumb = URL.createObjectURL(f);
      q.innerHTML = '<img src="' + thumb + '" alt=""><span>' + esc(f.name) + '</span><div class="spinner"></div>';
      queue.appendChild(q);
      try {
        const out = await shrink(f);
        const path = "work/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + out.ext;
        const up = await A.db.storage.from("gallery").upload(path, out.blob, {
          contentType: out.blob.type, cacheControl: "31536000", upsert: false
        });
        if (up.error) throw up.error;
        const url = A.db.storage.from("gallery").getPublicUrl(path).data.publicUrl;
        const ins = await A.db.from("gallery").insert({
          path: path, url: url, width: out.width, height: out.height, sort_order: order--
        });
        if (ins.error) {
          await A.db.storage.from("gallery").remove([path]);   // do not leave an orphan file
          throw ins.error;
        }
        q.className = "q ok";
        q.lastElementChild.outerHTML = "<em>✓</em>";
      } catch (e) {
        q.className = "q err";
        q.lastElementChild.outerHTML = "<em>" + esc(isMissing(e) ? t.migrationMissing : A.errorText(e)) + "</em>";
      }
      URL.revokeObjectURL(thumb);
    }
    await loadGallery();
    setTimeout(() => { queue.querySelectorAll(".q.ok").forEach((n) => n.remove()); }, 2500);
  }

  $("fileInput").addEventListener("change", (e) => { uploadFiles(e.target.files); e.target.value = ""; });
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); });

  // --------------------------------------------------------------- services

  async function loadServices() {
    const { data, error } = await A.db.from("services").select("*").order("sort_order").order("id");
    if (error) { flash("error", A.errorText(error)); return; }
    state.allServices = data || [];
    renderServices();
    fillServiceSelect();
  }

  function renderServices() {
    const t = A.t;
    const box = $("servicesList");
    box.innerHTML = "";
    state.allServices.forEach((s, i) => {
      const card = document.createElement("div");
      card.className = "svc-card" + (s.active ? "" : " off");
      card.style.setProperty("--i", i);
      const f = (key, label, type, extra) =>
        '<label class="f' + (extra && extra.wide ? " wide" : "") + '"><span>' + esc(label) + '</span><input class="input" data-k="' + key + '" type="' + type + '"' +
        (extra && extra.ltr ? ' dir="ltr"' : "") + (extra && extra.attrs ? " " + extra.attrs : "") +
        ' value="' + esc(s[key] === null || s[key] === undefined ? "" : s[key]) + '"></label>';
      card.innerHTML =
        '<div class="svc-card-head"><span class="num">' + String(i + 1).padStart(2, "0") + "</span><b>" + esc(A.serviceName(s)) + "</b></div>" +
        '<div class="form-grid">' +
        f("name_he", t.serviceNameHe, "text") + f("name_en", t.serviceNameEn, "text", { ltr: true }) +
        f("description_he", t.descHe, "text", { wide: true, attrs: 'maxlength="120"' }) +
        f("description_en", t.descEn, "text", { wide: true, ltr: true, attrs: 'maxlength="120"' }) +
        f("duration_min", t.duration, "number", { attrs: 'min="5" max="480" step="5"' }) +
        f("price", t.price, "number", { attrs: 'min="0" step="5"' }) +
        f("price_max", t.priceMax, "number", { attrs: 'min="0" step="5" placeholder="–"' }) +
        "</div>" +
        '<div class="svc-card-foot"></div>';
      card.querySelectorAll("[data-k]").forEach((inp) => {
        inp.addEventListener("input", () => {
          const k = inp.getAttribute("data-k");
          if (inp.type === "number") s[k] = inp.value === "" ? null : Number(inp.value);
          else s[k] = inp.value;
          if (k === "name_he" || k === "name_en") card.querySelector(".svc-card-head b").textContent = A.serviceName(s);
        });
      });
      const foot = card.querySelector(".svc-card-foot");
      const lab = document.createElement("label");
      lab.className = "inline-switch";
      lab.append(toggle(s.active, (v) => { s.active = v; card.classList.toggle("off", !v); }));
      const ls = document.createElement("span"); ls.textContent = t.active; lab.appendChild(ls);
      foot.appendChild(lab);
      const mk = (html, title, fn, cls) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip" + (cls ? " " + cls : ""); b.innerHTML = html; b.title = title;
        b.addEventListener("click", fn);
        foot.appendChild(b);
        return b;
      };
      mk(I.up, t.moveUp, () => moveService(i, -1)).classList.add("push");
      mk(I.down, t.moveDown, () => moveService(i, 1));
      mk(I.trash + "<span>" + esc(t.delete) + "</span>", t.deleteService, () => deleteService(s), "chip-danger");
      box.appendChild(card);
    });
  }

  async function moveService(i, dir) {
    const j = i + dir;
    const list = state.allServices;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    renderServices();
    const results = await Promise.all(list.map((x, k) =>
      x.sort_order === k + 1 ? null : A.db.from("services").update({ sort_order: k + 1 }).eq("id", x.id).then((r) => { x.sort_order = k + 1; return r; })));
    const bad = results.find((r) => r && r.error);
    if (bad) flash("error", A.errorText(bad.error));
  }

  async function deleteService(s) {
    const t = A.t;
    if (!confirm(t.confirmDeleteService)) return;
    const { error } = await A.db.from("services").delete().eq("id", s.id);
    if (!error) { flash("ok", t.saved); loadServices(); return; }
    // 23503 is a foreign key violation: an appointment still points at this
    // service. Deleting it would break that booking, so hide it instead.
    if (error.code === "23503") {
      const hide = await A.db.from("services").update({ active: false }).eq("id", s.id);
      if (hide.error) { flash("error", A.errorText(hide.error)); return; }
      flash("", t.serviceInUse);
      loadServices();
      return;
    }
    flash("error", A.errorText(error));
  }

  $("saveServices").addEventListener("click", async () => {
    const t = A.t;
    for (const s of state.allServices) {
      if (!String(s.name_he || "").trim() || !String(s.name_en || "").trim() || !(s.duration_min >= 5)) {
        flash("error", t.errGeneric);
        return;
      }
    }
    const btn = $("saveServices");
    busy(btn, true);
    // One update per row. An upsert would try to INSERT the identity id,
    // which Postgres refuses for a GENERATED ALWAYS column.
    const results = await Promise.all(state.allServices.map((s) => {
      const row = {
        name_he: s.name_he.trim(), name_en: s.name_en.trim(),
        duration_min: s.duration_min, price: s.price, price_max: s.price_max, active: s.active
      };
      if ("description_he" in s) row.description_he = (s.description_he || "").trim() || null;
      if ("description_en" in s) row.description_en = (s.description_en || "").trim() || null;
      return A.db.from("services").update(row).eq("id", s.id);
    }));
    busy(btn, false);
    const bad = results.find((r) => r.error);
    if (bad) { flash("error", A.errorText(bad.error)); return; }
    flash("ok", t.saved);
    renderServices();
    fillServiceSelect();
  });

  $("addService").addEventListener("click", async () => {
    const t = A.t;
    const name_he = $("newSvcHe").value.trim();
    const name_en = $("newSvcEn").value.trim();
    const duration_min = Number($("newSvcDur").value);
    const priceRaw = $("newSvcPrice").value;
    if (!name_he || !name_en || !(duration_min >= 5)) { flash("error", t.errGeneric); return; }
    const { error } = await A.db.from("services").insert({
      name_he, name_en, duration_min,
      price: priceRaw === "" ? null : Number(priceRaw),
      sort_order: (state.allServices.length ? Math.max(...state.allServices.map((s) => s.sort_order)) : 0) + 1
    });
    if (error) { flash("error", A.errorText(error)); return; }
    $("newSvcHe").value = ""; $("newSvcEn").value = "";
    flash("ok", t.saved);
    loadServices();
  });

  // ------------------------------------------------------------ opening hours

  async function loadHours() {
    const { data, error } = await A.db.from("work_hours").select("*").order("weekday");
    if (error) { flash("error", A.errorText(error)); return; }
    state.hours = data || [];
    renderHours();
  }

  function renderHours() {
    const t = A.t;
    const box = $("hoursList");
    box.innerHTML = "";
    state.hours.forEach((h) => {
      const row = document.createElement("div");
      row.className = "row" + (h.is_open ? "" : " off");
      row.dataset.weekday = h.weekday;
      const label = document.createElement("span");
      label.className = "row-label";
      label.textContent = t.weekdays[h.weekday];
      const sw = toggle(h.is_open, (v) => { h.is_open = v; row.classList.toggle("off", !v); });
      const from = document.createElement("input");
      from.type = "time"; from.className = "input"; from.value = A.hhmm(h.opens); from.dataset.role = "opens";
      const to = document.createElement("input");
      to.type = "time"; to.className = "input"; to.value = A.hhmm(h.closes); to.dataset.role = "closes";
      row.append(label, sw, from, to);
      box.appendChild(row);
    });
  }

  $("saveHours").addEventListener("click", async () => {
    const t = A.t;
    const note = $("hoursNotice");
    A.clearNotice(note);
    // Read straight off the screen rather than relying on a change event
    // having fired, which on iOS it may not have.
    const rows = Array.prototype.map.call($("hoursList").querySelectorAll("[data-weekday]"), (row) => ({
      weekday: Number(row.dataset.weekday),
      is_open: row.querySelector(".switch").getAttribute("aria-checked") === "true",
      opens: A.hhmm(row.querySelector('[data-role="opens"]').value),
      closes: A.hhmm(row.querySelector('[data-role="closes"]').value)
    }));
    for (const h of rows) {
      if (!h.is_open) continue;
      if (!h.opens || !h.closes) { A.notice(note, "error", t.weekdays[h.weekday] + ": " + t.from + " / " + t.to); return; }
      if (h.closes <= h.opens) { A.notice(note, "error", t.weekdays[h.weekday] + ": " + t.hoursBackwards); return; }
    }
    const btn = $("saveHours");
    busy(btn, true);
    const { error } = await A.db.from("work_hours").upsert(rows, { onConflict: "weekday" });
    busy(btn, false);
    if (error) { A.notice(note, "error", A.errorText(error)); return; }
    await loadHours();
    flash("ok", t.saved);
  });

  // ------------------------------------------------------------------ breaks

  async function loadBreaks() {
    const { data, error } = await A.db.from("breaks").select("*").order("weekday").order("starts");
    if (error) { flash("error", A.errorText(error)); return; }
    state.breaks = data || [];
    renderBreaks();
  }

  function renderBreaks() {
    const t = A.t;
    const box = $("breaksList");
    box.innerHTML = "";
    if (!state.breaks.length) { box.innerHTML = '<div class="empty-sm">—</div>'; return; }
    state.breaks.forEach((b) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<span class="row-label">' + esc(b.weekday !== null && b.weekday !== undefined ? t.weekdays[b.weekday] : b.on_date) + "</span>" +
        '<span class="chip ltr">' + A.hhmm(b.starts) + " – " + A.hhmm(b.ends) + "</span>";
      const del = document.createElement("button");
      del.type = "button"; del.className = "chip chip-danger"; del.innerHTML = I.x;
      del.addEventListener("click", async () => {
        if (!confirm(t.confirmDelete)) return;
        const { error } = await A.db.from("breaks").delete().eq("id", b.id);
        if (error) { flash("error", A.errorText(error)); return; }
        loadBreaks();
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  $("addBreak").addEventListener("click", async () => {
    const t = A.t;
    const starts = $("breakStart").value, ends = $("breakEnd").value;
    if (!starts || !ends || !(ends > starts)) { flash("error", t.hoursBackwards); return; }
    const { error } = await A.db.from("breaks").insert({ weekday: Number($("breakWeekday").value), starts, ends });
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
    loadBreaks();
  });

  function fillWeekdaySelect() {
    const sel = $("breakWeekday");
    const cur = sel.value;
    sel.innerHTML = A.t.weekdays.map((n, i) => '<option value="' + i + '">' + esc(n) + "</option>").join("");
    if (cur) sel.value = cur;
  }

  // ------------------------------------------------------------ special days

  async function loadOverrides() {
    const { data, error } = await A.db.from("day_overrides").select("*").gte("on_date", A.isoDate(new Date())).order("on_date");
    if (error) { flash("error", A.errorText(error)); return; }
    state.overrides = data || [];
    renderOverrides();
  }

  function renderOverrides() {
    const t = A.t;
    const box = $("daysList");
    box.innerHTML = "";
    if (!state.overrides.length) { box.innerHTML = '<div class="empty-sm">—</div>'; return; }
    state.overrides.forEach((o) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<span class="row-label">' + esc(A.dateStr(new Date(o.on_date + "T12:00:00"))) + "</span>" +
        '<span class="chip ltr">' + esc(o.is_closed ? t.closed : A.hhmm(o.opens) + " – " + A.hhmm(o.closes)) + "</span>";
      const del = document.createElement("button");
      del.type = "button"; del.className = "chip chip-danger"; del.innerHTML = I.x;
      del.addEventListener("click", async () => {
        if (!confirm(t.confirmDelete)) return;
        const { error } = await A.db.from("day_overrides").delete().eq("on_date", o.on_date);
        if (error) { flash("error", A.errorText(error)); return; }
        loadOverrides();
      });
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  const ovClosedBtn = $("ovClosed");
  ovClosedBtn.addEventListener("click", () => {
    const closed = ovClosedBtn.getAttribute("aria-checked") !== "true";
    ovClosedBtn.setAttribute("aria-checked", String(closed));
    // Opening and closing times only mean something on a day that is open.
    $("ovOpen").classList.toggle("hidden", closed);
    $("ovClose").classList.toggle("hidden", closed);
  });

  $("addOverride").addEventListener("click", async () => {
    const t = A.t;
    const on_date = $("ovDate").value;
    if (!on_date) { flash("error", t.date); return; }
    const is_closed = ovClosedBtn.getAttribute("aria-checked") === "true";
    const row = is_closed
      ? { on_date, is_closed: true, opens: null, closes: null }
      : { on_date, is_closed: false, opens: $("ovOpen").value, closes: $("ovClose").value };
    if (!is_closed && !(row.closes > row.opens)) { flash("error", t.hoursBackwards); return; }
    const { error } = await A.db.from("day_overrides").upsert(row, { onConflict: "on_date" });
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
    loadOverrides();
  });

  // ------------------------------------------------------------ site content

  // The form is described once here and drawn from the description, so a new
  // field is one line.
  const SITE_FORM = [
    { sec: "secHero", fields: [
      { pair: "hero_title", label: "fieldHeroTitle", def: "heroTitle", hint: "heroTitleHint" },
      { pair: "hero_sub", label: "fieldHeroSub", def: "heroSub", area: true },
      { pair: "marquee", label: "fieldMarquee", def: "marquee" },
      { image: "hero_image_url", label: "heroImage" }
    ] },
    { sec: "secAbout", fields: [
      { pair: "about_title", label: "fieldAboutTitle", def: "aboutTitle" },
      { pair: "about", label: "fieldAbout", def: "aboutBody", area: true },
      { image: "about_image_url", label: "heroImage" }
    ] },
    { sec: "secStats", fields: [
      { key: "stat_years", label: "statYears", type: "number" },
      { key: "stat_clients", label: "statClients", type: "number" },
      { key: "stat_cuts", label: "statCuts", type: "number" }
    ] },
    { sec: "secContact", fields: [
      { key: "phone", label: "fieldPhone", type: "tel", ltr: true },
      { key: "whatsapp", label: "fieldWhatsapp", type: "tel", ltr: true },
      { key: "instagram", label: "fieldInstagram", ltr: true },
      { key: "tiktok", label: "fieldTiktok", ltr: true },
      { key: "facebook", label: "fieldFacebook", ltr: true },
      { pair: "address", label: "fieldAddress" },
      { key: "waze_url", label: "fieldWaze", type: "url", ltr: true },
      { key: "maps_url", label: "fieldMaps", type: "url", ltr: true }
    ] },
    { sec: "secPayment", fields: [
      { key: "bit_url", label: "fieldBit", type: "url", ltr: true }
    ] }
  ];

  async function loadSite() {
    const { data, error } = await A.db.from("site_content").select("*").eq("id", 1).maybeSingle();
    showMissing("site", error);
    state.site = (!error && data) ? data : {};
    renderSite();
  }

  function renderSite() {
    const t = A.t;
    const he = window.I18N.he, en = window.I18N.en;
    const v = (k) => esc(state.site[k] === null || state.site[k] === undefined ? "" : state.site[k]);
    const input = (k, ph, opts) => opts.area
      ? '<textarea class="input" rows="3" data-site="' + k + '"' + (opts.ltr ? ' dir="ltr"' : "") + ' placeholder="' + esc(ph || "") + '">' + v(k) + "</textarea>"
      : '<input class="input" data-site="' + k + '" type="' + (opts.type || "text") + '"' + (opts.ltr ? ' dir="ltr"' : "") +
        (opts.type === "number" ? ' min="0"' : "") + ' placeholder="' + esc(ph || "") + '" value="' + v(k) + '">';

    $("siteForm").innerHTML = SITE_FORM.map((s, si) =>
      '<div class="card site-sec"><h3 class="card-title"><i>0' + (si + 1) + "</i>" + esc(t[s.sec]) + '</h3><div class="form-grid">' +
      s.fields.map((f) => {
        if (f.pair) {
          return '<label class="f"><span>' + esc(t[f.label]) + " · " + esc(t.hebrew) + (f.hint ? " (" + esc(t[f.hint]) + ")" : "") + "</span>" +
            input(f.pair + "_he", f.def ? he[f.def] : "", { area: f.area }) + "</label>" +
            '<label class="f"><span>' + esc(t[f.label]) + " · " + esc(t.english) + "</span>" +
            input(f.pair + "_en", f.def ? en[f.def] : "", { area: f.area, ltr: true }) + "</label>";
        }
        if (f.image) {
          const cur = state.site[f.image] || "";
          return '<div class="f wide"><span>' + esc(t[f.label]) + '</span><div class="pickimg" data-pick="' + f.image + '">' +
            '<button type="button" data-url="" aria-pressed="' + !cur + '"><span class="pole-thumb"></span></button>' +
            state.gallery.map((g) => '<button type="button" data-url="' + esc(g.url) + '" aria-pressed="' + (cur === g.url) + '"><img src="' + esc(g.url) + '" alt="" loading="lazy"></button>').join("") +
            "</div></div>";
        }
        return '<label class="f"><span>' + esc(t[f.label]) + "</span>" + input(f.key, "", f) + "</label>";
      }).join("") + "</div></div>").join("");

    $("siteForm").querySelectorAll("[data-pick]").forEach((row) => {
      row.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        row.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      });
    });
  }

  $("saveSite").addEventListener("click", async () => {
    const t = A.t;
    const row = { id: 1, updated_at: new Date().toISOString() };
    $("siteForm").querySelectorAll("[data-site]").forEach((inp) => {
      const k = inp.getAttribute("data-site");
      const val = inp.value.trim();
      if (inp.type === "number") row[k] = val === "" ? null : Math.max(0, Math.round(Number(val)));
      else row[k] = val === "" ? null : val;
    });
    $("siteForm").querySelectorAll("[data-pick]").forEach((p) => {
      const on = p.querySelector('[aria-pressed="true"]');
      row[p.getAttribute("data-pick")] = on && on.getAttribute("data-url") ? on.getAttribute("data-url") : null;
    });
    const btn = $("saveSite");
    busy(btn, true);
    const { error } = await A.db.from("site_content").upsert(row, { onConflict: "id" });
    busy(btn, false);
    if (error) { flash("error", isMissing(error) ? t.migrationMissing : A.errorText(error)); return; }
    Object.assign(state.site, row);
    flash("ok", t.saved);
    renderGallery();
  });

  // ------------------------------------------------------------ testimonials

  function starsWidget(box, value, onChange) {
    box.innerHTML = "";
    box.dataset.value = value;
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "★";
      b.className = i <= value ? "on" : "";
      b.setAttribute("aria-label", i + "/5");
      b.addEventListener("click", (e) => {
        e.preventDefault();
        box.dataset.value = i;
        box.querySelectorAll("button").forEach((x, k) => x.classList.toggle("on", k < i));
        if (onChange) onChange(i);
      });
      box.appendChild(b);
    }
  }

  async function loadReviews() {
    const { data, error } = await A.db.from("testimonials").select("*").order("sort_order").order("id");
    showMissing("reviews", error);
    state.reviews = (!error && data) ? data : [];
    renderReviews();
    renderTabs();
  }

  // A review a customer wrote that the admin has not yet approved.
  const isPending = (r) => r.source === "customer" && !r.approved_at;
  function pendingCount() { return state.reviews.filter(isPending).length; }

  function renderReviews() {
    const t = A.t;
    const box = $("reviewsList");
    box.innerHTML = "";
    if (!state.reviews.length) { box.innerHTML = '<div class="card empty">' + esc(t.reviewsEmpty) + "</div>"; return; }
    // Waiting ones first, so they are the first thing the admin sees.
    const list = state.reviews.slice().sort((a, b) => (isPending(b) - isPending(a)));
    list.forEach((r) => {
      const card = document.createElement("div");
      const pending = isPending(r);
      card.className = "rv-card" + (pending ? " pending" : r.active ? "" : " off");
      card.innerHTML =
        (pending ? '<div class="rv-pending"><span class="badge-pending">' + esc(t.reviewPending) + "</span><small>" +
          esc(A.dateStr(new Date(r.created_at))) + "</small></div>" : "") +
        '<div class="form-grid">' +
        '<label class="f"><span>' + esc(t.reviewAuthor) + '</span><input class="input" data-k="author" maxlength="60" value="' + esc(r.author) + '"></label>' +
        '<div class="f"><span>' + esc(t.rating) + '</span><div class="stars"></div></div>' +
        '<label class="f wide"><span>' + esc(t.reviewBody) + '</span><textarea class="input" data-k="body" rows="3" maxlength="600">' + esc(r.body) + "</textarea></label>" +
        '</div><div class="svc-card-foot"></div>';
      starsWidget(card.querySelector(".stars"), r.rating, (v) => { r.rating = v; });
      card.querySelectorAll("[data-k]").forEach((inp) => inp.addEventListener("input", () => { r[inp.getAttribute("data-k")] = inp.value; }));
      const foot = card.querySelector(".svc-card-foot");
      const lab = document.createElement("label");
      lab.className = "inline-switch";
      lab.append(toggle(r.active, (v) => { r.active = v; card.classList.toggle("off", !v); }));
      const ls = document.createElement("span"); ls.textContent = t.shown; lab.appendChild(ls);
      foot.appendChild(lab);
      const save = document.createElement("button");
      save.type = "button"; save.className = "chip chip-gold push"; save.innerHTML = "<span>" + esc(t.save) + "</span>";
      save.addEventListener("click", async () => {
        if (!r.author.trim() || !r.body.trim()) { flash("error", t.errGeneric); return; }
        const row = { author: r.author.trim(), body: r.body.trim(), rating: r.rating, active: r.active };
        // Switching a customer's review on is approving it.
        if (r.active && !r.approved_at) row.approved_at = new Date().toISOString();
        const { error } = await A.db.from("testimonials").update(row).eq("id", r.id);
        if (error) { flash("error", A.errorText(error)); return; }
        flash("ok", t.saved);
        loadReviews();
      });
      const del = document.createElement("button");
      del.type = "button"; del.className = "chip chip-danger"; del.innerHTML = I.trash;
      del.addEventListener("click", async () => {
        if (!confirm(t.confirmDelete)) return;
        const { error } = await A.db.from("testimonials").delete().eq("id", r.id);
        if (error) { flash("error", A.errorText(error)); return; }
        loadReviews();
      });
      if (pending) {
        const ok = document.createElement("button");
        ok.type = "button"; ok.className = "chip chip-gold push"; ok.innerHTML = "<span>" + esc(t.reviewApprove) + "</span>";
        ok.addEventListener("click", async () => {
          const { error } = await A.db.from("testimonials").update({
            author: r.author.trim(), body: r.body.trim(), rating: r.rating,
            active: true, approved_at: new Date().toISOString()
          }).eq("id", r.id);
          if (error) { flash("error", A.errorText(error)); return; }
          flash("ok", t.reviewApproved);
          loadReviews();
        });
        save.classList.remove("push");
        foot.append(ok);
      }
      foot.append(save, del);
      box.appendChild(card);
    });
  }

  starsWidget($("rvRating"), 5);
  $("addReview").addEventListener("click", async () => {
    const t = A.t;
    const author = $("rvAuthor").value.trim(), body = $("rvBody").value.trim();
    if (!author || !body) { flash("error", t.errGeneric); return; }
    const { error } = await A.db.from("testimonials").insert({
      author, body, rating: Number($("rvRating").dataset.value) || 5,
      sort_order: state.reviews.length ? Math.max(...state.reviews.map((r) => r.sort_order)) + 1 : 0
    });
    if (error) { flash("error", isMissing(error) ? t.migrationMissing : A.errorText(error)); return; }
    $("rvAuthor").value = ""; $("rvBody").value = "";
    starsWidget($("rvRating"), 5);
    flash("ok", t.saved);
    loadReviews();
  });

  // ---------------------------------------------------------------- settings

  async function loadSettings() {
    const { data, error } = await A.db.from("shop_settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return;
    state.settings = data;
    $("setStep").value = data.slot_step_min;
    $("setLead").value = data.lead_time_min;
    $("setDays").value = data.max_days_ahead;
    $("setMax").value = data.max_open_per_phone;
  }

  $("saveSettings").addEventListener("click", async () => {
    const t = A.t;
    const row = {
      slot_step_min: Number($("setStep").value),
      lead_time_min: Number($("setLead").value),
      max_days_ahead: Number($("setDays").value),
      max_open_per_phone: Number($("setMax").value)
    };
    if (!(row.slot_step_min >= 5 && row.slot_step_min <= 120) || !(row.lead_time_min >= 0) ||
        !(row.max_days_ahead >= 1) || !(row.max_open_per_phone >= 1)) { flash("error", t.errGeneric); return; }
    const btn = $("saveSettings");
    busy(btn, true);
    const { error } = await A.db.from("shop_settings").update(row).eq("id", 1);
    busy(btn, false);
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
  });

  // ------------------------------------------------------------ notifications

  function renderNotifyText() {
    // These few strings carry links and <code>, so they are set as HTML. They
    // come from i18n.js, never from user input.
    document.querySelectorAll("[data-th]").forEach((el) => { el.innerHTML = A.t[el.getAttribute("data-th")] || ""; });
  }

  function setSwitch(id, on) { $(id).setAttribute("aria-checked", String(!!on)); }
  function isOn(id) { return $(id).getAttribute("aria-checked") === "true"; }
  ["ntNew", "ntCancel"].forEach((id) => $(id).addEventListener("click", () => setSwitch(id, !isOn(id))));

  function renderNotifyState() {
    const t = A.t;
    const tg = $("tgToken").value.trim() && $("tgChat").value.trim();
    const wa = $("waPhone").value.trim() && $("waKey").value.trim();
    [["tgState", tg], ["waState", wa]].forEach(([id, on]) => {
      $(id).textContent = on ? t.notifyOn : t.notifyOff;
      $(id).classList.toggle("on", !!on);
    });
  }
  ["tgToken", "tgChat", "waPhone", "waKey"].forEach((id) => $(id).addEventListener("input", renderNotifyState));

  async function loadNotify() {
    const { data, error } = await A.db.from("notify_settings").select("*").eq("id", 1).maybeSingle();
    showMissing("notify", error);
    const n = (!error && data) ? data : {};
    $("tgToken").value = n.telegram_token || "";
    $("tgChat").value = n.telegram_chat_id || "";
    $("waPhone").value = n.wa_phone || "";
    $("waKey").value = n.wa_apikey || "";
    setSwitch("ntNew", n.on_new !== false);
    setSwitch("ntCancel", n.on_cancel !== false);
    renderNotifyState();
  }

  async function saveNotify(quiet) {
    const t = A.t;
    const row = {
      id: 1,
      telegram_token: $("tgToken").value.trim() || null,
      telegram_chat_id: $("tgChat").value.trim() || null,
      wa_phone: $("waPhone").value.replace(/\D/g, "") || null,
      wa_apikey: $("waKey").value.trim() || null,
      on_new: isOn("ntNew"),
      on_cancel: isOn("ntCancel"),
      updated_at: new Date().toISOString()
    };
    const { error } = await A.db.from("notify_settings").upsert(row, { onConflict: "id" });
    if (error) { flash("error", isMissing(error) ? t.migrationMissing : A.errorText(error)); return false; }
    if (!quiet) flash("ok", t.saved);
    renderNotifyState();
    return true;
  }

  $("saveNotify").addEventListener("click", async () => {
    const btn = $("saveNotify");
    busy(btn, true);
    await saveNotify();
    busy(btn, false);
  });

  // Telegram's API answers browsers directly, so the chat id can be read from
  // the last message the admin sent to their own bot.
  $("tgFind").addEventListener("click", async () => {
    const t = A.t;
    const token = $("tgToken").value.trim();
    if (!token) { flash("error", t.tgNeedToken); $("tgToken").focus(); return; }
    const btn = $("tgFind");
    busy(btn, true);
    try {
      const res = await fetch("https://api.telegram.org/bot" + encodeURIComponent(token).replace(/%3A/gi, ":") + "/getUpdates");
      const json = await res.json();
      if (!json.ok) { flash("error", t.tgBadToken); return; }
      const msgs = (json.result || []).map((u) => u.message || u.edited_message || u.my_chat_member).filter(Boolean);
      const last = msgs[msgs.length - 1];
      if (!last || !last.chat) { flash("error", t.tgNoMessage); return; }
      $("tgChat").value = String(last.chat.id);
      renderNotifyState();
      flash("ok", t.tgFound);
    } catch (e) {
      flash("error", t.errGeneric);
    } finally {
      busy(btn, false);
    }
  });

  $("testNotify").addEventListener("click", async () => {
    const t = A.t;
    const tg = $("tgToken").value.trim() && $("tgChat").value.trim();
    const wa = $("waPhone").value.trim() && $("waKey").value.trim();
    if (!tg && !wa) { flash("error", t.notifyNothing); return; }
    const btn = $("testNotify");
    busy(btn, true);
    // Save first, so the test uses what is on the screen.
    const ok = await saveNotify(true);
    if (ok) {
      const { error } = await A.db.rpc("notify_test");
      if (error) flash("error", isMissing(error) ? t.migrationMissing : A.errorText(error));
      else flash("ok", t.notifySent);
    }
    busy(btn, false);
  });

  // ------------------------------------------- notifications on this device
  async function renderPushState() {
    const t = A.t;
    const el = $("pushState");
    let on = false;
    try {
      if (A.push.supported() && Notification.permission === "granted") {
        const reg = await navigator.serviceWorker.getRegistration();
        on = !!(reg && await reg.pushManager.getSubscription());
      }
    } catch (e) {}
    el.textContent = on ? t.pushEnabled : t.pushDisabled;
    el.classList.toggle("on", on);
    $("pushEnable").classList.toggle("hidden", on);
  }

  // The signing keys are made here, once, the first time notifications are
  // switched on. The private half stays in notify_settings (admin only); the
  // public half is published in site_content for customers' browsers.
  async function ensurePushKeys() {
    const { data } = await A.db.from("notify_settings").select("vapid_public, vapid_private").eq("id", 1).maybeSingle();
    if (data && data.vapid_public && data.vapid_private) {
      await A.db.from("site_content").upsert({ id: 1, push_public_key: data.vapid_public }, { onConflict: "id" });
      return data.vapid_public;
    }
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = A.push.b64(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    const a = await A.db.from("notify_settings").upsert({ id: 1, vapid_public: pub, vapid_private: jwk.d }, { onConflict: "id" });
    if (a.error) throw a.error;
    const b = await A.db.from("site_content").upsert({ id: 1, push_public_key: pub }, { onConflict: "id" });
    if (b.error) throw b.error;
    return pub;
  }

  $("pushEnable").addEventListener("click", async () => {
    const t = A.t;
    if (A.push.iosNeedsInstall()) { flash("", t.pushIosHint); return; }
    if (!A.push.supported()) { flash("error", t.pushUnsupported); return; }
    const btn = $("pushEnable");
    busy(btn, true);
    try {
      // Permission first: iOS only asks while the tap is still fresh.
      if (!(await A.push.ask())) throw new Error("DENIED");
      const key = await ensurePushKeys();
      const sub = await A.push.subscribe(key);
      const { error } = await A.db.rpc("save_push", {
        p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth, p_token: null, p_admin: true
      });
      if (error) throw error;
      flash("ok", t.pushReady);
    } catch (e) {
      const m = String((e && e.message) || "");
      flash("error", m === "DENIED" ? t.pushDenied : isMissing(e) || /column|function/i.test(m) ? t.migrationMissing : t.errGeneric);
    } finally {
      busy(btn, false);
      renderPushState();
    }
  });

  // ----------------------------------------------------------------- session

  async function enterAdmin() {
    $("boot").classList.add("hidden");
    $("loginCard").classList.add("hidden");
    $("adminApp").classList.remove("hidden");
    $("diaryDate").value = A.isoDate(new Date());
    renderTopDate();
    fillWeekdaySelect();
    showTab((location.hash || "").slice(1) || "dash", { keepScroll: true });
    await loadServices();      // the diary labels services, so load these first
    await Promise.all([loadSite(), loadGallery()]);
    renderGallery();
    renderSite();
    renderNotifyText();
    renderPushState();
    await Promise.all([loadDash(), loadDiary(), loadHours(), loadBreaks(), loadOverrides(), loadReviews(), loadSettings(), loadNotify()]);
  }

  function showLogin() {
    $("boot").classList.add("hidden");
    $("adminApp").classList.add("hidden");
    $("loginCard").classList.remove("hidden");
  }

  $("loginForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const t = A.t;
    const note = $("loginNotice");
    A.clearNotice(note);
    const btn = $("loginBtn");
    btn.disabled = true;
    btn.firstElementChild.textContent = t.signingIn;
    const { error } = await A.db.auth.signInWithPassword({
      email: $("email").value.trim(), password: $("password").value
    });
    btn.disabled = false;
    btn.firstElementChild.textContent = t.signIn;
    if (error) { A.notice(note, "error", t.errSignIn); return; }
    // Signing in is not the same as being an admin: the account also has to be
    // listed in the admins table, which is what the RLS policies check.
    const { data: admin } = await A.db.rpc("is_admin");
    if (!admin) {
      await A.db.auth.signOut();
      A.notice(note, "error", t.notAdmin);
      return;
    }
    enterAdmin();
  });

  $("signOut").addEventListener("click", async () => {
    await A.db.auth.signOut();
    location.hash = "";
    location.reload();
  });

  document.addEventListener("langchange", () => {
    if ($("adminApp").classList.contains("hidden")) return;
    renderTopDate();
    showTab(state.tab, { keepScroll: true });
    fillWeekdaySelect();
    fillServiceSelect();
    renderDash(); renderStrip(); renderDiary(); renderGallery(); renderServices();
    renderHours(); renderBreaks(); renderOverrides(); renderSite(); renderReviews();
    renderNotifyText(); renderNotifyState(); renderPushState();
  });

  A.mountLangToggle();

  if (!A.requireConfig($("loginNotice"))) showLogin();
  else {
    A.db.auth.getSession().then(async ({ data }) => {
      if (!data.session) { showLogin(); return; }
      const { data: admin } = await A.db.rpc("is_admin");
      if (admin) enterAdmin(); else showLogin();
    });
  }
})();
