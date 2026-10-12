// Os diálogos de uma PO, partilhados pela lista e pela folha: aprovar e enviar, eliminar, retirar do portal, reverter uma receção, receber, não receber o resto e o PDF.
import { Check, Lock, Send } from "lucide-react";
import { fornecedor, fmtD, nomeArm, nomeForn, nomeProd, poPorId, un } from "./base";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg } from "./DialogosInv";
import { Nota, Pri, Sec } from "./pecasInv";
import { PdfPo } from "./PdfPo";
import { can, porqueNao } from "./perfil";
import { PORTAL_FORN, eliminarPo, enviarPo, poTotals, retirarDoPortal } from "./po";
import { Dinheiro } from "./poPecas";
import { Fonte } from "./cabInv";
import { ReceberDialogo } from "./ReceberDialogo";
import { reverterRececao } from "./receber";
import type { Inventario, Po } from "./tipos";

export type DlgPo = { t: "retirar" } | { t: "reverter"; rid: string } | { t: "receber" } | { t: "resto" } | { t: "enviar" } | { t: "eliminar" } | { t: "pdf" };

interface Props { id: string; dlg: DlgPo | null; fechar: () => void; /** Chamado depois de eliminar (a folha fecha-se). */ aoEliminar?: () => void }
const porId = (d: Inventario, id: string): Po => d.pos.find((x) => x.id === id) as Po;

function Aprovar({ p, fechar }: { p: Po; fechar: () => void }) {
  const { db, agir } = useCtxInv();
  const s = fornecedor(db, p.sup);
  const pode = can("purchase_orders.approve");
  const ok = (): void => { agir((d) => enviarPo(d, porId(d, p.id)), `${p.id} aprovada e enviada ao fornecedor.`); fechar(); };
  return (
    <Dlg aberto aoFechar={fechar} titulo={`Aprovar e enviar ${p.id}`}
      rodape={<><Sec onClick={fechar}>Cancelar</Sec><Pri disabled={!pode} title={pode ? undefined : porqueNao("purchase_orders.approve")} onClick={ok}><Send className="ic" aria-hidden="true" />Aprovar e enviar</Pri></>}>
      <p><b>{nomeForn(db, p.sup)}</b> · {p.lines.length} linha(s) · <Dinheiro n={poTotals(p).total} /></p>
      <ul className="stack" style={{ paddingLeft: 18, margin: 0, gap: 6 }}>
        <li>Estado passa de <b>Pendente</b> para <b>Encomendado</b>. <Fonte>rpc_update_purchase_order · purchase_orders.status</Fonte></li>
        {s?.portal === "active"
          ? <li>O fornecedor tem portal ativo: a encomenda é <b>publicada no portal</b> e segue email para {s.email}. Enquanto publicada, linhas, fornecedor, data e estado ficam bloqueados. <Fonte>supplier_po_publications · fn_sp_po_publication · fn_sp_po_queue_email</Fonte></li>
          : <li>Fornecedor sem portal ativo ({s ? PORTAL_FORN[s.portal][0].toLowerCase() : ""}): segue o PDF por email para {s?.email || "—"}. <Fonte>email_logs</Fonte></li>}
      </ul>
      {pode
        ? <div className="alert ok"><Check className="ic" aria-hidden="true" /><span>O seu perfil tem <span className="mono">purchase_orders.approve</span>.</span></div>
        : <div className="alert bad"><Lock className="ic" aria-hidden="true" /><span>O seu perfil não tem <span className="mono">purchase_orders.approve</span>. Não pode passar a Encomendado.</span></div>}
    </Dlg>
  );
}

function Eliminar({ p, fechar, aoEliminar }: { p: Po; fechar: () => void; aoEliminar?: () => void }) {
  const { agir } = useCtxInv();
  return (
    <Confirmar aberto aoFechar={fechar} titulo={`Eliminar ${p.id}`} ok="Eliminar" perigo motivo="Motivo"
      texto={<>
        <p>A encomenda deixa de aparecer nas listas (pode restaurá-la com “Ver eliminados”).</p>
        {p.portal.state === "confirmed" && <Nota tom="warn">O fornecedor <b>já confirmou</b> esta encomenda no portal (entrega {fmtD(p.portal.promised)}). Avise-o antes de eliminar.</Nota>}
        {p.receipts.some((r) => r.state === "Ativa") && <Nota tom="bad">Tem receções ativas: reverta-as antes de eliminar.</Nota>}
        {p.lines.some((l) => l.ecLine) && <Nota tom="info">Linhas ligadas a Encomendas Clientes passam a “Em falta” nessas encomendas.</Nota>}
      </>}
      aoConfirmar={(m) => { const r = agir((d) => eliminarPo(d, porId(d, p.id), m)); if (r.ok) aoEliminar?.(); return r; }} />
  );
}

function Reverter({ p, rid, fechar }: { p: Po; rid: string; fechar: () => void }) {
  const { db, agir } = useCtxInv();
  const r = p.receipts.find((x) => x.id === rid);
  if (!r) return null;
  return (
    <Confirmar aberto aoFechar={fechar} titulo="Reverter receção" ok="Reverter receção" perigo motivo="Motivo"
      texto={<p>Sai do stock de <b>{nomeArm(db, r.wh)}</b>: {un(r.qty)} de {nomeProd(db, r.sku)}{r.toEC ? ` (das quais ${r.toEC} estavam reservadas para ${r.ec})` : ""}. Fica um movimento no livro.</p>}
      aoConfirmar={(m) => agir((d) => reverterRececao(d, porId(d, p.id), rid, m))} />
  );
}

export function PoDialogos({ id, dlg, fechar, aoEliminar }: Props) {
  const { db, agir } = useCtxInv();
  const p = poPorId(db, id);
  if (!dlg || !p) return null;
  switch (dlg.t) {
    case "receber": return <ReceberDialogo aberto aoFechar={fechar} id={id} />;
    case "resto": return <ReceberDialogo aberto aoFechar={fechar} id={id} soResto />;
    case "enviar": return <Aprovar p={p} fechar={fechar} />;
    case "eliminar": return <Eliminar p={p} fechar={fechar} aoEliminar={aoEliminar} />;
    case "pdf": return <PdfPo p={p} aoFechar={fechar} />;
    case "reverter": return <Reverter p={p} rid={dlg.rid} fechar={fechar} />;
    case "retirar": return (
      <Confirmar aberto aoFechar={fechar} titulo={`Retirar ${id} do portal`} ok="Retirar do portal" motivo="Motivo"
        texto={<p>O fornecedor deixa de ver a encomenda e recebe um email com o motivo. Linhas, fornecedor, data e estado ficam editáveis.</p>}
        aoConfirmar={(m) => agir((d) => retirarDoPortal(d, porId(d, id), m))} />
    );
  }
}
