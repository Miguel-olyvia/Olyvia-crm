// A página de Negócios da V2 funcional ("Negócios · dia a dia"): três separadores, Hoje (por defeito), Quadro e Dashboard (o de sempre), com a barra
// de filtros de sempre (vale para os três). Os negócios de exemplo abrem o painel de exemplo, os da seed abrem a página deles, como na V2.
// Nada aqui muda a fase de um negócio nem o Estado (só a navegação e os filtros de sempre).
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { negociosDe, semPaginaPropria } from "./negociosApp";
import { todosApp } from "./pessoasDocs";
import { SEM_FILTROS_N, linhasNegocios, selecionarQuadro, type AcaoN, type FiltrosN, type LinhaN } from "./filtrosNegocios";
import type { DocFase } from "./negociosDocs";
import { BarraFiltrosN } from "./NegociosFiltros";
import { NegociosDashboard } from "./NegociosDashboard";
import { NegocioExemploPainel } from "./NegocioExemploPainel";
import { escolherPessoaFunc } from "./PessoasFunc";
import { hojeNegocios, type ChaveN, type IdGrupoN, type OrdemHojeN, type VistaN } from "./funcNegocios";
import { csvNegocios, descarregarCsv, nomeCsv } from "./funcCsv";
import { HojeNegocios } from "./FuncHojeNegocios";
import { QuadroFunc, type Densidade } from "./FuncQuadro";
import { AjudaAtalhos } from "./FuncGrupo";
import { useAtalhos } from "./useAtalhos";
import type { Ctx } from "./pecas";

type VistaPag = "hoje" | "quadro" | "dashboard";
interface Memoria {
  vista: VistaPag; f: FiltrosN; ordemHoje: OrdemHojeN; fechados: readonly IdGrupoN[]; rapida: VistaN | null; global: ChaveN | null;
  porColuna: Partial<Record<DocFase, ChaveN | null>>; densidade: Densidade; recolhidas: readonly DocFase[];
}
const VAZIA: Memoria = { vista: "hoje", f: SEM_FILTROS_N, ordemHoje: "parado", fechados: [], rapida: null, global: null, porColuna: {}, densidade: "normal", recolhidas: [] };
let memoria: Memoria = VAZIA;
export function esquecerNegociosFunc(): void { memoria = VAZIA; }

const TAB = "h-11 min-w-11 cursor-pointer rounded-none px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background";
const alternar = <T,>(l: readonly T[], x: T): T[] => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);

function useMemoria(): [Memoria, (p: Partial<Memoria>) => void] {
  const [m, setM] = useState<Memoria>(memoria);
  // A variável do módulo grava-se num efeito: o updater do useState fica puro.
  useEffect(() => { memoria = m; }, [m]);
  return [m, (p) => setM((prev) => ({ ...prev, ...p }))];
}

/** O separador da pessoa em Pessoas: o da lista a que ela pertence. */
const listaDaPessoa = (S: Ctx["S"], nome: string) => {
  const p = todosApp(S).find((x) => x.nome === nome);
  return !p || p.perdida !== null ? "todos" : p.papel === "cliente" ? "clientes" : "leads";
};

function Cabecalho({ n }: { n: number }) {
  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Negócios · dia a dia</h1>
        <p className="mt-1 text-base text-muted-foreground">{n} no Quadro com estes filtros</p>
      </header>
      <TabsList aria-label="Vista" className="mt-4 h-11 gap-0 overflow-hidden p-0">
        <TabsTrigger value="hoje" className={TAB}>Hoje</TabsTrigger>
        <TabsTrigger value="quadro" className={TAB}>Quadro</TabsTrigger>
        <TabsTrigger value="dashboard" className={TAB}>Dashboard</TabsTrigger>
      </TabsList>
    </>
  );
}

interface QuadroLigadoProps {
  m: Memoria; mudar: (p: Partial<Memoria>) => void; quadro: readonly LinhaN[];
  abrir: (l: LinhaN, el: HTMLElement) => void; avisar: (msg: string) => void; ajuda: () => void;
}

/** O Quadro funcional ligado à memória da página, e a exportação do que ele mostra. */
function QuadroLigado({ m, mudar, quadro, abrir, avisar, ajuda }: QuadroLigadoProps) {
  const exportar = (ls: readonly LinhaN[]): void => {
    const ok = descarregarCsv(nomeCsv("negocios"), csvNegocios(ls));
    avisar(ok ? `Exportados ${ls.length === 1 ? "1 negócio" : `${ls.length} negócios`}` : "Não foi possível descarregar o CSV neste browser.");
  };
  return (
    <QuadroFunc linhas={quadro} vista={m.rapida} setVista={(v) => mudar({ rapida: v })} global={m.global} setGlobal={(c) => mudar({ global: c })}
      porColuna={m.porColuna} setPorColuna={(col, c) => mudar({ porColuna: { ...m.porColuna, [col]: c } })} densidade={m.densidade} setDensidade={(d) => mudar({ densidade: d })}
      recolhidas={m.recolhidas} alternarColuna={(col) => mudar({ recolhidas: alternar(m.recolhidas, col) })} abrir={abrir} exportar={exportar} ajuda={ajuda} />
  );
}

export function NegociosFunc({ S, A, go, q, setQ: setQOpcional }: Ctx) {
  const setQ = setQOpcional ?? ((): void => undefined);
  const [m, mudar] = useMemoria();
  const [exemplo, setExemplo] = useState<string | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const [aviso, setAviso] = useState("");
  const clicado = useRef<HTMLElement | null>(null), raiz = useRef<HTMLDivElement>(null);
  const linhas = linhasNegocios(S), ctx = { rapido: S.filtro, q, f: m.f };
  const quadro = selecionarQuadro(linhas, ctx);
  const aberto = exemplo ? linhas.find((l) => l.id === exemplo)?.negocio : undefined;
  const abrir = (l: LinhaN, el: HTMLElement): void => { if (semPaginaPropria(l.negocio)) { clicado.current = el; setExemplo(l.id); } else go(() => A.abrir(l.negocio.negocioId))(); };
  const verPessoa = (nome: string): void => { setExemplo(null); setQ(""); escolherPessoaFunc(nome, listaDaPessoa(S, nome)); go(() => A.nav("pessoas"))(); };
  const agir = (acao: AcaoN, rotulo: string): void => { mudar({ f: { ...m.f, ...acao.f }, vista: "quadro" }); setAviso(`Quadro filtrado por ${rotulo}`); };
  const pesquisa = (): void => raiz.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  useAtalhos(!ajuda && !exemplo && m.vista !== "dashboard", "lista", raiz, { pesquisa, ajuda: () => setAjuda(true), esc: () => { if (q) setQ(""); } });
  return (
    <TooltipProvider>
    <div ref={raiz}>
      <Tabs value={m.vista} onValueChange={(v) => mudar({ vista: v as VistaPag })} className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-8">
        <Cabecalho n={quadro.length} />
        <BarraFiltrosN S={S} A={A} go={go} q={q} setQ={setQ} linhas={linhas} f={m.f} setF={(v) => mudar({ f: { ...m.f, ...v } })} total={quadro.length} />
        <p aria-live="polite" aria-atomic="true" className="sr-only">{aviso}</p>
        <TabsContent value="hoje" className="mt-0">
          <HojeNegocios grupos={hojeNegocios(quadro, m.ordemHoje)} ordem={m.ordemHoje} setOrdem={(o) => mudar({ ordemHoje: o })} fechados={new Set(m.fechados)}
            alternar={(g) => mudar({ fechados: alternar(m.fechados, g) })} abrir={abrir} verPessoa={verPessoa} ajuda={() => setAjuda(true)} />
        </TabsContent>
        <TabsContent value="quadro" className="mt-0">
          <QuadroLigado m={m} mudar={mudar} quadro={quadro} abrir={abrir} avisar={setAviso} ajuda={() => setAjuda(true)} />
        </TabsContent>
        <TabsContent value="dashboard" className="mt-0">
          <NegociosDashboard linhas={linhas} ctx={ctx} aoAgir={agir} verAtrasos={() => { go(() => A.filtro("atraso"))(); mudar({ vista: "quadro" }); }} limpar={go(() => { setQ(""); A.filtro("todos"); mudar({ f: { ...SEM_FILTROS_N } }); })} A={A} go={go} />
        </TabsContent>
      </Tabs>
      <NegocioExemploPainel S={S} n={aberto && negociosDe(S, aberto.nome).find((x) => x.id === aberto.id)} fechar={() => setExemplo(null)} verPessoa={(nome) => verPessoa(nome)} retorno={clicado} />
      <AjudaAtalhos aberta={ajuda} mudar={setAjuda} leitura={!!S.leitura} />
    </div>
    </TooltipProvider>
  );
}
