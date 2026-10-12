import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, FlaskConical } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaQuadro } from "@/components/negocio-metas/AbaQuadro";
import { DashboardNegocios } from "@/components/negocio-metas/DashboardNegocios";
import { SeletorModo } from "@/components/negocio-metas/SeletorModo";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { DADOS_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  SEM_FILTROS, filtrarNegocios, numerosDashboard, resumoQuadro, type FiltrosQuadro,
} from "@/components/negocio-metas/logicaQuadro";
import { guardarVista, lerVista, type ModoVista } from "@/components/negocio-metas/vistaGuardada";

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
  const [vista, setVista] = useState<"quadro" | "dashboard">("quadro");
  const [modo, setModo] = useState<ModoVista>(lerVista);
  const mudarModo = (m: ModoVista) => {
    setModo(m);
    guardarVista(m);
  };

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
              <Link to="/deals" className={`rounded-sm hover:text-foreground ${FOCO}`}>
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
        <p className="text-sm text-foreground/80">{subtitulo}</p>
        <p role="note" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          {t("businessGoals.sample")}
        </p>
      </header>

      <Tabs value={vista} onValueChange={(v) => setVista(v as "quadro" | "dashboard")} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TabsList aria-label={t("businessGoals.tabs.label")} className="h-auto">
            <TabsTrigger value="quadro" className="min-h-11 px-4">{t("businessGoals.tabs.board")}</TabsTrigger>
            <TabsTrigger value="dashboard" className="min-h-11 px-4">{t("businessGoals.tabs.dashboard")}</TabsTrigger>
          </TabsList>
          {vista === "quadro" && <SeletorModo modo={modo} aoMudar={mudarModo} />}
        </div>
        <TabsContent value="quadro" className="mt-0">
          <AbaQuadro negocios={negocios} filtros={filtros} modo={modo} aoMudarFiltros={setFiltros} />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-0">
          <DashboardNegocios dados={DADOS_EXEMPLO} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NegocioMetas;
