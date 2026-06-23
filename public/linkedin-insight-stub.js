// LinkedIn Insight Tag stub — loaded by PublicLeadForm.tsx via script.src (CSP-safe).
// This file initialises the lintrk queue object.
// After this script loads, the caller sets window._linkedin_partner_id and
// window._linkedin_data_partner_ids with the runtime partner ID, then loads
// https://snap.licdn.com/li.lms-analytics/insight.min.js separately.
(function (l) {
  if (!l) {
    window.lintrk = function (a, b) {
      window.lintrk.q.push([a, b]);
    };
    window.lintrk.q = [];
  }
})(window.lintrk);
