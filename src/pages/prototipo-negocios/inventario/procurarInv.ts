// A pesquisa da caixa global do topo (gSearch do mockup): PO, EC, produto, SKU, EAN, fornecedor e guia. Cada resultado diz o ecrã e o detalhe a abrir.
import { nomeForn } from "./base";
import type { Destino, Detalhe } from "./ctxInv";
import { origemTexto } from "./ec";
import { poStatus, poStatusLabel } from "./po";
import { totalQty } from "./stock";
import type { Inventario } from "./tipos";

export interface Resultado { tipo: string; titulo: string; sub: string; destino: Destino; detalhe?: Detalhe }

/** Os resultados (no máximo 10) para o texto escrito; vazio quando não há texto. */
export function procurar(db: Inventario, texto: string): Resultado[] {
  const v = texto.trim().toLowerCase();
  if (!v) return [];
  const tem = (...c: (string | null | undefined)[]): boolean => c.filter(Boolean).join(" ").toLowerCase().includes(v);
  const r: Resultado[] = [];
  for (const p of db.pos.filter((x) => !x.deleted)) if (tem(p.id, nomeForn(db, p.sup), p.origin.ref, p.origin.client, ...p.lines.map((l) => l.sku))) r.push({ tipo: "Encomenda a fornecedor", titulo: p.id, sub: `${nomeForn(db, p.sup)} · ${poStatusLabel[poStatus(p)]}`, destino: { aba: "po" }, detalhe: { t: "po", id: p.id } });
  for (const e of db.ecs.filter((x) => !x.deleted)) if (tem(e.id, e.client, e.origin.ref)) r.push({ tipo: "Encomenda Cliente", titulo: e.id, sub: `${e.client} · ${origemTexto(e)}`, destino: { aba: "ec" }, detalhe: { t: "ec", id: e.id } });
  for (const p of db.products.filter((x) => !x.deleted)) if (tem(p.sku, p.ean, p.name, ...p.codes)) r.push({ tipo: "Produto", titulo: p.name, sub: `${p.sku} · EAN ${p.ean} · ${totalQty(db, p.sku)} un`, destino: { aba: "stock", f: { q: p.sku } } });
  for (const s of db.suppliers.filter((x) => !x.deleted)) if (tem(s.name, s.code, s.nif, s.city)) r.push({ tipo: "Fornecedor", titulo: s.name, sub: `${s.code} · ${s.city}`, destino: { aba: "sup" }, detalhe: { t: "sup", id: s.id } });
  for (const g of db.guias) if (tem(g.id, nomeForn(db, g.sup))) r.push({ tipo: "Guia", titulo: g.id, sub: nomeForn(db, g.sup), destino: { aba: "guia" }, detalhe: { t: "guia", id: g.id } });
  return r.slice(0, 10);
}
