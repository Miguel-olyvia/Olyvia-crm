// A coluna "De onde vem" da folha de uma EC (lineSources e poStateText do mockup): do stock, do fornecedor (com a PO e o seu estado), sem fornecedor, em falta ou a transferir.
import { fmtDS, nomeArm, poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { ecLinhaInfo } from "./ec";
import { Ligacao } from "./pecasInv";
import { poStatus, poStatusLabel } from "./po";
import type { Ec, EcLinha, Inventario, Po } from "./tipos";

function textoPo(p: Po): string {
  const st = poStatus(p), x = p.portal;
  if (p.deleted) return "eliminada";
  if (st === "pending") return "rascunho por aprovar";
  if (st === "received") return "recebida";
  if (st === "cancelled") return "cancelada";
  return x.state === "confirmed" ? `no portal, confirmada (entrega ${fmtDS(x.promised)})` : x.state === "seen" ? `no portal, vista ${fmtDS(x.seen)}` : x.state === "sent" ? "no portal, por ver"
    : x.state === "withdrawn" ? "retirada do portal" : x.state === "email" ? "enviada por email" : poStatusLabel[st].toLowerCase();
}

export function DeOnde({ db, e, l }: { db: Inventario; e: Ec; l: EcLinha }) {
  const { abrir } = useCtxInv();
  if (!l.sku) return <span className="muted">Serviço (sem stock)</span>;
  const i = ecLinhaInfo(db, e, l);
  const partes: React.ReactNode[] = [];
  if (l.stockQty) partes.push(<div key="st"><b>{l.stockQty}</b> do stock · {nomeArm(db, e.wh)}</div>);
  for (const [p, pl] of i.d.links) partes.push(<div key={pl.id}><b>{pl.ecUnits}</b> do fornecedor · <Ligacao className="mono" aoClicar={() => abrir({ t: "po", id: p.id })}>{p.id}</Ligacao> · {textoPo(poPorId(db, p.id) ?? p)}{pl.ecRecv ? ` · ${pl.ecRecv} recebidas` : ""}</div>);
  if (l.nosupQty) partes.push(<div key="ns" style={{ color: "var(--i-bad)" }}><b>{l.nosupQty}</b> sem fornecedor preferencial</div>);
  if (i.missing) partes.push(<div key="mi" style={{ color: "var(--i-bad)" }}><b>{i.missing}</b> em falta (encomenda anulada/eliminada)</div>);
  if (i.notReady && !i.tr) partes.push(<div key="nr" style={{ color: "var(--i-warn)" }}><b>{i.notReady}</b> reservadas mas sem stock físico em {nomeArm(db, e.wh)}</div>);
  if (i.tr) partes.push(<div key="tr" style={{ color: "var(--i-info)" }}>A transferir de {nomeArm(db, i.tr.from)} ({i.tr.qty} un, {i.tr.id})</div>);
  return partes.length ? <>{partes}</> : <span className="muted">—</span>;
}
