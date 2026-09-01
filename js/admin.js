/* The admin side. Every write here is also checked by row level security on the
   server, so a signed-out visitor opening this page gets a login form and
   nothing else — and even hand-crafted requests are refused. */

(function () {
  "use strict";

  const A = window.APP;
  const $ = (id) => document.getElementById(id);

  const el = {
    loginCard: $("loginCard"),
    loginForm: $("loginForm"),
    loginBtn: $("loginBtn"),
    loginNotice: $("loginNotice"),
    app: $("adminApp"),
    notice: $("adminNotice"),
    diaryDate: $("diaryDate"),
    diaryList: $("diaryList"),
    hoursList: $("hoursList"),
    breaksList: $("breaksList"),
    daysList: $("daysList"),
    servicesList: $("servicesList"),
    signOut: $("signOut")
  };

  const state = { hours: [], breaks: [], overrides: [], services: [], appts: [] };

  // ------------------------------------------------------------------ helpers

  function flash(kind, text) {
    A.notice(el.notice, kind, text);
    setTimeout(() => A.clearNotice(el.notice), 2200);
  }

  function timeInput(value, onChange) {
    const i = document.createElement("input");
    i.type = "time";
    i.value = A.hhmm(value);
    i.addEventListener("change", () => onChange(i.value));
    return i;
  }

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

  // -------------------------------------------------------------------- diary

  async function loadDiary() {
    const t = A.t;
    const day = el.diaryDate.value;
    if (!day) return;

    // A shop-local day, expressed as the instants that bound it.
    const from = new Date(day + "T00:00:00");
    const to = new Date(day + "T00:00:00");
    to.setDate(to.getDate() + 1);

    const { data, error } = await A.db
      .from("appointments")
      .select("id,starts_at,ends_at,customer_name,customer_phone,note,status,service_id")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", to.toISOString())
      .order("starts_at");

    if (error) { flash("error", A.errorText(error)); return; }

    state.appts = data || [];
    renderDiary();
  }

  function renderDiary() {
    const t = A.t;
    el.diaryList.innerHTML = "";

    if (!state.appts.length) {
      el.diaryList.innerHTML = '<div class="empty">' + t.noAppts + "</div>";
      return;
    }

    state.appts.forEach((a) => {
      const svc = state.services.find((s) => s.id === a.service_id);
      const row = document.createElement("div");
      row.className = "appt" + (a.status === "cancelled" ? " cancelled" : "");

      const time = document.createElement("div");
      time.className = "appt-time";
      time.textContent = A.timeStr(new Date(a.starts_at));

      const body = document.createElement("div");
      body.className = "appt-body";
      const name = document.createElement("div");
      name.className = "appt-name";
      name.textContent = a.customer_name;
      const meta = document.createElement("div");
      meta.className = "appt-meta";
      meta.textContent = [
        svc ? (A.lang === "he" ? svc.name_he : svc.name_en) : "",
        a.customer_phone,
        a.note || ""
      ].filter(Boolean).join(" · ");
      body.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "inline";
      actions.style.flex = "none";

      const call = document.createElement("a");
      call.href = "tel:" + a.customer_phone.replace(/[^\d+]/g, "");
      call.className = "chip";
      call.textContent = t.call;
      actions.appendChild(call);

      if (a.status === "booked") {
        const kill = document.createElement("button");
        kill.type = "button";
        kill.className = "chip";
        kill.textContent = "✕";
        kill.title = t.cancelAppt;
        kill.addEventListener("click", async () => {
          if (!confirm(t.confirmCancel)) return;
          const { error } = await A.db
            .from("appointments")
            .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", a.id);
          if (error) { flash("error", A.errorText(error)); return; }
          flash("ok", t.cancelled);
          loadDiary();
        });
        actions.appendChild(kill);
      }

      row.append(time, body, actions);
      el.diaryList.appendChild(row);
    });
  }

  // ------------------------------------------------------------ opening hours

  async function loadHours() {
    const { data, error } = await A.db.from("work_hours").select("*").order("weekday");
    if (error) { flash("error", A.errorText(error)); return; }
    state.hours = data || [];
    renderHours();
  }

  function renderHours() {
    const t = A.t;
    el.hoursList.innerHTML = "";
    state.hours.forEach((h) => {
      const row = document.createElement("div");
      row.className = "row";

      const label = document.createElement("span");
      label.className = "row-label";
      label.textContent = t.weekdays[h.weekday];

      const sw = toggle(h.is_open, (v) => { h.is_open = v; });
      const from = timeInput(h.opens, (v) => { h.opens = v; });
      const to = timeInput(h.closes, (v) => { h.closes = v; });

      row.append(label, sw, from, to);
      el.hoursList.appendChild(row);
    });
  }

  $("saveHours").addEventListener("click", async () => {
    const t = A.t;
    for (const h of state.hours) {
      if (h.is_open && !(h.closes > h.opens)) {
        flash("error", t.weekdays[h.weekday] + ": " + t.from + " / " + t.to);
        return;
      }
    }
    const rows = state.hours.map((h) => ({
      weekday: h.weekday, is_open: h.is_open, opens: h.opens, closes: h.closes
    }));
    const { error } = await A.db.from("work_hours").upsert(rows, { onConflict: "weekday" });
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
  });

  // ------------------------------------------------------------------- breaks

  async function loadBreaks() {
    const { data, error } = await A.db.from("breaks").select("*").order("starts");
    if (error) { flash("error", A.errorText(error)); return; }
    state.breaks = data || [];
    renderBreaks();
  }

  function renderBreaks() {
    const t = A.t;
    el.breaksList.innerHTML = "";
    if (!state.breaks.length) {
      el.breaksList.innerHTML = '<div class="empty">—</div>';
    }
    state.breaks.forEach((b) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("span");
      label.className = "row-label";
      label.textContent = b.weekday !== null && b.weekday !== undefined
        ? t.weekdays[b.weekday]
        : b.on_date;
      const when = document.createElement("span");
      when.className = "chip";
      when.textContent = A.hhmm(b.starts) + " – " + A.hhmm(b.ends);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "chip";
      del.textContent = "✕";
      del.addEventListener("click", async () => {
        if (!confirm(t.confirmDelete)) return;
        const { error } = await A.db.from("breaks").delete().eq("id", b.id);
        if (error) { flash("error", A.errorText(error)); return; }
        loadBreaks();
      });
      row.append(label, when, del);
      el.breaksList.appendChild(row);
    });
  }

  $("addBreak").addEventListener("click", async () => {
    const t = A.t;
    const starts = $("breakStart").value;
    const ends = $("breakEnd").value;
    if (!starts || !ends || !(ends > starts)) { flash("error", t.errGeneric); return; }
    const { error } = await A.db.from("breaks").insert({
      weekday: Number($("breakWeekday").value), starts, ends
    });
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
    loadBreaks();
  });

  // ------------------------------------------------------------ special days

  async function loadOverrides() {
    const today = A.isoDate(new Date());
    const { data, error } = await A.db
      .from("day_overrides").select("*").gte("on_date", today).order("on_date");
    if (error) { flash("error", A.errorText(error)); return; }
    state.overrides = data || [];
    renderOverrides();
  }

  function renderOverrides() {
    const t = A.t;
    el.daysList.innerHTML = "";
    if (!state.overrides.length) {
      el.daysList.innerHTML = '<div class="empty">—</div>';
    }
    state.overrides.forEach((o) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("span");
      label.className = "row-label";
      label.textContent = o.on_date;
      const what = document.createElement("span");
      what.className = "chip";
      what.textContent = o.is_closed
        ? t.closed
        : A.hhmm(o.opens) + " – " + A.hhmm(o.closes);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "chip";
      del.textContent = "✕";
      del.addEventListener("click", async () => {
        if (!confirm(t.confirmDelete)) return;
        const { error } = await A.db.from("day_overrides").delete().eq("on_date", o.on_date);
        if (error) { flash("error", A.errorText(error)); return; }
        loadOverrides();
      });
      row.append(label, what, del);
      el.daysList.appendChild(row);
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
    if (!on_date) { flash("error", t.errGeneric); return; }
    const is_closed = ovClosedBtn.getAttribute("aria-checked") === "true";
    const row = is_closed
      ? { on_date, is_closed: true, opens: null, closes: null }
      : { on_date, is_closed: false, opens: $("ovOpen").value, closes: $("ovClose").value };
    if (!is_closed && !(row.closes > row.opens)) { flash("error", t.errGeneric); return; }
    const { error } = await A.db.from("day_overrides").upsert(row, { onConflict: "on_date" });
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
    loadOverrides();
  });

  // ----------------------------------------------------------------- services

  async function loadServices() {
    const { data, error } = await A.db.from("services").select("*").order("sort_order");
    if (error) { flash("error", A.errorText(error)); return; }
    state.services = data || [];
    renderServices();
  }

  function renderServices() {
    const t = A.t;
    el.servicesList.innerHTML = "";
    state.services.forEach((s) => {
      const row = document.createElement("div");
      row.className = "row";

      const he = document.createElement("input");
      he.type = "text"; he.value = s.name_he; he.style.flex = "1"; he.style.minWidth = "96px";
      he.addEventListener("input", () => { s.name_he = he.value; });

      const en = document.createElement("input");
      en.type = "text"; en.value = s.name_en; en.style.flex = "1"; en.style.minWidth = "96px";
      en.addEventListener("input", () => { s.name_en = en.value; });

      const dur = document.createElement("input");
      dur.type = "number"; dur.value = s.duration_min; dur.min = 5; dur.max = 480; dur.step = 5;
      dur.style.width = "72px";
      dur.addEventListener("input", () => { s.duration_min = Number(dur.value); });

      const price = document.createElement("input");
      price.type = "number"; price.value = s.price === null ? "" : s.price; price.min = 0; price.step = 5;
      price.style.width = "72px";
      price.addEventListener("input", () => { s.price = price.value === "" ? null : Number(price.value); });

      const priceMax = document.createElement("input");
      priceMax.type = "number";
      priceMax.value = (s.price_max === null || s.price_max === undefined) ? "" : s.price_max;
      priceMax.min = 0; priceMax.step = 5;
      priceMax.style.width = "72px";
      priceMax.placeholder = "–";
      priceMax.title = A.t.priceMax;
      priceMax.addEventListener("input", () => {
        s.price_max = priceMax.value === "" ? null : Number(priceMax.value);
      });

      const sw = toggle(s.active, (v) => { s.active = v; });

      row.append(he, en, dur, price, priceMax, sw);
      el.servicesList.appendChild(row);
    });
  }

  $("saveServices").addEventListener("click", async () => {
    const t = A.t;
    for (const s of state.services) {
      if (!s.name_he.trim() || !s.name_en.trim() || !(s.duration_min >= 5)) {
        flash("error", t.errGeneric);
        return;
      }
    }
    const rows = state.services.map((s) => ({
      id: s.id, name_he: s.name_he.trim(), name_en: s.name_en.trim(),
      duration_min: s.duration_min, price: s.price, price_max: s.price_max,
      active: s.active, sort_order: s.sort_order
    }));
    const { error } = await A.db.from("services").upsert(rows, { onConflict: "id" });
    if (error) { flash("error", A.errorText(error)); return; }
    flash("ok", t.saved);
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
      sort_order: (state.services.length ? Math.max(...state.services.map((s) => s.sort_order)) : 0) + 1
    });
    if (error) { flash("error", A.errorText(error)); return; }
    $("newSvcHe").value = ""; $("newSvcEn").value = "";
    flash("ok", t.saved);
    loadServices();
  });

  // --------------------------------------------------------------------- tabs

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach((b) =>
        b.setAttribute("aria-selected", String(b === btn)));
      document.querySelectorAll("[data-panel]").forEach((p) =>
        p.classList.toggle("hidden", p.getAttribute("data-panel") !== name));
    });
  });

  $("prevDay").addEventListener("click", () => {
    el.diaryDate.value = A.addDays(el.diaryDate.value, -1);
    loadDiary();
  });
  $("nextDay").addEventListener("click", () => {
    el.diaryDate.value = A.addDays(el.diaryDate.value, 1);
    loadDiary();
  });
  el.diaryDate.addEventListener("change", loadDiary);

  // ------------------------------------------------------------------ session

  function fillWeekdaySelect() {
    const sel = $("breakWeekday");
    const current = sel.value;
    sel.innerHTML = "";
    A.t.weekdays.forEach((name, i) => {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = name;
      sel.appendChild(o);
    });
    if (current) sel.value = current;
  }

  async function enterAdmin() {
    el.loginCard.classList.add("hidden");
    el.app.classList.remove("hidden");
    el.diaryDate.value = A.isoDate(new Date());
    fillWeekdaySelect();
    await loadServices();       // the diary labels services, so load these first
    await Promise.all([loadDiary(), loadHours(), loadBreaks(), loadOverrides()]);
  }

  function showLogin() {
    el.app.classList.add("hidden");
    el.loginCard.classList.remove("hidden");
  }

  el.loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const t = A.t;
    A.clearNotice(el.loginNotice);
    el.loginBtn.disabled = true;
    el.loginBtn.textContent = t.signingIn;

    const { error } = await A.db.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    el.loginBtn.disabled = false;
    el.loginBtn.textContent = t.signIn;

    if (error) { A.notice(el.loginNotice, "error", t.errSignIn); return; }

    // Signing in is not the same as being an admin: the account also has to be
    // listed in the admins table, which is what the RLS policies check.
    const { data: admin } = await A.db.rpc("is_admin");
    if (!admin) {
      await A.db.auth.signOut();
      A.notice(el.loginNotice, "error", t.notAdmin);
      return;
    }
    enterAdmin();
  });

  el.signOut.addEventListener("click", async () => {
    await A.db.auth.signOut();
    location.reload();
  });

  document.addEventListener("langchange", () => {
    fillWeekdaySelect();
    renderDiary();
    renderHours();
    renderBreaks();
    renderOverrides();
    renderServices();
  });

  A.mountLangToggle();

  if (A.requireConfig(el.loginNotice)) {
    A.db.auth.getSession().then(async ({ data }) => {
      if (!data.session) { showLogin(); return; }
      const { data: admin } = await A.db.rpc("is_admin");
      if (admin) enterAdmin(); else showLogin();
    });
  }
})();
