/**
 * Os valores avulsos do custo LIGADOS A BASE: so os que a base tem, os lancamentos pontuais do processamento salarial
 * (`hr_processamento_lancamentos`), que contam de uma vez no mes do periodo. Nao ha quilometros nem ajudas de custo
 * (a base nao guarda o tipo, a quantidade nem o valor unitario) e nao ha «repartido» nem «todos os meses».
 *
 * Os lancamentos ja estao DENTRO do total bruto estimado do processamento (`totalBrutoEstimado` soma-os), por isso o custo
 * mostra-os a parte: `retribuicaoSemPontuais` tira-os da retribuicao e `lancamentoParaAvulso` poe-nos na coluna dos avulsos.
 * Assim o total do mes nunca os conta duas vezes.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { NovoLancamentoProcessamento } from "@/components/rh-exemplo/hooks/useProcessamentoLancamentos";
import { contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import { arredondar } from "@/components/rh-exemplo/lib/custo";
import type { AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import type { DadosDoCalculoReal } from "@/components/rh-exemplo/processamento/useCalculoReal";
import type { HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";

/** O lancamento real visto como um valor avulso que conta de uma vez no mes do periodo. */
export function lancamentoParaAvulso(l: HrProcessamentoLancamento, mes: string): AvulsoCusto {
  return {
    id: l.id,
    pessoaId: l.pessoa_id,
    tipo: "pontual",
    // O valor conta no mes do PERIODO a que pertence, seja qual for o dia em que foi registado (ver `criadoEm`).
    data: `${mes}-01`,
    conta: contaUmaVez(),
    descricao: l.descricao,
    quantidade: 1,
    valorUnitario: l.valor,
    valor: l.valor,
    // A base guarda o id do utilizador, nao o nome: nao se inventa um autor.
    autor: "",
    criadoEm: l.created_at,
    anulado: l.anulado_em ? { motivo: l.anulado_motivo ?? "", por: "", em: l.anulado_em } : null,
  };
}

/** Os lancamentos de todas as pessoas, ja como avulsos do mes. */
export function avulsosDosLancamentos(porPessoa: ReadonlyMap<string, readonly HrProcessamentoLancamento[]>, mes: string): AvulsoCusto[] {
  return [...porPessoa.values()].flatMap((lista) => lista.map((l) => lancamentoParaAvulso(l, mes)));
}

interface ResultadoComPontuais {
  resultado: { totalBrutoEstimado: number | null; lancamentosPontuais?: number };
}

/** A retribuicao do mes SEM os lancamentos pontuais (que o custo mostra a parte). `null` = sem retribuicao registada. */
export function retribuicaoSemPontuais(calculo: ResultadoComPontuais): number | null {
  const total = calculo.resultado.totalBrutoEstimado;
  if (total === null) return null;
  return arredondar(total - (calculo.resultado.lancamentosPontuais ?? 0));
}

export interface CodigoEscolhivel {
  id: string;
  codigo: string;
  nome: string;
}

/** O que o ecra precisa para registar e anular lancamentos reais do mes. */
export interface AcoesLancamentos {
  /** So num periodo ABERTO a base aceita registar ou anular. */
  periodoAberto: boolean;
  aGravar: boolean;
  codigos: readonly CodigoEscolhivel[];
  /** Devolve o texto do erro (ou `null` se correu bem). */
  criar: (novo: NovoLancamentoProcessamento) => Promise<string | null>;
  anular: (lancamentoId: string, motivo: string) => Promise<string | null>;
}

export function acoesDosLancamentos(dados: DadosDoCalculoReal): AcoesLancamentos {
  return {
    periodoAberto: dados.periodoHook.periodo?.estado === "aberto",
    aGravar: dados.lancamentosHook.saving,
    codigos: dados.codigosActivos.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome })),
    criar: dados.lancamentosHook.criar,
    anular: dados.lancamentosHook.anular,
  };
}

const SEM_AVULSOS: ReadonlyMap<string, readonly AvulsoCusto[]> = new Map();
const ContextoAvulsos = createContext<ReadonlyMap<string, readonly AvulsoCusto[]>>(SEM_AVULSOS);

/** Os avulsos reais do mes por pessoa, para as linhas abertas do modulo «Custos». */
export function AvulsosReaisProvider({ valor, children }: { valor: ReadonlyMap<string, readonly AvulsoCusto[]>; children: ReactNode }) {
  return <ContextoAvulsos.Provider value={valor}>{children}</ContextoAvulsos.Provider>;
}

export const useAvulsosReais = (): ReadonlyMap<string, readonly AvulsoCusto[]> => useContext(ContextoAvulsos);
