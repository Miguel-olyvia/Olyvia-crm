// Cross-navigation handoff for the "Ver contrato" PDF view flow.
//
// Browsers only allow `window.open(...)` to open a new tab without being
// treated as a popup while it runs synchronously inside a real user gesture
// (the click handler itself). Contract PDF generation in ClientContracts.tsx
// involves several `await`s (resolving the document, waiting for an iframe
// to load, fonts, images, html2canvas/jsPDF rendering) before a blob URL
// exists — by then the click's "user activation" window has expired, so
// `window.open(blobUrl, "_blank")` there gets blocked as a popup.
//
// The fix: open the blank tab synchronously in the original onClick (in
// Proposals.tsx), stash the window reference here, then navigate to
// /client-contracts?open=...&viewPdf=1. Once the PDF blob is ready, that
// page reclaims the already-open window via `takePendingPdfWindow()` and
// just sets its `location` — navigating an existing window is never treated
// as a popup, regardless of how long generation took.
//
// Backed by a property on the real `window` global (not module-scoped
// state): Proposals.tsx and ClientContracts.tsx are separate lazy-loaded
// route chunks, and depending on how the bundler splits shared modules a
// plain `let` here could end up duplicated into each chunk instead of
// shared — silently breaking the handoff. `window` is the one thing every
// chunk unquestionably shares.
const KEY = "__olyviaPendingPdfWindow__";

export function setPendingPdfWindow(win: Window | null): void {
  (window as any)[KEY] = win;
}

export function takePendingPdfWindow(): Window | null {
  const win = (window as any)[KEY] || null;
  (window as any)[KEY] = null;
  return win;
}
