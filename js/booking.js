/* The booking sheet. Never touches the appointments table directly — every
   call here goes through a database function that returns times, not names. */

(function () {
  "use strict";

  const A = window.APP;
  const FX = window.FX;
  const S = window.SITE;
  const $ = (id) => document.getElementById(id);

  const sheet = $("sheet");
  const el = {
    title: $("sheetTitle"), step: $("sheetStep"), progress: $("sheetProgress"),
    back: $("sheetBack"), close: $("sheetClose"), body: $("sheetBody"),
    notice: $("sheetNotice"),
    pickServices: $("pickServices"), chosenSvc: $("chosenSvc"),
    monthLabel: $("monthLabel"), days: $("days"), slots: $("slots"), slotsEmpty: $("slotsEmpty"),
    summary: $("summary"), form: $("bookForm"), formNotice: $("formNotice"), bookBtn: $("bookBtn"),
    name: $("cName"), phone: $("cPhone"), note: $("cNote"), remember: $("cRemember"),
    doneTicket: $("doneTicket"), cancelLink: $("cancelLink"), copyBtn: $("copyBtn"),
    icsBtn: $("icsBtn"), doneBit: $("doneBit"), againBtn: $("againBtn"), mineList: $("mineList")
  };

  const ORDER = ["svc", "time", "details"];
  const state = {
    pane: null, serviceId: null, date: null, slot: null,
    days: [], closed: {}, slots: [], last: null, wantSlot: null
  };

  const rtl = () => document.documentElement.dir === "rtl";
  const svc = () => S.services.find((s) => s.id === state.serviceId);

  // ------------------------------------------------------------- open/close

  function open(opts) {
    opts = opts || {};
    const o = opts.origin;
    sheet.style.setProperty("--ox", o ? o.x + "px" : "50%");
    sheet.style.setProperty("--oy", o ? o.y + "px" : "100%");
    if (S.closeMenu) S.closeMenu();
    A.clearNotice(el.notice);

    if (opts.pane === "mine") go("mine");
    else {
      if (opts.serviceId) state.serviceId = opts.serviceId;
      if (opts.date) state.date = opts.date;
      state.wantSlot = opts.slot || null;
      if (S.services.length === 1) state.serviceId = S.services[0].id;
      if (!state.date) state.date = A.isoDate(new Date());
      go(state.serviceId && svc() ? "time" : "svc", true);
    }

    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    document.body.classList.add("lock");
    if (!history.state || !history.state.sheet) history.pushState({ sheet: 1 }, "", "#book");
  }

  function close(fromPop) {
    if (!sheet.classList.contains("open")) return;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lock");
    if (!fromPop && history.state && history.state.sheet) history.back();
    else if (location.hash === "#book") history.replaceState(null, "", location.pathname + location.search);
  }

  window.addEventListener("popstate", () => close(true));
  el.mineList.addEventListener("click", (e) => {
    if (!e.target.closest("[data-close-sheet]")) return;
    e.preventDefault();
    close();
    setTimeout(() => { location.hash = "review"; }, 450);
  });
  el.close.addEventListener("click", () => close());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  el.back.addEventListener("click", () => {
    const i = ORDER.indexOf(state.pane);
    if (i > 0) go(ORDER[i - 1]);
    else close();
  });

  // Every [data-book] on the page opens the sheet, from wherever it was tapped.
  document.addEventListener("click", (e) => {
    const mine = e.target.closest("[data-mine]");
    if (mine) {
      e.preventDefault();
      open({ pane: "mine", origin: { x: e.clientX, y: e.clientY } });
      return;
    }
    const b = e.target.closest("[data-book]");
    if (!b) return;
    e.preventDefault();
    const opts = { origin: { x: e.clientX, y: e.clientY } };
    if (b.hasAttribute("data-service")) opts.serviceId = Number(b.getAttribute("data-service"));
    if (b.id === "nextFree" && S.nextFree) {
      opts.serviceId = S.nextFree.serviceId;
      opts.date = S.nextFree.date;
      opts.slot = S.nextFree.slot;
    }
    open(opts);
  });

  // ------------------------------------------------------------------ panes

  function go(pane, first) {
    const t = A.t;
    const from = ORDER.indexOf(state.pane);
    const to = ORDER.indexOf(pane);
    const fwd = first || to >= from;
    el.body.style.setProperty("--dirx", (fwd ? 1 : -1) * (rtl() ? -1 : 1));
    state.pane = pane;
    sheet.querySelectorAll(".pane").forEach((p) => {
      const on = p.getAttribute("data-pane") === pane;
      p.classList.toggle("active", false);
      if (on) { void p.offsetWidth; p.classList.add("active"); }
    });
    el.body.scrollTop = 0;
    A.clearNotice(el.notice);

    const titles = { svc: t.step1, time: t.step2, details: t.step3, done: t.yourBooking, mine: t.myApptsTitle };
    el.title.textContent = titles[pane];
    el.step.textContent = to > -1 ? t.stepOf + " " + (to + 1) + "/3" : t.shopName;
    el.progress.style.setProperty("--p", to > -1 ? (to + 1) / 3 : 1);
    el.back.classList.toggle("invisible", to <= 0);

    if (pane === "svc") renderServices();
    if (pane === "time") enterTime();
    if (pane === "details") enterDetails();
    if (pane === "mine") renderMine();
  }

  // --------------------------------------------------------------- services

  function renderServices() {
    const t = A.t;
    if (!S.services.length) {
      el.pickServices.innerHTML = '<div class="empty">' + A.esc(A.configured ? "—" : t.errNotConfigured) + "</div>";
      return;
    }
    el.pickServices.innerHTML = S.services.map((s, i) => {
      const desc = A.serviceDesc(s);
      return '<button type="button" class="pick" style="--i:' + i + '" data-id="' + s.id + '" aria-pressed="' + (s.id === state.serviceId) + '">' +
        '<span class="pick-ico">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="pick-main"><span class="pick-name">' + A.esc(A.serviceName(s)) + "</span>" +
        '<span class="pick-sub">' + s.duration_min + " " + A.esc(t.minutes) + (desc ? " · " + A.esc(desc) : "") + "</span></span>" +
        '<span class="pick-price">' + A.esc(A.priceText(s)) + "</span></button>";
    }).join("");
  }

  el.pickServices.addEventListener("click", (e) => {
    const b = e.target.closest(".pick");
    if (!b) return;
    state.serviceId = Number(b.getAttribute("data-id"));
    state.slot = null;
    el.pickServices.querySelectorAll(".pick").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setTimeout(() => go("time"), 180);
  });

  // ------------------------------------------------------------- day + time

  function buildDays() {
    const ahead = Math.min(30, Math.max(1, Number(S.settings.max_days_ahead) || 30));
    const today = A.isoDate(new Date());
    state.days = Array.from({ length: ahead + 1 }, (_, i) => A.addDays(today, i));
    const shut = {};
    S.hours.forEach((h) => { if (!h.is_open) shut[h.weekday] = true; });
    const ov = {};
    S.overrides.forEach((o) => { ov[o.on_date] = o; });
    state.closed = {};
    state.days.forEach((iso) => {
      // An override wins outright; otherwise the weekly plan decides.
      state.closed[iso] = ov[iso] ? !!ov[iso].is_closed : !!shut[A.weekdayOf(iso)];
    });
    if (state.days.indexOf(state.date) === -1) state.date = today;
    // Landing on a closed day is a dead end; move to the first open one.
    if (state.closed[state.date]) {
      const firstOpen = state.days.find((d) => !state.closed[d]);
      if (firstOpen) state.date = firstOpen;
    }
  }

  function enterTime() {
    const t = A.t;
    const s = svc();
    el.chosenSvc.innerHTML = s
      ? "<span><b>" + A.esc(A.serviceName(s)) + "</b> · " + s.duration_min + " " + A.esc(t.minutes) +
        (A.priceText(s) ? " · " + A.esc(A.priceText(s)) : "") + '</span><button type="button" data-change>' + A.esc(t.back) + "</button>"
      : "";
    const ch = el.chosenSvc.querySelector("[data-change]");
    if (ch) ch.addEventListener("click", () => go("svc"));
    buildDays();
    renderDays();
    loadSlots();
  }

  function renderDays() {
    const t = A.t;
    el.days.innerHTML = state.days.map((iso) =>
      '<button type="button" class="day" data-iso="' + iso + '" aria-pressed="' + (iso === state.date) + '"' +
      (state.closed[iso] ? ' data-closed="true"' : "") + ">" +
      '<span class="day-name">' + A.esc(t.weekdaysShort[A.weekdayOf(iso)]) + "</span>" +
      '<span class="day-num">' + A.dayNumber(iso) + "</span><span class=\"day-dot\"></span></button>").join("");
    monthLabel();
    const cur = el.days.querySelector('[aria-pressed="true"]');
    if (cur) requestAnimationFrame(() => cur.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }));
  }

  function monthLabel() {
    const d = new Date(state.date + "T12:00:00Z");
    el.monthLabel.textContent = new Intl.DateTimeFormat(A.t.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(d) +
      " · " + A.dateStr(new Date(state.date + "T12:00:00"));
  }

  el.days.addEventListener("click", (e) => {
    const b = e.target.closest(".day");
    if (!b) return;
    state.date = b.getAttribute("data-iso");
    state.slot = null;
    el.days.querySelectorAll(".day").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    monthLabel();
    loadSlots();
  });

  let req = 0;
  async function loadSlots() {
    const t = A.t;
    if (!state.serviceId) return;
    const mine = ++req;
    el.slots.innerHTML = '<div class="spinner"></div>';
    el.slotsEmpty.classList.add("hidden");
    if (state.closed[state.date]) { renderSlots([]); return; }
    let res;
    try {
      res = await A.db.rpc("available_slots", { p_date: state.date, p_service_id: state.serviceId });
    } catch (e) { res = { error: e }; }
    if (mine !== req) return;     // a newer request already went out
    if (res.error) {
      el.slots.innerHTML = "";
      A.notice(el.notice, "error", A.errorText(res.error));
      return;
    }
    renderSlots((res.data || []).map((r) => r.slot_start));
    if (state.wantSlot) {
      const want = state.wantSlot;
      state.wantSlot = null;
      const btn = el.slots.querySelector('[data-at="' + CSS.escape(want) + '"]');
      if (btn) btn.click();
    }
  }

  function hourOf(d) {
    return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: A.tz }).format(d));
  }

  function renderSlots(slots) {
    const t = A.t;
    state.slots = slots;
    el.slots.innerHTML = "";
    if (!slots.length) {
      el.slotsEmpty.textContent = state.closed[state.date] ? t.closedDay : t.noSlots;
      el.slotsEmpty.classList.remove("hidden");
      return;
    }
    el.slotsEmpty.classList.add("hidden");
    const groups = [[t.morning, []], [t.afternoon, []], [t.evening, []]];
    slots.forEach((iso) => {
      const d = new Date(iso);
      const h = hourOf(d);
      groups[h < 12 ? 0 : h < 17 ? 1 : 2][1].push(iso);
    });
    let n = 0;
    el.slots.innerHTML = groups.filter((g) => g[1].length).map((g) =>
      '<div class="slot-group"><h4>' + A.esc(g[0]) + '</h4><div class="slots-grid">' +
      g[1].map((iso) => {
        const d = new Date(iso);
        const on = state.slot && state.slot.getTime() === d.getTime();
        return '<button type="button" class="slot" style="--i:' + (n++) + '" data-at="' + iso + '" aria-pressed="' + !!on + '">' + A.timeStr(d) + "</button>";
      }).join("") + "</div></div>").join("");
  }

  el.slots.addEventListener("click", (e) => {
    const b = e.target.closest(".slot");
    if (!b) return;
    state.slot = new Date(b.getAttribute("data-at"));
    el.slots.querySelectorAll(".slot").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    setTimeout(() => go("details"), 220);
  });

  // ---------------------------------------------------------------- details

  function ticketHtml(s, when, withPole) {
    const t = A.t;
    return (withPole ? '<span class="tk-pole"></span>' : "") +
      '<div class="tk-svc">' + A.esc(A.serviceName(s)) + "</div>" +
      '<div class="tk-row"><div><small>' + A.esc(t.date) + "</small><b>" + A.esc(A.dateStr(when)) + "</b></div>" +
      '<div><small>' + A.esc(t.time) + '</small><b class="tk-time">' + A.timeStr(when) + "</b></div></div>";
  }

  function enterDetails() {
    const s = svc();
    if (!s || !state.slot) { go("time"); return; }
    el.summary.innerHTML = ticketHtml(s, state.slot, false);
    A.clearNotice(el.formNotice);
    try {
      const me = JSON.parse(localStorage.getItem("barbershop.me") || "null");
      if (me && !el.name.value) el.name.value = me.n || "";
      if (me && !el.phone.value) el.phone.value = me.p || "";
    } catch (e) {}
    if (!el.name.value && FX.fine) setTimeout(() => el.name.focus(), 500);
  }

  el.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const t = A.t;
    A.clearNotice(el.formNotice);
    const name = el.name.value.trim();
    const phone = el.phone.value.trim();
    const note = el.note.value.trim();
    if (name.length < 2) { A.notice(el.formNotice, "error", t.errBadName); el.name.focus(); return; }
    if (phone.replace(/\D/g, "").length < 7) { A.notice(el.formNotice, "error", t.errBadPhone); el.phone.focus(); return; }
    if (!state.slot || !state.serviceId) return;

    el.bookBtn.disabled = true;
    el.bookBtn.firstElementChild.textContent = t.booking;
    let res;
    try {
      res = await A.db.rpc("create_appointment", {
        p_service_id: state.serviceId,
        p_starts_at: state.slot.toISOString(),
        p_name: name, p_phone: phone, p_note: note || null
      });
    } catch (e) { res = { error: e }; }
    el.bookBtn.disabled = false;
    el.bookBtn.firstElementChild.textContent = t.book;

    if (res.error) {
      A.notice(el.formNotice, "error", A.errorText(res.error));
      if (String(res.error.message || "").indexOf("SLOT_TAKEN") > -1) {
        state.slot = null;
        setTimeout(() => go("time"), 1400);
      }
      return;
    }

    try {
      if (el.remember.checked) localStorage.setItem("barbershop.me", JSON.stringify({ n: name, p: phone }));
      else localStorage.removeItem("barbershop.me");
    } catch (e) {}

    const s = svc();
    state.last = {
      token: res.data, svc: s, start: state.slot,
      end: new Date(state.slot.getTime() + s.duration_min * 60000)
    };
    A.rememberToken(res.data, state.slot.toISOString());
    el.note.value = "";
    showDone();
    // The slot is gone now; let the hero chip catch up.
    document.dispatchEvent(new CustomEvent("booking:made"));
  });

  // ------------------------------------------------------------------- done

  function showDone() {
    go("done");
    renderDone();
    FX.confetti($("confetti"));
  }

  function renderDone() {
    const L = state.last;
    if (!L) return;
    el.doneTicket.innerHTML = ticketHtml(L.svc, L.start, true);
    el.cancelLink.value = A.cancelUrl(L.token);
    const bit = A.bitUrl();
    if (bit) { el.doneBit.href = bit; el.doneBit.classList.remove("hidden"); }
    else el.doneBit.classList.add("hidden");
  }

  el.copyBtn.addEventListener("click", async () => {
    const t = A.t;
    try { await navigator.clipboard.writeText(el.cancelLink.value); }
    catch (e) {
      el.cancelLink.select();                 // clipboard blocked; let them copy by hand
      try { document.execCommand("copy"); } catch (e2) {}
    }
    el.copyBtn.firstElementChild.textContent = t.copied;
    setTimeout(() => { el.copyBtn.firstElementChild.textContent = t.copyLink; }, 1800);
  });

  el.icsBtn.addEventListener("click", () => {
    const L = state.last;
    if (!L) return;
    const blob = A.icsFile(A.serviceName(L.svc) + " · " + A.t.shopName, L.start, L.end, A.cancelUrl(L.token));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "akiva-barbershop.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  el.againBtn.addEventListener("click", () => {
    state.slot = null;
    go("svc");
  });

  // -------------------------------------------------------- my appointments

  async function renderMine() {
    const t = A.t;
    const list = A.myTokens();
    if (!list.length) {
      el.mineList.innerHTML = '<div class="empty">' + A.esc(t.myApptsEmpty) + "</div>";
      return;
    }
    el.mineList.innerHTML = '<div class="spinner"></div>';
    const rows = await Promise.all(list.map(async (x) => {
      try {
        const { data } = await A.db.rpc("appointment_by_token", { p_token: x.t });
        return data && data[0] ? Object.assign({ token: x.t }, data[0]) : null;
      } catch (e) { return null; }
    }));
    if (state.pane !== "mine") return;
    const now = Date.now();
    const items = rows.filter(Boolean).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    if (!items.length) {
      el.mineList.innerHTML = '<div class="empty">' + A.esc(t.myApptsEmpty) + "</div>";
      return;
    }
    // Upcoming first, soonest at the top; then the past.
    const up = items.filter((r) => r.status === "booked" && new Date(r.starts_at) > now).reverse();
    const rest = items.filter((r) => up.indexOf(r) === -1);
    el.mineList.innerHTML = up.concat(rest).map((r) => {
      const d = new Date(r.starts_at);
      const off = r.status === "cancelled" || d <= now;
      const svcName = A.lang === "he" ? r.service_he : r.service_en;
      const tag = r.status === "cancelled" ? t.statusCancelled : d <= now ? t.statusPast : "";
      const month = new Intl.DateTimeFormat(t.locale, { month: "short", timeZone: A.tz }).format(d);
      return '<div class="mine' + (off ? " off" : "") + '">' +
        '<div class="mine-date"><b>' + A.dayNumber(A.isoDate(d)) + "</b><small>" + A.esc(month) + "</small></div>" +
        '<div class="mine-main"><b>' + A.esc(svcName) + "</b><span>" + A.esc(t.weekdays[A.weekdayOf(A.isoDate(d))]) + " · " + A.timeStr(d) + "</span></div>" +
        (r.status === "booked" && d <= now ? '<a href="#review" data-close-sheet>' + A.esc(t.reviewAsk) + "</a>"
          : tag ? '<span class="tag">' + A.esc(tag) + "</span>"
             : '<a href="cancel.html?t=' + encodeURIComponent(r.token) + '">' + A.esc(t.manage) + "</a>") +
        "</div>";
    }).join("");
  }

  // ------------------------------------------------------------------- boot

  document.addEventListener("langchange", () => {
    if (!state.pane || !sheet.classList.contains("open")) return;
    if (state.pane === "done") { go("done"); renderDone(); }
    else go(state.pane);
  });

  // index.html#book (the installed app's shortcut, or a shared link) opens
  // straight into booking once the data is in.
  S.ready.then(() => {
    if (location.hash === "#book") {
      history.replaceState(null, "", location.pathname + location.search);
      open({});
    }
  });
})();
