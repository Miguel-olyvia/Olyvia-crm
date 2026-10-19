// O Inventário no V1 (19/10/2026). O do Rafael (inventario/) tem 9 ecrãs num submenu, separadores por cima, tabelas de 9 colunas, listas
// que abrem, cartões de números e palavras como FIFO, PO, EC e SKU. Aqui são quatro ecrãs, todos à volta das obras dos Negócios:
// · o Inventário: o que fazer agora (um só primário), o resto das tarefas e três separadores (Obras, Encomendas, Armazém);
// · a obra: os materiais por fase da obra, com o dia em que cada fase começa e o estado de cada material em palavras;
// · a encomenda a fornecedor: o percurso, as linhas e o que fazer (aprovar, dar entrada);
// · o material: quanto há, para que obras está guardado, o que está a chegar, corrigir a quantidade e o livro de movimentos.
// As regras e as ações são as do Inventário do Rafael, sem mudanças (inventarioV1Acoes.ts); o que mostrar está em inventarioV1Docs.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Hourglass, PackageCheck, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normal } from "./catalogo";
import { ContadorQtd } from "./ContadorQtd";
import { poPorId } from "./inventario/base";
import { tirarPedidoEcInv, useInventario } from "./inventario/loja";
import type { Resultado } from "./inventario/loja";
import { MOTIVOS, aprovar, corrigir, darSaida, encomendar, receber, reporCarrinha, simularConfirmacao, type MotivoCorrecao } from "./inventarioV1Acoes";
import {
  armazemInv, carrinhasInv, dia, encomendasInv, materialInv, movimentosInv, obraInv, obrasInv, plural, poInv, qtd, reposicaoCarrinha, resumoInv, tarefasInv, textoHistorico,
  type MatInv, type MaterialInv, type ObraInv, type PoInv, type TarefaInv,
} from "./inventarioV1Docs";
import type { EstadoMat } from "./obraOps";
import { teclasTablist, type Ctx } from "./pecas";
import { tirarPedidoObraInv } from "./pedidoInvV1";

const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
const LINHA = "group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2";
const LIGACAO = "inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline";
const CAMPO = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const ESCOLHA = (on: boolean): string => cn("min-h-11 shrink-0 rounded-lg border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const FILTRO = (on: boolean): string => cn("inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

type Vista = { k: "lista" } | { k: "obra"; id: number } | { k: "po"; id: string } | { k: "material"; sku: string };
type Sep = "obras" | "encomendas" | "armazem";
const SEPARADORES: { id: Sep; t: string }[] = [{ id: "obras", t: "Obras" }, { id: "encomendas", t: "Encomendas" }, { id: "armazem", t: "Armazém" }];

/** Onde se estava (a página desmonta ao mudar de ecrã no menu). */
let guardada: Vista = { k: "lista" };
let sepGuardado: Sep = "obras";
/** Volta à lista (o menu "Inventário"); sem `soLista`, também ao primeiro separador (repor a demonstração). */
export function esquecerInventarioV1(soLista = false): void { guardada = { k: "lista" }; if (!soLista) sepGuardado = "obras"; }

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
        <ul className="divide-y divide-border border-y border-border">
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
      )}
      {a.k === "sair" && fase && (
        <ul className="divide-y divide-border border-y border-border">
          {fase.itens.filter((m) => m.pronto > 0).map((m) => (
            <li key={m.n} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-[15px]"><span className="min-w-0 flex-1">{m.n}</span><span className="tabular-nums text-muted-foreground">{qtd(m.pronto, m.un)}</span></li>
          ))}
        </ul>
      )}
      {a.k === "aprovar" && p && (
        <p className="text-[15px] text-muted-foreground">{p.lines.map((l) => `${qtd(l.packs * l.packN, db.products.find((x) => x.sku === l.sku)?.unit ?? "un")} de ${(db.products.find((x) => x.sku === l.sku)?.name ?? l.sku).toLowerCase()}`).join(", ")}.</p>
      )}
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
  const [v, setVE] = useState<Vista>(() => {
    const p = tirarPedidoObraInv(); tirarPedidoEcInv();
    return p != null && S.deals.some((d) => d.id === p) ? { k: "obra", id: p } : guardada;
  });
  const [sep, setSepE] = useState<Sep>(sepGuardado);
  const setSep = (s: Sep) => { setSepE(s); sepGuardado = s; };
  const [msg, feito] = useFeito();
  const origem = useRef<string | null>(null);
  const ir = (x: Vista, de?: string) => { if (de) origem.current = de; setVE(x); guardada = x; };
  const voltar = () => {
    ir({ k: "lista" });
    const id = origem.current;
    setTimeout(() => (id ? document.getElementById(id) : null)?.focus(), 30); // A4: o foco volta à linha que abriu
  };
  // O título ganha o foco quando o ecrã muda (A4)
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  useEffect(() => { if (primeira.current && v.k === "lista") { primeira.current = false; return; } primeira.current = false; titulo.current?.focus({ preventScroll: true }); document.getElementById("inv-v1-topo")?.scrollIntoView?.({ block: "start" }); }, [v]);

  const comum = { ctx, db, ir, voltar, feito, msg, titulo };
  return (
    <div id="inv-v1-topo" className="mx-auto w-full max-w-3xl scroll-mt-4 px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      {v.k === "obra" && S.deals.some((d) => d.id === v.id) ? <ObraV1 {...comum} id={v.id} />
        : v.k === "po" && poPorId(db, v.id) ? <EncomendaV1 {...comum} id={v.id} />
        : v.k === "material" && materialInv(S, db, v.sku) ? <MaterialV1 {...comum} sku={v.sku} />
        : <Lista {...comum} sep={sep} setSep={setSep} />}
    </div>
  );
}

interface Comum {
  ctx: Ctx; db: ReturnType<typeof useInventario>; ir: (x: Vista, de?: string) => void; voltar: () => void; feito: (m: string) => void; msg: string;
  titulo: React.RefObject<HTMLHeadingElement>;
}

/* ---------------------------------------------------------------- o Inventário */

function Lista({ ctx, db, ir, feito, msg, titulo, sep, setSep }: Comum & { sep: Sep; setSep: (s: Sep) => void }) {
  const { S } = ctx;
  const T = tarefasInv(S, db), [primeira, ...resto] = T;
  const [todas, setTodas] = useState(false);
  const abrirTarefa = (t: TarefaInv) => {
    const a = t.acao;
    if (a.k === "aprovar" || a.k === "receber") ir({ k: "po", id: a.po }, "t-" + t.id);
    else if (a.k === "sair") ir({ k: "obra", id: a.deal }, "t-" + t.id);
    else ir({ k: "material", sku: a.sku }, "t-" + t.id);
  };
  return (
    <>
      <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">Inventário</h1>
      <p className="mt-1 text-base text-muted-foreground">{resumoInv(S, db)}</p>
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
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {resto.length > 4 && <Button variant="outline" className="mt-3 min-h-11" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? "Mostrar menos" : `Mostrar mais ${resto.length - 4}`}</Button>}
        </section>
      )}

      <div role="tablist" aria-label="Inventário" className="mt-12 flex gap-1 border-b border-border">
        {SEPARADORES.map((s, i) => (
          <button key={s.id} id={"inv-sep-" + s.id} type="button" role="tab" aria-selected={sep === s.id} aria-controls="inv-painel" tabIndex={sep === s.id ? 0 : -1}
            onClick={() => setSep(s.id)} onKeyDown={(e) => teclasTablist(e, i, SEPARADORES.map((x) => x.id), "inv-sep", setSep)}
            className={cn("inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-[15px] font-medium transition-colors", sep === s.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {s.t}
          </button>
        ))}
      </div>
      <div id="inv-painel" role="tabpanel" aria-labelledby={"inv-sep-" + sep} className="animate-in fade-in-0 duration-200">
        {sep === "obras" && <ObrasPainel ctx={ctx} db={db} ir={ir} />}
        {sep === "encomendas" && <EncomendasPainel ctx={ctx} db={db} ir={ir} />}
        {sep === "armazem" && <ArmazemPainel ctx={ctx} db={db} ir={ir} feito={feito} />}
      </div>
    </>
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
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function ObrasPainel({ ctx, db, ir }: Pick<Comum, "ctx" | "db" | "ir">) {
  const O = obrasInv(ctx.S, db), abertas = O.filter((o) => o.estado !== "concluida"), acabadas = O.filter((o) => o.estado === "concluida");
  const [ver, setVer] = useState(false);
  return (
    <div className="pt-6">
      <p className="text-[15px] text-muted-foreground">Cada obra mostra os materiais por fase e quando cada fase começa. A encomenda de cliente nasce quando o Financeiro valida o pagamento: o que há no armazém fica guardado para a obra, o resto vai ao fornecedor.</p>
      {abertas.length === 0
        ? <p className="mt-4 text-[15px] text-muted-foreground">Ainda não há obras. Aparecem quando o cliente assina o contrato.</p>
        : <ul className={cn("mt-4", LISTA)}>{abertas.map((o) => <LinhaObra key={o.id} o={o} ir={ir} />)}</ul>}
      {acabadas.length > 0 && (
        <>
          <Button variant="ghost" className="mt-3 min-h-11" aria-expanded={ver} onClick={() => setVer(!ver)}>{ver ? "Esconder as obras acabadas" : `Ver as obras acabadas (${acabadas.length})`}</Button>
          {ver && <ul className={cn("mt-2", LISTA)}>{acabadas.map((o) => <LinhaObra key={o.id} o={o} ir={ir} />)}</ul>}
        </>
      )}
    </div>
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
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function EncomendasPainel({ ctx, db, ir }: Pick<Comum, "ctx" | "db" | "ir">) {
  const G = encomendasInv(ctx.S, db);
  const [todas, setTodas] = useState(false);
  const grupo = (id: string, t: string, L: PoInv[], vazio: string) => (
    <section aria-labelledby={id} className="mt-8">
      <h2 id={id} className="text-lg font-semibold">{t}</h2>
      {L.length ? <ul className={cn("mt-3", LISTA)}>{L.map((p) => <LinhaPo key={p.id} p={p} ir={ir} />)}</ul> : <p className="mt-2 text-[15px] text-muted-foreground">{vazio}</p>}
    </section>
  );
  const forn = db.suppliers.filter((s) => !s.deleted && s.active);
  return (
    <div className="pt-2">
      {grupo("enc-aprovar", "Por aprovar", G.porAprovar, "Nenhuma. As encomendas das obras nascem aqui, por aprovar, quando falta material no armazém.")}
      {grupo("enc-caminho", "A caminho", G.aCaminho, "Nada a caminho.")}
      {G.recebidas.length > 0 && (
        <section aria-labelledby="enc-recebidas" className="mt-8">
          <h2 id="enc-recebidas" className="text-lg font-semibold">Recebidas</h2>
          <ul className={cn("mt-3", LISTA)}>{(todas ? G.recebidas : G.recebidas.slice(0, 3)).map((p) => <LinhaPo key={p.id} p={p} ir={ir} />)}</ul>
          {G.recebidas.length > 3 && <Button variant="outline" className="mt-3 min-h-11" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? "Mostrar menos" : `Mostrar mais ${G.recebidas.length - 3}`}</Button>}
        </section>
      )}
      <section aria-labelledby="enc-forn" className="mt-10">
        <h2 id="enc-forn" className="text-lg font-semibold">Fornecedores</h2>
        <ul className={cn("mt-3", LISTA)}>
          {forn.map((s) => (
            <li key={s.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-3 sm:px-2">
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{s.name}</span>
                <span className="block text-[15px] text-muted-foreground">{s.city} · entrega em {plural(s.sla, "dia", "dias")} · {s.portal === "active" ? "recebe as encomendas no portal" : "recebe as encomendas por email"}</span>
              </span>
              <a href={"tel:" + s.phone.replace(/\s/g, "")} className={cn(LIGACAO, "tabular-nums")}>{s.phone}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- Armazém */

type FiltroArm = "todos" | "baixo" | "obras";
function ArmazemPainel({ ctx, db, ir, feito }: Pick<Comum, "ctx" | "db" | "ir" | "feito">) {
  const [onde, setOnde] = useState<"central" | "carrinhas">("central");
  const [q, setQ] = useState("");
  const [f, setF] = useState<FiltroArm>("todos");
  const todos = armazemInv(ctx.S, db);
  const L = todos.filter((m) => (f === "baixo" ? m.baixo : f === "obras" ? m.reservado > 0 : true) && (!q.trim() || normal(m.n + " " + m.cat).includes(normal(q.trim()))));
  const n = (k: FiltroArm) => todos.filter((m) => (k === "baixo" ? m.baixo : k === "obras" ? m.reservado > 0 : true)).length;
  return (
    <div className="pt-6">
      <div role="group" aria-label="Onde" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={onde === "central"} onClick={() => setOnde("central")} className={ESCOLHA(onde === "central")}>Armazém Central</button>
        <button type="button" aria-pressed={onde === "carrinhas"} onClick={() => setOnde("carrinhas")} className={ESCOLHA(onde === "carrinhas")}>Carrinhas</button>
      </div>
      {onde === "central" ? (
        <>
          <label className="relative mt-5 block">
            <span className="sr-only">Procurar</span>
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar material (ex.: cerâmico, silicone)" className={cn(CAMPO, "pl-10")} />
          </label>
          <div role="group" aria-label="Mostrar" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
            {([["todos", "Todos"], ["baixo", "Abaixo do mínimo"], ["obras", "Guardados para obras"]] as [FiltroArm, string][]).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)} className={FILTRO(f === k)}>{t} <span className="ml-1.5 tabular-nums opacity-80">{n(k)}</span></button>
            ))}
          </div>
          <p className="sr-only" aria-live="polite">{plural(L.length, "material", "materiais")}</p>
          {L.length === 0
            ? <p className="mt-4 text-[15px] text-muted-foreground">Nenhum material com esse nome.</p>
            : <ul className={cn("mt-4", LISTA)}>{L.map((m) => <LinhaMaterial key={m.sku} m={m} ir={ir} />)}</ul>}
        </>
      ) : <Carrinhas db={db} feito={feito} />}
    </div>
  );
}

function LinhaMaterial({ m, ir }: { m: MaterialInv; ir: Comum["ir"] }) {
  return (
    <li>
      <button id={"m-" + m.sku} type="button" onClick={() => ir({ k: "material", sku: m.sku }, "m-" + m.sku)} className={LINHA}>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium group-hover:underline">{m.n}</span>
          <span className="block text-[15px] tabular-nums text-muted-foreground">
            {qtd(m.qty, m.un)} no armazém{m.reservado > 0 ? ` · ${qtd(m.reservado, m.un)} para obras` : ""} · {qtd(Math.max(0, m.livre), m.un)} livres{m.aChegar > 0 ? ` · ${qtd(m.aChegar, m.un)} a chegar` : ""}
          </span>
          {m.baixo && <span className="mt-0.5 flex items-center gap-1.5 text-[15px]"><AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Abaixo do mínimo ({qtd(m.rop, m.un)}){m.aChegar > 0 ? ", já encomendado" : ""}</span>}
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

function Carrinhas({ db, feito }: { db: Comum["db"]; feito: (m: string) => void }) {
  const C = carrinhasInv(db);
  const [erro, setErro] = useState("");
  return (
    <div className="mt-5">
      <p className="text-[15px] text-muted-foreground">O que cada carrinha leva. Abaixo do mínimo, repõe-se a partir do Armazém Central.</p>
      {erro && <p role="alert" className="mt-3 flex items-center gap-2 text-[15px] font-medium text-destructive"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{erro}</p>}
      {C.map((c) => (
        <section key={c.id} aria-labelledby={"car-" + c.id} className="mt-6">
          <h3 id={"car-" + c.id} className="text-base font-semibold">{c.nome} <span className="font-normal text-muted-foreground">· {c.quem}</span></h3>
          <ul className={cn("mt-2", LISTA)}>
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
    </div>
  );
}

/* ---------------------------------------------------------------- a obra */

function ObraV1({ ctx, db, ir, voltar, feito, msg, titulo, id }: Comum & { id: number }) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === id)!;
  const o = obraInv(db, d);
  const T = tarefasInv(S, db).filter((t) => t.obra === id);
  return (
    <>
      <Voltar onClick={voltar}>Inventário</Voltar>
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
                  {m.sku && <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />}
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

function EncomendaV1({ ctx, db, ir, voltar, feito, msg, titulo, id }: Comum & { id: string }) {
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
      <Voltar onClick={voltar}>Inventário</Voltar>
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
                <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
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

function MaterialV1({ ctx, db, ir, voltar, feito, msg, titulo, sku }: Comum & { sku: string }) {
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
      <Voltar onClick={voltar}>Inventário</Voltar>
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
                ? <button type="button" onClick={() => ir({ k: "obra", id: o.deal! })} className={LINHA}><span className="min-w-0 flex-1 text-base font-medium group-hover:underline">Obra de {o.nome}</span><span className="tabular-nums text-[15px] text-muted-foreground">{qtd(o.q, m.un)}</span><ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /></button>
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

