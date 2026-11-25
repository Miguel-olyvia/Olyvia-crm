// O Anular / Refazer do novo Inventário (fatia 3): funções puras que, a partir dos movimentos de stock desta sessão
// (useLivroDaSessao), decidem o que se oferece. Ligado APENAS às reversões que a app já tem:
//
//  · Receção de PO (stock_movements 'entrada'/'compra' com uma linha em purchase_order_receipts) → o "Reverter receção"
//    clássico das Encomendas, com motivo: deep link /purchase-orders?open=<po>&item=<linha> (PurchaseOrders.tsx lê ?open= e
//    ?item= e pré-escolhe a linha a reverter). Aqui nunca se reverte uma receção.
//  · Saída de EC ('saida' com sale_source_type='contract') → se a linha da EC for isStockExitRevertible (a regra do ecrã,
//    clientOrderExit.ts) e houver a permissão do ecrã (confirmExitGate), confirmação própria e rpc_revert_client_order_stock_exit
//    com os MESMOS parâmetros do ClientOrders.tsx ({ p_contract_id, p_movement_id }). Na dúvida, o deep link
//    /client-orders?open=<contrato>.
//  · Ajustes, transferências e o resto → não se anulam aqui: ficam FORA da pilha de passos (senão um ajuste no topo
//    trancava com o cadeado a saída/receção que vem antes); o ecrã só os conta numa nota.
//
// Refazer nunca corre sozinho: reabre a ação clássica (Receção ?po= / Saídas ?open=).
import { clientOrdersLink, INVENTORY_PATHS, receivingLink } from "@/components/inventory/ui/inventoryLinks";
import { movementTypeLabel } from "@/components/inventory/ui/movementTypes";
import { isStockExitRevertible, type ClientOrderDocumentLine } from "@/components/client-orders/clientOrderExit";
import type { PassoBotao } from "@/emylia/estudioObra/BotoesPassos";
import { paraSeparador } from "./navegadorInventario";

/** Um movimento de stock desta sessão (as colunas de stock_movements + o que o livro junta). */
export interface MovimentoLivro {
  id: string;
  movement_type: string;
  document_type: string;
  document_number: string;
  quantity: number;
  product_id: string;
  produto: string | null;
  warehouse_id: string;
  armazem: string | null;
  reference_id: string | null;
  sale_source_type: string | null;
  sale_source_id: string | null;
  reversal_of_movement_id: string | null;
  created_at: string;
  /** A receção de PO deste movimento (purchase_order_receipts.stock_movement_id = id); null se não for uma. */
  rececao: { purchase_order_id: string; purchase_order_item_id: string | null } | null;
  /** Já foi revertido (há um movimento com reversal_of_movement_id = id). */
  anulado: boolean;
}

export type TipoPasso = "rececao" | "saida" | "outro";

export function tipoDoMovimento(m: Pick<MovimentoLivro, "movement_type" | "document_type" | "sale_source_type" | "sale_source_id" | "rececao">): TipoPasso {
  if (m.movement_type === "entrada" && m.document_type === "compra" && m.rececao?.purchase_order_id) return "rececao";
  if (m.movement_type === "saida" && m.sale_source_type === "contract" && m.sale_source_id) return "saida";
  return "outro";
}

/* ------------------------------------------------------------------ as ligações */
/** O "Reverter receção" clássico: a PO aberta nas Encomendas com a linha pré-escolhida (PurchaseOrders.tsx, ?open= e ?item=). */
export function linkReverterRececao(poId: string, itemId: string | null): string {
  const p = new URLSearchParams({ open: poId });
  if (itemId) p.set("item", itemId);
  return paraSeparador(`${INVENTORY_PATHS.purchaseOrders}?${p.toString()}`);
}
/** A EC aberta nas Saídas para clientes (onde estão o "Reverter saída" e o "Confirmar saída"). */
export const linkSaida = (contractId: string): string => paraSeparador(clientOrdersLink({ open: contractId }));
/** A PO aberta na Receção (para voltar a receber). */
export const linkRececao = (poId: string): string => paraSeparador(receivingLink({ po: poId }));

/* ------------------------------------------------------------------ o que se oferece */
const fmt = (n: number) => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 3 }).format(n);
const nomeDe = (m: Pick<MovimentoLivro, "produto">) => m.produto?.trim() || "produto";

export const NAO_SE_ANULA = "Não se anula aqui.";
const PORQUE_OUTRO: Record<string, string> = {
  ajuste_positivo: "Não se anula aqui: um ajuste corrige-se com outro movimento (Registar movimento).",
  ajuste_negativo: "Não se anula aqui: um ajuste corrige-se com outro movimento (Registar movimento).",
  quebra: "Não se anula aqui: uma quebra corrige-se com outro movimento (Registar movimento).",
  transferencia_entrada: "Não se anula aqui: faça a transferência ao contrário.",
  transferencia_saida: "Não se anula aqui: faça a transferência ao contrário.",
};
export const porqueNaoSeAnula = (m: Pick<MovimentoLivro, "movement_type">): string => PORQUE_OUTRO[m.movement_type] ?? NAO_SE_ANULA;

export function textoDoPasso(m: MovimentoLivro): string {
  const t = tipoDoMovimento(m);
  if (t === "rececao") return `Receção de ${m.document_number}: ${fmt(m.quantity)} ${nomeDe(m)}`;
  if (t === "saida") return `Saída de ${fmt(m.quantity)} ${nomeDe(m)} (${m.document_number})`;
  return `${movementTypeLabel(m.movement_type)}: ${fmt(m.quantity)} ${nomeDe(m)}`;
}

export type OfertaAnular =
  /** Abre o ecrã clássico, que faz a reversão como hoje. */
  | { tipo: "link"; to: string }
  /**
   * Reverte aqui, depois de confirmar: rpc_revert_client_order_stock_exit. `irmas` = os ids de TODAS as parcelas da mesma
   * saída que estão no livro e por anular (este incluído), porque a RPC estorna a saída repartida inteira.
   */
  | { tipo: "reverter"; contractId: string; movementId: string; pergunta: string; irmas: string[] }
  | { tipo: "nao"; porque: string };

export interface ContextoAnular {
  /** As linhas da EC (rpc_get_client_order_document → lines), só nas saídas; null/ausente = não se sabe. */
  linhasEc?: readonly ClientOrderDocumentLine[] | null;
  /** O confirmExitGate do ClientOrders.tsx (inventory.edit + client_orders.confirm_stock_exit + client_orders.view). */
  podeReverterSaida: boolean;
  /** Os movimentos do livro, para encontrar as parcelas irmãs de uma saída repartida. */
  movimentos?: readonly MovimentoLivro[];
}

/**
 * As parcelas da mesma saída (rpc_confirm_client_order_stock_exit_split: um movimento 'saida' por armazém) que estão no
 * livro e ainda não foram anuladas, este incluído. O critério é o da rpc_revert_client_order_stock_exit: mesma organização
 * (o livro já é só de uma), contrato, produto e document_number, movimento 'saida', sem estorno.
 */
export function parcelasDaSaida(m: MovimentoLivro, movs: readonly MovimentoLivro[] = []): MovimentoLivro[] {
  if (tipoDoMovimento(m) !== "saida" || !m.document_number) return [m];
  const irmas = movs.filter((x) =>
    x.id !== m.id && !x.anulado && !x.reversal_of_movement_id && x.movement_type === "saida" && x.sale_source_type === "contract"
    && x.sale_source_id === m.sale_source_id && x.product_id === m.product_id && x.document_number === m.document_number);
  return [m, ...irmas];
}

/** O que oferecer para anular um movimento. */
export function oQueAnular(m: MovimentoLivro, ctx: ContextoAnular): OfertaAnular {
  const t = tipoDoMovimento(m);
  if (t === "rececao" && m.rececao) return { tipo: "link", to: linkReverterRececao(m.rececao.purchase_order_id, m.rececao.purchase_order_item_id) };
  if (t === "saida" && m.sale_source_id) {
    // Numa saída repartida a linha da EC aponta para UMA das parcelas: procura-se por qualquer uma delas.
    const parcelas = parcelasDaSaida(m, ctx.movimentos);
    const ids = new Set(parcelas.map((x) => x.id));
    const linha = ctx.linhasEc?.find((l) => !!l.stock_exit_movement_id && ids.has(l.stock_exit_movement_id)) ?? null;
    if (ctx.podeReverterSaida && !m.anulado && linha && isStockExitRevertible(linha)) {
      const nome = linha.product_name || linha.service_name || nomeDe(m);
      const pergunta = parcelas.length > 1
        ? `Reverter toda a saída de ${nome} (${parcelas.length} parcelas)?`
        : `Reverter a saída de ${nome}?`;
      // p_movement_id = o da linha, como o ClientOrders.tsx (revertTarget.stock_exit_movement_id); a RPC estorna as irmãs.
      const movementId = linha.stock_exit_movement_id ?? m.id;
      return { tipo: "reverter", contractId: m.sale_source_id, movementId, pergunta, irmas: parcelas.map((x) => x.id) };
    }
    return { tipo: "link", to: linkSaida(m.sale_source_id) };
  }
  return { tipo: "nao", porque: porqueNaoSeAnula(m) };
}

/** Refazer: nunca corre sozinho, reabre a ação clássica. null = não há o que reabrir. */
export function oQueRefazer(m: MovimentoLivro): { to: string } | null {
  const t = tipoDoMovimento(m);
  if (t === "rececao" && m.rececao) return { to: linkRececao(m.rececao.purchase_order_id) };
  if (t === "saida" && m.sale_source_id) return { to: linkSaida(m.sale_source_id) };
  return null;
}

/** O cliente Supabase só com o que se usa aqui (para testar com um falso). */
export interface ClienteRpc {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** A mesma chamada do handleRevertStockExit do ClientOrders.tsx: os mesmos parâmetros, nada mais. */
export async function reverterSaida(cliente: ClienteRpc, contractId: string, movementId: string): Promise<void> {
  const { error } = await cliente.rpc("rpc_revert_client_order_stock_exit", {
    p_contract_id: contractId,
    p_movement_id: movementId,
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ os passos para os botões */
export interface PassoAnular extends PassoBotao {
  mov: MovimentoLivro;
}

export interface PermissoesAnular {
  /** revertReceiptGate do PurchaseOrders.tsx. */
  rececao: { allowed: boolean; reason?: string };
  /** confirmExitGate do ClientOrders.tsx. */
  saida: { allowed: boolean; reason?: string };
}

/**
 * Os passos da sessão para o BotoesPassos: primeiro os feitos (do mais antigo ao mais recente), depois os anulados (o
 * anulado mais recente primeiro), e pos = quantos feitos. Assim L[pos-1] é o que o Anular desfaz e L[pos] o que o Refazer
 * reabre, como no Estúdio. Os movimentos de estorno (reversal_of_movement_id) não são passos: marcam o original.
 * Os movimentos "outro" (ajustes, transferências…) não se anulam aqui e ficam FORA de L — um ajuste feito depois de uma
 * saída não pode trancar a saída com o cadeado —; `foraDaPilha` diz quantos são, para a nota do ecrã.
 */
export function passosDoLivro(movs: readonly MovimentoLivro[], perm: PermissoesAnular): { L: PassoAnular[]; pos: number; foraDaPilha: number } {
  const originais = movs
    .filter((m) => !m.reversal_of_movement_id)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const naPilha = originais.filter((m) => tipoDoMovimento(m) !== "outro");
  const passo = (m: MovimentoLivro): PassoAnular => {
    const gate = tipoDoMovimento(m) === "rececao" ? perm.rececao : perm.saida;
    const pode = gate.allowed;
    const porque = gate.allowed ? undefined : (gate.reason ?? "Sem permissão.");
    // n: número estável a partir do id (a lista do BotoesPassos usa-o como key)
    let n = 0;
    for (const ch of m.id) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return { n, texto: textoDoPasso(m), pode, ...(porque ? { porque } : {}), mov: m };
  };
  const feitos = naPilha.filter((m) => !m.anulado).map(passo);
  const anulados = naPilha.filter((m) => m.anulado).reverse().map(passo);
  return { L: [...feitos, ...anulados], pos: feitos.length, foraDaPilha: originais.length - naPilha.length };
}

/* ------------------------------------------------------------------ as teclas */
/** Ctrl+Z anula; Ctrl+Shift+Z e Ctrl+Y refazem. Nunca a escrever numa caixa de texto nem com uma folha/diálogo aberto. */
export function teclaAnular(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "defaultPrevented" | "target">,
  doc: Document = document,
): "anular" | "refazer" | null {
  if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = (e.key || "").toLowerCase();
  const acao = k === "z" ? (e.shiftKey ? "refazer" : "anular") : k === "y" ? "refazer" : null;
  if (!acao) return null;
  const alvo = e.target as HTMLElement | null;
  if (alvo && typeof alvo.closest === "function" && alvo.closest("input, textarea, select, [contenteditable=''], [contenteditable=true]")) return null;
  if (doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return null;
  return acao;
}
