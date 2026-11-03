/* Motion for the customer site. No libraries: one requestAnimationFrame loop
   drives the scroll effects, IntersectionObserver drives the reveals, and
   everything is skipped for people who ask their device for less motion. */

(function () {
  "use strict";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const lerp = (a, b, n) => a + (b - a) * n;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const FX = { reduce: reduce, fine: fine, onFrame: [], onScroll: [] };

  // ------------------------------------------------------------ line splits
  // Headlines are split into lines on "|" and each line slides up out of its
  // own mask. Splitting by line (not by letter) keeps Hebrew and mixed
  // Hebrew/English text in its natural reading order.
  FX.setLines = function (el, text) {
    const parts = String(text || "").split("|").map((s) => s.trim()).filter(Boolean);
    el.innerHTML = "";
    let w = 0;
    parts.forEach((p, i) => {
      const line = document.createElement("span");
      line.className = "line";
      line.style.setProperty("--i", i);
      // Each word rises on its own, a beat after the one before it.
      p.split(/\s+/).forEach((word, k) => {
        if (k) line.appendChild(document.createTextNode(" "));
        const s = document.createElement("span");
        s.className = "w";
        s.style.setProperty("--w", w++);
        s.textContent = word;
        line.appendChild(s);
      });
      el.appendChild(line);
    });
    el.setAttribute("aria-label", parts.join(" "));
  };

  // A paragraph that lights up word by word as it scrolls through the screen.
  FX.scrub = function (el, text) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    el.innerHTML = words.map((w) => "<span>" + w.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]) + "</span>").join(" ");
    el.setAttribute("aria-label", words.join(" "));
    const spans = el.children;
    if (reduce) { Array.prototype.forEach.call(spans, (s) => s.classList.add("lit")); return; }
    el._last = -1;     // a re-render (language switch) must repaint
    if (el._scrub) return;
    el._scrub = true;
    FX.onFrame.push(() => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.35), 0, 1);
      const n = Math.round(p * el.children.length);
      if (n === el._last) return;
      el._last = n;
      for (let i = 0; i < el.children.length; i++) el.children[i].classList.toggle("lit", i < n);
    });
  };

  // ---------------------------------------------------------------- reveals
  const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target._revealChild || e.target;
      el.classList.add("in");
      io.unobserve(e.target);
      if (el.hasAttribute("data-count")) countUp(el);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.01 }) : null;

  FX.observe = function (root) {
    (root || document).querySelectorAll("[data-reveal], [data-lines], [data-count]").forEach((el) => {
      if (el.classList.contains("in")) return;
      if (!FX.heroReady && el.closest(".hero")) return;   // the intro reveals these
      if (reduce || !io) {
        el.classList.add("in");
        if (el.hasAttribute("data-count")) el.textContent = el.getAttribute("data-count");
      } else if (el.getAttribute("data-reveal") === "clip" && el.parentElement) {
        // A box clipped down to nothing reports no intersection; watch its parent.
        el.parentElement._revealChild = el;
        io.observe(el.parentElement);
      } else io.observe(el);
    });
  };

  function countUp(el) {
    const target = Number(el.getAttribute("data-count")) || 0;
    const t0 = performance.now();
    const dur = 1800;
    (function tick(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * e).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  // --------------------------------------------------------------- preloader
  FX.preload = function (ready) {
    const pre = document.getElementById("preloader");
    const count = document.getElementById("plCount");
    const seen = (function () { try { return sessionStorage.getItem("bb.seen"); } catch (e) { return null; } })();
    const finish = () => {
      document.body.classList.remove("is-loading");
      if (!pre) return;
      pre.classList.add("out");
      setTimeout(() => pre.classList.add("gone"), 1200);
      try { sessionStorage.setItem("bb.seen", "1"); } catch (e) {}
    };
    if (!pre || reduce || seen) {
      FX.heroReady = true;
      if (pre) pre.classList.add("gone");
      document.body.classList.remove("is-loading");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const min = 1100;
      let done = false;
      ready.then(() => { done = true; }, () => { done = true; });
      (function tick(now) {
        const elapsed = now - t0;
        // Run to 90% on time alone, then wait for the data before the last 10.
        let p = clamp(elapsed / min, 0, 1) * 0.9;
        if (done && elapsed >= min) p = clamp(0.9 + (elapsed - min) / 350, 0, 1);
        if (elapsed > 6000) p = 1;     // never hold the page hostage
        const n = Math.round(p * 100);
        if (count) count.textContent = n;
        pre.style.setProperty("--p", p);
        if (p < 1) requestAnimationFrame(tick);
        else setTimeout(() => { finish(); resolve(); }, 120);
      })(t0);
    });
  };

  // -------------------------------------------------------------- the loop
  let scrollY = window.scrollY;
  let smoothY = scrollY;
  let lastY = scrollY;
  FX.velocity = 0;

  window.addEventListener("scroll", () => { scrollY = window.scrollY; }, { passive: true });

  function frame() {
    smoothY = lerp(smoothY, scrollY, 0.12);
    const v = scrollY - lastY;
    lastY = scrollY;
    FX.velocity = lerp(FX.velocity, v, 0.1);
    FX.onFrame.forEach((fn) => fn(scrollY, smoothY));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --------------------------------------------------------------- parallax
  FX.parallax = function () {
    if (reduce) return;
    const items = Array.from(document.querySelectorAll("[data-parallax]"));
    FX.onFrame.push(() => {
      const vh = window.innerHeight;
      items.forEach((el) => {
        const r = (el.parentElement || el).getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const speed = Number(el.getAttribute("data-parallax")) || 0;
        const mid = r.top + r.height / 2 - vh / 2;
        el.style.transform = "translate3d(0," + (mid * -speed).toFixed(1) + "px,0)";
      });
    });
  };

  // ---------------------------------------------------------------- marquee
  // Speed and skew follow scroll velocity, so the band reacts to the thumb.
  FX.marquee = function (track, words) {
    const star = '<svg class="marquee-star" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 0l4.5 15.5L40 20l-15.5 4.5L20 40l-4.5-15.5L0 20l15.5-4.5z"/></svg>';
    const group = document.createElement("div");
    group.className = "marquee-group";
    group.innerHTML = words.map((w, i) =>
      '<span class="marquee-item' + (i % 2 ? " o" : "") + '"></span>' + star).join("");
    group.querySelectorAll(".marquee-item").forEach((s, i) => { s.textContent = words[i]; });
    track.innerHTML = "";
    // Enough copies to cover the widest screen twice over.
    for (let i = 0; i < 4; i++) track.appendChild(group.cloneNode(true));
    if (reduce) return;
    let x = 0;
    let gw = 0;
    const measure = () => { gw = track.firstElementChild ? track.firstElementChild.offsetWidth : 0; };
    measure();
    window.addEventListener("resize", measure);
    if (FX._marquee) return;   // the frame hook is installed once
    FX._marquee = true;
    FX.onFrame.push(() => {
      if (!gw) measure();
      const boost = clamp(Math.abs(FX.velocity) * 0.35, 0, 14);
      const dir = FX.velocity < -0.5 ? -1 : 1;
      x -= (1.1 + boost) * dir;
      if (gw) { if (x <= -gw) x += gw; if (x > 0) x -= gw; }
      track.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0) skewX(" + clamp(-FX.velocity * 0.4, -12, 12).toFixed(2) + "deg)";
    });
  };

  // --------------------------------------------------------------- magnetic
  FX.magnetic = function (root) {
    if (!fine || reduce) return;
    (root || document).querySelectorAll("[data-magnetic]").forEach((el) => {
      if (el._mag) return;
      el._mag = true;
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.transform = "translate(" + dx * 0.25 + "px," + dy * 0.35 + "px)";
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  };

  // ----------------------------------------------------------------- cursor
  FX.cursor = function () {
    if (!fine || reduce) return;
    const root = document.querySelector(".cursor");
    if (!root) return;
    const dot = root.querySelector(".cursor-dot");
    const ring = root.querySelector(".cursor-ring");
    const label = document.getElementById("cursorLabel");
    let mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener("pointermove", (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
    }, { passive: true });
    window.addEventListener("pointerdown", () => root.classList.add("down"));
    window.addEventListener("pointerup", () => root.classList.remove("down"));
    document.addEventListener("pointerover", (e) => {
      const lab = e.target.closest("[data-cursor]");
      if (lab) {
        label.textContent = lab.getAttribute("data-cursor");
        root.classList.add("label");
        root.classList.remove("hover");
        return;
      }
      root.classList.remove("label");
      root.classList.toggle("hover", !!e.target.closest("a, button, [role=button], input, label"));
    });
    FX.onFrame.push(() => {
      rx = lerp(rx, mx, 0.18); ry = lerp(ry, my, 0.18);
      ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
    });
  };

  // ---------------------------------------- an image that follows the pointer
  FX.hoverImage = function (container, selector, pickUrl) {
    if (!fine || reduce) return;
    const box = document.getElementById("hoverImg");
    if (!box) return;
    const img = box.querySelector("img");
    let tx = 0, ty = 0, x = 0, y = 0, on = false;
    container.addEventListener("pointermove", (e) => {
      tx = e.clientX; ty = e.clientY;
      const item = e.target.closest(selector);
      const url = item ? pickUrl(item) : null;
      if (url) {
        if (img.getAttribute("src") !== url) img.src = url;
        if (!on) { x = tx; y = ty; }
        on = true;
        box.classList.add("show");
      } else { on = false; box.classList.remove("show"); }
    });
    container.addEventListener("pointerleave", () => { on = false; box.classList.remove("show"); });
    FX.onFrame.push(() => {
      if (!on) return;
      const nx = lerp(x, tx, 0.14), ny = lerp(y, ty, 0.14);
      const rot = clamp((nx - x) * 0.6, -14, 14);
      x = nx; y = ny;
      box.style.transform = "translate3d(" + x + "px," + y + "px,0) rotate(" + rot.toFixed(2) + "deg)";
    });
  };

  // ---------------------------------------- horizontal scroll, driven by vertical
  // The gallery section is made as tall as its track is wide; while it is
  // pinned, scrolling down slides the photos sideways.
  FX.pinTrack = function (section, pin, track, onIndex) {
    let enabled = false;
    let dist = 0;
    const rtl = () => document.documentElement.dir === "rtl";

    function layout() {
      track.style.transform = "";
      const overflow = track.scrollWidth - window.innerWidth;
      enabled = !reduce && overflow > 40 && window.innerWidth >= 360;
      section.classList.toggle("static", !enabled);
      dist = Math.max(0, overflow);
      pin.style.height = enabled ? (window.innerHeight + dist) + "px" : "";
    }
    layout();
    window.addEventListener("resize", layout);
    FX.onFrame.push((y, sy) => {
      if (!enabled) return;
      const top = pin.getBoundingClientRect().top + window.scrollY;
      const p = clamp((sy - top) / (dist || 1), 0, 1);
      const x = p * dist * (rtl() ? 1 : -1);
      track.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
      // Inner parallax: each photo drifts against the track.
      const items = track.children;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        const c = (r.left + r.width / 2 - window.innerWidth / 2) / window.innerWidth;
        items[i].style.setProperty("--px", (c * -8).toFixed(2) + "%");
      }
      if (onIndex) onIndex(Math.round(p * (items.length - 1)), p);
    });
    return { layout: layout };
  };

  // ----------------------------------------------------------------- confetti
  FX.confetti = function (canvas) {
    if (reduce || !canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.width = window.innerWidth * dpr;
    const h = canvas.height = window.innerHeight * dpr;
    const colors = ["#E0352B", "#F8F5EF", "#2C5BFF", "#E3B04B", "#3FD09B"];
    const bits = Array.from({ length: 150 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.2,
      y: h * 0.38,
      vx: (Math.random() - 0.5) * 26 * dpr,
      vy: (-Math.random() * 22 - 8) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      s: (Math.random() * 7 + 5) * dpr,
      c: colors[(Math.random() * colors.length) | 0]
    }));
    const t0 = performance.now();
    (function tick(now) {
      ctx.clearRect(0, 0, w, h);
      bits.forEach((b) => {
        b.vy += 0.7 * dpr; b.vx *= 0.985; b.vy *= 0.985;
        b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
        ctx.restore();
      });
      if (now - t0 < 3200) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    })(t0);
  };

  // ----------------------------------------------------------- flying pole
  // One barber pole, fixed on screen, that glides between positions set on
  // each section (data-pole="x,y,rotation,scale" as fractions of the screen),
  // and spins its stripes faster while the page is scrolling.
  FX.poleFly = function () {
    const pole = document.getElementById("poleFly");
    if (!pole) return;
    const stripes = pole.querySelector(".pole3d-stripes");
    let anchors = [];
    function measure() {
      anchors = Array.from(document.querySelectorAll("[data-pole]"))
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const v = el.getAttribute("data-pole").split(",").map(Number);
          return { top: el.getBoundingClientRect().top + window.scrollY, x: v[0], y: v[1], r: v[2], s: v[3] };
        })
        .sort((a, b) => a.top - b.top);
    }
    measure();
    window.addEventListener("resize", measure);
    document.addEventListener("site:layout", measure);
    setTimeout(measure, 1500);
    if (reduce) { pole.classList.add("still"); }
    const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    let spin = 0;
    FX.onFrame.push((y, sy) => {
      if (!anchors.length) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const probe = sy + vh * 0.5;
      let i = 0;
      while (i < anchors.length - 1 && anchors[i + 1].top <= probe) i++;
      const a = anchors[i], b = anchors[Math.min(i + 1, anchors.length - 1)];
      const span = Math.max(1, b.top - a.top);
      const t = a === b ? 0 : ease(clamp((probe - a.top) / span, 0, 1));
      // Positions are written for a left-to-right page; Hebrew mirrors them.
      const fx = lerp(a.x, b.x, t);
      const mobile = vw < 900;
      const k = mobile ? 0.5 : 1;
      const rtlDir = document.documentElement.dir === "rtl";
      // On a phone the text fills the width, so the pole keeps to the free edge.
      const x = (mobile ? (rtlDir ? 0.06 : 0.94) : (rtlDir ? 1 - fx : fx)) * vw;
      const yy = lerp(a.y, b.y, t) * vh;
      const r = (document.documentElement.dir === "rtl" ? -1 : 1) * lerp(a.r, b.r, t) + FX.velocity * 0.15;
      const sc = lerp(a.s, b.s, t) * k;
      pole.style.transform = "translate3d(" + x.toFixed(1) + "px," + yy.toFixed(1) + "px,0) translate(-50%,-50%) rotate(" + r.toFixed(2) + "deg) scale(" + sc.toFixed(3) + ")";
      if (!reduce) {
        spin += 0.6 + Math.abs(FX.velocity) * 0.9;
        stripes.style.backgroundPositionY = (spin % 101.82).toFixed(1) + "px";
      }
    });
  };

  // ------------------------------------------------- page colour per section
  FX.bgMorph = function () {
    const secs = Array.from(document.querySelectorAll("[data-bg]"));
    let cur = "";
    FX.onFrame.push(() => {
      const mid = window.innerHeight * 0.5;
      let c = null;
      for (const s of secs) {
        const r = s.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid && s.offsetParent !== null) { c = s.getAttribute("data-bg"); break; }
      }
      if (c && c !== cur) { cur = c; document.body.style.backgroundColor = c; }
    });
  };

  // ---------------------------------------------------------- stacked cards
  // Sticky cards pile up; each one shrinks back a little as the next covers it.
  FX.stack = function (container) {
    if (reduce || !container) return;
    const cards = Array.from(container.children);
    FX.onFrame.push(() => {
      const vh = window.innerHeight;
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const r = next.getBoundingClientRect();
        const p = clamp(1 - (r.top - vh * 0.18) / (vh * 0.6), 0, 1);
        c.style.transform = "scale(" + (1 - p * 0.07).toFixed(4) + ")";
        c.style.filter = "brightness(" + (1 - p * 0.35).toFixed(3) + ")";
      });
    });
  };

  // ------------------------------------------------------------- spotlight
  // A soft light under the mouse on cards, from --x/--y.
  FX.spotlight = function () {
    if (!fine) return;
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest && e.target.closest("[data-spot], .svc");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--x", (e.clientX - r.left) + "px");
      el.style.setProperty("--y", (e.clientY - r.top) + "px");
    }, { passive: true });
  };

  window.FX = FX;
})();
