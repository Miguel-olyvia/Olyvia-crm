import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { EvolucaoMensal } from "@/components/negocio-metas/EvolucaoMensal";
import { MetasComerciais } from "@/components/negocio-metas/MetasComerciais";
import { MetasMes } from "@/components/negocio-metas/MetasMes";
import { NegociosDoMes } from "@/components/negocio-metas/NegociosDoMes";
import { cartoesDoMes, evolucaoMensal, totaisPorComercial } from "@/components/negocio-metas/negocioMetas";
import { DADOS_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";

/**
 * "Negócio e metas" (Aquisição). Para já só conteúdo de exemplo, sem qualquer
 * leitura à base: os números vêm de `negocioMetasExemplo.ts` e os totais são
 * calculados em `negocioMetas.ts`.
 */
const NegocioMetas = () => {
  const { t } = useTranslation();
  const { negocios, metasMes, metasComerciais } = DADOS_EXEMPLO;
  const cartoes = useMemo(() => cartoesDoMes(negocios, metasMes), [negocios, metasMes]);
  const totais = useMemo(() => totaisPorComercial(negocios, metasComerciais), [negocios, metasComerciais]);
  const evolucao = useMemo(() => evolucaoMensal(DADOS_EXEMPLO), []);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <header className="space-y-2">
        <nav aria-label={t("businessGoals.breadcrumb.label")}>
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link
                to="/deals"
                className="rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("businessGoals.breadcrumb.acquisition")}
              </Link>
            </li>
            <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
            <li aria-current="page" className="font-medium text-foreground">{t("businessGoals.title")}</li>
          </ol>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("businessGoals.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("businessGoals.subtitle")}</p>
        <p
          role="note"
          className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning"
        >
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          {t("businessGoals.sample")}
        </p>
      </header>

      <MetasMes cartoes={cartoes} />
      <MetasComerciais totais={totais} />
      <EvolucaoMensal meses={evolucao} />
      <NegociosDoMes negocios={negocios} />
    </div>
  );
};

export default NegocioMetas;
