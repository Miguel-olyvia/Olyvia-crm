// O cabeçalho da lista de Pessoas, em três faixas e fixo no topo: (1) título, Nova lead e pesquisa; (2) Leads, Clientes e Todos com
// as contagens e o botão Filtros (Ordenar, Origem, Comercial, Com visita); (3) uma fila de chips. Sem resumos nem faixa de números.
import { useId } from "react";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import {
  ORDENS, SEPARADORES_LISTA, chipsDe, comerciaisDe, contagens, filtrarPessoas, origensDe,
  type FiltrosPessoa, type Ordem, type PessoaApp, type SeparadorLista,
} from "./pessoasDocs";
import { BORDA_CTRL } from "./PessoaLinha";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const CHIP = (ativo: boolean): string =>
  cn("min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors duration-150 motion-reduce:transition-none", FOCO,
    ativo ? "border-foreground bg-foreground text-background" : cn(BORDA_CTRL, "bg-card hover:border-foreground"));
/** Os menus que abrem num portal ficam fora de .calma: levam as mesmas classes para herdar variáveis, fonte, leitura fácil e foco. */
export const classePortal = (leitura: boolean): string => cn("calma text-[15px] motion-reduce:!animate-none", leitura && "leitura pessoas-leitura");

export interface TopoProps {
  S: Estado;
  aba: SeparadorLista;
  /** Os filtros que de facto se aplicam (um chip que o separador não tem já voltou a "Todas"). */
  f: FiltrosPessoa;
  setF: (v: Partial<FiltrosPessoa>) => void;
  ordem: Ordem;
  setOrdem: (v: Ordem) => void;
  /** Todas as pessoas do separador, sem filtros: dão as contagens dos chips e as opções de origem e de comercial. */
  todas: PessoaApp[];
  novaLead: () => void;
  leitura: boolean;
  pesquisa: React.RefObject<HTMLInputElement>;
}

function Escolher({ rotulo, valor, aoMudar, todas, opcoes }: { rotulo: string; valor: string; aoMudar: (v: string) => void; todas: string; opcoes: string[] }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-[15px] text-muted-foreground">{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} className={cn("h-11 w-full cursor-pointer rounded-md border bg-card px-3 text-[15px]", BORDA_CTRL, FOCO)}>
        <option value="">{todas}</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/** O botão Filtros e o painel: Ordenar e os filtros extra (os chips ficam sempre à vista na faixa 3). */
function Filtros({ S, aba, f, setF, ordem, setOrdem, todas, leitura }: Omit<TopoProps, "novaLead" | "pesquisa">) {
  const ativos = Number(f.origem !== "") + Number(f.comercial !== "") + Number(f.filtro === "visita") + Number(ordem !== "urgencia");
  const contarVisita = filtrarPessoas(S, todas, { ...f, filtro: "visita" }).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Filtros{ativos > 0 && <span className="tabular-nums">({ativos})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn("grid w-[min(22rem,calc(100vw-2rem))] gap-4 p-4", classePortal(leitura))}>
        <div role="group" aria-label="Ordenar">
          <p className="text-[15px] text-muted-foreground">Ordenar</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {ORDENS.map((o) => <button key={o.id} type="button" aria-pressed={ordem === o.id} onClick={() => setOrdem(o.id)} className={CHIP(ordem === o.id)}>{o.nome}</button>)}
          </div>
        </div>
        <Escolher rotulo="Origem" valor={f.origem} aoMudar={(v) => setF({ origem: v })} todas="Todas as origens" opcoes={origensDe(S, todas)} />
        <Escolher rotulo="Comercial" valor={f.comercial} aoMudar={(v) => setF({ comercial: v })} todas="Todos os comerciais" opcoes={comerciaisDe(todas)} />
        {aba !== "clientes" && (
          <button type="button" aria-pressed={f.filtro === "visita"} onClick={() => setF({ filtro: f.filtro === "visita" ? "todas" : "visita" })} className={cn(CHIP(f.filtro === "visita"), "justify-self-start")}>
            Com visita <span className="tabular-nums opacity-70">{contarVisita}</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function ListaTopo(props: TopoProps) {
  const { S, aba, f, setF, todas, novaLead, pesquisa } = props;
  const porAba = contagens(S, f.q);
  const contar = (filtro: FiltrosPessoa["filtro"]) => filtrarPessoas(S, todas, { ...f, filtro }).length;
  return (
    <div className="border-b border-border bg-background px-4 pt-1 lg:sticky lg:top-0 lg:z-20">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pessoas</h1>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
          <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={novaLead}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead
          </Button>
          <label className="relative block min-w-0 basis-full sm:basis-80">
            <span className="sr-only">Procurar por nome, telefone, serviço ou localidade</span>
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input ref={pesquisa} type="search" placeholder="Procurar nome, telefone ou serviço" value={f.q} onChange={(e) => setF({ q: e.target.value })}
              className={cn("h-11 w-full rounded-lg border bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25", BORDA_CTRL)} />
          </label>
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <TabsList aria-label="Tipo de pessoa" className="h-11 gap-0 overflow-hidden p-0">
          {SEPARADORES_LISTA.map(({ id, nome }) => (
            <TabsTrigger key={id} value={id} className="h-11 min-w-11 cursor-pointer rounded-none px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background">
              {nome}<span className="ml-1.5 tabular-nums opacity-70">{porAba[id]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <Filtros {...props} />
      </div>
      <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Mostrar">
        {chipsDe(aba).map(({ id, nome }) => (
          <button key={id} type="button" aria-pressed={f.filtro === id} onClick={() => setF({ filtro: id })} className={CHIP(f.filtro === id)}>
            {nome} <span className="tabular-nums opacity-70">{contar(id)}</span>
          </button>
        ))}
        <button type="button" aria-pressed={f.soMinhas} onClick={() => setF({ soMinhas: !f.soMinhas })} className={CHIP(f.soMinhas)}>Só as minhas</button>
      </div>
    </div>
  );
}
