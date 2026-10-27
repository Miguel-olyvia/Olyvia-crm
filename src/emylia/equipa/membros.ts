// 23/10/2026: a equipa real da organização ativa (os membros da base nova), para a Agenda (RH › Agenda e o Hoje) e para o "Quem vai"
// das visitas. Antes a agenda só mostrava as pessoas de exemplo do RH (a Marta, o Filipe, os seis técnicos): numa conta real ninguém
// se via lá. Quem lê a base é a moldura (PrototipoNegocios, equipaRealBase.ts); aqui só se guarda o que veio, sem Supabase (os ecrãs da
// equipa não o importam). Sem conta (os testes e o protótipo só neste browser), `null`: a agenda usa as pessoas de exemplo.
import { useSyncExternalStore } from "react";
import type { Papel } from "../motor";

/** Um membro ativo da organização, como a Agenda o precisa: o nome, o papel (o do protótipo e o nome da base) e o técnico do V1. */
export interface MembroAgenda {
  /** `membros.id`. */
  id: string;
  nome: string;
  /** O papel no protótipo (os de administração contam como a Direção; um papel criado pela empresa, como o Comercial). */
  papel: Papel;
  /** O nome do papel na base ("Direção", "Técnico"...). */
  papelNome: string;
  /** O técnico de obra (S.tecnicos[].id) ligado a este membro (`membros.ref_v1`). */
  ref: string | null;
}

export interface EquipaReal {
  /** A leitura ainda não chegou: a agenda mostra "A carregar". */
  carregando: boolean;
  /** O membro de quem entrou (`membros.id`); null quando não é membro (ex.: o super admin). */
  eu: string | null;
  /** O papel de quem entrou, no protótipo. */
  papelEu: Papel;
  membros: MembroAgenda[];
}

let atual: EquipaReal | null = null;
let recarregar: (() => void) | null = null;
const ouvintes = new Set<() => void>();

export function lerEquipaReal(): EquipaReal | null { return atual; }
/** Muda a equipa real (null: sem conta). Sem mudança, não avisa ninguém. */
export function definirEquipaReal(e: EquipaReal | null): void {
  if (JSON.stringify(e) === JSON.stringify(atual)) return;
  atual = e;
  for (const f of ouvintes) f();
}
export function subscreverEquipaReal(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
export function useEquipaReal(): EquipaReal | null {
  return useSyncExternalStore(subscreverEquipaReal, lerEquipaReal, lerEquipaReal);
}
/** Quem lê a base regista aqui como voltar a ler (ex.: depois de ligar um técnico em Utilizadores). */
export function registarRecarga(f: (() => void) | null): void { recarregar = f; }
export function recarregarEquipaReal(): void { recarregar?.(); }

/** Há equipa real com gente: a agenda é a dos membros (senão, a de exemplo). */
export const comEquipaReal = (e: EquipaReal | null): e is EquipaReal => !!e && e.membros.length > 0;

/** O "Quem vai" de uma visita: "Nome (papel)". */
export const quemVai = (m: Pick<MembroAgenda, "nome" | "papelNome">): string => `${m.nome} (${m.papelNome.toLowerCase()})`;
/** O "Quem vai" de quem não escolheu ninguém, até 23/10 sempre o Rúben de exemplo. */
export const QUEM_VAI_EXEMPLO = "Rúben (comercial)";
/** 23/10: na agenda com a equipa real, as visitas sem "Quem vai" ficam numa linha à parte em vez de irem para o Rúben de exemplo. */
export const QUEM_POR_ATRIBUIR = "Por atribuir (visitas sem pessoa)";

/** As escolhas do "Quem vai" das visitas: os membros da equipa real (o de quem entrou primeiro); sem equipa real, null (as de exemplo). */
export function opcoesQuemVai(e: EquipaReal | null = atual): string[] | null {
  if (!comEquipaReal(e)) return null;
  const eu = e.membros.find((m) => m.id === e.eu);
  return [...new Set([...(eu ? [quemVai(eu)] : []), ...e.membros.map(quemVai)])];
}
/** Quem vai a uma visita nova: quem a marca (com a equipa real), senão o Rúben de exemplo. */
export function quemVaiPorOmissao(e: EquipaReal | null = atual): string {
  const eu = comEquipaReal(e) ? e.membros.find((m) => m.id === e.eu) : undefined;
  return eu ? quemVai(eu) : QUEM_VAI_EXEMPLO;
}
