// O menu "Mais ações" de uma PO (poMenu do mockup), na lista e no topo da folha: abrir, PDF, receber, não receber o resto, reverter, editar, eliminar ou restaurar.
import { Eye, Pencil, Printer, Trash2, Truck, Undo2, X } from "lucide-react";
import { useCtxInv } from "./ctxInv";
import { MenuMais, type ItemMenu } from "./mockPecas";
import { can } from "./perfil";
import { restaurarPo, poOpen, poPublished, poStatus } from "./po";
import type { DlgPo } from "./PoDialogos";
import type { Inventario, Po } from "./tipos";

interface Props { p: Po; rotulo?: string; abrir: (tab?: string) => void; dlg: (d: DlgPo) => void }

export function MenuPo({ p, rotulo, abrir, dlg }: Props) {
  const { agir } = useCtxInv();
  const st = poStatus(p), aberta = poOpen(p), pm = "purchase_orders.manage";
  const ic = "ic";
  const itens: (ItemMenu | "-")[] = [
    { label: "Abrir detalhe", icone: <Eye className={ic} aria-hidden="true" />, run: () => abrir() },
    { label: "PDF da encomenda", icone: <Printer className={ic} aria-hidden="true" />, fonte: "rpc_get_purchase_order_pdf (mockup)", run: () => dlg({ t: "pdf" }) },
    { label: "Receber", icone: <Truck className={ic} aria-hidden="true" />, desativado: !aberta || !can("inventory.receive"), porque: !aberta ? "Só encomendas em aberto" : "Requer inventory.receive", run: () => dlg({ t: "receber" }) },
    { label: "Não vou receber o resto", icone: <X className={ic} aria-hidden="true" />, desativado: !aberta || !can(pm), porque: "Só encomendas em aberto", fonte: "rpc_cancel_po_remainder", run: () => dlg({ t: "resto" }) },
    { label: "Reverter receção", icone: <Undo2 className={ic} aria-hidden="true" />, desativado: !p.receipts.some((r) => r.state === "Ativa" && r.type === "Receção"), porque: "Sem receções ativas", fonte: "rpc_revert_purchase_order_receipt", run: () => abrir("rec") },
    { label: "Editar", icone: <Pencil className={ic} aria-hidden="true" />, desativado: p.deleted || !["pending", "ordered"].includes(st) || !can(pm), porque: poPublished(p) ? "Publicada no portal: retire-a primeiro" : "Só pendentes/encomendadas", run: () => abrir("lines") },
    "-",
    p.deleted
      ? { label: "Restaurar", icone: <Undo2 className={ic} aria-hidden="true" />, fonte: "rpc_restore_purchase_order", run: () => { agir((d: Inventario) => restaurarPo(d, d.pos.find((x) => x.id === p.id) as Po), `${p.id} restaurada.`); } }
      : { label: "Eliminar", icone: <Trash2 className={ic} aria-hidden="true" />, perigo: true, desativado: !can(pm), porque: "Requer purchase_orders.manage", fonte: "rpc_delete_purchase_order", run: () => dlg({ t: "eliminar" }) },
  ];
  return <MenuMais itens={itens} rotulo={rotulo ?? `Mais ações para ${p.id}`} />;
}
