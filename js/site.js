/* The showcase page: hero, services, gallery, testimonials, hours, contact.
   Everything shown here is public data — nothing reads the appointments
   table. Booking itself lives in booking.js. */

(function () {
  "use strict";

  const A = window.APP;
  const FX = window.FX;
  const $ = (id) => document.getElementById(id);

  // Shared with booking.js, which waits on `ready` instead of fetching again.
  const S = window.SITE = {
    services: [], gallery: [], reviews: [], hours: [], overrides: [],
    settings: { max_days_ahead: 30 }, nextFree: null
  };

  // A query that fails (a table not migrated yet, a dropped connection) must
  // not take the page down with it — it just yields nothing.
  async function safe(q) {
    try {
      const { data, error } = await q;
      return error ? null : data;
    } catch (e) { return null; }
  }

  async function loadAll() {
    if (!A.configured) return;
    const today = A.isoDate(new Date());
    const until = A.addDays(today, 31);
    const [, svc, gal, rev, hrs, set, ovs] = await Promise.all([
      A.loadContent(),
      safe(A.db.from("services").select("*").eq("active", true).order("sort_order")),
      safe(A.db.from("gallery").select("id,url,width,height,caption_he,caption_en")
        .eq("active", true).order("sort_order").order("id")),
      safe(A.db.from("testimonials").select("id,author,body,rating")
        .eq("active", true).order("sort_order").order("id")),
      safe(A.db.from("work_hours").select("*").order("weekday")),
      safe(A.db.from("shop_settings").select("*").eq("id", 1).maybeSingle()),
      safe(A.db.from("day_overrides").select("*").gte("on_date", today).lte("on_date", until))
    ]);
    S.services = svc || [];
    S.gallery = gal || [];
    S.reviews = rev || [];
    S.hours = hrs || [];
    S.overrides = ovs || [];
    if (set) S.settings = set;
  }

  const ready = S.ready = loadAll();

  // ------------------------------------------------------------------- hero

  function renderHero() {
    FX.setLines($("heroTitle"), A.c("hero_title", "heroTitle"));
    $("heroSub").textContent = A.c("hero_sub", "heroSub");
    const url = A.content.hero_image_url;
    const img = $("heroImg");
    if (url) {
      if (img.getAttribute("src") !== url) img.src = url;
      img.classList.remove("hidden");
      $("hero").classList.add("has-img");
    } else {
      img.classList.add("hidden");
      $("hero").classList.remove("has-img");
    }
  }

  function renderManifesto() {
    FX.scrub($("manifesto"), A.t.manifesto);
  }

  function renderFaq() {
    const list = $("faqList");
    list.innerHTML = (A.t.faq || []).map((qa, i) =>
      '<div class="faq-item" data-reveal data-spot style="--d:' + (i * 0.06) + 's">' +
      '<button type="button" class="faq-q" aria-expanded="false"><span>' + A.esc(qa[0]) + '</span><i aria-hidden="true"></i></button>' +
      '<div class="faq-a"><div><p>' + A.esc(qa[1]) + "</p></div></div></div>").join("");
    FX.observe(list);
  }
  $("faqList").addEventListener("click", (e) => {
    const q = e.target.closest(".faq-q");
    if (!q) return;
    const open = q.getAttribute("aria-expanded") !== "true";
    q.setAttribute("aria-expanded", String(open));
    q.parentElement.classList.toggle("open", open);
    setTimeout(() => document.dispatchEvent(new CustomEvent("site:layout")), 500);
  });

  function renderMarquee() {
    const words = A.c("marquee", "marquee").split(",").map((s) => s.trim()).filter(Boolean);
    FX.marquee($("marqueeTrack"), words.length ? words : ["AKIVA"]);
  }

  // The earliest free slot across the coming week, for the hero chip. It runs
  // after the page is up, so it never delays the first paint.
  async function findNextFree() {
    const chip = $("nextFree");
    const svc = S.services[0];
    if (!svc || !A.configured) { chip.classList.add("hidden"); return; }
    const today = A.isoDate(new Date());
    for (let i = 0; i < 8; i++) {
      const day = A.addDays(today, i);
      const data = await safe(A.db.rpc("available_slots", { p_date: day, p_service_id: svc.id }));
      if (data && data.length) {
        S.nextFree = { serviceId: svc.id, date: day, slot: data[0].slot_start, offset: i };
        renderNextFree();
        return;
      }
    }
    S.nextFree = null;
    renderNextFree();
  }

  function renderNextFree() {
    const t = A.t;
    const chip = $("nextFree");
    const label = chip.querySelector(".nf-label");
    const out = $("nextFreeTime");
    const nf = S.nextFree;
    if (!nf) {
      label.textContent = t.nextFreeNone;
      out.textContent = "";
    } else {
      const when = new Date(nf.slot);
      const time = A.timeStr(when);
      label.textContent = t.nextFree + ":";
      out.textContent = nf.offset === 0 ? t.todayAt + time
        : nf.offset === 1 ? t.tomorrowAt + time
        : t.weekdays[A.weekdayOf(nf.date)] + " " + time;
    }
    chip.classList.add("in");
  }

  // --------------------------------------------------------------- services

  const clock = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const arrow = '<svg viewBox="0 0 24 24" class="arr" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function renderServices() {
    const t = A.t;
    const list = $("svcList");
    if (!A.configured) { list.innerHTML = '<div class="empty">' + A.esc(t.errNotConfigured) + "</div>"; return; }
    if (!S.services.length) { list.innerHTML = '<div class="empty">—</div>'; return; }
    list.innerHTML = S.services.map((s, i) => {
      const desc = A.serviceDesc(s);
      return '<button type="button" class="svc" data-reveal style="--d:' + (i * 0.07) + 's" data-book data-service="' + s.id + '" data-idx="' + i + '">' +
        '<span class="svc-num">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="svc-main"><span class="svc-name">' + A.esc(A.serviceName(s)) + "</span>" +
        (desc ? '<span class="svc-desc">' + A.esc(desc) + "</span>" : "") + "</span>" +
        '<span class="svc-dots" aria-hidden="true"></span>' +
        '<span class="svc-meta"><span class="svc-price">' + A.esc(A.priceText(s)) + "</span>" +
        '<span class="svc-dur">' + clock + s.duration_min + " " + A.esc(t.minutes) + "</span></span>" +
        '<span class="svc-go">' + A.esc(t.bookThis) + arrow + "</span>" +
        "</button>";
    }).join("");
    FX.observe(list);
  }

  // ---------------------------------------------------------------- gallery

  let pin = null;
  function renderGallery() {
    const t = A.t;
    const has = S.gallery.length > 0;
    $("work").classList.toggle("hidden", !has);
    document.querySelectorAll(".needs-gallery").forEach((el) => el.classList.toggle("hidden", !has));
    if (!has) return;
    const track = $("workTrack");
    track.innerHTML = S.gallery.map((g, i) => {
      const cap = (A.lang === "he" ? g.caption_he : g.caption_en) || "";
      return '<figure class="wk" data-lb="' + i + '">' +
        '<img src="' + A.esc(g.url) + '" alt="' + A.esc(cap) + '" loading="' + (i < 3 ? "eager" : "lazy") + '" decoding="async">' +
        '<figcaption><span>' + A.esc(cap) + "</span><i>" + String(i + 1).padStart(2, "0") + "</i></figcaption></figure>";
    }).join("");
    $("workTotal").textContent = String(S.gallery.length).padStart(2, "0");
    if (!pin) {
      pin = FX.pinTrack($("work"), $("workPin"), track, (i, p) => {
        $("workIdx").textContent = String(i + 1).padStart(2, "0");
        $("workBar").style.transform = "scaleX(" + p.toFixed(4) + ")";
      });
    } else pin.layout();
  }

  // --------------------------------------------------------------- lightbox

  const lb = { i: 0, el: $("lightbox"), img: $("lbImg") };
  function lbShow(i, dir) {
    const n = S.gallery.length;
    if (!n) return;
    lb.i = (i + n) % n;
    const g = S.gallery[lb.i];
    const rtl = document.documentElement.dir === "rtl";
    lb.img.style.setProperty("--dirx", (dir || 1) * (rtl ? -1 : 1));
    lb.img.classList.add("swap");
    setTimeout(() => {
      lb.img.src = g.url;
      lb.img.alt = (A.lang === "he" ? g.caption_he : g.caption_en) || "";
      $("lbCap").textContent = lb.img.alt;
      $("lbCount").textContent = (lb.i + 1) + " / " + n;
      lb.img.onload = () => lb.img.classList.remove("swap");
      if (lb.img.complete) lb.img.classList.remove("swap");
    }, dir ? 180 : 0);
  }
  function lbOpen(i) {
    lbShow(i, 0);
    lb.el.classList.add("open");
    lb.el.setAttribute("aria-hidden", "false");
    document.body.classList.add("lock");
  }
  function lbClose() {
    lb.el.classList.remove("open");
    lb.el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lock");
  }
  $("workTrack").addEventListener("click", (e) => {
    const f = e.target.closest("[data-lb]");
    if (f) lbOpen(Number(f.getAttribute("data-lb")));
  });
  $("lbClose").addEventListener("click", lbClose);
  $("lbPrev").addEventListener("click", () => lbShow(lb.i - 1, -1));
  $("lbNext").addEventListener("click", () => lbShow(lb.i + 1, 1));
  lb.el.addEventListener("click", (e) => { if (e.target === lb.el) lbClose(); });
  document.addEventListener("keydown", (e) => {
    if (!lb.el.classList.contains("open")) return;
    const rtl = document.documentElement.dir === "rtl";
    if (e.key === "Escape") lbClose();
    if (e.key === "ArrowRight") lbShow(lb.i + (rtl ? -1 : 1), rtl ? -1 : 1);
    if (e.key === "ArrowLeft") lbShow(lb.i + (rtl ? 1 : -1), rtl ? 1 : -1);
  });
  (function swipe() {
    let x0 = null;
    lb.el.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
    lb.el.addEventListener("pointerup", (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 50) return;
      const rtl = document.documentElement.dir === "rtl";
      const fwd = rtl ? dx > 0 : dx < 0;
      lbShow(lb.i + (fwd ? 1 : -1), fwd ? 1 : -1);
    });
  })();

  // ------------------------------------------------------------------ stats

  function renderStats() {
    const c = A.content;
    const vals = { statYears: c.stat_years, statClients: c.stat_clients, statCuts: c.stat_cuts };
    let any = false;
    Object.keys(vals).forEach((id) => {
      const v = vals[id];
      const el = $(id);
      const box = el.parentElement;
      if (v === null || v === undefined) { box.classList.add("hidden"); return; }
      any = true;
      box.classList.remove("hidden");
      el.setAttribute("data-count", v);
      if (el.classList.contains("in")) el.textContent = Number(v).toLocaleString("en-US");
    });
    $("stats").classList.toggle("hidden", !any);
    const shown = Object.keys(vals).filter((k) => vals[k] !== null && vals[k] !== undefined).length;
    $("stats").style.gridTemplateColumns = window.innerWidth >= 760 && shown ? "repeat(" + shown + ",1fr)" : "";
  }

  // ---------------------------------------------------------------- reviews

  let rvTimer = null, rvIdx = 0;
  function renderReviews() {
    const has = S.reviews.length > 0;
    $("reviews").classList.toggle("hidden", !has);
    if (!has) return;
    $("rvStage").innerHTML = S.reviews.map((r, i) =>
      '<figure class="rv' + (i === rvIdx ? " on" : "") + '">' +
      '<div class="rv-stars" aria-label="' + r.rating + '/5">' + "★".repeat(r.rating) + "</div>" +
      "<blockquote>" + A.esc(r.body) + "</blockquote><cite>" + A.esc(r.author) + "</cite></figure>").join("");
    $("rvDots").innerHTML = S.reviews.length > 1 ? S.reviews.map((_, i) =>
      '<button type="button" aria-label="' + (i + 1) + '"' + (i === rvIdx ? ' class="on"' : "") + "></button>").join("") : "";
    $("rvDots").querySelectorAll("button").forEach((b, i) => b.addEventListener("click", () => rvGo(i)));
    rvSchedule();
  }
  function rvGo(i) {
    const items = $("rvStage").children;
    const dots = $("rvDots").children;
    if (!items.length) return;
    rvIdx = (i + items.length) % items.length;
    Array.prototype.forEach.call(items, (el, k) => el.classList.toggle("on", k === rvIdx));
    Array.prototype.forEach.call(dots, (el, k) => {
      el.classList.remove("on");
      if (k === rvIdx) { void el.offsetWidth; el.classList.add("on"); }
    });
    rvSchedule();
  }
  function rvSchedule() {
    clearTimeout(rvTimer);
    if (S.reviews.length > 1) rvTimer = setTimeout(() => rvGo(rvIdx + 1), 6000);
  }

  // ------------------------------------------------------------------ about

  function renderAbout() {
    FX.setLines($("aboutTitle"), A.c("about_title", "aboutTitle"));
    $("aboutText").textContent = A.c("about", "aboutBody");
    const url = A.content.about_image_url;
    const img = $("aboutImg");
    if (url) {
      if (img.getAttribute("src") !== url) img.src = url;
      img.classList.remove("hidden");
      $("aboutArt").classList.add("hidden");
    } else {
      img.classList.add("hidden");
      $("aboutArt").classList.remove("hidden");
    }
  }

  function nowInShop() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: A.tz
    }).format(new Date());
    return parts;   // "14:05"
  }

  function renderHours() {
    const t = A.t;
    const list = $("hoursList");
    const badge = $("openBadge");
    const today = A.isoDate(new Date());
    const wdToday = A.weekdayOf(today);
    if (!S.hours.length) { list.parentElement.classList.add("hidden"); return; }
    list.parentElement.classList.remove("hidden");

    // Start the week on today, so the first line is always the useful one.
    const order = Array.from({ length: 7 }, (_, i) => (wdToday + i) % 7);
    list.innerHTML = order.map((wd) => {
      const h = S.hours.find((x) => x.weekday === wd);
      const iso = A.addDays(today, (wd - wdToday + 7) % 7);
      const ov = S.overrides.find((o) => o.on_date === iso);
      let txt;
      if (ov) txt = ov.is_closed ? '<span class="off">' + A.esc(t.closed) + "</span>"
        : "<time>" + A.hhmm(ov.opens) + "–" + A.hhmm(ov.closes) + "</time>";
      else txt = (!h || !h.is_open) ? '<span class="off">' + A.esc(t.closed) + "</span>"
        : "<time>" + A.hhmm(h.opens) + "–" + A.hhmm(h.closes) + "</time>";
      return '<li class="' + (wd === wdToday ? "today" : "") + '"><span>' + A.esc(t.weekdays[wd]) + "</span>" + txt + "</li>";
    }).join("");

    const now = nowInShop();
    const ov = S.overrides.find((o) => o.on_date === today);
    const h = S.hours.find((x) => x.weekday === wdToday);
    let open = false;
    if (ov) open = !ov.is_closed && now >= A.hhmm(ov.opens) && now < A.hhmm(ov.closes);
    else if (h && h.is_open) open = now >= A.hhmm(h.opens) && now < A.hhmm(h.closes);
    badge.className = "open-badge" + (open ? "" : " closed");
    badge.innerHTML = '<span class="pulse"></span>' + A.esc(open ? t.openNow : t.closedNow);
  }

  // ---------------------------------------------------------------- contact

  const ICONS = {
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" class="wa-ico"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>',
    waze: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 3 2.5 4.5 5 4.6"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15z"/></svg>'
  };

  function socialUrl(kind, v) {
    v = String(v || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    const h = v.replace(/^@/, "");
    if (kind === "instagram") return "https://instagram.com/" + encodeURIComponent(h);
    if (kind === "tiktok") return "https://www.tiktok.com/@" + encodeURIComponent(h);
    if (kind === "facebook") return "https://facebook.com/" + encodeURIComponent(h);
    return "";
  }

  function renderContact() {
    const t = A.t;
    const c = A.content;
    const links = [];
    if (c.phone) links.push({ k: "phone", href: "tel:" + c.phone.replace(/[^\d+]/g, ""), label: t.callUs });
    const wa = A.waUrl(t.waHello);
    if (wa) links.unshift({ k: "whatsapp", href: wa, label: t.whatsapp, cls: "wa" });
    if (c.waze_url || c.maps_url) links.push({ k: "waze", href: c.waze_url || c.maps_url, label: t.waze });
    ["instagram", "tiktok", "facebook"].forEach((k) => {
      const u = socialUrl(k, c[k]);
      if (u) links.push({ k: k, href: u, label: t[k] });
    });
    const ext = (l) => l.k === "phone" ? "" : ' target="_blank" rel="noopener noreferrer"';
    $("contactRow").innerHTML = links.map((l) =>
      '<a href="' + A.esc(l.href) + '"' + ext(l) + (l.cls ? ' class="' + l.cls + '"' : "") + ">" + ICONS[l.k] + "<span>" + A.esc(l.label) + "</span></a>").join("");
    $("contactRow").classList.toggle("hidden", !links.length);
    $("menuSocial").innerHTML = links.map((l) =>
      '<a href="' + A.esc(l.href) + '"' + ext(l) + ' aria-label="' + A.esc(l.label) + '">' + ICONS[l.k] + "</a>").join("");
    const addr = A.lang === "he" ? c.address_he : c.address_en;
    $("address").textContent = addr || c.address_he || "";

    ["dockWa", "waFab"].forEach((id) => {
      const el = $(id);
      if (wa) { el.href = wa; el.classList.remove("hidden"); }
      else el.classList.add("hidden");
    });

    const bit = A.bitUrl();
    const dockBit = $("dockBit");
    if (bit) { dockBit.href = bit; dockBit.classList.remove("hidden"); }
    else dockBit.classList.add("hidden");
  }

  // ----------------------------------------------------------- static lines

  function renderStaticLines() {
    document.querySelectorAll("[data-t-lines]").forEach((el) => {
      FX.setLines(el, A.t[el.getAttribute("data-t-lines")]);
    });
  }

  function renderAll() {
    renderStaticLines();
    renderHero();
    renderManifesto();
    renderFaq();
    renderMarquee();
    renderServices();
    renderGallery();
    renderStats();
    renderReviews();
    renderAbout();
    renderHours();
    renderContact();
    if (S.nextFree !== undefined && $("nextFree").classList.contains("in")) renderNextFree();
  }

  // --------------------------------------------------------- nav and chrome

  const nav = $("nav");
  const dock = $("dock");
  const bar = $("progressBar");
  const menu = $("menu");
  const burger = $("burger");
  let lastY = 0;
  FX.onFrame.push((y) => {
    if (y === lastY) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty("--p", max > 0 ? (y / max).toFixed(4) : 0);
    nav.classList.toggle("solid", y > 40);
    if (!menu.classList.contains("open")) nav.classList.toggle("hide", y > 500 && y > lastY + 2 ? true : (y < lastY - 2 ? false : nav.classList.contains("hide")));
    dock.classList.toggle("show", y > window.innerHeight * 0.55);
    lastY = y;
  });

  function setMenu(open) {
    const r = burger.getBoundingClientRect();
    menu.style.setProperty("--mx", (r.left + r.width / 2) + "px");
    menu.style.setProperty("--my", (r.top + r.height / 2) + "px");
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", String(!open));
    burger.setAttribute("aria-expanded", String(open));
    burger.style.color = open ? "var(--gold-ink)" : "";
    burger.querySelectorAll("span").forEach((s) => { s.style.background = open ? "var(--gold-ink)" : ""; });
    burger.style.borderColor = open ? "rgba(26,18,6,.3)" : "";
    document.body.classList.toggle("lock", open);
    nav.classList.remove("hide");
  }
  burger.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("open")) setMenu(false); });
  S.closeMenu = () => { if (menu.classList.contains("open")) setMenu(false); };

  $("year").textContent = new Date().getFullYear();

  // -------------------------------------------------------------------- boot

  A.mountLangToggle();
  renderStaticLines();
  renderHero();
  renderManifesto();
  renderFaq();
  renderMarquee();
  FX.parallax();
  FX.poleFly();
  FX.bgMorph();
  FX.stack($("steps"));
  FX.spotlight();
  FX.magnetic();
  FX.hoverImage($("svcList"), ".svc", (item) => {
    if (!S.gallery.length) return null;
    return S.gallery[Number(item.getAttribute("data-idx")) % S.gallery.length].url;
  });

  document.addEventListener("booking:made", () => setTimeout(findNextFree, 800));

  document.addEventListener("langchange", () => {
    renderAll();
    FX.observe();
  });

  FX.preload(ready).then(() => {
    // The hero animates in as the curtain lifts; everything else on scroll.
    FX.heroReady = true;
    ["heroTitle", "heroSub"].forEach((id) => $(id).classList.add("in"));
    document.querySelectorAll(".hero [data-reveal]").forEach((el) => el.classList.add("in"));
    FX.observe();
  });

  ready.then(() => {
    renderAll();
    FX.observe();
    FX.magnetic();
    document.dispatchEvent(new CustomEvent("site:ready"));
    setTimeout(() => document.dispatchEvent(new CustomEvent("site:layout")), 300);
    setTimeout(findNextFree, 400);
  });
})();
