// A página de Pessoas da V2 funcional ("Pessoas · dia a dia"), pensada para o dia a dia de um comercial: três separadores, Hoje (por defeito),
// Lista e Dashboard (o de sempre), a ficha no painel lateral de sempre com peças extra (barra de ações, copiar, registos), e atalhos de teclado.
// Os registos (chamadas, notas, adiamentos) vivem só em memória (diaADia.ts): não tocam no Estado nem no motor. A V2 não muda.
import { useEffect, useRef, useState, type RefObject } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { separadorPorDefeito, type Ordem, type PessoaApp, type SeparadorLista } from "./pessoasDocs";
import { SEM_FILTROS_P, type FiltrosP } from "./filtrosPessoas";
import { aplicarAcao, type AcaoP } from "./dashboardPessoas";
import { ListaTopo } from "./ListaTopo";
import { PessoasDashboard } from "./PessoasDashboard";
import { PessoaPainel } from "./PessoaPainel";
import type { FichaExtras, SepFicha } from "./PessoaFicha";
import { BORDA_CTRL } from "./PessoaLinha";
import { useRegistos, type Registo } from "./diaADia";
import { atividadeRegistada, hojePessoas, perfilFunc, type IdGrupo } from "./funcHoje";
import { COLUNAS_INICIAIS, alternarColuna, linhasFunc, listaFunc, pessoasDe, type ColunaOpcional, type LinhaFunc, type VistaP } from "./funcLista";
import { alternarOrdem, type OrdemLista } from "./funcOrdenar";
import { csvPessoas, descarregarCsv, nomeCsv } from "./funcCsv";
import { HojePessoas, filtrarHoje } from "./FuncHojePessoas";
import { ListaFuncPessoas } from "./FuncListaPessoas";
import { BarraFicha } from "./FuncAcoes";
import { ContactoCopiar } from "./FuncCopiar";
import { AjudaAtalhos } from "./FuncGrupo";
import { useAtalhos, type Acoes } from "./useAtalhos";
import { useAviso } from "./useAviso";
import type { Ctx } from "./pecas";

type VistaF = "hoje" | "lista" | "dashboard";
/** O que a página lembra quando se abre um negócio e se volta (a página desmonta). Limpa-se ao repor a demonstração. */
interface Memoria {
  vista: VistaF; lista: SeparadorLista | null; sel: string | null; sep: SepFicha; f: FiltrosP; ordem: Ordem; col: OrdemLista | null;
  rapida: VistaP | null; colunas: readonly ColunaOpcional[]; fechados: readonly IdGrupo[]; qHoje: string;
}
const VAZIA: Memoria = { vista: "hoje", lista: null, sel: null, sep: "resumo", f: SEM_FILTROS_P, ordem: "urgencia", col: null, rapida: null, colunas: COLUNAS_INICIAIS, fechados: [], qHoje: "" };
let memoria: Memoria = VAZIA;

export function esquecerPessoasFunc(): void { memoria = VAZIA; }
/** Deixa a ficha de uma pessoa aberta para quando a página abrir (o Hoje de Negócios usa-o em "Ver pessoa"). */
export function escolherPessoaFunc(nome: string, lista: SeparadorLista): void { memoria = { ...memoria, lista, sel: nome, sep: "resumo", f: SEM_FILTROS_P, rapida: null, vista: "lista" }; }

const TAB = "h-11 min-w-11 cursor-pointer rounded-none px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background";

function useMemoria(abrirEm: SeparadorLista | undefined): [Memoria, (m: Partial<Memoria>) => void] {
  const [m, setM] = useState<Memoria>(() => (abrirEm && abrirEm !== memoria.lista ? { ...memoria, lista: abrirEm, sel: null, sep: "resumo" } : memoria));
  // A variável do módulo grava-se num efeito: o inicializador e o updater do useState ficam puros.
  useEffect(() => { memoria = m; }, [m]);
  const mudar = (patch: Partial<Memoria>): void => setM((prev) => ({ ...prev, ...patch }));
  return [m, mudar];
}

/** Os atalhos: no painel, as setas (e [ ]) passam à pessoa vizinha; no Hoje e na Lista, as setas entre linhas, "/", "?" e Esc. */
function useAtalhosPessoas(painel: boolean, ajuda: boolean, raiz: RefObject<HTMLDivElement>, acoes: Acoes): void {
  const seta = (qual: string) => () => document.querySelector<HTMLButtonElement>(`[role="dialog"] button[data-seta="${qual}"]:not(:disabled)`)?.click();
  useAtalhos(!ajuda, painel ? "painel" : "lista", raiz, painel ? { pessoaAnterior: seta("anterior"), pessoaSeguinte: seta("seguinte") } : acoes);
}

interface ExtrasArgs { regs: readonly Registo[]; avisar: (m: string) => void; aviso: string; leitura: boolean; perder: (p: PessoaApp) => void }

/** As peças extra da ficha de cada pessoa: o perfil com os registos, a Atividade registada, a barra de ações e o Contacto com Copiar. */
const extrasDe = ({ regs, avisar, aviso, leitura, perder }: ExtrasArgs) => (p: PessoaApp): FichaExtras => ({
  ajustarPerfil: (f) => perfilFunc(f, regs, p.nome),
  registados: atividadeRegistada(regs, p.nome),
  acoes: (f) => <BarraFicha nome={p.nome} f={f} avisar={avisar} leitura={leitura} aviso={aviso} perder={p.papel === "lead" && p.perdida === null ? () => perder(p) : undefined} />,
  contacto: (f) => <ContactoCopiar f={f} empresa={p.empresa} />,
});

function Cabecalho({ novaLead }: { novaLead: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-1">
      <h1 className="text-2xl font-semibold tracking-tight">Pessoas · dia a dia</h1>
      <div className="flex flex-wrap items-center gap-2">
        <TabsList aria-label="Vista" className="h-11 gap-0 overflow-hidden p-0">
          <TabsTrigger value="hoje" className={TAB}>Hoje</TabsTrigger>
          <TabsTrigger value="lista" className={TAB}>Lista</TabsTrigger>
          <TabsTrigger value="dashboard" className={TAB}>Dashboard</TabsTrigger>
        </TabsList>
        <Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={novaLead}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>
      </div>
    </div>
  );
}

export function PessoasFunc({ S, A, go, abrirEm, alvoAvisos }: Ctx & { abrirEm?: SeparadorLista; alvoAvisos?: (el: HTMLElement | null) => void }) {
  const regs = useRegistos();
  const [m, mudar] = useMemoria(abrirEm);
  const [aviso, avisar] = useAviso();
  const [ajuda, setAjuda] = useState(false);
  const raiz = useRef<HTMLDivElement>(null), pHoje = useRef<HTMLInputElement>(null), pLista = useRef<HTMLInputElement>(null);
  const leitura = !!S.leitura, aba = m.lista ?? separadorPorDefeito(S.role);
  const linhas = linhasFunc(S, regs), grupos = hojePessoas(S, regs);
  const visiveis = listaFunc(S, linhas, aba, m.f, m.rapida, m.ordem, m.col);
  const escolhida = m.sel ? linhas.find((l) => l.p.nome === m.sel)?.p : undefined;
  const nomes = m.vista === "hoje" ? filtrarHoje(grupos, m.qHoje).flatMap((g) => g.itens.map((i) => i.p.nome)) : visiveis.map((l) => l.p.nome);
  const perder = (p: PessoaApp): void => { mudar({ sep: "resumo" }); go(() => A.perder(p.principal.id))(); };
  useEfeitos(m, mudar, abrirEm, !!escolhida, escolhida?.nome ?? null, S.confirmPerda !== null, go(() => A.perderNao()));
  useAtalhosPessoas(!!escolhida, ajuda, raiz, {
    pesquisa: () => (m.vista === "hoje" ? pHoje : pLista).current?.focus(), ajuda: () => setAjuda(true),
    esc: () => { if (m.vista === "hoje" && m.qHoje) mudar({ qHoje: "" }); else if (m.vista === "lista" && m.f.q) mudar({ f: { ...m.f, q: "" } }); },
  });
  return (
    <TooltipProvider>
    <div ref={raiz} className={cn("mx-auto w-full max-w-[1600px]", leitura && "pessoas-leitura")}>
      <Tabs value={m.vista} onValueChange={(v) => mudar({ vista: v as VistaF })} className="min-w-0">
        <Cabecalho novaLead={go(() => A.novo())} />
        <p aria-live="polite" aria-atomic="true" className="sr-only">{aviso}</p>
        <TabsContent value="hoje" className="mt-0">
          <HojePessoas grupos={grupos} q={m.qHoje} setQ={(q) => mudar({ qHoje: q })} fechados={new Set(m.fechados)} leitura={leitura} pesquisa={pHoje}
            alternar={(g) => mudar({ fechados: m.fechados.includes(g) ? m.fechados.filter((x) => x !== g) : [...m.fechados, g] })}
            abrir={(nome) => mudar({ sel: nome })} avisar={avisar} ajuda={() => setAjuda(true)} />
        </TabsContent>
        {m.vista !== "hoje" && (
          <TabsContent value={m.vista} className="mt-0">
            <AreaLista S={S} m={m} mudar={mudar} linhas={linhas} visiveis={visiveis} aba={aba} avisar={avisar} ajuda={() => setAjuda(true)} leitura={leitura} pesquisa={pLista} />
          </TabsContent>
        )}
      </Tabs>
      <PessoaPainel S={S} A={A} go={go} p={escolhida} nomes={nomes} leitura={leitura} sep={m.sep} aoMudarSep={(s) => mudar({ sep: s })} abrir={(nome) => mudar({ sel: nome })}
        fechar={() => mudar({ sel: null, sep: "resumo" })} alvoAvisos={alvoAvisos} extras={extrasDe({ regs, avisar, aviso, leitura, perder })} />
      <AjudaAtalhos aberta={ajuda} mudar={setAjuda} leitura={leitura} />
    </div>
    </TooltipProvider>
  );
}

interface AreaProps {
  S: Ctx["S"]; m: Memoria; mudar: (p: Partial<Memoria>) => void; linhas: readonly LinhaFunc[]; visiveis: readonly LinhaFunc[]; aba: SeparadorLista;
  avisar: (msg: string) => void; ajuda: () => void; leitura: boolean; pesquisa: RefObject<HTMLInputElement>;
}

/** A Lista e o Dashboard, com a barra de filtros de sempre por cima. A seleção vive aqui (limpa-se ao ir para o Hoje). */
function AreaLista({ S, m, mudar, linhas, visiveis, aba, avisar, ajuda, leitura, pesquisa }: AreaProps) {
  const [selecionadas, setSelecionadas] = useState<ReadonlySet<string>>(new Set());
  const setF = (v: Partial<FiltrosP>): void => mudar({ f: { ...m.f, ...v } });
  const agir = (acao: AcaoP, rotulo: string): void => { const r = aplicarAcao(aba, m.f, acao); mudar({ lista: r.aba, f: r.f, vista: "lista", rapida: null }); avisar(`Lista filtrada por ${rotulo}`); };
  const escolher = (nome: string, sim: boolean): void => setSelecionadas((s) => { const n = new Set(s); if (sim) n.add(nome); else n.delete(nome); return n; });
  const exportar = (quais: "lista" | "selecao"): void => {
    const itens = quais === "lista" ? visiveis : linhas.filter((l) => selecionadas.has(l.p.nome));
    const ok = descarregarCsv(nomeCsv(quais === "lista" ? "pessoas" : "pessoas-selecionadas"), csvPessoas(S, pessoasDe(itens)));
    avisar(ok ? `Exportadas ${itens.length === 1 ? "1 pessoa" : `${itens.length} pessoas`}` : "Não foi possível descarregar o CSV neste browser.");
  };
  return (
    <Tabs value={aba} onValueChange={(v) => mudar({ lista: v as SeparadorLista })} className="min-w-0">
      <ListaTopo linhas={linhas} aba={aba} f={m.f} setF={setF} ordem={m.ordem} setOrdem={(o: Ordem) => mudar({ ordem: o, col: null })} total={visiveis.length} leitura={leitura} pesquisa={pesquisa} />
      <TabsContent value={aba} className="mt-0">
        {m.vista === "dashboard" ? <PessoasDashboard linhas={linhas} aba={aba} f={m.f} aoAgir={agir} limpar={() => setF({ ...SEM_FILTROS_P })} /> : (
          <ListaFuncPessoas S={S} todas={linhas} visiveis={visiveis} aba={aba} f={m.f} vista={m.rapida} setVista={(v) => mudar({ rapida: v })} titulo="Pessoas"
            colunas={m.colunas} setColunas={(c) => mudar({ colunas: alternarColuna(m.colunas, c) })} ordem={m.col} ordenar={(c) => mudar({ col: alternarOrdem(m.col, c) })}
            selecionadas={selecionadas} escolher={escolher} limparSelecao={() => setSelecionadas(new Set())} exportar={exportar}
            limparFiltros={() => mudar({ f: { ...SEM_FILTROS_P }, rapida: null })} abrir={(nome) => mudar({ sel: nome })} avisar={avisar} ajuda={ajuda} leitura={leitura} />
        )}
      </TabsContent>
    </Tabs>
  );
}

/** Os efeitos da página: o separador pedido pelo menu, a pessoa que deixou de existir e a confirmação de "perdida" que fica de outra pessoa. */
function useEfeitos(m: Memoria, mudar: (p: Partial<Memoria>) => void, abrirEm: SeparadorLista | undefined, existe: boolean, nome: string | null, confirmando: boolean, cancelar: () => void): void {
  const anterior = useRef(abrirEm), nomeAnterior = useRef(nome);
  useEffect(() => {
    if (!abrirEm || abrirEm === anterior.current) return;
    anterior.current = abrirEm;
    mudar({ lista: abrirEm, sel: null, sep: "resumo" });
  });
  useEffect(() => { if (m.sel && !existe) mudar({ sel: null, sep: "resumo" }); });
  useEffect(() => {
    if (nomeAnterior.current === nome) return;
    nomeAnterior.current = nome;
    if (confirmando) cancelar();
  });
}
