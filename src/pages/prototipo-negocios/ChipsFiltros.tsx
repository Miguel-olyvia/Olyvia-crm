// Os filtros ativos como chips removíveis, em texto, com "Limpar tudo". Sem filtros ativos não desenha nada.
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "./PessoaLinha";

export interface ChipRemovivel { id: string; texto: string; remover: () => void }

const BASE = "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function ChipsFiltros({ chips, limparTudo }: { chips: readonly ChipRemovivel[]; limparTudo: () => void }) {
  if (chips.length === 0) return null;
  return (
    <div role="group" aria-label="Filtros ativos" className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.id} type="button" onClick={c.remover} aria-label={`Tirar o filtro: ${c.texto}`} className={cn(BASE, BORDA_CTRL, "bg-card hover:border-foreground")}>
          {c.texto}<X className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      <button type="button" onClick={limparTudo} className={cn(BASE, "border-transparent underline underline-offset-4")}>Limpar tudo</button>
    </div>
  );
}
