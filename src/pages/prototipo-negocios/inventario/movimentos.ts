// "Registar movimento": entrada, saída (a partir de uma EC ou avulsa), transferência, ajuste, devolução e quebra, com resultado parcial por linha. Portado do mockup.
import { ErroInv, ecPorId, ehInteiro, falhar, fornecedor, nomeArm, nomeForn, produto } from "./base";
import { ecLinhaInfo, executarPedidoTransf, reservadoEm, reservas, sairLinha } from "./ec";
import { aplicarMovimentos, qtyAt, transferir } from "./stock";
import type { Inventario } from "./tipos";

export type TipoRegisto = "in" | "out" | "transfer" | "adjust" | "ret" | "loss";
export const TIPOS_REGISTO: readonly { id: TipoRegisto; nome: string; desc: string }[] = [
  { id: "in", nome: "Entrada", desc: "Mercadoria que chega sem PO (compra ao balcão, oferta, devolução de cliente). Pode indicar fornecedor e custo." },
  { id: "out", nome: "Saída", desc: "Material que sai para cliente ou obra. Pode partir de uma Encomenda Cliente (preenche as linhas)." },
  { id: "transfer", nome: "Transferência", desc: "Entre armazéns: regista duas pernas (saída na origem, entrada no destino). Pode cumprir um pedido." },
  { id: "adjust", nome: "Ajuste", desc: "Corrige o stock para mais ou para menos. Motivo obrigatório; fica no livro." },
  { id: "ret", nome: "Devolução a fornecedor", desc: "Material devolvido ao fornecedor (defeito, erro de envio)." },
  { id: "loss", nome: "Quebra/perda", desc: "Material danificado, perdido ou fora de validade. Motivo obrigatório." },
];
export const MOTIVOS_AJUSTE = ["Contagem", "Erro de registo", "Material encontrado", "Outro"];
export const MOTIVOS_QUEBRA = ["Dano", "Perda", "Validade", "Roubo", "Outro"];

export interface LinhaRegisto { sku: string; qty: number; cost?: number | null }
export interface PedidoRegisto {
  type: TipoRegisto; wh: string; from: string; to: string; tr?: string; ec?: string; sign?: "+" | "-"; reason?: string; note?: string; supplier?: string; doc?: string; lines: LinhaRegisto[];
}
export interface ResultadoRegisto { ok: number[]; failed: { i: number; msg: string }[] }

const notaFornecedor = (db: Inventario, d: PedidoRegisto, prefixo: string): string => [d.supplier ? prefixo + nomeForn(db, d.supplier) : "", d.note ?? ""].filter(Boolean).join(" · ");

/** Uma linha do registo: devolve nada ou lança ErroInv (a linha falha sem bloquear as outras). */
function registarLinha(db: Inventario, d: PedidoRegisto, l: LinhaRegisto): void {
  if (!l.sku || !produto(db, l.sku)) falhar("Escolha um produto.");
  const q = Number(l.qty);
  if (!ehInteiro(q) || q <= 0) falhar("Quantidade inteira maior que zero.");
  const doc = d.doc ?? "";
  if (d.type === "in") aplicarMovimentos(db, [{ type: "in", sku: l.sku, wh: d.wh, qty: q, doc, note: notaFornecedor(db, d, "Fornecedor "), cost: l.cost === undefined || l.cost === null ? null : l.cost }]);
  else if (d.type === "out") saidaLinha(db, d, l.sku, q);
  else if (d.type === "transfer") transferirLinha(db, d, l.sku, q);
  else if (d.type === "adjust") aplicarMovimentos(db, [{ type: d.sign === "-" ? "adjm" : "adjp", sku: l.sku, wh: d.wh, qty: q, doc, note: (d.reason ?? "") + (d.note ? " · " + d.note : "") }]);
  else if (d.type === "ret") aplicarMovimentos(db, [{ type: "ret", sku: l.sku, wh: d.wh, qty: q, doc, note: notaFornecedor(db, d, "Para ") }]);
  else aplicarMovimentos(db, [{ type: "loss", sku: l.sku, wh: d.wh, qty: q, doc, note: (d.reason ?? "") + (d.note ? " · " + d.note : "") }]);
}

function saidaLinha(db: Inventario, d: PedidoRegisto, sku: string, q: number): void {
  if (!d.ec) { aplicarMovimentos(db, [{ type: "out", sku, wh: d.wh, qty: q, doc: d.doc ?? "", note: d.note ?? "" }]); return; }
  const e = ecPorId(db, d.ec);
  const el = e?.lines.find((x) => x.sku === sku && x.served < x.qty);
  if (!e || !el) return falhar(`Linha já servida em ${d.ec}.`);
  sairLinha(db, e, el, q, d.wh);
}

function transferirLinha(db: Inventario, d: PedidoRegisto, sku: string, q: number): void {
  const t = d.tr ? db.transfers.find((x) => x.id === d.tr) : undefined;
  if (t && t.sku === sku && t.qty === q && t.from === d.from && t.to === d.to) { executarPedidoTransf(db, t); return; }
  transferir(db, sku, d.from, d.to, q, { note: d.note });
}

/** Regista as linhas uma a uma: as que falham ficam de fora com a mensagem, as outras entram no livro. */
export function registarMovimento(db: Inventario, d: PedidoRegisto): ResultadoRegisto {
  if (["adjust", "loss"].includes(d.type) && !d.reason) falhar("Motivo obrigatório em " + (d.type === "adjust" ? "ajustes" : "quebras") + ".");
  if (d.type === "ret" && !d.supplier) falhar("Indique o fornecedor da devolução.");
  if (d.type === "ret" && !fornecedor(db, d.supplier ?? "")) falhar("Fornecedor inexistente.");
  if (d.type === "transfer" && d.from === d.to) falhar("Origem e destino têm de ser diferentes.");
  const ok: number[] = [], failed: { i: number; msg: string }[] = [];
  d.lines.forEach((l, i) => {
    try { registarLinha(db, d, l); ok.push(i); } catch (err) { if (!(err instanceof ErroInv)) throw err; failed.push({ i, msg: err.message }); }
  });
  return { ok, failed };
}

/** Quantas unidades de uma linha de EC estão prontas a sair (preenche o registo de uma saída). */
export function prontoDaLinha(db: Inventario, ecId: string, sku: string): number {
  const e = ecPorId(db, ecId);
  const l = e?.lines.find((x) => x.sku === sku);
  return e && l ? ecLinhaInfo(db, e, l).ready : 0;
}

export interface AvisoLinha { tom: "bad" | "warn"; msg: string }
interface ContextoAviso { type: TipoRegisto; wh: string; from: string; ec?: string; sign?: "+" | "-" }
const SAI = (c: ContextoAviso): boolean => ["out", "ret", "loss", "transfer"].includes(c.type) || (c.type === "adjust" && c.sign === "-");

/** Os avisos de uma linha enquanto se preenche (o que vai falhar e o que consome stock reservado), como no mockup. */
export function avisosLinha(db: Inventario, c: ContextoAviso, linhas: { sku: string; qty: number | "" }[], i: number): AvisoLinha[] {
  const l = linhas[i];
  if (!l.sku) return [];
  const p = produto(db, l.sku);
  if (!p) return [{ tom: "bad", msg: "Produto não reconhecido. Escolha da lista." }];
  if (p.kit) return [{ tom: "bad", msg: "Pacote: registe os componentes (o pacote não tem stock)." }];
  const w: AvisoLinha[] = [];
  if (linhas.some((x, j) => j !== i && x.sku === l.sku)) w.push({ tom: "warn", msg: "Produto repetido noutra linha." });
  const q = Number(l.qty);
  if (l.qty !== "" && (!ehInteiro(q) || q <= 0)) w.push({ tom: "bad", msg: "Quantidade inteira maior que zero." });
  if (SAI(c)) w.push(...avisosSaida(db, c, l.sku, q));
  if (c.type === "out" && c.ec) {
    const el = ecPorId(db, c.ec)?.lines.find((x) => x.sku === l.sku);
    if (!el) w.push({ tom: "bad", msg: `Produto não existe em ${c.ec}.` });
    else if (el.served >= el.qty) w.push({ tom: "bad", msg: `Linha já servida em ${c.ec}.` });
  }
  return w;
}

function avisosSaida(db: Inventario, c: ContextoAviso, sku: string, q: number): AvisoLinha[] {
  const wh = c.type === "transfer" ? c.from : c.wh;
  const tem = qtyAt(db, sku, wh), res = reservadoEm(db, sku, wh), livre = tem - res;
  const por = (reservas(db).resBy[sku + "|" + wh] || []).join(", ");
  const out: AvisoLinha[] = [];
  if (q > tem) out.push({ tom: "bad", msg: `Saída abaixo de zero: só há ${tem} un em ${nomeArm(db, wh)}. Esta linha vai falhar.` });
  else if (q > Math.max(0, livre) && !(c.type === "out" && c.ec)) out.push({ tom: "warn", msg: `Consome stock reservado: livre ${Math.max(0, livre)}, reservado ${res} (${por}).` });
  if (c.type === "out" && !c.ec && res > 0) out.push({ tom: "warn", msg: `Saída sem EC num produto com reservas: pode retirar material destinado a ${por}.` });
  return out;
}
