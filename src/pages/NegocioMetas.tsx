import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CabecalhoPagina } from "@/components/negocio-metas/CabecalhoPagina";
import { AbaQuadro } from "@/components/negocio-metas/AbaQuadro";
import { AbaWorkflow } from "@/components/negocio-metas/AbaWorkflow";
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
import { WorkflowExemploProvider } from "@/components/negocio-metas/useWorkflowExemplo";

type Vista = "quadro" | "dashboard" | "workflow";

const vistaDoEndereco = (params: URLSearchParams): Vista => {
  if (params.get("open")) return "quadro";
  const separador = params.get("separador");
  return separador === "workflow" || separador === "dashboard" ? separador : "quadro";
};

const ehVista = (valor: string): valor is Vista => valor === "quadro" || valor === "dashboard" || valor === "workflow";

/**
 * "Negócio e metas" (Aquisição): Quadro (com Lista), Dashboard e Workflow (?separador=workflow). Só conteúdo de
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
  const [params, setParams] = useSearchParams();
  // A vista vive no endereço, a única fonte: ?open=<id> (vindo, por exemplo, da ficha de uma pessoa) força o
  // Quadro, onde está o painel do negócio; senão ?separador=workflow|dashboard; sem nada, o Quadro.
  const vista = vistaDoEndereco(params);
  /** Muda de separador escrevendo-o no endereço (sem entrada nova no histórico). Sair do Quadro fecha o painel (?open). */
  const mudarVista = useCallback((nova: Vista) => {
    setParams((atual) => {
      const p = new URLSearchParams(atual);
      if (nova === "quadro") p.delete("separador");
      else {
        p.set("separador", nova);
        p.delete("open");
      }
      return p;
    }, { replace: true });
  }, [setParams]);

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
    <WorkflowExemploProvider>
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <CabecalhoPagina subtitulo={subtitulo} />

        <Tabs value={vista} onValueChange={(v) => { if (ehVista(v)) mudarVista(v); }} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <TabsList aria-label={t("businessGoals.tabs.label")} className="h-auto">
              <TabsTrigger value="quadro" className="min-h-11 px-4 rounded-none shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-semibold">{t("businessGoals.tabs.board")}</TabsTrigger>
              <TabsTrigger value="dashboard" className="min-h-11 px-4 rounded-none shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-semibold">{t("businessGoals.tabs.dashboard")}</TabsTrigger>
              <TabsTrigger value="workflow" className="min-h-11 px-4 rounded-none shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:font-semibold">{t("businessGoals.tabs.workflow")}</TabsTrigger>
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
            <DashboardNegocios dados={DADOS_EXEMPLO} aoIrParaQuadro={() => mudarVista("quadro")} />
          </TabsContent>
          <TabsContent value="workflow" className="mt-0">
            <AbaWorkflow />
          </TabsContent>
        </Tabs>
      </div>
    </WorkflowExemploProvider>
  );
};

export default NegocioMetas;
