// Os números das pastilhas das abas: horas extra por decidir e marcações por justificar dentro do prazo.
import { useFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { useJustificacoesDaPessoa } from "@/components/rh-exemplo/fluxosB/alertas/useJustificacoesDaPessoa";

export interface ContadoresAssiduidade {
  horasExtra: number;
  justificacoes: number;
}

export function useContadoresAssiduidade(pessoaId: string): ContadoresAssiduidade {
  const todas = useFluxosC((e) => e.horasExtra);
  const { porFazer } = useJustificacoesDaPessoa(pessoaId);
  const horasExtra = todas.filter((h) => h.pessoaId === pessoaId && h.estado === "pendente").length;
  return { horasExtra, justificacoes: porFazer };
}
