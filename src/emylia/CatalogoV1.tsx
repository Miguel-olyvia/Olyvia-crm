// O Catálogo do V1 (14/10/2026): seis secções em separadores (Serviços, Produtos, Equipamentos,
// Consumíveis, Técnicos e Ligações, o mapa das relações em LigacoesCatalogo.tsx), com o modelo completo da V2 (custos, receitas, produtos), no aspeto
// simples. Tocar num serviço abre a ficha do serviço no lugar da lista (FichaServicoSimples).
// Escala para centenas de serviços e milhares de produtos: as contas ficam em useMemo e as listas
// mostram aos poucos ("Mostrar mais").
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Clock, Plus, Search, Sparkles, TriangleAlert, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type SvcId } from "./motor";
import type { Ctx } from "./pecas";
import { aplicarTodos, dataPT, listaCatalogoCompleta, origemHora, pesquisar, type Custos, type ItemLista } from "./v2/custosModelo";
import { lerCustos, mudarCustos, useCustos } from "./v2/custosStore";
import { caminho, dentroDe, noDoServico, oficios, type Catalogo } from "./v2/catalogoModelo";
import { useCatalogo } from "./v2/catalogoStore";
import { ICONE_ALERTA, NumeroCelula, TextoCelula, Escolha } from "./v2/pecasCustos";
import { IconeServico, Ilustracao } from "./ilustracoes";
import { desempenhoServicos, desempenhoTecnicos } from "./desempenhoCatalogo";
import { ENTRADA, NavOficios, ORDENS, PainelDesempenho, usePrefsCatalogo, type Ordem } from "./PainelCatalogo";
import { FichaServicoSimples } from "./FichaServicoSimples";
import { tomarFichaPendente } from "./fichaNav";
import { montarCatalogo, type Ref } from "./ligacoes";
import { LigacoesCatalogo, abrirLigacoesEm } from "./LigacoesCatalogo";
import {
  FILTROS_V1, agruparPorOficio, iconeDoServico, margemEmPalavras, passaFiltroV1, pesquisarProdutos, precoProduto,
  quebraEquip, tecnicosCatalogo, usosEquip, type ConsCatalogo, type FiltroV1,
} from "./fichaServico";
import { useParamUrl } from "./usarParamUrl";
import { CriarNoCatalogo } from "./CriarNoCatalogo";
import { TIPOS_CRIAR, consumiveisComCriados, type TipoCriar } from "./criarCatalogo";
import { ehCriado } from "./catalogo";

type Seccao = "servicos" | "produtos" | "equipamentos" | "consumiveis" | "tecnicos" | "ligacoes";
const SECCOES: [Seccao, string][] = [["servicos", "Serviços"], ["produtos", "Produtos"], ["equipamentos", "Equipamentos"], ["consumiveis", "Consumíveis"], ["tecnicos", "Técnicos"], ["ligacoes", "Ligações"]];
const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
const NOTA = "text-[15px] text-muted-foreground";
// Os valores à direita da linha (preço, custo, margem). No telemóvel passam para uma linha própria por baixo do nome, lado a lado,
// para o nome não ficar espremido numa coluna estreita; a partir de sm voltam a ser a coluna da direita.
const VALORES = "flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right";
const POR_GRUPO = 8, POR_PAGINA = 40;
const CHIP = (on: boolean) => cn("inline-flex min-h-11 items-center rounded-lg border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary/10 font-medium" : "border-input bg-card hover:bg-muted");

// a página lembra-se do separador enquanto a sessão dura (ex.: ao voltar de um orçamento)
let ultimaSeccao: Seccao = "servicos";

function Procurar({ v, onChange, rotulo, ph }: { v: string; onChange: (s: string) => void; rotulo: string; ph: string }) {
  return (
    <label className="relative block w-full max-w-xl">
      <span className="sr-only">{rotulo}</span>
      <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" value={v} onChange={(e) => onChange(e.target.value)} placeholder={ph}
        className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
    </label>
  );
}
function MostrarMais({ faltam, onClick }: { faltam: number; onClick: () => void }) {
  if (faltam <= 0) return null;
  return (
    <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={onClick}>
      Mostrar mais ({faltam})
    </Button>
  );
}
/** 27/10: as fórmulas ficam fechadas; quem quer saber abre. */
const ComoSeCalcula = ({ children }: { children: ReactNode }) => (
  <details className="group mt-6 text-[15px]">
    <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary underline-offset-4 hover:underline">Como se calcula</summary>
    <p className={cn(NOTA, "mt-1")}>{children}</p>
  </details>
);
const Vazio = ({ children }: { children: ReactNode }) => <li className={cn(NOTA, "py-4")}>{children}</li>;
// 27/10: o que se acabou de criar (CriarNoCatalogo) vai para o topo da lista, realçado, com o selo «Novo»
const REALCE = cn("-mx-4 rounded-xl bg-primary/5 px-4 ring-1 ring-primary/30 sm:-mx-5 sm:px-5", ENTRADA);
const Novo = () => <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 align-middle text-xs font-semibold text-primary-foreground"><Sparkles className="h-3 w-3" aria-hidden="true" />Novo</span>;
/** A lista com o elemento realçado à cabeça. */
const primeiro = <T,>(L: readonly T[], e: (x: T) => boolean): T[] => { const i = L.findIndex(e); return i <= 0 ? [...L] : [L[i], ...L.slice(0, i), ...L.slice(i + 1)]; };

/* ------------------------------------------------------------------ serviços */
function LinhaServico({ i, K, onAbrir, min, alvo, compacta, semDesat }: { i: ItemLista & { caminho: string }; K: Catalogo; onAbrir: (sid: SvcId) => void; min: number; alvo: number; compacta?: boolean; semDesat?: boolean }) {
  // 27/10 (Rúben): o "Preço desatualizado" estava em quase todas as linhas; diz-se uma vez por cima da lista (semDesat) e fica por linha só nesse filtro
  const alertas = semDesat ? i.alertas.filter((a) => a.id !== "desatualizado") : i.alertas;
  // 27/10: duas linhas só. À esquerda o nome (e os alertas, se os há); à direita o preço e a margem com a cor dela.
  const baixa = i.alertas.some((a) => a.id === "abaixo-minimo" || a.id === "abaixo-custo");
  const corMargem = baixa ? "text-destructive" : i.m < alvo / 100 - 0.005 ? "text-warning" : "text-success";
  return (
    <li className={ENTRADA}>
      <button id={`svc-${i.sid}`} type="button" onClick={() => onAbrir(i.sid)} className={cn("group flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left transition-colors sm:flex-nowrap sm:gap-4", compacta ? "min-h-12 py-2" : "min-h-16 py-3")}>
        <span className={cn("grid shrink-0 place-items-center rounded-xl bg-muted text-foreground/70 transition-transform duration-200 group-hover:scale-105 group-hover:bg-primary/10 group-hover:text-primary", compacta ? "h-9 w-9" : "h-11 w-11")}><IconeServico k={iconeDoServico(K, i.sid, i.n, i.oficio)} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium group-hover:underline">{i.n}{ehCriado(i.sid) && <span className="ml-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">Criado aqui</span>}</span>
          {alertas.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[15px]">
              {alertas.map((a) => { const { I, cor } = ICONE_ALERTA[a.id]; return <span key={a.id} className="inline-flex items-center gap-1"><I className={cn("h-4 w-4", cor)} aria-hidden="true" />{a.t}</span>; })}
            </span>
          )}
        </span>
        <span className={cn(VALORES, "pl-14 sm:pl-0")}>
          <span className="block text-[15px] font-medium tabular-nums">{eur(i.preco)} €/{i.un}</span>
          <span className={cn("flex items-center gap-1 text-[15px] tabular-nums sm:justify-end", corMargem)}>
            {baixa && <TriangleAlert className="h-4 w-4" aria-hidden="true" />}margem {pct(i.m)}<span className="sr-only">, {margemEmPalavras(i.m, min, alvo)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function Servicos({ S, itens, K, onAbrir, min, alvo }: { S: Ctx["S"]; itens: (ItemLista & { caminho: string; no: string | null })[]; K: Catalogo; onAbrir: (sid: SvcId) => void; min: number; alvo: number }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroV1 | null>(null);
  const [of, setOf] = useState<string | null>(null);
  const [mais, setMais] = useState<Record<string, number>>({});
  const [prefs, setPrefs] = usePrefsCatalogo();
  const ordem = useMemo(() => oficios(K.arvore).map((o) => o.n), [K.arvore]);
  // 23/10: o desempenho (negócios ganhos, horas das obras, técnicos) — S muda no sítio: recalcula a cada render, é barato
  const ds = desempenhoServicos(S), tecs = desempenhoTecnicos(S);
  const comOficio = useMemo(() => itens.map((i) => ({ ...i, oficio: oficioDe(K, i.no) ?? i.oficio })), [itens, K]);
  const ordenar = (L: typeof comOficio, o: Ordem) => L.sort((a, b) =>
    o === "receita" ? (ds.get(b.sid)?.receita ?? 0) - (ds.get(a.sid)?.receita ?? 0) || b.usos - a.usos
      : o === "margem" ? a.m - b.m
        : o === "nome" ? a.n.localeCompare(b.n, "pt")
          : (Number(b.emUso) - Number(a.emUso)) || b.usos - a.usos); // em uso primeiro, depois os mais pedidos
  const grupos = useMemo(() => {
    const L = (pesquisar(comOficio, q) as typeof comOficio).filter((i) => passaFiltroV1(i, filtro) && (!of || i.oficio === of));
    return agruparPorOficio(ordenar(L, prefs.ordem), ordem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comOficio, q, filtro, of, ordem, prefs.ordem, ds]);
  // a coluna dos ofícios: todos (sem o filtro de ofício), com a margem média dos serviços em uso
  const nav = useMemo(() => agruparPorOficio((pesquisar(comOficio, q) as typeof comOficio).filter((i) => passaFiltroV1(i, filtro)), ordem).map((g) => {
    const u = g.itens.filter((i) => i.emUso);
    return { oficio: g.oficio, n: g.itens.length, m: u.length ? u.reduce((a, i) => a + i.m, 0) / u.length : null };
  }), [comOficio, q, filtro, ordem]);
  const total = grupos.reduce((a, g) => a + g.itens.length, 0);
  const nDesat = grupos.reduce((a, g) => a + g.itens.filter((i) => i.alertas.some((x) => x.id === "desatualizado")).length, 0);
  const escolherFiltro = (f: FiltroV1 | null) => { setFiltro(f); setMais({}); };
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
      <div className="min-w-0 xl:col-start-2 xl:row-start-1">
        <div className="flex flex-wrap items-center gap-3">
          <Procurar v={q} onChange={(v) => { setQ(v); setMais({}); }} rotulo="Procurar serviço" ph="Procurar serviço ou ofício" />
          <label className="flex items-center gap-2 text-[15px]"><span className="text-muted-foreground">Ordenar</span>
            <select value={prefs.ordem} onChange={(e) => setPrefs((p) => ({ ...p, ordem: e.target.value as Ordem }))} aria-label="Ordenar os serviços"
              className="h-11 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25">
              {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.t}</option>)}
            </select>
          </label>
        </div>
        <div role="group" aria-label="Mostrar" className="mt-3 flex flex-wrap gap-2 xl:hidden">
          {FILTROS_V1.map((f) => <button key={f.t} type="button" aria-pressed={filtro === f.id} onClick={() => escolherFiltro(f.id)} className={CHIP(filtro === f.id)}>{f.t}</button>)}
        </div>
        <p className={cn(NOTA, "mt-4")} aria-live="polite">{total === 1 ? "1 serviço" : `${total} serviços`}{q.trim() ? ` com «${q.trim()}»` : ""}{of ? ` em ${of}` : ""}
          {of && <button type="button" onClick={() => setOf(null)} className="ml-2 font-medium text-primary underline-offset-4 hover:underline">ver todos</button>}
        </p>
        {nDesat > 0 && filtro !== "desatualizado" && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[15px]">
            <Clock className="h-4 w-4 text-warning" aria-hidden="true" />{nDesat === 1 ? "1 serviço" : `${nDesat} serviços`} com preço desatualizado
            <button type="button" onClick={() => escolherFiltro("desatualizado")} className="min-h-10 px-1 font-medium text-primary underline-offset-4 hover:underline">Ver</button>
          </p>
        )}
        {grupos.map((g) => {
          const n = mais[g.oficio] ?? POR_GRUPO;
          return (
            <section key={g.oficio} aria-label={g.oficio} className="mt-6">
              <h3 className="text-lg font-semibold">{g.oficio} <span className="font-normal text-muted-foreground">· {g.itens.length}</span></h3>
              <ul className={cn(LISTA, "mt-2")}>
                {g.itens.slice(0, n).map((i) => <LinhaServico key={i.sid} i={i} K={K} onAbrir={onAbrir} min={i.min} alvo={alvo} compacta={prefs.compacta} semDesat={filtro !== "desatualizado"} />)}
              </ul>
              <MostrarMais faltam={g.itens.length - n} onClick={() => setMais((m) => ({ ...m, [g.oficio]: n + 20 }))} />
            </section>
          );
        })}
        {!total && <ul className={cn(LISTA, "mt-3")}><Vazio>Nada com esse nome ou filtro.</Vazio></ul>}
      </div>
      <div className="xl:col-start-1 xl:row-start-1">
        <NavOficios grupos={nav} sel={of} onSel={(o) => { setOf(o); setMais({}); }} filtros={FILTROS_V1.map((f) => (
          <button key={f.t} type="button" aria-pressed={filtro === f.id} onClick={() => escolherFiltro(f.id)}
            className={cn("flex min-h-10 items-center rounded-lg px-3 text-left text-[15px] transition-colors", filtro === f.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <span className="sr-only">Mostrar: </span>{f.t}
          </button>
        ))} />
      </div>
      <div className="hidden lg:col-start-2 lg:row-start-1 lg:block xl:col-start-3">
        <div className="lg:sticky lg:top-6">
          <PainelDesempenho itens={comOficio} ds={ds} tecs={tecs} prefs={prefs} setPrefs={setPrefs} onAbrir={onAbrir} />
        </div>
      </div>
    </div>
  );
}
/** O ofício (nome) de um nó da árvore. */
function oficioDe(K: Catalogo, no: string | null): string | null {
  if (!no) return null;
  const n = K.arvore.find((x) => x.id === no);
  if (!n) return null;
  return n.pai == null ? n.n : K.arvore.find((x) => x.id === n.pai)?.n ?? null;
}

/* ------------------------------------------------------------------ produtos */
function Produtos({ K, nomeServico, onAbrir, margem, novo }: { K: Catalogo; nomeServico: (sid: SvcId) => string; onAbrir: (sid: SvcId) => void; margem: number; novo?: string }) {
  const [q, setQ] = useState("");
  const [of, setOf] = useState("");
  const [n, setN] = useState(POR_PAGINA);
  const L = useMemo(() => primeiro(pesquisarProdutos(of ? K.produtos.filter((p) => dentroDe(K.arvore, p.no, of)) : K.produtos, q), (p) => p.id === novo), [K, q, of, novo]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Procurar v={q} onChange={(v) => { setQ(v); setN(POR_PAGINA); }} rotulo="Procurar produto" ph="Nome, marca, referência ou subcategoria" />
        <Escolha rotulo="Ofício" w="w-full sm:w-64" v={of} opcoes={[{ v: "", t: "Todos os ofícios" }, ...oficios(K.arvore).map((o) => ({ v: o.id, t: o.n }))]} onSet={(v) => { setOf(v); setN(POR_PAGINA); }} />
      </div>
      <p className={cn(NOTA, "mt-4")} aria-live="polite">{L.length === 1 ? "1 produto" : `${L.length} produtos`}</p>
      <ul className={cn(LISTA, "mt-2")}>
        {L.slice(0, n).map((p) => (
          <li key={p.id} className={cn("flex min-h-[4.5rem] flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap sm:gap-4", p.id === novo && REALCE)}>
            <Ilustracao k={p.img ?? "generico"} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{p.n}{p.id === novo && <Novo />}</span>
              {(p.marca || p.sku) && <span className={cn(NOTA, "block")}>{[p.marca, p.sku ? `ref. ${p.sku}` : ""].filter(Boolean).join(" · ")}</span>}
              {p.servico && (
                <button type="button" onClick={() => onAbrir(p.servico!)} className="mt-0.5 inline-flex min-h-11 items-center text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline sm:min-h-0">
                  Traz: {nomeServico(p.servico)}
                </button>
              )}
            </span>
            <span className={cn(VALORES, "pl-[4.75rem] sm:pl-0")}>
              <span className="block text-[15px] font-medium tabular-nums">{eur(precoProduto(p, margem))} €/{p.un}</span>
            </span>
          </li>
        ))}
        {!L.length && <Vazio>Nenhum produto com esse nome.</Vazio>}
      </ul>
      <MostrarMais faltam={L.length - n} onClick={() => setN(n + POR_PAGINA)} />
    </>
  );
}

/* ------------------------------------------------------------------ equipamentos */
function Equipamentos({ S, C, mudar, novo }: { S: Ctx["S"]; C: Custos; mudar: (fn: (c: Custos) => void, msg: string) => void; novo?: string }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const campos: [keyof Custos["equip"][number], string, string][] = [["compra", "Compra", "€"], ["residual", "Valor residual", "€"], ["vida", "Vida útil", "h"], ["manutAno", "Manutenção", "€/ano"], ["usoAno", "Uso", "h/ano"]];
  return (
    <>
      <ul className={LISTA}>
        {primeiro(C.equip, (e) => e.id === novo).map((e) => {
          const q = quebraEquip(e), ab = aberto === e.id, u = usosEquip(S, C, e.id);
          return (
            <li key={e.id} className={cn("py-3", e.id === novo && REALCE)}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{e.n}{e.id === novo && <Novo />}</span>
                  <span className={cn(NOTA, "block tabular-nums")}>compra {eur(e.compra)} € · vida útil {nfmt(e.vida)} h{u ? ` · em ${u} ${u === 1 ? "serviço" : "serviços"} em uso` : ""}</span>
                </span>
                <span className={VALORES}>
                  <span className="block text-[15px] font-medium tabular-nums">{eur(q.total)} €/h</span>
                </span>
              </div>
              <button type="button" aria-expanded={ab} aria-label={`${ab ? "Fechar" : "Editar"} ${e.n}`} onClick={() => setAberto(ab ? null : e.id)} className="mt-1 inline-flex min-h-11 items-center text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline">
                {ab ? "Fechar" : "Editar"}
              </button>
              {ab && (
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <label className="col-span-2 grid gap-1 sm:col-span-5"><span className="text-[15px] font-medium">Nome</span>
                    <TextoCelula rotulo="Nome do equipamento" v={e.n} onSet={(v) => mudar((c) => { c.equip.find((x) => x.id === e.id)!.n = v; }, "Nome mudado")} /></label>
                  {campos.map(([k, t, un]) => (
                    <label key={k} className="grid gap-1"><span className="text-[15px] font-medium">{t} ({un})</span>
                      <NumeroCelula rotulo={`${t} de ${e.n}`} w="w-full" v={e[k] as number} onSet={(v) => mudar((c) => { (c.equip.find((x) => x.id === e.id)! as unknown as Record<string, number>)[k] = v; }, `${t} de ${e.n}: ${nfmt(v)} ${un}`)} /></label>
                  ))}
                  <p className={cn(NOTA, "col-span-2 tabular-nums sm:col-span-5")}>{q.texto}</p>
                </div>
              )}
            </li>
          );
        })}
        {!C.equip.length && <Vazio>Sem equipamentos.</Vazio>}
      </ul>
      <ComoSeCalcula>O €/h de cada equipamento: (compra − valor residual) ÷ vida útil + manutenção do ano ÷ horas de uso do ano. Entra no custo dos serviços que o usam.</ComoSeCalcula>
    </>
  );
}

/* ------------------------------------------------------------------ consumíveis */
function Consumiveis({ todos, C, nomeServico, novo }: { todos: ConsCatalogo[]; C: Custos; nomeServico: (sid: SvcId) => string; novo?: string }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState(POR_PAGINA);
  const L = useMemo(() => { const qq = q.trim().toLowerCase(); return primeiro(qq ? todos.filter((x) => `${x.n} ${x.fornecedor}`.toLowerCase().includes(qq)) : todos, (x) => x.n === novo); }, [todos, q, novo]);
  return (
    <>
      <div><Procurar v={q} onChange={(v) => { setQ(v); setN(POR_PAGINA); }} rotulo="Procurar consumível" ph="Nome ou fornecedor" /></div>
      <ul className={cn(LISTA, "mt-4")}>
        {L.slice(0, n).map((x) => (
          <li key={x.n} className={cn("flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap", x.n === novo && REALCE)}>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{x.n}{x.n === novo && <Novo />}</span>
              <span className={cn(NOTA, "block")}>{x.fornecedor} · {x.servicos.length === 0 ? "ainda em nenhum serviço" : `em ${x.servicos.length === 1 ? nomeServico(x.servicos[0]) : `${x.servicos.length} serviços`}`}{x.opcionalEm ? ` · opcional em ${x.opcionalEm}` : ""}</span>
            </span>
            <span className={VALORES}>
              <span className="block text-[15px] font-medium tabular-nums">{eur(x.preco)} €/{x.un}</span>
              <span className={cn("flex items-center gap-1 sm:justify-end text-[15px] tabular-nums", x.desatualizado ? "text-foreground" : "text-muted-foreground")}>
                {x.desatualizado && <Clock className="h-4 w-4 text-warning" aria-hidden="true" />}{dataPT(x.data)}{x.desatualizado ? " · desatualizado" : ""}
              </span>
            </span>
          </li>
        ))}
        {!L.length && <Vazio>Nenhum consumível com esse nome.</Vazio>}
      </ul>
      <MostrarMais faltam={L.length - n} onClick={() => setN(n + POR_PAGINA)} />
    </>
  );
}

/* ------------------------------------------------------------------ técnicos */
function Tecnicos({ S, C, mudar, novo }: { S: Ctx["S"]; C: Custos; mudar: (fn: (c: Custos) => void, msg: string) => void; novo?: string }) {
  const L = primeiro(tecnicosCatalogo(S, C), (t) => t.p.id === novo), direcao = S.role === "direcao";
  return (
    <>
      <ul className={LISTA}>
        {L.map(({ p, eh, servicos, hora }) => (
          <li key={p.id} className={cn("flex min-h-16 flex-wrap items-center gap-3 py-3", p.id === novo && REALCE)}>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{p.n}{p.id === novo && <Novo />}</span>
              <span className={cn(NOTA, "block")}>{servicos ? `${servicos} ${servicos === 1 ? "serviço" : "serviços"} em uso` : "sem serviços em uso"}</span>
              <span className={cn(NOTA, "block")}>{origemHora(hora)}</span>
              {hora.fonte === "rh" && hora.tecnicos.length > 1 && (
                <details className="text-[15px]">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary underline-offset-4 hover:underline">Ver os técnicos ({hora.tecnicos.length})</summary>
                  <ul className={cn(NOTA, "tabular-nums")}>{hora.tecnicos.map((t) => <li key={t.n}>{t.n} · {eur(t.custoHora)} €/h</li>)}</ul>
                </details>
              )}
              {eh == null && <span className="mt-0.5 flex items-start gap-1.5 text-[15px]"><UserX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />Sem custo/hora: conta 0 €.</span>}
            </span>
            {direcao && (
              <label className="flex items-center gap-2"><span className={NOTA}>Salário</span>
                <NumeroCelula rotulo={`Salário de ${p.n}`} v={p.salario ?? 0} onSet={(v) => mudar((c) => { c.perfis.find((x) => x.id === p.id)!.salario = v > 0 ? v : null; }, `Salário de ${p.n}: ${eur(v)} €`)} /><span className={NOTA}>€</span></label>
            )}
            <span className="w-28 shrink-0 text-right text-[15px] font-medium tabular-nums">{eh == null ? "—" : `${eur(eh)} €/h`}</span>
          </li>
        ))}
      </ul>
      <ComoSeCalcula>O custo/hora de cada ofício é a média do custo/hora dos técnicos dele no RH (ficha da pessoa › Obra). Sem técnicos, usa o salário do perfil: salário × {nfmt(C.par.meses)} meses + TSU de {nfmt(C.par.tsu)}% + seguros, a dividir por {nfmt(C.par.horasAno)} h produtivas por ano.</ComoSeCalcula>
    </>
  );
}

/* ------------------------------------------------------------------ a página */
const SECCAO_DO_TIPO: Record<TipoCriar, Seccao> = { servico: "servicos", produto: "produtos", equipamento: "equipamentos", consumivel: "consumiveis", tecnico: "tecnicos" };
const NOME_TIPO: Record<TipoCriar, string> = { servico: "Serviço", produto: "Produto", equipamento: "Equipamento", consumivel: "Consumível", tecnico: "Técnico" };
export function CatalogoV1({ S, run }: Ctx) {
  const C = useCustos();
  const K = useCatalogo();
  // 26/10: a secção e a ficha aberta vão para o endereço (?sec=…, ?servico=…): o "voltar" do browser fecha a ficha e volta à secção
  const [seccao, setSeccaoE] = useParamUrl<Seccao>("sec", ultimaSeccao, SECCOES.map(([k]) => k));
  const setSeccao = (s: Seccao) => { ultimaSeccao = s; setSeccaoE(s); };
  const [pendente] = useState<SvcId | null>(() => tomarFichaPendente());
  const [servicoUrl, setServicoUrl] = useParamUrl<string>("servico", "");
  const aberto: SvcId | null = (servicoUrl || null) as SvcId | null;
  const setAberto = useCallback((sid: SvcId | null) => setServicoUrl(sid ?? ""), [setServicoUrl]);
  // vindo do orçamento ("Abrir a ficha do serviço"): a ficha abre na entrada do Catálogo (depois de a moldura a juntar ao histórico)
  useEffect(() => { if (pendente) { const t = window.setTimeout(() => setServicoUrl(pendente, { substituir: true }), 0); return () => window.clearTimeout(t); } return undefined; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 27/10: o Criar no Catálogo abre no lugar da lista (?criar=servico|produto|…): o "voltar" do browser fecha-o
  const [criar, setCriar] = useParamUrl<TipoCriar | "">("criar", "", ["", ...TIPOS_CRIAR.map((t) => t.k)]);
  const [realce, setRealce] = useState<{ t: TipoCriar; id: string } | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; n: number } | null>(null);
  const voltarPara = useRef<SvcId | null>(null);
  const anunciar = useCallback((msg: string) => setAviso((a) => ({ msg, n: (a?.n ?? 0) + 1 })), []);
  const abrir = useCallback((sid: SvcId) => { setAberto(sid); }, []);

  /** Muda os custos e leva-os aos serviços em uso (o orçamento usa o mesmo custo). */
  const mudar = (fn: (c: Custos) => void, msg: string) => {
    mudarCustos(fn);
    run(() => aplicarTodos(S, lerCustos()));
    anunciar(msg);
  };

  // o separador escolhido fica à vista na barra (no telemóvel a barra desliza)
  useEffect(() => { document.getElementById(`tab-${seccao}`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [seccao, aberto]);

  // Ao voltar da ficha, o foco regressa ao serviço de onde se saiu.
  useEffect(() => {
    if (aberto || !voltarPara.current) return;
    document.getElementById(`svc-${voltarPara.current}`)?.focus();
    voltarPara.current = null;
  }, [aberto]);

  // S muda no sítio: a chave do que as contas leem (serviços e regras), para o useMemo.
  const chave = JSON.stringify(S.svc) + S.cfg.min + ":" + S.cfg.alvo + ":" + S.cfg.estrutura + ":" + S.deals.length;
  const itens = useMemo(
    () => listaCatalogoCompleta(S, C).map((i) => { const no = noDoServico(K, i.sid, i.oficio); return { ...i, no, caminho: no ? caminho(K.arvore, no) : i.oficio }; }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chave, C, K],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const consumiveis = useMemo(() => consumiveisComCriados(S, C, K), [chave, C, K]);
  const nomes = useMemo(() => new Map(itens.map((i) => [i.sid, i.n])), [itens]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catLig = useMemo(() => montarCatalogo(S, C, K), [chave, C, K]);
  /** Abre o separador Ligações centrado num elemento (a partir da ficha). */
  const verLigacoes = useCallback((r: Ref) => { abrirLigacoesEm(r); setSeccao("ligacoes"); setAberto(null); }, []);
  const nomeServico = useCallback((sid: SvcId) => nomes.get(sid) ?? sid, [nomes]);

  const regiao = (
    <div aria-live="polite" role="status" aria-label="Avisos" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex justify-center">
      {aviso && <p key={aviso.n} className={cn("pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)]", ENTRADA)}>{aviso.msg}</p>}
    </div>
  );

  /** O tipo que o botão Criar escolhe, pelo separador aberto. */
  const tipoDaSeccao: TipoCriar = seccao === "produtos" ? "produto" : seccao === "equipamentos" ? "equipamento" : seccao === "consumiveis" ? "consumivel" : seccao === "tecnicos" ? "tecnico" : "servico";
  const criado = (t: TipoCriar, id: string, nome: string) => {
    anunciar(`${NOME_TIPO[t]} «${nome}» criado.`);
    setCriar("", { substituir: true });
    if (t === "servico") { setServicoUrl(id); return; }
    setRealce({ t, id: t === "consumivel" ? nome : id });
    setSeccao(SECCAO_DO_TIPO[t]);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  if (criar) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
        <CriarNoCatalogo S={S} C={C} K={K} run={run} tipo={criar} setTipo={(t) => setCriar(t, { substituir: true })} voltar={() => setCriar("")} onCriado={criado} />
        {regiao}
      </div>
    );
  }

  if (aberto) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
        <FichaServicoSimples key={aberto} S={S} C={C} run={run} sid={aberto} voltar={() => { voltarPara.current = aberto; setAberto(null); }} anunciar={anunciar} verLigacoes={verLigacoes} />
        {regiao}
      </div>
    );
  }

  const tab = (s: Seccao, t: string) => (
    <button key={s} id={`tab-${s}`} type="button" role="tab" aria-selected={seccao === s} aria-controls={`painel-${s}`} tabIndex={seccao === s ? 0 : -1}
      onClick={() => setSeccao(s)}
      onKeyDown={(e) => {
        const i = SECCOES.findIndex(([x]) => x === s), d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        const nova = SECCOES[(i + d + SECCOES.length) % SECCOES.length][0];
        setSeccao(nova);
        requestAnimationFrame(() => document.getElementById(`tab-${nova}`)?.focus());
      }}
      className={cn("min-h-11 shrink-0 whitespace-nowrap border-b-2 px-3 text-[15px] font-medium transition-colors", seccao === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {t}
    </button>
  );
  const corpo: Record<Seccao, () => ReactNode> = {
    servicos: () => <Servicos S={S} itens={itens} K={K} onAbrir={abrir} min={S.cfg.min} alvo={S.cfg.alvo} />,
    produtos: () => <Produtos K={K} nomeServico={nomeServico} onAbrir={abrir} margem={S.cfg.alvo} novo={realce?.t === "produto" ? realce.id : undefined} />,
    equipamentos: () => <Equipamentos S={S} C={C} mudar={mudar} novo={realce?.t === "equipamento" ? realce.id : undefined} />,
    consumiveis: () => <Consumiveis todos={consumiveis} C={C} nomeServico={nomeServico} novo={realce?.t === "consumivel" ? realce.id : undefined} />,
    tecnicos: () => <Tecnicos S={S} C={C} mudar={mudar} novo={realce?.t === "tecnico" ? realce.id : undefined} />,
    ligacoes: () => <LigacoesCatalogo K={catLig} onAbrirFicha={abrir} S={S} run={run} />,
  };

  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
        </div>
        <Button className="h-11 shrink-0 text-[15px] shadow-sm transition-transform hover:-translate-y-0.5" onClick={() => setCriar(tipoDaSeccao)}>
          <Plus className="mr-1 h-5 w-5" aria-hidden="true" />Criar
        </Button>
      </div>
      <div role="tablist" aria-label="Secções do Catálogo" className="mt-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
        {SECCOES.map(([s, t]) => tab(s, t))}
      </div>
      {/* 27/10: o contentor tem sempre a mesma largura (o título e os separadores não saltam); só o corpo das secções estreitas encolhe */}
      <div id={`painel-${seccao}`} role="tabpanel" aria-labelledby={`tab-${seccao}`} className={cn("pt-6", seccao === "ligacoes" ? "max-w-6xl" : seccao !== "servicos" && "max-w-3xl")}>
        {corpo[seccao]()}
      </div>
      {regiao}
    </div>
  );
}

