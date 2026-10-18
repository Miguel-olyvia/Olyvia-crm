// Os negócios criados com "Novo negócio": vivem só em memória, neste módulo, e perdem-se ao recarregar a página. Um
// store pequeno (useSyncExternalStore) deixa a página inteira (Quadro, Lista, resumo, painel, Dashboard) lê-los. A ficha
// de uma pessoa NÃO os lê (continua nos dados estáticos): ligar as duas é uma decisão por tomar.
import { useSyncExternalStore } from "react";
import { criarNegocioExemplo, type DadosCriarNegocio, type NegocioNovo } from "./novoNegocio";
import { ligarRegistosEscolhidos } from "./registosPessoa";

const SEM_NEGOCIOS: readonly NegocioNovo[] = [];

let negocios: readonly NegocioNovo[] = SEM_NEGOCIOS;
let sequencia = 0;
const ouvintes = new Set<() => void>();

const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** Os negócios criados até agora (a mesma lista até haver um novo, para o React não recalcular à toa). */
export function negociosNovos(): readonly NegocioNovo[] {
  return negocios;
}

/**
 * Cria o negócio, guarda-o e devolve-o. Os registos da pessoa que se escolheram (`dados.ligar`) ligam-se ao negócio, por id: nada se copia
 * e um registo só se liga a um negócio.
 */
export function criarNegocioNovo(dados: DadosCriarNegocio, hoje: string): NegocioNovo {
  sequencia += 1;
  const criado = criarNegocioExemplo(dados, hoje, sequencia);
  negocios = [...negocios, criado];
  if (dados.ligar) ligarRegistosEscolhidos(criado.id, dados.pessoa.id, dados.ligar);
  avisar();
  return criado;
}

/** Esquece tudo e recomeça a numeração (para os testes e para repor o exemplo). */
export function repor(): void {
  negocios = SEM_NEGOCIOS;
  sequencia = 0;
  avisar();
}

/** Os negócios novos, atualizados sempre que se cria um. */
export function useNegociosNovos(): readonly NegocioNovo[] {
  return useSyncExternalStore(subscrever, negociosNovos, negociosNovos);
}
