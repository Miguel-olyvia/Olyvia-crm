// O básico do motor do Inventário: o dia de hoje do exemplo, os formatos, os erros "de utilizador" e as pesquisas na base. Sem React.
import type { Armazem, Contagem, Ec, Fornecedor, Guia, Inventario, Po, Produto } from "./tipos";

/** Hoje, no exemplo: fixo, como no mockup (09/10/2026). */
export const HOJE = "2026-10-09";
export const UTILIZADOR = "Admin Demo";

/** Uma regra do negócio que recusa a ação: a mensagem é para mostrar a quem usa. */
export class ErroInv extends Error {}
export function falhar(msg: string): never { throw new ErroInv(msg); }
export const ehInteiro = (v: unknown): v is number => Number.isInteger(v);

export const pad = (n: number, l = 4): string => String(n).padStart(l, "0");
export function fmtD(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
export function fmtDS(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
export const fmtDT = (iso: string | null | undefined): string => (!iso ? "—" : fmtD(iso) + (iso.length > 10 ? " " + iso.slice(11, 16) : ""));
export function somarDias(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a: string, b: string): number =>
  Math.round((new Date(b.slice(0, 10) + "T12:00:00Z").getTime() - new Date(a.slice(0, 10) + "T12:00:00Z").getTime()) / 864e5);

const nf = new Intl.NumberFormat("pt-PT");
const nf2 = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const N = (n: number | null | undefined): string => nf.format(n || 0);
export const eur = (n: number | null | undefined): string => nf2.format(n || 0) + " €";
export const pct = (n: number): string => (Math.round(n * 10) / 10).toString().replace(".", ",") + " %";

/** A data e a hora de agora: o relógio fixo da base (seed e testes) ou, sem ele, a hora real no dia de hoje do exemplo. */
export function agora(db: Inventario): string {
  if (db.relogio) return db.relogio;
  const d = new Date();
  return `${HOJE}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export const produto = (db: Inventario, sku: string): Produto | undefined => db.products.find((p) => p.sku === sku);
export const armazem = (db: Inventario, id: string): Armazem | undefined => db.warehouses.find((w) => w.id === id);
export const fornecedor = (db: Inventario, id: string): Fornecedor | undefined => db.suppliers.find((s) => s.id === id);
export const poPorId = (db: Inventario, id: string): Po | undefined => db.pos.find((p) => p.id === id);
export const ecPorId = (db: Inventario, id: string): Ec | undefined => db.ecs.find((e) => e.id === id);
export const guiaPorId = (db: Inventario, id: string): Guia | undefined => db.guias.find((g) => g.id === id);
export const contagemPorId = (db: Inventario, id: string): Contagem | undefined => db.counts.find((c) => c.id === id);
export const nomeProd = (db: Inventario, sku: string): string => produto(db, sku)?.name ?? sku;
export const nomeArm = (db: Inventario, id: string): string => armazem(db, id)?.name ?? id;
export const nomeForn = (db: Inventario, id: string): string => fornecedor(db, id)?.name ?? id;

/** O produto que existe (ou falha com a mensagem do mockup). */
export function produtoObrigatorio(db: Inventario, sku: string): Produto {
  const p = produto(db, sku);
  if (!p) falhar("Produto desconhecido: " + sku);
  return p;
}

/** Um número novo para ids (movimentos, linhas...). */
export const proximoId = (db: Inventario, prefixo: string): string => prefixo + String(++db.seq);
/** Marca a base como mudada (invalida a reserva calculada). */
export function mudou(db: Inventario): void { db.v += 1; }

/** O motivo escrito: pelo menos 3 caracteres (a regra de todos os motivos do módulo). */
export function motivoValido(m: string | null | undefined): boolean { return !!m && m.trim().length >= 3; }
export function exigirMotivo(m: string | null | undefined, msg = "Motivo obrigatório (mínimo 3 caracteres)."): void { if (!motivoValido(m)) falhar(msg); }

/** Dígito de controlo do NIF (usado pelos fornecedores de exemplo). */
export function nifCompleto(base8: string): string {
  let s = 0;
  for (let i = 0; i < 8; i++) s += Number(base8[i]) * (9 - i);
  const m = s % 11;
  return base8 + (m < 2 ? 0 : 11 - m);
}
/** Um número de unidades com separador de milhares ("1 200 un"). */
export const un = (n: number): string => `${nf.format(n)} un`;
