// V2 da página de Negócios: só negócios a decorrer, por fase de documento, em dois separadores: Quadro (as colunas) e Dashboard (números e gráficos).
// Lead, contacto e visita são fases da pessoa e ficam em Clientes. A barra de filtros (NegociosFiltros) é uma só e vale para os dois separadores.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Euro, FileCheck2, FileSignature, FileText, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import { negociosDe, semPaginaPropria } from "./negociosApp";
import { COLUNAS_V2, negociosPorPessoa, pessoasAntes, type CartaoV2, type DocFase } from "./negociosDocs";
import { SEM_FILTROS_N, linhasNegocios, selecionarQuadro, type AcaoN, type ContextoN, type FiltrosN } from "./filtrosNegocios";
import { Chip, FASE_COR, type Ctx } from "./pecas";
import { CHIP } from "./FiltrosPopover";
import { BarraFiltrosN } from "./NegociosFiltros";
import { NegociosDashboard } from "./NegociosDashboard";
import { NegociosLista } from "./NegociosLista";
import { ChipsVista } from "./ChipsVista";
import { vistasNegocios } from "./filaNegocios";
import { cartoesNegocios } from "./dashboardNegocios";
import { valorCartao } from "./graficosTipos";
import { CabecalhoPagina } from "./CabecalhoPagina";
import { esquecerMaisGraficos } from "./MaisGraficos";
import { NegocioExemploPainel } from "./NegocioExemploPainel";
import { escolherPessoa } from "./PessoasSimples";

type VistaN = "quadro" | "dashboard";
/** O que a página lembra quando se muda de ecrã e se volta (a página desmonta): o separador e os filtros do painel. Limpa-se ao repor a demonstração. */
type ModoN = "quadro" | "lista";
interface Memoria { vista: VistaN; modo: ModoN; f: FiltrosN }
const MEMORIA_VAZIA: Memoria = { vista: "quadro", modo: "quadro", f: SEM_FILTROS_N };
let memoria: Memoria = MEMORIA_VAZIA;
/** Esquece o separador e os filtros (quando a demonstração é reposta). */
export function esquecerNegociosV2(): void { memoria = MEMORIA_VAZIA; esquecerMaisGraficos(); }

const TAB = "cursor-pointer text-[15px]";
const ICONE: Record<DocFase, { i: LucideIcon; cor: string }> = {
  orcamento: { i: FileText, cor: FASE_COR[0] },
  proposta: { i: FileCheck2, cor: FASE_COR[3] },
  contrato: { i: FileSignature, cor: FASE_COR[2] },
  financeiro: { i: Euro, cor: FASE_COR[4] },
};
const NOME_DOC: Record<DocFase, string> = { orcamento: "Orçamento", proposta: "Proposta", contrato: "Contrato", financeiro: "Financeiro" };
const eur0 = (x: number) => eur(x).replace(/,00$/, "");
const CHIP_PEQ = "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4";
const negociosTexto = (n: number): string => (n === 1 ? "1 negócio" : `${n} negócios`);

export function NegociosV2({ S, A, go, q, setQ: setQOpcional, seletor }: Ctx & { seletor?: ReactNode }) {
  const setQ = setQOpcional ?? ((): void => undefined);
  const [colMovel, setColMovel] = useState<DocFase>("orcamento");
  // Depois de um cartão ou uma barra do dashboard o foco passa para o título do Quadro e a mudança é anunciada (o foco não se perde no separador que desapareceu).
  const tituloQuadro = useRef<HTMLHeadingElement>(null);
  const [pedidoFoco, setPedidoFoco] = useState(0);
  const [aviso, setAviso] = useState("");
  useEffect(() => { if (pedidoFoco > 0) tituloQuadro.current?.focus(); }, [pedidoFoco]);
  // Um cartão de exemplo abre um painel com o detalhe dele (não existe no Estado); o cartão clicado guarda-se para lhe devolver o foco.
  const [exemplo, setExemplo] = useState<string | null>(null);
  const cartaoClicado = useRef<HTMLElement | null>(null);
  const [vista, setVistaEstado] = useState<VistaN>(memoria.vista);
  const [fN, setFEstado] = useState<FiltrosN>(memoria.f);
  const [modo, setModoEstado] = useState<ModoN>(memoria.modo);
  const setModo = (m: ModoN) => { setModoEstado(m); memoria = { ...memoria, modo: m }; };
  const setVista = (v: VistaN) => { setVistaEstado(v); memoria = { ...memoria, vista: v }; };
  const setF = (v: Partial<FiltrosN>) => { const n = { ...fN, ...v }; setFEstado(n); memoria = { ...memoria, f: n }; };
  const linhas = linhasNegocios(S);
  const ctx: ContextoN = { rapido: S.filtro, q, f: fN };
  /** Passa ao Quadro, leva-lhe o foco e anuncia o que ficou ("Quadro filtrado por Casa de banho: 5 negócios"). */
  const passarAoQuadro = (texto: string, filtros: FiltrosN, rapido = ctx.rapido) => {
    const n = selecionarQuadro(linhas, { ...ctx, rapido, f: filtros }).length;
    setAviso(`${texto}: ${negociosTexto(n)}`); setPedidoFoco((v) => v + 1);
  };
  /** Um cartão ou uma barra do dashboard: junta o filtro e passa ao Quadro. */
  const agir = (acao: AcaoN, rotulo: string) => {
    const n = { ...fN, ...acao.f };
    setFEstado(n); setVistaEstado("quadro"); memoria = { ...memoria, vista: "quadro", f: n };
    passarAoQuadro(Object.keys(acao.f ?? {}).length ? `Quadro filtrado por ${rotulo}` : "Quadro", n);
  };
  /** "e mais N" dos próximos passos em atraso: liga o filtro rápido "Com atraso" e passa ao Quadro. */
  const verAtrasos = () => {
    go(() => A.filtro("atraso"))();
    setVistaEstado("quadro"); memoria = { ...memoria, vista: "quadro" };
    passarAoQuadro("Quadro filtrado por Com atraso", fN, "atraso");
  };
  const todos = linhas.flatMap((l) => (l.cartao ? [l.cartao] : []));
  const porPessoa = negociosPorPessoa(todos);
  // O dono, o telefone e o atraso são os do próprio cartão (c.deal): nos exemplos, a cópia do negócio base (mesmo dono e telefone, e sem atraso).
  const visiveis = selecionarQuadro(linhas, ctx).map((l) => l.cartao!);
  const emProposta = visiveis.filter((c) => c.doc === "proposta").reduce((a, c) => a + (c.valor || 0), 0);
  const antes = pessoasAntes(S);
  const negocioExemplo = exemplo ? todos.find((c) => c.id === exemplo) : undefined;
  const aberto = negocioExemplo ? negociosDe(S, negocioExemplo.nome).find((x) => x.id === negocioExemplo.id) : undefined;
  const verPessoa = (nome: string, papel: "lead" | "cliente" | "perdida") => {
    setExemplo(null);
    // A memória só se grava quando a navegação vai acontecer; e a pesquisa global limpa-se para a pessoa aparecer em Pessoas.
    setQ("");
    escolherPessoa(nome, papel === "cliente" ? "clientes" : papel === "perdida" ? "todos" : "leads");
    go(() => A.nav("pessoas"))();
  };

  /** Um negócio sem página própria abre o painel (e guarda o elemento para lhe devolver o foco); os da seed abrem o negócio. */
  const abrirCartao = (c: CartaoV2, el: HTMLElement) => {
    if (semPaginaPropria(c)) { cartaoClicado.current = el; setExemplo(c.id); } else go(() => A.abrir(c.negocioId))();
  };
  const vistas = vistasNegocios(linhas, ctx);
  /** Um chip de vista rápida liga ou desliga o filtro dele (o "Com atraso" é o filtro rápido do Estado). */
  const alternarVista = (id: string) => {
    const v = vistas.find((x) => x.id === id)!;
    if (v.acao.rapido) go(() => A.filtro(v.ativo ? "todos" : "atraso"))();
    else setF(v.ativo ? Object.fromEntries(Object.keys(v.acao.f ?? {}).map((k) => [k, ""])) : { ...v.acao.f });
  };
  const resumo = cartoesNegocios(linhas, ctx);
  const dado = (id: string): string => valorCartao(resumo.find((c) => c.id === id)!);

  const cartao = (c: CartaoV2) => {
    const I = ICONE[c.doc].i;
    const n = porPessoa[c.nome] || 1;
    // Uma só fonte para a marca "exemplo" e para a ação: um negócio sem página própria abre o painel, os da seed abrem o negócio.
    const deExemplo = semPaginaPropria(c);
    return (
      <li key={c.id} className={cn("cartaoq rounded-xl border border-border bg-card", `f-${c.doc}`)}>
        <button type="button" onClick={(e) => abrirCartao(c, e.currentTarget)}
          className="group block min-h-11 w-full rounded-xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <span className="mb-2 flex items-center gap-2 text-[15px] text-muted-foreground">
            <Chip icone={I} cor={ICONE[c.doc].cor} className={CHIP_PEQ} />
            <span>{NOME_DOC[c.doc]}</span>
            {deExemplo && <span className="ml-auto text-xs text-muted-foreground">exemplo</span>}
          </span>
          <span className="block text-base font-semibold text-foreground">{c.nome}</span>
          <span className="mt-0.5 block text-[15px] text-muted-foreground">{c.servico}{c.local ? " · " + c.local : ""}</span>
          {c.linhas && (
            <ul className="mt-2 divide-y divide-border border-y border-border text-[15px]">
              {c.linhas.map((l) => (
                <li key={l.rotulo} className="flex justify-between gap-2 py-1.5"><span>{l.rotulo}</span><span className="tabular-nums">{eur(l.valor)} €</span></li>
              ))}
            </ul>
          )}
          {c.valor !== null && <span className="mt-2 block text-base font-medium tabular-nums text-foreground">{eur(c.valor)} €</span>}
          <span className="mt-2 block text-[15px] font-medium text-foreground">
            {c.proximo}
            <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </button>
        {n > 1 && (
          <button type="button" onClick={() => setQ(c.nome)} aria-label={`Ver os ${n} negócios de ${c.nome}`}
            className="flex min-h-11 w-full items-center gap-2 border-t border-border px-4 text-left text-[15px] text-muted-foreground hover:text-foreground">
            <Users className="h-4 w-4" aria-hidden="true" />{n} negócios desta pessoa
          </button>
        )}
      </li>
    );
  };

  const limpar = () => { setQ(""); A.filtro("todos"); setF({ ...SEM_FILTROS_N }); };
  const teclaSeparador = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = COLUNAS_V2.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    const id = COLUNAS_V2[j].id;
    setColMovel(id);
    document.getElementById(`v2-tab-${id}`)?.focus();
  };

  // sufixo -m (separador do telemóvel) ou -d (computador): a coluna é desenhada nos dois sítios e os ids não se podem repetir
  const coluna = (id: DocFase, suf: "m" | "d") => {
    const cs = visiveis.filter((c) => c.doc === id);
    const total = cs.reduce((a, c) => a + (c.valor || 0), 0);
    return (
      <section key={id} aria-labelledby={`v2-col-${id}-${suf}`} className="colq min-w-0">
        <h2 id={`v2-col-${id}-${suf}`} className="flex items-center gap-2 px-1 text-[16px] font-semibold">
          <Chip icone={ICONE[id].i} cor={ICONE[id].cor} className={CHIP_PEQ} />
          <span className="flex-1">{NOME_DOC[id]}</span>
          <span className="text-[15px] font-normal tabular-nums text-muted-foreground">{cs.length}</span>
        </h2>
        <p className="mt-1 px-1 text-[15px] tabular-nums text-muted-foreground">{eur0(total)} €</p>
        <ul className="mt-3 space-y-3">
          {cs.map(cartao)}
          {!cs.length && <li className="rounded-xl border border-dashed border-border p-4 text-[15px] text-muted-foreground">Nenhum</li>}
        </ul>
      </section>
    );
  };

  return (
    <Tabs value={vista} onValueChange={(v) => setVista(v as VistaN)} className="pg-root mx-auto w-full max-w-[1400px] px-4 pb-24 pt-3 sm:px-8">
      <CabecalhoPagina migalhas={`Negócios › ${vista === "dashboard" ? "Dashboard" : modo === "lista" ? "Lista" : "Quadro"}`} titulo="Negócios"
        subtitulo={`${visiveis.length} no Quadro${visiveis.length !== todos.length ? ` (de ${todos.length})` : ""} · ${eur0(emProposta)} € em proposta · ${dado("porfechar")} por fechar · ${dado("conversao")} de conversão`}
        acoes={(
          <>
            {seletor}
            <Button type="button" variant="outline" className="min-h-11" onClick={go(() => A.nav("clientes"))}>Ver em Clientes</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={go(() => A.nav("operacoes"))}>Ver em Operações</Button>
          </>
        )} />

      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <TabsList aria-label="Vista" className="abas-inv">
          <TabsTrigger value="quadro" className={TAB}>Quadro</TabsTrigger>
          <TabsTrigger value="dashboard" className={TAB}>Dashboard</TabsTrigger>
        </TabsList>
        {vista === "quadro" && (
          <div role="group" aria-label="Ver os negócios como" className="mb-1 flex gap-2">
            {(["quadro", "lista"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} className={CHIP(modo === m)}>{m === "quadro" ? "Quadro" : "Lista"}</button>
            ))}
          </div>
        )}
      </div>

      <BarraFiltrosN S={S} A={A} go={go} q={q} setQ={setQ} linhas={linhas} f={fN} setF={setF} total={visiveis.length} margem="mt-3"
        vistas={vista === "quadro" ? <ChipsVista nome="Vistas rápidas" itens={vistas} aoAlternar={alternarVista} /> : undefined} />
      <div aria-live="polite" aria-atomic="true" className="sr-only">{aviso}</div>
      <NegocioExemploPainel S={S} n={aberto} fechar={() => setExemplo(null)} verPessoa={verPessoa} retorno={cartaoClicado} />

      <TabsContent value={vista} className="mt-0">
        {vista === "dashboard" ? <NegociosDashboard linhas={linhas} ctx={ctx} aoAgir={agir} verAtrasos={verAtrasos} limpar={go(limpar)} A={A} go={go} /> : (
          <>
          <h2 ref={tituloQuadro} tabIndex={-1} className="sr-only focus:not-sr-only focus:mt-6 focus:rounded-md focus:text-[16px] focus:font-semibold focus:outline-none focus:ring-2 focus:ring-primary">
            {modo === "lista" ? "Lista" : "Quadro"}
          </h2>
          {!visiveis.length && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-base text-foreground">Nenhum negócio encontrado.</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={limpar}>Limpar pesquisa e filtro</Button>
            </div>
          )}

          {modo === "lista" ? <NegociosLista linhas={selecionarQuadro(linhas, ctx)} aoAbrir={abrirCartao} /> : (
          <>
          {/* Telemóvel: escolhe-se a coluna */}
          <div className="mt-4 lg:hidden">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Fase do documento">
              {COLUNAS_V2.map(({ id, nome }, i) => (
                <button key={id} type="button" role="tab" id={`v2-tab-${id}`} aria-selected={colMovel === id} aria-controls="v2-painel" tabIndex={colMovel === id ? 0 : -1}
                  onClick={() => setColMovel(id)} onKeyDown={(e) => teclaSeparador(e, i)}
                  className={cn("min-h-11 shrink-0 rounded-lg px-3 text-[15px]", colMovel === id ? "bg-foreground text-background" : "bg-muted text-foreground")}>
                  {nome} <span className="tabular-nums opacity-70">{visiveis.filter((c) => c.doc === id).length}</span>
                </button>
              ))}
            </div>
            <div id="v2-painel" role="tabpanel" aria-labelledby={`v2-tab-${colMovel}`} className="mt-4">{coluna(colMovel, "m")}</div>
          </div>

          {/* Computador: as quatro colunas lado a lado */}
          <div className="mt-4 hidden gap-5 lg:grid lg:grid-cols-4">{COLUNAS_V2.map(({ id }) => coluna(id, "d"))}</div>
          </>
          )}

          <p className="mt-8 border-t border-border pt-5 text-[15px] text-muted-foreground">
            {antes} {antes === 1 ? "pessoa ainda em" : "pessoas ainda em"} lead, contacto ou visita (em Clientes). Os negócios já em obra veem-se em Operações.
          </p>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
