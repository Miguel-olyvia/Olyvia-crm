// Ajudas dos testes do Inventário: uma base de exemplo fresca com o relógio fixo, e uma forma de ver a mensagem de uma regra que recusa.
import { ErroInv } from "./base";
import { criarSeed } from "./seed";
import type { Inventario } from "./tipos";

/** A seed do mockup, com o relógio parado às 10:00 de hoje (09/10/2026). */
export function fresca(): Inventario {
  const db = criarSeed();
  db.relogio = "2026-10-09T10:00";
  return db;
}

/** A mensagem com que a regra recusa; falha se a ação passar ou se falhar por outro motivo que não uma regra do negócio. */
export function recusa(fn: () => unknown): string {
  try { fn(); } catch (e) {
    if (e instanceof ErroInv) return e.message;
    throw e;
  }
  throw new Error("A regra devia ter recusado e deixou passar.");
}
