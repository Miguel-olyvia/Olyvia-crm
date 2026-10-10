// A lista de Pessoas (coluna da esquerda no computador): resumo do separador, pesquisa, separadores, filtros e linhas.
import { useRef, useState } from "react";
import { ChevronDown, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import {
  ORDENS, SEM_FILTROS, SEPARADORES_LISTA, chipsDe, comerciaisDe, contagens, filtrarPessoas, filtrosEfetivos, listaVisivel, origensDe, pessoasDoSeparador,
  type FiltrosPessoa, type Ordem, type PessoaApp, type SeparadorLista,
} from "./pessoasDocs";
import { BORDA_CTRL, LinhaPessoa } from "./PessoaLinha";
import { LinhaResumo } from "./PessoaResumo";

const CHIP = (ativo: boolean): string =>
  cn("min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    ativo ? "border-foreground bg-foreground text-background" : cn(BORDA_CTRL, "bg-card hover:border-foreground"));
const TUDO = "todos";
/** O menu do Select abre num portal fora de .calma: leva as mesmas classes para herdar variáveis, fonte, leitura fácil e foco. */
const classePortal = (leitura: boolean): string => cn("calma text-[15px] motion-reduce:!animate-none", leitura && "leitura pessoas-leitura");

function Escolher({ rotulo, valor, aoMudar, opcoes, todas, leitura }: { rotulo: string; valor: string; aoMudar: (v: string) => void; opcoes: { id: string; nome: string }[]; todas?: string; leitura: boolean }) {
  const id = `pessoas-sel-${rotulo.toLowerCase()}`;
  return (
    <div className="min-w-0">
      <span id={id} className="block text-[15px] text-muted-foreground">{rotulo}</span>
      <Select value={valor || TUDO} onValueChange={(v) => aoMudar(v === TUDO ? "" : v)}>
        <SelectTrigger aria-labelledby={id} className={cn("h-11 cursor-pointer text-[15px]", BORDA_CTRL)}><SelectValue /></SelectTrigger>
        <SelectContent className={classePortal(leitura)}>
          {todas && <SelectItem value={TUDO} className="min-h-11 text-[15px]">{todas}</SelectItem>}
          {opcoes.map((o) => <SelectItem key={o.id} value={o.id} className="min-h-11 text-[15px]">{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface ListaProps {
  S: Estado;
  aba: SeparadorLista;
  setAba: (v: SeparadorLista) => void;
  f: FiltrosPessoa;
  setF: (v: Partial<FiltrosPessoa>) => void;
  ordem: Ordem;
  setOrdem: (v: Ordem) => void;
  sel: string | null;
  abrir: (nome: string) => void;
  novaLead: () => void;
  /** Leitura fácil ativa: o menu dos Select, que abre num portal, também a aplica. */
  leitura: boolean;
}

/** "Ordenar: Urgência": o rótulo dentro do seletor, para ocupar uma só linha com "Mais filtros". */
function Ordenar({ ordem, setOrdem, leitura }: { ordem: Ordem; setOrdem: (v: Ordem) => void; leitura: boolean }) {
  return (
    <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
      <SelectTrigger className={cn("h-11 min-w-0 cursor-pointer text-[15px]", BORDA_CTRL)}>
        <span className="flex min-w-0 gap-1.5"><span className="text-muted-foreground">Ordenar:</span><SelectValue /></span>
      </SelectTrigger>
      <SelectContent className={classePortal(leitura)}>
        {ORDENS.map((o) => <SelectItem key={o.id} value={o.id} className="min-h-11 text-[15px]">{o.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Filtros({ S, aba, f, setF, ordem, setOrdem, todas, leitura }: Pick<ListaProps, "S" | "aba" | "f" | "setF" | "ordem" | "setOrdem" | "leitura"> & { todas: PessoaApp[] }) {
  const ativos = Number(f.origem !== "") + Number(f.comercial !== "") + Number(f.filtro === "visita");
  const [mais, setMais] = useState(ativos > 0);
  const contar = (filtro: FiltrosPessoa["filtro"]) => filtrarPessoas(S, todas, { ...f, filtro }).length;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 px-4 pt-2">
      {/* Uma só fila; se não couber, tem scroll dentro do contentor e a página não se mexe. */}
      <div className="-mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 py-0.5" role="group" aria-label="Mostrar">
        {chipsDe(aba).map(({ id, nome }) => (
          <button key={id} type="button" aria-pressed={f.filtro === id} onClick={() => setF({ filtro: id })} className={CHIP(f.filtro === id)}>
            {nome} <span className="tabular-nums opacity-70">{contar(id)}</span>
          </button>
        ))}
        <button type="button" aria-pressed={f.soMinhas} onClick={() => setF({ soMinhas: !f.soMinhas })} className={CHIP(f.soMinhas)}>Só as minhas</button>
      </div>
      <Collapsible open={mais} onOpenChange={setMais}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <Ordenar ordem={ordem} setOrdem={setOrdem} leitura={leitura} />
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Mais filtros{ativos > 0 && <span className="tabular-nums">({ativos})</span>}
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 motion-reduce:transition-none", mais && "rotate-180")} aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {aba !== "clientes" && (
            <div className="sm:col-span-2">
              <button type="button" aria-pressed={f.filtro === "visita"} onClick={() => setF({ filtro: f.filtro === "visita" ? "todas" : "visita" })} className={CHIP(f.filtro === "visita")}>
                Com visita <span className="tabular-nums opacity-70">{contar("visita")}</span>
              </button>
            </div>
          )}
          <Escolher rotulo="Origem" valor={f.origem} aoMudar={(v) => setF({ origem: v })} todas="Todas as origens" leitura={leitura} opcoes={origensDe(S, todas).map((o) => ({ id: o, nome: o }))} />
          <Escolher rotulo="Comercial" valor={f.comercial} aoMudar={(v) => setF({ comercial: v })} todas="Todos os comerciais" leitura={leitura} opcoes={comerciaisDe(todas).map((o) => ({ id: o, nome: o }))} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const PLURAL: Record<SeparadorLista, string> = { leads: "leads", clientes: "clientes", todos: "pessoas" };

/** O separador está mesmo vazio (sem pessoas nesse papel): não há filtros para limpar. */
function SeparadorVazio({ aba }: { aba: SeparadorLista }) {
  return (
    <div className="m-4 grid gap-2 border-t border-border pt-4">
      <p className="text-base font-medium">Ainda não há {PLURAL[aba]}.</p>
      <p className="text-[15px] text-muted-foreground">Quando houver, aparecem aqui.</p>
    </div>
  );
}

/** Há pessoas, mas nenhuma passa os filtros ou a pesquisa. */
function SemResultados({ limpar, pesquisa }: { limpar: () => void; pesquisa: boolean }) {
  return (
    <div className="m-4 grid gap-2 border-t border-border pt-4">
      <p className="text-base font-medium">Nenhuma pessoa com este filtro.</p>
      <p className="text-[15px] text-muted-foreground">{pesquisa ? "Experimenta só o nome ou a localidade, sem acentos." : "Experimenta tirar um filtro ou mudar de separador."}</p>
      <div><Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={limpar}>Limpar filtros</Button></div>
    </div>
  );
}

/** O que se anuncia a quem usa leitor de ecrã quando a pesquisa ou os filtros mudam o número de resultados. */
export const contagemTexto = (n: number): string => (n === 0 ? "Nenhuma pessoa" : n === 1 ? "1 pessoa" : `${n} pessoas`);

export function PessoaLista(props: ListaProps) {
  const { S, aba, setAba, f, setF, ordem, sel, abrir, novaLead, leitura } = props;
  const pesquisa = useRef<HTMLInputElement>(null);
  const ef = filtrosEfetivos(aba, f);
  const todas = pessoasDoSeparador(S, aba);
  const visiveis = listaVisivel(S, aba, f, ordem);
  const porAba = contagens(S, f.q);
  // "Limpar filtros" desaparece com o estado vazio: o foco passa para a pesquisa em vez de se perder.
  const limpar = () => { setF({ ...SEM_FILTROS }); pesquisa.current?.focus(); };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-background px-4 pb-3 pt-5 lg:pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Pessoas</h1>
          <Button size="lg" variant="outline" className={cn("min-h-11 cursor-pointer", BORDA_CTRL)} onClick={novaLead}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead
          </Button>
        </div>
        <label className="relative mt-2 block">
          <span className="sr-only">Procurar por nome, telefone, serviço ou localidade</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input ref={pesquisa} type="search" placeholder="Procurar nome, telefone ou serviço" value={f.q} onChange={(e) => setF({ q: e.target.value })}
            className={cn("h-11 w-full rounded-lg border bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25", BORDA_CTRL)} />
        </label>
        <div role="group" aria-label="Tipo de pessoa" className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {SEPARADORES_LISTA.map(({ id, nome }) => (
            <button key={id} type="button" aria-pressed={aba === id} onClick={() => setAba(id)}
              className={cn("min-h-11 cursor-pointer rounded-sm px-2 text-[15px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                aba === id ? "bg-foreground text-background" : "text-foreground hover:bg-background/70")}>
              {nome} <span className="tabular-nums opacity-70">{porAba[id]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pb-24 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-6">
        <div className="px-4 pt-3"><LinhaResumo S={S} aba={aba} /></div>
        <Filtros S={S} aba={aba} f={ef} setF={setF} ordem={ordem} setOrdem={props.setOrdem} todas={todas} leitura={leitura} />
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{contagemTexto(visiveis.length)}</p>
        <div className="mt-2" role="region" aria-label="Resultados">
          {todas.length === 0 ? <SeparadorVazio aba={aba} /> : visiveis.length === 0 ? <SemResultados limpar={limpar} pesquisa={f.q.trim() !== ""} /> : (
            <>
              <ul className="divide-y divide-border border-y border-border" aria-label={SEPARADORES_LISTA.find((s) => s.id === aba)!.nome}>
                {visiveis.map((p) => <LinhaPessoa key={p.nome} p={p} S={S} escolhida={sel === p.nome} abrir={() => abrir(p.nome)} />)}
              </ul>
              <p className="px-4 pt-3 text-[15px] text-muted-foreground">Exemplo: o negócio novo juntado a clientes, a saúde, as notas e os pagamentos são inventados para a demonstração.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
