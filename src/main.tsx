import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;

import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import { LanguageProvider } from "./contexts/LanguageContext";
import { initAnalytics } from "./lib/analytics/posthog";
import {
  beforeBreadcrumb,
  beforeSend,
  isModuleLoadError,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
} from "./lib/sentry/scrub";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Error tracking only for now (default integrations already cover global
    // error/rejection handlers). tracesSampleRate stays 0 until performance
    // tracing is turned on later; add browserTracingIntegration()/replayIntegration()
    // to `integrations` at that point.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    denyUrls: SENTRY_DENY_URLS,
    // Network breadcrumbs carry the full request URL, and Supabase puts
    // PostgREST row filters (?email=eq.…) in the query string — see
    // ./lib/sentry/scrub.ts.
    beforeBreadcrumb,
    beforeSend,
  });
}

initAnalytics();

const root = createRoot(document.getElementById("root")!);

// Set once the initial App render succeeds. Guards the unhandledrejection
// handler below: a stale chunk error hitting a user mid-session (e.g. right
// after a deploy replaced the JS assets) must never blow away a mounted app
// and whatever unsaved work is in it — only a failure during the very first
// load is treated as fatal enough to warrant the full recovery screen.
let appMounted = false;
let updateBannerShown = false;

// Non-destructive notice for a stale-chunk error once the app is already
// mounted and the user may be mid-task. Never touches the React tree.
const showUpdateBanner = () => {
  if (updateBannerShown || typeof document === "undefined") return;
  updateBannerShown = true;

  const banner = document.createElement("div");
  banner.setAttribute("role", "status");
  banner.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:340px;padding:14px 16px;" +
    "border-radius:10px;background:#1f2937;color:#fff;font:14px/1.4 system-ui,sans-serif;" +
    "box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:10px;";

  const text = document.createElement("div");
  text.textContent = "Há uma nova versão desta aplicação. Recarrega quando terminares o que estás a fazer para não perderes dados.";
  banner.appendChild(text);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;";

  const dismiss = document.createElement("button");
  dismiss.textContent = "Depois";
  dismiss.style.cssText = "background:transparent;color:#fff;border:none;font-size:13px;cursor:pointer;opacity:.8;";
  dismiss.onclick = () => banner.remove();

  const reload = document.createElement("button");
  reload.textContent = "Recarregar agora";
  reload.style.cssText = "background:#fff;color:#1f2937;border:none;border-radius:6px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer;";
  reload.onclick = () => window.location.reload();

  actions.appendChild(dismiss);
  actions.appendChild(reload);
  banner.appendChild(actions);
  document.body.appendChild(banner);
};

// ── Proactive new-version detection ─────────────────────────────────────
// Everything above only reacts AFTER a stale-chunk request has already
// failed — i.e. after the user already hit an error mid-task. This polls
// for a new deployment before that ever happens, so the same non-destructive
// banner can show up calmly ahead of time, well before the user's next
// navigation would try (and fail) to fetch a chunk the new deploy removed.
// baselineScriptSrc is captured from the actual live DOM at module-load time
// (not a re-fetch), so it always reflects exactly what this tab is running.
const baselineScriptSrc = document.querySelector('script[type="module"]')?.getAttribute("src") ?? null;

const extractIndexScriptSrc = (html: string): string | null => {
  const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
};

const startVersionPolling = () => {
  if (!baselineScriptSrc || typeof document === "undefined" || typeof fetch === "undefined") return;

  // Frequent enough to catch a deploy within a normal work session, cheap
  // enough (one static GET of "/") to leave running for the whole session.
  const POLL_INTERVAL_MS = 5 * 60 * 1000;

  const checkForNewVersion = async () => {
    if (updateBannerShown || document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/", { cache: "no-store" });
      const html = await res.text();
      const currentScriptSrc = extractIndexScriptSrc(html);
      if (currentScriptSrc && currentScriptSrc !== baselineScriptSrc) {
        showUpdateBanner();
      }
    } catch {
      // Offline / transient network error — not conclusive either way, skip
      // this round silently and try again on the next tick.
    }
  };

  window.setInterval(checkForNewVersion, POLL_INTERVAL_MS);
  // Also check right away when the user comes back to this tab — catches a
  // deploy that happened while it was in the background, without waiting up
  // to a full POLL_INTERVAL_MS after they return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForNewVersion();
  });
};

const renderPreviewRecovery = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
  root.render(
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-lg space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Preview não conseguiu carregar</h1>
        <p className="text-sm text-muted-foreground">
          Um módulo do preview falhou ao carregar. Recarrega o sandbox; se continuar, reinicia o preview.
        </p>
        <pre className="max-h-40 overflow-auto rounded bg-muted p-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {message}
        </pre>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Recarregar
        </button>
      </div>
    </div>
  );
};

const loadApp = async () => {
  try {
    const { default: App } = await import("./App.tsx");
    root.render(
      <LanguageProvider>
        <App />
      </LanguageProvider>
    );
    appMounted = true;
    startVersionPolling();
  } catch (error) {
    if (isModuleLoadError(error) && !sessionStorage.getItem("olyvia-module-load-retried")) {
      sessionStorage.setItem("olyvia-module-load-retried", "true");
      window.location.reload();
      return;
    }

    Sentry.captureException(error);
    renderPreviewRecovery(error);
  }
};

window.addEventListener("unhandledrejection", (event) => {
  if (isModuleLoadError(event.reason)) {
    if (appMounted) {
      // The app is already running — this is almost always a post-deploy
      // stale chunk, not something the current user caused. Warn instead of
      // wiping their in-progress work off the screen.
      event.preventDefault();
      showUpdateBanner();
    } else {
      renderPreviewRecovery(event.reason);
    }
  } else {
    Sentry.captureException(event.reason);
  }
});

void loadApp();
