// A barra da lista de pessoas de RH: pesquisa, chips de filtro por acesso (cada um com o seu número; o ativo leva ✓ além
// da cor) e a contagem, dita em voz alta quando muda. Alvos de 44 px e anel de foco visível.
import { useId } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FILTROS, type FiltroAcesso } from "./filtros";

interface BarraListaRhProps {
  pesquisa: string;
  aoPesquisar: (valor: string) => void;
  filtro: FiltroAcesso;
  aoFiltrar: (filtro: FiltroAcesso) => void;
  contagens: Record<FiltroAcesso, number>;
  /** Quantas pessoas a lista mostra agora. */
  total: number;
}

const chip = (ativo: boolean): string =>
  cn(
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm motion-reduce:transition-none",
    FOCO,
    ativo ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40",
  );

export function BarraListaRh({ pesquisa, aoPesquisar, filtro, aoFiltrar, contagens, total }: BarraListaRhProps) {
  const { t } = useTranslation();
  const idPesquisa = useId();
  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <label htmlFor={idPesquisa} className="sr-only">{t("rhForm.lista.pesquisa")}</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={idPesquisa} type="search" value={pesquisa} autoComplete="off" placeholder={t("hr.pessoas.search")}
          className={cn("h-11 pl-9", FOCO)} onChange={(e) => aoPesquisar(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label={t("rhForm.lista.filtros")} className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} className={chip(filtro === f)} onClick={() => aoFiltrar(f)}>
              {filtro === f && <Check className="h-4 w-4" aria-hidden="true" />}
              {t(`rhForm.lista.filtro.${f}`)} <span className="tabular-nums">{contagens[f]}</span>
            </button>
          ))}
        </div>
        <p aria-live="polite" aria-atomic="true" className="text-sm tabular-nums text-muted-foreground">
          {t("rhForm.lista.contagem", { n: total })}
        </p>
      </div>
    </div>
  );
}
