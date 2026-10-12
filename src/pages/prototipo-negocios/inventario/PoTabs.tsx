// Os separadores da folha de uma PO que não são as Linhas (poTab do mockup): Receções, Guias, Portal, Anulações, Notas e Histórico.
import { useState } from "react";
import { Play, RefreshCw, Send, Undo2 } from "lucide-react";
import { ecPorId, fmtD, fmtDT, nomeArm, nomeProd, somarDias } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { GUIA_ESTADOS, resumoGuia } from "./guias";
import { Ligacao, Notas, Peq, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poDe } from "./PoCab";
import { PORTAL_FORN, poOpen, poPublished, portalConfirmar, portalVista, republicarPo } from "./po";
import type { AcoesPo, EstadoPd } from "./poTipos";
import { desfazerAnulacao, passarParaStock } from "./receber";
import { TabelaInv } from "./TabelaInv";
import type { Po } from "./tipos";

interface P { p: Po; a: AcoesPo }

export function TabRececoes({ p, a }: P) {
  const { db, agir, abrir } = useCtxInv();
  const pode = can("inventory.receive");
  return (
    <>
      {p.receipts.length ? (
        <TabelaInv titulo="Receções" minimo={1000} chave={(r) => r.id} linhas={p.receipts.slice().reverse()}
          colunas={[
            { id: "at", titulo: "Data", classe: () => "nowrap", celula: (r) => fmtDT(r.at) }, { id: "sku", titulo: "Linha", celula: (r) => nomeProd(db, r.sku) },
            { id: "t", titulo: "Tipo", celula: (r) => <Selo tom={r.type === "Receção" ? "info" : "violet"}>{r.type}</Selo> },
            { id: "q", titulo: "Qtd", direita: true, celula: (r) => r.qty },
            { id: "ec", titulo: "Para EC", direita: true, celula: (r) => (r.toEC ? <>{r.toEC} <small className="muted">{r.ec}</small></> : "—") },
            { id: "st", titulo: "Para stock", direita: true, celula: (r) => r.toStock }, { id: "wh", titulo: "Armazém", celula: (r) => nomeArm(db, r.wh) },
            { id: "g", titulo: "Guia", celula: (r) => (r.guia ? <Ligacao aoClicar={() => abrir({ t: "guia", id: r.guia as string })}>{r.guia}</Ligacao> : "—") },
            { id: "e", titulo: "Estado", celula: (r) => <><Selo tom={r.state === "Ativa" ? "ok" : "neu"}>{r.state}</Selo>{r.reason ? <><br /><small className="muted">{r.reason}</small></> : null}</> },
          ]}
          acoes={(r) => {
            const e = r.ec ? ecPorId(db, r.ec) : undefined;
            const inativa = !!r.ec && (!e || e.deleted);
            return <>
              {r.state === "Ativa" && r.type === "Receção" && <Peq disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} onClick={() => a.pedir({ t: "reverter", rid: r.id })}><Undo2 className="ic" aria-hidden="true" />Reverter receção</Peq>}
              {r.state === "Ativa" && r.toEC > 0 && !r.released && r.type === "Receção" && <Peq disabled={!inativa} title={inativa ? undefined : "Só com a EC inativa"} onClick={() => agir((d) => passarParaStock(d, poDe(d, p.id), r.id), "Passado para stock.")}>Passar para stock</Peq>}
            </>;
          }} />
      ) : <Vazio titulo="Sem receções" texto={poOpen(p) ? "Use “Receber” para registar a chegada da mercadoria." : ""} />}
      <p className="rules" style={{ marginTop: 8 }}>Nunca mais do que falta. Reverter exige motivo (≥3 caracteres) e falha se as unidades já saíram para o cliente. “Passar para stock” só com a Encomenda Cliente inativa.</p>
      <Fonte>purchase_order_receipts · rpc_revert_purchase_order_receipt · rpc_po_receipt_release_to_stock</Fonte>
    </>
  );
}

export function TabGuias({ p }: { p: Po }) {
  const { db, abrir } = useCtxInv();
  const gs = db.guias.filter((g) => g.pos.includes(p.id));
  return (
    <>
      {gs.length ? (
        <TabelaInv titulo="Guias da encomenda" minimo={640} chave={(g) => g.id} linhas={gs} abrir={(g) => abrir({ t: "guia", id: g.id })}
          colunas={[
            { id: "id", titulo: "Nº guia", classe: () => "mono", celula: (g) => g.id }, { id: "d", titulo: "Data", celula: (g) => fmtD(g.date) },
            { id: "ar", titulo: "Anunciado / Recebido", celula: (g) => `${resumoGuia(db, g).annT} / ${resumoGuia(db, g).recT}` },
            { id: "dv", titulo: "Divergências", celula: (g) => { const d = resumoGuia(db, g).div; return d ? <Selo tom="bad">{d} divergência(s)</Selo> : <Selo tom="ok">Sem divergências</Selo>; } },
            { id: "e", titulo: "Estado", celula: (g) => <Selo tom={g.state === "open" ? "info" : g.state === "closed" ? "ok" : "neu"}>{GUIA_ESTADOS[g.state]}</Selo> },
          ]}
          acoes={(g) => <Peq onClick={() => abrir({ t: "guia", id: g.id })}>Abrir</Peq>} />
      ) : <Vazio titulo="Sem guias ligadas" texto="A guia do fornecedor liga-se na receção." />}
      <Fonte>supplier_delivery_notes · supplier_delivery_note_orders</Fonte>
    </>
  );
}

const ESTADO_PORTAL = { none: "Não publicada", email: "Sem portal (email)", withdrawn: "Retirada", sent: "Publicada, por ver", seen: "Vista", confirmed: "Confirmada" } as const;

function Simulacao({ p }: { p: Po }) {
  const { agir } = useCtxInv();
  const [prom, setProm] = useState(somarDias(p.due, 2));
  return (
    <div className="card pad stack" style={{ boxShadow: "none", borderStyle: "dashed" }}><b style={{ fontSize: 13 }}><Play className="ic sm" aria-hidden="true" /> Simular o lado do fornecedor</b>
      <div className="row">
        {p.portal.state === "sent" && <Peq onClick={() => agir((d) => portalVista(d, poDe(d, p.id)), "Fornecedor abriu a encomenda.")}>Fornecedor abre a encomenda</Peq>}
        <label className="inl">Data prometida <input id="sim-prom" type="date" value={prom} onChange={(e) => setProm(e.target.value)} /></label>
        <Peq onClick={() => agir((d) => portalConfirmar(d, poDe(d, p.id), prom, "Confirmado pelo portal (simulação)."), "Fornecedor confirmou.")}>Fornecedor confirma</Peq>
      </div>
      <Fonte>sp_confirm_order · fn_po_notify_supplier_confirmed</Fonte>
    </div>
  );
}

export function TabPortal({ p, a }: P) {
  const { db, agir } = useCtxInv();
  const x = p.portal, s = db.suppliers.find((y) => y.id === p.sup);
  const emails = (x.emails ?? []).slice().reverse();
  const pares: [string, React.ReactNode][] = [["Estado no portal", ESTADO_PORTAL[x.state]], ["Enviada", fmtDT(x.sent || p.sentAt)], ["Vista", fmtDT(x.seen)], ["Confirmada", fmtDT(x.confirmed)],
    ["Data prometida", x.promised ? <>{fmtD(x.promised)}{p.promiseAccepted ? <> <Selo tom="ok">aceite</Selo></> : null}</> : "—"], ["Portal do fornecedor", s ? PORTAL_FORN[s.portal][0] : "—"]];
  return (
    <>
      <div className="dl">{pares.map(([r, v]) => <div key={r}><span className="lbl">{r}</span>{v}</div>)}</div>
      {x.comment && <div className="alert neu" style={{ marginTop: 10 }}><div><b>Comentário do fornecedor:</b> {x.comment}</div></div>}
      <div className="row" style={{ margin: "12px 0" }}>
        <button type="button" className="btn" onClick={() => agir(() => undefined, "Estado do portal atualizado.")}><RefreshCw className="ic" aria-hidden="true" />Atualizar</button>
        {poPublished(p) && <button type="button" className="btn" onClick={() => a.pedir({ t: "retirar" })}>Retirar do portal</button>}
        {x.state === "withdrawn" && poOpen(p) && s?.portal === "active" && <button type="button" className="btn" onClick={() => agir((d) => republicarPo(d, poDe(d, p.id)), "Republicada no portal.")}><Send className="ic" aria-hidden="true" />Publicar de novo</button>}
      </div>
      {poOpen(p) && s?.portal === "active" && ["sent", "seen"].includes(x.state) && <Simulacao p={p} />}
      <h3 style={{ margin: "14px 0 8px" }}>Emails</h3>
      {emails.length ? (
        <TabelaInv titulo="Emails da encomenda" minimo={560} chave={(m) => m.at + m.t} linhas={emails} colunas={[
          { id: "at", titulo: "Data", classe: () => "nowrap", celula: (m) => fmtDT(m.at) }, { id: "t", titulo: "Assunto", celula: (m) => m.t }, { id: "to", titulo: "Para", celula: (m) => m.to },
          { id: "ok", titulo: "Estado", celula: (m) => (m.ok ? <Selo tom="ok">Enviado</Selo> : <><Selo tom="bad">Falhado</Selo><br /><small className="muted">{m.err ?? ""}</small></>) },
        ]} />
      ) : <p className="muted">Sem emails.</p>}
      <Fonte>email_logs · fn_sp_po_queue_email · rpc_po_withdraw_from_supplier</Fonte>
    </>
  );
}

export function TabAnulacoes({ p }: { p: Po }) {
  const { db, agir } = useCtxInv();
  const cs = p.cancels.slice().reverse();
  const lotes = [...new Set(cs.filter((c) => !c.undone && !c.locked).map((c) => c.batch))];
  const desfazer = (id: string, lote: boolean): void => { agir((d) => desfazerAnulacao(d, poDe(d, p.id), id, lote), "Anulação desfeita."); };
  return (
    <>
      {cs.length ? (
        <>
          <TabelaInv titulo="Anulações" minimo={900} chave={(c) => c.id} linhas={cs}
            colunas={[
              { id: "at", titulo: "Data", classe: () => "nowrap", celula: (c) => fmtDT(c.at) }, { id: "l", titulo: "Linha", celula: (c) => nomeProd(db, c.sku) },
              { id: "q", titulo: "Qtd anulada", direita: true, celula: (c) => c.qty }, { id: "m", titulo: "Motivo", celula: (c) => c.reason }, { id: "n", titulo: "Nota", celula: (c) => c.note }, { id: "u", titulo: "Utilizador", celula: (c) => c.user },
              { id: "s", titulo: "Estado", celula: (c) => (c.undone ? <Selo tom="neu">Desfeita</Selo> : <Selo tom="warn">Ativa</Selo>) },
            ]}
            acoes={(c) => (!c.undone && !c.locked ? <Peq onClick={() => desfazer(c.id, false)}>Desfazer</Peq> : null)} />
          {lotes.length > 0 && <div className="row" style={{ marginTop: 10 }}>{lotes.map((b) => { const c0 = cs.find((c) => c.batch === b); return c0 ? <Peq key={b} onClick={() => desfazer(c0.id, true)}><Undo2 className="ic" aria-hidden="true" />Desfazer toda ({fmtDT(c0.at)})</Peq> : null; })}</div>}
        </>
      ) : <Vazio titulo="Sem anulações" texto="Quando não vai receber o resto de uma linha ou da encomenda, fica aqui registado e pode ser desfeito." />}
      <p className="rules" style={{ marginTop: 8 }}>Anular resto exige motivo; a Encomenda Cliente ligada reage sozinha (a parte anulada passa a “Em falta”).</p>
      <Fonte>purchase_order_item_cancellations · rpc_undo_po_line_cancellation · rpc_undo_po_cancellation_batch</Fonte>
    </>
  );
}

export function TabNotas({ pd, setPd }: { pd: EstadoPd; setPd: (f: (x: EstadoPd) => EstadoPd) => void }) {
  return (
    <>
      <div className="fg">
        <Notas rotulo="Notas internas" valor={pd.notesInt} aoMudar={(v) => setPd((x) => ({ ...x, notesInt: v, dirty: true }))} linhas={6} ajuda="Só para a equipa." />
        <Notas rotulo="Notas para o fornecedor" valor={pd.notesSup} maximo={2000} aoMudar={(v) => setPd((x) => ({ ...x, notesSup: v, dirty: true }))} linhas={6} ajuda={`${pd.notesSup.length}/2000 caracteres · aparece no PDF e no portal.`} />
      </div>
      <Fonte>purchase_orders.notes · purchase_orders.supplier_notes</Fonte>
    </>
  );
}

export function TabHistorico({ p }: { p: Po }) {
  return (
    <>
      <ol className="stack" style={{ paddingLeft: 18, gap: 6 }}>{p.log.slice().reverse().map((l, i) => <li key={i}><b>{fmtDT(l.at)}</b> — {l.t}</li>)}</ol>
      <Fonte>audit log (entity_change_log)</Fonte>
    </>
  );
}
