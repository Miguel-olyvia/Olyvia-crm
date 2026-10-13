import { useId, type RefObject } from "react";
import { Check, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO, chip } from "@/components/negocio-metas/estilos";
import { AjudaAtalhosPessoas } from "./AjudaAtalhosPessoas";
import { CHIPS, ORDENS } from "./filtrosPessoas";
import type { ChipPessoa, OrdemPessoa } from "./pessoasTipos";

interface BarraPessoasProps {
  chipAtivo: ChipPessoa;
  contagens: Record<ChipPessoa, number>;
  pesquisa: string;
  ordem: OrdemPessoa;
  /** Mostrar o chip "Voltou a contactar" (só com permissão para ver submissões). */
  comVoltou: boolean;
  pesquisaRef: RefObject<HTMLInputElement>;
  ajudaAberta: boolean;
  aoMudarAjuda: (aberta: boolean) => void;
  aoMudarChip: (chip: ChipPessoa) => void;
  aoMudarPesquisa: (texto: string) => void;
  aoMudarOrdem: (ordem: OrdemPessoa) => void;
}

/** Pesquisa, ordenação e ajuda de atalhos, numa linha. */
function LinhaPesquisa(p: BarraPessoasProps) {
  const { t } = useTranslation();
  const idPesquisa = useId();
  const idOrdem = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="relative min-w-56 flex-1">
        <label htmlFor={idPesquisa} className="sr-only">{t("pessoasPagina.search.label")}</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={idPesquisa} ref={p.pesquisaRef} type="search" value={p.pesquisa} autoComplete="off"
          placeholder={t("pessoasPagina.search.placeholder")} className={`h-11 pl-9 ${FOCO}`}
          onChange={(e) => p.aoMudarPesquisa(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={idOrdem} className="text-sm font-medium text-foreground">{t("pessoasPagina.sort.label")}</label>
        <NativeSelect
          id={idOrdem} value={p.ordem} onValueChange={(v) => p.aoMudarOrdem(v as OrdemPessoa)}
          options={ORDENS.map((o) => ({ value: o, label: t(`pessoasPagina.sort.${o}`) }))}
          className={`h-11 w-48 ${FOCO}`}
        />
      </div>
      <AjudaAtalhosPessoas aberta={p.ajudaAberta} aoMudar={p.aoMudarAjuda} />
    </div>
  );
}

/** Os chips com contagem: um só ativo de cada vez, marcado com ✓ além da cor. */
function Chips({ chipAtivo, contagens, comVoltou, aoMudarChip }: BarraPessoasProps) {
  const { t } = useTranslation();
  const visiveis = CHIPS.filter((c) => comVoltou || c !== "voltou");
  return (
    <div
      role="group" aria-label={t("pessoasPagina.chips.label")}
      className="-mx-4 -my-1.5 flex gap-2 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      {visiveis.map((c) => (
        <button key={c} type="button" aria-pressed={chipAtivo === c} className={chip(chipAtivo === c)} onClick={() => aoMudarChip(c)}>
          {chipAtivo === c && <Check className="h-4 w-4" aria-hidden="true" />}
          {t(`pessoasPagina.chip.${c}`)} <span className="tabular-nums">{contagens[c]}</span>
        </button>
      ))}
    </div>
  );
}

export function BarraPessoas(props: BarraPessoasProps) {
  return (
    <div className="space-y-3">
      <LinhaPesquisa {...props} />
      <Chips {...props} />
    </div>
  );
}
