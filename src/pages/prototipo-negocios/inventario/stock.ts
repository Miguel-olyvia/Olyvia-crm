// O livro de movimentos: o único caminho para mudar o stock. Regras portadas do mockup (applyMoves, doTransfer, setStockField...). Sem React.
import { ErroInv, UTILIZADOR, agora, armazem, ehInteiro, exigir, falhar, mudou, nomeArm, nomeProd, pad, produto, proximoId } from "./base";
import type { Inventario, LinhaStock, MovPedido, Movimento, Tom, TipoMov, Transferencia } from "./tipos";

/** Cada tipo de movimento: o nome, a cor do ícone e o sinal sobre o stock. */
export const TIPOS_MOV: Record<TipoMov, { t: string; tone: Tom; sign: 1 | -1 }> = {
  in: { t: "Entrada", tone: "ok", sign: 1 },
  out: { t: "Saída", tone: "info", sign: -1 },
  tin: { t: "Transf. entrada", tone: "violet", sign: 1 },
  tout: { t: "Transf. saída", tone: "violet", sign: -1 },
  adjp: { t: "Ajuste +", tone: "warn", sign: 1 },
  adjm: { t: "Ajuste −", tone: "warn", sign: -1 },
  ret: { t: "Devolução fornecedor", tone: "neu", sign: -1 },
  loss: { t: "Quebra", tone: "bad", sign: -1 },
};

/** A linha de stock de um produto num armazém (e cria-a, vazia, se `criar`). */
export function linhaStock(db: Inventario, sku: string, wh: string, criar = false): LinhaStock | undefined {
  let r = db.stocks.find((s) => s.sku === sku && s.wh === wh && !s.deleted);
  if (!r && criar) {
    r = { id: proximoId(db, "S"), sku, wh, loc: "", min: 0, max: 0, rop: 0, qty: 0, deleted: false };
    db.stocks.push(r);
  }
  return r;
}
export const qtyAt = (db: Inventario, sku: string, wh: string): number => linhaStock(db, sku, wh)?.qty ?? 0;
export const totalQty = (db: Inventario, sku: string): number => db.stocks.filter((s) => s.sku === sku && !s.deleted).reduce((a, s) => a + s.qty, 0);
/** Só um armazém ativo, que serve clientes e não eliminado entra na reserva e nas saídas. */
export function armazemServe(db: Inventario, id: string): boolean {
  const w = armazem(db, id);
  return !!(w && w.active && w.serves && !w.deleted);
}

/** Valida tudo antes de escrever: se uma linha deixa o stock abaixo de zero, falha por inteiro e nada se regista. */
function validarMovimentos(db: Inventario, lista: MovPedido[]): void {
  const tmp = new Map<string, number>();
  for (const m of lista) {
    if (!produto(db, m.sku)) falhar("Produto desconhecido: " + m.sku);
    if (!armazem(db, m.wh)) falhar("Armazém desconhecido.");
    if (!ehInteiro(m.qty) || m.qty <= 0) falhar("Quantidade tem de ser um número inteiro de unidades, maior que zero.");
    const k = m.sku + "|" + m.wh;
    const cur = tmp.get(k) ?? qtyAt(db, m.sku, m.wh);
    const nv = cur + TIPOS_MOV[m.type].sign * m.qty;
    if (nv < 0) falhar(`Saída abaixo de zero: ${nomeProd(db, m.sku)} em ${nomeArm(db, m.wh)} tem ${cur} un e pediu ${m.qty}. Nada foi registado.`);
    tmp.set(k, nv);
  }
}

/** Uma entrada com custo atualiza o custo médio ponderado do produto. */
function atualizarCustoMedio(db: Inventario, m: MovPedido): void {
  const p = produto(db, m.sku);
  if (!p || m.cost == null || Number.isNaN(Number(m.cost))) return;
  const tot = totalQty(db, m.sku);
  const c = Number(m.cost);
  p.avg = tot + m.qty > 0 ? (tot * (p.avg || 0) + m.qty * c) / (tot + m.qty) : c;
}

/** Aplica movimentos ao livro (tudo ou nada) e devolve os registos criados. */
export function aplicarMovimentos(db: Inventario, lista: MovPedido[]): Movimento[] {
  validarMovimentos(db, lista);
  const out: Movimento[] = [];
  for (const m of lista) {
    const r = linhaStock(db, m.sku, m.wh, true);
    if (!r) continue;
    const sinal = TIPOS_MOV[m.type].sign;
    if (sinal > 0) atualizarCustoMedio(db, m);
    r.qty += sinal * m.qty;
    const rec: Movimento = {
      id: ++db.seq, at: agora(db), type: m.type, sku: m.sku, wh: m.wh, qty: sinal * m.qty, bal: r.qty, doc: m.doc ?? "", note: m.note ?? "",
      user: m.user ?? UTILIZADOR, cost: m.cost == null ? null : Number(m.cost),
    };
    db.moves.push(rec);
    out.push(rec);
  }
  mudou(db);
  return out;
}

/** O pedido de transferência entre armazéns (nasce da receção de uma EC que expede de outro armazém). */
export function criarPedidoTransf(db: Inventario, p: { sku: string; from: string; to: string; qty: number; ec?: string | null; auto?: boolean }): Transferencia {
  const t: Transferencia = { id: "TR-" + pad(++db.n.tr), sku: p.sku, from: p.from, to: p.to, qty: p.qty, ec: p.ec ?? null, state: "pending", at: agora(db), auto: !!p.auto, reason: "" };
  db.transfers.push(t);
  return t;
}

/** A transferência em duas pernas: saída na origem e entrada no destino, no mesmo documento. */
export function transferir(db: Inventario, sku: string, from: string, to: string, qty: number, opts: { doc?: string; note?: string } = {}): string {
  exigir("inventory.manage", "transferir");
  if (from === to) falhar("Origem e destino têm de ser diferentes.");
  const doc = opts.doc ?? "TR-" + pad(++db.n.tr);
  const nota = opts.note ? " · " + opts.note : "";
  aplicarMovimentos(db, [
    { type: "tout", sku, wh: from, qty, doc, note: "Para " + nomeArm(db, to) + nota },
    { type: "tin", sku, wh: to, qty, doc, note: "De " + nomeArm(db, from) + nota },
  ]);
  return doc;
}

/** Nova nota num movimento (a única coisa editável do livro; fica marcada como editada). */
export function anotarMovimento(db: Inventario, id: number, nota: string): void {
  exigir("inventory.manage", "anotar movimentos");
  const m = db.moves.find((x) => x.id === id);
  if (!m) throw new ErroInv("Movimento inexistente.");
  m.note = nota.trim();
  m.noteEdited = agora(db);
  m.noteBy = UTILIZADOR;
}

/** Edita a localização e os limites de uma linha de stock; a quantidade nunca se edita (só por movimentos). */
export function editarLinhaStock(db: Inventario, id: string, patch: Partial<Pick<LinhaStock, "loc" | "min" | "max" | "rop">>): void {
  exigir("inventory.manage");
  const r = db.stocks.find((x) => x.id === id);
  if (!r) return falhar("Linha de stock inexistente.");
  const t = { ...r, ...patch };
  for (const k of ["min", "max", "rop"] as const) if (!ehInteiro(t[k]) || t[k] < 0) falhar("Mínimo, máximo e ponto de encomenda: inteiros ≥ 0.");
  if (t.max && t.min > t.max) falhar("O mínimo não pode ser maior que o máximo.");
  Object.assign(r, { loc: t.loc.trim(), min: t.min, max: t.max, rop: t.rop });
}

/** Adiciona uma linha de stock (a quantidade inicial entra por um movimento de Entrada). */
export function adicionarStock(db: Inventario, d: { sku: string; wh: string; loc: string; min: number; max: number; rop: number; qty: number; cost: number | null }): void {
  exigir("inventory.manage");
  const p = produto(db, d.sku);
  if (!p) falhar("Escolha um produto válido.");
  if (p.kit) falhar("Pacotes não têm stock próprio: são expandidos nos componentes.");
  if (linhaStock(db, d.sku, d.wh)) falhar("Já existe uma linha para este produto neste armazém.");
  if (!ehInteiro(d.qty) || d.qty < 0) falhar("Quantidade inteira ≥ 0.");
  const r = linhaStock(db, d.sku, d.wh, true);
  if (r) Object.assign(r, { loc: d.loc, min: d.min, max: d.max, rop: d.rop });
  if (d.qty > 0) aplicarMovimentos(db, [{ type: "in", sku: d.sku, wh: d.wh, qty: d.qty, doc: "Stock inicial", note: "Adicionar stock", cost: d.cost }]);
}

/** Edição na própria célula (setStockField do mockup): localização, mínimo, máximo ou ponto de encomenda; a quantidade nunca. */
export function definirCampoStock(db: Inventario, id: string, k: "loc" | "min" | "max" | "rop" | "qty", valor: string): void {
  exigir("inventory.manage", "editar stock");
  const r = db.stocks.find((x) => x.id === id);
  if (!r) return falhar("Linha de stock inexistente.");
  if (k === "qty") return falhar("A quantidade só muda por movimentos: use “Registar ajuste”.");
  if (k === "loc") { r.loc = valor.trim(); return; }
  if (valor.trim() === "") falhar("Inteiro ≥ 0.");
  const v = Number(valor);
  if (!ehInteiro(v) || v < 0) falhar("Inteiro ≥ 0.");
  const t = { ...r, [k]: v };
  if (t.max && t.min > t.max) falhar("O mínimo não pode ser maior que o máximo.");
  r[k] = v;
}
