// CRM (28/10/2026): a agenda e a equipa da Emylia numa organização real. Antes a agenda do Hoje e da RH › Agenda mostravam as pessoas e as
// ausências de exemplo (a equipa real nunca era definida e as ausências vinham da loja de exemplo do RH).
// · As ausências aprovadas de cada técnico vêm da rh_agenda_tecnicos (pessoas_ausencias_dias, migration 20261231999000): entram no plano da
//   obra (definirAusenciasRh: um técnico ausente conta como conflito) e na agenda (rhDaAgenda.ts).
// · A equipa da agenda: os técnicos do RH (o técnico é a própria pessoa do RH) e quem entrou, com o papel do "A ver como".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Papel } from "../motor";
import { definirAusenciasRh, type FichaTecnico } from "../equipa/tecnicos";
import { definirRhDaAgenda, TIPO_AUSENCIA_REAL, type PessoaAgendaRh } from "../equipa/rhDaAgenda";
import type { EquipaReal, MembroAgenda } from "../equipa/membros";

/** O nome de cada papel na agenda ("Comercial", "Técnico"…). */
export const NOME_PAPEL: Record<Papel, string> = {
  comercial: "Comercial", direcao: "Direção", financeiro: "Financeiro", armazem: "Armazém", operacoes: "Operações", juridico: "Jurídico", tecnico: "Técnico",
};

/** A janela que se lê (a função aceita até 400 dias): um mês para trás e um ano para a frente. */
export function janelaAgenda(hoje: Date): { de: string; ate: string } {
  const d = (n: number) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return { de: d(-30), ate: d(365) };
}

interface LinhaAgendaRh { pessoa_id: string; nome: string | null; indisponivel?: { data: string }[] | null }

/** As pessoas da rh_agenda_tecnicos, com os dias de ausência aprovada. */
export const pessoasDaAgenda = (linhas: readonly LinhaAgendaRh[]): PessoaAgendaRh[] =>
  linhas.map((l) => ({ id: l.pessoa_id, nome: l.nome ?? "", ausencias: [...new Set((l.indisponivel ?? []).map((x) => String(x.data).slice(0, 10)))].sort() }));

/** Põe as ausências no plano e na agenda. */
export function aplicarAgenda(pessoas: readonly PessoaAgendaRh[]): void {
  definirAusenciasRh(Object.fromEntries(pessoas.map((p) => [p.id, Object.fromEntries(p.ausencias.map((d) => [d, TIPO_AUSENCIA_REAL.nome]))])));
  definirRhDaAgenda(pessoas);
}

/** Lê e aplica. Sem a função ou sem permissão, a agenda fica sem ausências (nunca com as de exemplo) e devolve o motivo. */
export async function carregarAgendaReal(sb: SupabaseClient, org: string, hoje = new Date()): Promise<{ pessoas: PessoaAgendaRh[]; erro: string | null }> {
  const { de, ate } = janelaAgenda(hoje);
  const { data, error } = await sb.rpc("rh_agenda_tecnicos" as never, { p_org: org, p_de: de, p_ate: ate } as never);
  if (error) { aplicarAgenda([]); return { pessoas: [], erro: error.message || "Não foi possível ler a agenda do RH." }; }
  const pessoas = pessoasDaAgenda((data as LinhaAgendaRh[] | null) ?? []);
  aplicarAgenda(pessoas);
  return { pessoas, erro: null };
}

/** Quem entrou: a pessoa do RH ligada à conta (pessoas_contas), se houver, e o nome a mostrar. */
export interface QuemEntrou { pessoaId: string | null; nome: string }

/**
 * A equipa da agenda: os técnicos do RH e quem entrou. Se quem entrou é um técnico, é esse membro; senão, entra como membro com o papel do
 * "A ver como" (a agenda dele são as visitas com o nome dele).
 */
export function equipaReal(tecnicos: readonly FichaTecnico[], eu: QuemEntrou | null, papel: Papel): EquipaReal {
  const membros: MembroAgenda[] = tecnicos.map((t) => ({ id: t.id, nome: t.n, papel: "tecnico", papelNome: NOME_PAPEL.tecnico, ref: t.id }));
  let euId: string | null = null;
  if (eu) {
    const tec = eu.pessoaId ? membros.find((m) => m.id === eu.pessoaId) : undefined;
    if (tec) euId = tec.id;
    else {
      euId = eu.pessoaId ?? "conta";
      membros.unshift({ id: euId, nome: eu.nome, papel, papelNome: NOME_PAPEL[papel], ref: null });
    }
  }
  return { carregando: false, eu: euId, papelEu: papel, membros };
}

/** O técnico fixo do Hoje do técnico: só quando quem entrou é um técnico do RH (os outros podem ver como qualquer técnico). */
export const tecnicoDaConta = (tecnicos: readonly FichaTecnico[], eu: QuemEntrou | null): string | null =>
  eu?.pessoaId && tecnicos.some((t) => t.id === eu.pessoaId) ? eu.pessoaId : null;
