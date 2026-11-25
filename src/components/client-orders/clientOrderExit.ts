// As regras da saída de stock de uma Encomenda Cliente, tiradas de src/pages/ClientOrders.tsx SEM mudar o comportamento,
// para o ecrã clássico e o novo Inventário ("E se…?" da saída, Anular de uma saída) usarem as mesmas: a forma das linhas de
// rpc_get_client_order_document, asQty, roundQty, lineKey, isStockExitConfirmable, isStockExitRevertible, confirmableQty e
// getProductExitGroup. Funções puras, sem React nem Supabase. Os testes (clientOrderExit.test.ts) correram antes e depois.

// 20261130070000: armazém(ns) com stock deste produto, só preenchido nas
// linhas com line_status === 'stock_disponivel_confirmar' (ordenado por
// quantity desc pela RPC). `rpc_get_client_order_document` devolve jsonb, pelo
// que `supabase gen types` gera sempre `Returns: Json` (opaco) — a tipagem
// desta estrutura tem de continuar manual, não é um `as any` temporário.
export interface ClientOrderAvailableWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  // 20261204310000: `quantity` = LEAST(stock do armazém, qty_reserved da
  // linha); `physical_quantity` = stock físico do armazém.
  quantity: number;
  physical_quantity?: number | null;
  // EC por armazém (20270103100000): parcela da reserva da linha neste armazém
  // (unidades base; 0 se a regra não o escolheu) e se é o armazém sugerido.
  // Os sugeridos vêm primeiro; só armazéns elegíveis (sem viaturas).
  suggested_quantity?: number | null;
  is_suggested?: boolean | null;
}

// EC por armazém (20270103100000): reserva da linha por armazém, maior
// primeiro (unidades base; soma = qty_reserved).
export interface ClientOrderWarehouseAlloc {
  warehouse_id: string;
  warehouse_name: string | null;
  qty: number;
}

// Saída de um produto por armazém (quantidade inteira em unidades base).
export interface StockExitAllocation {
  warehouse_id: string;
  quantity: number;
}

// Uma linha é de produto OU de serviço (item_type), nunca das duas. A RPC
// rpc_get_client_order_document já devolve os dois pares de campos desde
// 20261130190000, com o par não aplicável a NULL — daí product_id/product_name
// serem anuláveis. Ler só o par do produto deixava as linhas de serviço sem SKU
// e sem descrição na tabela.
export interface ClientOrderDocumentLine {
  quote_line_id: string;
  item_type: 'product' | 'service';
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  service_id: string | null;
  service_name: string | null;
  service_sku: string | null;
  quantity: number;
  // 20261206150000: 'nao_recebido_anulado' = linha concluída sem nada
  // recebido/servido, porque o que faltava foi anulado na PO.
  line_status: 'servido_por_stock' | 'recebido' | 'a_aguardar_encomenda' | 'stock_disponivel_confirmar' | 'parcial' | 'sem_fornecedor' | 'servico' | 'nao_recebido_anulado';
  stock_movement_id: string | null;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  available_warehouses: ClientOrderAvailableWarehouse[] | null;
  // 20261204290000: saída manual (estornável) que serve a linha — null nas
  // baixas automáticas na assinatura, que não se revertem daqui.
  stock_exit_movement_id?: string | null;
  // Linha já servida/pedida: não pode ser alterada nem removida na edição.
  line_locked?: boolean;
  // 20261204310000: reserva de stock por ordem de assinatura. Unidades base;
  // null em serviços e em encomendas não assinadas. component_index distingue
  // os componentes de um bundle (várias linhas com o mesmo quote_line_id).
  component_index?: number | null;
  qty_needed?: number | null;
  qty_reserved?: number | null;
  qty_ordered?: number | null;
  qty_received?: number | null;
  qty_missing?: number | null;
  // 20261204340000: quantidade já servida por stock (unidades base); null em
  // serviços. Fonte de verdade para "X servido" — não inferir pelos movimentos.
  qty_served?: number | null;
  // 20261206150000: quantidade anulada nas POs ("não vou receber o resto"),
  // em unidades base, e as anulações ativas que a explicam (null sem
  // anulações). Opcionais enquanto a RPC não tiver os campos.
  qty_cancelled?: number | null;
  cancellations?: ClientOrderLineCancellation[] | null;
  // Só em linhas de produto: o produto tem fornecedor preferencial. Distingue,
  // em 'sem_fornecedor', "falta pedir ao fornecedor" (true) de "não há
  // fornecedor preferencial" (false). null/ausente = desconhecido (serviços ou
  // RPC ainda sem o campo).
  has_preferred_supplier?: boolean | null;
  // 20270124010000 (auditoria 19/11): porque é que a falta não se pode pedir, com o critério do pedido ao fornecedor
  // (no_preferred_supplier | incompatible_supplier_uom); null = pode; ausente = base sem a migration (vale has_preferred_supplier).
  request_block_reason?: string | null;
  // Categoria principal e subcategoria do produto, só para agrupar as linhas
  // no PDF (não se mostram no ecrã). null em serviços e produtos sem
  // categoria; ausentes enquanto a RPC não tiver os campos.
  category_name?: string | null;
  subcategory_name?: string | null;
  // EC por armazém (20270103100000): armazém sugerido para a saída (a maior
  // parcela da reserva; null sem reserva) e a reserva por armazém. null em
  // serviços e em encomendas não assinadas.
  suggested_warehouse_id?: string | null;
  warehouse_alloc?: ClientOrderWarehouseAlloc[] | null;
}

// Chave única por linha do documento: um bundle devolve várias linhas com o
// mesmo quote_line_id (uma por componente).
export const lineKey = (line: Pick<ClientOrderDocumentLine, 'quote_line_id' | 'component_index'>) =>
  `${line.quote_line_id}:${line.component_index ?? 0}`;

// 20261206150000: anulação ativa numa PO que reduz a necessidade da linha
// (rpc_get_client_order_document → lines[].cancellations). quantity_cancelled
// já vem em unidades base.
export interface ClientOrderLineCancellation {
  cancellation_id: string;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  quantity_cancelled: number | null;
  reason: string | null;
  notes: string | null;
  created_at: string | null;
}

export const asQty = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Arredonda o ruído de vírgula flutuante antes de testes de inteiro/limites.
export const roundQty = (value: number): number => Math.round(value * 1e6) / 1e6;

// Linha cuja saída de stock se pode confirmar daqui: stock disponível ou
// parcial com parte reservada. Encomendas antigas/não assinadas não trazem
// qty_reserved (null) — mantém-se o comportamento anterior (quantity).
export const isStockExitConfirmable = (line: ClientOrderDocumentLine): boolean => {
  if (!line.product_id) return false;
  if (line.line_status === 'stock_disponivel_confirmar') {
    return line.qty_reserved === null || line.qty_reserved === undefined || asQty(line.qty_reserved) > 0;
  }
  return line.line_status === 'parcial' && asQty(line.qty_reserved) > 0;
};

// Saída manual estornável: tem movimento de saída próprio e a linha está
// servida por stock, ou (20261204340000) 'parcial'/'recebido' com parte já
// servida por stock (qty_served > 0).
export const isStockExitRevertible = (line: ClientOrderDocumentLine): boolean => {
  if (!line.stock_exit_movement_id) return false;
  if (line.line_status === 'servido_por_stock') return true;
  return (line.line_status === 'parcial' || line.line_status === 'recebido') && asQty(line.qty_served) > 0;
};

// Quantidade que a linha pode consumir do stock (unidades base).
export const confirmableQty = (line: ClientOrderDocumentLine): number =>
  line.qty_reserved === null || line.qty_reserved === undefined
    ? asQty(line.quantity)
    : asQty(line.qty_reserved);

// Saída por produto (20261204310000): a RPC é por contrato+produto, recusa
// uma segunda saída do mesmo produto e aceita no máximo a soma de
// qty_reserved das linhas desse produto. Por isso a quantidade enviada é
// essa soma (não line.quantity). Capacidade de cada armazém = stock físico
// (physical_quantity); sem esse campo, o maior `quantity` das linhas (que já
// vem limitado à reserva DESSA linha).
// 20261204340000: a RPC de saída recusa um armazém sem stock suficiente, por
// isso `warehouses` só traz os armazéns cuja capacidade ≥ quantity (é o que se
// mostra e permite); sem nenhum, a confirmação da linha fica desativada.
// `quantity` de cada armazém devolvido = essa capacidade (stock a mostrar).
// EC por armazém (20270103100000): `options` = todos os armazéns com stock
// (para repartir; a soma das capacidades tem de cobrir a quantidade) e
// `suggested` = a repartição da reserva (warehouse_alloc das linhas,
// validada contra a capacidade); sem ela, o armazém sugerido que cubra
// tudo, ou o primeiro que cubra. null = nenhuma sugestão válida.
// Extraído de ClientOrders.tsx (fatia 3 do novo Inventário): `stockExitRequiresInteger` era do closure do ecrã
// (useProductBaseUomCodes → requiresIntegerQty) e passa a parâmetro. O resto está igual, carácter a carácter.
export const getProductExitGroup = (
  productId: string,
  docLines: ClientOrderDocumentLine[],
  stockExitRequiresInteger: (productId: string) => boolean,
) => {
  const groupLines = docLines.filter((l) => l.product_id === productId && isStockExitConfirmable(l));
  const quantity = roundQty(groupLines.reduce((sum, l) => sum + confirmableQty(l), 0));
  const byId = new Map<string, ClientOrderAvailableWarehouse>();
  const allocById = new Map<string, number>();
  groupLines.forEach((l) => (l.available_warehouses || []).forEach((wh) => {
    const physical = wh.physical_quantity === null || wh.physical_quantity === undefined
      ? null
      : asQty(wh.physical_quantity);
    const prev = byId.get(wh.warehouse_id);
    const capacity = physical === null
      ? Math.max(asQty(wh.quantity), prev ? asQty(prev.quantity) : 0)
      : physical;
    byId.set(wh.warehouse_id, { ...wh, quantity: roundQty(capacity) });
  }));
  groupLines.forEach((l) => (l.warehouse_alloc || []).forEach((a) => {
    if (!a?.warehouse_id) return;
    allocById.set(a.warehouse_id, roundQty((allocById.get(a.warehouse_id) ?? 0) + asQty(a.qty)));
  }));
  const allocOf = (id: string) => allocById.get(id) ?? 0;
  const options = Array.from(byId.values())
    .filter((wh) => asQty(wh.quantity) > 0)
    .sort((a, b) => allocOf(b.warehouse_id) - allocOf(a.warehouse_id) || asQty(b.quantity) - asQty(a.quantity));
  const warehouses = options.filter((wh) => quantity > 0 && asQty(wh.quantity) >= quantity);
  const capacityOf = (id: string) => asQty(byId.get(id)?.quantity);
  const totalCapacity = roundQty(options.reduce((sum, wh) => sum + asQty(wh.quantity), 0));
  const integer = stockExitRequiresInteger(productId);

  let suggested: StockExitAllocation[] | null = null;
  const fromAlloc = Array.from(allocById, ([warehouse_id, qty]) => ({ warehouse_id, quantity: qty }))
    .filter((a) => a.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity);
  if (
    quantity > 0
    && fromAlloc.length > 0
    && roundQty(fromAlloc.reduce((sum, a) => sum + a.quantity, 0)) === quantity
    && fromAlloc.every((a) => (!integer || Number.isInteger(a.quantity)) && byId.has(a.warehouse_id) && a.quantity <= capacityOf(a.warehouse_id))
  ) {
    suggested = fromAlloc;
  } else if (warehouses.length > 0) {
    const preferred = groupLines.map((l) => l.suggested_warehouse_id).find((id) => !!id && warehouses.some((wh) => wh.warehouse_id === id));
    suggested = [{ warehouse_id: preferred ?? warehouses[0].warehouse_id, quantity }];
  }
  return { product_id: productId, quantity, integer, warehouses, options, totalCapacity, suggested, lineKeys: groupLines.map(lineKey) };
};

