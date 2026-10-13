import { useId, type RefObject } from "react";
import { Check, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FOCO, chip } from "@/components/negocio-metas/estilos";
import { AjudaAtalhosPessoas } from "./AjudaAtalhosPessoas";
import { PopoverFiltros, type OpcoesFiltros } from "./PopoverFiltros";
import { TIPOS, chipsDoTipo } from "./filtrosPessoas";
import type { ChipPessoa, FiltrosPessoas as Filtros, OrdemPessoa, TipoPessoa } from "./pessoasTipos";

export interface BarraPessoasProps {
  filtros: Filtros;
  ordem: OrdemPessoa;
  contagensTipo: Record<TipoPessoa, number>;
  contagensChip: Record<ChipPessoa, number>;
  total: number;
  opcoes: OpcoesFiltros;
  /** Mostrar o interruptor "Voltou a contactar" (só com permissão para ver submissões). */
  comVoltou: boolean;
  pesquisaRef: RefObject<HTMLInputElement>;
  ajudaAberta: boolean;
  aoMudarAjuda: (aberta: boolean) => void;
  aoMudar: (v: Partial<Filtros>) => void;
  aoMudarTipo: (tipo: TipoPessoa) => void;
  aoMudarChip: (chip: ChipPessoa) => void;
  aoMudarOrdem: (ordem: OrdemPessoa) => void;
  aoLimpar: () => void;
}

/** Leads, Clientes e Todos, cada um com o seu número: o escolhido leva ✓ além da cor. */
function SeletorTipo({ tipo, contagens, aoMudar }: { tipo: TipoPessoa; contagens: Record<TipoPessoa, number>; aoMudar: (t: TipoPessoa) => void }) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("pessoasPagina.kind.label")} className="inline-flex rounded-lg border border-input bg-card p-0.5">
      {TIPOS.map((k) => (
        <button
          key={k} type="button" aria-pressed={tipo === k} onClick={() => aoMudar(k)}
          className={cn(
            "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm motion-reduce:transition-none", FOCO,
            tipo === k ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-accent",
          )}
        >
          {tipo === k && <Check className="h-4 w-4" aria-hidden="true" />}
          {t(`pessoasPagina.kind.${k}`)} <span className="tabular-nums">{contagens[k]}</span>
        </button>
      ))}
    </div>
  );
}

/** Pesquisa, seletor de tipo, filtros e ajuda de atalhos, numa linha. */
function LinhaPesquisa(p: BarraPessoasProps) {
  const { t } = useTranslation();
  const idPesquisa = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="relative min-w-56 flex-1">
        <label htmlFor={idPesquisa} className="sr-only">{t("pessoasPagina.search.label")}</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={idPesquisa} ref={p.pesquisaRef} type="search" value={p.filtros.pesquisa} autoComplete="off"
          placeholder={t("pessoasPagina.search.placeholder")} className={`h-11 pl-9 ${FOCO}`}
          onChange={(e) => p.aoMudar({ pesquisa: e.target.value })}
        />
      </div>
      <SeletorTipo tipo={p.filtros.tipo} contagens={p.contagensTipo} aoMudar={p.aoMudarTipo} />
      <PopoverFiltros
        filtros={p.filtros} ordem={p.ordem} opcoes={p.opcoes} comVoltou={p.comVoltou} aoMudar={p.aoMudar}
        aoMudarChip={p.aoMudarChip} aoMudarOrdem={p.aoMudarOrdem} aoLimpar={p.aoLimpar}
      />
      <AjudaAtalhosPessoas aberta={p.ajudaAberta} aoMudar={p.aoMudarAjuda} />
    </div>
  );
}

/** Os chips do tipo escolhido, com número, e o botão "Só as minhas" (sem número); o ativo leva ✓ além da cor. */
function Chips({ filtros, contagensChip, aoMudarChip, aoMudar }: BarraPessoasProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group" aria-label={t("pessoasPagina.chips.label")}
      className="-mx-4 -my-1.5 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {chipsDoTipo(filtros.tipo).map((c) => (
        <button key={c} type="button" aria-pressed={filtros.chip === c} className={chip(filtros.chip === c)} onClick={() => aoMudarChip(c)}>
          {filtros.chip === c && <Check className="h-4 w-4" aria-hidden="true" />}
          {t(`pessoasPagina.chip.${c}`)} <span className="tabular-nums">{contagensChip[c]}</span>
        </button>
      ))}
      <button type="button" aria-pressed={filtros.soMinhas} className={chip(filtros.soMinhas)} onClick={() => aoMudar({ soMinhas: !filtros.soMinhas })}>
        {filtros.soMinhas && <Check className="h-4 w-4" aria-hidden="true" />}
        {t("pessoasPagina.chip.mine")}
      </button>
    </div>
  );
}

export function BarraPessoas(props: BarraPessoasProps) {
  const { t } = useTranslation();
  const { total } = props;
  const texto = total === 0 ? t("pessoasPagina.count.none") : total === 1 ? t("pessoasPagina.count.one") : t("pessoasPagina.count.many", { count: total });
  return (
    <div className="space-y-3">
      <LinhaPesquisa {...props} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Chips {...props} />
        <p aria-live="polite" aria-atomic="true" className="text-sm tabular-nums text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
