// Armazém › Receção › "Encomendas por receber" (16/10): a primeira coisa do ecrã. Todas as POs que se podem receber (pendentes, encomendadas e
// parciais: poRecebivel), com a origem (ex. "CT 2026/1027 · Tiago Almeida"), o estado (aviso nas pendentes), a entrega prevista (atrasadas
// primeiro e destacadas) e o que falta. "Receber" abre ali o painel da PO (PainelPoRececao); fechar o painel volta à lista.
import { useState } from "react";
import { Truck } from "lucide-react";
import { fmtD, nomeForn } from "./base";
import { useCtxInv } from "./ctxInv";
import { opcoesArmazens, opcoesFornecedores } from "./opcoes";
import { Peq, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poLate, poRecebivel, poRem, poStatus, poStatusLabel } from "./po";
import { OrigemChip } from "./poPecas";
import { abrirRececaoDaPo } from "./rececao";
import { TabelaInv } from "./TabelaInv";
import type { Inventario, Po } from "./tipos";

/** As POs por receber, filtradas e ordenadas: atrasadas primeiro, depois a entrega prevista. */
export function porReceber(db: Inventario, f: { q: string; sup: string; wh: string }): Po[] {
  const q = f.q.trim().toLowerCase();
  return db.pos.filter(poRecebivel)
    .filter((p) => (!f.sup || p.sup === f.sup) && (!f.wh || p.wh === f.wh))
    .filter((p) => !q || [p.id, nomeForn(db, p.sup), p.origin.ref ?? "", p.origin.client ?? "", p.origin.ec ?? ""].join(" ").toLowerCase().includes(q))
    .sort((a, b) => Number(poLate(b)) - Number(poLate(a)) || a.due.localeCompare(b.due) || a.id.localeCompare(b.id));
}

export function EncomendasPorReceber() {
  const { db, agir } = useCtxInv();
  const [f, setF] = useState({ q: "", sup: "", wh: "" });
  const lista = porReceber(db, f);
  const pode = can("inventory.receive");
  const receber = (p: Po): void => { agir((d) => abrirRececaoDaPo(d, d.pos.find((x) => x.id === p.id) as Po)); };
  return (
    <section className="card pad" aria-labelledby="rec-por-receber" style={{ marginBottom: 12 }}>
      <div className="row between" style={{ marginBottom: 8 }}><h2 id="rec-por-receber" style={{ fontSize: 16 }}><Truck className="ic" aria-hidden="true" /> Encomendas por receber <span className="muted">· {lista.length}</span></h2></div>
      <div className="fg" style={{ gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
        <label className="fl">Pesquisar<input type="search" value={f.q} placeholder="Nº da PO, fornecedor, cliente ou contrato" onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <label className="fl">Fornecedor<select value={f.sup} onChange={(e) => setF({ ...f, sup: e.target.value })}><option value="">Todos</option>{opcoesFornecedores(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label className="fl">Armazém<select value={f.wh} onChange={(e) => setF({ ...f, wh: e.target.value })}><option value="">Todos</option>{opcoesArmazens(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      </div>
      {lista.length === 0 ? <Vazio titulo="Nada por receber" texto={f.q || f.sup || f.wh ? "Nenhuma encomenda com estes filtros." : "Não há encomendas a fornecedor por receber."} /> : (
        <TabelaInv titulo="Encomendas por receber" minimo={900} chave={(p) => p.id} linhas={lista}
          colunas={[
            { id: "n", titulo: "Nº", classe: () => "mono", celula: (p) => <b>{p.id}</b> },
            { id: "f", titulo: "Fornecedor", celula: (p) => nomeForn(db, p.sup) },
            { id: "o", titulo: "Origem", celula: (p) => <OrigemChip o={p.origin} /> },
            { id: "e", titulo: "Estado", celula: (p) => p.status === "pending" ? <span title="Ainda não confirmada ao fornecedor"><Selo tom="warn">Pendente · não confirmada ao fornecedor</Selo></span> : <Selo tom="info">{poStatusLabel[poStatus(p)]}</Selo> },
            { id: "d", titulo: "Entrega prevista", classe: (p) => (poLate(p) ? "late" : ""), celula: (p) => poLate(p) ? <><b>{fmtD(p.due)}</b> <Selo tom="bad">Atrasada</Selo></> : fmtD(p.due) },
            { id: "x", titulo: "Falta", direita: true, celula: (p) => { const L = p.lines.filter((l) => poRem(l) > 0); return `${L.reduce((a, l) => a + poRem(l), 0)} un / ${L.length} ${L.length === 1 ? "linha" : "linhas"}`; } },
          ]}
          acoes={(p) => <Peq className="btn-p" disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} aria-label={`Receber ${p.id}`} onClick={() => receber(p)}>Receber</Peq>} />
      )}
    </section>
  );
}
