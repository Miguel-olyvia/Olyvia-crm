// 11/11 (Rúben: «no plano da obra e na correção de medidas, ver o impacto no orçamento ao vivo»): o que as medidas corrigidas e os ajustes ao
// plano mudam no valor da proposta aceite, enquanto se mexe. Só se mostra; quem refaz a proposta é o comercial (no passo Contrato).
import { TrendingDown, TrendingUp, Equal } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur } from "../motor";

export interface LinhaImpacto { l: string; v: number | null; sub?: string }

/** As linhas do impacto das medidas: o que as medidas mudam e, se a proposta for refeita (`refaz`: há medidas ou plano que mudam o valor),
 *  os acertos que refazer o orçamento já junta. Sem nada a refazer, não há linhas. */
export function linhasDoImpacto(mudadas: number, i: { medidas: number; acertos: number }, refaz = mudadas > 0): LinhaImpacto[] {
  return [
    ...(mudadas || Math.abs(i.medidas) > 0.004 ? [{ l: mudadas === 1 ? "1 medida corrigida" : `${mudadas} medidas corrigidas`, v: i.medidas }] : []),
    ...(refaz && Math.abs(i.acertos) > 0.004 ? [{ l: "Acertos do orçamento refeito", sub: "o que o levantamento junta: proteções, transporte, casa habitada", v: i.acertos }] : []),
  ];
}

const sinal = (v: number) => (v > 0.004 ? "+" : v < -0.004 ? "−" : "");
export const textoEur = (v: number) => `${sinal(v)}${eur(Math.abs(v))} €`;

export function ImpactoNoOrcamento({ linhas, atual, className }: { linhas: LinhaImpacto[]; atual: number; className?: string }) {
  const dif = linhas.reduce((a, x) => a + (x.v ?? 0), 0);
  const sobe = dif > 0.004, desce = dif < -0.004;
  const Icone = sobe ? TrendingUp : desce ? TrendingDown : Equal;
  return (
    <section aria-label="Impacto no orçamento" className={cn("rounded-2xl border p-4", sobe ? "border-amber-300/70 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : desce ? "border-primary/30 bg-primary/[0.05]" : "border-border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[15px] font-semibold"><Icone className="h-4 w-4" aria-hidden="true" />Impacto no orçamento</p>
        <p className="text-lg font-semibold tabular-nums" aria-live="polite">{sobe || desce ? `${textoEur(dif)} s/ IVA` : "Sem impacto"}</p>
      </div>
      {linhas.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {linhas.map((x) => (
            <li key={x.l} className="flex justify-between gap-3">
              <span className="min-w-0">{x.l}{x.sub && <span className="text-muted-foreground"> · {x.sub}</span>}</span>
              <span className="shrink-0 tabular-nums">{x.v == null ? "por calcular" : textoEur(x.v)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        A proposta aceite tem <span className="tabular-nums">{eur(atual)} €</span> s/ IVA{sobe || desce ? <>; com isto fica <span className="font-medium tabular-nums text-foreground">{eur(atual + dif)} €</span>. Antes do contrato, o comercial refaz a proposta.</> : "."}
      </p>
    </section>
  );
}
