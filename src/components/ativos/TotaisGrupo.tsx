/**
 * Os totais do topo de cada separador: quantos ativos em uso, valor de compra total e valor atual total, pela mesma conta do detalhe
 * (`totaisAtivos`). O que só tem vida em horas conta na quantidade e na compra, não no valor atual, e fica dito numa legenda.
 */
import { euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import type { TotaisAtivos } from "./lib/resumoAtivo";
import type { GrupoAtivo } from "./lib/tipos";

function Mosaico({ rotulo, valor, id }: { rotulo: string; valor: string; id: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg border bg-card px-4 py-2.5 sm:block sm:py-3">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd data-testid={id} className="text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl">{valor}</dd>
    </div>
  );
}

export function TotaisGrupo({ grupo, totais }: { grupo: GrupoAtivo; totais: TotaisAtivos }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("ativos.totais.titulo", { grupo: t(`ativos.grupo.${grupo}`) })} className="space-y-2">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Mosaico id="total-quantidade" rotulo={t("ativos.totais.quantidade")} valor={String(totais.quantidade)} />
        <Mosaico id="total-compra" rotulo={t("ativos.totais.compra")} valor={euros(totais.valorCompra, "—")} />
        <Mosaico id="total-atual" rotulo={t("ativos.totais.atual")} valor={euros(totais.valorAtual, "—")} />
      </dl>
      {totais.semValorAtual > 0 && <p className="text-xs text-muted-foreground">{t("ativos.totais.porUso", { n: totais.semValorAtual })}</p>}
    </section>
  );
}
