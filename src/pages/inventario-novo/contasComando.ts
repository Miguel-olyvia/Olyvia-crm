// As contas do Comando e do cabeçalho do novo Inventário (contasComando.ts — não comandoInventario.ts: no Windows, sem
// distinguir maiúsculas, "./ComandoInventario" resolvia para o .ts antes do .tsx): funções puras, sem React nem BD. Só usam o que o Hoje clássico
// já carrega — rpc_inventory_today (useInventoryToday) e as POs da Receção (useReceivablePos, a mesma query key) —, e as
// mesmas regras: getInventoryQueueItems / getReceivingQueueItem (a fila de trabalho) e grupoRececao / compararRececao
// (a ordem da lista "Por receber"). Os destinos passam por paraSeparador (ficam dentro do novo Inventário).
import {
  getInventoryQueueItems,
  getReceivingQueueItem,
  type InventoryQueueItem,
  type InventoryReceivingSummary,
  type InventoryTodayPayload,
} from "@/hooks/useInventoryToday";
import { clientOrdersLink, purchaseOrdersLink, receivingLink } from "@/components/inventory/ui/inventoryLinks";
import {
  addDays,
  compararRececao,
  dataEntregaEf,
  fmtDayMonth,
  grupoRececao,
  poRecebivel,
  type ReceivablePo,
} from "@/components/receiving/porReceber";
import { paraSeparador } from "./navegadorInventario";

type TemPermissao = (permission: string) => boolean;

export type TomComando = "bad" | "warn" | "ok" | "info" | "neutral";

export interface ItemComando {
  chave: string;
  tom: TomComando;
  titulo: string;
  detalhe?: string;
  /** Número à cabeça (os cartões da fila de trabalho). */
  valor?: number;
  /** Destino já traduzido para o separador (/inventory/novo/…). */
  to: string;
  acao: string;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Só as encomendadas e as parciais se recebem (as pendentes ainda não foram enviadas ao fornecedor). */
const AGUARDAM = new Set(["ordered", "partially_received"]);

const paraQuem = (p: ReceivablePo) => (p.origin?.clientName ? `para ${p.origin.clientName}` : p.contractId ? "para um cliente" : "para stock");

/* ------------------------------------------------------------------ Hoje no armazém */
/**
 * As POs que chegam hoje/amanhã ou já expedidas pelo fornecedor (grupos −1 e 0 da Receção, pela ordem da lista) e as
 * encomendas de cliente prontas a sair. `pos` = null sem permissão para as POs (ou ainda a carregar).
 */
export function hojeNoArmazem(
  pos: readonly ReceivablePo[] | null | undefined,
  today: InventoryTodayPayload | null | undefined,
  hoje: string,
  hasPermission: TemPermissao,
): ItemComando[] {
  const L: ItemComando[] = [];
  const chegam = (pos ?? [])
    .filter(poRecebivel)
    .filter((p) => grupoRececao(p, hoje) <= 0)
    .sort((a, b) => compararRececao(a, b, hoje));
  for (const p of chegam) {
    const d = dataEntregaEf(p);
    const quando = p.shipped ? "Expedida pelo fornecedor" : d === hoje ? "Chega hoje" : d === addDays(hoje, 1) ? "Chega amanhã" : "Confirmada pelo fornecedor";
    L.push({
      chave: `po-${p.id}`,
      tom: "info",
      titulo: `${p.orderNumber} · ${p.supplierName}`,
      detalhe: `${quando} · ${paraQuem(p)}`,
      to: paraSeparador(receivingLink({ po: p.id })),
      acao: "Receber",
    });
  }
  const prontas = today?.client_orders?.ready_to_ship;
  if (hasPermission("client_orders.view") && isNum(prontas) && prontas > 0) {
    L.push({
      chave: "ec-prontas",
      tom: "ok",
      titulo: `${plural(prontas, "encomenda pronta", "encomendas prontas")} a sair`,
      detalhe: "Stock reservado à espera de saída",
      to: paraSeparador(clientOrdersLink({ ready: true })),
      acao: "Ver",
    });
  }
  return L;
}

/* ------------------------------------------------------------------ Precisa de ti */
const ORDEM_TOM: Record<TomComando, number> = { bad: 0, warn: 1, info: 2, ok: 3, neutral: 4 };

/**
 * A fila de trabalho do Hoje (getInventoryQueueItems + o cartão "Encomendas por receber no armazém"), só com o que tem
 * alguma coisa (valor > 0), do mais urgente para o menos, com o destino traduzido para o separador.
 */
export function precisaDeTi(
  today: InventoryTodayPayload | null | undefined,
  rececao: InventoryReceivingSummary | null | undefined,
  hasPermission: TemPermissao,
): ItemComando[] {
  const fila: InventoryQueueItem[] = [];
  const rec = getReceivingQueueItem(rececao, hasPermission);
  if (rec) fila.push(rec);
  fila.push(...getInventoryQueueItems(today, hasPermission));
  return fila
    .filter((x) => x.value > 0)
    .map((x, i) => ({ x, i }))
    .sort((a, b) => ORDEM_TOM[a.x.tone] - ORDEM_TOM[b.x.tone] || a.i - b.i)
    .map(({ x }) => ({
      chave: x.key,
      tom: x.tone,
      titulo: x.title,
      detalhe: x.description,
      valor: x.value,
      to: paraSeparador(x.to),
      acao: "Abrir",
    }));
}

/* ------------------------------------------------------------------ A seguir */
/** As próximas POs por receber (as que não chegam hoje/amanhã nem estão atrasadas), pela data em que chegam. */
export function aSeguir(pos: readonly ReceivablePo[] | null | undefined, hoje: string, quantas = 3): ItemComando[] {
  return (pos ?? [])
    .filter(poRecebivel)
    .filter((p) => grupoRececao(p, hoje) >= 2)
    .sort((a, b) => {
      const da = dataEntregaEf(a), db = dataEntregaEf(b);
      if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      }
      return compararRececao(a, b, hoje);
    })
    .slice(0, quantas)
    .map((p) => {
      const d = dataEntregaEf(p);
      const g = grupoRececao(p, hoje);
      const estado = g === 2 ? "Confirmada pelo fornecedor" : g === 4 ? "Por enviar ao fornecedor" : "À espera do fornecedor";
      return {
        chave: `seg-${p.id}`,
        tom: g === 4 ? ("warn" as const) : ("info" as const),
        titulo: `${p.orderNumber} · ${p.supplierName}`,
        detalhe: `${d ? `Prevista ${fmtDayMonth(d)}` : "Sem data prevista"} · ${estado} · ${paraQuem(p)}`,
        to: paraSeparador(receivingLink({ po: p.id })),
        acao: "Ver",
      };
    });
}

/* ------------------------------------------------------------------ o cabeçalho */
export interface Saude {
  tom: "bad" | "warn" | "ok";
  texto: string;
}

/**
 * A pílula de saúde: entregas atrasadas (vermelho); produtos a acabar ou encomendas sem fornecedor (âmbar); senão "Tudo
 * em dia". Cada número só conta com a permissão do cartão correspondente no Hoje. Sem dados (RPC por aplicar, a
 * carregar ou sem nenhum número visível): null — nunca "Tudo em dia" sem saber.
 */
export function saudeDoInventario(today: InventoryTodayPayload | null | undefined, hasPermission: TemPermissao): Saude | null {
  if (!today) return null;
  const late = hasPermission("purchase_orders.view") ? today.purchases?.late : null;
  const low = hasPermission("inventory.view") ? today.stock?.below_reorder_point : null;
  const nof = hasPermission("client_orders.view") ? today.client_orders?.without_preferred_supplier : null;
  if (isNum(late) && late > 0) return { tom: "bad", texto: plural(late, "entrega atrasada", "entregas atrasadas") };
  if (isNum(low) && low > 0) return { tom: "warn", texto: plural(low, "produto a acabar", "produtos a acabar") };
  if (isNum(nof) && nof > 0) return { tom: "warn", texto: plural(nof, "encomenda sem fornecedor", "encomendas sem fornecedor") };
  if (![late, low, nof].some(isNum)) return null;
  return { tom: "ok", texto: "Tudo em dia" };
}

/** A primeira PO atrasada por receber (encomendada ou parcial), pela ordem da lista "Por receber". */
export function poAtrasada(pos: readonly ReceivablePo[] | null | undefined, hoje: string): ReceivablePo | null {
  const L = (pos ?? [])
    .filter(poRecebivel)
    .filter((p) => AGUARDAM.has(p.status) && grupoRececao(p, hoje) === 1)
    .sort((a, b) => compararRececao(a, b, hoje));
  return L[0] ?? null;
}

export type BotaoPrincipal =
  | { tipo: "receber"; rotulo: string; to: string; permissoes: string[] }
  | { tipo: "saida"; rotulo: string; to: string; permissoes: string[] }
  | { tipo: "aprovar"; rotulo: string; to: string; permissoes: string[] }
  | { tipo: "movimento"; rotulo: string; permissoes: string[] };

/**
 * O botão principal (um só), por esta ordem: receber a PO atrasada; dar saída às ECs prontas; aprovar as POs por aprovar;
 * registar um movimento. As permissões são as das ações nos ecrãs clássicos (Receiving: receiveGate; ClientOrders:
 * confirmExitGate; PurchaseOrders: purchase_orders.approve; Hoje: inventory.edit) — todas obrigatórias.
 */
export function botaoPrincipal(
  today: InventoryTodayPayload | null | undefined,
  pos: readonly ReceivablePo[] | null | undefined,
  hoje: string,
  hasPermission: TemPermissao,
): BotaoPrincipal {
  const atrasada = poAtrasada(pos, hoje);
  if (atrasada) {
    return {
      tipo: "receber",
      rotulo: `Receber ${atrasada.orderNumber}`,
      to: paraSeparador(receivingLink({ po: atrasada.id })),
      permissoes: ["receiving.receive", "purchase_orders.receive", "inventory.edit"],
    };
  }
  const prontas = hasPermission("client_orders.view") ? today?.client_orders?.ready_to_ship : null;
  if (isNum(prontas) && prontas > 0) {
    return {
      tipo: "saida",
      rotulo: "Dar saída",
      to: paraSeparador(clientOrdersLink({ ready: true })),
      permissoes: ["inventory.edit", "client_orders.confirm_stock_exit", "client_orders.view"],
    };
  }
  const porAprovar = hasPermission("purchase_orders.view") ? today?.purchases?.pending_approval : null;
  if (isNum(porAprovar) && porAprovar > 0) {
    return {
      tipo: "aprovar",
      rotulo: "Aprovar encomendas",
      to: paraSeparador(purchaseOrdersLink({ status: "pending" })),
      permissoes: ["purchase_orders.approve"],
    };
  }
  return { tipo: "movimento", rotulo: "Registar movimento", permissoes: ["inventory.edit"] };
}
