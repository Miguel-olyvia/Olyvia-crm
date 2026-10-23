import { X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "./estilos";
import { chipsDosFiltros, type ChipFiltro, type FiltrosQuadro } from "./logicaQuadro";

interface ChipsAtivosProps {
  filtros: FiltrosQuadro;
  aoMudarFiltros: (parcial: Partial<FiltrosQuadro>) => void;
  aoLimparTudo: () => void;
}

const BASE = "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm";
const CHAVE_VALOR: Record<string, string> = { "1": "quotesOne", "2+": "quotesMany", ate10: "valueLow", "10a20": "valueMid", "20mais": "valueHigh" };

/** Os filtros ligados como chips que se tiram um a um, mais "Limpar tudo". Sem filtros não desenha nada. */
export function ChipsAtivos({ filtros, aoMudarFiltros, aoLimparTudo }: ChipsAtivosProps) {
  const { t } = useTranslation();
  const chips = chipsDosFiltros(filtros);
  if (chips.length === 0) return null;

  const texto = (c: ChipFiltro): string => {
    const nomeValor = CHAVE_VALOR[c.valor] ? t(`businessGoals.filters.${CHAVE_VALOR[c.valor]}`) : c.valor;
    switch (c.id) {
      case "q": return t("businessGoals.chip.search", { value: c.valor });
      case "meus": return t("businessGoals.chip.mine");
      case "comercial": return t("businessGoals.chip.rep", { value: c.valor });
      case "servico": return t("businessGoals.chip.service", { value: c.valor });
      case "orcamentos": return t("businessGoals.chip.quotes", { value: nomeValor });
      case "faixa": return t("businessGoals.chip.value", { value: nomeValor });
    }
  };

  return (
    <div role="group" aria-label={t("businessGoals.filters.active")} className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => aoMudarFiltros(c.limpar)}
          aria-label={t("businessGoals.filters.remove", { name: texto(c) })}
          className={cn(BASE, "border-input bg-card hover:border-foreground/40", FOCO)}
        >
          {texto(c)}
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      <button type="button" onClick={aoLimparTudo} className={cn(BASE, "border-transparent underline underline-offset-4", FOCO)}>
        {t("businessGoals.filters.clearAll")}
      </button>
    </div>
  );
}
