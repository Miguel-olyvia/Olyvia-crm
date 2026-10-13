import { AlertTriangle, ArrowLeftRight, ClipboardList, Download, Undo2, Upload, type LucideIcon } from "lucide-react";

// Tipos do diálogo "Registar movimento". Cada um corresponde a uma RPC real e
// a um stock_movements.movement_type (ver ui/movementTypes.ts):
//   entrada       → rpc_register_stock_entry       → entrada
//   saida         → rpc_decrement_stock ('venda')  → venda
//   transferencia → rpc_register_stock_transfer    → transferencia_saida + transferencia_entrada
//   ajuste        → rpc_adjust_stock               → ajuste_positivo / ajuste_negativo
//   devolucao     → rpc_register_supplier_return   → devolucao_fornecedor
//   quebra        → rpc_register_stock_loss        → quebra
export type MovementType = "entrada" | "saida" | "transferencia" | "ajuste" | "devolucao" | "quebra";

export interface MovementKind {
  id: MovementType;
  /** Nome curto do cartão e do título do passo 2 (igual ao protótipo). */
  name: string;
  /** Rótulo usado no toast de sucesso (mantido do diálogo anterior). */
  label: string;
  description: string;
  icon: LucideIcon;
}

// Textos do protótipo (prototipo-negocios/inventario/movimentos.ts). Na
// transferência sai "Pode cumprir um pedido": os pedidos de transferência
// não existem em produção.
export const MOVEMENT_KINDS: readonly MovementKind[] = [
  {
    id: "entrada",
    name: "Entrada",
    label: "Entrada (compra)",
    description: "Mercadoria que chega sem PO (compra ao balcão, oferta, devolução de cliente). Pode indicar fornecedor e custo.",
    icon: Download,
  },
  {
    id: "saida",
    name: "Saída",
    label: "Saída (venda)",
    description: "Material que sai para cliente ou obra. Pode partir de uma Encomenda Cliente (preenche as linhas).",
    icon: Upload,
  },
  {
    id: "transferencia",
    name: "Transferência",
    label: "Transferência entre armazéns",
    description: "Entre armazéns: regista duas pernas (saída na origem, entrada no destino).",
    icon: ArrowLeftRight,
  },
  {
    id: "ajuste",
    name: "Ajuste",
    label: "Ajuste de inventário",
    description: "Corrige o stock para mais ou para menos. Motivo obrigatório; fica no livro.",
    icon: ClipboardList,
  },
  {
    id: "devolucao",
    name: "Devolução a fornecedor",
    label: "Devolução a fornecedor",
    description: "Material devolvido ao fornecedor (defeito, erro de envio).",
    icon: Undo2,
  },
  {
    id: "quebra",
    name: "Quebra/perda",
    label: "Quebra / perda",
    description: "Material danificado, perdido ou fora de validade. Motivo obrigatório.",
    icon: AlertTriangle,
  },
];

export const movementKind = (type: MovementType): MovementKind =>
  MOVEMENT_KINDS.find((k) => k.id === type) ?? MOVEMENT_KINDS[0]!;

// Motivos do protótipo. O motivo continua a ser texto livre na BD
// (p_reason); "Outro" pede a descrição.
export const ADJUST_REASONS = ["Contagem", "Erro de registo", "Material encontrado", "Outro"] as const;
export const LOSS_REASONS = ["Dano", "Perda", "Validade", "Roubo", "Outro"] as const;
export const OTHER_REASON = "Outro";
