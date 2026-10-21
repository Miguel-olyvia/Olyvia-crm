import { useId } from "react";
import { Check, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FOCO, chip } from "@/components/negocio-metas/estilos";
import type { EtapaPessoa, PapelPessoa, VistaPessoas } from "@/components/pessoas/pessoasTipos";
import { SeletorVista } from "@/components/pessoas/quadro/SeletorVista";
import { MIN_PESQUISA, type OrdemLista } from "@/hooks/pessoas/listaPessoasTipos";

const R = "pessoasPagina.real.";

const TIPOS: readonly { papel: PapelPessoa | null; chave: string }[] = [
  { papel: null, chave: "todos" }, { papel: "lead", chave: "leads" }, { papel: "cliente", chave: "clientes" },
];
// Os chips são as etapas ATUAIS do protótipo (Por contactar, Contacto, Visita, Negócio) e filtram pela etapa exata. «Cliente» não é uma
// etapa: é o papel, e filtra-se com o interruptor Todos, Leads e Clientes.
const CHIP_DA_ETAPA: Partial<Record<EtapaPessoa, string>> = {
  nova: "pessoasPagina.chip.porContactar", emContacto: "pessoasPagina.journey.step1",
  visitaMarcada: "pessoasPagina.journey.step2", qualificada: "pessoasPagina.journey.step3",
};
const ETAPAS = Object.keys(CHIP_DA_ETAPA) as readonly EtapaPessoa[];
const ORDENS: readonly OrdemLista[] = ["recentes", "nome"];

interface BarraListaRealProps {
  /** O que está escrito no campo (imediato; o atraso para a base fica em useFiltrosLista). */
  pesquisa: string;
  papel: PapelPessoa | null;
  etapa: EtapaPessoa | null;
  ordem: OrdemLista;
  aoMudarPesquisa: (pesquisa: string) => void;
  aoMudarPapel: (papel: PapelPessoa | null) => void;
  aoMudarEtapa: (etapa: EtapaPessoa | null) => void;
  aoMudarOrdem: (ordem: OrdemLista) => void;
  /** A vista atual; só conta com `aoMudarVista`. No Quadro os filtros de etapa não se mostram (o Quadro ignora a etapa). */
  vista?: VistaPessoas;
  /** Só em modo real e com `pessoas.view`: sem isto não há seletor de vista (a Lista de sempre). */
  aoMudarVista?: (vista: VistaPessoas) => void;
  /** Em modo real, o texto do filtro da primeira etapa («Novo»); sem isto mantém «Por contactar». */
  etapaNova?: string;
}

function Marca({ ativo }: { ativo: boolean }) {
  return ativo ? <Check className="h-4 w-4" aria-hidden="true" /> : null;
}

/** Pesquisa só por nome, tipo, etapa e ordem. O ativo leva ✓ além da cor. */
export function BarraListaReal(p: BarraListaRealProps) {
  const { t } = useTranslation();
  const idPesquisa = useId();
  const idDica = useId();
  const idOrdem = useId();
  const destacada = p.pesquisa.trim().length > 0 && p.pesquisa.trim().length < MIN_PESQUISA;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative min-w-56 flex-1">
          <label htmlFor={idPesquisa} className="sr-only">{t(`${R}searchLabel`)}</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={idPesquisa} type="search" value={p.pesquisa} autoComplete="off" placeholder={t(`${R}searchPlaceholder`)}
            aria-describedby={idDica} className={`h-11 pl-9 ${FOCO}`}
            onChange={(e) => p.aoMudarPesquisa(e.target.value)}
          />
        </div>
        {p.aoMudarVista && <SeletorVista vista={p.vista ?? "lista"} aoMudar={p.aoMudarVista} />}
        <div role="group" aria-label={t("pessoasPagina.kind.label")} className="inline-flex rounded-lg border border-input bg-card p-0.5">
          {TIPOS.map(({ papel, chave }) => (
            <button
              key={chave} type="button" aria-pressed={p.papel === papel} onClick={() => p.aoMudarPapel(papel)}
              className={cn(
                "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm motion-reduce:transition-none", FOCO,
                p.papel === papel ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-accent",
              )}
            >
              <Marca ativo={p.papel === papel} />
              {t(`pessoasPagina.kind.${chave}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={idOrdem} className="text-sm text-muted-foreground">{t(`${R}orderLabel`)}</label>
          <select
            id={idOrdem} value={p.ordem} onChange={(e) => p.aoMudarOrdem(e.target.value as OrdemLista)}
            className={cn("h-11 rounded-md border border-input bg-card px-3 text-sm", FOCO)}
          >
            {ORDENS.map((o) => <option key={o} value={o}>{t(`${R}order.${o}`)}</option>)}
          </select>
        </div>
      </div>
      <p
        id={idDica} data-destacada={destacada ? "true" : undefined}
        className={cn("text-sm", destacada ? "font-medium text-foreground" : "text-muted-foreground")}
      >
        {t(`${R}searchHint`)}
      </p>
      {!(p.aoMudarVista && p.vista === "quadro") && (
        <div role="group" aria-label={t(`${R}stageFilterLabel`)} className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={p.etapa === null} className={chip(p.etapa === null)} onClick={() => p.aoMudarEtapa(null)}>
            <Marca ativo={p.etapa === null} />
            {t("pessoasPagina.chip.todas")}
          </button>
          {ETAPAS.map((e) => (
            <button key={e} type="button" aria-pressed={p.etapa === e} className={chip(p.etapa === e)} onClick={() => p.aoMudarEtapa(e)}>
              <Marca ativo={p.etapa === e} />
              {e === "nova" && p.etapaNova ? p.etapaNova : t(CHIP_DA_ETAPA[e] ?? "")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
