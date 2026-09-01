/* The customer side. Never touches the appointments table directly — every
   call here goes through a database function that returns times, not names. */

(function () {
  "use strict";

  const A = window.APP;
  const $ = (id) => document.getElementById(id);

  const el = {
    topNotice: $("topNotice"),
    services: $("services"),
    days: $("days"),
    slots: $("slots"),
    slotsEmpty: $("slotsEmpty"),
    dayLabel: $("dayLabel"),
    detailsCard: $("detailsCard"),
    summary: $("summary"),
    form: $("bookForm"),
    formNotice: $("formNotice"),
    bookBtn: $("bookBtn"),
    flow: $("flow"),
    done: $("done"),
    doneSummary: $("doneSummary"),
    cancelLink: $("cancelLink"),
    copyBtn: $("copyBtn"),
    againBtn: $("againBtn")
  };

  const state = {
    services: [],
    serviceId: null,
    date: null,       // ISO, shop-local
    slot: null,       // Date
    closedDays: {},   // iso -> true, filled in as we learn
    days: []
  };

  // ------------------------------------------------------------------ render

  function serviceName(s) {
    return A.lang === "he" ? s.name_he : s.name_en;
  }

  function renderServices() {
    const t = A.t;
    if (!state.services.length) {
      el.services.innerHTML = '<div class="empty">—</div>';
      return;
    }
    el.services.innerHTML = "";
    state.services.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "service";
      btn.setAttribute("aria-pressed", String(state.serviceId === s.id));

      const name = document.createElement("span");
      name.className = "service-name";
      name.textContent = serviceName(s);

      const meta = document.createElement("span");
      meta.className = "service-meta";
      const dur = document.createElement("span");
      dur.textContent = s.duration_min + " " + t.minutes;
      meta.appendChild(dur);
      if (s.price !== null && s.price !== undefined) {
        const price = document.createElement("span");
        price.className = "service-price";
        price.textContent = t.currency + Number(s.price).toFixed(0);
        meta.appendChild(price);
      }

      btn.append(name, meta);
      btn.addEventListener("click", () => {
        state.serviceId = s.id;
        state.slot = null;
        renderServices();
        loadSlots();
      });
      el.services.appendChild(btn);
    });
  }

  function renderDays() {
    const t = A.t;
    el.days.innerHTML = "";
    state.days.forEach((iso) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day";
      btn.setAttribute("aria-pressed", String(state.date === iso));
      if (state.closedDays[iso]) btn.setAttribute("data-closed", "true");

      const wd = document.createElement("span");
      wd.className = "day-name";
      wd.textContent = t.weekdaysShort[A.weekdayOf(iso)];

      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = A.dayNumber(iso);

      btn.append(wd, num);
      btn.addEventListener("click", () => {
        state.date = iso;
        state.slot = null;
        renderDays();
        loadSlots();
      });
      el.days.appendChild(btn);
    });
  }

  function renderSlots(slots) {
    const t = A.t;
    el.slots.innerHTML = "";
    if (!slots.length) {
      el.slotsEmpty.textContent = state.closedDays[state.date] ? t.closedDay : t.noSlots;
      el.slotsEmpty.classList.remove("hidden");
      return;
    }
    el.slotsEmpty.classList.add("hidden");
    slots.forEach((iso) => {
      const when = new Date(iso);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = A.timeStr(when);
      btn.setAttribute("aria-pressed", String(!!state.slot && state.slot.getTime() === when.getTime()));
      btn.addEventListener("click", () => {
        state.slot = when;
        renderSlots(slots);
        showDetails();
        el.detailsCard.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      el.slots.appendChild(btn);
    });
  }

  function summaryText() {
    const svc = state.services.find((s) => s.id === state.serviceId);
    if (!svc || !state.slot) return "";
    return serviceName(svc) + " · " + A.dateStr(state.slot) + " · " + A.timeStr(state.slot);
  }

  function showDetails() {
    if (!state.slot) {
      el.detailsCard.classList.add("hidden");
      return;
    }
    el.summary.textContent = summaryText();
    el.detailsCard.classList.remove("hidden");
  }

  // -------------------------------------------------------------------- data

  async function loadServices() {
    const { data, error } = await A.db
      .from("services")
      .select("id,name_he,name_en,duration_min,price")
      .eq("active", true)
      .order("sort_order");
    if (error) {
      A.notice(el.topNotice, "error", A.errorText(error));
      el.services.innerHTML = "";
      return;
    }
    state.services = data || [];
    if (state.services.length === 1) state.serviceId = state.services[0].id;
    renderServices();
    if (state.serviceId) loadSlots();
  }

  // Which of the next 7 days the shop is shut, so closed days read as closed
  // rather than as "no times left".
  async function loadClosedDays() {
    const [hours, overrides] = await Promise.all([
      A.db.from("work_hours").select("weekday,is_open"),
      A.db.from("day_overrides").select("on_date,is_closed").in("on_date", state.days)
    ]);

    const shutWeekday = {};
    (hours.data || []).forEach((h) => { if (!h.is_open) shutWeekday[h.weekday] = true; });

    const byDate = {};
    (overrides.data || []).forEach((o) => { byDate[o.on_date] = o; });

    state.closedDays = {};
    state.days.forEach((iso) => {
      const ov = byDate[iso];
      if (ov) state.closedDays[iso] = !!ov.is_closed;      // an override wins outright
      else state.closedDays[iso] = !!shutWeekday[A.weekdayOf(iso)];
    });
    renderDays();
  }

  let slotRequest = 0;
  async function loadSlots() {
    const t = A.t;
    el.dayLabel.textContent = state.date ? A.dateStr(new Date(state.date + "T12:00:00")) : "";
    showDetails();

    if (!state.serviceId) {
      el.slots.innerHTML = "";
      el.slotsEmpty.textContent = t.pickServiceFirst;
      el.slotsEmpty.classList.remove("hidden");
      return;
    }

    const mine = ++slotRequest;
    el.slots.innerHTML = '<div class="spinner"></div>';
    el.slotsEmpty.classList.add("hidden");

    const { data, error } = await A.db.rpc("available_slots", {
      p_date: state.date,
      p_service_id: state.serviceId
    });

    if (mine !== slotRequest) return;   // a newer request already went out

    if (error) {
      el.slots.innerHTML = "";
      A.notice(el.topNotice, "error", A.errorText(error));
      return;
    }
    renderSlots((data || []).map((r) => r.slot_start));
  }

  // ------------------------------------------------------------------ submit

  el.form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const t = A.t;
    A.clearNotice(el.formNotice);

    const name = $("cName").value.trim();
    const phone = $("cPhone").value.trim();
    const note = $("cNote").value.trim();

    if (name.length < 2) { A.notice(el.formNotice, "error", t.errBadName); return; }
    if (phone.replace(/\D/g, "").length < 7) { A.notice(el.formNotice, "error", t.errBadPhone); return; }
    if (!state.slot || !state.serviceId) return;

    el.bookBtn.disabled = true;
    el.bookBtn.textContent = t.booking;

    const { data, error } = await A.db.rpc("create_appointment", {
      p_service_id: state.serviceId,
      p_starts_at: state.slot.toISOString(),
      p_name: name,
      p_phone: phone,
      p_note: note || null
    });

    el.bookBtn.disabled = false;
    el.bookBtn.textContent = t.book;

    if (error) {
      A.notice(el.formNotice, "error", A.errorText(error));
      loadSlots();   // the slot may have gone; show what is actually free now
      return;
    }

    showDone(data, summaryText());
  });

  function showDone(token, summary) {
    const url = location.origin + location.pathname.replace(/index\.html$/, "") +
                "cancel.html?t=" + encodeURIComponent(token);
    el.doneSummary.textContent = summary;
    el.cancelLink.value = url;
    el.flow.classList.add("hidden");
    el.done.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  el.copyBtn.addEventListener("click", async () => {
    const t = A.t;
    try {
      await navigator.clipboard.writeText(el.cancelLink.value);
    } catch (e) {
      el.cancelLink.select();               // clipboard blocked; let them copy by hand
      document.execCommand && document.execCommand("copy");
    }
    el.copyBtn.textContent = t.copied;
    setTimeout(() => { el.copyBtn.textContent = t.copyLink; }, 1600);
  });

  el.againBtn.addEventListener("click", () => {
    state.slot = null;
    el.form.reset();
    el.done.classList.add("hidden");
    el.flow.classList.remove("hidden");
    el.detailsCard.classList.add("hidden");
    loadSlots();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // -------------------------------------------------------------------- boot

  document.addEventListener("langchange", () => {
    renderServices();
    renderDays();
    loadSlots();
  });

  A.mountLangToggle();

  if (!A.requireConfig(el.topNotice)) {
    el.services.innerHTML = "";
    el.slotsEmpty.classList.remove("hidden");
  } else {
    const today = A.isoDate(new Date());
    state.days = Array.from({ length: 7 }, (_, i) => A.addDays(today, i));
    state.date = today;
    renderDays();
    loadClosedDays();
    loadServices();
    loadSlots();
  }
})();
