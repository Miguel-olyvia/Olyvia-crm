/*!
 * Olyvia public form embed (UTM-aware, generic).
 * Loads any Olyvia form into any client site as an iframe and forwards
 * whitelisted UTMs / click ids from the host page URL into the form.
 *
 * Usage:
 *   <div id="olyvia-form"></div>
 *   <script
 *     src="https://olyvia.lovable.app/embed/olyvia-form.js"
 *     data-form-id="FORM_ID"
 *     data-default-source="SOURCE_ID"        (optional)
 *     data-default-campaign="CAMPAIGN_ID"    (optional)
 *     data-lang="pt"                          (optional)
 *     data-container-id="olyvia-form"         (optional, default "olyvia-form")
 *     async></script>
 *
 * Additive / opt-in. Never breaks the host page.
 */
(function () {
  "use strict";

  try {
    var TRACKING_KEYS = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "utm_id",
      "gclid",
      "fbclid",
      "msclkid",
    ];
    // Routing keys (campaign/source) — also accepted from host URL to allow dynamic routing.
    var ROUTING_KEYS = ["campaign_id", "source_id"];
    var STORAGE_KEY = "olyvia_tracking_v1";
    var MAX_VALUE_LEN = 500;

    // Locate the script tag (this script).
    var scripts = document.getElementsByTagName("script");
    var scriptEl = null;
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i];
      if (s.src && s.src.indexOf("olyvia-form.js") !== -1) {
        scriptEl = s;
        break;
      }
    }
    if (!scriptEl) return;

    var formId = scriptEl.getAttribute("data-form-id");
    if (!formId) {
      try { console.warn("[olyvia-form] missing data-form-id"); } catch (e) {}
      return;
    }
    var defaultSource = scriptEl.getAttribute("data-default-source") || "";
    var defaultCampaign = scriptEl.getAttribute("data-default-campaign") || "";
    var lang = scriptEl.getAttribute("data-lang") || "";
    var containerId = scriptEl.getAttribute("data-container-id") || "olyvia-form";
    // Routing via URL host (campaign_id/source_id) é OPT-IN para não alterar o snippet antigo já no ar.
    // Activa-se com data-routing="url" OU se o snippet declarar data-default-campaign/source.
    var routingAttr = (scriptEl.getAttribute("data-routing") || "").toLowerCase();
    var allowUrlRouting = routingAttr === "url" || !!defaultCampaign || !!defaultSource;

    // Olyvia origin = origin of this script.
    var olyviaOrigin;
    try {
      olyviaOrigin = new URL(scriptEl.src).origin;
    } catch (e) {
      olyviaOrigin = "https://olyvia.lovable.app";
    }

    // ---- Tracking extraction (host page) ----
    var trim = function (v) {
      if (v == null) return "";
      try { return String(v).trim().slice(0, MAX_VALUE_LEN); } catch (e) { return ""; }
    };

    var fromCurrentUrl = {};
    try {
      var sp = new URLSearchParams(window.location.search);
      for (var k = 0; k < TRACKING_KEYS.length; k++) {
        var key = TRACKING_KEYS[k];
        var val = sp.get(key);
        if (val) {
          var clean = trim(val);
          if (clean) fromCurrentUrl[key] = clean;
        }
      }
    } catch (e) {}

    var fromStorage = {};
    try {
      if (window.sessionStorage) {
        var raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") fromStorage = parsed;
        }
      }
    } catch (e) {}

    var hasNew = Object.keys(fromCurrentUrl).length > 0;
    var tracking = hasNew
      ? fromCurrentUrl
      : Object.assign({}, fromStorage); // fallback only when current URL is empty

    // landing_page (origin + pathname, no query)
    try {
      tracking.landing_page = trim(window.location.origin + window.location.pathname);
    } catch (e) {}
    // referrer
    try {
      var ref = document.referrer || "";
      if (ref) tracking.referrer = trim(ref);
    } catch (e) {}
    // captured_at
    try { tracking.captured_at = new Date().toISOString(); } catch (e) {}

    // Persist (only when current URL had something — never overwrite real UTMs with empty).
    try {
      if (hasNew && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tracking));
      }
    } catch (e) {}

    // ---- Build iframe URL ----
    var params = new URLSearchParams();
    params.set("form_id", formId);
    if (lang) params.set("lang", lang);

    // Routing fields: só lê da URL host se o snippet permitir (data-routing="url" ou tiver defaults).
    // Isto preserva 100% o comportamento do snippet antigo já em produção.
    var urlCampaign = "", urlSource = "";
    if (allowUrlRouting) {
      try {
        var sp2 = new URLSearchParams(window.location.search);
        urlCampaign = trim(sp2.get("campaign_id") || "");
        urlSource = trim(sp2.get("source_id") || "");
      } catch (e) {}
    }
    var finalCampaign = urlCampaign || defaultCampaign;
    var finalSource = urlSource || defaultSource;
    if (finalCampaign) params.set("campaign_id", finalCampaign);
    if (finalSource) params.set("source_id", finalSource);

    // Append whitelisted tracking params.
    for (var t = 0; t < TRACKING_KEYS.length; t++) {
      var tk = TRACKING_KEYS[t];
      if (tracking[tk]) params.set(tk, tracking[tk]);
    }
    if (tracking.landing_page) params.set("landing_page", tracking.landing_page);
    if (tracking.referrer) params.set("referrer", tracking.referrer);
    // Marca explícita de origem do embed UTM — usada server-side para autorizar
    // o match utm_source -> lead_sources.name. Sem esta flag, comportamento antigo.
    params.set("embed", "utm");

    var iframeSrc = olyviaOrigin + "/lead-form/" + encodeURIComponent(formId) + "?" + params.toString();

    // ---- Mount ----
    var container = document.getElementById(containerId);
    if (!container) {
      // Create a default container right after the script tag.
      container = document.createElement("div");
      container.id = containerId;
      try { scriptEl.parentNode.insertBefore(container, scriptEl.nextSibling); } catch (e) { return; }
    }

    var iframe = document.createElement("iframe");
    iframe.src = iframeSrc;
    iframe.title = "Olyvia form";
    iframe.setAttribute("allow", "geolocation");
    iframe.setAttribute("frameborder", "0");
    iframe.style.cssText = "width:100%;height:700px;border:none;display:block;max-width:100%;";
    container.appendChild(iframe);

    // ---- Resize listener (accept current + legacy event names) ----
    window.addEventListener("message", function (event) {
      try {
        var data = event && event.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "IFRAME_RESIZE" || data.type === "olyvia-form-resize") {
          var h = parseInt(data.height, 10);
          if (h && h > 0) iframe.style.height = h + "px";
        }
      } catch (e) {}
    });
  } catch (err) {
    try { console.warn("[olyvia-form] embed init failed", err); } catch (e) {}
  }
})();
