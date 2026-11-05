// 4/11 (Rúben): no passo «Morada da obra», a morada que a lead já trazia (a da ficha da pessoa, anew_entity_addresses → anew_addresses,
// a principal ou a mais recente), para validar, editar ou escrever outra. Sem morada na ficha, a do pedido (negocios.morada_obra).
// Só lê: escolher a morada grava-a no negócio como qualquer outro campo (A.moradaLead).
import type { SupabaseClient } from "@supabase/supabase-js";
import { moradaDoTexto, type MoradaLead, type Negocio } from "../motor";

interface LinhaMorada {
  entity_id: string;
  is_primary: boolean | null;
  /** Fim da ligação (anew_entity_addresses.valid_to): preenchido = ligação fechada (a morada foi substituída). */
  valid_to?: string | null;
  anew_addresses: { street: string | null; number: string | null; floor: string | null; unit: string | null; postal_code: string | null; city: string | null } | null;
}

const limpo = (v: string | null | undefined) => (v ?? "").trim();

/** A morada de uma linha da ficha em partes; null se não tem rua. */
export function moradaDaFicha(a: LinhaMorada["anew_addresses"]): MoradaLead | null {
  if (!a || !limpo(a.street)) return null;
  return {
    morada: [limpo(a.street), limpo(a.number)].filter(Boolean).join(" "),
    cp: limpo(a.postal_code),
    localidade: limpo(a.city),
    fracao: [limpo(a.floor), limpo(a.unit)].filter(Boolean).join(" "),
    de: "ficha",
  };
}

/** As ligações de morada das pessoas, a principal primeiro. Lança se a leitura falhar. */
async function lerLinhas(sb: SupabaseClient, ids: readonly string[]): Promise<LinhaMorada[]> {
  const r = await sb.from("anew_entity_addresses")
    .select("entity_id, is_primary, valid_to, created_at, anew_addresses(street, number, floor, unit, postal_code, city)")
    .in("entity_id", ids)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
  if (r.error) throw r.error;
  return Array.isArray(r.data) ? (r.data as unknown as LinhaMorada[]) : [];
}

function primeiraPorPessoa(linhas: readonly LinhaMorada[]): Map<string, MoradaLead> {
  const fora = new Map<string, MoradaLead>();
  for (const linha of linhas) {
    if (linha.valid_to || fora.has(linha.entity_id)) continue; // uma ligação fechada já não é a morada da pessoa
    const m = moradaDaFicha(linha.anew_addresses);
    if (m) fora.set(linha.entity_id, m);
  }
  return fora;
}

/** A morada principal (ou a mais recente) de cada pessoa. Um erro a ler não para o Negócio: fica sem sugestões. */
export async function lerMoradasDasPessoas(sb: SupabaseClient, pessoas: readonly string[]): Promise<Map<string, MoradaLead>> {
  const ids = [...new Set(pessoas.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    return primeiraPorPessoa(await lerLinhas(sb, ids));
  } catch {
    return new Map();
  }
}

/** A morada atual de UMA pessoa, para o ecrã que a edita. Ao contrário da anterior, LANÇA se a leitura falhar: «não consegui ler» não é «sem morada». */
export async function lerMoradaDaEntidade(sb: SupabaseClient, entityId: string): Promise<MoradaLead | null> {
  return primeiraPorPessoa(await lerLinhas(sb, [entityId])).get(entityId) ?? null;
}

/** Põe a sugestão nos negócios com a morada da obra por preencher: a da ficha da pessoa ou, sem ela, a do pedido. */
export function sugerirMoradas(deals: Negocio[], pessoaDe: (d: Negocio) => string | undefined, daFicha: ReadonlyMap<string, MoradaLead>) {
  for (const d of deals) {
    if (d.f.morada?.trim()) { delete d.moradaLead; continue; }
    const pessoa = pessoaDe(d);
    const m = (pessoa ? daFicha.get(pessoa) : undefined) ?? moradaDoTexto(d.local);
    if (m) d.moradaLead = m; else delete d.moradaLead;
  }
}
