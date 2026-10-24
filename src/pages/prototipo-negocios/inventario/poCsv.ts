// Exportar e importar encomendas a fornecedor (XP.pos do mockup): uma linha de CSV por linha de encomenda; importar cria rascunhos (Pendente) e nunca altera referências que já existem.
import { agora, armazem, exigir } from "./base";
import type { DefImportacao, Verificacao } from "./csvInv";
import { linhaDeArtigo, novaPo, poStatus, poStatusLabel } from "./po";
import type { Inventario, Po, PoLinha } from "./tipos";

export interface LinhaPoCsv { p: Po; l: PoLinha }

const codigoForn = (db: Inventario, id: string): string => db.suppliers.find((s) => s.id === id)?.code ?? id;
const codigoArm = (db: Inventario, id: string): string => armazem(db, id)?.code ?? id;
const erro = (key: string, msg: string): Verificacao => ({ key, st: "Erro", msg });

/** O que a importação faria com uma linha, sem alterar nada. */
function verificarLinhaPo(o: Record<string, string>, db: Inventario): Verificacao {
  const ref = o.referencia;
  if (!ref) return erro("?", "Referência obrigatória.");
  if (db.pos.some((p) => p.id === ref || p.importRef === ref)) return { key: ref, st: "Sem alterações", msg: "Já existe: não é alterada por importação." };
  const s = db.suppliers.find((x) => x.code === o.fornecedor && !x.deleted);
  if (!s) return erro(ref, "Fornecedor desconhecido: " + o.fornecedor);
  if (!db.warehouses.find((w) => w.code === o.armazem && !w.deleted)) return erro(ref, "Armazém desconhecido.");
  if (!db.items.find((i) => i.sup === s.id && i.sku === o.sku)) return erro(ref, s.name + " não tem o artigo " + o.sku);
  if (!/^\d+$/.test(o.embalagens) || Number(o.embalagens) < 1) return erro(ref, "Embalagens: inteiro ≥ 1.");
  return { key: ref, st: "Novo", msg: "Linha " + o.sku + " × " + o.embalagens };
}

/** Aplica uma linha: junta-se ao rascunho já importado com a mesma referência ou cria um novo. */
function aplicarLinhaPo(o: Record<string, string>, db: Inventario): void {
  exigir("purchase_orders.manage");
  const s = db.suppliers.find((x) => x.code === o.fornecedor);
  const w = db.warehouses.find((x) => x.code === o.armazem);
  const it = db.items.find((x) => x.sup === s?.id && x.sku === o.sku);
  if (!s || !w || !it) return;
  let p = db.pos.find((x) => x.importRef === o.referencia && x.status === "pending");
  if (!p) {
    p = novaPo(db, { sup: s.id, origin: { k: "stock" }, wh: w.id });
    p.importRef = o.referencia;
    p.log.push({ at: agora(db), t: "Importada (" + o.referencia + ")" });
  }
  const linha = linhaDeArtigo(db, it, Number(o.embalagens));
  if (o.preco) linha.price = Number(String(o.preco).replace(",", "."));
  p.lines.push(linha);
}

/** A definição de exportar/importar das encomendas; `filtradas` são as que o ecrã mostra. */
export function defPos(db: Inventario, filtradas: () => Po[]): DefImportacao<LinhaPoCsv> {
  return {
    rotulo: "encomendas a fornecedor", ficheiro: "encomendas-fornecedor", regra: "Importar cria rascunhos (Pendente). Referências existentes não são alteradas.",
    cols: [["referencia", (r) => r.p.id], ["fornecedor", (r) => codigoForn(db, r.p.sup)], ["armazem", (r) => codigoArm(db, r.p.wh)], ["sku", (r) => r.l.sku], ["embalagens", (r) => r.l.packs], ["preco", (r) => r.l.price], ["estado", (r) => poStatusLabel[poStatus(r.p)]]],
    linhas: () => filtradas().flatMap((p) => p.lines.map((l) => ({ p, l }))),
    verificar: verificarLinhaPo,
    aplicar: (o, d) => aplicarLinhaPo(o, d),
  };
}
