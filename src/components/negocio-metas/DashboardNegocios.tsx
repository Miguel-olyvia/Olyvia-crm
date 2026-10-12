import { useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { EvolucaoMensal } from "./EvolucaoMensal";
import { MetasComerciais } from "./MetasComerciais";
import { MetasMes } from "./MetasMes";
import { formatarMeta } from "./formatoMetas";
import {
  cartoesDoMes, evolucaoMensal, totaisPorComercial, type DadosNegocioMetas,
} from "./negocioMetas";
import { numerosDashboard } from "./logicaQuadro";

/** Aba Dashboard: números do quadro, metas do mês, metas por comercial e evolução. */
export function DashboardNegocios({ dados }: { dados: DadosNegocioMetas }) {
  const { t } = useTranslation();
  const numeros = useMemo(() => numerosDashboard(dados.negocios), [dados]);
  const cartoes = useMemo(() => cartoesDoMes(dados.negocios, dados.metasMes), [dados]);
  const totais = useMemo(
    () => totaisPorComercial(dados.negocios, dados.metasComerciais),
    [dados],
  );
  const evolucao = useMemo(() => evolucaoMensal(dados), [dados]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="numeros-titulo" className="space-y-3">
        <h2 id="numeros-titulo" className="text-base font-semibold text-foreground">
          {t("businessGoals.numbers.title")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numeros.map((n) => (
            <li key={n.chave} className="rounded-2xl border border-border/70 bg-card p-4">
              <span className="text-sm font-medium text-muted-foreground">
                {t(`businessGoals.numbers.${n.chave}`)}
              </span>
              <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums tracking-tight text-foreground">
                {n.euros ? formatarMeta("euro", n.valor) : n.valor}
              </p>
              {n.valorNota !== null && (
                <p className="text-xs text-muted-foreground">
                  {t("businessGoals.numbers.worth", { value: formatarMeta("euro", n.valorNota) })}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <MetasMes cartoes={cartoes} />
      <MetasComerciais totais={totais} />
      <EvolucaoMensal meses={evolucao} />
    </div>
  );
}
