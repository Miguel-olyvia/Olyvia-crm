// F3.4b — sincronizar a ficha do produto depois de aceitar um preço do
// fornecedor (PendingSupplierPriceNotice).
//
// O problema (o mesmo do código de barras): rpc_price_changes_decide grava o
// custo do produto (product_prices purchase) e o preço da ligação, mas a ficha
// aberta guarda o que leu ao abrir. Em Products.tsx, "Atualizar Produto" com a
// compra NÃO tocada reenvia openedPurchase.storedUnit (o custo lido ao abrir)
// e, tocada, envia o valor do campo — qualquer dos dois desfazia o custo
// aceite. Por isso, logo que a RPC responde (sem esperar por mais nada):
//   • openedPurchase passa a ser o que ficou gravado (storedUnit e o preço
//     mostrado) — "não tocada" reenvia o custo novo;
//   • o campo "Preço de Compra" passa a mostrar o valor gravado, mas só se o
//     utilizador não lhe mexeu (estava igual ao valor com que a ficha abriu).
//     Se mexeu, fica o dele (escolha explícita) e é avisado de que gravar o
//     substitui.
// Depois relê-se a BD para corrigir casos que o retorno não cobre (várias
// moedas, arredondamentos), com a mesma regra.
import { supabase } from "@/integrations/supabase/client";

export interface OpenedPurchase {
  price: number;
  qty: number;
  uomId: string | null;
  storedUnit: number;
}

/** O que um aceite fez (de rpc_price_changes_decide + o pedido). */
export interface AcceptedPriceInfo {
  productCostUpdated: boolean;
  newUnitCost: number | null;
  /** Novo preço da ligação (na unidade de compra da ligação). */
  newPrice: number;
  itemSupplierUpdated: boolean;
  /** A ligação é a preferencial ativa (é dela que vem o preço do pack mostrado). */
  isPreferred: boolean;
}

export interface PurchaseShown {
  /** Valor que a ficha mostraria se abrisse agora. */
  displayed: number;
  /** product_prices purchase gravado. */
  storedUnit: number;
}

/**
 * Valores gravados a partir do retorno da RPC. Compra em pack (qty ≥ 2): a
 * ficha mostra o preço do pack da ligação preferencial; senão o custo unitário
 * (a mesma regra de openEditDialog).
 */
export function shownAfterAccept(opened: OpenedPurchase, accepted: AcceptedPriceInfo[]): PurchaseShown {
  let storedUnit = opened.storedUnit;
  let packPrice = opened.price;
  accepted.forEach((a) => {
    if (a.productCostUpdated && a.newUnitCost != null) storedUnit = Number(a.newUnitCost);
    if (a.isPreferred && a.itemSupplierUpdated) packPrice = Number(a.newPrice);
  });
  return { displayed: opened.qty >= 2 ? packPrice : storedUnit, storedUnit };
}

/** Valores relidos da BD (mesma regra). */
export function shownFromStored(opened: OpenedPurchase, storedUnit: number, packPrice: number | null): PurchaseShown {
  return { displayed: opened.qty >= 2 ? (packPrice != null ? packPrice : 0) : storedUnit, storedUnit };
}

/**
 * product_prices purchase tal como está gravado (custo unitário). Com várias
 * linhas, a da moeda da ficha; senão a primeira. 0 = não há. null = erro.
 */
export async function loadStoredUnitPurchase(productId: string, currency: string | null | undefined): Promise<number | null> {
  const { data, error } = await supabase
    .from("product_prices")
    .select("price, currency")
    .eq("product_id", productId)
    .eq("price_type", "purchase");
  if (error) return null;
  const rows = data ?? [];
  const row = rows.find((r) => r.currency === currency) ?? rows[0];
  return row?.price != null ? Number(row.price) : 0;
}

const money = (v: number) => v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Sincroniza a ficha depois de aceitar. `apply(prevShown, next)` tem de:
 *   - pôr openedPurchase.price = next.displayed e storedUnit = next.storedUnit;
 *   - pôr o campo = next.displayed SÓ se o campo for igual a prevShown.
 * `isCurrent()` = a ficha ainda é a deste produto (a releitura é assíncrona).
 * Devolve um aviso quando o valor escrito pelo utilizador ficou no campo.
 */
export async function syncFormAfterAcceptedPrice(args: {
  productId: string;
  currency: string | null | undefined;
  opened: OpenedPurchase;
  /** Valor do campo no momento do aceite. */
  formPurchase: number;
  accepted: AcceptedPriceInfo[];
  loadPreferredPackPrice: () => Promise<number | null>;
  apply: (prevShown: number, next: PurchaseShown) => void;
  isCurrent: () => boolean;
}): Promise<string | null> {
  const { opened, formPurchase } = args;
  if (!args.isCurrent()) return null;
  // 1. Já, com o retorno da RPC: nada fica a apontar para o custo antigo.
  const first = shownAfterAccept(opened, args.accepted);
  args.apply(opened.price, first);
  const userValueKept = formPurchase !== opened.price && formPurchase !== first.displayed;

  // 2. Releitura (corrige o que o retorno não cobre).
  const [storedUnit, packPrice] = await Promise.all([
    loadStoredUnitPurchase(args.productId, args.currency),
    opened.qty >= 2 ? args.loadPreferredPackPrice() : Promise.resolve(null),
  ]);
  let final = first;
  if (storedUnit != null && args.isCurrent()) {
    const fresh = shownFromStored(opened, storedUnit, packPrice);
    if (fresh.displayed !== first.displayed || fresh.storedUnit !== first.storedUnit) {
      args.apply(first.displayed, fresh);
      final = fresh;
    }
  }
  if (!userValueKept) return null;
  return `O Preço de Compra no formulário (${money(formPurchase)}) é diferente do aceite (${money(final.displayed)}). Se carregares em "Atualizar Produto", fica o valor do formulário.`;
}
