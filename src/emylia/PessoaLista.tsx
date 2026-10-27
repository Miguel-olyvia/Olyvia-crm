// A página de Pessoas, sem a ficha: dois separadores principais (Dashboard e Lista, a Lista por defeito) e, por baixo, a barra de filtros única
// (ListaTopo) que se aplica aos dois. A lista ocupa a largura toda; o cabeçalho fica fixo e as linhas rolam; ao escolher uma pessoa abre-se a ficha num painel.
import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SEPARADORES_LISTA, type Ordem, type SeparadorLista } from "./pessoasDocs";
import { SEM_FILTROS_P, listaP, selecionar, type FiltrosP, type LinhaP } from "./filtrosPessoas";
import type { AcaoP } from "./dashboardPessoas";
import { BORDA_CTRL } from "./PessoaLinha";
import { ListaTopo, type Vista } from "./ListaTopo";
import { CabecalhoPagina } from "./CabecalhoPagina";
import { ChipsVista } from "./ChipsVista";
import { vistasPessoas } from "./filaPessoas";
import { PessoaTabela } from "./PessoaTabela";
import { PessoasDashboard } from "./PessoasDashboard";
import type { Estado } from "./motor";

export interface ListaProps {
  S: Estado;
  linhas: readonly LinhaP[];
  aba: SeparadorLista;
  setAba: (v: SeparadorLista) => void;
  vista: Vista;
  setVista: (v: Vista) => void;
  f: FiltrosP;
  setF: (v: Partial<FiltrosP>) => void;
  ordem: Ordem;
  setOrdem: (v: Ordem) => void;
  abrir: (nome: string) => void;
  novaLead: () => void;
  /** Um cartão ou uma barra do dashboard: junta filtros, eventualmente muda de separador, e passa à Lista. */
  agir: (acao: AcaoP, rotulo: string) => void;
  /** O que se anuncia a quem usa leitor de ecrã depois de um cartão ou uma barra ("Lista filtrada por Lisboa: 10 pessoas"). */
  aviso: string;
  /** Sobe de cada vez que um cartão ou uma barra manda para a Lista: o foco passa para o título dela. */
  pedidoFoco: number;
  /** Leitura fácil ativa: o painel dos filtros, que abre num portal, também a aplica. */
  leitura: boolean;
}

const TAB = "cursor-pointer text-[15px]";
/** Os chips de vista que o ListaTopo ainda não tem (Voltaram a contactar, Com visita, Com negócio novo): ligam e desligam o filtro com o número da lista. */
function VistasExtra({ linhas, aba, f, setF }: Pick<ListaProps, "linhas" | "aba" | "f" | "setF">) {
  const itens = vistasPessoas(linhas, aba, f).filter((v) => ["voltou", "visita", "novo"].includes(v.id));
  const alternar = (id: string): void => {
    const v = itens.find((x) => x.id === id)!;
    setF({ [v.chave]: v.ativo ? SEM_FILTROS_P[v.chave] : v.valor });
  };
  return <ChipsVista nome="Mais vistas" itens={itens} aoAlternar={alternar} />;
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

export function PessoaLista({ S, linhas, aba, setAba, vista, setVista, f, setF, ordem, setOrdem, abrir, novaLead, agir, leitura, aviso, pedidoFoco }: ListaProps) {
  const pesquisa = useRef<HTMLInputElement>(null);
  const tituloLista = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (pedidoFoco > 0) tituloLista.current?.focus(); }, [pedidoFoco]);
  const todas = selecionar(linhas, aba, SEM_FILTROS_P);
  const visiveis = listaP(S, linhas, aba, f, ordem);
  // "Limpar filtros" desaparece com o estado vazio: o foco passa para a pesquisa em vez de se perder.
  const limpar = () => { setF({ ...SEM_FILTROS_P }); pesquisa.current?.focus(); };
  const titulo = SEPARADORES_LISTA.find((s) => s.id === aba)!.nome;
  return (
    <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)} className="min-w-0">
      <div className="px-4">
        <CabecalhoPagina migalhas={`Pessoas › ${vista === "lista" ? "Lista" : "Dashboard"}`} titulo="Pessoas" subtitulo={null}
          acoes={<Button type="button" className="min-h-11 cursor-pointer text-[15px]" onClick={novaLead}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>} />
        <TabsList aria-label="Vista" className="abas-inv">
          <TabsTrigger value="dashboard" className={TAB}>Dashboard</TabsTrigger>
          <TabsTrigger value="lista" className={TAB}>Lista</TabsTrigger>
        </TabsList>
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">{aviso}</div>
      <TabsContent value={vista} className="mt-0">
        <Tabs value={aba} onValueChange={(v) => setAba(v as SeparadorLista)} className="min-w-0">
          <ListaTopo linhas={linhas} aba={aba} f={f} setF={setF} ordem={ordem} setOrdem={setOrdem} total={visiveis.length} leitura={leitura} pesquisa={pesquisa}
            chipsExtra={<VistasExtra linhas={linhas} aba={aba} f={f} setF={setF} />} />
          <TabsContent value={aba} className="mt-0 pb-24 lg:pb-6">
            {vista === "lista" && (
              <h2 ref={tituloLista} tabIndex={-1} className="sr-only focus:not-sr-only focus:mx-4 focus:mt-4 focus:rounded-md focus:text-[16px] focus:font-semibold focus:outline-none focus:ring-2 focus:ring-primary">
                Lista: {titulo}
              </h2>
            )}
            {vista === "dashboard" ? <PessoasDashboard linhas={linhas} aba={aba} f={f} aoAgir={agir} limpar={limpar} /> : todas.length === 0 ? <SeparadorVazio aba={aba} /> : visiveis.length === 0 ? <SemResultados limpar={limpar} pesquisa={f.q.trim() !== ""} /> : (
              <div className="tw mx-4 mt-3"><PessoaTabela S={S} pessoas={visiveis.map((l) => l.p)} titulo={titulo} abrir={abrir} /></div>
            )}
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
