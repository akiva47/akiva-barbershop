/* The customer's own appointment, reached by the random token in the link.
   Guessing someone else's token means guessing a uuid. */

(function () {
  "use strict";

  const A = window.APP;
  const $ = (id) => document.getElementById(id);

  const el = {
    loading: $("loading"),
    notice: $("notice"),
    details: $("details"),
    summary: $("apptSummary"),
    cancelBtn: $("cancelBtn")
  };

  const token = new URLSearchParams(location.search).get("t");
  let appt = null;

  function render() {
    const t = A.t;
    el.loading.classList.add("hidden");

    if (!appt) {
      A.notice(el.notice, "error", t.notFound);
      el.details.classList.add("hidden");
      return;
    }

    const starts = new Date(appt.starts_at);
    const service = A.lang === "he" ? appt.service_he : appt.service_en;
    el.summary.innerHTML =
      '<span class="tk-pole"></span>' +
      '<div class="tk-svc">' + A.esc(service) + "</div>" +
      '<div style="opacity:.6;font-weight:500;margin-top:4px">' + A.esc(appt.customer_name) + "</div>" +
      '<div class="tk-row"><div><small>' + A.esc(t.date) + "</small><b>" + A.esc(A.dateStr(starts)) + "</b></div>" +
      '<div><small>' + A.esc(t.time) + '</small><b class="tk-time">' + A.timeStr(starts) + "</b></div></div>";
    el.details.classList.remove("hidden");

    if (appt.status === "cancelled") {
      A.notice(el.notice, "quiet", t.alreadyCancelled);
      el.cancelBtn.classList.add("hidden");
    } else if (starts.getTime() <= Date.now()) {
      A.notice(el.notice, "quiet", t.reviewAskLong);
      el.cancelBtn.classList.add("hidden");
      $("reviewLink").classList.remove("hidden");
    } else {
      A.clearNotice(el.notice);
      el.cancelBtn.classList.remove("hidden");
      $("remindBtn").classList.toggle("hidden", !A.content.push_public_key);
    }
  }

  $("remindBtn").addEventListener("click", () => A.remindMe(token, $("remindNotice"), $("remindBtn")));

  async function load() {
    await A.loadContent();
    const { data, error } = await A.db.rpc("appointment_by_token", { p_token: token });
    appt = (!error && data && data.length) ? data[0] : null;
    render();
  }

  el.cancelBtn.addEventListener("click", async () => {
    const t = A.t;
    if (!confirm(t.confirmCancel)) return;

    el.cancelBtn.disabled = true;
    el.cancelBtn.firstElementChild.textContent = t.cancelling;

    const { data, error } = await A.db.rpc("cancel_appointment", { p_token: token });

    el.cancelBtn.disabled = false;
    el.cancelBtn.firstElementChild.textContent = t.cancelBtn;

    if (error) {
      A.notice(el.notice, "error", A.errorText(error));
      return;
    }
    if (data === true) {
      appt.status = "cancelled";
      A.notice(el.notice, "ok", t.cancelled);
      el.cancelBtn.classList.add("hidden");
    } else {
      // Already cancelled, or now in the past — reload rather than guess.
      load();
    }
  });

  document.addEventListener("langchange", render);
  A.mountLangToggle();

  if (!token) {
    el.loading.classList.add("hidden");
    A.notice(el.notice, "error", A.t.notFound);
  } else if (A.requireConfig(el.notice)) {
    load();
  } else {
    el.loading.classList.add("hidden");
  }
})();
