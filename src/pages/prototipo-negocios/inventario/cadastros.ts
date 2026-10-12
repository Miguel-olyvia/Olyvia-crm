// Os cadastros do Inventário: armazéns (e as definições), fornecedores, artigos e preços, e o catálogo do portal. Regras portadas do mockup. Sem React.
import { agora, armazem, ehInteiro, exigir, exigirMotivo, falhar, fornecedor, produto, produtoObrigatorio, proximoId, utilizadorAtual } from "./base";
import { ecEstado, reservadoEm } from "./ec";
import { poOpen } from "./po";
import type { Armazem, Inventario } from "./tipos";

const CP_GEO: Record<string, [number, number]> = {
  "1": [38.72, -9.14], "2": [38.8, -9.18], "3": [40.2, -8.41], "4": [41.15, -8.61], "5": [41.3, -7.74], "6": [39.82, -7.49], "7": [38.57, -7.91], "8": [37.02, -7.93], "9": [32.65, -16.91],
};
/** As coordenadas (de exemplo) a partir do código postal; sem código válido, nada. */
export function cpGeo(cp: string): [number, number] | null {
  if (!/^\d{4}-\d{3}$/.test(cp || "")) return null;
  const b = CP_GEO[cp[0]];
  const d = Number(cp.slice(1, 4)) / 4000;
  return [Math.round((b[0] + d) * 1000) / 1000, Math.round((b[1] - d) * 1000) / 1000];
}
const emailOk = (e: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());

export type DadosArmazem = Pick<Armazem, "name" | "code" | "addr" | "cp" | "city" | "manager" | "phone" | "email" | "cap" | "active" | "serves">;

/** Valida o formulário de um armazém: devolve os erros por campo (vazio = válido). */
export function erosArmazem(db: Inventario, d: DadosArmazem, id: string | null): Partial<Record<"name" | "code" | "cp" | "email", string>> {
  const e: Partial<Record<"name" | "code" | "cp" | "email", string>> = {};
  if (!d.name.trim()) e.name = "Obrigatório.";
  if (!d.code.trim()) e.code = "Obrigatório.";
  else if (db.warehouses.some((w) => w.code.toLowerCase() === d.code.trim().toLowerCase() && w.id !== id)) e.code = "Código já usado.";
  if (d.cp && !/^\d{4}-\d{3}$/.test(d.cp)) e.cp = "Formato 0000-000.";
  if (d.email && !emailOk(d.email)) e.email = "Email inválido.";
  return e;
}

/** Grava (ou cria) um armazém; o armazém por defeito tem de continuar ativo e a servir clientes. */
export function guardarArmazem(db: Inventario, d: DadosArmazem, id: string | null): Armazem {
  exigir("inventory.manage");
  const e = Object.values(erosArmazem(db, d, id))[0];
  if (e) falhar(e);
  if (id && db.settings.defaultWh === id && (!d.active || !d.serves)) falhar("É o armazém por defeito: tem de estar ativo e servir clientes.");
  const geo = cpGeo(d.cp);
  const f = { ...d, name: d.name.trim(), code: d.code.trim(), lat: geo ? geo[0] : null, lng: geo ? geo[1] : null };
  const w0 = id ? armazem(db, id) : undefined;
  if (w0) { Object.assign(w0, f); return w0; }
  const w: Armazem = { id: proximoId(db, "W"), deleted: false, ...f };
  db.warehouses.push(w);
  return w;
}

/** Desligar um armazém (ativo/serve clientes) respeita o por defeito e as encomendas clientes a expedir daí. */
export function alternarArmazem(db: Inventario, id: string, k: "active" | "serves", v: boolean): void {
  exigir("inventory.manage", "editar armazéns");
  const w = armazem(db, id);
  if (!w) return falhar("Armazém inexistente.");
  if (!v && db.settings.defaultWh === id) falhar("É o armazém por defeito: escolha outro nas Definições primeiro.");
  if (!v && db.ecs.some((e) => !e.deleted && e.wh === id && ecEstado(db, e) !== "full")) falhar("Há encomendas clientes a expedir daqui: mude-lhes o armazém de expedição primeiro.");
  w[k] = v;
}

/** Edição de um campo do cartão do armazém (setWhField do mockup): cada campo tem a sua regra e a sua mensagem. */
export function definirCampoArmazem(db: Inventario, id: string, k: keyof DadosArmazem, valor: string | boolean): void {
  exigir("inventory.manage", "editar armazéns");
  const w = armazem(db, id);
  if (!w) return falhar("Armazém inexistente.");
  const v = typeof valor === "string" ? valor.trim() : valor;
  if (k === "name" && !v) falhar("Nome obrigatório.");
  if (k === "code") {
    if (!v) falhar("Código obrigatório.");
    if (db.warehouses.some((x) => x.id !== id && x.code.toLowerCase() === String(v).toLowerCase())) falhar("Código já usado.");
  }
  if (k === "cp") {
    if (v && !/^d{4}-d{3}$/.test(String(v))) falhar("Código postal no formato 0000-000.");
    const g = cpGeo(String(v));
    w.lat = g ? g[0] : null;
    w.lng = g ? g[1] : null;
  }
  if (k === "email" && v && !emailOk(String(v))) falhar("Email inválido.");
  if ((k === "active" || k === "serves") && !v) alternarArmazem(db, id, k, false);
  (w as unknown as Record<string, string | boolean>)[k] = v;
}

/** Eliminar só é possível sem stock, sem ser o por defeito e sem encomendas clientes a expedir daí. */
export function eliminarArmazem(db: Inventario, id: string): void {
  exigir("inventory.manage");
  const w = armazem(db, id);
  if (!w) return falhar("Armazém inexistente.");
  if (db.settings.defaultWh === id) falhar("É o armazém por defeito.");
  if (db.stocks.some((s) => s.wh === id && !s.deleted && s.qty !== 0)) falhar("Tem stock: transfira-o primeiro.");
  if (db.ecs.some((e) => !e.deleted && e.wh === id && ecEstado(db, e) !== "full")) falhar("Há encomendas clientes a expedir daqui.");
  w.deleted = true;
  w.active = false;
}
export function restaurarArmazem(db: Inventario, id: string): void {
  exigir("inventory.manage");
  const w = armazem(db, id);
  if (w) w.deleted = false;
}
export function definirArmazemPorDefeito(db: Inventario, id: string): void {
  const w = armazem(db, id);
  if (!w || !w.active || !w.serves || w.deleted) falhar("O armazém por defeito tem de estar ativo e servir clientes.");
  db.settings.defaultWh = id;
}

/** Ativar ou desativar um fornecedor. */
export function definirFornecedorAtivo(db: Inventario, id: string, v: boolean): void {
  exigir("suppliers.manage");
  const s = fornecedor(db, id);
  if (!s) return falhar("Fornecedor inexistente.");
  s.active = v;
}
export function eliminarFornecedor(db: Inventario, id: string): void {
  exigir("suppliers.manage");
  const s = fornecedor(db, id);
  if (!s) return falhar("Fornecedor inexistente.");
  if (db.pos.some((p) => p.sup === id && poOpen(p))) falhar("Tem encomendas em aberto: receba-as ou anule o resto primeiro.");
  s.deleted = true;
  if (s.portal === "active") s.portal = "revoked";
}
export function restaurarFornecedor(db: Inventario, id: string): void {
  exigir("suppliers.manage");
  const s = fornecedor(db, id);
  if (s) s.deleted = false;
}

/** Marca um artigo como o preferido do produto (os outros deixam de o ser) e atualiza o custo do produto. */
export function definirPreferido(db: Inventario, itemId: string): void {
  exigir("suppliers.manage");
  const i = db.items.find((x) => x.id === itemId);
  if (!i) return falhar("Artigo inexistente.");
  for (const x of db.items) if (x.sku === i.sku) x.pref = false;
  i.pref = true;
  produtoObrigatorio(db, i.sku).cost = i.price / i.packN;
}

export interface DadosArtigo { sku: string; ref: string; packN: number; unitLabel: string; price: number | null; moq: number; lead: number }
/** Acrescenta um artigo ao fornecedor (o primeiro de um produto fica como preferido). */
export function adicionarArtigo(db: Inventario, supId: string, d: DadosArtigo): void {
  exigir("suppliers.manage");
  const s = fornecedor(db, supId);
  if (!s) return falhar("Fornecedor inexistente.");
  if (!produto(db, d.sku)) falhar("Escolha um produto válido.");
  const ref = d.ref.trim();
  if (!ref) falhar("Indique a referência do fornecedor.");
  if (!ehInteiro(d.packN) || d.packN < 1) falhar("Unidades por embalagem: inteiro ≥ 1.");
  if (d.price == null || Number.isNaN(d.price) || d.price < 0) falhar("Indique o preço.");
  if (db.items.some((i) => i.sup === supId && i.ref.toLowerCase() === ref.toLowerCase())) falhar("Referência já existe neste fornecedor.");
  const temPref = db.items.some((i) => i.sku === d.sku && i.pref);
  db.items.push({ id: proximoId(db, "I"), sup: supId, sku: d.sku, ref, packN: d.packN, unitLabel: d.unitLabel || "Unidade", price: d.price, pref: !temPref, moq: d.moq || 1, lead: d.lead || s.sla });
}
/** Remover um artigo falha com encomendas em aberto; o item do catálogo volta a "por ligar". */
export function removerArtigo(db: Inventario, itemId: string): void {
  exigir("suppliers.manage");
  const i = db.items.find((x) => x.id === itemId);
  if (!i) return falhar("Artigo inexistente.");
  if (db.pos.some((p) => poOpen(p) && p.lines.some((l) => l.itemId === itemId))) falhar("Há encomendas em aberto com este artigo: receba-as ou anule o resto primeiro.");
  db.items = db.items.filter((x) => x.id !== itemId);
  const c = db.catalog.find((x) => x.sup === i.sup && x.ref === i.ref);
  if (c) { c.state = "unlinked"; c.link = null; }
}

/** Decide uma alteração de preço submetida no portal: aceitar atualiza o artigo (e o custo se for o preferido). */
export function decidirPreco(db: Inventario, id: string, aceitar: boolean, nota = ""): void {
  exigir("products.manage_prices", "decidir preços");
  const c = db.prices.find((x) => x.id === id);
  if (!c || c.state !== "pending") falhar("Alteração já decidida.");
  if (aceitar) {
    const it = db.items.find((i) => i.id === c.itemId);
    if (!it) return falhar("Artigo inexistente.");
    c.state = "accepted";
    it.history = [...(it.history ?? []), { at: agora(db), from: it.price, to: c.nw }];
    it.price = c.nw;
    if (it.pref) produtoObrigatorio(db, it.sku).cost = c.nw / it.packN;
  } else {
    c.state = "rejected";
    c.note = nota;
  }
  c.decidedAt = agora(db);
  c.by = utilizadorAtual();
}

/** Liga um artigo do catálogo do portal a um produto (cria o artigo do fornecedor). */
export function ligarCatalogo(db: Inventario, cid: string, sku: string): void {
  exigir("suppliers.manage", "ligar artigos");
  const c = db.catalog.find((x) => x.id === cid);
  if (!c) return;
  if (!produto(db, sku)) falhar("Produto inexistente.");
  if (db.items.some((i) => i.sup === c.sup && i.ref === c.ref)) falhar("Esta referência já está ligada.");
  const temPref = db.items.some((i) => i.sku === sku && i.pref);
  db.items.push({ id: proximoId(db, "I"), sup: c.sup, sku, ref: c.ref, packN: c.packN, unitLabel: c.unitLabel, price: c.price, pref: !temPref, moq: 1, lead: fornecedor(db, c.sup)?.sla ?? 5 });
  c.state = "linked";
  c.link = sku;
}
export function desligarCatalogo(db: Inventario, cid: string): void {
  exigir("suppliers.manage", "desligar artigos");
  const c = db.catalog.find((x) => x.id === cid);
  if (!c) return;
  const idx = db.items.findIndex((x) => x.sup === c.sup && x.ref === c.ref);
  if (idx >= 0) {
    const it = db.items[idx];
    if (it.pref && db.pos.some((p) => poOpen(p) && p.lines.some((l) => l.itemId === it.id))) falhar("Artigo preferido com encomendas em aberto. Escolha outro preferido primeiro.");
    db.items.splice(idx, 1);
  }
  c.state = "unlinked";
  c.link = null;
}
export function dispensarCatalogo(db: Inventario, cid: string): void {
  const c = db.catalog.find((x) => x.id === cid);
  if (c) c.state = "dismissed";
}

/** Eliminar uma linha de stock só com quantidade 0 e sem reservas de encomendas. */
export function eliminarLinhaStock(db: Inventario, id: string): void {
  const r = db.stocks.find((x) => x.id === id);
  if (!r) return falhar("Linha de stock inexistente.");
  if (r.qty !== 0) falhar(`Tem ${r.qty} un. Registe um ajuste ou transferência para zero antes de eliminar.`);
  if (reservadoEm(db, r.sku, r.wh)) falhar("Tem reservas de encomendas.");
  r.deleted = true;
}
export function restaurarLinhaStock(db: Inventario, id: string): void {
  const r = db.stocks.find((x) => x.id === id);
  if (!r) return falhar("Linha de stock inexistente.");
  if (db.stocks.some((x) => x.sku === r.sku && x.wh === r.wh && !x.deleted)) falhar("Já existe uma linha ativa para este produto e armazém.");
  r.deleted = false;
}
/** Cancelar um pedido de transferência pendente (a EC continua a precisar do material). */
export function cancelarPedidoTransf(db: Inventario, id: string, motivo: string): void {
  const t = db.transfers.find((x) => x.id === id);
  if (!t || t.state !== "pending") falhar("Pedido já tratado.");
  exigirMotivo(motivo);
  t.state = "cancelled";
  t.reason = motivo;
}
