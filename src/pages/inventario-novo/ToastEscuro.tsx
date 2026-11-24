// O toast escuro do novo Inventário (mockup: .toast): em baixo ao centro, escuro, com UMA ação ("Anular" / "Refazer") e ✕.
// Fica 9 s. Só aparece quando traz uma ação — os avisos simples continuam a ser os toasts de cada ecrã clássico, para não
// os duplicar. A região (role="status", aria-live="polite") existe sempre, para o leitor de ecrã anunciar o que entra.
// No telemóvel sobe acima da barra do polegar.
import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const DURACAO_TOAST_MS = 9000;

export interface AvisoEscuro {
  /** Muda a cada aviso (reinicia os 9 s). */
  n: number;
  texto: string;
  acao: { rotulo: string; fazer: () => void };
}

export function ToastEscuro({ aviso, fechar }: { aviso: AvisoEscuro | null; fechar: () => void }) {
  const visivel = !!aviso && !!aviso.acao;
  useEffect(() => {
    if (!visivel) return;
    const t = window.setTimeout(fechar, DURACAO_TOAST_MS);
    return () => window.clearTimeout(t);
  }, [aviso?.n, visivel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div role="status" aria-live="polite" aria-atomic="true"
      className={cn("pointer-events-none fixed inset-x-0 z-[70] flex justify-center px-4",
        "bottom-[calc(86px+env(safe-area-inset-bottom))] sm:bottom-[calc(24px+env(safe-area-inset-bottom))]")}>
      {visivel && aviso && (
        <div data-testid="toast-escuro"
          className="pointer-events-auto flex max-w-[min(560px,100%)] items-center gap-2.5 rounded-2xl bg-foreground py-2 pl-4 pr-2 text-[14.5px] text-background shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <span className="min-w-0">{aviso.texto}</span>
          <button type="button"
            className="min-h-9 shrink-0 rounded-xl border border-white/25 px-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            onClick={() => { const f = aviso.acao.fazer; fechar(); f(); }}>
            {aviso.acao.rotulo}
          </button>
          <button type="button" aria-label="Fechar aviso"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            onClick={fechar}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
