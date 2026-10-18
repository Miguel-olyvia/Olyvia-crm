// As leads criadas com "Nova lead": vivem só em memória, neste módulo, e perdem-se ao recarregar a página. Um store
// pequeno (useSyncExternalStore, o padrão de `negocio-metas/negociosNovos.ts`) faz com que sobrevivam à navegação entre
// páginas: "Abrir pessoa" a partir de um negócio dessa pessoa (/pessoas?open=p-novo-1) ainda a encontra.
import { useSyncExternalStore } from "react";
import { montarLead, type DadosNovaLead, type LeadMontada } from "./novaLead";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";

export interface PessoasNovas {
  pessoas: readonly Pessoa[];
  /** A atividade com que nasceram, a mais recente primeiro. */
  atividade: readonly ItemAtividade[];
}

const NENHUMA: PessoasNovas = { pessoas: [], atividade: [] };

let estado: PessoasNovas = NENHUMA;
let sequencia = 0;
const ouvintes = new Set<() => void>();

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** As pessoas criadas até agora (o mesmo objeto até haver uma nova). */
export const pessoasNovas = (): PessoasNovas => estado;

/** Cria a lead, guarda-a e devolve-a com a atividade com que nasce. */
export function registarLead(dados: DadosNovaLead, hoje: string): LeadMontada {
  sequencia += 1;
  const lead = montarLead(dados, hoje, sequencia);
  estado = { pessoas: [...estado.pessoas, lead.pessoa], atividade: [...lead.atividade, ...estado.atividade] };
  ouvintes.forEach((ouvinte) => ouvinte());
  return lead;
}

/** Esquece tudo e recomeça a numeração (para os testes e para repor o exemplo). */
export function repor(): void {
  estado = NENHUMA;
  sequencia = 0;
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** As pessoas novas, atualizadas sempre que se cria uma. */
export const usePessoasNovas = (): PessoasNovas => useSyncExternalStore(subscrever, pessoasNovas, pessoasNovas);
