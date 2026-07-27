import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;

import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import { LanguageProvider } from "./contexts/LanguageContext";
import { initAnalytics } from "./lib/analytics/posthog";

// Field names that must never leave this browser in a Sentry event — leads/
// contacts/clients PII (email, phone, NIF, names, addresses) that can end up
// in error `extra` context, breadcrumbs, or request data via
// Sentry.captureException(error, { extra: {...} }) call sites elsewhere in
// the app. This does NOT scrub PII embedded directly in an exception's own
// message or stack trace text — that would require unreliable content
// sniffing and is a known limitation, not something beforeSend can fix.
const PII_KEY_PATTERN = /email|phone|telefone|nif|iban|password|token|address|morada|first_?name|last_?name|display_?name|\bnome\b|signat/i;
const REDACTED = "[Filtered]";

function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrubPii(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = PII_KEY_PATTERN.test(key) ? REDACTED : scrubPii(val, depth + 1);
    }
    return out;
  }
  return value;
}

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete (event.user as Record<string, unknown>).username;
  }
  if (event.extra) event.extra = scrubPii(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubPii(event.contexts) as typeof event.contexts;
  if (event.request) {
    if (event.request.data) event.request.data = scrubPii(event.request.data);
    if (event.request.query_string) event.request.query_string = REDACTED;
    delete event.request.cookies;
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, data: b.data ? (scrubPii(b.data) as Record<string, unknown>) : b.data }));
  }
  return event;
}

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
    beforeSend,
  });
}

initAnalytics();

const root = createRoot(document.getElementById("root")!);

const isModuleLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Failed to fetch dynamically imported module") || message.includes("Importing a module script failed");
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
    renderPreviewRecovery(event.reason);
  } else {
    Sentry.captureException(event.reason);
  }
});

void loadApp();
