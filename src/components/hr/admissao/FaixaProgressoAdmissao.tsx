/**
 * A faixa de progresso de uma admissao: Convite, Ficha, Aprovacao do RH, Contrato, Assinaturas e Acesso. Cada passo diz em
 * texto se esta feito, em curso ou por fazer (icone mais texto, nunca so a cor); o atual leva `aria-current="step"`.
 *
 * Sem faixa quando nao se sabe onde vai (cancelada, `terminado` mascarado, estado desconhecido): inventar um passo seria
 * dizer o que ninguem sabe. Uma admissao rejeitada para na aprovacao e di-lo.
 */
import { Check, Circle, CircleDot, XCircle } from "lucide-react";
import { PASSOS_FAIXA, passoDaFaixa } from "@/lib/hr/admissaoPipeline";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoAdmissao } from "@/types/hr";

export function FaixaProgressoAdmissao({ estado }: { estado: EstadoAdmissao }) {
  const { t } = useTranslation();
  const passo = passoDaFaixa(estado);
  if (!passo) return null;
  return (
    <ol aria-label={t("rhAdm.faixa.rotulo")} className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2">
      {PASSOS_FAIXA.map((nome, i) => {
        const feito = i < passo.atual;
        const eAtual = i === passo.atual;
        const parouAqui = eAtual && passo.rejeitada;
        const Icone = parouAqui ? XCircle : feito ? Check : eAtual ? CircleDot : Circle;
        const situacao = parouAqui ? "rejeitado" : feito ? "feito" : eAtual ? "atual" : "falta";
        return (
          <li
            key={nome}
            aria-current={eAtual ? "step" : undefined}
            className={cn(
              "flex min-h-7 items-center gap-1.5 text-xs",
              eAtual ? "font-semibold text-foreground" : feito ? "text-foreground" : "text-muted-foreground",
              parouAqui && "text-destructive",
            )}
          >
            <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t(`rhAdm.faixa.${nome}`)}
            <span className="sr-only">{` — ${t(`rhAdm.faixa.${situacao}`)}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
