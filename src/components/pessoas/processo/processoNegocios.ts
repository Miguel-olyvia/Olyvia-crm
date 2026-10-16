// Os extras dos negócios (o orçamento detalhado e as condições da proposta): vivem só em memória, neste módulo, e perdem-se ao
// recarregar. Mesmo padrão de `negociosAlterados.ts` (useSyncExternalStore, snapshot estável, `repor()` para os testes). O que
// `NegocioMes` guarda (valor, orçamento escolhido, proposta) continua em `negociosAlterados.ts`: uma transição grava as duas coisas,
// por isso o Quadro de Negócios e a página Negócio e metas mostram o MESMO valor e a MESMA fase que a página de Pessoas.
import { useSyncExternalStore } from "react";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { alteracoesAtuais, guardarNegocio, proximaSequenciaOrcamento } from "@/components/negocio-metas/negociosAlterados";
import { SEM_EXTRAS, type ExtrasNegocio, type ExtrasPorNegocio } from "./orcamentoDetalhado";
import type { EstadoTransicao, Transicao } from "./transicoes";

let estado: ExtrasPorNegocio = SEM_EXTRAS;
const ouvintes = new Set<() => void>();

const mudar = (seguinte: ExtrasPorNegocio): void => {
  estado = seguinte;
  ouvintes.forEach((ouvinte) => ouvinte());
};

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

/** O que está guardado agora (o mesmo objeto até haver uma mudança). */
export const extrasAtuais = (): ExtrasPorNegocio => estado;

function guardarExtras(negocioId: string, extras: ExtrasNegocio): void {
  mudar({ ...estado, [negocioId]: extras });
}

/** Esquece tudo (para os testes e para repor o exemplo). */
export function repor(): void {
  mudar(SEM_EXTRAS);
}

/** Os extras, atualizados sempre que uma transição os grava. */
export const useExtrasProcesso = (): ExtrasPorNegocio => useSyncExternalStore(subscrever, extrasAtuais, extrasAtuais);

/**
 * O estado de onde uma transição parte, lido NESTE momento dos dois stores. `doRender` é o negócio que o ecrã tinha no último
 * render: se entretanto se gravou outra versão (um ajuste anterior), vale essa, para dois ajustes seguidos não se pisarem.
 */
export function estadoDeAgora(doRender: NegocioMes): EstadoTransicao {
  return {
    negocio: alteracoesAtuais().editados[doRender.id] ?? doRender,
    extras: extrasAtuais()[doRender.id],
    sequencia: proximaSequenciaOrcamento(),
  };
}

/**
 * Grava uma transição que deu certo: o negócio (só se mudou, com o detalhe do orçamento novo) e depois os extras. Nesta ordem: se a
 * gravação do negócio falhar, os extras ainda não foram escritos e nada fica a meio (extras de um orçamento que o negócio não tem).
 * `antes` é o estado de onde a transição saiu: dele vem o negócio para comparar.
 */
export function gravarTransicao(antes: EstadoTransicao, resultado: Extract<Transicao, { ok: true }>): void {
  if (resultado.negocio !== antes.negocio) guardarNegocio(resultado.negocio, resultado.novoOrcamento);
  guardarExtras(antes.negocio.id, resultado.extras);
}
