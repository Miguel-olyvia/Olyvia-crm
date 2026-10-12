// Inventário (mockup): o módulo de inventário completo, em HTML com motor e dados próprios, mostrado num iframe.
// Vive isolado: o iframe não toca no Estado do protótipo nem nos seus dados. O HTML só é carregado quando esta página se abre.
import { useEffect, useState } from "react";

/** As chaves de localStorage que o mockup usa para o separador e para a base de dados de exemplo. */
export const CHAVES_INVENTARIO = ["inv-mockup-tab", "inv-mockup-db-v3"] as const;

export default function InventarioMockup() {
  const [html, setHtml] = useState<string | null>(null);
  const [ronda, setRonda] = useState(0); // muda a key do iframe: recria-o

  useEffect(() => {
    let vivo = true;
    import("./mockup-inventario.html?raw").then((m) => { if (vivo) setHtml(m.default); });
    return () => { vivo = false; };
  }, []);

  const repor = () => {
    for (const c of CHAVES_INVENTARIO) {
      try { localStorage.removeItem(c); } catch { /* sem storage: o iframe volta ao início na mesma */ }
    }
    setRonda((r) => r + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-1">
        <span className="text-[15px] text-muted-foreground">Inventário · dados de exemplo</span>
        <button type="button" onClick={repor}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-[15px] font-medium text-foreground transition-colors hover:bg-muted">
          Repor inventário
        </button>
      </div>
      {html ? (
        <iframe key={ronda} title="Inventário (exemplo)" srcDoc={html}
          sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
          className="min-h-0 w-full flex-1 border-0 bg-background" />
      ) : (
        <p className="p-6 text-[15px] text-muted-foreground" role="status">A abrir o inventário…</p>
      )}
    </div>
  );
}
