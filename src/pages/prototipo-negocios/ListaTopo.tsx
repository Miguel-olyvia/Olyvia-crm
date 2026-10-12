// A barra de filtros da página Pessoas. ListaTopo (única e partilhada pelo dashboard e pela lista): pesquisa, Leads, Clientes e Todos com as contagens, o botão Filtros, os chips rápidos,
// os filtros ativos (chips removíveis, com Limpar tudo) e o contador de resultados (aria-live). Tudo o que se filtra aqui vale para a lista e para o dashboard.
import { Search } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SEPARADORES_LISTA, type Ordem, type SeparadorLista } from "./pessoasDocs";
import {
  alternarChip, chipAtivo, chipsAtivos, chipsRapidos, contagensP, contarChip, efetivos, SEM_FILTROS_P, type ChipRapido, type FiltrosP, type LinhaP,
} from "./filtrosPessoas";
import { BORDA_CTRL } from "./PessoaLinha";
import { CHIP } from "./FiltrosPopover";
import { PessoasFiltros } from "./PessoasFiltros";
import { ChipsFiltros } from "./ChipsFiltros";

export { classePortal } from "./FiltrosPopover";

export type Vista = "dashboard" | "lista";

/** O que se anuncia a quem usa leitor de ecrã (e se mostra) quando a pesquisa ou os filtros mudam o número de resultados. */
export const contagemTexto = (n: number): string => (n === 0 ? "Nenhuma pessoa" : n === 1 ? "1 pessoa" : `${n} pessoas`);

const TAB = "h-11 min-w-11 cursor-pointer rounded-none px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background";

export interface TopoProps {
  linhas: readonly LinhaP[];
  aba: SeparadorLista;
  f: FiltrosP;
  setF: (v: Partial<FiltrosP>) => void;
  ordem: Ordem;
  setOrdem: (v: Ordem) => void;
  /** Quantas pessoas passam nos filtros (o que a lista e o dashboard mostram). */
  total: number;
  leitura: boolean;
  pesquisa: React.RefObject<HTMLInputElement>;
}

function Pesquisa({ f, setF, pesquisa }: Pick<TopoProps, "f" | "setF" | "pesquisa">) {
  return (
    <label className="relative block min-w-0 basis-full sm:basis-80">
      <span className="sr-only">Procurar por nome, telefone, serviço ou localidade</span>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input ref={pesquisa} type="search" placeholder="Procurar nome, telefone ou serviço" value={f.q} onChange={(e) => setF({ q: e.target.value })}
        className={cn("h-11 w-full rounded-lg border bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25", BORDA_CTRL)} />
    </label>
  );
}

/** Os chips rápidos: Todas, Por contactar, Atrasadas, Perdidas (cada um com quantas pessoas dá) e Só as minhas. */
function ChipsRapidos({ linhas, aba, f, setF }: Pick<TopoProps, "linhas" | "aba" | "f" | "setF">) {
  const ef = efetivos(aba, f);
  return (
    <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Mostrar">
      {chipsRapidos(aba).map(({ id, nome }: { id: ChipRapido; nome: string }) => (
        <button key={id} type="button" aria-pressed={chipAtivo(ef, id)} onClick={() => setF(alternarChip(f, id))} className={CHIP(chipAtivo(ef, id))}>
          {nome} <span className="tabular-nums opacity-70">{contarChip(linhas, aba, f, id)}</span>
        </button>
      ))}
      <button type="button" aria-pressed={f.soMinhas} onClick={() => setF({ soMinhas: !f.soMinhas })} className={CHIP(f.soMinhas)}>Só as minhas</button>
    </div>
  );
}

export function ListaTopo(props: TopoProps) {
  const { linhas, aba, f, setF, total, pesquisa } = props;
  const porAba = contagensP(linhas, f.q);
  const chips = chipsAtivos(efetivos(aba, f)).map((c) => ({ id: c.id, texto: c.texto, remover: () => setF(c.limpar) }));
  return (
    <div className="border-b border-border bg-background px-4 pb-2 lg:sticky lg:top-0 lg:z-20">
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Pesquisa f={f} setF={setF} pesquisa={pesquisa} />
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-1">
          <TabsList aria-label="Tipo de pessoa" className="abas-inv h-11 gap-0 overflow-hidden p-0">
            {SEPARADORES_LISTA.map(({ id, nome }) => (
              <TabsTrigger key={id} value={id} className={TAB}>{nome}<span className="ml-1.5 tabular-nums opacity-70">{porAba[id]}</span></TabsTrigger>
            ))}
          </TabsList>
          <PessoasFiltros {...props} />
        </div>
      </div>
      <ChipsRapidos linhas={linhas} aba={aba} f={f} setF={setF} />
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ChipsFiltros chips={chips} limparTudo={() => setF({ ...SEM_FILTROS_P })} />
        <p role="status" aria-live="polite" aria-atomic="true" className="text-[15px] tabular-nums text-muted-foreground">{contagemTexto(total)}</p>
      </div>
    </div>
  );
}
