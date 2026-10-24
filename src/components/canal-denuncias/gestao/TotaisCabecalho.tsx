// A faixa «Só o responsável do canal vê esta página» e os quatro totais do topo da gestão.
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { TotaisGestao } from "../lib/filtros";

export function FaixaResponsavel() {
  const { t } = useTranslation();
  return (
    <p role="note" className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t("cd.gestao.faixa")}
    </p>
  );
}

export function TotaisCabecalho({ totais }: { totais: TotaisGestao }) {
  const { t } = useTranslation();
  const itens: [string, number][] = [
    [t("cd.totais.novas"), totais.novas],
    [t("cd.totais.emAnalise"), totais.emAnalise],
    [t("cd.totais.aVencer"), totais.aVencer],
    [t("cd.totais.concluidas"), totais.concluidas],
  ];
  return (
    <dl aria-label={t("cd.totais.titulo")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="rounded-lg border bg-card px-4 py-3">
          <dd className="text-2xl font-semibold tabular-nums">{valor}</dd>
          <dt className="text-sm text-muted-foreground">{rotulo}</dt>
        </div>
      ))}
    </dl>
  );
}
