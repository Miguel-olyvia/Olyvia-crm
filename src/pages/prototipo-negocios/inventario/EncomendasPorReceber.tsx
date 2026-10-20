// Armazém › Receção › "Por receber" (19/10, por ordem de chegada): uma linha por encomenda a fornecedor, na mesma tabela, com cabeçalhos de grupo
// (Chega hoje / amanhã · Atrasadas · Confirmadas pelo fornecedor · À espera do fornecedor · Por enviar ao fornecedor — rececaoLista.ts). A data que
// conta é a prometida no portal (se confirmada) ou a prevista; as confirmadas desde ontem levam "NOVA". "Dar entrada →" fica sempre à vista
// (coluna fixa à direita; no telemóvel cada encomenda é um cartão com o botão na largura toda). "Agrupar" volta aos blocos por cliente/obra
// (com "Receber tudo" do bloco, em fila) ou por fornecedor. Chips: Hoje/amanhã, Atrasadas, Para clientes, Para stock; os filtros ficam em "Filtros ▾".
// Os filtros vivem em GuiasInv (a barra de leitura também filtra esta lista).
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Filter, Info, Send, Sparkles, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDS, nomeForn } from "./base";
import { useCtxInv } from "./ctxInv";
import { definirFilaRececao } from "./loja";
import { Chip } from "./mockPecas";
import { opcoesArmazens, opcoesFornecedores } from "./opcoes";
import { Peq, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poRecebivel, poRem } from "./po";
import { OrigemChip } from "./poPecas";
import { abrirRececaoDaPo } from "./rececao";
import { GRUPOS_REC, atrasadaRec, compararRececao, dataEntregaEf, grupoRececao, novaConfirmacao, ordenarRececao, seloRececao, textoFalta } from "./rececaoLista";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Inventario, Po, Tom } from "./tipos";

export type ChipRec = "todas" | "hoje" | "atrasadas" | "clientes" | "stock";
export type AgruparRec = "nao" | "forn" | "cli";
/** `ids`/`lido`: o filtro posto pela barra de leitura (as POs de uma guia, de um artigo ou de vários números). */
export interface FiltrosRec { q: string; sup: string; wh: string; cli: string; chip: ChipRec; ids: string[]; lido: string }
export const FILTROS_REC: FiltrosRec = { q: "", sup: "", wh: "", cli: "", chip: "todas", ids: [], lido: "" };

/** O cliente/obra de uma PO: a origem (contrato, venda direta, proposta ou EC) ou "" (stock). */
export const chaveCliente = (p: Po): string => (p.origin.k === "stock" ? "" : p.origin.ref || p.origin.ec || "");
const rotuloCliente = (p: Po): string => (p.origin.client ? `${p.origin.client} · ${chaveCliente(p)}` : chaveCliente(p));
const doChip = (p: Po, c: ChipRec): boolean =>
  c === "clientes" ? !!chaveCliente(p) : c === "stock" ? !chaveCliente(p) : c === "atrasadas" ? atrasadaRec(p) : c === "hoje" ? grupoRececao(p) <= 0 : true;

/** As POs por receber com a pesquisa e os filtros (sem o chip). */
function semChip(db: Inventario, f: FiltrosRec): Po[] {
  const q = f.q.trim().toLowerCase();
  return db.pos.filter(poRecebivel)
    .filter((p) => (!f.sup || p.sup === f.sup) && (!f.wh || p.wh === f.wh) && (!f.cli || chaveCliente(p) === f.cli) && (!f.ids.length || f.ids.includes(p.id)))
    .filter((p) => !q || [p.id, nomeForn(db, p.sup), p.origin.ref ?? "", p.origin.client ?? "", p.origin.ec ?? ""].join(" ").toLowerCase().includes(q));
}
/** As POs por receber, filtradas e por ordem de chegada (grupo, depois a data efetiva). */
export const porReceber = (db: Inventario, f: Partial<FiltrosRec>): Po[] => { const x = { ...FILTROS_REC, ...f }; return ordenarRececao(semChip(db, x).filter((p) => doChip(p, x.chip))); };
/** As contagens dos chips (com os outros filtros aplicados). */
export function contagensRec(db: Inventario, f: Partial<FiltrosRec>): Record<ChipRec, number> {
  const L = semChip(db, { ...FILTROS_REC, ...f });
  const n = (c: ChipRec): number => L.filter((p) => doChip(p, c)).length;
  return { todas: L.length, hoje: n("hoje"), atrasadas: n("atrasadas"), clientes: n("clientes"), stock: n("stock") };
}
export interface BlocoRec { chave: string; titulo: string; pos: Po[]; falta: number; atrasada: boolean }
/** Os blocos por cliente/obra (os atrasados e depois o mais antigo primeiro, o bloco "Stock" no fim) ou por fornecedor (pela ordem de chegada). */
export function blocosRec(L: Po[], por: "cli" | "forn" = "cli", nome: (sup: string) => string = (s) => s): BlocoRec[] {
  const m = new Map<string, BlocoRec>();
  for (const p of L) {
    const k = por === "cli" ? chaveCliente(p) : p.sup;
    const b = m.get(k) ?? { chave: k, titulo: por === "forn" ? nome(p.sup) : k ? rotuloCliente(p) : "Stock", pos: [], falta: 0, atrasada: false };
    b.pos.push(p); b.falta += p.lines.reduce((a, l) => a + Math.max(0, poRem(l)), 0); b.atrasada ||= atrasadaRec(p);
    m.set(k, b);
  }
  const B = [...m.values()].map((b) => ({ ...b, pos: ordenarRececao(b.pos) }));
  if (por === "forn") return B.sort((a, b) => compararRececao(a.pos[0], b.pos[0]));
  const cedo = (b: BlocoRec): string => b.pos.map(dataEntregaEf).sort()[0] ?? "";
  return [...B.filter((b) => b.chave).sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || cedo(a).localeCompare(cedo(b))), ...B.filter((b) => !b.chave)];
}

const ICONE_TOM: Record<Tom, LucideIcon> = { ok: CheckCircle2, info: Info, warn: Send, bad: XCircle, violet: Info, neu: Clock };
/** O selo do portal na Receção, com ícone e texto (nunca só cor). */
export function SeloRec({ p }: { p: Po }) {
  const [t, tom] = seloRececao(p);
  const I = ICONE_TOM[tom];
  return <Selo tom={tom}><I className="ic sm" aria-hidden="true" />{t}</Selo>;
}
/** "NOVA": confirmada pelo fornecedor desde ontem. */
export const SeloNova = () => <Selo tom="violet" className="rec-nova"><Sparkles className="ic sm" aria-hidden="true" />NOVA</Selo>;

/** A entrega: a data efetiva, com "Atrasada" (ícone e texto) se já passou. */
function Entrega({ p }: { p: Po }) {
  const d = dataEntregaEf(p);
  return atrasadaRec(p) ? <Selo tom="bad"><AlertTriangle className="ic sm" aria-hidden="true" />Atrasada · {fmtDS(d)}</Selo> : <small className="muted">entrega {fmtDS(d)}</small>;
}

// os atalhos (carregar outra vez no ativo volta a mostrar todas)
const CHIPS: [ChipRec, string][] = [["hoje", "Hoje/amanhã"], ["atrasadas", "Atrasadas"], ["clientes", "Para clientes"], ["stock", "Para stock"]];
const AGRUPAR: [AgruparRec, string][] = [["nao", "Não"], ["forn", "Fornecedor"], ["cli", "Cliente"]];

function colunas(db: Inventario): Coluna<Po>[] {
  return [
    { id: "n", titulo: "Nº", classe: () => "rec-n", celula: (p) => <><b className="mono">{p.id}</b>{novaConfirmacao(p) ? <> <SeloNova /></> : null}</> },
    { id: "f", titulo: "Fornecedor", classe: () => "rec-f", celula: (p) => nomeForn(db, p.sup) },
    { id: "o", titulo: "Para", classe: () => "rec-o", celula: (p) => <OrigemChip o={p.origin} /> },
    { id: "e", titulo: "Portal · entrega", classe: () => "rec-e", celula: (p) => <span className="rec-portal"><SeloRec p={p} /> <Entrega p={p} /><span className="rec-falta-in"> · falta {textoFalta(p)}</span></span> },
    { id: "x", titulo: "Falta", direita: true, classe: () => "rec-falta", celula: (p) => textoFalta(p) },
  ];
}

export function EncomendasPorReceber({ f, setF }: { f: FiltrosRec; setF: (f: FiltrosRec) => void }) {
  const { db, agir } = useCtxInv();
  const [agrupar, setAgrupar] = useState<AgruparRec>("nao");
  const [filtros, setFiltros] = useState(() => !!(f.sup || f.wh || f.cli || f.q));
  const lista = porReceber(db, f), n = contagensRec(db, f);
  const clientes = [...new Map(db.pos.filter(poRecebivel).filter((p) => chaveCliente(p)).map((p) => [chaveCliente(p), rotuloCliente(p)] as const)).entries()];
  const pode = can("inventory.receive");
  const alvo = db.rc.poFilter;
  const receber = (p: Po, fila: Po[] = []): void => {
    definirFilaRececao(fila.map((x) => x.id));
    agir((d) => abrirRececaoDaPo(d, d.pos.find((x) => x.id === p.id) as Po));
  };
  // vindo de "Receber no armazém →": rola até à PO (o painel dela já está aberto)
  useEffect(() => {
    if (!alvo) return;
    const reduz = typeof window.matchMedia === "function" && !!window.matchMedia("(prefers-reduced-motion: reduce)")?.matches;
    document.getElementById("rec-" + alvo)?.scrollIntoView?.({ block: "center", behavior: reduz ? "auto" : "smooth" });
  }, [alvo]);
  const nFiltros = [f.sup, f.wh, f.cli, f.q.trim()].filter(Boolean).length;
  const cols = colunas(db);
  const acao = (p: Po) => (
    <button type="button" className="btn btn-sm btn-p rec-dar" disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} aria-label={`Dar entrada ${p.id}`} onClick={() => receber(p)}>Dar entrada →</button>
  );
  // o grupo -1 (expedidas, só protótipo) usa o destaque do grupo 0
  const classeGrupo = (g: number): string => (g < 0 ? "rec-g0 rec-exp" : `rec-g${g}`);
  const linhaClasse = (p: Po): string => cn(classeGrupo(grupoRececao(p)), p.id === alvo && "rec-alvo");
  const cabGrupo = (L: Po[]) => (p: Po, i: number) => {
    const g = grupoRececao(p);
    if (i > 0 && grupoRececao(L[i - 1]) === g) return null;
    const k = L.filter((x) => grupoRececao(x) === g).length;
    return <tr className={`rec-grp ${classeGrupo(g)}`}><th colSpan={cols.length + 1} scope="colgroup">{GRUPOS_REC[g]} <span className="cnt">· {k}</span></th></tr>;
  };
  const vazio = <Vazio titulo="Nada por receber" texto={nFiltros || f.chip !== "todas" || f.ids.length ? "Nenhuma encomenda com estes filtros." : "Não há encomendas a fornecedor por receber."} />;
  return (
    <section aria-label={`Encomendas por receber · ${n.todas}`} className="rec-lista" style={{ marginBottom: 12 }}>
      <div className="row rec-barra-f" style={{ marginBottom: 8 }}>
        <div className="chips rec-chips" role="group" aria-label="Ver">
          {CHIPS.map(([k, t]) => <Chip key={k} ativo={f.chip === k} aoClicar={() => setF({ ...f, chip: f.chip === k ? "todas" : k })} n={n[k]}>{t}</Chip>)}
        </div>
        <button type="button" className="btn btn-sm" aria-expanded={filtros} aria-controls="rec-filtros" onClick={() => setFiltros(!filtros)}>
          <Filter className="ic sm" aria-hidden="true" />Filtros{nFiltros ? ` (${nFiltros})` : ""}<ChevronDown className="ic sm" aria-hidden="true" />
        </button>
        <label className="inl rec-agrupar">Agrupar
          <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as AgruparRec)}>{AGRUPAR.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
      </div>
      {filtros && (
        <div id="rec-filtros" className="fg" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginBottom: 8 }}>
          <label className="fl">Pesquisar<input type="search" value={f.q} placeholder="Nº da PO, fornecedor, cliente ou contrato" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <label className="fl">Fornecedor<select value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value })}><option value="">Todos</option>{opcoesFornecedores(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label className="fl">Armazém<select value={f.wh} onChange={(e) => setF({ ...f, wh: e.target.value })}><option value="">Todos</option>{opcoesArmazens(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label className="fl">Cliente/obra<select value={f.cli} onChange={(e) => setF({ ...f, cli: e.target.value })}><option value="">Todos</option>{clientes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        </div>
      )}
      {f.ids.length > 0 && (
        <div className="row" style={{ marginBottom: 8 }}>
          <Selo tom="info"><Filter className="ic sm" aria-hidden="true" />Leitura «{f.lido}»: {f.ids.length} {f.ids.length === 1 ? "encomenda" : "encomendas"}</Selo>
          <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, ids: [], lido: "" })}>Tirar filtro</button>
        </div>
      )}
      {lista.length === 0 ? vazio : agrupar === "nao" ? (
        <TabelaInv titulo="Encomendas por receber, por ordem de chegada" classeTabela="rec-tab" chave={(p) => p.id} linhas={lista} idLinha={(p) => "rec-" + p.id}
          classeLinha={linhaClasse} antes={cabGrupo(lista)} colunas={cols} acoes={acao} />
      ) : blocosRec(lista, agrupar, (s) => nomeForn(db, s)).map((b) => (
        <div key={b.chave || "stock"} role="group" aria-label={b.titulo} className="card" style={{ marginBottom: 10, padding: 10 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <b>{b.titulo} — falta {b.falta} un · {b.pos.length} {b.pos.length === 1 ? "encomenda" : "encomendas"}{b.atrasada ? <> <Selo tom="bad"><AlertTriangle className="ic sm" aria-hidden="true" />Atrasada</Selo></> : null}</b>
            <Peq disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} aria-label={`Receber tudo: ${b.titulo}`} onClick={() => receber(b.pos[0], b.pos.slice(1))}>Receber tudo</Peq>
          </div>
          <TabelaInv titulo={`Encomendas por receber · ${b.titulo}`} classeTabela="rec-tab" chave={(p) => p.id} linhas={b.pos} idLinha={(p) => "rec-" + p.id}
            classeLinha={linhaClasse} colunas={cols} acoes={acao} />
        </div>
      ))}
    </section>
  );
}
