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
let pendingWindow: Window | null = null;

export function setPendingPdfWindow(win: Window | null): void {
  pendingWindow = win;
}

export function takePendingPdfWindow(): Window | null {
  const win = pendingWindow;
  pendingWindow = null;
  return win;
}
