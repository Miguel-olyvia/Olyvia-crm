// Os números das pastilhas das abas: horas extra por decidir e marcações por justificar dentro do prazo.
import { useFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";

export interface ContadoresAssiduidade {
  horasExtra: number;
  justificacoes: number;
}

/**
 * `justificacoesPorFazer` vem de `useJustificacoesDaPessoa` (os desvios da base), lido UMA vez pela aba para a pastilha e
 * para a lista não irem os dois à base. As horas extra continuam a vir da memória: ainda não têm tabela.
 */
export function useContadoresAssiduidade(pessoaId: string, justificacoesPorFazer: number): ContadoresAssiduidade {
  const todas = useFluxosC((e) => e.horasExtra);
  const horasExtra = todas.filter((h) => h.pessoaId === pessoaId && h.estado === "pendente").length;
  return { horasExtra, justificacoes: justificacoesPorFazer };
}
