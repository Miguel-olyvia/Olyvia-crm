// O menu "Mais ações" de uma Encomenda Cliente (ecMenu do mockup), na lista e no topo da folha, com os diálogos que abre.
import { useState } from "react";
import { Eye, Pencil, Printer, ShoppingCart, Trash2 } from "lucide-react";
import { ecPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { pedirEmFalta } from "./ec";
import { EcEliminar, EcPdf } from "./EcDialogos";
import { useAbrirEc } from "./ecAbrir";
import { EcFormDialogo } from "./EcFormDialogo";
import { MenuMais } from "./mockPecas";
import type { Ec } from "./tipos";

type Dlg = "editar" | "eliminar" | "pdf" | null;
const I = "ic";

/** Os botões da linha da lista: Ver, PDF e o menu (row-act do mockup). */
export function AcoesLinhaEc({ id }: { id: string }) {
  const abrirEc = useAbrirEc();
  const [pdf, setPdf] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => abrirEc(id)}>Ver</button>
      <button type="button" className="btn btn-sm" onClick={() => setPdf(true)}>PDF</button>
      <MenuEc id={id} />
      {pdf && <EcPdf id={id} aoFechar={() => setPdf(false)} />}
    </>
  );
}

export function MenuEc({ id }: { id: string }) {
  const { db, agir } = useCtxInv();
  const abrirEc = useAbrirEc();
  const [dlg, setDlg] = useState<Dlg>(null);
  const e = ecPorId(db, id);
  if (!e) return null;
  const ct = e.origin.k === "CT", eliminavel = ["manual", "VD"].includes(e.origin.k);
  const pedir = (): void => { agir((d) => pedirEmFalta(d, ecPorId(d, id) as Ec), (r) => (r.pos.length ? "Pedido: " + r.pos.join(", ") : "Nada novo a pedir (sem fornecedor preferencial ou já pedido).")); };
  return (
    <>
      <MenuMais itens={[
        { label: "Abrir detalhe", icone: <Eye className={I} aria-hidden="true" />, run: () => abrirEc(id) },
        { label: "PDF", icone: <Printer className={I} aria-hidden="true" />, run: () => setDlg("pdf"), fonte: "rpc_get_client_order_document" },
        { label: "Editar", icone: <Pencil className={I} aria-hidden="true" />, desativado: e.origin.k !== "manual" || e.deleted, porque: "Só encomendas manuais", run: () => setDlg("editar"), fonte: "rpc_get_manual_client_order_edit · rpc_update_manual_client_order" },
        { label: "Pedir em falta ao fornecedor", icone: <ShoppingCart className={I} aria-hidden="true" />, desativado: e.deleted, run: pedir },
        "-",
        { label: ct ? "Simular: anular contrato" : "Eliminar", icone: <Trash2 className={I} aria-hidden="true" />, perigo: true, desativado: e.deleted || (!eliminavel && !ct), porque: "Só manuais ou venda direta", run: () => setDlg("eliminar"), fonte: ct ? "cancel_and_replace_contract → estorno" : "rpc_delete_client_order" },
      ]} />
      {dlg === "pdf" && <EcPdf id={id} aoFechar={() => setDlg(null)} />}
      {dlg === "editar" && <EcFormDialogo aberto aoFechar={() => setDlg(null)} id={id} />}
      {dlg === "eliminar" && <EcEliminar id={id} aoFechar={() => setDlg(null)} />}
    </>
  );
}
