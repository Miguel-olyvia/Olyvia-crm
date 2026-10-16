// Armazém › Receção › "Encomendas por receber" (16/10): a primeira coisa do ecrã. Aqui dá entrada no armazém a mercadoria dos fornecedores.
// Todas as POs que se podem receber (poRecebivel), agrupadas por cliente/obra (a origem: EC, contrato, venda direta), com o bloco "Stock" no fim;
// os blocos de clientes ordenam-se pela entrega prevista mais antiga (atrasadas destacadas). Chips rápidos (Todas, Para clientes, Para stock,
// Atrasadas, Pendentes), pesquisa e filtros (fornecedor, armazém, cliente/obra). "Receber" abre o painel da PO; "Receber tudo" no bloco abre
// a primeira e, a cada receção completa, o painel avança para a seguinte do bloco (lerFilaRececao). O negócio pode abrir a Receção já filtrada.
import { useState } from "react";
import { fmtD, nomeForn } from "./base";
import { useCtxInv } from "./ctxInv";
import { definirFilaRececao, tirarPedidoRececaoInv } from "./loja";
import { Chip } from "./mockPecas";
import { opcoesArmazens, opcoesFornecedores } from "./opcoes";
import { Peq, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poLate, poRecebivel, poRem, poStatus, poStatusLabel } from "./po";
import { OrigemChip } from "./poPecas";
import { abrirRececaoDaPo } from "./rececao";
import { TabelaInv } from "./TabelaInv";
import type { Inventario, Po } from "./tipos";

export type ChipRec = "todas" | "clientes" | "stock" | "atrasadas" | "pendentes";
export interface FiltrosRec { q: string; sup: string; wh: string; cli: string; chip: ChipRec }
export const FILTROS_REC: FiltrosRec = { q: "", sup: "", wh: "", cli: "", chip: "todas" };

/** O cliente/obra de uma PO: a origem (contrato, venda direta, proposta ou EC) ou "" (stock). */
export const chaveCliente = (p: Po): string => (p.origin.k === "stock" ? "" : p.origin.ref || p.origin.ec || "");
const rotuloCliente = (p: Po): string => (p.origin.client ? `${p.origin.client} · ${chaveCliente(p)}` : chaveCliente(p));
const ordenar = (a: Po, b: Po): number => Number(poLate(b)) - Number(poLate(a)) || a.due.localeCompare(b.due) || a.id.localeCompare(b.id);
const doChip = (p: Po, c: ChipRec): boolean =>
  c === "clientes" ? !!chaveCliente(p) : c === "stock" ? !chaveCliente(p) : c === "atrasadas" ? poLate(p) : c === "pendentes" ? p.status === "pending" : true;

/** As POs por receber com a pesquisa e os filtros (sem o chip). */
function semChip(db: Inventario, f: FiltrosRec): Po[] {
  const q = f.q.trim().toLowerCase();
  return db.pos.filter(poRecebivel)
    .filter((p) => (!f.sup || p.sup === f.sup) && (!f.wh || p.wh === f.wh) && (!f.cli || chaveCliente(p) === f.cli))
    .filter((p) => !q || [p.id, nomeForn(db, p.sup), p.origin.ref ?? "", p.origin.client ?? "", p.origin.ec ?? ""].join(" ").toLowerCase().includes(q));
}
/** As POs por receber, filtradas e ordenadas: atrasadas primeiro, depois a entrega prevista. */
export const porReceber = (db: Inventario, f: Partial<FiltrosRec>): Po[] => { const x = { ...FILTROS_REC, ...f }; return semChip(db, x).filter((p) => doChip(p, x.chip)).sort(ordenar); };
/** As contagens dos chips (com os outros filtros aplicados). */
export function contagensRec(db: Inventario, f: Partial<FiltrosRec>): Record<ChipRec, number> {
  const L = semChip(db, { ...FILTROS_REC, ...f });
  return { todas: L.length, clientes: L.filter((p) => doChip(p, "clientes")).length, stock: L.filter((p) => doChip(p, "stock")).length, atrasadas: L.filter(poLate).length, pendentes: L.filter((p) => p.status === "pending").length };
}
export interface BlocoRec { chave: string; titulo: string; pos: Po[]; falta: number; atrasada: boolean }
/** Os blocos por cliente/obra (os atrasados e depois o mais antigo primeiro) e o bloco "Stock" no fim. */
export function blocosRec(L: Po[]): BlocoRec[] {
  const m = new Map<string, BlocoRec>();
  for (const p of L) {
    const k = chaveCliente(p);
    const b = m.get(k) ?? { chave: k, titulo: k ? rotuloCliente(p) : "Stock", pos: [], falta: 0, atrasada: false };
    b.pos.push(p); b.falta += p.lines.reduce((a, l) => a + Math.max(0, poRem(l)), 0); b.atrasada ||= poLate(p);
    m.set(k, b);
  }
  const B = [...m.values()].map((b) => ({ ...b, pos: [...b.pos].sort(ordenar) }));
  const cedo = (b: BlocoRec): string => b.pos.map((p) => p.due).sort()[0] ?? "";
  return [...B.filter((b) => b.chave).sort((a, b) => Number(b.atrasada) - Number(a.atrasada) || cedo(a).localeCompare(cedo(b))), ...B.filter((b) => !b.chave)];
}

// os atalhos (carregar outra vez no ativo volta a mostrar todas)
const CHIPS: [ChipRec, string][] = [["clientes", "Para clientes"], ["stock", "Para stock"], ["atrasadas", "Atrasadas"], ["pendentes", "Pendentes"]];

export function EncomendasPorReceber() {
  const { db, agir } = useCtxInv();
  // aberta pelo negócio ("Abrir Receção"): já filtrada pelo cliente/obra (os separadores da Receção estão em GuiasInv.tsx)
  const [f, setF] = useState<FiltrosRec>(() => { const cli = tirarPedidoRececaoInv(); return cli ? { ...FILTROS_REC, cli } : FILTROS_REC; });
  const lista = porReceber(db, f), n = contagensRec(db, f), blocos = blocosRec(lista);
  const clientes = [...new Map(db.pos.filter(poRecebivel).filter((p) => chaveCliente(p)).map((p) => [chaveCliente(p), rotuloCliente(p)] as const)).entries()];
  const pode = can("inventory.receive");
  const receber = (p: Po, fila: Po[] = []): void => {
    definirFilaRececao(fila.map((x) => x.id));
    agir((d) => abrirRececaoDaPo(d, d.pos.find((x) => x.id === p.id) as Po));
  };
  return (
    <section aria-label={`Encomendas por receber · ${n.todas}`} style={{ marginBottom: 12 }}>
      <div className="chips" role="group" aria-label="Ver" style={{ marginBottom: 8 }}>
        {CHIPS.map(([k, t]) => <Chip key={k} ativo={f.chip === k} aoClicar={() => setF({ ...f, chip: f.chip === k ? "todas" : k })} n={n[k]}>{t}</Chip>)}
      </div>
      <div className="fg" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <label className="fl">Pesquisar<input type="search" value={f.q} placeholder="Nº da PO, fornecedor, cliente ou contrato" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <label className="fl">Fornecedor<select value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value })}><option value="">Todos</option>{opcoesFornecedores(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label className="fl">Armazém<select value={f.wh} onChange={(e) => setF({ ...f, wh: e.target.value })}><option value="">Todos</option>{opcoesArmazens(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label className="fl">Cliente/obra<select value={f.cli} onChange={(e) => setF({ ...f, cli: e.target.value })}><option value="">Todos</option>{clientes.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      </div>
      {blocos.length === 0 ? <Vazio titulo="Nada por receber" texto={f.q || f.sup || f.wh || f.cli || f.chip !== "todas" ? "Nenhuma encomenda com estes filtros." : "Não há encomendas a fornecedor por receber."} /> : blocos.map((b) => (
        <div key={b.chave || "stock"} role="group" aria-label={b.titulo} className="card" style={{ marginBottom: 10, padding: 10 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <b>{b.titulo} — falta {b.falta} un · {b.pos.length} {b.pos.length === 1 ? "encomenda" : "encomendas"}{b.atrasada ? <> <Selo tom="bad">Atrasada</Selo></> : null}</b>
            <Peq disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} aria-label={`Receber tudo: ${b.titulo}`} onClick={() => receber(b.pos[0], b.pos.slice(1))}>Receber tudo</Peq>
          </div>
          <TabelaInv titulo={`Encomendas por receber · ${b.titulo}`} minimo={900} chave={(p) => p.id} linhas={b.pos}
            colunas={[
              { id: "n", titulo: "Nº", classe: () => "mono", celula: (p) => <b>{p.id}</b> },
              { id: "f", titulo: "Fornecedor", celula: (p) => nomeForn(db, p.sup) },
              { id: "o", titulo: "Origem", celula: (p) => <OrigemChip o={p.origin} /> },
              { id: "e", titulo: "Estado", celula: (p) => p.status === "pending" ? <span title="Ainda não confirmada ao fornecedor"><Selo tom="warn">Pendente · não confirmada ao fornecedor</Selo></span> : <Selo tom="info">{poStatusLabel[poStatus(p)]}</Selo> },
              { id: "d", titulo: "Entrega prevista", classe: (p) => (poLate(p) ? "late" : ""), celula: (p) => poLate(p) ? <><b>{fmtD(p.due)}</b> <Selo tom="bad">Atrasada</Selo></> : fmtD(p.due) },
              { id: "x", titulo: "Falta", direita: true, celula: (p) => { const L = p.lines.filter((l) => poRem(l) > 0); return `${L.reduce((a, l) => a + poRem(l), 0)} un / ${L.length} ${L.length === 1 ? "linha" : "linhas"}`; } },
            ]}
            acoes={(p) => <Peq disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} aria-label={`Dar entrada ${p.id}`} onClick={() => receber(p)}>Dar entrada</Peq>} />
        </div>
      ))}
    </section>
  );
}
