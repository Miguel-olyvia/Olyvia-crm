import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaQuadro } from "@/components/negocio-metas/AbaQuadro";
import { DashboardNegocios } from "@/components/negocio-metas/DashboardNegocios";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { DADOS_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  SEM_FILTROS, filtrarNegocios, numerosDashboard, resumoQuadro, type FiltrosQuadro,
} from "@/components/negocio-metas/logicaQuadro";

/**
 * "Negócio e metas" (Aquisição): Quadro (com Lista) e Dashboard. Só conteúdo de
 * exemplo, sem qualquer leitura à base: os números vêm de
 * `negocioMetasExemplo.ts` e os totais são calculados em `negocioMetas.ts` e
 * `logicaQuadro.ts`.
 */
const NegocioMetas = () => {
  const { t } = useTranslation();
  const { negocios } = DADOS_EXEMPLO;
  const [filtros, setFiltros] = useState<FiltrosQuadro>(SEM_FILTROS);

  const visiveis = useMemo(() => filtrarNegocios(negocios, filtros), [negocios, filtros]);
  const resumo = resumoQuadro(visiveis);
  const porFechar = numerosDashboard(negocios)[1];
  const de = resumo.n !== negocios.length ? ` (${t("businessGoals.of")} ${negocios.length})` : "";
  const subtitulo = t("businessGoals.summary", {
    shown: `${resumo.n}${de}`,
    proposal: formatarMeta("euro", resumo.valorEmProposta),
    open: resumo.porFechar,
    value: formatarMeta("euro", porFechar.valorNota ?? 0),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
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
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
        <p
          role="note"
          className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning"
        >
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          {t("businessGoals.sample")}
        </p>
      </header>

      <Tabs defaultValue="quadro" className="space-y-4">
        <TabsList aria-label={t("businessGoals.tabs.label")}>
          <TabsTrigger value="quadro">{t("businessGoals.tabs.board")}</TabsTrigger>
          <TabsTrigger value="dashboard">{t("businessGoals.tabs.dashboard")}</TabsTrigger>
        </TabsList>
        <TabsContent value="quadro" className="mt-0">
          <AbaQuadro negocios={negocios} filtros={filtros} aoMudarFiltros={setFiltros} />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-0">
          <DashboardNegocios dados={DADOS_EXEMPLO} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NegocioMetas;
