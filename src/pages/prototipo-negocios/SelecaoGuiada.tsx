// A etapa "Necessidades do cliente" guiada (14/10/2026, versão Atual), para o comercial de pé, com o telemóvel numa mão:
// um passo de cada vez, com uma barra de progresso compacta e o "Seguinte" fixo em baixo, ao alcance do polegar.
//   O que se faz → uma pergunta por troca ("Mantém / Troca" e logo os produtos dessa troca; escolhido o produto, avança-se
//   sozinho) → Mais produtos → Escolhas do cliente → O que o cliente fornece, por serviço (só com "Sim") → Resumo.
// Os cartões ligam e desligam ao toque (aria-pressed); a quantidade vem das medidas ou é 1, escrita no cartão
// ("12 m² · da visita"), com um "Mudar" discreto no cartão escolhido. A lógica está em selecao.ts e forneceCliente.ts.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { itemCatalogo } from "./catalogo";
import { Campos, aValidar } from "./CamposFase";
import { ESCOLHAS, efetivo, emFalta, visivel } from "./campos";
import { eur, nfmt, servicosVisita, type MedKey, type Negocio, type SvcId } from "./motor";
import { type Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import { useCustos } from "./v2/custosStore";
import { type Catalogo, type Produto } from "./v2/catalogoModelo";
import { CONSUMIVEIS } from "./equipamentosCliente";
import { orcLinhas } from "./ServicosCatalogo";
import { Ilustracao, ilustracaoDe, type IlustracaoKey } from "./ilustracoes";
import { nosAbaixo, obrigacoes, precoUnitario, produtosDoRamo, qtdSugerida, type Obrigacao } from "./produtosVisita";
import {
  filtrarProdutos, ilustracaoDoCatalogo, medidaDaSugestao, nomeCurto, objetoDaPergunta, obrigacoesAMostrar, ordenarParaObjeto, resumoNecessidades,
  servicoLeitura, tilesServicos, tocarProdutoGuiado, type TileServico,
} from "./necessidades";
import {
  CORES, blocosFornece, categoriaFiltro, categoriasDaLista, contavel, encurtar, escreverCores, fornecerTodos, lerCores, marcarFornece, poupanca, quantidadeDaRegra,
  notaNaLinha, oficiosPorUso, ordenarMobilidade, ordenarParaTroca, passosSelecao, qtdServicoAoEscolher, responderTroca, servicosFiltrados, textoQtd, tocarProduto,
  tocarServico, trocaResolvida, vizinho, type BlocoFornece, type ItemFornece, type PassoSel,
} from "./selecao";
import { CartaoProduto, CartaoResposta, CartaoServico, FiltrosFila, Pesquisa, QtdMudar } from "./CartoesSelecao";
import { useGuiaPasso } from "./guiaPasso";

type P = Ctx & { d: Negocio; simples?: boolean };
const PRIMEIROS_SVC = 6, PRIMEIROS_PROD = 6, PRIMEIROS_FORN = 6, MAIS = 12;
const GRELHA_SVC = "grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))]";
const GRELHA_FORN = "grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))]";
const GRELHA_PROD = "grid items-start gap-2 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]";
const nomeSvc = (S: Ctx["S"], sid: SvcId) => S.svc[sid]?.n ?? itemCatalogo(sid)?.n ?? sid;
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/* ================================================================== o passo guiado */
export function SelecaoGuiada(ctx: P) {
  const { S, d } = ctx;
  const K = useCatalogo();
  const guia = useGuiaPasso();
  const v = d.visita;
  const clienteFornece = d.f.materiais_cliente === "Sim";
  const esc = efetivo(S.campos, ESCOLHAS);
  const comEscolhas = !esc.oculto;
  const obr = obrigacoesAMostrar(obrigacoes(K, servicosVisita(d), v, clienteFornece), d);
  const passos = passosSelecao(obr, clienteFornece, comEscolhas);
  const faltaEscolhas = comEscolhas && emFalta([esc], d.f).length > 0;

  // abre onde se ficou: nos serviços (nada mexido), na primeira troca por resolver, nas Escolhas por responder, ou no resumo
  const [k, setK] = useState(() => {
    if (aValidar(d, "nec") || aValidar(d, ESCOLHAS.titulo)) return "resumo";
    const mexeu = Object.keys(v.manter ?? {}).length + (v.prod ?? []).length + Object.keys(v.extra).length;
    if (!mexeu) return "servicos";
    const q = obr.find((o) => !o.cumprida);
    return q ? "q:" + q.sid : faltaEscolhas ? "escolhas" : "resumo";
  });
  const iAntes = useRef(0);
  let i = passos.findIndex((p) => p.k === k);
  if (i < 0) i = Math.min(iAntes.current, passos.length - 1);
  iAntes.current = i;
  const atual = passos[i];
  const passosRef = useRef(passos);
  passosRef.current = passos;

  // enquanto está aberto, o "Seguinte" é deste passo (a fase esconde o "Continuar" e não salta sozinha)
  useEffect(() => { guia?.setGuiado(true); return () => guia?.setGuiado(false); }, [guia]);

  // avançar sozinho (depois de "Mantém" ou de escolher o produto da troca); qualquer outro toque cancela
  const auto = useRef<number | undefined>();
  const cancelar = () => { if (auto.current) { window.clearTimeout(auto.current); auto.current = undefined; } };
  useEffect(() => cancelar, []);
  const avancarSozinho = (de: string) => {
    cancelar();
    auto.current = window.setTimeout(() => {
      auto.current = undefined;
      setK((cur) => (cur === de ? vizinho(passosRef.current, de, 1) ?? cur : cur));
    }, 550);
  };
  const ir = (kk: string) => { cancelar(); setK(kk); };
  const seguinte = () => { const n = vizinho(passos, atual.k, 1); if (n) ir(n); else guia?.avancar(); };
  const anterior = () => { const n = vizinho(passos, atual.k, -1); if (n) ir(n); else guia?.recuar(); };

  // ao mudar de passo: o topo do passo à vista e o foco no título
  const topo = useRef<HTMLDivElement>(null);
  const tit = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    topo.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    tit.current?.focus({ preventScroll: true });
  }, [atual.k]);

  const r = resumoNecessidades(S, d, orcLinhas(d, S));
  const fim = atual.tipo === "resumo";
  const titulo = atual.tipo === "pergunta" && atual.o ? atual.o.pergunta ?? `Escolha ${atual.titulo.toLowerCase()}` : atual.titulo;
  const sub = atual.tipo === "pergunta" && atual.o ? `Para ${nomeCurto(nomeSvc(S, atual.o.sid)).toLowerCase()}`
    : atual.tipo === "servicos" ? "Toque para ligar ou desligar." : atual.tipo === "fornece" ? "Por serviço: toque no que o cliente traz. Sai do preço; a mão de obra e a instalação ficam." : null;

  return (
    <div ref={topo} className="scroll-mt-4" onPointerDownCapture={cancelar} onKeyDownCapture={cancelar}>
      {/* progresso compacto */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {passos.map((p, j) => <span key={p.k} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", j <= i ? "bg-primary" : "bg-muted")} />)}
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{i + 1} de {passos.length}</p>
      </div>

      <div key={atual.k} className="mt-4 animate-in fade-in-0 duration-200">
        <h3 ref={tit} tabIndex={-1} className="text-xl font-semibold leading-snug text-foreground outline-none">{titulo}</h3>
        {sub && <p className="mt-1 text-[15px] text-muted-foreground">{sub}</p>}
        <div className="mt-4">
          {atual.tipo === "escolhas" && <PassoEscolhas ctx={ctx} />}
          {atual.tipo === "servicos" && <PassoServicos ctx={ctx} K={K} />}
          {atual.tipo === "pergunta" && atual.o && <PassoPergunta key={atual.o.sid} ctx={ctx} K={K} o={atual.o} resolvido={() => avancarSozinho(atual.k)} />}
          {atual.tipo === "outros" && <PassoOutros ctx={ctx} K={K} obr={obr} />}
          {atual.tipo === "fornece" && <PassoFornece ctx={ctx} obr={obr} />}
          {atual.tipo === "resumo" && <PassoResumo ctx={ctx} K={K} passos={passos} obr={obr} ir={ir} />}
        </div>
      </div>

      {/* "Seguinte" fixo em baixo, ao alcance do polegar (no telemóvel, o padding do main já deixa o menu de fora) */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
        <button type="button" onClick={anterior} aria-label="Voltar"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-input bg-card text-foreground transition-colors hover:border-foreground/40">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <p className="min-w-0 flex-1 text-sm leading-tight text-muted-foreground" aria-live="polite">
          <span className="block font-semibold tabular-nums text-foreground">{eur(r.total)} €</span>
          <span className="block truncate">{plural(r.servicos, "serviço", "serviços")} · {plural(r.produtos, "produto", "produtos")}</span>
        </p>
        {(!fim || guia) && (
          <Button size="lg" className="h-12 shrink-0 px-6" onClick={seguinte}>
            {fim ? "Continuar" : "Seguinte"}<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== Escolhas do cliente */
function PassoEscolhas({ ctx }: { ctx: P }) {
  const { S, A, run, d } = ctx;
  const esc = efetivo(S.campos, ESCOLHAS);
  const validar = aValidar(d, ESCOLHAS.titulo);
  const set = (k: string, x: string) => run(() => A.campo(d.id, k, x));
  const vis = esc.campos.filter((c) => visivel(c, d.f));
  const resto = vis.filter((c) => c.t !== "sim_nao" && c.k !== "cor_estilo");
  return (
    <div className="space-y-6">
      {vis.filter((c) => c.t === "sim_nao").map((c) => {
        const val = d.f[c.k], erro = validar && !val;
        return (
          <fieldset key={c.k}>
            <legend className={cn("text-[15px] font-medium", erro ? "text-destructive" : "text-foreground")}>{c.l}{erro && " · falta responder"}</legend>
            {c.ajuda && <p className="text-sm text-muted-foreground">{c.ajuda}</p>}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <CartaoResposta on={val === "Sim"} titulo="Sim" onTocar={() => set(c.k, val === "Sim" ? "" : "Sim")} />
              <CartaoResposta on={val === "Não"} titulo="Não" onTocar={() => set(c.k, val === "Não" ? "" : "Não")} />
            </div>
          </fieldset>
        );
      })}
      {vis.some((c) => c.k === "cor_estilo") && <Cores ctx={ctx} rotulo={vis.find((c) => c.k === "cor_estilo")!.l} />}
      {resto.length > 0 && <Campos grupo={{ ...esc, campos: resto }} d={d} A={A} run={run} simples />}
    </div>
  );
}

/** Cores e estilo: escolhas rápidas (várias), e texto livre só em "Outro". */
function Cores({ ctx, rotulo }: { ctx: P; rotulo: string }) {
  const { A, run, d } = ctx;
  const { escolhidas, outro } = lerCores(d.f.cor_estilo);
  const [comOutro, setComOutro] = useState(!!outro);
  const gravar = (e: string[], o: string) => run(() => A.campo(d.id, "cor_estilo", escreverCores(e, o)));
  const b = (on: boolean) => cn("min-h-11 rounded-xl border px-4 text-[15px] transition-colors duration-150",
    on ? "border-primary bg-primary/[0.06] font-medium text-foreground ring-1 ring-primary" : "border-input bg-card text-foreground hover:border-foreground/40");
  return (
    <fieldset>
      <legend className="text-[15px] font-medium text-foreground">{rotulo} <span className="font-normal text-muted-foreground">(opcional)</span></legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {CORES.map((c) => {
          const on = escolhidas.includes(c);
          return <button key={c} type="button" aria-pressed={on} className={b(on)} onClick={() => gravar(on ? escolhidas.filter((x) => x !== c) : [...escolhidas, c], outro)}>{c}</button>;
        })}
        <button type="button" aria-pressed={comOutro} className={b(comOutro)} onClick={() => { if (comOutro && outro) gravar(escolhidas, ""); setComOutro(!comOutro); }}>Outro</button>
      </div>
      {comOutro && (
        <label className="mt-2 block">
          <span className="sr-only">Outra cor ou estilo</span>
          <input key={outro} defaultValue={outro} autoFocus={!outro} placeholder="Ex.: verde-água, industrial"
            className="h-12 w-full max-w-md rounded-xl border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            onBlur={(e) => { if (e.target.value.trim() !== outro) gravar(escolhidas, e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        </label>
      )}
    </fieldset>
  );
}

/* ================================================================== O que se faz */
function PassoServicos({ ctx, K }: { ctx: P; K: Catalogo }) {
  const { S, A, run, d } = ctx;
  const C = useCustos();
  const v = d.visita;
  const [q, setQ] = useState("");
  const [of, setOf] = useState<string | null>(null);
  const [n, setN] = useState(PRIMEIROS_SVC);
  const medidaDe = (sid: SvcId) => (C.receitas?.[sid] as { medida?: MedKey | null } | undefined)?.medida ?? null;
  const tiles = tilesServicos(S, K, d);
  const porSid = new Map(tiles.map((t) => [t.sid, t]));
  // a ordem e os filtros ficam parados enquanto se toca (os cartões não saltam debaixo do dedo)
  const ofs = useMemo(() => oficiosPorUso(tiles, d.linha), [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ordem = useMemo(() => servicosFiltrados(tiles, { q, oficio: of, linha: d.linha }).map((t) => t.sid), [q, of, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const lista = ordem.map((sid) => porSid.get(sid)).filter((t): t is TileServico => !!t);

  // a quantidade em texto: "12 m² · da visita" (a da medida) ou "1 un"; mudada à mão, deixa de dizer "da visita"
  const linha2 = (t: TileServico, daMedida: MedKey | null, detalhe: string) => {
    const manual = (v.extra[t.sid] || 0) > 0;
    if (t.origem === "pacote") return t.semMedida ? "Falta a medida" : t.on ? textoQtd({ q: t.qt, un: t.un, daMedida: true }) : "Do pacote · não entra";
    if (t.de && !manual) return `Vem com ${t.de.join(", ")}`;
    if (t.on) return textoQtd({ q: t.qt, un: t.un, daMedida: !!daMedida && t.qt === qtdServicoAoEscolher({ id: t.sid, n: t.n, un: t.un, qm: 1 }, d, medidaDe(t.sid)) });
    return detalhe || `${eur(t.preco)} €/${t.un}`;
  };
  return (
    <div className="space-y-3">
      <Pesquisa valor={q} onMudar={(x) => { setQ(x); setN(PRIMEIROS_SVC); }} rotulo="Procurar serviço" ph="Procurar: nicho, toalheiro, gás…" />
      <FiltrosFila opcoes={ofs} ativo={of} onMudar={(x) => { setOf(x); setN(PRIMEIROS_SVC); }} rotulo="Filtrar por área" />
      {q.trim() && <p className="text-sm text-muted-foreground" aria-live="polite">{lista.length ? plural(lista.length, "serviço", "serviços") : "Nenhum serviço com esse nome."}</p>}
      <ul className={GRELHA_SVC} aria-label="Serviços">
        {lista.slice(0, n).map((t) => {
          const manual = (v.extra[t.sid] || 0) > 0;
          const daMedida = t.origem === "catalogo" ? medidaDaSugestao({ id: t.sid, n: t.n, un: t.un }, d, medidaDe(t.sid)) : t.medida;
          const { nome, detalhe } = encurtar(t.n, { servico: true });
          return (
            <CartaoServico key={t.sid} nome={nome} nomeCompleto={t.n} icone={t.icone} on={t.on} so={!!t.de && !manual} desativado={t.semMedida}
              linha2={linha2(t, daMedida, detalhe)} onTocar={() => run(() => { tocarServico(A, d, t, medidaDe(t.sid)); })}>
              {t.on && manual && (
                <QtdMudar id={`sq-${t.sid}-${d.id}`} valor={t.qt} un={t.un} nome={nome} onMudar={(x) => run(() => A.extra(d.id, t.sid, x))} />
              )}
            </CartaoServico>
          );
        })}
      </ul>
      {lista.length > n && (
        <button type="button" onClick={() => setN((x) => x + MAIS)}
          className="min-h-11 w-full rounded-xl border border-input bg-card px-4 text-[15px] font-medium text-foreground transition-colors hover:border-foreground/40">
          Ver mais {Math.min(MAIS, lista.length - n)}
        </button>
      )}
    </div>
  );
}

/* ================================================================== uma lista de produtos (pesquisa, filtros, os primeiros) */
function ListaProdutos({ ctx, K, produtos, onTocar, rotulo }: { ctx: P; K: Catalogo; produtos: Produto[]; onTocar: (p: Produto) => void; rotulo: string }) {
  const { A, run, d } = ctx;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [n, setN] = useState(PRIMEIROS_PROD);
  const cats = useMemo(() => categoriasDaLista(produtos, K.arvore), [produtos, K.arvore]);
  const lista = useMemo(() => {
    const f = filtrarProdutos(produtos, K.arvore, { q });
    return cat ? f.filter((p) => categoriaFiltro(p, K.arvore) === cat) : f;
  }, [produtos, K.arvore, q, cat]);
  const escolhido = new Map((d.visita.prod ?? []).map((p) => [p.id, p]));
  const sids = servicosVisita(d);
  return (
    <div className="space-y-3">
      {produtos.length > PRIMEIROS_PROD && <Pesquisa valor={q} onMudar={(x) => { setQ(x); setN(PRIMEIROS_PROD); }} rotulo={`Procurar em ${rotulo.toLowerCase()}`} ph="Procurar: nome, marca, referência…" />}
      <FiltrosFila opcoes={cats} ativo={cat} onMudar={(x) => { setCat(x); setN(PRIMEIROS_PROD); }} rotulo="Filtrar por tipo" />
      {q.trim() && <p className="text-sm text-muted-foreground" aria-live="polite">{lista.length ? plural(lista.length, "produto", "produtos") : "Nada com esse nome."}</p>}
      <ul className={GRELHA_PROD} aria-label={rotulo}>
        {lista.slice(0, n).map((p) => {
          const ja = escolhido.get(p.id);
          const { nome, detalhe } = encurtar(p.n, { categoria: categoriaFiltro(p, K.arvore) });
          const daMedida = !!ja && quantidadeDaRegra(K, p, sids) && !contavel(p.un) && ja.q === qtdSugerida(K, p, sids, d.visita.med);
          return (
            <CartaoProduto key={p.id} nome={nome} nomeCompleto={p.n} detalhe={[detalhe, p.marca].filter(Boolean).join(" · ")} preco={precoUnitario(p)} un={p.un}
              img={ilustracaoDoCatalogo(K.arvore, p)} on={!!ja} trazInstalacao={!!p.servico} onTocar={() => onTocar(p)}>
              {ja && (
                <QtdMudar id={`pq-${p.id}-${d.id}`} valor={ja.q} un={p.un} nome={nome} texto={textoQtd({ q: ja.q, un: p.un, daMedida })}
                  onMudar={(x) => run(() => A.produtoQtd(d.id, p.id, x))} />
              )}
            </CartaoProduto>
          );
        })}
      </ul>
      {lista.length > n && (
        <button type="button" onClick={() => setN((x) => x + MAIS)}
          className="min-h-11 w-full rounded-xl border border-input bg-card px-4 text-[15px] font-medium text-foreground transition-colors hover:border-foreground/40">
          Ver mais {Math.min(MAIS, lista.length - n)}
        </button>
      )}
    </div>
  );
}

/* ================================================================== uma troca: "Mantém / Troca" e os produtos */
function PassoPergunta({ ctx, K, o, resolvido }: { ctx: P; K: Catalogo; o: Obrigacao; resolvido: () => void }) {
  const { A, run, d } = ctx;
  const v = d.visita, resp = v.manter?.[o.sid];
  const obj = objetoDaPergunta(o.pergunta);
  const mob = d.f.mobilidade_reduzida === "Sim";
  const produtos = useMemo(
    () => ordenarMobilidade(ordenarParaTroca(ordenarParaObjeto(produtosDoRamo(K, o.no, CONSUMIVEIS), obj?.comArtigo ?? null), obj?.comArtigo, K.arvore), mob),
    [K, o.no, obj?.comArtigo, mob],
  );
  const ramo = useMemo(() => nosAbaixo(K.arvore, o.no), [K.arvore, o.no]);
  const troca = !o.pergunta || resp === "nao" || (resp !== "sim" && (v.prod ?? []).some((p) => p.no && ramo.has(p.no)));
  const listaRef = useRef<HTMLDivElement>(null);
  // a mobilidade reduzida (das Escolhas, que agora vêm no fim) pergunta-se aqui, num cartão rápido, enquanto não tem resposta:
  // muda a ordem dos produtos (bases de duche e barras à frente). Respondida, o cartão já não aparece nas trocas seguintes.
  const campoMob = efetivo(ctx.S.campos, ESCOLHAS).campos.find((c) => c.k === "mobilidade_reduzida" && visivel(c, d.f));
  const [pedeMob] = useState(() => !!campoMob && !d.f.mobilidade_reduzida);

  const responder = (r: "sim" | "nao") => {
    run(() => responderTroca(A, K, d, o, r));
    if (r === "sim") resolvido();
    else setTimeout(() => listaRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 60);
  };
  const tocar = (p: Produto) => {
    const res = { f: "tirou" as "juntou" | "tirou" };
    run(() => { res.f = tocarProdutoGuiado(A, K, d, o, p); });
    if (res.f !== "juntou") return;
    const noRamo = (d.visita.prod ?? []).filter((x) => x.no && ramo.has(x.no)).map((x) => K.produtos.find((y) => y.id === x.id) ?? x);
    if (trocaResolvida(o, noRamo, produtos)) resolvido();
  };

  return (
    <div className="space-y-4">
      {pedeMob && campoMob && <MobilidadeRapida ctx={ctx} rotulo={campoMob.l} />}
      {o.pergunta && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={o.pergunta}>
          <CartaoResposta on={resp === "sim"} titulo="Mantém" sub="Sem produto" onTocar={() => responder("sim")} />
          <CartaoResposta on={troca && resp !== "sim"} titulo="Troca" sub="Escolher abaixo" onTocar={() => responder("nao")} />
        </div>
      )}
      {troca && (
        <div ref={listaRef} className="animate-in fade-in-0 duration-150">
          <ListaProdutos ctx={ctx} K={K} produtos={produtos} onTocar={tocar} rotulo={obj ? `Produtos: ${obj.comArtigo}` : "Produtos"} />
        </div>
      )}
    </div>
  );
}

/** A pergunta da mobilidade reduzida num cartão rápido (Sim / Não), no início das trocas. */
function MobilidadeRapida({ ctx, rotulo }: { ctx: P; rotulo: string }) {
  const { A, run, d } = ctx;
  const val = d.f.mobilidade_reduzida;
  const b = (on: boolean) => cn("min-h-11 min-w-16 rounded-lg border px-4 text-[15px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
    on ? "border-primary bg-primary font-medium text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40");
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
      <span className="text-[15px] text-foreground">{rotulo}<span className="block text-sm text-muted-foreground">Muda a ordem dos produtos</span></span>
      <span className="flex gap-2">
        {(["Sim", "Não"] as const).map((x) => (
          <button key={x} type="button" aria-pressed={val === x} className={b(val === x)} onClick={() => run(() => A.campo(d.id, "mobilidade_reduzida", val === x ? "" : x))}>{x}</button>
        ))}
      </span>
    </div>
  );
}

/* ================================================================== Mais produtos */
function PassoOutros({ ctx, K, obr }: { ctx: P; K: Catalogo; obr: Obrigacao[] }) {
  const { A, run, d } = ctx;
  const mob = d.f.mobilidade_reduzida === "Sim";
  const produtos = useMemo(() => {
    const ramos = obr.map((o) => nosAbaixo(K.arvore, o.no));
    const fora = K.produtos.filter((p) => !CONSUMIVEIS.has(p.n) && !ramos.some((r) => p.no && r.has(p.no)));
    // os do ofício dos serviços escolhidos primeiro (ordem estável)
    const ofDe = (no: string | null) => { let x = no ? K.arvore.find((y) => y.id === no) : undefined; while (x?.pai) x = K.arvore.find((y) => y.id === x!.pai); return x?.id; };
    const ofs = new Set(servicosVisita(d).map((sid) => ofDe(K.classe[sid] ?? null)).filter(Boolean));
    const ordenada = fora.map((p, i) => ({ p, i, s: notaNaLinha(ilustracaoDoCatalogo(K.arvore, p), d.linha) * 2 + (ofs.has(ofDe(p.no)) ? 1 : 0) }))
      .sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
    return ordenarMobilidade(ordenada, mob);
  }, [K, obr.map((o) => o.no).join(), mob, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ListaProdutos ctx={ctx} K={K} produtos={produtos} rotulo="Mais produtos" onTocar={(p) => run(() => { tocarProduto(A, K, d, p); })} />;
}

/* ================================================================== O que o cliente fornece, por serviço */
/** Os blocos de "o que o cliente fornece" desta visita (selecao.ts: blocosFornece). */
function blocosDaVisita(ctx: P, K: Catalogo, obr: Obrigacao[]): BlocoFornece[] {
  const { S, d } = ctx;
  return blocosFornece(d, obr, orcLinhas(d, S), { arvore: K.arvore, exige: K.exigeProduto ?? {}, nomeSvc: (sid) => nomeSvc(S, sid), svc: (sid) => servicoLeitura(S, sid) });
}
const ATALHO = "min-h-11 rounded-xl border px-4 text-[15px] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const atalho = (on: boolean) => cn(ATALHO, on ? "border-primary bg-primary/[0.06] text-foreground ring-1 ring-primary" : "border-input bg-card text-foreground hover:border-foreground/40");
/** "− 84,20 €", discreto (só quando baixa alguma coisa). */
const Menos = ({ v, className }: { v: number; className?: string }) =>
  v > 0 ? <span className={cn("shrink-0 text-sm tabular-nums text-muted-foreground", className)} aria-label={`Baixa ${eur(v)} euros`}>− {eur(v)} €</span> : null;

function PassoFornece({ ctx, obr }: { ctx: P; obr: Obrigacao[] }) {
  const { A, run, d } = ctx;
  const K = useCatalogo();
  const blocos = blocosDaVisita(ctx, K, obr);
  const todos = blocos.flatMap((b) => b.itens);
  if (!todos.length) return <p className="text-[15px] text-muted-foreground">Ainda não há serviços nem produtos escolhidos.</p>;
  const tudo = todos.every((x) => x.on), nada = todos.every((x) => !x.on);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Atalhos para tudo">
        <button type="button" aria-pressed={tudo} className={atalho(tudo)} onClick={() => run(() => fornecerTodos(A, d, todos, true))}>Fornece tudo</button>
        <button type="button" aria-pressed={nada} className={atalho(nada)} onClick={() => run(() => fornecerTodos(A, d, todos, false))}>Nenhum</button>
        <Menos v={poupanca(todos)} className="ml-auto text-[15px]" />
      </div>
      {blocos.map((b) => <BlocoServico key={b.sid ?? "outros"} ctx={ctx} K={K} b={b} />)}
    </div>
  );
}

const TIPO_TXT: Record<ItemFornece["tipo"], string> = { produto: "Produto", servico: "Material", cons: "Consumível", equip: "Equipamento" };
const FIG: Record<"cons" | "equip", IlustracaoKey> = { cons: "material", equip: "ferramenta" };

/** Um serviço: o nome, os atalhos dele, o que baixa, e os cartões (os 6 que mais pesam; o resto com "Ver mais"). */
function BlocoServico({ ctx, K, b }: { ctx: P; K: Catalogo; b: BlocoFornece }) {
  const { A, run, d } = ctx;
  const [n, setN] = useState(PRIMEIROS_FORN);
  const tudo = b.itens.every((x) => x.on), nada = b.itens.every((x) => !x.on);
  const titulo = b.sid ? nomeCurto(b.titulo) : b.titulo;
  const sec = (on: boolean) => cn("min-h-10 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
    on ? "bg-primary/10 text-foreground" : "text-primary hover:bg-muted");
  const linha2 = (it: ItemFornece) => {
    if (it.tipo === "servico") return it.on ? "O cliente compra" : "Material por escolher";
    const qtd = it.q != null && it.un ? `${nfmt(it.q)} ${it.un}` : "";
    if (it.on) return `Fornecido pelo cliente${it.valor ? ` · − ${eur(it.valor)} €` : ""}`;
    return [TIPO_TXT[it.tipo], qtd, it.valor ? `${eur(it.valor)} €` : ""].filter(Boolean).join(" · ");
  };
  const figura = (it: ItemFornece) => {
    if (it.tipo === "cons" || it.tipo === "equip") return FIG[it.tipo];
    const doCat = it.tipo === "produto" ? K.produtos.find((p) => p.id === it.id) : undefined;
    return doCat ? ilustracaoDoCatalogo(K.arvore, doCat) : ilustracaoDe(it.n);
  };
  return (
    <section aria-label={titulo} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="min-w-0 flex-1 text-base font-semibold text-foreground" title={b.titulo}>{titulo}</h4>
        <Menos v={poupanca(b.itens)} />
        <span className="flex" role="group" aria-label={`Atalhos de ${titulo}`}>
          <button type="button" aria-pressed={tudo} className={sec(tudo)} onClick={() => run(() => fornecerTodos(A, d, b.itens, true))}>Fornece tudo</button>
          <button type="button" aria-pressed={nada} className={sec(nada)} onClick={() => run(() => fornecerTodos(A, d, b.itens, false))}>Nenhum</button>
        </span>
      </div>
      <ul className={GRELHA_FORN} aria-label={`O que o cliente fornece: ${titulo}`}>
        {b.itens.slice(0, n).map((it) => {
          const { nome } = encurtar(it.n);
          return (
            <CartaoServico key={it.k} compacto nome={nome} nomeCompleto={it.n} icone="outro" figura={<Ilustracao k={figura(it)} className="h-7 w-7" />}
              on={it.on} linha2={linha2(it)} onTocar={() => run(() => marcarFornece(A, d, it, !it.on))} />
          );
        })}
      </ul>
      {b.itens.length > n && (
        <button type="button" onClick={() => setN((x) => x + MAIS)}
          className="min-h-11 w-full rounded-xl border border-input bg-card px-4 text-[15px] font-medium text-foreground transition-colors hover:border-foreground/40">
          Ver mais {Math.min(MAIS, b.itens.length - n)}
        </button>
      )}
    </section>
  );
}

/* ================================================================== o Resumo */
function PassoResumo({ ctx, K, passos, obr, ir }: { ctx: P; K: Catalogo; passos: PassoSel[]; obr: Obrigacao[]; ir: (k: string) => void }) {
  const { S, d } = ctx;
  const v = d.visita, prod = v.prod ?? [];
  const r = resumoNecessidades(S, d, orcLinhas(d, S));
  const esc = efetivo(S.campos, ESCOLHAS);
  const nomeP = (id: string) => prod.find((p) => p.id === id);
  const txtProd = (ids: string[]) => ids.map((id) => { const p = nomeP(id)!; return `${encurtar(p.n).nome}${p.q !== 1 ? ` × ${nfmt(p.q)}` : ""}${p.cliente ? " (fornecido pelo cliente)" : ""}`; }).join(", ");
  const ramos = obr.map((o) => nosAbaixo(K.arvore, o.no));
  const linha = (p: PassoSel): { t: string; falta?: boolean } => {
    switch (p.tipo) {
      case "escolhas": {
        const f = emFalta([esc], d.f);
        const partes = esc.campos.filter((c) => d.f[c.k]).map((c) => (c.t === "sim_nao" ? `${c.l}: ${d.f[c.k]}` : d.f[c.k]));
        return f.length ? { t: `Falta: ${f.map((c) => c.l.toLowerCase()).join(", ")}`, falta: true } : { t: partes.join(" · ") || "Respondido" };
      }
      case "servicos": {
        const sids = orcLinhas(d, S);
        return sids.length ? { t: sids.map((s) => nomeCurto(nomeSvc(S, s))).join(", ") } : { t: "Falta escolher pelo menos um serviço", falta: true };
      }
      case "pergunta": {
        const o = p.o!;
        if (o.estado === "mantem") return { t: "Mantém" };
        if (o.estado === "cliente") return { t: "O cliente compra" };
        const ids = prod.filter((x) => x.no && nosAbaixo(K.arvore, o.no).has(x.no)).map((x) => x.id);
        if (ids.length) return { t: txtProd(ids) };
        return { t: o.estado === "pergunta" ? "Falta dizer se mantém ou troca" : "Falta escolher o produto", falta: true };
      }
      case "outros": {
        const ids = prod.filter((x) => !ramos.some((rr) => x.no && rr.has(x.no))).map((x) => x.id);
        return { t: ids.length ? txtProd(ids) : "Nenhum" };
      }
      case "fornece": {
        const on = blocosDaVisita(ctx, K, obr).flatMap((b) => b.itens).filter((x) => x.on);
        const menos = poupanca(on);
        return { t: on.length ? `${on.map((x) => encurtar(x.n).nome).join(", ")}${menos > 0 ? ` (− ${eur(menos)} €)` : ""}` : "Nada" };
      }
      default: return { t: "" };
    }
  };
  return (
    <div>
      <p className="text-base text-foreground">
        <span className="font-semibold tabular-nums">{eur(r.total)} €</span> <span className="text-muted-foreground">estimado · {plural(r.servicos, "serviço", "serviços")} · {plural(r.produtos, "produto", "produtos")}</span>
      </p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {passos.filter((p) => p.tipo !== "resumo").map((p) => {
          const l = linha(p);
          return (
            <li key={p.k}>
              <button type="button" onClick={() => ir(p.k)} className="flex min-h-14 w-full items-center gap-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-foreground">{p.titulo}</span>
                  <span className={cn("line-clamp-2 text-sm", l.falta ? "font-medium text-destructive" : "text-muted-foreground")}>{l.t}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-primary">Mudar</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

