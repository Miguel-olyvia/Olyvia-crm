// A etapa "Necessidades do cliente" (redesenhada a 14/10/2026), para o comercial em casa do cliente, no tablet ou no telemóvel:
// · em cima, um resumo de uma linha ("6 serviços · 3 produtos · 1.240 € estimado") e o que falta, em palavras;
// · Serviços: mosaicos com ícone (ServicosCatalogo.tsx);
// · Produtos: cada serviço que pede produto é uma escolha guiada no sítio certo ("Sanita" → "O cliente mantém a sanita?"
//   Sim / Não → os cartões das sanitas, com ilustração, marca e preço), e o escolhido fica ali com a quantidade (− 1 +).
//   No fim, "Juntar outros produtos" abre a grelha do Catálogo por categoria, com pesquisa (espelho, acessórios…).
// O comportamento é o de antes (motor.ts e produtosVisita.ts): o portão, "o cliente mantém", "o cliente compra", "o cliente fornece".
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Link2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemCatalogo } from "./catalogo";
import { aValidar } from "./CamposFase";
import { eur, nfmt, servicosVisita, type Negocio, type SvcId } from "./motor";
import { type Ctx } from "./pecas";
import { useCatalogo } from "./v2/catalogoStore";
import { type Catalogo, type Produto } from "./v2/catalogoModelo";
import { CONSUMIVEIS } from "./equipamentosCliente";
import { ServicosCatalogo, orcLinhas } from "./ServicosCatalogo";
import { ContadorQtd } from "./ContadorQtd";
import { SelecaoGuiada } from "./SelecaoGuiada";
import { Ilustracao, ilustracaoDe } from "./ilustracoes";
import {
  nosAbaixo, obrigacoes, precoProduto, precoUnitario, produtosDoRamo, qtdSugerida, textoClienteCompra, type Obrigacao, type ProdVisita,
} from "./produtosVisita";
import {
  categorias, faltaEmPalavras, filtrarProdutos, ilustracaoDoCatalogo, marcasDe, obrigacoesAMostrar, mostraCartoes, nomeCurto, objetoDaPergunta, ordenarParaObjeto, passoGuiado,
  resumoNecessidades, tituloObrigacao, tocarProdutoGuiado,
} from "./necessidades";

const PAGINA = 12;
type P = Ctx & { d: Negocio; simples?: boolean };

const nomeSvc = (S: Ctx["S"], sid: SvcId) => S.svc[sid]?.n ?? itemCatalogo(sid)?.n ?? sid;
const ilustracaoNo = (K: Catalogo, p: Produto) => ilustracaoDoCatalogo(K.arvore, p);

/* ------------------------------------------------------------------ peças */
/** Um produto do Catálogo para escolher: ilustração, nome, marca, preço por unidade e "traz instalação". */
function CartaoProduto({ p, K, ja, onTocar, compacto }: { p: Produto; K: Catalogo; ja: boolean; onTocar: () => void; compacto?: boolean }) {
  return (
    <button type="button" aria-pressed={ja} onClick={onTocar} title={p.n}
      className={cn("relative flex h-full w-full flex-col rounded-xl border bg-card p-2.5 text-left transition-colors duration-150",
        ja ? "border-primary bg-primary/[0.04] ring-1 ring-primary" : "border-border hover:border-foreground/30")}>
      <span className={cn("grid place-items-center rounded-lg bg-muted/70", compacto ? "h-20" : "h-24")}>
        <Ilustracao k={ilustracaoNo(K, p)} className={compacto ? "h-14 w-14" : "h-16 w-16"} />
      </span>
      <span className="mt-2 line-clamp-2 text-[15px] font-medium leading-snug text-foreground">{p.n}</span>
      {p.marca && <span className="text-sm text-muted-foreground">{p.marca}</span>}
      <span className="mt-auto pt-1.5 text-[15px] tabular-nums text-foreground">{eur(precoUnitario(p))} €<span className="text-sm text-muted-foreground"> / {p.un}</span></span>
      {p.servico && <span className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground"><Link2 className="h-3.5 w-3.5" aria-hidden="true" />traz instalação</span>}
      <span aria-hidden="true" className={cn("absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border bg-card transition-colors",
        ja ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
        {ja && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Um produto escolhido: ilustração, nome, quantidade (− 1 +), preço, "o cliente fornece" e retirar. */
function Escolhido({ p, ctx, K, ro, clienteFornece }: { p: ProdVisita; ctx: P; K: Catalogo; ro: boolean; clienteFornece: boolean }) {
  const { S, A, run, d } = ctx;
  const doCat = K.produtos.find((x) => x.id === p.id);
  const img = doCat ? ilustracaoNo(K, doCat) : ilustracaoDe(p.n);
  return (
    <li id={`pe-${p.id}-${d.id}`} tabIndex={-1} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:flex-nowrap">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-muted/70"><Ilustracao k={img} className="h-10 w-10" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-foreground">{p.n}</span>
        <span className="block text-sm text-muted-foreground">
          {[doCat?.marca, `${eur(p.pvp ?? precoUnitario(p))} € / ${p.un}`].filter(Boolean).join(" · ")}
        </span>
        {p.svc && <span className="block text-sm text-muted-foreground"><Link2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Inclui a instalação · {nfmt(p.q * (p.fator ?? 1))} {S.svc[p.svc]?.un ?? "un"}</span>}
      </span>
      {!ro && (
        <button type="button" onClick={() => run(() => A.tirarProduto(d.id, p.id))} aria-label={`Retirar ${p.n}`}
          className="order-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground sm:order-last">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <div className="order-3 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:order-none sm:w-auto sm:flex-nowrap">
        {ro ? <span className="text-[15px]">{nfmt(p.q)} {p.un}</span>
          : <ContadorQtd id={`pq-${p.id}-${d.id}`} valor={p.q} un={p.un} nome={p.n} min={p.q < 1 ? p.q : 1} onMudar={(n) => run(() => A.produtoQtd(d.id, p.id, n))} />}
        {clienteFornece && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={!!p.cliente} disabled={ro} className="h-5 w-5 accent-[hsl(var(--primary))]"
              onChange={(e) => { const c = e.target.checked; run(() => A.produtoCliente(d.id, p.id, c)); }} />
            o cliente fornece
          </label>
        )}
        <span className="w-24 text-right text-[15px] tabular-nums">{p.cliente ? "0,00 €" : eur(precoProduto(p)) + " €"}</span>
      </div>
    </li>
  );
}

/** A escolha de produtos de uma lista: pesquisa e marca só quando a lista é grande; em fila (telemóvel) ou grelha; às páginas. */
function Escolher({ produtos, K, ja, onTocar, rotulo, focoRef }: {
  produtos: Produto[]; K: Catalogo; ja: (id: string) => boolean; onTocar: (p: Produto) => void; rotulo: string; focoRef?: React.Ref<HTMLParagraphElement>;
}) {
  const [q, setQ] = useState("");
  const [marca, setMarca] = useState<string | null>(null);
  const [n, setN] = useState(PAGINA);
  const grande = produtos.length > PAGINA;
  const marcas = useMemo(() => (grande ? marcasDe(produtos) : []), [produtos, grande]);
  const lista = useMemo(() => filtrarProdutos(produtos, K.arvore, { q, marca }), [produtos, K.arvore, q, marca]);
  const uid = useId();
  return (
    <div className="mt-4">
      <p ref={focoRef} tabIndex={-1} id={`${uid}-r`} className="text-[15px] font-medium outline-none">{rotulo}</p>
      {grande && (
        <div className="mt-2 flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Procurar em {rotulo.toLowerCase()}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGINA); }} placeholder="Procurar"
              className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
          </label>
          {marcas.length > 1 && (
            <label className="min-w-0 basis-40">
              <span className="sr-only">Marca</span>
              <select value={marca ?? ""} onChange={(e) => { setMarca(e.target.value || null); setN(PAGINA); }}
                className="h-11 w-full rounded-xl border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25">
                <option value="">Todas as marcas</option>
                {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {grande && <p className="sr-only" aria-live="polite">{lista.length} produtos</p>}
      <ul aria-labelledby={`${uid}-r`}
        className="mt-3 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
        {lista.slice(0, n).map((p) => (
          <li key={p.id} className="w-40 shrink-0 snap-start sm:w-auto">
            <CartaoProduto p={p} K={K} ja={ja(p.id)} onTocar={() => onTocar(p)} compacto />
          </li>
        ))}
        {lista.length > n && (
          <li className="w-40 shrink-0 snap-start sm:w-auto">
            <button type="button" onClick={() => setN((x) => x + PAGINA)}
              className="grid h-full min-h-44 w-full place-items-center rounded-xl border border-dashed border-input px-3 text-center text-[15px] font-medium text-primary hover:border-primary">
              Ver mais {Math.min(PAGINA, lista.length - n)}
            </button>
          </li>
        )}
      </ul>
      {!lista.length && <p className="mt-2 text-[15px] text-muted-foreground">Nada com esse nome.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ um serviço que pede produto */
function BlocoObrigacao({ o, ctx, K, escolhidos, clienteFornece }: { o: Obrigacao; ctx: P; K: Catalogo; escolhidos: ProdVisita[]; clienteFornece: boolean }) {
  const { S, A, run, d } = ctx;
  const v = d.visita, ro = v.fechada, resp = v.manter?.[o.sid];
  const validar = aValidar(d, "nec");
  const obj = objetoDaPergunta(o.pergunta), titulo = tituloObrigacao(o), nome = nomeSvc(S, o.sid);
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState<string | null>(null);
  const focoEscolher = useRef<HTMLParagraphElement>(null);
  const passo = passoGuiado(o);
  const mostraEscolha = !ro && mostraCartoes(passo, aberto);
  const produtos = useMemo(() => ordenarParaObjeto(produtosDoRamo(K, o.no, CONSUMIVEIS), obj?.comArtigo ?? null), [K, o.no, obj?.comArtigo]);
  const prodPorId = new Set((v.prod ?? []).map((p) => p.id));
  const primeiro = escolhidos[0] && K.produtos.find((x) => x.id === escolhidos[0].id);
  const img = primeiro ? ilustracaoNo(K, primeiro) : ilustracaoDe(obj?.nome ?? o.caminho);
  const erro = validar && !o.cumprida;
  const hid = `obr-t-${o.sid}-${d.id}`;

  // depois de escolher, o foco passa para o produto escolhido; depois do "Não", para a escolha
  useEffect(() => {
    if (!foco) return;
    if (foco === "escolher") focoEscolher.current?.focus();
    else document.getElementById(`pe-${foco}-${d.id}`)?.focus();
    setFoco(null);
  }, [foco, d.id]);

  const responder = (r: "sim" | "nao") => {
    run(() => A.manter(d.id, o.sid, resp === r ? null : r));
    if (r === "nao" && resp !== "nao") setFoco("escolher");
  };
  const tocar = (p: Produto) => {
    const juntar = !prodPorId.has(p.id);
    run(() => { tocarProdutoGuiado(A, K, d, o, p); });
    if (juntar) { setAberto(false); setFoco(p.id); }
  };

  const estado = o.estado === "mantem" ? "Mantém o que tem: não entra produto."
    : o.estado === "cliente" ? `O cliente compra: ${v.clienteCompra?.[o.sid]}`
      : erro ? `Falta ${faltaEmPalavras(o)}.` : null;

  return (
    <section id={`obr-${o.sid}-${d.id}`} aria-labelledby={hid}
      className={cn("border-t border-border pt-5 first:border-t-0 first:pt-0", erro && "border-l-4 border-l-destructive pl-3")}>
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted/70"><Ilustracao k={img} className="h-12 w-12" /></span>
        <div className="min-w-0 flex-1">
          <h4 id={hid} tabIndex={-1} className="text-lg font-semibold leading-snug text-foreground outline-none">{titulo}</h4>
          <p className="text-sm text-muted-foreground">Para {nomeCurto(nome).toLowerCase()}</p>
        </div>
        {o.cumprida && <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-success"><Check className="h-4 w-4" aria-hidden="true" />Resolvido</span>}
      </div>

      {o.pergunta && (
        <div className="mt-4">
          <p id={`perg-${o.sid}-${d.id}`} className="text-[15px] text-foreground">{o.pergunta}</p>
          <div role="group" aria-labelledby={`perg-${o.sid}-${d.id}`} className="mt-2 grid max-w-md grid-cols-2 gap-2">
            {(["sim", "nao"] as const).map((r) => (
              <button key={r} type="button" disabled={ro} aria-pressed={resp === r} onClick={() => responder(r)}
                className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-[15px] font-medium transition-colors disabled:opacity-70",
                  resp === r ? "border-primary bg-primary/[0.08] text-foreground ring-1 ring-primary" : "border-input bg-card text-foreground hover:border-foreground/40")}>
                {resp === r && <Check className="h-4 w-4 text-primary" strokeWidth={3} aria-hidden="true" />}
                {r === "sim" ? "Sim, mantém" : "Não, vai trocar"}
              </button>
            ))}
          </div>
        </div>
      )}

      {estado && <p className={cn("mt-3 text-[15px]", erro ? "font-medium text-destructive" : "text-muted-foreground")} aria-live="polite">{estado}</p>}

      {escolhidos.length > 0 && o.estado !== "mantem" && (
        <ul className="mt-3 divide-y divide-border border-t border-border" aria-label={`Escolhido para ${titulo.toLowerCase()}`}>
          {escolhidos.map((p) => <Escolhido key={p.id} p={p} ctx={ctx} K={K} ro={ro} clienteFornece={clienteFornece} />)}
        </ul>
      )}

      {mostraEscolha && (
        <Escolher produtos={produtos} K={K} ja={(id) => prodPorId.has(id)} onTocar={tocar} focoRef={focoEscolher}
          rotulo={obj ? `Escolha ${obj.comArtigo}` : `Escolha o produto de ${(o.caminho.split(" › ").pop() ?? "").toLowerCase()}`} />
      )}

      {!ro && (passo === "escolhido" || (passo === "escolher" && clienteFornece && !escolhidos.length)) && (
        <div className="mt-3 flex flex-wrap gap-x-5">
          {passo === "escolhido" && (
            <button type="button" aria-expanded={aberto} onClick={() => setAberto(!aberto)}
              className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
              {aberto ? "Fechar a escolha" : "Juntar ou trocar"}<ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
            </button>
          )}
          {passo === "escolher" && clienteFornece && !escolhidos.length && (
            <button type="button" onClick={() => run(() => A.clienteCompra(d.id, o.sid, textoClienteCompra(o, nome)))}
              className="min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">Ou: o cliente compra</button>
          )}
        </div>
      )}
      {!ro && passo === "cliente" && (
        <button type="button" onClick={() => run(() => A.clienteCompra(d.id, o.sid, null))}
          className="mt-2 min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">Afinal escolher do Catálogo</button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ outros produtos */
function OutrosProdutos({ ctx, K }: { ctx: P; K: Catalogo }) {
  const { A, run, d } = ctx;
  const v = d.visita, prodPorId = new Set((v.prod ?? []).map((p) => p.id));
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [n, setN] = useState(PAGINA);
  const uid = useId();
  const base = useMemo(() => K.produtos.filter((p) => !CONSUMIVEIS.has(p.n)), [K.produtos]);
  const cats = useMemo(() => categorias(base, K.arvore), [base, K.arvore]);
  const lista = useMemo(() => filtrarProdutos(base, K.arvore, { q, cat }), [base, K.arvore, q, cat]);
  const tocar = (p: Produto) => run(() => (prodPorId.has(p.id) ? A.tirarProduto(d.id, p.id) : A.produto(d.id, p, qtdSugerida(K, p, servicosVisita(d), v.med))));
  const chip = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[15px] transition-colors",
    on ? "border-primary bg-primary/[0.08] font-medium text-foreground ring-1 ring-primary" : "border-input bg-card text-foreground hover:border-foreground/40");

  if (!aberto) return (
    <button type="button" aria-expanded={false} aria-controls={`${uid}-g`} onClick={() => setAberto(true)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-input bg-card px-4 text-left transition-colors hover:border-primary">
      <Plus className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="flex-1">
        <span className="block text-[15px] font-medium text-foreground">Juntar outros produtos</span>
        <span className="block text-sm text-muted-foreground">Espelho, toalheiro, acessórios… do Catálogo</span>
      </span>
    </button>
  );
  return (
    <section id={`${uid}-g`} aria-labelledby={`${uid}-t`} className="border-t border-border pt-5 animate-in fade-in-0 duration-150">
      <div className="flex items-center justify-between gap-3">
        <h4 id={`${uid}-t`} className="text-lg font-semibold">Outros produtos</h4>
        <button type="button" aria-expanded onClick={() => setAberto(false)} className="min-h-11 px-2 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Fechar</button>
      </div>
      <label className="relative mt-3 block">
        <span className="sr-only">Procurar produto</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setN(PAGINA); }} placeholder="Procurar: espelho, toalheiro, bancada…" autoFocus
          className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>
      <div role="group" aria-label="Categoria" className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <button type="button" aria-pressed={!cat} onClick={() => { setCat(null); setN(PAGINA); }} className={chip(!cat)}>Todas</button>
        {cats.map((c) => (
          <button key={c.n} type="button" aria-pressed={cat === c.n} onClick={() => { setCat(cat === c.n ? null : c.n); setN(PAGINA); }} className={chip(cat === c.n)}>{c.n}</button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">{lista.length ? `${lista.length} produto${lista.length === 1 ? "" : "s"}` : "Nada no Catálogo com esse nome."}</p>
      <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Produtos do Catálogo">
        {lista.slice(0, n).map((p) => <li key={p.id}><CartaoProduto p={p} K={K} ja={prodPorId.has(p.id)} onTocar={() => tocar(p)} /></li>)}
      </ul>
      {lista.length > n && (
        <button type="button" onClick={() => setN((x) => x + PAGINA)}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-input px-4 text-[15px] font-medium text-foreground hover:border-foreground/40">
          Mostrar mais {Math.min(PAGINA, lista.length - n)}
        </button>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ a secção Produtos */
export function ProdutosVisita(ctx: P) {
  const K = useCatalogo();
  const { d } = ctx;
  const v = d.visita, ro = v.fechada, prod = v.prod ?? [];
  const clienteFornece = d.f.materiais_cliente === "Sim";
  const obr = obrigacoesAMostrar(obrigacoes(K, servicosVisita(d), v, clienteFornece), d);
  // cada produto escolhido mostra-se no primeiro serviço cujo ramo o contém; os outros ficam em "Outros produtos escolhidos"
  const ramos = obr.map((o) => nosAbaixo(K.arvore, o.no));
  const dono = (p: ProdVisita) => (p.no ? ramos.findIndex((r) => r.has(p.no!)) : -1);
  const outros = prod.filter((p) => dono(p) < 0);

  return (
    <div className="space-y-6">
      {obr.map((o, i) => (
        <BlocoObrigacao key={o.sid} o={o} ctx={ctx} K={K} clienteFornece={clienteFornece} escolhidos={prod.filter((p) => dono(p) === i)} />
      ))}
      {!obr.length && !prod.length && <p className="text-[15px] text-muted-foreground">Os serviços escolhidos não pedem produto.{ro ? "" : " Pode juntar outros abaixo."}</p>}
      {outros.length > 0 && (
        <section aria-labelledby={`out-esc-${d.id}`} className="border-t border-border pt-5">
          <h4 id={`out-esc-${d.id}`} className="text-lg font-semibold">Outros produtos escolhidos</h4>
          <ul className="mt-1 divide-y divide-border">
            {outros.map((p) => <Escolhido key={p.id} p={p} ctx={ctx} K={K} ro={ro} clienteFornece={clienteFornece} />)}
          </ul>
        </section>
      )}
      {!ro && <OutrosProdutos ctx={ctx} K={K} />}
    </div>
  );
}

/* ------------------------------------------------------------------ o resumo */
function Resumo(ctx: P) {
  const { S, d } = ctx;
  const K = useCatalogo();
  const validar = aValidar(d, "nec");
  const r = resumoNecessidades(S, d, orcLinhas(d, S));
  const obr = obrigacoes(K, servicosVisita(d), d.visita, d.f.materiais_cliente === "Sim").filter((o) => !o.cumprida);
  const ir = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    (el?.querySelector<HTMLElement>("h4,h3,[tabindex='-1']") ?? el)?.focus({ preventScroll: true });
  };
  const faltas: { t: string; alvo: string }[] = [
    ...(r.servicos ? [] : [{ t: "escolher pelo menos um serviço", alvo: `nec-svc-${d.id}` }]),
    ...obr.map((o) => ({ t: faltaEmPalavras(o), alvo: `obr-${o.sid}-${d.id}` })),
  ];
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  return (
    <div className="space-y-1.5">
      <p className="text-base text-foreground" aria-live="polite">
        <span className="tabular-nums">{plural(r.servicos, "serviço", "serviços")}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="tabular-nums">{plural(r.produtos, "produto", "produtos")}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-semibold tabular-nums">{eur(r.total)} €</span> <span className="text-muted-foreground">estimado</span>
      </p>
      {faltas.length > 0 && !d.visita.fechada && (
        <p className={cn("text-[15px]", validar ? "font-medium text-destructive" : "text-muted-foreground")}>
          Falta{" "}
          {faltas.map((f, i) => (
            <span key={f.alvo}>
              {i > 0 && (i === faltas.length - 1 ? " e " : ", ")}
              <button type="button" onClick={() => ir(f.alvo)} className="underline underline-offset-4 hover:no-underline">{f.t}</button>
            </span>
          ))}.
        </p>
      )}
    </div>
  );
}

/** A etapa "Necessidades do cliente": o resumo, os serviços e os produtos. */
export function NecessidadesCliente(ctx: P) {
  // versão Atual, aspeto simples, levantamento aberto: a seleção guiada, um passo de cada vez (SelecaoGuiada.tsx)
  if (ctx.simples && !ctx.d.visita.fechada) return <SelecaoGuiada {...ctx} />;
  const h = ctx.simples ? "text-xl font-semibold" : "text-base font-semibold";
  return (
    <div className="space-y-8">
      <Resumo {...ctx} />
      <section id={`nec-svc-${ctx.d.id}`} aria-labelledby={`nec-svc-t-${ctx.d.id}`}>
        <h3 id={`nec-svc-t-${ctx.d.id}`} tabIndex={-1} className={cn(h, "mb-4 outline-none")}>Serviços</h3>
        <ServicosCatalogo {...ctx} />
      </section>
      <section aria-labelledby={`nec-prod-${ctx.d.id}`} className="border-t border-border pt-8">
        <h3 id={`nec-prod-${ctx.d.id}`} className={cn(h, "mb-4")}>Produtos</h3>
        <ProdutosVisita {...ctx} />
      </section>
    </div>
  );
}
