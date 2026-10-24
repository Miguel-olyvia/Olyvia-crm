// As ações das Encomendas Clientes que o mockup protege com need() e a definição de exportar (XP.ecs). Funções puras, sem React.
import { ehInteiro, exigir, falhar, nomeProd, armazem, utilizadorAtual, agora, ecPorId } from "./base";
import type { DefImportacao } from "./csvInv";
import { EC_ESTADOS, EC_LINHA_ESTADOS, ecEstado, ecLinhaInfo, editarEcManual, origemTexto, reverterSaida, sairLinha } from "./ec";
import type { Ec, EcLinha, Inventario } from "./tipos";

/** shipLine() do mockup: exige inventory.manage antes de sair. */
export function confirmarSaida(db: Inventario, e: Ec, l: EcLinha, qty: number, wh: string): void {
  exigir("inventory.manage", "confirmar saídas");
  sairLinha(db, e, l, qty, wh);
}

/** revertExit() do mockup. */
export function desfazerSaida(db: Inventario, e: Ec, l: EcLinha): void {
  exigir("inventory.manage", "reverter saídas");
  reverterSaida(db, e, l);
}

const ROTULO_CAMPO = { addr: "Morada", notes: "Notas", client: "Cliente" } as const;
export type CampoEc = keyof typeof ROTULO_CAMPO;

/** setECField(): edição na própria célula do cliente, da morada e das notas. */
export function definirCampoEc(db: Inventario, id: string, k: CampoEc, v: string): void {
  exigir("inventory.manage", "editar encomendas clientes");
  const e = ecPorId(db, id);
  if (!e) return falhar("Encomenda não encontrada.");
  if (e.deleted) falhar("Encomenda eliminada.");
  if (k === "client") {
    if (!v.trim()) falhar("Cliente obrigatório.");
    if (e.origin.k !== "manual") falhar("O cliente vem do " + (e.origin.k === "VD" ? "documento de venda direta" : "contrato") + ": altere-o na origem.");
  }
  e[k] = v.trim();
  e.log.push({ at: agora(db), t: `${ROTULO_CAMPO[k]} alterado por ${utilizadorAtual()}` });
}

/** setECLineQty(): edição na própria célula da quantidade (só encomendas manuais, nunca abaixo do servido). */
export function definirQtdLinhaEc(db: Inventario, eid: string, lid: string, v: number): void {
  const e = ecPorId(db, eid);
  if (!e) return falhar("Encomenda não encontrada.");
  if (e.origin.k !== "manual") falhar("Só linhas de encomendas manuais: as restantes vêm do contrato/venda.");
  const l = e.lines.find((x) => x.id === lid);
  if (!l) return falhar("Linha não encontrada.");
  if (!ehInteiro(v) || v < 1) falhar("Quantidade inteira ≥ 1.");
  if (v < l.served) falhar(`Já saíram ${l.served} un: reverta a saída para baixar.`);
  exigir("inventory.manage", "editar encomendas");
  editarEcManual(db, e, { client: e.client, addr: e.addr, notes: e.notes }, [{ id: lid, qty: v }]);
}

interface LinhaExp { e: Ec; l: EcLinha }
/** XP.ecs do mockup: só exportação (o mesmo cabeçalho, uma linha por linha de encomenda). */
export function defEcs(db: Inventario, lista: () => Ec[]): DefImportacao<LinhaExp> {
  return {
    rotulo: "encomendas clientes", ficheiro: "encomendas-clientes",
    cols: [
      ["encomenda", (r) => r.e.id], ["origem", (r) => origemTexto(r.e)], ["cliente", (r) => r.e.client], ["armazem_expedicao", (r) => armazem(db, r.e.wh)?.code],
      ["data", (r) => r.e.date], ["estado", (r) => EC_ESTADOS[ecEstado(db, r.e)]], ["sku", (r) => r.l.sku ?? ""], ["descricao", (r) => (r.l.sku ? nomeProd(db, r.l.sku) : r.l.desc)],
      ["quantidade", (r) => r.l.qty], ["servido", (r) => r.l.served], ["estado_linha", (r) => EC_LINHA_ESTADOS[ecLinhaInfo(db, r.e, r.l).st]],
    ],
    linhas: () => lista().flatMap((e) => e.lines.map((l) => ({ e, l }))),
    verificar: () => ({ st: "Erro", key: "", msg: "Só exportação." }),
    aplicar: () => undefined,
  };
}
