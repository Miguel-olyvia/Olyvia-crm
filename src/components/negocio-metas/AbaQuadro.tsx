import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { BarraQuadro } from "./BarraQuadro";
import { ListaNegocios } from "./ListaNegocios";
import { PainelNegocio } from "./PainelNegocio";
import { QuadroNegocios } from "./QuadroNegocios";
import type { NegocioMes } from "./negocioMetas";
import {
  SEM_FILTROS, alternarVista, filtrarNegocios, filtrosAtivos, vistasRapidas,
  type FiltrosQuadro, type IdVista,
} from "./logicaQuadro";
import { guardarVista, lerVista, type ModoVista } from "./vistaGuardada";

interface AbaQuadroProps {
  negocios: NegocioMes[];
  /** Os filtros vivem na página, que precisa dos negócios visíveis para o resumo do topo. */
  filtros: FiltrosQuadro;
  aoMudarFiltros: (filtros: FiltrosQuadro) => void;
}

/** Aba Quadro: filtros, chips, escolha Quadro | Lista e o painel do negócio. */
export function AbaQuadro({ negocios, filtros, aoMudarFiltros }: AbaQuadroProps) {
  const { t } = useTranslation();
  const [modo, setModo] = useState<ModoVista>(lerVista);
  const [aberto, setAberto] = useState<NegocioMes | null>(null);

  const visiveis = useMemo(() => filtrarNegocios(negocios, filtros), [negocios, filtros]);
  const vistas = useMemo(() => vistasRapidas(negocios, filtros), [negocios, filtros]);
  const comerciais = useMemo(() => [...new Set(negocios.map((n) => n.comercial))].sort(), [negocios]);

  const mudarFiltros = (parcial: Partial<FiltrosQuadro>) => aoMudarFiltros({ ...filtros, ...parcial });
  const alternar = (id: IdVista) => aoMudarFiltros(alternarVista(filtros, id));
  const mudarModo = (m: ModoVista) => {
    setModo(m);
    guardarVista(m);
  };

  return (
    <div className="space-y-4">
      <BarraQuadro
        filtros={filtros}
        comerciais={comerciais}
        vistas={vistas}
        total={visiveis.length}
        modo={modo}
        aoMudarFiltros={mudarFiltros}
        aoAlternarVista={alternar}
        aoMudarModo={mudarModo}
      />
      {visiveis.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-foreground">{t("businessGoals.empty")}</p>
          {filtrosAtivos(filtros) && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => mudarFiltros(SEM_FILTROS)}>
              {t("businessGoals.clear")}
            </Button>
          )}
        </div>
      ) : modo === "lista" ? (
        <ListaNegocios negocios={visiveis} aoAbrir={setAberto} />
      ) : (
        <QuadroNegocios negocios={visiveis} aoAbrir={setAberto} />
      )}
      <PainelNegocio negocio={aberto} aoFechar={() => setAberto(null)} />
    </div>
  );
}
