/**
 * Os totais do topo de cada separador: quantos ativos em uso, valor de compra total e valor atual total, pela mesma conta do detalhe
 * (`totaisAtivos`). O que não tem valor atual (só vida em horas, ou modelo sem vida) conta na quantidade e na compra, não no valor
 * atual, e fica dito numa legenda. Os desativados nunca entram (com «Todos» ou «Desativados» a legenda diz-o) e, se a lista foi cortada
 * nos 2000, os totais dizem que são parciais.
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

interface Props {
  grupo: GrupoAtivo;
  totais: TotaisAtivos;
  /** A lista foi cortada nos 2000 ativos que a base devolve: os totais podem estar incompletos. */
  parcial?: boolean;
  /** O filtro de estado mostra também (ou só) desativados: os totais continuam a contar só os em uso. */
  soEmUso?: boolean;
}

export function TotaisGrupo({ grupo, totais, parcial = false, soEmUso = false }: Props) {
  const { t } = useTranslation();
  return (
    <section aria-label={t("ativos.totais.titulo", { grupo: t(`ativos.grupo.${grupo}`) })} className="space-y-2">
      <dl className="grid gap-3 sm:grid-cols-3">
        <Mosaico id="total-quantidade" rotulo={t("ativos.totais.quantidade")} valor={String(totais.quantidade)} />
        <Mosaico id="total-compra" rotulo={t("ativos.totais.compra")} valor={euros(totais.valorCompra, "—")} />
        <Mosaico id="total-atual" rotulo={t("ativos.totais.atual")} valor={euros(totais.valorAtual, "—")} />
      </dl>
      <div className="space-y-0.5 text-xs text-muted-foreground">
        {totais.semValorAtual > 0 && <p>{t("ativos.totais.porUso", { n: totais.semValorAtual })}</p>}
        {soEmUso && <p>{t("ativos.totais.soEmUso")}</p>}
        {parcial && <p className="font-medium text-amber-800 dark:text-amber-300">{t("ativos.totais.parcial")}</p>}
      </div>
    </section>
  );
}
