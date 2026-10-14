// A ponte da Frota para o Inventário (à parte de pontes.ts para o resto do protótipo não carregar o motor do Inventário sem precisar):
// o stock de cada carrinha é o do armazém do tipo "viatura" (inventario/carrinhas.ts); "Pedir reposição" cria pedidos de transferência reais
// (criarPedidoTransf) do Armazém Central para a carrinha; uma viatura nova com armazém cria o armazém móvel. Sem React.
import { falhar as falharInv, nomeProd, produto } from "../inventario/base";
import { criarPedidoTransf, linhaStock } from "../inventario/stock";
import type { Inventario } from "../inventario/tipos";
import { abaixoMin } from "./regras";
import type { LinhaCarrinha, Viatura } from "./tipos";

/** O armazém central de onde se repõem as carrinhas. */
export const ARMAZEM_CENTRAL = "LIS";

/** As linhas de stock da carrinha, lidas do Inventário (só as que não foram eliminadas). */
export function stockCarrinha(inv: Inventario, armazemId: string | null | undefined): LinhaCarrinha[] {
  if (!armazemId) return [];
  return inv.stocks.filter((s) => s.wh === armazemId && !s.deleted)
    .map((s) => ({ sku: s.sku, nome: nomeProd(inv, s.sku), qty: s.qty, un: produto(inv, s.sku)?.unit ?? "un", min: s.min }));
}
/** O armazém móvel da viatura existe (e não foi eliminado) no Inventário. */
export const temArmazem = (inv: Inventario, v: Viatura): boolean => !!v.armazemId && inv.warehouses.some((w) => w.id === v.armazemId && !w.deleted);

/**
 * "Pedir reposição ao armazém central": um pedido de transferência pendente (Armazém Central → carrinha) por artigo abaixo do mínimo,
 * para o que falta até ao mínimo. Os artigos que já têm um pedido pendente para esta carrinha não se repetem. Corre dentro de executar() do Inventário.
 */
export function pedirReposicao(inv: Inventario, armazemId: string): string[] {
  const linhas = abaixoMin(stockCarrinha(inv, armazemId));
  if (!linhas.length) falharInv("Nenhum artigo da carrinha está abaixo do mínimo.");
  const novas = linhas.filter((l) => !inv.transfers.some((t) => t.state === "pending" && t.to === armazemId && t.sku === l.sku));
  if (!novas.length) falharInv("Já há pedidos de transferência pendentes para todos os artigos em falta.");
  return novas.map((l) => criarPedidoTransf(inv, { sku: l.sku, from: ARMAZEM_CENTRAL, to: armazemId, qty: l.min - l.qty }).id);
}
/** Os pedidos de transferência pendentes para a carrinha. */
export const pedidosPendentes = (inv: Inventario, armazemId: string | null | undefined) => inv.transfers.filter((t) => t.state === "pending" && t.to === armazemId);

/** O id do armazém móvel de uma matrícula. */
export const idArmazemCarrinha = (mat: string): string => "VIA-" + mat.toUpperCase();
/**
 * Cria o armazém móvel de uma viatura nova (vazio; o stock entra por transferência). Se já existir um da mesma matrícula e estiver vazio
 * (por exemplo depois de "Repor" na Frota, que não mexe no Inventário), reaproveita-o: volta a ficar ativo e não eliminado.
 * Com stock lá dentro recusa (seria juntar a carrinha nova ao stock de outra).
 */
export function criarArmazemCarrinha(inv: Inventario, mat: string, cidade: string): string {
  const id = idArmazemCarrinha(mat);
  const existente = inv.warehouses.find((w) => w.id === id);
  if (existente) {
    if (inv.stocks.some((s) => s.wh === id && !s.deleted && s.qty > 0)) falharInv(`O armazém móvel da ${mat} já existe no Inventário e tem stock: esvazie-o por transferência primeiro.`);
    Object.assign(existente, { deleted: false, active: true, serves: false, tipo: "viatura", matricula: mat, ...(cidade ? { city: cidade } : {}) });
    return id;
  }
  const n = inv.warehouses.filter((w) => w.tipo === "viatura").length + 1;
  inv.warehouses.push({ id, name: `Carrinha ${mat}`, code: `VIA-${String(n).padStart(2, "0")}`, addr: "Armazém móvel (viatura)", cp: "", city: cidade, lat: null, lng: null,
    manager: "", phone: "", email: "", cap: "Viatura", active: true, serves: false, deleted: false, tipo: "viatura", matricula: mat });
  return id;
}
/** A quantidade de um artigo na carrinha. */
export const naCarrinha = (inv: Inventario, armazemId: string, sku: string): number => linhaStock(inv, sku, armazemId)?.qty ?? 0;
