(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const E = window.SeatSignalEngine;

  // ---- mobile nav ----
  const toggle = $(".nav-toggle");
  const links = $("#nav-links");
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  $$("#nav-links a").forEach((a) => a.addEventListener("click", () => { links.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }));

  // ---- interactive audit ----
  const compact = (n) => n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? "$" + Math.round(n / 1e3) + "k" : "$" + Math.round(n);
  const num = (id) => Math.max(0, Number($(id).value) || 0);

  function updateAudit() {
    let low = num("#a-low"), high = num("#a-high");
    if (low > high) { high = low; $("#a-high").value = high; }
    const inputs = {
      employees: num("#a-emp"), apps: num("#a-apps"), spendPerEmployee: num("#a-spe"),
      seatBasedPct: num("#a-seat"), idleLowPct: low, idleHighPct: high, usageDataPct: num("#a-usage"),
    };
    $("#a-seat-o").textContent = inputs.seatBasedPct + "%";
    $("#a-low-o").textContent = low + "%";
    $("#a-high-o").textContent = high + "%";
    $("#a-usage-o").textContent = inputs.usageDataPct + "%";

    const r = E.estimateAudit(inputs);
    $("#o-spend").textContent = compact(r.spend);
    $("#o-seat").textContent = compact(r.seatBased);
    $("#o-range").textContent = `${compact(r.low)} – ${compact(r.high)} / yr`;
    const meter = $("#o-meter");
    meter.style.left = low + "%";
    meter.style.width = Math.max(1, high - low) + "%";
    $("#o-ren").textContent = "≈ " + r.renewals90;
    const evLabel = { strong: "Strong — most apps can be measured", partial: "Partial — some apps will stay “unknown”", limited: "Limited — most utilization will be unknown" };
    $("#o-ev").textContent = evLabel[r.evidenceReady];
    const ready = $$('input[name="ready"]:checked').length;
    $("#o-ready").textContent = `${ready} of 4 in place`;
    $("#o-formula").textContent =
      `${inputs.employees.toLocaleString()} employees × $${inputs.spendPerEmployee.toLocaleString()} = ${compact(r.spend)} spend\n` +
      ` × ${inputs.seatBasedPct}% per-seat = ${compact(r.seatBased)}\n` +
      ` × ${low}–${high}% (your assumption) = ${compact(r.low)}–${compact(r.high)}`;
  }
  $("#audit-form").addEventListener("input", updateAudit);
  updateAudit();

  // ---- tabs (WAI-ARIA pattern) ----
  const tabs = $$('[role="tab"]');
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  // ---- plan buttons preselect plan ----
  $$("[data-plan]").forEach((b) => b.addEventListener("click", () => { $("#d-plan").value = b.dataset.plan; }));

  // ---- demo form (validated locally; never transmitted from the demo site) ----
  const form = $("#demo-form");
  const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|icloud|aol|proton)\./i;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let ok = true;
    $$("[required]", form).forEach((el) => {
      const valid = el.type === "checkbox" ? el.checked : el.value.trim() !== "";
      el.setAttribute("aria-invalid", String(!valid));
      if (!valid) ok = false;
    });
    const email = $("#d-email");
    const err = $("#d-email-err");
    err.hidden = true;
    if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      err.textContent = "Enter a valid email address."; err.hidden = false; email.setAttribute("aria-invalid", "true"); ok = false;
    } else if (FREE_MAIL.test(email.value)) {
      err.textContent = "Please use your work email."; err.hidden = false; email.setAttribute("aria-invalid", "true"); ok = false;
    }
    $("#d-form-err").hidden = ok;
    if (!ok) return;

    // Routing mirrors the HubSpot lead-routing workflow in docs/HUBSPOT.md.
    const team = $("#d-role").value;
    const size = $("#d-size").value;
    const route = size === "5,000+" || size === "1,000–4,999" ? "Enterprise prospect" : team === "finance" ? "Finance department" : team === "procurement" ? "Procurement leader" : team === "it" || team === "security" ? "IT team" : "General prospect";
    $("#d-route").textContent = route;
    $$("input, select, textarea, button[type=submit]", form).forEach((el) => (el.disabled = true));
    $("#demo-success").hidden = false;
  });
})();
