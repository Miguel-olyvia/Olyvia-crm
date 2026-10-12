// As ações do ecrã de Existências e Movimentos que levam permissão (need() do mockup) e o que cada um exporta e importa (XP.stocks e XP.moves). Sem React.
import { armazem, exigir, produto } from "./base";
import { can, porqueNao } from "./perfil";
import { cancelarPedidoTransf, eliminarLinhaStock, restaurarLinhaStock } from "./cadastros";
import type { DefImportacao } from "./csvInv";
import { TIPOS_MOV, linhaStock } from "./stock";
import type { Inventario, LinhaStock, Movimento } from "./tipos";

export function eliminarLinha(db: Inventario, id: string): void { exigir("inventory.manage"); eliminarLinhaStock(db, id); }
export function restaurarLinha(db: Inventario, id: string): void { exigir("inventory.manage"); restaurarLinhaStock(db, id); }
export function cancelarPedido(db: Inventario, id: string, motivo: string): void { exigir("inventory.manage"); cancelarPedidoTransf(db, id, motivo); }

const codigoArm = (db: Inventario, id: string): string => armazem(db, id)?.code ?? "";
const armPorCodigo = (db: Inventario, codigo: string) => db.warehouses.find((w) => w.code === codigo && !w.deleted);

/** XP.stocks: exporta as linhas filtradas (sem eliminadas) e importa localização e limites; a quantidade não é importável. */
export function defStocks(db: Inventario, linhas: () => LinhaStock[]): DefImportacao<LinhaStock> {
  return {
    rotulo: "existências", ficheiro: "existencias",
    regra: "A quantidade não é importável: o stock só muda por movimentos. Se diferir, a linha dá erro.",
    cols: [["sku", (r) => r.sku], ["armazem", (r) => codigoArm(db, r.wh)], ["localizacao", (r) => r.loc], ["quantidade", (r) => r.qty], ["minimo", (r) => r.min], ["maximo", (r) => r.max], ["ponto_encomenda", (r) => r.rop]],
    linhas: () => linhas().filter((r) => !r.deleted),
    verificar(o, d) {
      const k = `${o.sku}@${o.armazem}`;
      const w = armPorCodigo(d, o.armazem);
      if (!produto(d, o.sku)) return { key: k, st: "Erro", msg: "SKU desconhecido." };
      if (!w) return { key: k, st: "Erro", msg: "Armazém desconhecido." };
      for (const f of ["minimo", "maximo", "ponto_encomenda"]) if (o[f] !== "" && !/^\d+$/.test(o[f])) return { key: k, st: "Erro", msg: `${f} tem de ser inteiro ≥ 0.` };
      const r = linhaStock(d, o.sku, w.id);
      if (!r) return Number(o.quantidade || 0) > 0 ? { key: k, st: "Erro", msg: "Linha nova com quantidade: registe uma Entrada (movimento)." } : { key: k, st: "Novo" };
      if (o.quantidade !== "" && Number(o.quantidade) !== r.qty) return { key: k, st: "Erro", msg: `Quantidade diferente (${r.qty}): use Registar movimento › Ajuste.` };
      const igual = r.loc === o.localizacao && String(r.min) === o.minimo && String(r.max) === o.maximo && String(r.rop) === o.ponto_encomenda;
      return { key: k, st: igual ? "Sem alterações" : "Atualizar" };
    },
    aplicar(o, d) {
      exigir("inventory.manage");
      const w = armPorCodigo(d, o.armazem);
      const r = w ? linhaStock(d, o.sku, w.id, true) : undefined;
      if (r) Object.assign(r, { loc: o.localizacao, min: Number(o.minimo || 0), max: Number(o.maximo || 0), rop: Number(o.ponto_encomenda || 0) });
    },
  };
}

/** XP.moves: o livro só se exporta; importar recusa sempre ("O livro não é importável."). */
export function defMovs(db: Inventario, linhas: () => Movimento[]): DefImportacao<Movimento> {
  return {
    rotulo: "movimentos", ficheiro: "movimentos", linhas,
    cols: [["data", (m) => m.at], ["tipo", (m) => TIPOS_MOV[m.type].t], ["sku", (m) => m.sku], ["armazem", (m) => codigoArm(db, m.wh)], ["quantidade", (m) => m.qty], ["saldo_depois", (m) => m.bal], ["documento", (m) => m.doc], ["notas", (m) => m.note], ["utilizador", (m) => m.user]],
    verificar: () => ({ key: "", st: "Erro", msg: "O livro não é importável." }),
    aplicar: () => undefined,
  };
}

/** perm() do mockup: sem a permissão o botão fica desativado com o porquê. */
export const perm = (p: string): { disabled?: true; title?: string } => (can(p) ? {} : { disabled: true, title: porqueNao(p) });
