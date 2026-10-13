import type { KeyboardEvent, RefObject } from "react";
import { Check, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Input } from "@/components/ui/input";
import { AjudaAtalhos } from "./AjudaAtalhos";
import { ChipsAtivos } from "./ChipsAtivos";
import { ChipsFase } from "./ChipsFase";
import { FiltrosQuadroPopover } from "./FiltrosQuadroPopover";
import { SeletorOrdem } from "./SeletorOrdem";
import { FOCO, chip } from "./estilos";
import type { ChipFase, ChipParaTratar, FiltrosQuadro } from "./logicaQuadro";
import type { FaseNegocio } from "./negocioMetas";
import type { Ordem } from "./ordenacaoQuadro";

interface BarraQuadroProps {
  filtros: FiltrosQuadro;
  comerciais: string[];
  servicos: string[];
  chipsFase: ChipFase[];
  chipParaTratar: ChipParaTratar;
  ordem: Ordem | null;
  total: number;
  pesquisaRef: RefObject<HTMLInputElement>;
  ajudaAberta: boolean;
  aoMudarAjuda: (aberta: boolean) => void;
  aoMudarFiltros: (parcial: Partial<FiltrosQuadro>) => void;
  aoAlternarFase: (fase: FaseNegocio) => void;
  aoAlternarParaTratar: () => void;
  aoMudarOrdem: (ordem: Ordem | null) => void;
  /** Enter ou seta para baixo na pesquisa levam o foco ao primeiro cartão (ou linha). */
  aoFocarPrimeiro: () => void;
  aoLimparTudo: () => void;
}

/** "Os meus | Todos": dois botões de alternância; o ativo ganha uma marca (✓). */
function EscopoMeus({ meus, aoMudar }: { meus: boolean; aoMudar: (meus: boolean) => void }) {
  const { t } = useTranslation();
  const opcoes = [
    { meus: true, chave: "businessGoals.scope.mine" },
    { meus: false, chave: "businessGoals.scope.all" },
  ] as const;
  return (
    <div role="group" aria-label={t("businessGoals.scope.label")} className="flex gap-2">
      {opcoes.map((e) => (
        <button
          key={e.chave} type="button" aria-pressed={meus === e.meus} className={chip(meus === e.meus)}
          onClick={() => aoMudar(e.meus)}
        >
          {meus === e.meus && <Check className="h-4 w-4" aria-hidden="true" />}
          {t(e.chave)}
        </button>
      ))}
    </div>
  );
}

/**
 * Primeira linha: pesquisa, Os meus | Todos, Filtros, Ordenar e atalhos (quebra por
 * inteiro, nunca a meio). Segunda: chips de fase e "Para tratar" (rolam no
 * telemóvel). Terceira: filtros ativos e o número de negócios.
 */
export function BarraQuadro(p: BarraQuadroProps) {
  const { t } = useTranslation();
  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && p.filtros.q) {
      e.preventDefault();
      p.aoMudarFiltros({ q: "" });
    } else if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      p.aoFocarPrimeiro();
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="relative min-w-52 flex-1 sm:max-w-80">
          <span className="sr-only">{t("businessGoals.search.label")}</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={p.pesquisaRef} type="search" value={p.filtros.q}
            onChange={(e) => p.aoMudarFiltros({ q: e.target.value })}
            onKeyDown={aoTeclar}
            placeholder={t("businessGoals.search.placeholder")}
            className={`h-11 pl-9 ${FOCO}`}
          />
        </label>
        <EscopoMeus meus={p.filtros.meus} aoMudar={(meus) => p.aoMudarFiltros({ meus })} />
        <FiltrosQuadroPopover
          filtros={p.filtros} comerciais={p.comerciais} servicos={p.servicos} aoMudarFiltros={p.aoMudarFiltros}
        />
        <SeletorOrdem ordem={p.ordem} aoMudar={p.aoMudarOrdem} />
        <div className="ml-auto">
          <AjudaAtalhos aberta={p.ajudaAberta} aoMudar={p.aoMudarAjuda} />
        </div>
      </div>
      <ChipsFase
        fases={p.chipsFase} paraTratar={p.chipParaTratar}
        aoAlternarFase={p.aoAlternarFase} aoAlternarParaTratar={p.aoAlternarParaTratar}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ChipsAtivos filtros={p.filtros} aoMudarFiltros={p.aoMudarFiltros} aoLimparTudo={p.aoLimparTudo} />
        <p role="status" aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
          {p.total === 1 ? t("businessGoals.countOne") : t("businessGoals.count", { count: p.total })}
        </p>
      </div>
    </div>
  );
}
