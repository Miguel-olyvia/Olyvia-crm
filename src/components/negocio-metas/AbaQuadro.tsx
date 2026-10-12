import { useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { BarraQuadro } from "./BarraQuadro";
import { ListaNegocios } from "./ListaNegocios";
import { PainelNegocio } from "./PainelNegocio";
import { QuadroNegocios } from "./QuadroNegocios";
import type { NegocioMes } from "./negocioMetas";
import {
  SEM_FILTROS, alternarVista, comerciaisDe, filtrarNegocios, filtrosAtivos, servicosDe, vistasRapidas,
  type FiltrosQuadro, type IdVista,
} from "./logicaQuadro";
import { useAtalhosQuadro } from "./useAtalhosQuadro";
import type { ModoVista } from "./vistaGuardada";

interface AbaQuadroProps {
  negocios: NegocioMes[];
  /** Os filtros e o modo vivem na página, que precisa deles para o resumo do topo e para o seletor ao lado das abas. */
  filtros: FiltrosQuadro;
  modo: ModoVista;
  aoMudarFiltros: (filtros: FiltrosQuadro) => void;
}

/** Aba Quadro: filtros, chips, o Quadro ou a Lista e o painel do negócio. */
export function AbaQuadro({ negocios, filtros, modo, aoMudarFiltros }: AbaQuadroProps) {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState<NegocioMes | null>(null);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const pesquisa = useRef<HTMLInputElement>(null);

  const visiveis = useMemo(() => filtrarNegocios(negocios, filtros), [negocios, filtros]);
  const vistas = useMemo(() => vistasRapidas(negocios, filtros), [negocios, filtros]);
  const comerciais = useMemo(() => comerciaisDe(negocios), [negocios]);
  const servicos = useMemo(() => servicosDe(negocios), [negocios]);

  const mudarFiltros = (parcial: Partial<FiltrosQuadro>) => aoMudarFiltros({ ...filtros, ...parcial });
  const alternar = (id: IdVista) => aoMudarFiltros(alternarVista(filtros, id));
  const limpar = () => aoMudarFiltros(SEM_FILTROS);
  const comFiltros = filtrosAtivos(filtros);

  useAtalhosQuadro(raiz, {
    pesquisa: () => pesquisa.current?.focus(),
    ajuda: () => setAjudaAberta((a) => !a),
  });

  return (
    <div ref={raiz} className="space-y-4">
      <BarraQuadro
        filtros={filtros}
        comerciais={comerciais}
        servicos={servicos}
        vistas={vistas}
        total={visiveis.length}
        pesquisaRef={pesquisa}
        ajudaAberta={ajudaAberta}
        aoMudarAjuda={setAjudaAberta}
        aoMudarFiltros={mudarFiltros}
        aoAlternarVista={alternar}
        aoLimparTudo={limpar}
      />
      {visiveis.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-foreground">{t("businessGoals.empty")}</p>
          {comFiltros && (
            <Button type="button" variant="outline" className="min-h-11" onClick={limpar}>
              {t("businessGoals.clear")}
            </Button>
          )}
        </div>
      ) : modo === "lista" ? (
        <ListaNegocios negocios={visiveis} aoAbrir={setAberto} />
      ) : (
        <QuadroNegocios negocios={visiveis} aoAbrir={setAberto} aoLimpar={comFiltros ? limpar : undefined} />
      )}
      <PainelNegocio negocio={aberto} aoFechar={() => setAberto(null)} />
    </div>
  );
}
