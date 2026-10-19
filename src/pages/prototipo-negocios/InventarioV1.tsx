// O Inventário no V1 (19/10/2026). O do Rafael (inventario/) tem 9 ecrãs num submenu, separadores por cima, tabelas de 9 colunas, listas
// que abrem, cartões de números e palavras como FIFO, PO, EC e SKU. Aqui as mesmas áreas, cada uma com um nome claro e um ecrã simples
// (o menu lateral mostra-as debaixo de "Inventário"; no telemóvel, uma fila no topo da página):
// · Início: o caminho do material (fornecedores → armazém → obras) com os números de cada passo, e o que fazer agora (um só primário);
// · Stock: tudo o que há no Armazém Central, por categoria; Obras: o material de cada obra por fase; Encomendas a fornecedores;
//   Fornecedores; Movimentos (o livro de entradas, saídas e correções); Carrinhas (o stock das viaturas da Frota);
// · e três fichas: a obra, a encomenda a fornecedor e o material.
// As regras e as ações são as do Inventário do Rafael, sem mudanças (inventarioV1Acoes.ts); o que mostrar está em inventarioV1Docs.ts.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertCircle, ArrowDown, ArrowLeft, ArrowRight, Check, CheckCircle2, HardHat, History, Home, Hourglass, Package, PackageCheck, Search, Truck, Users, Warehouse, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normal } from "./catalogo";
import { ContadorQtd } from "./ContadorQtd";
import { poPorId } from "./inventario/base";
import { tirarPedidoEcInv, useInventario } from "./inventario/loja";
import type { Resultado } from "./inventario/loja";
import { MOTIVOS, aprovar, corrigir, darSaida, encomendar, receber, reporCarrinha, simularConfirmacao, type MotivoCorrecao } from "./inventarioV1Acoes";
import {
  armazemInv, carrinhasInv, contarMovimentos, dia, encomendasInv, eur, materialInv, movimentosInv, obraInv, obrasInv, plural, poInv, qtd, reposicaoCarrinha, tarefasInv, textoHistorico, valorStock,
  type MatInv, type MaterialInv, type ObraInv, type PoInv, type TarefaInv, type TipoLivro,
} from "./inventarioV1Docs";
import type { EstadoMat } from "./obraOps";
import type { Ctx } from "./pecas";
import { tirarPedidoObraInv } from "./pedidoInvV1";

const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
const LINHA = "group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2";
const LIGACAO = "inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline";
const CAMPO = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const ESCOLHA = (on: boolean): string => cn("min-h-11 shrink-0 rounded-lg border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const FILTRO = (on: boolean): string => cn("inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const FILA = "-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]";
const SETA = <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />;

/* ---------------------------------------------------------------- as secções e a navegação */

export type SecInv = "inicio" | "stock" | "obras" | "encomendas" | "fornecedores" | "movimentos" | "carrinhas";
/** As secções do Inventário: o nome, o ícone e a frase que explica o ecrã. */
export const SECOES: { id: SecInv; t: string; Ic: LucideIcon; sub: string }[] = [
  { id: "inicio", t: "Início", Ic: Home, sub: "" },
  { id: "stock", t: "Stock", Ic: Warehouse, sub: "Tudo o que há no Armazém Central: quanto há, quanto está guardado para obras e quanto está livre." },
  { id: "obras", t: "Obras", Ic: HardHat, sub: "O material de cada obra, por fase. Quando o Financeiro valida o pagamento, o que há no armazém fica guardado para a obra e o que falta vai ao fornecedor." },
  { id: "encomendas", t: "Encomendas a fornecedores", Ic: Truck, sub: "O que se pediu aos fornecedores: por aprovar, a caminho e recebido. Quando a mercadoria chega, dá-se entrada aqui." },
  { id: "fornecedores", t: "Fornecedores", Ic: Users, sub: "A quem se compra, em quanto tempo entregam e como recebem as encomendas." },
  { id: "movimentos", t: "Movimentos", Ic: History, sub: "O livro de tudo o que entrou, saiu ou foi corrigido. Não se apaga: cada linha diz o quê, quanto e para onde." },
  { id: "carrinhas", t: "Carrinhas", Ic: Package, sub: "O que cada carrinha da Frota leva. Abaixo do mínimo, repõe-se a partir do Armazém Central." },
];
const nomeSec = (s: SecInv): string => (s === "inicio" ? "Inventário" : SECOES.find((x) => x.id === s)!.t);

type Ficha = { k: "obra"; id: number } | { k: "po"; id: string } | { k: "material"; sku: string };
interface NavInv { sec: SecInv; ficha: Ficha | null }
/** Onde se está no Inventário: um módulo (o menu lateral lê-o para destacar a secção; a página desmonta ao mudar de ecrã). */
let nav: NavInv = { sec: "inicio", ficha: null };
const ouvintes = new Set<() => void>();
function mudarNav(n: NavInv): void { nav = n; for (const f of ouvintes) f(); }
const subscreverNav = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
export const useNavInv = (): NavInv => useSyncExternalStore(subscreverNav, () => nav, () => nav);
/** Abre uma secção (o menu lateral e a fila do telemóvel). */
export function abrirSecaoInv(sec: SecInv): void { mudarNav({ sec, ficha: null }); }
/** Volta ao Início (o menu "Inventário" e repor a demonstração). */
export function esquecerInventarioV1(): void { mudarNav({ sec: "inicio", ficha: null }); }

/** As secções no menu lateral, debaixo de "Inventário" (com o Inventário aberto). */
export function MenuInventarioV1({ aoAbrir }: { aoAbrir: (s: SecInv) => void }) {
  const n = useNavInv();
  return (
    <ul className="ml-[22px] flex flex-col gap-0.5 border-l border-border pl-2" aria-label="Secções do Inventário">
      {SECOES.filter((x) => x.id !== "inicio").map((x) => (
        <li key={x.id}>
          <button type="button" onClick={() => aoAbrir(x.id)} aria-current={n.sec === x.id ? "page" : undefined}
            className={cn("flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] transition-colors", n.sec === x.id ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
            {x.t}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- peças */

/** A mensagem do que acabou de se fazer (C24): diz o que ficou feito e desaparece sozinha. */
function useFeito(): [string, (m: string) => void] {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(""), 5000); return () => clearTimeout(id); }, [msg]);
  return [msg, setMsg];
}
const Feito = ({ msg }: { msg: string }) => (
  <div role="status" className="min-h-0">
    {msg && (
      <p className="mt-6 flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3 text-[15px] animate-in fade-in-0 slide-in-from-top-2 duration-500">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="h-4 w-4" aria-hidden="true" /></span>{msg}
      </p>
    )}
  </div>
);

function Voltar({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {children}
    </button>
  );
}

/** O estado de um material em palavras, com o ícone (a cor só no ícone, F3). */
const ESTADO_MAT: Record<EstadoMat, { t: string; Ic: typeof Check; cor: string }> = {
  "na obra": { t: "já na obra", Ic: Check, cor: "text-success" },
  reservado: { t: "pronto no armazém", Ic: PackageCheck, cor: "text-success" },
  recebido: { t: "pronto no armazém", Ic: PackageCheck, cor: "text-success" },
  "a chegar": { t: "a chegar", Ic: Truck, cor: "text-primary" },
  encomendado: { t: "encomendado ao fornecedor", Ic: Truck, cor: "text-primary" },
  "por encomendar": { t: "encomenda por aprovar", Ic: Hourglass, cor: "text-warning" },
  "em falta": { t: "em falta", Ic: AlertCircle, cor: "text-destructive" },
};
function EstadoMaterial({ m }: { m: Pick<MatInv, "estado" | "quando"> }) {
  const e = ESTADO_MAT[m.estado];
  return <span className="inline-flex items-center gap-1.5 text-[15px]"><e.Ic className={cn("h-4 w-4 shrink-0", e.cor)} aria-hidden="true" />{e.t}{m.quando ? " " + m.quando : ""}</span>;
}

/* ---------------------------------------------------------------- o que fazer agora */

/** O formulário de cada tarefa: o que vai acontecer e o botão (o único primário do ecrã, salvo `primario` falso). */
function FormTarefa({ S, t, feito, primario }: { S: Ctx["S"]; t: TarefaInv; feito: (m: string) => void; primario: boolean }) {
  const db = useInventario();
  const a = t.acao;
  const p = a.k === "aprovar" || a.k === "receber" ? poPorId(db, a.po) : undefined;
  const [q, setQ] = useState<Record<string, number>>(() => Object.fromEntries((p?.lines ?? []).map((l) => [l.id, Math.max(0, l.packs * l.packN - l.recv - l.cancelled)])));
  const [erro, setErro] = useState("");
  const dSair = a.k === "sair" ? S.deals.find((d) => d.id === a.deal) : undefined;
  const obra = dSair ? obraInv(db, dSair) : null;
  const fase = obra?.fases.find((f) => a.k === "sair" && f.fase === a.fase);
  const correr = (r: Resultado<string>) => { if (r.ok) { setErro(""); feito(r.valor); } else setErro(r.erro); };
  const fazer = () => {
    if (a.k === "aprovar") correr(aprovar(a.po));
    else if (a.k === "receber") correr(receber(a.po, Object.entries(q).map(([lineId, qty]) => ({ lineId, qty }))));
    else if (a.k === "sair") correr(darSaida(dSair?.obra.ec?.n ?? "", fase?.itens.filter((m) => m.pronto > 0) ?? []));
    else correr(encomendar(a.sku, a.q, a.sup));
  };
  return (
    <div className="mt-4">
      {a.k === "receber" && p && (
        <>
          <p className="text-[15px] text-muted-foreground">Confira o que chegou e acerte as quantidades, se vier menos.</p>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {p.lines.filter((l) => l.packs * l.packN - l.recv - l.cancelled > 0).map((l) => {
              const falta = l.packs * l.packN - l.recv - l.cancelled, nome = db.products.find((x) => x.sku === l.sku)?.name ?? l.sku, un = db.products.find((x) => x.sku === l.sku)?.unit ?? "un";
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{nome}</span><span className="block text-sm text-muted-foreground">faltam {qtd(falta, un)}</span></span>
                  <ContadorQtd id={`rec-${l.id}`} valor={q[l.id] ?? 0} un={un} nome={nome} min={0} onMudar={(n) => setQ((x) => ({ ...x, [l.id]: Math.min(falta, Math.round(n)) }))} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      {a.k === "sair" && fase && (
        <>
          <p className="text-[15px] text-muted-foreground">Sai do armazém e fica registado como entregue na obra.</p>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {fase.itens.filter((m) => m.pronto > 0).map((m) => (
              <li key={m.n} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-[15px]"><span className="min-w-0 flex-1">{m.n}</span><span className="tabular-nums text-muted-foreground">{qtd(m.pronto, m.un)}</span></li>
            ))}
          </ul>
        </>
      )}
      {a.k === "aprovar" && p && (
        <p className="text-[15px] text-muted-foreground">Pede-se {p.lines.map((l) => `${qtd(l.packs * l.packN, db.products.find((x) => x.sku === l.sku)?.unit ?? "un")} de ${(db.products.find((x) => x.sku === l.sku)?.name ?? l.sku).toLowerCase()}`).join(", ")}. Ao aprovar, a encomenda segue para o fornecedor.</p>
      )}
      {a.k === "encomendar" && <p className="text-[15px] text-muted-foreground">A encomenda segue logo para o fornecedor; quando chegar, dá-se entrada em Encomendas.</p>}
      {erro && <p role="alert" className="mt-3 flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
      <Button size="lg" variant={primario ? "default" : "outline"} className="mt-4 w-full sm:w-auto" onClick={fazer}>{t.btn}</Button>
    </div>
  );
}

/** O cartão "O que fazer agora" (C21): uma frase, o porquê e o botão. */
function Agora({ S, t, feito, ver, primario = true, vazio }: { S: Ctx["S"]; t: TarefaInv | undefined; feito: (m: string) => void; ver?: (t: TarefaInv) => ReactNode; primario?: boolean; vazio: string }) {
  return (
    <section aria-labelledby="inv-agora" className={cn("mt-8 rounded-2xl border bg-card p-5 sm:p-6", t ? "border-primary/25 shadow-[var(--shadow-md)]" : "border-border shadow-[var(--shadow-sm)]")}>
      <h2 id="inv-agora" className="text-sm font-medium text-primary">O que fazer agora</h2>
      {t ? (
        <div key={t.id} className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
          <p className="mt-2 flex items-start gap-2 text-xl font-semibold">{t.urgente && <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />}{t.t}{t.urgente && <span className="sr-only"> (urgente)</span>}</p>
          <p className="mt-1 text-base text-muted-foreground">{t.sub}</p>
          {ver?.(t)}
          <FormTarefa S={S} t={t} feito={feito} primario={primario} />
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />{vazio}</p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- a página */

export function InventarioV1(ctx: Ctx) {
  const { S } = ctx;
  const db = useInventario();
  // "Abrir no Inventário" no negócio: abre a obra (antes do primeiro desenho, para não piscar o Início)
  const pedido = useRef<number | null | undefined>(undefined);
  if (pedido.current === undefined) {
    pedido.current = tirarPedidoObraInv(); tirarPedidoEcInv();
    if (pedido.current != null && S.deals.some((d) => d.id === pedido.current)) nav = { sec: "obras", ficha: { k: "obra", id: pedido.current } };
  }
  useEffect(() => { if (pedido.current != null) mudarNav({ ...nav }); }, []); // o menu lateral fica a saber
  const n = useNavInv();
  const [msg, feito] = useFeito();
  const origem = useRef<string | null>(null);
  const ir = (x: Ficha, de?: string) => { if (de) origem.current = de; mudarNav({ sec: nav.sec, ficha: x }); };
  const voltar = () => {
    mudarNav({ sec: nav.sec, ficha: null });
    const id = origem.current;
    setTimeout(() => (id ? document.getElementById(id) : null)?.focus(), 30); // A4: o foco volta à linha que abriu
  };
  // O título ganha o foco quando o ecrã muda (A4)
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; if (!n.ficha) return; }
    titulo.current?.focus({ preventScroll: true }); document.getElementById("inv-v1-topo")?.scrollIntoView?.({ block: "start" });
  }, [n]);

  const comum: Comum = { ctx, db, ir, voltar, feito, msg, titulo, sec: n.sec };
  const f = n.ficha;
  const corpo = f?.k === "obra" && S.deals.some((d) => d.id === f.id) ? <ObraV1 {...comum} id={f.id} />
    : f?.k === "po" && poPorId(db, f.id) ? <EncomendaV1 {...comum} id={f.id} />
    : f?.k === "material" && materialInv(S, db, f.sku) ? <MaterialV1 {...comum} sku={f.sku} />
    : n.sec === "inicio" ? <Inicio {...comum} />
    : <Secao {...comum} />;
  return (
    <div id="inv-v1-topo" className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      {/* no telemóvel não há menu lateral: as secções numa fila que desliza (L8) */}
      {!f && (
        <nav aria-label="Secções do Inventário" className={cn(FILA, "mb-6 md:hidden")}>
          {SECOES.map((x) => <button key={x.id} type="button" aria-current={n.sec === x.id ? "page" : undefined} onClick={() => abrirSecaoInv(x.id)} className={FILTRO(n.sec === x.id)}>{x.t}</button>)}
        </nav>
      )}
      <div key={n.sec + (f ? JSON.stringify(f) : "")} className="animate-in fade-in-0 duration-200">{corpo}</div>
    </div>
  );
}

interface Comum {
  ctx: Ctx; db: ReturnType<typeof useInventario>; ir: (x: Ficha, de?: string) => void; voltar: () => void; feito: (m: string) => void; msg: string;
  titulo: React.RefObject<HTMLHeadingElement>; sec: SecInv;
}

/* ---------------------------------------------------------------- o Início */

/** Um passo do caminho do material: o nome, o número que importa, o que pede atenção e a secção que abre. */
function Passo({ Ic, t, num, sub, alerta, abrir }: { Ic: LucideIcon; t: string; num: string; sub: string; alerta?: string; abrir: () => void }) {
  return (
    <li className="min-w-0">
      <button type="button" onClick={abrir} className="group flex h-full w-full flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-5">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Ic className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1 text-base font-semibold group-hover:underline">{t}</span>
          {/* no telemóvel o número fica na linha do título (os três passos cabem sem deslizar) */}
          <span className="text-lg font-semibold tabular-nums sm:hidden">{num}</span>
        </span>
        <span className="mt-3 hidden text-2xl font-semibold tabular-nums sm:block">{num}</span>
        <span className="mt-1 block text-[15px] text-muted-foreground sm:mt-0">{sub}</span>
        {alerta && <span className="mt-2 flex items-start gap-1.5 text-[15px]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />{alerta}</span>}
      </button>
    </li>
  );
}
const Entre = () => (
  <li className="-my-1 grid place-items-center text-muted-foreground sm:my-0" aria-hidden="true">
    <ArrowDown className="h-4 w-4 sm:hidden" /><ArrowRight className="hidden h-5 w-5 sm:block" />
  </li>
);

function Inicio({ ctx, db, ir, feito, msg, titulo }: Comum) {
  const { S } = ctx;
  const T = tarefasInv(S, db), [primeira, ...resto] = T;
  const [todas, setTodas] = useState(false);
  const G = encomendasInv(S, db), M = armazemInv(S, db), O = obrasInv(S, db).filter((o) => o.estado !== "concluida");
  const baixos = M.filter((m) => m.baixo).length, aSair = O.filter((o) => o.fases.some((f) => f.aSair)).length;
  const abrirTarefa = (t: TarefaInv) => {
    const a = t.acao;
    if (a.k === "aprovar" || a.k === "receber") ir({ k: "po", id: a.po }, "t-" + t.id);
    else if (a.k === "sair") ir({ k: "obra", id: a.deal }, "t-" + t.id);
    else ir({ k: "material", sku: a.sku }, "t-" + t.id);
  };
  return (
    <>
      <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">Inventário</h1>
      <p className="mt-1 text-base text-muted-foreground">O material da empresa: chega dos fornecedores, fica no armazém e sai para as obras.</p>

      <section aria-labelledby="inv-caminho" className="mt-6">
        <h2 id="inv-caminho" className="sr-only">O caminho do material</h2>
        <ol className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
          <Passo Ic={Truck} t="Fornecedores" abrir={() => abrirSecaoInv("encomendas")}
            num={plural(G.aCaminho.length, "encomenda", "encomendas")} sub="a caminho do armazém"
            alerta={G.porAprovar.length ? `${plural(G.porAprovar.length, "encomenda", "encomendas")} por aprovar` : undefined} />
          <Entre />
          <Passo Ic={Warehouse} t="Armazém" abrir={() => abrirSecaoInv("stock")}
            num={plural(M.length, "material", "materiais")} sub={`${eur(valorStock(db))} em stock`}
            alerta={baixos ? `${plural(baixos, "material", "materiais")} abaixo do mínimo` : undefined} />
          <Entre />
          <Passo Ic={HardHat} t="Obras" abrir={() => abrirSecaoInv("obras")}
            num={plural(O.length, "obra", "obras")} sub="a receber material"
            alerta={aSair ? `${plural(aSair, "obra com material", "obras com material")} por levar` : undefined} />
        </ol>
      </section>

      <Feito msg={msg} />
      <Agora S={S} t={primeira} feito={feito} vazio="Nada por fazer. As encomendas a aprovar, o que chega e o material das obras aparecem aqui."
        ver={(t) => t.obra != null && t.acao.k !== "sair" ? <p className="mt-1"><button type="button" className={LIGACAO} onClick={() => ir({ k: "obra", id: t.obra! })}>Ver a obra<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></p> : null} />

      {resto.length > 0 && (
        <section aria-labelledby="inv-depois" className="mt-10">
          <h2 id="inv-depois" className="text-lg font-semibold">Depois</h2>
          <ul className={cn("mt-3", LISTA)}>
            {(todas ? resto : resto.slice(0, 4)).map((t) => (
              <li key={t.id}>
                <button id={"t-" + t.id} type="button" onClick={() => abrirTarefa(t)} className={LINHA}>
                  {t.urgente ? <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium group-hover:underline">{t.t}{t.urgente && <span className="sr-only"> (urgente)</span>}</span>
                    <span className="block text-[15px] text-muted-foreground">{t.sub}</span>
                  </span>
                  {SETA}
                </button>
              </li>
            ))}
          </ul>
          {resto.length > 4 && <Button variant="outline" className="mt-3 min-h-11" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? "Mostrar menos" : `Mostrar mais ${resto.length - 4}`}</Button>}
        </section>
      )}

      <section aria-labelledby="inv-mais" className="mt-10">
        <h2 id="inv-mais" className="text-lg font-semibold">Também no Inventário</h2>
        <ul className={cn("mt-3", LISTA)}>
          {SECOES.filter((x) => ["fornecedores", "movimentos", "carrinhas"].includes(x.id)).map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => abrirSecaoInv(x.id)} className={LINHA}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground" aria-hidden="true"><x.Ic className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1"><span className="block text-base font-medium group-hover:underline">{x.t}</span><span className="block text-[15px] text-muted-foreground">{x.sub}</span></span>
                {SETA}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- as secções */

function Secao(c: Comum) {
  const x = SECOES.find((y) => y.id === c.sec)!;
  return (
    <>
      <h1 ref={c.titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">{x.t}</h1>
      <p className="mt-1 text-base text-muted-foreground">{x.sub}</p>
      <Feito msg={c.msg} />
      {c.sec === "stock" && <StockSecao ctx={c.ctx} db={c.db} ir={c.ir} />}
      {c.sec === "obras" && <ObrasSecao ctx={c.ctx} db={c.db} ir={c.ir} />}
      {c.sec === "encomendas" && <EncomendasSecao ctx={c.ctx} db={c.db} ir={c.ir} />}
      {c.sec === "fornecedores" && <FornecedoresSecao db={c.db} />}
      {c.sec === "movimentos" && <MovimentosSecao ctx={c.ctx} db={c.db} />}
      {c.sec === "carrinhas" && <CarrinhasSecao db={c.db} feito={c.feito} />}
    </>
  );
}

/* ---------------------------------------------------------------- Stock */

type FiltroStock = "todos" | "baixo" | "obras";
function StockSecao({ ctx, db, ir }: Pick<Comum, "ctx" | "db" | "ir">) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<FiltroStock>("todos");
  const todos = armazemInv(ctx.S, db);
  const passa = (m: MaterialInv, k: FiltroStock) => (k === "baixo" ? m.baixo : k === "obras" ? m.reservado > 0 : true);
  const L = todos.filter((m) => passa(m, f) && (!q.trim() || normal(m.n + " " + m.cat).includes(normal(q.trim()))));
  const cats = [...new Set(L.map((m) => m.cat))];
  return (
    <>
      <p className="mt-3 text-[15px] tabular-nums">{plural(todos.length, "material", "materiais")} · {eur(valorStock(db))} em stock</p>
      <label className="relative mt-5 block">
        <span className="sr-only">Procurar</span>
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar material (ex.: cerâmico, silicone)" className={cn(CAMPO, "pl-10")} />
      </label>
      <div role="group" aria-label="Mostrar" className={cn(FILA, "mt-3")}>
        {([["todos", "Todos"], ["baixo", "Abaixo do mínimo"], ["obras", "Guardados para obras"]] as [FiltroStock, string][]).map(([k, t]) => (
          <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)} className={FILTRO(f === k)}>{t} <span className="ml-1.5 tabular-nums opacity-80">{todos.filter((m) => passa(m, k)).length}</span></button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{plural(L.length, "material", "materiais")}</p>
      {L.length === 0 && <p className="mt-6 text-[15px] text-muted-foreground">{q.trim() ? "Nenhum material com esse nome." : "Nenhum material neste filtro."}</p>}
      {cats.map((c) => (
        <section key={c} aria-labelledby={"cat-" + c} className="mt-8">
          <h2 id={"cat-" + c} className="text-lg font-semibold">{c} <span className="font-normal text-muted-foreground">· {L.filter((m) => m.cat === c).length}</span></h2>
          <ul className={cn("mt-3", LISTA)}>{L.filter((m) => m.cat === c).map((m) => <LinhaMaterial key={m.sku} m={m} ir={ir} />)}</ul>
        </section>
      ))}
    </>
  );
}

/** Uma linha do stock: o nome e o que está guardado para obras à esquerda; a quantidade e o livre à direita (por baixo, no telemóvel: L5). */
function LinhaMaterial({ m, ir }: { m: MaterialInv; ir: Comum["ir"] }) {
  return (
    <li>
      <button id={"m-" + m.sku} type="button" onClick={() => ir({ k: "material", sku: m.sku }, "m-" + m.sku)} className={cn(LINHA, "flex-wrap sm:flex-nowrap")}>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium group-hover:underline">{m.n}</span>
          <span className="block text-[15px] text-muted-foreground">
            {m.reservado > 0 ? `${qtd(m.reservado, m.un)} guardados para obras` : "nada guardado para obras"}{m.aChegar > 0 ? ` · ${qtd(m.aChegar, m.un)} a chegar` : ""}
          </span>
          {m.baixo && <span className="mt-0.5 flex items-center gap-1.5 text-[15px]"><AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Abaixo do mínimo ({qtd(m.rop, m.un)}){m.aChegar > 0 ? ", já encomendado" : ""}</span>}
        </span>
        <span className="flex basis-full flex-wrap items-baseline gap-x-3 sm:block sm:basis-auto sm:shrink-0 sm:text-right">
          <span className="block text-[17px] font-semibold tabular-nums">{qtd(m.qty, m.un)}</span>
          <span className="block text-sm tabular-nums text-muted-foreground">{qtd(Math.max(0, m.livre), m.un)} livres</span>
        </span>
        <span className="hidden sm:block">{SETA}</span>
      </button>
    </li>
  );
}

/* ---------------------------------------------------------------- Obras */

function LinhaObra({ o, ir }: { o: ObraInv; ir: Comum["ir"] }) {
  return (
    <li>
      <button id={"o-" + o.id} type="button" onClick={() => ir({ k: "obra", id: o.id }, "o-" + o.id)} className={LINHA}>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium group-hover:underline">{o.nome}</span>
          <span className="block text-[15px] text-muted-foreground">{o.sub} · {o.quando}</span>
          <span className="mt-0.5 flex items-start gap-1.5 text-[15px]">
            {o.atencao && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}{o.frase}
          </span>
        </span>
        {SETA}
      </button>
    </li>
  );
}

function ObrasSecao({ ctx, db, ir }: Pick<Comum, "ctx" | "db" | "ir">) {
  const O = obrasInv(ctx.S, db), abertas = O.filter((o) => o.estado !== "concluida"), acabadas = O.filter((o) => o.estado === "concluida");
  const [ver, setVer] = useState(false);
  return (
    <>
      {abertas.length === 0
        ? <p className="mt-6 text-[15px] text-muted-foreground">Ainda não há obras. Aparecem quando o cliente assina o contrato.</p>
        : <ul className={cn("mt-6", LISTA)}>{abertas.map((o) => <LinhaObra key={o.id} o={o} ir={ir} />)}</ul>}
      {acabadas.length > 0 && (
        <>
          <Button variant="ghost" className="mt-3 min-h-11" aria-expanded={ver} onClick={() => setVer(!ver)}>{ver ? "Esconder as obras acabadas" : `Ver as obras acabadas (${acabadas.length})`}</Button>
          {ver && <ul className={cn("mt-2", LISTA)}>{acabadas.map((o) => <LinhaObra key={o.id} o={o} ir={ir} />)}</ul>}
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Encomendas */

function LinhaPo({ p, ir }: { p: PoInv; ir: Comum["ir"] }) {
  return (
    <li>
      <button id={"p-" + p.id} type="button" onClick={() => ir({ k: "po", id: p.id }, "p-" + p.id)} className={LINHA}>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium group-hover:underline">{p.forn}</span>
          <span className="block text-[15px] text-muted-foreground">{p.para} · {p.resumo}</span>
          <span className="mt-0.5 flex items-start gap-1.5 text-[15px]">{p.atrasada && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}{p.frase}</span>
        </span>
        {SETA}
      </button>
    </li>
  );
}

function EncomendasSecao({ ctx, db, ir }: Pick<Comum, "ctx" | "db" | "ir">) {
  const G = encomendasInv(ctx.S, db);
  const [todas, setTodas] = useState(false);
  const grupo = (id: string, t: string, L: PoInv[], vazio: string) => (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-lg font-semibold">{t} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
      {L.length ? <ul className={cn("mt-3", LISTA)}>{L.map((p) => <LinhaPo key={p.id} p={p} ir={ir} />)}</ul> : <p className="mt-2 text-[15px] text-muted-foreground">{vazio}</p>}
    </section>
  );
  return (
    <>
      {grupo("enc-aprovar", "Por aprovar", G.porAprovar, "Nenhuma. As encomendas das obras nascem aqui, por aprovar, quando falta material no armazém.")}
      {grupo("enc-caminho", "A caminho", G.aCaminho, "Nada a caminho.")}
      {G.recebidas.length > 0 && (
        <section aria-labelledby="enc-recebidas" className="mt-8">
          <h2 id="enc-recebidas" className="text-lg font-semibold">Recebidas <span className="font-normal text-muted-foreground">· {G.recebidas.length}</span></h2>
          <ul className={cn("mt-3", LISTA)}>{(todas ? G.recebidas : G.recebidas.slice(0, 3)).map((p) => <LinhaPo key={p.id} p={p} ir={ir} />)}</ul>
          {G.recebidas.length > 3 && <Button variant="outline" className="mt-3 min-h-11" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? "Mostrar menos" : `Mostrar mais ${G.recebidas.length - 3}`}</Button>}
        </section>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Fornecedores */

function FornecedoresSecao({ db }: Pick<Comum, "db">) {
  const forn = db.suppliers.filter((s) => !s.deleted && s.active);
  const abertas = (id: string) => db.pos.filter((p) => !p.deleted && p.sup === id && ["ordered", "pending"].includes(p.status) && p.lines.some((l) => l.recv < l.packs * l.packN - l.cancelled)).length;
  return (
    <ul className={cn("mt-6", LISTA)}>
      {forn.map((s) => {
        const n = abertas(s.id);
        return (
          <li key={s.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-3 sm:px-2">
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium">{s.name}</span>
              <span className="block text-[15px] text-muted-foreground">{s.city} · entrega em {plural(s.sla, "dia", "dias")} · {s.portal === "active" ? "recebe as encomendas no portal" : "recebe as encomendas por email"}</span>
              <span className="block text-[15px]">{n ? `${plural(n, "encomenda em aberto", "encomendas em aberto")}` : "Nenhuma encomenda em aberto"}</span>
            </span>
            <a href={"tel:" + s.phone.replace(/\s/g, "")} className={cn(LIGACAO, "tabular-nums")}>{s.phone}</a>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------- Movimentos */

function MovimentosSecao({ ctx, db }: Pick<Comum, "ctx" | "db">) {
  const [tipo, setTipo] = useState<TipoLivro | "">("");
  const [n, setN] = useState(30);
  const L = movimentosInv(ctx.S, db, null, n, tipo || undefined), total = contarMovimentos(db, tipo || undefined);
  return (
    <>
      <div role="group" aria-label="Mostrar" className={cn(FILA, "mt-6")}>
        {([["", "Todos"], ["entradas", "Entradas"], ["saidas", "Saídas"], ["correcoes", "Correções"]] as [TipoLivro | "", string][]).map(([k, t]) => (
          <button key={k || "todos"} type="button" aria-pressed={tipo === k} onClick={() => { setTipo(k); setN(30); }} className={FILTRO(tipo === k)}>{t} <span className="ml-1.5 tabular-nums opacity-80">{contarMovimentos(db, k || undefined)}</span></button>
        ))}
      </div>
      <ul className={cn("mt-4", LISTA)}>
        {L.map((x) => (
          <li key={x.id} className="flex min-h-14 flex-wrap items-baseline gap-x-3 py-3 sm:px-2">
            <span className="min-w-0 flex-1 text-[15px]">{x.t}</span>
            <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{x.q}</span>
          </li>
        ))}
      </ul>
      {total > n && <Button variant="outline" className="mt-3 min-h-11" onClick={() => setN(n + 30)}>Mostrar mais 30 (faltam {total - n})</Button>}
    </>
  );
}

/* ---------------------------------------------------------------- Carrinhas */

function CarrinhasSecao({ db, feito }: { db: Comum["db"]; feito: (m: string) => void }) {
  const C = carrinhasInv(db);
  const [erro, setErro] = useState("");
  return (
    <>
      {erro && <p role="alert" className="mt-4 flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
      {C.map((c) => (
        <section key={c.id} aria-labelledby={"car-" + c.id} className="mt-8">
          <h2 id={"car-" + c.id} className="text-lg font-semibold">{c.nome} <span className="font-normal text-muted-foreground">· {c.quem}</span></h2>
          <ul className={cn("mt-3", LISTA)}>
            {c.linhas.map((l) => {
              const rep = l.baixo ? reposicaoCarrinha(db, c.id, l.sku) : 0;
              return (
                <li key={l.sku} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-2.5 sm:px-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{l.n}</span>
                    <span className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">{l.baixo && <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}{qtd(l.qty, l.un)}{l.baixo ? ` · abaixo do mínimo (${qtd(l.min, l.un)})` : ""}</span>
                  </span>
                  {l.baixo && (rep > 0
                    ? <Button variant="outline" className="min-h-11" onClick={() => { const r = reporCarrinha(c.id, l.sku, rep); if (r.ok) { setErro(""); feito(r.valor); } else setErro(r.erro); }}>Repor {qtd(rep, l.un)}</Button>
                    : <span className="text-sm text-muted-foreground">sem livre no Armazém Central</span>)}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- a obra */

function ObraV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, id }: Comum & { id: number }) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === id)!;
  const o = obraInv(db, d);
  const T = tarefasInv(S, db).filter((t) => t.obra === id);
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">Obra de {o.nome}</h1>
      <p className="mt-1 text-base text-muted-foreground">{o.sub} · {o.quando}{o.ec ? ` · encomenda de cliente ${o.ec}` : ""}</p>
      <p><button type="button" className={LIGACAO} onClick={go(() => A.abrir(id))}>Abrir o negócio<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></p>
      <Feito msg={msg} />
      {o.estado === "pagamento" ? (
        <section aria-label="O que falta" className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
          <p className="flex items-start gap-2 text-lg"><Hourglass className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />À espera do pagamento.</p>
          <p className="mt-1 text-[15px] text-muted-foreground">Quando o Financeiro validar o pagamento, a encomenda de cliente chega aqui: o que há no armazém fica guardado para esta obra e o que falta vai numa encomenda ao fornecedor, por aprovar. Não há nada a fazer no Inventário até lá.</p>
        </section>
      ) : (
        <Agora S={S} t={T[0]} feito={feito} vazio={o.estado === "concluida" ? "A obra acabou. Todo o material saiu." : "Nada por fazer nesta obra agora."} />
      )}
      {o.fases.map((f) => (
        <section key={f.fase} aria-labelledby={"fase-" + f.fase} className="mt-10">
          <h2 id={"fase-" + f.fase} className="text-lg font-semibold">Fase {f.fase} · {f.nome}</h2>
          <p className="text-[15px] text-muted-foreground">{f.quando ? `Começa ${f.quando}` : o.estado === "em curso" ? "Obra em curso" : o.estado === "concluida" ? "Obra acabada" : "Quando a obra arrancar"}{f.aSair ? ` · ${plural(f.aSair, "material pronto", "materiais prontos")} a sair` : ""}</p>
          <ul className={cn("mt-3", LISTA)}>
            {f.itens.map((m) => {
              const corpo = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium group-hover:underline">{m.n}</span>
                    <span className="block text-[15px] tabular-nums text-muted-foreground">{qtd(m.q, m.un)}{m.forn ? ` · ${m.forn}` : ""}</span>
                    <span className="mt-0.5 block"><EstadoMaterial m={m} /></span>
                  </span>
                  {m.sku && SETA}
                </>
              );
              return (
                <li key={m.n}>
                  {m.sku ? <button type="button" onClick={() => ir({ k: "material", sku: m.sku! })} className={LINHA}>{corpo}</button> : <div className="flex min-h-16 items-center gap-4 py-3 sm:px-2">{corpo}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {o.estado !== "pagamento" && !o.fases.length && <p className="mt-8 text-[15px] text-muted-foreground">Esta obra não leva materiais do armazém.</p>}
    </>
  );
}

/* ---------------------------------------------------------------- a encomenda a fornecedor */

function EncomendaV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, id }: Comum & { id: string }) {
  const { S } = ctx;
  const p = poInv(S, db, poPorId(db, id)!), raw = poPorId(db, id)!;
  const T = tarefasInv(S, db).filter((t) => (t.acao.k === "aprovar" || t.acao.k === "receber") && t.acao.po === id);
  const passos: [string, boolean][] = [
    ["Aprovada", p.estado !== "por aprovar"],
    [p.portal ? "No portal do fornecedor" : "Enviada por email", p.estado !== "por aprovar"],
    ["Data confirmada", !!p.prometida],
    ["Recebida", p.estado === "recebida"],
  ];
  const atual = passos.findIndex(([, ok]) => !ok);
  const [erro, setErro] = useState("");
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">Encomenda a {p.forn}</h1>
      <p className="mt-1 text-base text-muted-foreground">{p.id} · {p.deal ? <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => ir({ k: "obra", id: p.deal! })}>{p.para}</button> : p.para} · {p.resumo}</p>
      <ol aria-label="Percurso da encomenda" className="mt-6 grid grid-cols-4 gap-1.5">
        {passos.map(([t, ok], i) => (
          <li key={t} aria-current={i === atual ? "step" : undefined}>
            <span className={cn("block h-2 rounded-full", ok ? "bg-primary" : i === atual ? "bg-primary/50" : "bg-muted")} />
            <span className={cn("mt-1.5 hidden text-sm sm:block", i === atual ? "font-medium text-foreground" : "text-muted-foreground")}>{t}<span className="sr-only">{ok ? " (feito)" : i === atual ? " (agora)" : " (ainda não)"}</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[15px] sm:hidden">{atual < 0 ? "Recebida." : `Passo ${atual + 1} de 4: ${passos[atual][0]}`}</p>
      <Feito msg={msg} />
      <Agora S={S} t={T[0]} feito={feito} vazio={p.estado === "recebida" ? "Recebida. Nada mais a fazer." : p.estado === "cancelada" ? "Cancelada." : "Nada por fazer."} />
      {T.length > 0 && <p className="mt-3 text-[15px] text-muted-foreground">{p.frase}</p>}
      {p.estado === "no fornecedor" && p.portal && (
        <p className="mt-1 text-[15px] text-muted-foreground">
          Protótipo:{" "}
          <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => { const r = simularConfirmacao(id); if (r.ok) { setErro(""); feito(r.valor); } else setErro(r.erro); }}>simular a resposta do fornecedor</button>.
        </p>
      )}
      {erro && <p role="alert" className="mt-2 text-[15px] font-medium text-destructive">{erro}</p>}

      <section aria-labelledby="po-linhas" className="mt-10">
        <h2 id="po-linhas" className="text-lg font-semibold">O que se pediu</h2>
        <ul className={cn("mt-3", LISTA)}>
          {p.linhas.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => ir({ k: "material", sku: l.sku })} className={LINHA}>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium group-hover:underline">{l.n}</span>
                  <span className="block text-[15px] tabular-nums text-muted-foreground">pedido {qtd(l.pedido, l.un)}{l.recebido ? ` · chegou ${qtd(l.recebido, l.un)}` : ""}{l.falta && l.recebido ? ` · faltam ${qtd(l.falta, l.un)}` : ""}</span>
                </span>
                {SETA}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="po-hist" className="mt-10">
        <h2 id="po-hist" className="text-lg font-semibold">Histórico</h2>
        <ul className={cn("mt-3", LISTA)}>
          {[...raw.log].reverse().map((h, i) => (
            <li key={i} className="flex min-h-14 flex-wrap items-baseline gap-x-3 py-3 sm:px-2">
              <span className="min-w-0 flex-1 text-[15px]">{textoHistorico(db, h.t)}</span>
              <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{dia(h.at)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- o material */

function MaterialV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, sku }: Comum & { sku: string }) {
  const { S } = ctx;
  const m = materialInv(S, db, sku)!;
  const T = tarefasInv(S, db).filter((t) => t.acao.k === "encomendar" && t.acao.sku === sku);
  const [corr, setCorr] = useState(false);
  const [nova, setNova] = useState(m.qty);
  const [motivo, setMotivo] = useState<MotivoCorrecao | "">("");
  const [erro, setErro] = useState("");
  const M = movimentosInv(S, db, sku);
  const guardar = () => {
    if (!motivo) { setErro("Escolha o motivo."); setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 30); return; }
    const r = corrigir(sku, m.wh, nova, motivo);
    if (r.ok) { setErro(""); setCorr(false); setMotivo(""); feito(r.valor); } else setErro(r.erro);
  };
  const numeros: [string, string][] = [["No armazém", qtd(m.qty, m.un)], ["Para obras", qtd(m.reservado, m.un)], ["Livre", qtd(Math.max(0, m.livre), m.un)], ["A chegar", qtd(m.aChegar, m.un)]];
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">{m.n}</h1>
      <p className="mt-1 text-base text-muted-foreground">{m.cat} · Armazém Central · prateleira {m.loc}</p>
      <Feito msg={msg} />
      {T.length > 0 && <Agora S={S} t={T[0]} feito={feito} primario={!corr} vazio="" />}

      <dl className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)] sm:grid-cols-4">
        {numeros.map(([t, val], i) => (
          <div key={t} className={cn("p-4 sm:p-5", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border sm:border-t-0", i === 2 && "sm:border-l")}>
            <dt className="text-[15px] text-muted-foreground">{t}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>
      {m.baixo && <p className="mt-3 flex items-start gap-2 text-[15px]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Abaixo do mínimo: quando o livre fica abaixo de {qtd(m.rop, m.un)}, encomenda-se.{m.aChegar > 0 ? " Já está encomendado." : ""}</p>}

      <section aria-labelledby="mat-obras" className="mt-10">
        <h2 id="mat-obras" className="text-lg font-semibold">Guardado para</h2>
        {m.obras.length === 0
          ? <p className="mt-2 text-[15px] text-muted-foreground">Nenhuma obra. Quando uma obra precisa deste material, fica guardado para ela e deixa de estar livre.</p>
          : <ul className={cn("mt-3", LISTA)}>{m.obras.map((o, i) => (
            <li key={i}>
              {o.deal != null
                ? <button type="button" onClick={() => ir({ k: "obra", id: o.deal! })} className={LINHA}><span className="min-w-0 flex-1 text-base font-medium group-hover:underline">Obra de {o.nome}</span><span className="tabular-nums text-[15px] text-muted-foreground">{qtd(o.q, m.un)}</span>{SETA}</button>
                : <div className="flex min-h-16 items-center gap-4 py-3 sm:px-2"><span className="min-w-0 flex-1 text-base">{o.nome}</span><span className="tabular-nums text-[15px] text-muted-foreground">{qtd(o.q, m.un)}</span></div>}
            </li>
          ))}</ul>}
      </section>

      <section aria-labelledby="mat-corrigir" className="mt-10">
        <h2 id="mat-corrigir" className="text-lg font-semibold">A quantidade não bate certo?</h2>
        <Button variant="outline" className="mt-3 min-h-11" aria-expanded={corr} onClick={() => { setCorr(!corr); setNova(m.qty); setErro(""); }}>Corrigir a quantidade</Button>
        {corr && (
          <div className="mt-4 grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] animate-in fade-in-0 slide-in-from-top-1">
            <div className="grid gap-1.5">
              <span id="mot-rot" className="text-[15px] font-medium">Porquê</span>
              <div role="group" aria-labelledby="mot-rot" aria-describedby={erro && !motivo ? "mot-erro" : undefined} className="flex flex-wrap gap-2">
                {MOTIVOS.map((x) => <button key={x.v} type="button" aria-pressed={motivo === x.v} aria-invalid={erro && !motivo ? true : undefined} onClick={() => { setMotivo(x.v); setErro(""); }} className={ESCOLHA(motivo === x.v)}>{x.t}</button>)}
              </div>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[15px] font-medium">Quanto há agora <span className="font-normal text-muted-foreground">(o sistema diz {qtd(m.qty, m.un)})</span></span>
              <ContadorQtd id={"corr-" + sku} valor={nova} un={m.un} nome={m.n} min={0} onMudar={(n) => setNova(Math.round(n))} />
            </div>
            {erro && <p id="mot-erro" role="alert" className="flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
            <div><Button size="lg" className="w-full sm:w-auto" onClick={guardar}>Guardar a correção</Button></div>
          </div>
        )}
      </section>

      <section aria-labelledby="mat-mov" className="mt-10">
        <h2 id="mat-mov" className="text-lg font-semibold">Movimentos</h2>
        <ul className={cn("mt-3", LISTA)}>
          {M.map((x) => (
            <li key={x.id} className="flex min-h-14 flex-wrap items-baseline gap-x-3 py-3 sm:px-2">
              <span className="min-w-0 flex-1 text-[15px]">{x.t}</span>
              <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{x.q}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
