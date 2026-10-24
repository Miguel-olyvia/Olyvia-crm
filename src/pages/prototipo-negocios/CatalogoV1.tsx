// O Catálogo do V1 (14/10/2026): seis secções em separadores (Serviços, Produtos, Equipamentos,
// Consumíveis, Técnicos e Ligações, o mapa das relações em LigacoesCatalogo.tsx), com o modelo completo da V2 (custos, receitas, produtos), no aspeto
// simples. Tocar num serviço abre a ficha do serviço no lugar da lista (FichaServicoSimples).
// Escala para centenas de serviços e milhares de produtos: as contas ficam em useMemo e as listas
// mostram aos poucos ("Mostrar mais").
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Clock, Search, TriangleAlert, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type SvcId } from "./motor";
import type { Ctx } from "./pecas";
import { aplicarTodos, dataPT, listaCatalogoCompleta, mediaHora, pesquisar, type Custos, type ItemLista } from "./v2/custosModelo";
import { lerCustos, mudarCustos, useCustos } from "./v2/custosStore";
import { caminho, dentroDe, noDoServico, oficios, type Catalogo } from "./v2/catalogoModelo";
import { useCatalogo } from "./v2/catalogoStore";
import { ICONE_ALERTA, NumeroCelula, TextoCelula, Escolha } from "./v2/pecasCustos";
import { IconeServico, Ilustracao } from "./ilustracoes";
import { FichaServicoSimples } from "./FichaServicoSimples";
import { tomarFichaPendente } from "./fichaNav";
import { montarCatalogo, type Ref } from "./ligacoes";
import { LigacoesCatalogo, abrirLigacoesEm } from "./LigacoesCatalogo";
import {
  FILTROS_V1, agruparPorOficio, consumiveisCatalogo, iconeDoServico, margemEmPalavras, passaFiltroV1, pesquisarProdutos, precoProduto,
  quebraEquip, tecnicosCatalogo, usosEquip, type ConsCatalogo, type FiltroV1,
} from "./fichaServico";

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
function MostrarMais({ faltam, passo, onClick, de }: { faltam: number; passo: number; onClick: () => void; de?: string }) {
  if (faltam <= 0) return null;
  return (
    <Button variant="outline" className="mt-3 h-auto min-h-11 max-w-full whitespace-normal text-left text-[15px]" onClick={onClick}>
      Mostrar mais {Math.min(passo, faltam)}{de ? ` de ${de}` : ""} <span className="text-muted-foreground">(faltam {faltam})</span>
    </Button>
  );
}
const Vazio = ({ children }: { children: ReactNode }) => <li className={cn(NOTA, "py-4")}>{children}</li>;

/* ------------------------------------------------------------------ serviços */
function LinhaServico({ i, K, onAbrir, min, alvo }: { i: ItemLista & { caminho: string }; K: Catalogo; onAbrir: (sid: SvcId) => void; min: number; alvo: number }) {
  const baixa = i.alertas.some((a) => a.id === "abaixo-minimo" || a.id === "abaixo-custo");
  return (
    <li>
      <button id={`svc-${i.sid}`} type="button" onClick={() => onAbrir(i.sid)} className="group flex min-h-16 w-full flex-wrap items-center gap-x-3 gap-y-1 py-3 text-left sm:flex-nowrap sm:gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70"><IconeServico k={iconeDoServico(K, i.sid, i.n, i.oficio)} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium group-hover:underline">{i.n}</span>
          <span className={cn(NOTA, "block")}>por {i.un} · {i.emUso ? "em uso" : "não usado"}{i.usos > 0 ? ` · em ${i.usos} orçamentos` : ""}</span>
          {i.alertas.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[15px]">
              {i.alertas.map((a) => { const { I, cor } = ICONE_ALERTA[a.id]; return <span key={a.id} className="inline-flex items-center gap-1"><I className={cn("h-4 w-4", cor)} aria-hidden="true" />{a.t}</span>; })}
            </span>
          )}
        </span>
        <span className={cn(VALORES, "pl-14 sm:pl-0")}>
          <span className="block text-[15px] font-medium tabular-nums">{eur(i.preco)} €/{i.un}</span>
          <span className={cn(NOTA, "block tabular-nums")}>custo {eur(i.c.total)} €</span>
          <span className={cn("flex items-center gap-1 text-[15px] tabular-nums sm:justify-end", baixa ? "text-foreground" : "text-muted-foreground")}>
            {baixa && <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />}margem {pct(i.m)}<span className="sr-only">, {margemEmPalavras(i.m, min, alvo)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

function Servicos({ itens, K, onAbrir, min, alvo }: { itens: (ItemLista & { caminho: string; no: string | null })[]; K: Catalogo; onAbrir: (sid: SvcId) => void; min: number; alvo: number }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroV1 | null>(null);
  const [mais, setMais] = useState<Record<string, number>>({});
  const ordem = useMemo(() => oficios(K.arvore).map((o) => o.n), [K.arvore]);
  const grupos = useMemo(() => {
    const L = (pesquisar(itens, q) as typeof itens).filter((i) => passaFiltroV1(i, filtro));
    // em uso primeiro, depois os mais pedidos
    L.sort((a, b) => (Number(b.emUso) - Number(a.emUso)) || b.usos - a.usos);
    return agruparPorOficio(L.map((i) => ({ ...i, oficio: oficioDe(K, i.no) ?? i.oficio })), ordem);
  }, [itens, q, filtro, K, ordem]);
  const total = grupos.reduce((a, g) => a + g.itens.length, 0);
  return (
    <>
      <Procurar v={q} onChange={(v) => { setQ(v); setMais({}); }} rotulo="Procurar serviço" ph="Procurar serviço ou ofício" />
      <div role="group" aria-label="Mostrar" className="mt-3 flex flex-wrap gap-2">
        {FILTROS_V1.map((f) => <button key={f.t} type="button" aria-pressed={filtro === f.id} onClick={() => { setFiltro(f.id); setMais({}); }} className={CHIP(filtro === f.id)}>{f.t}</button>)}
      </div>
      <p className={cn(NOTA, "mt-4")} aria-live="polite">{total === 1 ? "1 serviço" : `${total} serviços`}{q.trim() ? ` com «${q.trim()}»` : ""}</p>
      {grupos.map((g) => {
        const n = mais[g.oficio] ?? POR_GRUPO;
        return (
          <section key={g.oficio} aria-label={g.oficio} className="mt-6">
            <h3 className="text-lg font-semibold">{g.oficio} <span className="font-normal text-muted-foreground">· {g.itens.length}</span></h3>
            <ul className={cn(LISTA, "mt-2")}>
              {g.itens.slice(0, n).map((i) => <LinhaServico key={i.sid} i={i} K={K} onAbrir={onAbrir} min={i.min} alvo={alvo} />)}
            </ul>
            <MostrarMais faltam={g.itens.length - n} passo={20} de={g.oficio} onClick={() => setMais((m) => ({ ...m, [g.oficio]: n + 20 }))} />
          </section>
        );
      })}
      {!total && <ul className={cn(LISTA, "mt-3")}><Vazio>Nada com esse nome ou filtro.</Vazio></ul>}
      <p className={cn(NOTA, "mt-6")}>Exemplo: nomes, horas e usos são os do Catálogo da Mudelar; custos e preços são de exemplo. Mínimo geral {min}%, alvo {alvo}%.</p>
    </>
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
function Produtos({ K, nomeServico, onAbrir, margem }: { K: Catalogo; nomeServico: (sid: SvcId) => string; onAbrir: (sid: SvcId) => void; margem: number }) {
  const [q, setQ] = useState("");
  const [of, setOf] = useState("");
  const [n, setN] = useState(POR_PAGINA);
  const L = useMemo(() => pesquisarProdutos(of ? K.produtos.filter((p) => dentroDe(K.arvore, p.no, of)) : K.produtos, q), [K, q, of]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Procurar v={q} onChange={(v) => { setQ(v); setN(POR_PAGINA); }} rotulo="Procurar produto" ph="Nome, marca, referência ou subcategoria" />
        <Escolha rotulo="Ofício" w="w-full sm:w-64" v={of} opcoes={[{ v: "", t: "Todos os ofícios" }, ...oficios(K.arvore).map((o) => ({ v: o.id, t: o.n }))]} onSet={(v) => { setOf(v); setN(POR_PAGINA); }} />
      </div>
      <p className={cn(NOTA, "mt-4")} aria-live="polite">{L.length === 1 ? "1 produto" : `${L.length} produtos`}</p>
      <ul className={cn(LISTA, "mt-2")}>
        {L.slice(0, n).map((p) => (
          <li key={p.id} className="flex min-h-[4.5rem] flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap sm:gap-4">
            <Ilustracao k={p.img ?? "generico"} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{p.n}</span>
              <span className={cn(NOTA, "block")}>{[p.marca, p.sku ? `ref. ${p.sku}` : "", p.sub ?? caminho(K.arvore, p.no)].filter(Boolean).join(" · ")}</span>
              {p.desc && <span className={cn(NOTA, "block")}>{p.desc}</span>}
              {p.servico && (
                <button type="button" onClick={() => onAbrir(p.servico!)} className="mt-0.5 inline-flex min-h-11 items-center text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline sm:min-h-0">
                  Traz: {nomeServico(p.servico)}
                </button>
              )}
            </span>
            <span className={cn(VALORES, "pl-[4.75rem] sm:pl-0")}>
              <span className="block text-[15px] font-medium tabular-nums">{eur(precoProduto(p, margem))} €</span>
              <span className={cn(NOTA, "block")}>{p.pvp != null ? "PVP" : `custo ${eur(p.custo)} €`} / {p.un}</span>
            </span>
          </li>
        ))}
        {!L.length && <Vazio>Nenhum produto com esse nome.</Vazio>}
      </ul>
      <MostrarMais faltam={L.length - n} passo={POR_PAGINA} onClick={() => setN(n + POR_PAGINA)} />
      <p className={cn(NOTA, "mt-4")}>Sem PVP, o preço é o custo com a margem-alvo de {margem}%.</p>
    </>
  );
}

/* ------------------------------------------------------------------ equipamentos */
function Equipamentos({ S, C, mudar }: { S: Ctx["S"]; C: Custos; mudar: (fn: (c: Custos) => void, msg: string) => void }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const campos: [keyof Custos["equip"][number], string, string][] = [["compra", "Compra", "€"], ["residual", "Valor residual", "€"], ["vida", "Vida útil", "h"], ["manutAno", "Manutenção", "€/ano"], ["usoAno", "Uso", "h/ano"]];
  return (
    <>
      <p className={NOTA}>O €/h de cada equipamento: (compra − valor residual) ÷ vida útil + manutenção do ano ÷ horas de uso do ano. Entra no custo dos serviços que o usam.</p>
      <ul className={cn(LISTA, "mt-4")}>
        {C.equip.map((e) => {
          const q = quebraEquip(e), ab = aberto === e.id, u = usosEquip(S, C, e.id);
          return (
            <li key={e.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{e.n}</span>
                  <span className={cn(NOTA, "block tabular-nums")}>compra {eur(e.compra)} € · vida útil {nfmt(e.vida)} h{u ? ` · em ${u} ${u === 1 ? "serviço" : "serviços"} em uso` : ""}</span>
                </span>
                <span className={VALORES}>
                  <span className="block text-[15px] font-medium tabular-nums">{eur(q.total)} €/h</span>
                  <span className={cn(NOTA, "block tabular-nums")}>depreciação {eur(q.deprec)} + manutenção {eur(q.manut)}</span>
                </span>
              </div>
              <button type="button" aria-expanded={ab} onClick={() => setAberto(ab ? null : e.id)} className="mt-1 inline-flex min-h-11 items-center text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline">
                {ab ? "Fechar" : `Mudar os números de ${e.n}`}
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
      <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => mudar((c) => { c.equip.push({ id: "e-novo-" + (c.equip.length + 1), n: "Novo equipamento", compra: 0, vida: 1000, residual: 0, manutAno: 0, usoAno: 600 }); }, "Equipamento juntado")}>
        Juntar equipamento
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ consumíveis */
function Consumiveis({ todos, C, nomeServico }: { todos: ConsCatalogo[]; C: Custos; nomeServico: (sid: SvcId) => string }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState(POR_PAGINA);
  const L = useMemo(() => { const qq = q.trim().toLowerCase(); return qq ? todos.filter((x) => `${x.n} ${x.fornecedor}`.toLowerCase().includes(qq)) : todos; }, [todos, q]);
  return (
    <>
      <p className={NOTA}>Os consumíveis das receitas dos serviços, com o preço mais recente. Ao fim de {C.par.mesesDesatualizado} meses o preço fica desatualizado; muda-se na ficha do serviço.</p>
      <div className="mt-4"><Procurar v={q} onChange={(v) => { setQ(v); setN(POR_PAGINA); }} rotulo="Procurar consumível" ph="Nome ou fornecedor" /></div>
      <ul className={cn(LISTA, "mt-4")}>
        {L.slice(0, n).map((x) => (
          <li key={x.n} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{x.n}</span>
              <span className={cn(NOTA, "block")}>{x.fornecedor} · em {x.servicos.length === 1 ? nomeServico(x.servicos[0]) : `${x.servicos.length} serviços`}{x.opcionalEm ? ` · opcional em ${x.opcionalEm}` : ""}</span>
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
      <MostrarMais faltam={L.length - n} passo={POR_PAGINA} onClick={() => setN(n + POR_PAGINA)} />
    </>
  );
}

/* ------------------------------------------------------------------ técnicos */
function Tecnicos({ S, C, mudar }: { S: Ctx["S"]; C: Custos; mudar: (fn: (c: Custos) => void, msg: string) => void }) {
  const L = tecnicosCatalogo(S, C), direcao = S.role === "direcao", media = mediaHora(C);
  return (
    <>
      <p className={NOTA}>O tipo de técnico de cada passo das fichas. O custo/hora = salário × {nfmt(C.par.meses)} meses + TSU de {nfmt(C.par.tsu)}% + seguros, a dividir por {nfmt(C.par.horasAno)} h produtivas por ano.</p>
      <ul className={cn(LISTA, "mt-4")}>
        {L.map(({ p, eh, servicos }) => (
          <li key={p.id} className="flex min-h-16 flex-wrap items-center gap-3 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{p.n}</span>
              <span className={cn(NOTA, "block")}>{servicos ? `${servicos} ${servicos === 1 ? "serviço" : "serviços"} em uso` : "sem serviços em uso"}{direcao ? "" : " · o salário só a Direção vê"}</span>
              {eh == null && <span className="mt-0.5 flex items-start gap-1.5 text-[15px]"><UserX className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Técnico sem custo/hora: usa a média ({eur(media)} €/h).</span>}
            </span>
            {direcao && (
              <label className="flex items-center gap-2"><span className={NOTA}>Salário</span>
                <NumeroCelula rotulo={`Salário de ${p.n}`} v={p.salario ?? 0} onSet={(v) => mudar((c) => { c.perfis.find((x) => x.id === p.id)!.salario = v > 0 ? v : null; }, `Salário de ${p.n}: ${eur(v)} €`)} /><span className={NOTA}>€</span></label>
            )}
            <span className="w-28 shrink-0 text-right text-[15px] font-medium tabular-nums">{eh == null ? "—" : `${eur(eh)} €/h`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------ a página */
export function CatalogoV1({ S, run }: Ctx) {
  const C = useCustos();
  const K = useCatalogo();
  const [seccao, setSeccaoE] = useState<Seccao>(ultimaSeccao);
  const setSeccao = (s: Seccao) => { ultimaSeccao = s; setSeccaoE(s); };
  const [aberto, setAberto] = useState<SvcId | null>(() => tomarFichaPendente());
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
  const consumiveis = useMemo(() => consumiveisCatalogo(S, C), [chave, C]);
  const nomes = useMemo(() => new Map(itens.map((i) => [i.sid, i.n])), [itens]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catLig = useMemo(() => montarCatalogo(S, C, K), [chave, C, K]);
  /** Abre o separador Ligações centrado num elemento (a partir da ficha). */
  const verLigacoes = useCallback((r: Ref) => { abrirLigacoesEm(r); setSeccao("ligacoes"); setAberto(null); }, []);
  const nomeServico = useCallback((sid: SvcId) => nomes.get(sid) ?? sid, [nomes]);

  const regiao = (
    <div aria-live="polite" role="status" aria-label="Avisos" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex justify-center">
      {aviso && <p key={aviso.n} className="pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)] animate-in fade-in-0">{aviso.msg}</p>}
    </div>
  );

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
    servicos: () => <Servicos itens={itens} K={K} onAbrir={abrir} min={S.cfg.min} alvo={S.cfg.alvo} />,
    produtos: () => <Produtos K={K} nomeServico={nomeServico} onAbrir={abrir} margem={S.cfg.alvo} />,
    equipamentos: () => <Equipamentos S={S} C={C} mudar={mudar} />,
    consumiveis: () => <Consumiveis todos={consumiveis} C={C} nomeServico={nomeServico} />,
    tecnicos: () => <Tecnicos S={S} C={C} mudar={mudar} />,
    ligacoes: () => <LigacoesCatalogo K={catLig} onAbrirFicha={abrir} S={S} run={run} />,
  };

  return (
    <div className={cn("mx-auto w-full px-4 pb-24 pt-8 sm:px-8 sm:pt-12", seccao === "ligacoes" ? "max-w-6xl" : "max-w-3xl")}>
      <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
      <p className="mt-2 text-lg text-muted-foreground">Cada serviço com a sua ficha: medida, quem faz, equipamentos, consumíveis e preço. O orçamento tira daqui o custo.</p>
      <div role="tablist" aria-label="Secções do Catálogo" className="mt-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
        {SECCOES.map(([s, t]) => tab(s, t))}
      </div>
      <div id={`painel-${seccao}`} role="tabpanel" aria-labelledby={`tab-${seccao}`} className="pt-6">
        {corpo[seccao]()}
      </div>
      {regiao}
    </div>
  );
}

