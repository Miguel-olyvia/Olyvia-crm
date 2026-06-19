import { Buffer } from "buffer";
(globalThis as any).Buffer = Buffer;

import { createRoot } from "react-dom/client";
import "./index.css";
import { LanguageProvider } from "./contexts/LanguageContext";

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

    renderPreviewRecovery(error);
  }
};

window.addEventListener("unhandledrejection", (event) => {
  if (isModuleLoadError(event.reason)) {
    renderPreviewRecovery(event.reason);
  }
});

void loadApp();
