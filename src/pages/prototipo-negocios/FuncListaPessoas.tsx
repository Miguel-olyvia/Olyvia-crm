// O separador Lista da V2 funcional de Pessoas: por baixo da barra de filtros de sempre (ListaTopo), as vistas rápidas com contagem,
// o menu das colunas, "Exportar lista (CSV)", a barra da seleção (que só aparece com pessoas escolhidas) e a tabela funcional.
import { Columns3, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import type { SeparadorLista } from "./pessoasDocs";
import type { FiltrosP } from "./filtrosPessoas";
import { BORDA_CTRL } from "./PessoaLinha";
import { CHIP, classePortal } from "./FiltrosPopover";
import { DicaAtalhos } from "./FuncGrupo";
import { TabelaFunc, type TabelaFuncProps } from "./FuncTabela";
import { COLUNAS_OPCIONAIS, VISTAS_P, contarVista, type ColunaOpcional, type LinhaFunc, type VistaP } from "./funcLista";
import { SEM_ATALHOS } from "./useAtalhos";

export interface ListaFuncProps extends Omit<TabelaFuncProps, "linhas" | "escolherTodas"> {
  S: Estado;
  todas: readonly LinhaFunc[];
  visiveis: readonly LinhaFunc[];
  aba: SeparadorLista;
  f: FiltrosP;
  vista: VistaP | null;
  setVista: (v: VistaP | null) => void;
  setColunas: (c: ColunaOpcional) => void;
  limparSelecao: () => void;
  exportar: (quais: "lista" | "selecao") => void;
  limparFiltros: () => void;
  ajuda: () => void;
}

const BOTAO = cn("min-h-11 cursor-pointer gap-2 text-[15px]", BORDA_CTRL);

function Vistas({ todas, aba, f, vista, setVista }: Pick<ListaFuncProps, "todas" | "aba" | "f" | "vista" | "setVista">) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Vistas rápidas">
      {VISTAS_P.map((v) => (
        <button key={v.id} type="button" aria-pressed={vista === v.id} onClick={() => setVista(vista === v.id ? null : v.id)} className={CHIP(vista === v.id)}>
          {v.nome} <span className="tabular-nums opacity-70">{contarVista(todas, aba, f, v.id)}</span>
        </button>
      ))}
    </div>
  );
}

function Colunas({ colunas, setColunas, leitura }: Pick<ListaFuncProps, "colunas" | "setColunas" | "leitura">) {
  return (
    <Popover>
      <PopoverTrigger asChild><Button type="button" variant="outline" className={BOTAO}><Columns3 className="h-4 w-4" aria-hidden="true" />Colunas</Button></PopoverTrigger>
      <PopoverContent align="end" className={cn("w-64 p-3", classePortal(leitura))} {...{ [SEM_ATALHOS]: "" }}>
        <fieldset className="grid gap-0.5">
          <legend className="mb-1 text-[15px] font-semibold">Colunas a mostrar</legend>
          {COLUNAS_OPCIONAIS.map((c) => (
            <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 text-[15px] hover:bg-muted">
              <input type="checkbox" checked={colunas.includes(c.id)} onChange={() => setColunas(c.id)} className="h-5 w-5 accent-foreground" />{c.nome}
            </label>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

function BarraSelecao({ n, exportar, limpar }: { n: number; exportar: () => void; limpar: () => void }) {
  return (
    <div role="region" aria-label="Pessoas escolhidas" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-1.5">
      <p className="text-[15px] font-medium tabular-nums">{n === 1 ? "1 selecionada" : `${n} selecionadas`}</p>
      <Button type="button" variant="outline" className={BOTAO} onClick={exportar}><Download className="h-4 w-4" aria-hidden="true" />Exportar selecionadas (CSV)</Button>
      <Button type="button" variant="outline" className={BOTAO} onClick={limpar}><X className="h-4 w-4" aria-hidden="true" />Limpar seleção</Button>
    </div>
  );
}

export function ListaFuncPessoas(props: ListaFuncProps) {
  const { visiveis, selecionadas, escolher, exportar, limparSelecao, limparFiltros, ajuda } = props;
  const escolherTodas = (sim: boolean): void => { for (const l of visiveis) escolher(l.p.nome, sim); };
  return (
    <div className="grid gap-2 pb-24 pt-2 lg:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        <Vistas {...props} />
        <div className="flex flex-wrap items-center gap-2">
          <Colunas {...props} />
          <Button type="button" variant="outline" className={BOTAO} onClick={() => exportar("lista")} disabled={!visiveis.length}><Download className="h-4 w-4" aria-hidden="true" />Exportar lista (CSV)</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4">
        {selecionadas.size > 0 ? <BarraSelecao n={selecionadas.size} exportar={() => exportar("selecao")} limpar={limparSelecao} /> : <span />}
        <DicaAtalhos abrir={ajuda} />
      </div>
      {visiveis.length === 0 ? (
        <div className="m-4 grid gap-2 border-t border-border pt-4">
          <p className="text-base font-medium">Nenhuma pessoa com este filtro.</p>
          <div><Button type="button" variant="outline" className={BOTAO} onClick={limparFiltros}>Limpar filtros</Button></div>
        </div>
      ) : <TabelaFunc {...props} linhas={visiveis} escolherTodas={escolherTodas} />}
    </div>
  );
}
