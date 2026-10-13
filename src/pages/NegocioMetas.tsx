import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AbaQuadro } from "@/components/negocio-metas/AbaQuadro";
import { DashboardNegocios } from "@/components/negocio-metas/DashboardNegocios";
import { SeletorModo } from "@/components/negocio-metas/SeletorModo";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  filtrarNegocios, numerosDashboard, resumoQuadro,
} from "@/components/negocio-metas/logicaQuadro";
import { useAcoesExemplo } from "@/components/negocio-metas/acoesExemplo";
import { useFiltrosPagina } from "@/components/negocio-metas/useFiltrosPagina";
import { usePreferenciasQuadro } from "@/components/negocio-metas/usePreferenciasQuadro";

/**
 * "Negócio e metas" (Aquisição): Quadro (com Lista) e Dashboard. Só conteúdo de
 * exemplo, sem qualquer leitura à base: os números vêm de
 * `negocioMetasExemplo.ts` e os totais são calculados em `negocioMetas.ts` e
 * `logicaQuadro.ts`.
 */
const NegocioMetas = () => {
  const { t } = useTranslation();
  const { negocios } = DADOS_EXEMPLO;
  const prefs = usePreferenciasQuadro();
  const acoes = useAcoesExemplo();
  const { filtros, mudarFiltros } = useFiltrosPagina(prefs);
  const [vista, setVista] = useState<"quadro" | "dashboard">("quadro");

  const visiveis = useMemo(() => filtrarNegocios(negocios, filtros, HOJE_EXEMPLO), [negocios, filtros]);
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
      <CabecalhoPagina subtitulo={subtitulo} />

      <Tabs value={vista} onValueChange={(v) => setVista(v as "quadro" | "dashboard")} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TabsList aria-label={t("businessGoals.tabs.label")} className="h-auto">
            <TabsTrigger value="quadro" className="min-h-11 px-4">{t("businessGoals.tabs.board")}</TabsTrigger>
            <TabsTrigger value="dashboard" className="min-h-11 px-4">{t("businessGoals.tabs.dashboard")}</TabsTrigger>
          </TabsList>
          {vista === "quadro" && <SeletorModo modo={prefs.modo} aoMudar={prefs.mudarModo} />}
        </div>
        <TabsContent value="quadro" className="mt-0">
          <AbaQuadro
            negocios={negocios} hoje={HOJE_EXEMPLO} filtros={filtros} modo={prefs.modo} ordem={prefs.ordem}
            acoes={acoes} aoMudarFiltros={mudarFiltros} aoMudarOrdem={prefs.mudarOrdem}
          />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-0">
          <DashboardNegocios dados={DADOS_EXEMPLO} aoIrParaQuadro={() => setVista("quadro")} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NegocioMetas;
