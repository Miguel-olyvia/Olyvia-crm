// 9/11 (Rúben: «temos de ter técnicos isolados e técnicos associados a equipas (ou vem toda a equipa, ou não vem nenhum membro), e ter
// uma área onde podemos gerir isto»). As equipas de obra da organização: um nome e as pessoas do RH que vão sempre juntas. Quem não está em
// nenhuma equipa ativa é um técnico isolado. Vêm da base (neg_equipas_ler / neg_equipas_guardar, migration 20270112200000); sem a função
// na base (ainda por aplicar), ficam neste browser, para se poder mostrar já. O plano da obra lê-as aqui (preparacaoObra.ts).
import { useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface EquipaObra { id: string; nome: string; membros: string[]; ativa: boolean }

let equipas: EquipaObra[] = [];
let origem: "base" | "local" | null = null;
const ouvintes = new Set<() => void>();
const CHAVE = "olyvia.equipasObra.v1";
const avisar = () => ouvintes.forEach((o) => o());

export const lerEquipasObra = (): EquipaObra[] => equipas;
export const equipasAtivas = (): EquipaObra[] => equipas.filter((e) => e.ativa && e.membros.length);
export const origemEquipas = () => origem;
export const useEquipasObra = (): EquipaObra[] =>
  useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, lerEquipasObra, lerEquipasObra);

/** A equipa ativa de um técnico (null: isolado). */
export const equipaDe = (tec: string): EquipaObra | null => equipasAtivas().find((e) => e.membros.includes(tec)) ?? null;

export function definirEquipasObra(L: EquipaObra[], de: "base" | "local" = "base"): void {
  equipas = L.map((e) => ({ ...e, membros: [...new Set(e.membros)] }));
  origem = de;
  avisar();
}

const doLocal = (): EquipaObra[] => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? "[]"); } catch { return []; } };
const paraLocal = (L: EquipaObra[]) => { try { localStorage.setItem(CHAVE, JSON.stringify(L)); } catch { /* fica só em memória */ } };

/** Lê da base; sem a função (migration por aplicar), as deste browser. */
export async function carregarEquipasObra(sb: SupabaseClient, org: string): Promise<void> {
  const { data, error } = await sb.rpc("neg_equipas_ler" as never, { p_org: org } as never);
  if (error) { definirEquipasObra(doLocal(), "local"); return; }
  definirEquipasObra(((data as EquipaObra[] | null) ?? []).map((e) => ({ id: e.id, nome: e.nome, membros: e.membros ?? [], ativa: e.ativa !== false })), "base");
}

/** Grava a lista inteira. Uma pessoa só pode estar numa equipa ativa. Devolve o erro, se houver. */
export async function guardarEquipasObra(sb: SupabaseClient | null, org: string | null, L: EquipaObra[]): Promise<string | null> {
  const ativas = L.filter((e) => e.ativa);
  const repetidos = ativas.flatMap((e) => e.membros).filter((m, i, a) => a.indexOf(m) !== i);
  if (repetidos.length) return "Uma pessoa só pode estar numa equipa.";
  if (L.some((e) => !e.nome.trim())) return "Cada equipa precisa de nome.";
  if (sb && org && origem === "base") {
    const { data, error } = await sb.rpc("neg_equipas_guardar" as never, { p_org: org, p_equipas: L } as never);
    if (error) return error.message || "Não foi possível gravar as equipas.";
    definirEquipasObra(((data as EquipaObra[] | null) ?? []).map((e) => ({ id: e.id, nome: e.nome, membros: e.membros ?? [], ativa: e.ativa !== false })), "base");
    return null;
  }
  paraLocal(L);
  definirEquipasObra(L, "local");
  return null;
}
