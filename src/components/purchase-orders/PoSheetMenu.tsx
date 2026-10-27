// Menu ⋯ do topo da folha da encomenda a fornecedor (MenuPo do protótipo) sobre
// os handlers reais de PurchaseOrders.tsx. Mesmas condições de estado e
// permissões de PoRowActions (lista) e dos botões que existiam no diálogo:
//   PDF                       sem permissão própria
//   Receber no armazém →      pending/ordered/parcial (vai para a Receção) · receive + inventory.edit + receiving.view
//   Não vou receber o resto   pending/ordered/parcial · receive + inventory.edit
//   Reverter receção          recebida/parcial com linhas recebidas · revert_receipt + inventory.edit
//   Passar para stock         há linhas a libertar (EC inativa) · receive + inventory.edit
//   Eliminar                  purchase_orders.delete
// Dentro da folha o DropdownMenu é modal={false} (ver RowActions).
import { Ban, FileDown, PackageCheck, Trash2, Undo2, Warehouse } from "lucide-react";
import { RowActions, type RowActionEntry } from "@/components/inventory/ui";
import { RECEIVE_LABEL, RECEIVE_NAV_PERMS } from "./PoRowActions";

const RECEIVE_PERMS = ["purchase_orders.receive", "inventory.edit"] as const;
const REVERT_PERMS = ["purchase_orders.revert_receipt", "inventory.edit"] as const;

interface PoSheetMenuProps {
  orderNumber: string;
  /** Estado gravado da PO (não o do formulário). */
  status: string;
  hasReceivedLines: boolean;
  canRelease: boolean;
  onPdf: () => void;
  onReceive: () => void;
  onCancelRemainder: () => void;
  onRevert: () => void;
  onRelease: () => void;
  onDelete: () => void;
  revertLabel?: string;
}

export function PoSheetMenu({
  orderNumber,
  status: st,
  hasReceivedLines,
  canRelease,
  onPdf,
  onReceive,
  onCancelRemainder,
  onRevert,
  onRelease,
  onDelete,
  revertLabel = "Reverter receção",
}: PoSheetMenuProps) {
  const receivable = st === "pending" || st === "ordered" || st === "partially_received";
  const received = st === "partially_received" || st === "received";
  const items: RowActionEntry[] = [
    { label: "PDF da encomenda", icon: FileDown, onSelect: onPdf },
    {
      label: RECEIVE_LABEL,
      icon: Warehouse,
      onSelect: onReceive,
      hidden: !receivable,
      permission: RECEIVE_NAV_PERMS,
      requireAllPermissions: true,
    },
    {
      label: "Não vou receber o resto",
      icon: Ban,
      onSelect: onCancelRemainder,
      hidden: !receivable,
      permission: RECEIVE_PERMS,
      requireAllPermissions: true,
    },
    {
      label: revertLabel,
      icon: Undo2,
      onSelect: onRevert,
      hidden: !received || !hasReceivedLines,
      permission: REVERT_PERMS,
      requireAllPermissions: true,
    },
    {
      label: "Passar para stock",
      icon: PackageCheck,
      onSelect: onRelease,
      hidden: !canRelease,
      permission: RECEIVE_PERMS,
      requireAllPermissions: true,
    },
    "separator",
    { label: "Eliminar", icon: Trash2, onSelect: onDelete, destructive: true, permission: "purchase_orders.delete" },
  ];
  return <RowActions modal={false} menuLabel={`Mais ações para ${orderNumber}`} items={items} />;
}
