// A quantidade com − e +, para o dedo (14/10/2026). O número do meio também se escreve (5,5 m²), e grava ao sair.
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { nfmt } from "./motor";
import { numero } from "./pecas";

export function ContadorQtd({ id, valor, un, nome, onMudar, min = 1, passo = 1, className }: {
  id: string; valor: number; un: string; nome: string; onMudar: (n: number) => void; min?: number; passo?: number; className?: string;
}) {
  const btn = "grid h-11 w-11 shrink-0 place-items-center text-foreground transition-colors hover:bg-muted disabled:text-muted-foreground disabled:hover:bg-transparent";
  const mudar = (n: number) => { const x = Math.round(Math.max(min, n) * 100) / 100; if (x !== valor) onMudar(x); };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div role="group" aria-label={`Quantidade de ${nome}`} className="inline-flex items-center overflow-hidden rounded-xl border border-input bg-card">
        <button type="button" className={btn} aria-label={`Menos um: ${nome}`} disabled={valor <= min} onClick={() => mudar(valor - passo)}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <label htmlFor={id} className="sr-only">Quantidade de {nome} ({un})</label>
        <input id={id} key={id + valor} inputMode="decimal" defaultValue={nfmt(valor)}
          className="h-11 w-14 border-x border-input bg-transparent text-center text-[15px] tabular-nums outline-none focus-visible:bg-primary/[0.06]"
          onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n)) mudar(n); else e.target.value = nfmt(valor); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <button type="button" className={btn} aria-label={`Mais um: ${nome}`} onClick={() => mudar(valor + passo)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <span className="text-sm text-muted-foreground">{un}</span>
    </div>
  );
}
