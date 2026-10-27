// Ações de uma linha das Encomendas a fornecedor (AcaoLinha + MenuPo do protótipo)
// sobre os handlers reais de PurchaseOrders.tsx. Só decide ONDE cada ação aparece;
// as condições de estado e as permissões são as mesmas dos PermissionGate que
// existiam na lista (ver comentário de cada entrada).
//
// Principal: eliminada → Restaurar · pending → Aprovar e enviar · ordered/
// partially_received → Receber no armazém → (Receção) · senão → Ver.
import { Ban, Eye, FileDown, Pencil, Send, Trash2, Undo2, Warehouse } from "lucide-react";
import { RowActions, type RowActionEntry, type RowPrimaryAction } from "@/components/inventory/ui";

const RECEIVE_PERMS = ["purchase_orders.receive", "inventory.edit"] as const;
const REVERT_PERMS = ["purchase_orders.revert_receipt", "inventory.edit"] as const;
// "Receber no armazém →" (Olyvia 2.0) vai sempre para Armazém › Receção: as permissões de receber de sempre e a
// da rota /receiving (receiving.view), para nunca levar a um ecrã sem acesso.
export const RECEIVE_NAV_PERMS = ["purchase_orders.receive", "inventory.edit", "receiving.view"] as const;
export const RECEIVE_LABEL = "Receber no armazém →";

interface PoRowActionsProps {
  order: { id: string; order_number: string; status: string };
  /** Lista em "Ver eliminados" (só Restaurar, como antes). */
  deleted: boolean;
  onOpen: () => void;
  onApproveSend: () => void;
  onReceive: () => void;
  onPdf: () => void;
  onCancelRemainder: () => void;
  onRevert: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  revertLabel?: string;
  restoreLabel?: string;
  /** Dentro de uma tabela aninhada num diálogo usar false (ver RowActions). */
  modal?: boolean;
}

export function PoRowActions({
  order,
  deleted,
  onOpen,
  onApproveSend,
  onReceive,
  onPdf,
  onCancelRemainder,
  onRevert,
  onEdit,
  onDelete,
  onRestore,
  revertLabel = "Reverter receção",
  restoreLabel = "Restaurar",
  modal,
}: PoRowActionsProps) {
  const st = order.status;
  const menuLabel = `Mais ações para ${order.order_number}`;

  if (deleted) {
    // Antes: <PermissionGate permission="purchase_orders.delete"> Restaurar.
    return (
      <RowActions
        modal={modal}
        menuLabel={menuLabel}
        primary={{ label: restoreLabel, icon: Undo2, onClick: onRestore, permission: "purchase_orders.delete" }}
      />
    );
  }

  const receivable = st === "pending" || st === "ordered" || st === "partially_received";
  const revertible = st === "received" || st === "partially_received";
  const received = st === "partially_received" || st === "received";

  let primary: RowPrimaryAction;
  if (st === "pending") {
    // Antes: botão "Encomendar" só com pending && purchase_orders.approve (PoSendToSupplierButton).
    primary = { label: "Aprovar e enviar", icon: Send, variant: "primary", onClick: onApproveSend, permission: "purchase_orders.approve" };
  } else if (st === "ordered" || st === "partially_received") {
    // Antes: PackageCheck com PermissionGate receive + inventory.edit (requireAll); agora vai para a Receção (+ receiving.view).
    primary = { label: RECEIVE_LABEL, icon: Warehouse, onClick: onReceive, permission: RECEIVE_NAV_PERMS, requireAllPermissions: true };
  } else {
    primary = { label: "Ver", icon: Eye, onClick: onOpen };
  }

  const items: RowActionEntry[] = [
    { label: "Abrir detalhe", icon: Eye, onSelect: onOpen },
    // Antes: FileDown, sem PermissionGate.
    { label: "PDF da encomenda", icon: FileDown, onSelect: onPdf },
    // Como o MenuPo do 2.0: em todas as recebíveis (pending/ordered/parcial), sempre para a Receção.
    {
      label: RECEIVE_LABEL,
      icon: Warehouse,
      onSelect: onReceive,
      hidden: !receivable,
      permission: RECEIVE_NAV_PERMS,
      requireAllPermissions: true,
    },
    // Antes: Ban "Não vou receber" em pending/ordered/partially_received, receive + inventory.edit.
    {
      label: "Não vou receber o resto",
      icon: Ban,
      onSelect: onCancelRemainder,
      hidden: !receivable,
      permission: RECEIVE_PERMS,
      requireAllPermissions: true,
    },
    // Antes: Undo2 em received/partially_received, revert_receipt + inventory.edit.
    {
      label: revertLabel,
      icon: Undo2,
      onSelect: onRevert,
      hidden: !revertible,
      permission: REVERT_PERMS,
      requireAllPermissions: true,
    },
    // Antes: Pencil com purchase_orders.edit, desativado se recebida/parcial.
    {
      label: "Editar",
      icon: Pencil,
      onSelect: onEdit,
      permission: "purchase_orders.edit",
      disabled: received,
      disabledReason: received ? "Não é possível editar uma encomenda já recebida" : undefined,
    },
    "separator",
    // Antes: Trash2 com purchase_orders.delete.
    { label: "Eliminar", icon: Trash2, onSelect: onDelete, destructive: true, permission: "purchase_orders.delete" },
  ];

  return <RowActions modal={modal} menuLabel={menuLabel} primary={primary} items={items} />;
}
