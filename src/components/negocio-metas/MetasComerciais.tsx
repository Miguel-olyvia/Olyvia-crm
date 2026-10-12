import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { LinhaComercial } from "./LinhaComercial";
import { TabelaComerciais } from "./TabelaComerciais";
import { ordenarPorGanho, totalEquipa, type OrdemGanho } from "./comparativoComerciais";
import { FOCO } from "./estilos";
import { ALTURA, CARTAO, TRANSICAO } from "./estilosDashboard";
import type { TotaisComercial } from "./negocioMetas";

interface MetasComerciaisProps {
  totais: TotaisComercial[];
  ritmo: number;
  /** Comercial escolhido para filtrar o Dashboard, ou `null`. */
  selecionado: string | null;
  aoSelecionar: (comercial: string | null) => void;
}

/** Comparativo por comercial: bullet charts do maior para o menor ganho e total da equipa. */
export function MetasComerciais({ totais, ritmo, selecionado, aoSelecionar }: MetasComerciaisProps) {
  const { t } = useTranslation();
  const [ordem, setOrdem] = useState<OrdemGanho>("desc");
  const ordenados = useMemo(() => ordenarPorGanho(totais, ordem), [totais, ordem]);
  const equipa = useMemo(() => totalEquipa(totais), [totais]);
  const Seta = ordem === "desc" ? ArrowDownWideNarrow : ArrowUpNarrowWide;
  const ordemTexto = t(ordem === "desc" ? "businessGoals.reps.sortDesc" : "businessGoals.reps.sortAsc");

  return (
    <section aria-labelledby="metas-comerciais-titulo" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="metas-comerciais-titulo" className="text-lg font-semibold text-foreground">
          {t("businessGoals.reps.title")}
        </h2>
        <button
          type="button"
          onClick={() => setOrdem(ordem === "desc" ? "asc" : "desc")}
          aria-label={t("businessGoals.reps.sortLabel", { order: ordemTexto })}
          className={cn(
            "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm text-foreground hover:bg-muted",
            TRANSICAO, FOCO,
          )}
        >
          <Seta className="h-4 w-4" aria-hidden="true" />
          {ordemTexto}
        </button>
      </div>
      <ul className={cn(CARTAO, ALTURA.comerciais, "space-y-1 p-2")}>
        {ordenados.map((c) => (
          <LinhaComercial
            key={c.comercial}
            nome={c.comercial}
            progresso={c}
            ritmo={ritmo}
            ativo={selecionado === c.comercial}
            aoEscolher={() => aoSelecionar(selecionado === c.comercial ? null : c.comercial)}
          />
        ))}
        <LinhaComercial
          nome={t("businessGoals.reps.total")}
          progresso={equipa}
          ritmo={ritmo}
          testId="total-equipa"
        />
      </ul>
      <TabelaComerciais totais={ordenados} equipa={equipa} />
    </section>
  );
}
