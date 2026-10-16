// Armazém › Receção › "Dar entrada" (16/10, redesenho): o painel lateral de uma encomenda a fornecedor. As linhas vêm com a quantidade que
// falta (editável: inteiros, até ao que falta), a guia do fornecedor é opcional (escolher ou "+ Nova guia"), a Pendente tem aviso e
// "Confirmar entrada" usa receberLinhas (receber.ts): entrada no armazém, custo médio, reserva para a EC e transferência se a EC sai de outro
// armazém, tudo como já estava. Fecha ao confirmar (com "Receber tudo" do cartão, passa à encomenda seguinte desse cliente/obra).
// "Não vou receber o resto" é um link secundário (só encomendas já encomendadas ou parciais).
import { useState } from "react";
import { Check as Visto } from "lucide-react";
import { nomeArm, nomeForn, nomeProd, poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { Folha } from "./DialogosInv";
import { definirFilaRececao, lerFilaRececao } from "./loja";
import { Nota, Pri, Sec, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poOpen, poRecebivel, poRem, poStatus, poStatusLabel, poUnits } from "./po";
import { receberLinhas, type ResultadoRececao } from "./receber";
import { ReceberDialogo } from "./ReceberDialogo";
import { abrirRececaoDaPo, fixarRececao } from "./rececao";
import type { Inventario, Po } from "./tipos";

/** "Entrou no Armazém Central · 8 un reservadas para Tiago Almeida · 2 un para stock." */
export function textoEntrada(db: Inventario, p: Po, wh: string, out: ResultadoRececao): string {
  const ec = out.res.reduce((a, x) => a + x.toEC, 0), st = out.res.reduce((a, x) => a + x.toStock, 0);
  const para = p.origin.client || p.origin.ref || out.res.find((x) => x.ec)?.ec || "a encomenda de cliente";
  return [`Entrou no ${nomeArm(db, wh)}`, ec ? `${ec} un reservadas para ${para}` : "", st ? `${st} un para stock` : ""].filter(Boolean).join(" · ") + ".";
}

function Corpo({ p, aoNovaGuia, fechar }: { p: Po; aoNovaGuia: () => void; fechar: () => void }) {
  const { db, agir } = useCtxInv();
  const rc = db.rc;
  const [qtd, setQtd] = useState<Record<string, string>>(() => Object.fromEntries(p.lines.map((l) => [l.id, String(Math.max(0, poRem(l)))])));
  const [resto, setResto] = useState(false);
  const [erro, setErro] = useState("");
  const pode = can("inventory.receive") && poRecebivel(p);
  const guias = db.guias.filter((g) => g.state === "open" && g.sup === p.sup);
  const fila = lerFilaRececao();
  const confirmar = (): void => {
    const itens: { lineId: string; qty: number }[] = [];
    for (const l of p.lines) {
      const v = qtd[l.id] ?? "", n = Number(v);
      if (v === "" || n === 0) continue;
      if (!Number.isInteger(n) || n < 0) { setErro(`Quantidades inteiras: ${nomeProd(db, l.sku)}.`); return; }
      itens.push({ lineId: l.id, qty: n });
    }
    if (!itens.length) { setErro("Indique pelo menos uma quantidade a receber."); return; }
    const wh = rc.wh;
    const r = agir((d) => {
      const po = poPorId(d, p.id) as Po;
      const out = receberLinhas(d, po, itens, wh, d.rc.guia || null);
      // com "Receber tudo" (fila do cartão) passa à seguinte que ainda se recebe; senão fecha o painel
      const resto = lerFilaRececao().filter((x) => x !== po.id);
      const prox = resto.map((x) => poPorId(d, x)).find((x): x is Po => !!x && poRecebivel(x));
      definirFilaRececao(prox ? resto.slice(resto.indexOf(prox.id) + 1) : []);
      if (prox) abrirRececaoDaPo(d, prox); else fixarRececao(d, { poFilter: "" });
      return out;
    }, (out) => textoEntrada(db, p, wh, out));
    if (!r.ok) setErro(r.erro);
  };
  return (
    <Folha aberta aoFechar={fechar} chave={p.id} titulo={`Dar entrada · ${p.id}`} subtitulo={`Armazém › Receção · ${nomeForn(db, p.sup)}`}
      selos={<><Selo tom={p.status === "pending" ? "warn" : "info"}>{poStatusLabel[poStatus(p)]}</Selo>{p.origin.client ? <Selo tom="violet">{`${p.origin.client} · ${p.origin.ref ?? p.origin.ec}`}</Selo> : null}</>}
      rodape={<><Sec onClick={fechar}>Cancelar</Sec><Pri disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} onClick={confirmar}><Visto className="ic" aria-hidden="true" />Confirmar entrada</Pri></>}>
      {fila.length > 0 && <Nota tom="info">Receber tudo: depois desta, {fila.length === 1 ? "falta 1 encomenda" : `faltam ${fila.length} encomendas`} deste cliente/obra ({fila.join(", ")}).</Nota>}
      {p.status === "pending" && <Nota tom="warn">{p.id} ainda está pendente (não confirmada ao fornecedor). Pode dar entrada; passa a Encomendado, sem envio ao fornecedor.</Nota>}
      <p className="muted">Entra no {nomeArm(db, rc.wh)}.</p>
      <div className="tw"><table className="min-560">
        <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">Recebido</th><th className="num">Falta</th><th className="num">Dar entrada</th></tr></thead>
        <tbody>{p.lines.map((l) => (
          <tr key={l.id}><td>{nomeProd(db, l.sku)} <small className="muted mono">{l.sku}</small>{l.ec ? <><br /><small className="muted">reserva para {l.ec}</small></> : null}</td>
            <td className="num">{poUnits(l) - l.cancelled}</td><td className="num">{l.recv}</td><td className="num">{poRem(l)}</td>
            <td className="num"><input type="number" min={0} max={poRem(l)} step={1} inputMode="numeric" aria-label={`Dar entrada: ${nomeProd(db, l.sku)}`} disabled={!pode || poRem(l) <= 0}
              value={qtd[l.id] ?? ""} onChange={(e) => { setErro(""); const v = e.target.value, n = Number(v); setQtd((x) => ({ ...x, [l.id]: v !== "" && Number.isFinite(n) && n > poRem(l) ? String(poRem(l)) : v })); }} style={{ width: 80 }} /></td></tr>
        ))}</tbody>
      </table></div>
      <label className="fl">Guia do fornecedor (opcional)
        <select value={rc.guia} disabled={!pode} onChange={(e) => { if (e.target.value === "__new") aoNovaGuia(); else agir((d) => fixarRececao(d, { guia: e.target.value })); }}>
          <option value="">Sem guia</option>{guias.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}<option value="__new">+ Nova guia…</option>
        </select>
      </label>
      {erro && <Nota tom="bad" alerta>{erro}</Nota>}
      {poOpen(p) && <button type="button" className="link" disabled={!can("purchase_orders.manage")} title={can("purchase_orders.manage") ? undefined : porqueNao("purchase_orders.manage")} onClick={() => setResto(true)}>Não vou receber o resto</button>}
      {resto && <ReceberDialogo aberto aoFechar={() => setResto(false)} id={p.id} soResto />}
    </Folha>
  );
}

/** O painel "Dar entrada" da encomenda escolhida na Receção (db.rc.poFilter). Fechar tira a escolha e a fila. */
export function PainelPoRececao({ aoNovaGuia }: { aoNovaGuia: () => void }) {
  const { db, agir } = useCtxInv();
  const p = db.rc.poFilter ? poPorId(db, db.rc.poFilter) : undefined;
  if (!p) return null;
  const fechar = (): void => { definirFilaRececao([]); agir((d) => fixarRececao(d, { poFilter: "" })); };
  return <Corpo key={p.id} p={p} aoNovaGuia={aoNovaGuia} fechar={fechar} />;
}
