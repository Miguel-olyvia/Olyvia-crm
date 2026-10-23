import { useId } from "react";
import { AlertTriangle, GitCompareArrows } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { FOCO } from "./estilos";
import { ID_BARRA_SELECAO } from "./useSelecaoNegocios";

interface BarraSelecaoProps {
  /** Quantos negócios estão selecionados. */
  total: number;
  /** Quantos dos selecionados estão fora da vista pelos filtros de agora. */
  ocultos: number;
  /** O último pedido de selecionar um 4.º negócio foi recusado. */
  recusado: boolean;
  /** Quantas recusas houve: é a `key` da mensagem, para ser anunciada de cada vez. */
  tentativas: number;
  /** Quantas vezes se carregou em "c" com menos de 2 selecionados (0 = nenhuma, ou a seleção mudou): é a `key` da dica anunciada. */
  dicaVez: number;
  aoComparar: () => void;
  aoLimpar: () => void;
}

/** "2 selecionados (1 oculto pelos filtros)", no singular quando é 1. */
function textoContagem(total: number, ocultos: number, t: ReturnType<typeof useTranslation>["t"]): string {
  if (total === 0) return "";
  const base = t(total === 1 ? "businessGoals.selection.countOne" : "businessGoals.selection.count", { count: total });
  if (ocultos === 0) return base;
  const hidden = t(ocultos === 1 ? "businessGoals.selection.hiddenOne" : "businessGoals.selection.hidden", { count: ocultos });
  return t("businessGoals.selection.withHidden", { base, hidden });
}

/** O link que salta para a barra de seleção (só aparece com o foco, antes do quadro). */
export function LinkIrParaSelecao() {
  const { t } = useTranslation();
  return (
    <a
      href={`#${ID_BARRA_SELECAO}`}
      className={`sr-only rounded-md focus:not-sr-only focus:inline-block focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:underline ${FOCO}`}
      onClick={(e) => { e.preventDefault(); document.getElementById(ID_BARRA_SELECAO)?.focus(); }}
    >
      {t("businessGoals.selection.jump")}
    </a>
  );
}

/**
 * Barra fixa em baixo enquanto há negócios selecionados: "2 selecionados · Comparar ·
 * Limpar". A região viva (`role="status"`, só para leitores de ecrã) está sempre montada,
 * para as mudanças serem anunciadas desde a primeira seleção. A recusa do 4.º negócio vai
 * num `role="alert"` com `key` por tentativa. Comparar precisa de pelo menos 2.
 */
export function BarraSelecao(p: BarraSelecaoProps) {
  const { t } = useTranslation();
  const idDica = useId();
  const dica = t("businessGoals.selection.minHint");
  const poucos = p.total < 2;
  const contagem = textoContagem(p.total, p.ocultos, t);
  return (
    <>
      <p role="status" className="sr-only">
        <span key={p.dicaVez}>{p.dicaVez > 0 && poucos ? dica : contagem}</span>
      </p>
      {p.total > 0 && (
        <div
          id={ID_BARRA_SELECAO} role="region" tabIndex={-1} aria-label={t("businessGoals.selection.region")}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 py-3 shadow-lg sm:px-6 focus:outline-none"
        >
          <div className="mx-auto flex max-w-[1536px] flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm font-medium text-foreground tabular-nums">{contagem}</p>
            <div role="alert">
              {p.recusado && (
                <span key={p.tentativas} className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  {t("businessGoals.selection.max")}
                </span>
              )}
            </div>
            {poucos && <p id={idDica} className="text-sm text-muted-foreground">{dica}</p>}
            <div className="ml-auto flex gap-2">
              <Button
                type="button" className={`min-h-11 gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCO}`}
                aria-disabled={poucos} aria-describedby={poucos ? idDica : undefined}
                onClick={() => { if (!poucos) p.aoComparar(); }}
              >
                <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
                {t("businessGoals.selection.compare")}
              </Button>
              <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={p.aoLimpar}>
                {t("businessGoals.selection.clear")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
