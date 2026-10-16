// Armazém › Receção com uma PO escolhida (16/10, como na app): "Receber" numa PO traz aqui. As linhas da encomenda (pedido / recebido / falta),
// a quantidade a receber por linha (inteiros, nunca mais do que falta), "Receber tudo o que falta", a guia do fornecedor (opcional; escolher ou
// abrir uma nova) e "Não vou receber o resto". Confirmar usa receberLinhas (receber.ts): entrada no armazém, custo médio, repartição pela EC e
// pedido de transferência se a EC sai de outro armazém, tudo como já estava. O cesto por códigos continua por baixo.
import { useState } from "react";
import { Check as Visto, PackageCheck, X } from "lucide-react";
import { nomeArm, nomeForn, nomeProd, poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { Nota, Pri, Sec, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poOpen, poRecebivel, poRem, poStatus, poStatusLabel, poUnits } from "./po";
import { receberLinhas } from "./receber";
import { ReceberDialogo } from "./ReceberDialogo";
import { fixarRececao } from "./rececao";
import type { Po } from "./tipos";

export function PainelPoRececao({ aoNovaGuia }: { aoNovaGuia: () => void }) {
  const { db, agir } = useCtxInv();
  const rc = db.rc;
  const p = rc.poFilter ? poPorId(db, rc.poFilter) : undefined;
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [resto, setResto] = useState(false);
  const [erro, setErro] = useState("");
  if (!p) return null;
  const pode = can("inventory.receive");
  const recebivel = poRecebivel(p);
  const guias = db.guias.filter((g) => g.state === "open" && g.sup === p.sup);
  const valor = (id: string): number => { const n = Number(qtd[id] ?? ""); return Number.isFinite(n) ? n : NaN; };
  const tudo = (): void => { setErro(""); setQtd(Object.fromEntries(p.lines.map((l) => [l.id, String(Math.max(0, poRem(l)))]))); };
  const itens = p.lines.map((l) => ({ lineId: l.id, qty: valor(l.id) || 0 })).filter((x) => x.qty > 0);
  const confirmar = (): void => {
    for (const l of p.lines) {
      const v = qtd[l.id];
      if (v === undefined || v === "") continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) { setErro(`Quantidades inteiras: ${nomeProd(db, l.sku)}.`); return; }
      if (n > poRem(l)) { setErro(`Nunca mais do que falta: ${nomeProd(db, l.sku)} tem ${poRem(l)} un por receber.`); return; }
    }
    if (!itens.length) { setErro("Indique pelo menos uma quantidade a receber."); return; }
    const r = agir((d) => receberLinhas(d, poPorId(d, p.id) as Po, itens, d.rc.wh, d.rc.guia || null), (out) => {
      const ec = out.res.reduce((a, x) => a + x.toEC, 0), st = out.res.reduce((a, x) => a + x.toStock, 0);
      return `Receção registada: ${ec ? ec + " un servem Encomendas Clientes · " : ""}${st} un entraram no stock em ${nomeArm(db, rc.wh)} (custo médio atualizado).`;
    });
    if (r.ok) { setQtd({}); setErro(""); } else setErro(r.erro);
  };
  return (
    <section className="card pad" aria-label={`Encomenda ${p.id}`} style={{ marginBottom: 12 }}>
      <div className="row between">
        <h3 style={{ fontSize: 16 }}><PackageCheck className="ic" aria-hidden="true" /> Encomenda {p.id} · {nomeForn(db, p.sup)} <Selo tom={p.status === "pending" ? "warn" : "info"}>{poStatusLabel[poStatus(p)]}</Selo></h3>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => agir((d) => fixarRececao(d, { poFilter: "" }))}><X className="ic sm" aria-hidden="true" />Fechar encomenda</button>
      </div>
      {p.status === "pending" && <Nota tom="warn">{p.id} ainda está pendente (não confirmada ao fornecedor). Pode receber-se; ao receber passa a Encomendado, sem envio ao fornecedor.</Nota>}
      {!recebivel && <Nota tom="info">Esta encomenda já não tem nada para receber ({poStatusLabel[poStatus(p)].toLowerCase()}).</Nota>}
      <div className="fg" style={{ gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
        <label className="fl">Guia do fornecedor (opcional)
          <select value={rc.guia} disabled={!pode} onChange={(e) => { if (e.target.value === "__new") aoNovaGuia(); else agir((d) => fixarRececao(d, { guia: e.target.value })); }}>
            <option value="">Sem guia</option>{guias.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}<option value="__new">+ Nova guia…</option>
          </select>
        </label>
        <span className="muted">Entrada em {nomeArm(db, rc.wh)}</span>
      </div>
      <div className="tw"><table className="min-560">
        <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">Recebido</th><th className="num">Falta</th><th className="num">Receber agora</th></tr></thead>
        <tbody>{p.lines.map((l) => (
          <tr key={l.id}><td>{nomeProd(db, l.sku)} <small className="muted mono">{l.sku}</small>{l.ec ? <><br /><small className="muted">para {l.ec}</small></> : null}</td>
            <td className="num">{poUnits(l) - l.cancelled}</td><td className="num">{l.recv}</td><td className="num">{poRem(l)}</td>
            <td className="num"><input type="number" min={0} max={poRem(l)} step={1} inputMode="numeric" aria-label={`Receber agora: ${nomeProd(db, l.sku)}`} disabled={!pode || !recebivel || poRem(l) <= 0}
              value={qtd[l.id] ?? ""} onChange={(e) => { setErro(""); const v = e.target.value, n = Number(v); setQtd((x) => ({ ...x, [l.id]: v !== "" && Number.isFinite(n) && n > poRem(l) ? String(poRem(l)) : v })); }} style={{ width: 80 }} /></td></tr>
        ))}</tbody>
      </table></div>
      {erro && <Nota tom="bad" alerta>{erro}</Nota>}
      <div className="row between">
        <div className="row">
          <Sec className="btn-sm" disabled={!pode || !recebivel} onClick={tudo}>Receber tudo o que falta</Sec>
          {poOpen(p) && <Sec className="btn-sm btn-ghost" disabled={!can("purchase_orders.manage")} title={can("purchase_orders.manage") ? undefined : porqueNao("purchase_orders.manage")} onClick={() => setResto(true)}>Não vou receber o resto</Sec>}
        </div>
        <Pri disabled={!pode || !recebivel} title={pode ? undefined : porqueNao("inventory.receive")} onClick={confirmar}><Visto className="ic" aria-hidden="true" />Confirmar receção</Pri>
      </div>
      <p className="muted" style={{ marginTop: 6 }}>Também pode ler códigos no telemóvel abaixo: o cesto fica filtrado por esta encomenda.</p>
      {resto && <ReceberDialogo aberto aoFechar={() => setResto(false)} id={p.id} soResto />}
    </section>
  );
}
