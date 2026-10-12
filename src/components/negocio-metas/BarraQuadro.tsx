import type { KeyboardEvent, RefObject } from "react";
import { Check, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Input } from "@/components/ui/input";
import { AjudaAtalhos } from "./AjudaAtalhos";
import { ChipsAtivos } from "./ChipsAtivos";
import { FiltrosQuadroPopover } from "./FiltrosQuadroPopover";
import { FOCO, chip } from "./estilos";
import type { FiltrosQuadro, VistaRapida } from "./logicaQuadro";

interface BarraQuadroProps {
  filtros: FiltrosQuadro;
  comerciais: string[];
  servicos: string[];
  vistas: VistaRapida[];
  total: number;
  pesquisaRef: RefObject<HTMLInputElement>;
  ajudaAberta: boolean;
  aoMudarAjuda: (aberta: boolean) => void;
  aoMudarFiltros: (parcial: Partial<FiltrosQuadro>) => void;
  aoAlternarVista: (id: VistaRapida["id"]) => void;
  aoLimparTudo: () => void;
}

/**
 * Primeira linha: pesquisa, Os meus | Todos, Filtros e atalhos (quebra por
 * inteiro, nunca a meio). Segunda: vistas rápidas com contagem (rolam no
 * telemóvel). Terceira: filtros ativos e o número de negócios.
 */
export function BarraQuadro(p: BarraQuadroProps) {
  const { t } = useTranslation();
  const limparComEsc = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && p.filtros.q) {
      e.preventDefault();
      p.aoMudarFiltros({ q: "" });
    }
  };
  const escopo = [
    { meus: true, chave: "businessGoals.scope.mine" },
    { meus: false, chave: "businessGoals.scope.all" },
  ] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="relative min-w-52 flex-1 sm:max-w-80">
          <span className="sr-only">{t("businessGoals.search.label")}</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={p.pesquisaRef}
            type="search"
            value={p.filtros.q}
            onChange={(e) => p.aoMudarFiltros({ q: e.target.value })}
            onKeyDown={limparComEsc}
            placeholder={t("businessGoals.search.placeholder")}
            className={`h-11 pl-9 ${FOCO}`}
          />
        </label>
        <div role="group" aria-label={t("businessGoals.scope.label")} className="flex gap-2">
          {escopo.map((e) => {
            const ativo = p.filtros.meus === e.meus;
            return (
              <button
                key={e.chave} type="button" aria-pressed={ativo} className={chip(ativo)}
                onClick={() => p.aoMudarFiltros({ meus: e.meus })}
              >
                {ativo && <Check className="h-4 w-4" aria-hidden="true" />}
                {t(e.chave)}
              </button>
            );
          })}
        </div>
        <FiltrosQuadroPopover
          filtros={p.filtros} comerciais={p.comerciais} servicos={p.servicos} aoMudarFiltros={p.aoMudarFiltros}
        />
        <div className="ml-auto">
          <AjudaAtalhos aberta={p.ajudaAberta} aoMudar={p.aoMudarAjuda} />
        </div>
      </div>
      <div
        role="group" aria-label={t("businessGoals.quick.label")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {p.vistas.map((v) => (
          <button
            key={v.id} type="button" aria-pressed={v.ativo} className={chip(v.ativo)}
            onClick={() => p.aoAlternarVista(v.id)}
          >
            {v.ativo && <Check className="h-4 w-4" aria-hidden="true" />}
            {t(`businessGoals.quick.${v.id}`)}
            <span className="tabular-nums opacity-80">{v.n}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ChipsAtivos filtros={p.filtros} aoMudarFiltros={p.aoMudarFiltros} aoLimparTudo={p.aoLimparTudo} />
        <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
          {p.total === 1 ? t("businessGoals.countOne") : t("businessGoals.count", { count: p.total })}
        </p>
      </div>
    </div>
  );
}
