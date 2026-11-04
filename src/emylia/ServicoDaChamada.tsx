// 4/11 (Rúben): no passo «Qualificação», o tipo de serviço que veio da lead (casa de banho, cozinha…). Quem liga garante na chamada qual
// é: confirma-o ou troca-o por outro, com um clique (A.servicoDaChamada). As linhas são as da organização (LINHAS, lidas da base).
import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LINHAS, type LinhaId, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

export function ServicoDaChamada({ ctx, d, ro }: { ctx: Ctx; d: Negocio; ro?: boolean }) {
  const rotulo = useId();
  const validado = d.f.servico_validado === "Sim";
  const atual: LinhaId | null = d.linhaPorDefinir ? null : d.linha;
  const linhas = Object.entries(LINHAS) as [LinhaId, (typeof LINHAS)[LinhaId]][];
  const escolher = (l: LinhaId) => { if (!ro) ctx.run(() => ctx.A.servicoDaChamada(d.id, l)); };
  return (
    <section aria-labelledby={rotulo} className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={rotulo} className="text-[15px] font-medium text-foreground">Tipo de serviço</h3>
        <span className={cn("text-sm", validado ? "text-success" : "text-muted-foreground")}>
          {validado ? "Confirmado na chamada" : atual ? "Veio da lead: confirme na chamada" : "A lead não disse: escolha na chamada"}
        </span>
      </div>
      <div role="group" aria-labelledby={rotulo} className="flex flex-wrap gap-2">
        {linhas.map(([id, l]) => {
          const ligado = atual === id;
          return (
            <button
              key={id} type="button" aria-pressed={ligado} aria-disabled={ro || undefined} onClick={() => escolher(id)}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-4 text-[15px] transition-colors duration-150",
                ligado ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40")}
            >
              {ligado && validado && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}{l.n}
            </button>
          );
        })}
      </div>
      {atual && !validado && !ro && (
        <button type="button" onClick={() => escolher(atual)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed border-primary px-4 text-[15px] font-medium text-primary hover:bg-primary/[0.06]">
          <Check className="h-4 w-4" aria-hidden="true" />Confirmar: é {LINHAS[atual].n.toLowerCase()}
        </button>
      )}
    </section>
  );
}
